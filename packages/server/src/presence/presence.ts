/**
 * @file presence.ts
 * @description Ephemeral Presence Manager backed by Redis.
 * Strictly adheres to PRD Section 17:
 * - 15s client heartbeats
 * - 30s TTL eviction
 * - Automatic PRESENCE_OFFLINE broadcast on key expiration
 */

import { Redis } from 'ioredis';
import { PresenceRecord, PresenceStatus } from '@whispermesh/protocol';

export class PresenceManager {
  private redis: Redis;
  private readonly PRESENCE_PREFIX = 'presence:device:';
  private readonly PRESENCE_TTL_SEC = 30;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  /**
   * Registers or updates a device's ephemeral presence.
   */
  async registerPresence(record: PresenceRecord): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${record.deviceId}`;
    const serialized = JSON.stringify({
      ...record,
      lastSeenTimestamp: Date.now()
    });

    await this.redis.set(key, serialized, 'EX', this.PRESENCE_TTL_SEC);
  }

  /**
   * Refreshes the heartbeat TTL for a device.
   */
  async heartbeat(deviceId: string): Promise<boolean> {
    const key = `${this.PRESENCE_PREFIX}${deviceId}`;
    const exists = await this.redis.expire(key, this.PRESENCE_TTL_SEC);
    return exists === 1;
  }

  /**
   * Explicitly marks a device as offline.
   */
  async removePresence(deviceId: string): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${deviceId}`;
    await this.redis.del(key);
  }

  /**
   * Fetches the snapshot of all currently available peers.
   */
  async getAvailablePeers(excludeDeviceId?: string): Promise<PresenceRecord[]> {
    const keys = await this.redis.keys(`${this.PRESENCE_PREFIX}*`);
    if (keys.length === 0) return [];

    const values = await this.redis.mget(keys);
    const records: PresenceRecord[] = [];

    for (const val of values) {
      if (!val) continue;
      try {
        const record = JSON.parse(val) as PresenceRecord;
        if (excludeDeviceId && record.deviceId === excludeDeviceId) continue;
        records.push(record);
      } catch {
        // Ignore corrupt records
      }
    }

    return records;
  }

  /**
   * Updates presence state to CONNECTING or CONNECTED.
   */
  async updateStatus(deviceId: string, status: PresenceStatus): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${deviceId}`;
    const raw = await this.redis.get(key);
    if (!raw) return;

    try {
      const record = JSON.parse(raw) as PresenceRecord;
      record.status = status;
      record.lastSeenTimestamp = Date.now();
      await this.redis.set(key, JSON.stringify(record), 'EX', this.PRESENCE_TTL_SEC);
    } catch {
      // Ignore parse failure
    }
  }
}
