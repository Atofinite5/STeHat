import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Opcode,
  PROTOCOL_MAGIC_BYTE,
  PROTOCOL_VERSION_1,
  createPacket,
  encodePacket,
  decodePacket,
  ProtocolError,
  canonicalizePairingChallenge,
  bytesToBase64,
  base64ToBytes
} from '../index.js';

test('Protocol Codec - Roundtrip encode and decode TEXT packet', () => {
  const payload = { content: 'Hello via WebRTC DataChannel!' };
  const packet = createPacket(
    Opcode.TEXT,
    'session-1234-uuid',
    'msg-5678-uuid',
    payload
  );

  const encoded = encodePacket(packet);
  assert.ok(encoded.length > 0, 'Encoded buffer should not be empty');

  const decoded = decodePacket<typeof payload>(encoded);
  assert.equal(decoded.header.magicByte, PROTOCOL_MAGIC_BYTE);
  assert.equal(decoded.header.version, PROTOCOL_VERSION_1);
  assert.equal(decoded.header.opcode, Opcode.TEXT);
  assert.equal(decoded.header.sessionId, 'session-1234-uuid');
  assert.equal(decoded.header.messageId, 'msg-5678-uuid');
  assert.deepEqual(decoded.payload, payload);
});

test('Protocol Codec - Rejects corrupt frame with invalid magic byte', () => {
  const packet = createPacket(
    Opcode.PING,
    'session-uuid',
    'msg-uuid',
    {}
  );
  packet.header.magicByte = 0x99; // Corrupt magic byte

  assert.throws(
    () => encodePacket(packet),
    ProtocolError,
    'Should throw ProtocolError on invalid magic byte'
  );
});

test('Protocol Crypto - Canonical pairing challenge determinism', () => {
  const challenge1 = canonicalizePairingChallenge('session-42', '849201');
  const challenge2 = canonicalizePairingChallenge('session-42', '849201');
  assert.deepEqual(challenge1, challenge2);

  const base64 = bytesToBase64(challenge1);
  const backToBytes = base64ToBytes(base64);
  assert.deepEqual(backToBytes, challenge1);
});
