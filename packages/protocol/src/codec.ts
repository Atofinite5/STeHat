/**
 * @file codec.ts
 * @description High-performance binary MessagePack encoding and decoding for WebRTC DataChannels.
 * Validates header integrity, magic bytes, versions, and bounds checking.
 */

import { encode, decode } from '@msgpack/msgpack';
import { PROTOCOL_MAGIC_BYTE, PROTOCOL_VERSION_1, Opcode } from './opcodes.js';
import { WirePacket, WireHeader } from './types.js';

export class ProtocolError extends Error {
  constructor(message: string) {
    super(`[ProtocolError] ${message}`);
    this.name = 'ProtocolError';
  }
}

/**
 * Encodes a structured WirePacket into binary MessagePack format.
 */
export function encodePacket<T>(packet: WirePacket<T>): Uint8Array {
  // Enforce protocol invariants
  if (packet.header.magicByte !== PROTOCOL_MAGIC_BYTE) {
    throw new ProtocolError(`Invalid magic byte 0x${packet.header.magicByte.toString(16)}. Expected 0x57.`);
  }

  if (packet.header.version !== PROTOCOL_VERSION_1) {
    throw new ProtocolError(`Unsupported protocol version ${packet.header.version}. Expected ${PROTOCOL_VERSION_1}.`);
  }

  const rawTuple = [
    packet.header.magicByte,
    packet.header.version,
    packet.header.opcode,
    packet.header.flags,
    packet.header.sessionId,
    packet.header.messageId,
    packet.header.timestamp,
    packet.payload,
    packet.signature ? Array.from(packet.signature) : null
  ];

  return encode(rawTuple);
}

/**
 * Decodes a binary buffer into a validated WirePacket structure.
 */
export function decodePacket<T>(buffer: Uint8Array): WirePacket<T> {
  let decoded: unknown;
  try {
    decoded = decode(buffer);
  } catch (err) {
    throw new ProtocolError(`Failed to decode binary MessagePack frame: ${(err as Error).message}`);
  }

  if (!Array.isArray(decoded) || decoded.length < 8) {
    throw new ProtocolError('Corrupt frame: Decoded wire packet does not conform to tuple format.');
  }

  const [
    magicByte,
    version,
    opcode,
    flags,
    sessionId,
    messageId,
    timestamp,
    payload,
    signatureArray
  ] = decoded;

  if (magicByte !== PROTOCOL_MAGIC_BYTE) {
    throw new ProtocolError(`Invalid magic byte 0x${Number(magicByte).toString(16)}. Frame rejected.`);
  }

  if (version !== PROTOCOL_VERSION_1) {
    throw new ProtocolError(`Unsupported protocol version ${Number(version)}. Frame rejected.`);
  }

  const header: WireHeader = {
    magicByte: Number(magicByte),
    version: Number(version),
    opcode: Number(opcode) as Opcode,
    flags: Number(flags),
    sessionId: String(sessionId),
    messageId: String(messageId),
    timestamp: Number(timestamp)
  };

  const signature = signatureArray ? new Uint8Array(signatureArray as number[]) : undefined;

  return {
    header,
    payload: payload as T,
    signature
  };
}

/**
 * Factory helper to construct a valid WirePacket.
 */
export function createPacket<T>(
  opcode: Opcode,
  sessionId: string,
  messageId: string,
  payload: T,
  signature?: Uint8Array
): WirePacket<T> {
  return {
    header: {
      magicByte: PROTOCOL_MAGIC_BYTE,
      version: PROTOCOL_VERSION_1,
      opcode,
      flags: 0,
      sessionId,
      messageId,
      timestamp: Date.now()
    },
    payload,
    signature
  };
}
