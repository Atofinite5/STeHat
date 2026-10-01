/**
 * @file types.ts
 * @description Standard message interfaces, payloads, and envelopes for WhisperMesh.
 */

import { Opcode, PlatformType, PresenceStatus } from './opcodes.js';

export interface DeviceIdentity {
  deviceId: string;
  displayName: string;
  platform: PlatformType;
  publicKeyEd25519: string; // Base64 encoded
  publicKeyX25519: string;  // Base64 encoded
}

export interface PresenceRecord {
  deviceId: string;
  displayName: string;
  platform: PlatformType;
  publicKey: string;
  status: PresenceStatus;
  lastSeenTimestamp: number;
}

export interface WireHeader {
  magicByte: number; // Must be 0x57
  version: number;   // 0x01
  opcode: Opcode;
  flags: number;     // 1 byte bitmask
  sessionId: string; // UUIDv4 string (16 bytes wire)
  messageId: string; // UUIDv4 string (16 bytes wire)
  timestamp: number; // Unix epoch ms (8 bytes uint64)
}

export interface WirePacket<T = unknown> {
  header: WireHeader;
  payload: T;
  signature?: Uint8Array; // Ed25519 signature (64 bytes)
}

// Payload Definitions
export interface TextPayload {
  content: string;
}

export interface AckPayload {
  targetMessageId: string;
  receivedTimestamp: number;
}

export interface DeliveredPayload {
  targetMessageId: string;
  deliveredTimestamp: number;
}

export interface ReadPayload {
  targetMessageId: string;
  readTimestamp: number;
}

export interface TypingPayload {
  isTyping: boolean;
}

export interface ConnectionRequestPayload {
  initiatorDevice: DeviceIdentity;
  targetDeviceId: string;
  sessionNonce: string;
}

export interface ConnectionAcceptPayload {
  sessionId: string;
  recipientDevice: DeviceIdentity;
}

export interface ConnectionRejectPayload {
  sessionId: string;
  reason: 'BUSY' | 'USER_REJECTED' | 'TIMEOUT';
}

export interface PairingChallengePayload {
  sessionId: string;
  pairingCode: string; // 6-digit string
  expiresAt: number;   // Epoch timestamp ms
}

export interface PairingVerifyPayload {
  sessionId: string;
  deviceId: string;
  signature: string; // Base64 signature of (sessionId + pairingCode)
}

export interface SignalOfferPayload {
  sessionId: string;
  sdp: string;
}

export interface SignalAnswerPayload {
  sessionId: string;
  sdp: string;
}

export interface IceCandidatePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface SignalIceCandidatePayload {
  sessionId: string;
  candidate: IceCandidatePayload;
}

export interface DisconnectPayload {
  sessionId: string;
  reason?: string;
}

// Server WebSocket Message Envelope
export interface ServerMessageEnvelope<T = unknown> {
  type: string;
  messageId: string;
  timestamp: number;
  payload: T;
}
