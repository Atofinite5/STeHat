/**
 * @file gatewayClient.ts
 * @description Real-time WebSocket Gateway & Space Broker Client for WhisperMesh.
 * Enables both dynamic LAN presence and Global Space Address pairing across different networks.
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
export type SpaceJoinedListener = (info: { spaceAddress: string; memberCount: number }) => void;

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
  public onSpaceJoined: SpaceJoinedListener | null = null;
  public onPeerJoinedSpace: ((peer: any) => void) | null = null;

  constructor(url: string, deviceId: string, displayName: string) {
    this.url = url;
    this.deviceId = deviceId;
    this.displayName = displayName;
  }

  public connect(): void {
    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
    }

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log('[GatewayClient] Connected to Space Broker at', this.url);
        this.onConnectionStateChange?.(true);
        this.registerPresence();
        this.startHeartbeat();
      };

      this.socket.onclose = () => {
        console.log('[GatewayClient] Disconnected from Space Broker. Auto-reconnecting in 3s...');
        this.onConnectionStateChange?.(false);
        this.stopHeartbeat();
        setTimeout(() => this.connect(), 3000);
      };

      this.socket.onerror = (err) => {
        console.warn('[GatewayClient] Broker warning:', err);
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

  public joinSpace(spaceAddress: string, otp: string): void {
    this.send('JOIN_SPACE', {
      spaceAddress,
      otp,
      device: {
        deviceId: this.deviceId,
        displayName: this.displayName
      }
    });
  }

  public sendSpaceSignal(spaceAddress: string, signalType: string, signalPayload: any): void {
    this.send('SPACE_SIGNAL', {
      spaceAddress,
      signalType,
      signalPayload,
      senderDeviceId: this.deviceId
    });
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
      targetDeviceId: initiatorDeviceId
    });
  }

  public confirmPairingCode(sessionId: string): void {
    this.send('PAIRING_CONFIRM', {
      sessionId
    });
  }

  public sendSignal(type: string, payload: any): void {
    this.send(type, payload);
  }

  private send(type: string, payload: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }

  private handleInboundEnvelope(envelope: { type: string; payload: any }): void {
    switch (envelope.type) {
      case 'PRESENCE_SNAPSHOT':
        if (envelope.payload?.peers) {
          const filtered = (envelope.payload.peers as PresencePeer[]).filter(
            (p) => p.deviceId !== this.deviceId
          );
          this.onPeersUpdated?.(filtered);
        }
        break;

      case 'INCOMING_REQUEST':
        this.onIncomingRequest?.(envelope.payload);
        break;

      case 'PAIRING_CHALLENGE':
        this.onPairingChallenge?.(envelope.payload);
        break;

      case 'SIGNALING_AUTHORIZED':
        this.onSignalingAuthorized?.(envelope.payload);
        break;

      case 'SPACE_JOINED':
        this.onSpaceJoined?.(envelope.payload);
        break;

      case 'PEER_JOINED_SPACE':
        this.onPeerJoinedSpace?.(envelope.payload);
        break;

      case 'SPACE_SIGNAL':
        if (envelope.payload?.signalType && envelope.payload?.signalPayload) {
          this.onSignalReceived?.(envelope.payload.signalType, envelope.payload.signalPayload);
        }
        break;

      case 'SIGNAL_OFFER':
      case 'SIGNAL_ANSWER':
      case 'SIGNAL_ICE':
        this.onSignalReceived?.(envelope.type, envelope.payload);
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
