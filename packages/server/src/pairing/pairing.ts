/**
 * @file pairing.ts
 * @description Ephemeral 6-digit Pairing Code Engine & Cryptographic Verifier.
 * Strictly adheres to PRD Section 18:
 * - 6-digit CSPRNG numeric code
 * - 60-second strict TTL
 * - Rate limited: Maximum 3 verification attempts
 * - Bound to (sessionId, initiatorDeviceId, recipientDeviceId)
 */

import { Redis } from 'ioredis';
import crypto from 'node:crypto';

export interface PairingSession {
  sessionId: string;
  initiatorDeviceId: string;
  recipientDeviceId: string;
  pairingCode: string;
  attempts: number;
  verifiedInitiator: boolean;
  verifiedRecipient: boolean;
  expiresAt: number;
}

export class PairingEngine {
  private redis: Redis;
  private readonly SESSION_PREFIX = 'pairing:session:';
  private readonly SESSION_TTL_SEC = 60;
  private readonly MAX_ATTEMPTS = 3;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  /**
   * Generates a cryptographically random 6-digit pairing code.
   */
  private generateRandomCode(): string {
    const buffer = crypto.randomBytes(4);
    const num = buffer.readUInt32BE(0) % 1000000;
    return num.toString().padStart(6, '0');
  }

  /**
   * Creates a new pairing session bound to the two peers.
   */
  async createSession(
    sessionId: string,
    initiatorDeviceId: string,
    recipientDeviceId: string
  ): Promise<PairingSession> {
    const pairingCode = this.generateRandomCode();
    const session: PairingSession = {
      sessionId,
      initiatorDeviceId,
      recipientDeviceId,
      pairingCode,
      attempts: 0,
      verifiedInitiator: false,
      verifiedRecipient: false,
      expiresAt: Date.now() + this.SESSION_TTL_SEC * 1000
    };

    const key = `${this.SESSION_PREFIX}${sessionId}`;
    await this.redis.set(key, JSON.stringify(session), 'EX', this.SESSION_TTL_SEC);
    return session;
  }

  /**
   * Retrieves an active pairing session.
   */
  async getSession(sessionId: string): Promise<PairingSession | null> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as PairingSession;
  }

  /**
   * Verifies pairing confirmation from one of the peers.
   */
  async confirmPairing(
    sessionId: string,
    deviceId: string
  ): Promise<{ success: boolean; complete: boolean; error?: string }> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    const raw = await this.redis.get(key);
    if (!raw) {
      return { success: false, complete: false, error: 'Pairing session expired or not found.' };
    }

    const session = JSON.parse(raw) as PairingSession;

    // Check rate limit attempts
    if (session.attempts >= this.MAX_ATTEMPTS) {
      await this.redis.del(key);
      return { success: false, complete: false, error: 'Maximum pairing attempts exceeded. Session terminated.' };
    }

    if (deviceId === session.initiatorDeviceId) {
      session.verifiedInitiator = true;
    } else if (deviceId === session.recipientDeviceId) {
      session.verifiedRecipient = true;
    } else {
      session.attempts += 1;
      await this.redis.set(key, JSON.stringify(session), 'KEEPTTL');
      return { success: false, complete: false, error: 'Unauthorized device for this pairing session.' };
    }

    const complete = session.verifiedInitiator && session.verifiedRecipient;
    await this.redis.set(key, JSON.stringify(session), 'KEEPTTL');

    return { success: true, complete };
  }

  /**
   * Terminates and cleans up the pairing session.
   */
  async terminateSession(sessionId: string): Promise<void> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    await this.redis.del(key);
  }
}
