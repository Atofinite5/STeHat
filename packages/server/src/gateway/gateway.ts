/**
 * @file gateway.ts
 * @description Central WebSocket Gateway managing connections, routing presence and WebRTC signaling.
 */

import { WebSocket } from 'ws';
import {
  PresenceRecord,
  ServerMessageEnvelope,
  ConnectionRequestPayload,
  ConnectionAcceptPayload,
  ConnectionRejectPayload,
  SignalOfferPayload,
  SignalAnswerPayload,
  SignalIceCandidatePayload,
  DisconnectPayload
} from '@whispermesh/protocol';
import { PresenceManager } from '../presence/presence.js';
import { PairingEngine } from '../pairing/pairing.js';

export class WebSocketGateway {
  private activeClients: Map<string, { socket: WebSocket; deviceId: string }> = new Map();
  private presenceManager: PresenceManager;
  private pairingEngine: PairingEngine;

  constructor(presenceManager: PresenceManager, pairingEngine: PairingEngine) {
    this.presenceManager = presenceManager;
    this.pairingEngine = pairingEngine;
  }

  /**
   * Handles new inbound WebSocket connection.
   */
  handleConnection(socket: WebSocket): void {
    let boundDeviceId: string | null = null;

    socket.on('message', async (data: Buffer | string) => {
      try {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const envelope = JSON.parse(text) as ServerMessageEnvelope;
        boundDeviceId = await this.routeMessage(socket, envelope, boundDeviceId);
      } catch (err) {
        this.sendEnvelope(socket, 'ERROR', { message: (err as Error).message });
      }
    });

    socket.on('close', async () => {
      if (boundDeviceId) {
        this.activeClients.delete(boundDeviceId);
        await this.presenceManager.removePresence(boundDeviceId);
        this.broadcastPresenceOffline(boundDeviceId);
      }
    });

    socket.on('error', (err: Error) => {
      console.error(`[WebSocketGateway] Socket error on device ${boundDeviceId}:`, err.message);
    });
  }

  /**
   * Routes inbound message envelopes.
   */
  private async routeMessage(
    socket: WebSocket,
    envelope: ServerMessageEnvelope,
    currentDeviceId: string | null
  ): Promise<string | null> {
    const { type, payload } = envelope;

    switch (type) {
      case 'PRESENCE_REGISTER': {
        const record = payload as PresenceRecord;
        this.activeClients.set(record.deviceId, { socket, deviceId: record.deviceId });
        await this.presenceManager.registerPresence(record);
        
        // Return available peers snapshot
        const peers = await this.presenceManager.getAvailablePeers(record.deviceId);
        this.sendEnvelope(socket, 'PRESENCE_SNAPSHOT', { peers });

        // Broadcast new user to all others
        this.broadcastPresenceUpdate(record, record.deviceId);
        return record.deviceId;
      }

      case 'PRESENCE_HEARTBEAT': {
        if (!currentDeviceId) return null;
        await this.presenceManager.heartbeat(currentDeviceId);
        this.sendEnvelope(socket, 'HEARTBEAT_ACK', { timestamp: Date.now() });
        return currentDeviceId;
      }

      case 'CONNECTION_REQUEST': {
        const req = payload as ConnectionRequestPayload;
        const target = this.activeClients.get(req.targetDeviceId);

        if (!target || target.socket.readyState !== WebSocket.OPEN) {
          this.sendEnvelope(socket, 'CONNECTION_ERROR', { reason: 'PEER_OFFLINE' });
          return currentDeviceId;
        }

        // Forward request to recipient
        this.sendEnvelope(target.socket, 'INCOMING_REQUEST', req);
        return currentDeviceId;
      }

      case 'CONNECTION_ACCEPT': {
        const accept = payload as ConnectionAcceptPayload;
        // Generate pairing code
        const session = await this.pairingEngine.createSession(
          accept.sessionId,
          accept.recipientDevice.deviceId, // Recipient confirmed
          currentDeviceId!
        );

        // Send challenge to both peers
        const challenge = {
          sessionId: session.sessionId,
          pairingCode: session.pairingCode,
          expiresAt: session.expiresAt
        };

        this.sendEnvelope(socket, 'PAIRING_CHALLENGE', challenge);
        const initiator = this.activeClients.get(session.recipientDeviceId);
        if (initiator) {
          this.sendEnvelope(initiator.socket, 'PAIRING_CHALLENGE', challenge);
        }
        return currentDeviceId;
      }

      case 'CONNECTION_REJECT': {
        const reject = payload as ConnectionRejectPayload;
        const target = this.activeClients.get(reject.sessionId);
        if (target) {
          this.sendEnvelope(target.socket, 'CONNECTION_REJECTED', reject);
        }
        return currentDeviceId;
      }

      case 'PAIRING_CONFIRM': {
        const { sessionId } = payload as { sessionId: string };
        const result = await this.pairingEngine.confirmPairing(sessionId, currentDeviceId!);

        if (!result.success) {
          this.sendEnvelope(socket, 'PAIRING_FAILED', { error: result.error });
          return currentDeviceId;
        }

        if (result.complete) {
          const session = await this.pairingEngine.getSession(sessionId);
          if (session) {
            const initClient = this.activeClients.get(session.initiatorDeviceId);
            const recipClient = this.activeClients.get(session.recipientDeviceId);

            const authPayload = {
              sessionId,
              authorized: true,
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            };

            if (initClient) this.sendEnvelope(initClient.socket, 'SIGNALING_AUTHORIZED', authPayload);
            if (recipClient) this.sendEnvelope(recipClient.socket, 'SIGNALING_AUTHORIZED', authPayload);
          }
        }
        return currentDeviceId;
      }

      case 'SIGNAL_OFFER': {
        const offer = payload as SignalOfferPayload;
        this.forwardToPeer(offer.sessionId, 'SIGNAL_OFFER', offer, currentDeviceId!);
        return currentDeviceId;
      }

      case 'SIGNAL_ANSWER': {
        const answer = payload as SignalAnswerPayload;
        this.forwardToPeer(answer.sessionId, 'SIGNAL_ANSWER', answer, currentDeviceId!);
        return currentDeviceId;
      }

      case 'SIGNAL_ICE': {
        const ice = payload as SignalIceCandidatePayload;
        this.forwardToPeer(ice.sessionId, 'SIGNAL_ICE', ice, currentDeviceId!);
        return currentDeviceId;
      }

      case 'DISCONNECT': {
        const disc = payload as DisconnectPayload;
        this.forwardToPeer(disc.sessionId, 'PEER_DISCONNECTED', disc, currentDeviceId!);
        await this.pairingEngine.terminateSession(disc.sessionId);
        return currentDeviceId;
      }

      default:
        return currentDeviceId;
    }
  }

  /**
   * Forwards a signaling payload to the other peer in the pairing session.
   */
  private async forwardToPeer(sessionId: string, type: string, payload: unknown, senderId: string): Promise<void> {
    const session = await this.pairingEngine.getSession(sessionId);
    if (!session) return;

    const targetDeviceId = session.initiatorDeviceId === senderId
      ? session.recipientDeviceId
      : session.initiatorDeviceId;

    const target = this.activeClients.get(targetDeviceId);
    if (target && target.socket.readyState === WebSocket.OPEN) {
      this.sendEnvelope(target.socket, type, payload);
    }
  }

  /**
   * Broadcasts a presence update to all connected clients.
   */
  private broadcastPresenceUpdate(record: PresenceRecord, excludeDeviceId?: string): void {
    for (const [deviceId, client] of this.activeClients.entries()) {
      if (deviceId === excludeDeviceId) continue;
      if (client.socket.readyState === WebSocket.OPEN) {
        this.sendEnvelope(client.socket, 'PRESENCE_UPDATE', record);
      }
    }
  }

  /**
   * Broadcasts a device offline event to all active clients.
   */
  private broadcastPresenceOffline(deviceId: string): void {
    for (const client of this.activeClients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        this.sendEnvelope(client.socket, 'PRESENCE_OFFLINE', { deviceId });
      }
    }
  }

  /**
   * Helper to serialize and dispatch a standard message envelope.
   */
  private sendEnvelope(socket: WebSocket, type: string, payload: unknown): void {
    const envelope: ServerMessageEnvelope = {
      type,
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      payload
    };
    socket.send(JSON.stringify(envelope));
  }
}
