/**
 * @file opcodes.ts
 * @description WhisperMesh Wire Protocol Opcodes & Frame Identifiers.
 * Strictly defined according to PRD Section 22.
 */

export const PROTOCOL_MAGIC_BYTE = 0x57; // ASCII 'W'
export const PROTOCOL_VERSION_1 = 0x01;

export const enum Opcode {
  // Session & Connection Management (0x01 - 0x0F)
  PING = 0x01,
  PONG = 0x02,
  DISCONNECT = 0x03,

  // Text & Content Messaging (0x10 - 0x1F)
  TEXT = 0x10,
  ACK = 0x11,
  DELIVERED = 0x12,
  READ = 0x13,

  // Presence & Activity (0x20 - 0x2F)
  TYPING = 0x20,

  // Signaling & Negotiation (0x30 - 0x3F)
  CONNECTION_REQUEST = 0x30,
  CONNECTION_ACCEPT = 0x31,
  CONNECTION_REJECT = 0x32,
  OFFER = 0x33,
  ANSWER = 0x34,
  ICE_CANDIDATE = 0x35,

  // Agentic & Mesh AI Payloads (0x40 - 0x4F)
  AGENT_QUERY = 0x40,
  AGENT_RESPONSE = 0x41,
  AGENT_ACTION = 0x42
}

export const enum PresenceStatus {
  AVAILABLE = 'AVAILABLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  OFFLINE = 'OFFLINE'
}

export const enum PlatformType {
  MACOS = 'macOS',
  WINDOWS = 'Windows',
  IOS = 'iOS',
  ANDROID = 'Android',
  LINUX = 'Linux'
}

export const enum DeliveryState {
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED'
}
