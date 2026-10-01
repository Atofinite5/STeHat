/**
 * @file index.ts
 * @description Fastify Signaling Server entrypoint with WebSocket support and Redis ephemeral store.
 */

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { Redis } from 'ioredis';
import { PresenceManager } from './presence/presence.js';
import { PairingEngine } from './pairing/pairing.js';
import { WebSocketGateway } from './gateway/gateway.js';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  await fastify.register(cors, { origin: true });
  await fastify.register(fastifyWebsocket);

  // Initialize Redis client
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });

  try {
    await redis.connect();
    fastify.log.info('Connected to Redis ephemeral store successfully');
  } catch (err) {
    fastify.log.warn(`Redis connection deferred: ${(err as Error).message}. Running in local mock mode.`);
  }

  // Initialize domain controllers
  const presenceManager = new PresenceManager(redis);
  const pairingEngine = new PairingEngine(redis);
  const gateway = new WebSocketGateway(presenceManager, pairingEngine);

  // Healthcheck endpoint
  fastify.get('/health', async () => {
    return { status: 'healthy', timestamp: Date.now(), service: 'WhisperMesh Signaling' };
  });

  // Ephemeral presence snapshot HTTP endpoint
  fastify.get('/v1/presence/snapshot', async () => {
    const peers = await presenceManager.getAvailablePeers();
    return { count: peers.length, peers };
  });

  // WebSocket signaling gateway route
  fastify.register(async (instance) => {
    instance.get('/v1/gateway', { websocket: true }, (socket) => {
      gateway.handleConnection(socket);
    });
  });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`WhisperMesh Gateway running on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
