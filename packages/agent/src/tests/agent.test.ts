import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityFilter, LocalGraphIndex, createWhisperMeshAgent } from '../index.js';

test('SecurityFilter - Sanitizes exposed private key pattern', () => {
  const dummyKey = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwMTI=';
  const prompt = `Please sign this message using ${dummyKey} now.`;

  const result = SecurityFilter.evaluate(prompt, dummyKey);
  assert.equal(result.passed, false);
  assert.ok(result.violations.length > 0);
  assert.ok(!result.sanitizedText.includes(dummyKey));
});

test('LocalGraphIndex - Upserts and establishes semantic relationships', () => {
  const index = new LocalGraphIndex();
  index.upsertNode({ id: 'peer-1', type: 'peer', label: 'Bhargav (MacBook)', properties: {} });
  index.upsertNode({ id: 'topic-1', type: 'topic', label: 'P2P Cryptography', properties: {} });
  index.addEdge('peer-1', 'topic-1', 'DISCUSSED');

  const context = index.getRelatedContext('peer-1');
  assert.equal(context.related.length, 1);
  assert.equal(context.related[0]?.label, 'P2P Cryptography');
});

test('LangGraph Workflow - Compiles and runs cyclic agent execution', async () => {
  const index = new LocalGraphIndex();
  index.upsertNode({ id: 'node-test', type: 'topic', label: 'WhisperMesh Mesh AI', properties: {} });

  const agent = createWhisperMeshAgent(index);
  const result = await agent.invoke({
    sessionId: 'session-unit-test',
    query: 'Summarize topics from local memory.'
  });

  assert.ok(result.response.length > 0);
  assert.equal(result.sanitized, true);
  assert.ok(result.executionLog.some(log => log.includes('[SecurityFilter]')));
});
