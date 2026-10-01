/**
 * @file gatewayClient.ts
 * @description Real-time WebSocket Gateway Client for WhisperMesh desktop app.
 * Connects to the local/remote Fastify signaling server for dynamic peer presence & pairing negotiation.
 */

export interface PresencePeer {
  deviceId: string;
  displayName: string;
  platform: string;
  status: 'AVAILABLE' | 'CONNECTING' | 'CONNECTED' | 'OFFLINE';
  lastSeenTimestamp: number;
}

export type PresenceListener = (peers: PresencePeer[]) => void;
export type PairingChallengeListener = (challenge: { sessionId: string; pairingCode: string; expiresAt: number }) => void;
export type PairingAuthListener = (auth: { sessionId: string; authorized: boolean; iceServers: RTCIceServer[] }) => void;
export type SignalListener = (type: string, payload: any) => void;

export class GatewayClient {
  private socket: WebSocket | null = null;
  private url: string;
  private deviceId: string;
  private displayName: string;
  private heartbeatInterval: number | null = null;

  public onPeersUpdated: PresenceListener | null = null;
  public onPairingChallenge: PairingChallengeListener | null = null;
  public onSignalingAuthorized: PairingAuthListener | null = null;
  public onSignalReceived: SignalListener | null = null;
  public onIncomingRequest: ((req: { sessionId: string; initiatorDevice: any }) => void) | null = null;
  public onConnectionStateChange: ((connected: boolean) => void) | null = null;

  constructor(url: string, deviceId: string, displayName: string) {
    this.url = url;
    this.deviceId = deviceId;
    this.displayName = displayName;
  }

  public connect(): void {
    if (this.socket) {
      this.socket.close();
    }

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log('[GatewayClient] Connected to Signaling Gateway at', this.url);
        this.onConnectionStateChange?.(true);
        this.registerPresence();
        this.startHeartbeat();
      };

      this.socket.onclose = () => {
        console.log('[GatewayClient] Disconnected from Signaling Gateway');
        this.onConnectionStateChange?.(false);
        this.stopHeartbeat();
        // Reconnect after 3 seconds
        setTimeout(() => this.connect(), 3000);
      };

      this.socket.onerror = (err) => {
        console.warn('[GatewayClient] Gateway socket warning:', err);
      };

      this.socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          this.handleInboundEnvelope(envelope);
        } catch (e) {
          console.error('[GatewayClient] Failed to parse message:', e);
        }
      };
    } catch (err) {
      console.warn('[GatewayClient] Connection error:', err);
    }
  }

  private registerPresence(): void {
    this.send('PRESENCE_REGISTER', {
      deviceId: this.deviceId,
      displayName: this.displayName,
      platform: 'macOS',
      status: 'AVAILABLE',
      publicKeyEd25519: '',
      publicKeyX25519: '',
      lastSeenTimestamp: Date.now()
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      this.send('PRESENCE_HEARTBEAT', { timestamp: Date.now() });
    }, 12000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public updateDisplayName(name: string): void {
    this.displayName = name;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.registerPresence();
    }
  }

  public requestPairing(targetDeviceId: string): string {
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.send('CONNECTION_REQUEST', {
      sessionId,
      targetDeviceId,
      initiatorDevice: {
        deviceId: this.deviceId,
        displayName: this.displayName,
        platform: 'macOS'
      }
    });
    return sessionId;
  }

  public acceptPairing(sessionId: string, initiatorDeviceId: string): void {
    this.send('CONNECTION_ACCEPT', {
      sessionId,
      recipientDevice: {
        deviceId: this.deviceId,
        displayName: this.displayName,
        platform: 'macOS'
      }
    });
  }

  public confirmPairingCode(sessionId: string): void {
    this.send('PAIRING_CONFIRM', { sessionId });
  }

  public sendSignal(type: string, payload: any): void {
    this.send(type, payload);
  }

  public send(type: string, payload: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type,
        messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        payload
      }));
    }
  }

  private handleInboundEnvelope(envelope: { type: string; payload: any }): void {
    const { type, payload } = envelope;

    switch (type) {
      case 'PRESENCE_SNAPSHOT':
        if (payload.peers && this.onPeersUpdated) {
          this.onPeersUpdated(payload.peers.filter((p: PresencePeer) => p.deviceId !== this.deviceId));
        }
        break;

      case 'PRESENCE_UPDATE':
        // Requests a fresh snapshot
        this.send('PRESENCE_REGISTER', {
          deviceId: this.deviceId,
          displayName: this.displayName,
          platform: 'macOS',
          status: 'AVAILABLE'
        });
        break;

      case 'INCOMING_REQUEST':
        this.onIncomingRequest?.(payload);
        break;

      case 'PAIRING_CHALLENGE':
        this.onPairingChallenge?.(payload);
        break;

      case 'SIGNALING_AUTHORIZED':
        this.onSignalingAuthorized?.(payload);
        break;

      case 'SIGNAL_OFFER':
      case 'SIGNAL_ANSWER':
      case 'SIGNAL_ICE':
        this.onSignalReceived?.(type, payload);
        break;

      default:
        break;
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
