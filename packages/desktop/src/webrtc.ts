/**
 * @file webrtc.ts
 * @description Native WebRTC PeerConnection & DataChannel Manager for live laptop-to-laptop P2P chat.
 * Strictly adheres to PRD Section 19 & Section 23:
 * - Direct WebRTC DataChannels
 * - Zero server message persistence
 * - Fallback ICE servers (STUN + coturn)
 */

export interface P2PMessage {
  id: string;
  senderDeviceId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export type MessageCallback = (msg: P2PMessage) => void;
export type StateChangeCallback = (state: 'connecting' | 'connected' | 'disconnected' | 'failed') => void;

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onMessageCb: MessageCallback | null = null;
  private onStateCb: StateChangeCallback | null = null;
  private sendSignalCb: ((type: string, payload: unknown) => void) | null = null;

  constructor(
    sendSignal: (type: string, payload: unknown) => void,
    onMessage: MessageCallback,
    onState: StateChangeCallback
  ) {
    this.sendSignalCb = sendSignal;
    this.onMessageCb = onMessage;
    this.onStateCb = onState;
  }

  /**
   * Initializes RTCPeerConnection with STUN/TURN servers.
   */
  public initConnection(iceServers: RTCIceServer[]): void {
    if (this.peerConnection) {
      this.close();
    }

    const config: RTCConfiguration = {
      iceServers: iceServers.length > 0 ? iceServers : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(config);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.sendSignalCb) {
        this.sendSignalCb('SIGNAL_ICE', { candidate: event.candidate });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === 'connected') {
        this.onStateCb?.('connected');
      } else if (state === 'disconnected' || state === 'closed') {
        this.onStateCb?.('disconnected');
      } else if (state === 'failed') {
        this.onStateCb?.('failed');
      }
    };

    // When remote peer creates the data channel
    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  /**
   * Creates an SDP Offer as the initiator.
   */
  public async createOffer(sessionId: string): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');

    // Create reliable ordered data channel
    const dc = this.peerConnection.createDataChannel('whispermesh-chat', {
      ordered: true
    });
    this.setupDataChannel(dc);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    return offer;
  }

  /**
   * Handles incoming SDP Offer and generates an Answer as the recipient.
   */
  public async handleOfferAndCreateAnswer(
    offerSdp: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    return answer;
  }

  /**
   * Handles incoming SDP Answer from the initiator side.
   */
  public async handleAnswer(answerSdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
  }

  /**
   * Adds remote ICE Candidate.
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTCManager] Failed to add ICE candidate:', err);
    }
  }

  /**
   * Sends a message directly through the peer-to-peer DataChannel.
   * Zero server interaction.
   */
  public sendMessage(msg: P2PMessage): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }
    this.dataChannel.send(JSON.stringify(msg));
    return true;
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.dataChannel = dc;

    dc.onopen = () => {
      console.log('[WebRTCManager] Direct P2P DataChannel OPEN!');
      this.onStateCb?.('connected');
    };

    dc.onclose = () => {
      console.log('[WebRTCManager] P2P DataChannel CLOSED');
      this.onStateCb?.('disconnected');
    };

    dc.onerror = (err) => {
      console.error('[WebRTCManager] DataChannel error:', err);
    };

    dc.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as P2PMessage;
        this.onMessageCb?.(parsed);
      } catch (err) {
        console.warn('[WebRTCManager] Malformed P2P message frame:', err);
      }
    };
  }

  public isChannelOpen(): boolean {
    return this.dataChannel?.readyState === 'open';
  }

  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.onStateCb?.('disconnected');
  }
}
