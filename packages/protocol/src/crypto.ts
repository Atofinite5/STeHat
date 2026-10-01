/**
 * @file crypto.ts
 * @description Standard cryptographic utilities for WhisperMesh protocol payloads.
 * Implements deterministic challenge serialization and signature helpers using Web Crypto API.
 */

/**
 * Serializes a pairing challenge into a canonical byte format for signing.
 * Format: "WHISPERMESH_PAIRING_v1:<sessionId>:<pairingCode>"
 */
export function canonicalizePairingChallenge(sessionId: string, pairingCode: string): Uint8Array {
  const message = `WHISPERMESH_PAIRING_v1:${sessionId}:${pairingCode}`;
  return new TextEncoder().encode(message);
}

/**
 * Converts a byte array to base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
