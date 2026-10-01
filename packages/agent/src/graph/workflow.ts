/**
 * @file workflow.ts
 * @description LangGraph StateGraph Definition for WhisperMesh Edge Agent.
 * Cyclically ingests, verifies security, retrieves local memory, decides peer actions,
 * and synthesizes on-device responses.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentStateType } from './state.js';
import { SecurityFilter } from '../security/filter.js';
import { LocalGraphIndex } from '../memory/memory.js';

export function createWhisperMeshAgent(memoryIndex: LocalGraphIndex) {
  const workflow = new StateGraph(AgentStateAnnotation)
    // 1. Ingest & Sanitize Input
    .addNode('security_filter', async (state: AgentStateType) => {
      const result = SecurityFilter.evaluate(state.query);
      return {
        sanitized: result.passed,
        query: result.sanitizedText,
        executionLog: [`[SecurityFilter] Checked prompt. Passed: ${result.passed}`]
      };
    })

    // 2. Retrieve Local Graph Memory
    .addNode('retrieve_memory', async () => {
      const context = memoryIndex.summarizeContext();
      return {
        graphContext: context,
        executionLog: ['[RetrieveMemory] Context retrieved from local graph index.']
      };
    })

    // 3. Reason & Analyze Peer Intent
    .addNode('reason_engine', async (state: AgentStateType) => {
      const lower = state.query.toLowerCase();
      const isPeerAction = lower.includes('connect') || lower.includes('message') || lower.includes('send to');
      
      let targetPeer: string | undefined;
      if (isPeerAction) {
        const words = state.query.split(' ');
        const targetIdx = words.findIndex(w => w.toLowerCase() === 'to' || w.toLowerCase() === 'with');
        if (targetIdx !== -1 && words[targetIdx + 1]) {
          targetPeer = words[targetIdx + 1];
        }
      }

      return {
        peerActionRequired: isPeerAction,
        targetPeerName: targetPeer,
        executionLog: [`[ReasonEngine] Intent evaluated. Peer action required: ${isPeerAction}`]
      };
    })

    // 4. Execute Peer Action if required
    .addNode('execute_peer_action', async (state: AgentStateType) => {
      return {
        response: `[P2P Action Scheduled] Ready to route payload to peer "${state.targetPeerName || 'available-peer'}".`,
        executionLog: [`[PeerAction] Prepared P2P control frame for ${state.targetPeerName || 'peer'}`]
      };
    })

    // 5. Synthesize Local Response
    .addNode('synthesize_response', async (state: AgentStateType) => {
      const answer = `Processed locally on device.\n\nContext Contextualized:\n${state.graphContext}\n\nQuery: ${state.query}`;
      return {
        response: answer,
        executionLog: ['[SynthesizeResponse] Response synthesized locally with zero server leaks.']
      };
    })

    // Edges & Routing
    .addEdge(START, 'security_filter')
    .addEdge('security_filter', 'retrieve_memory')
    .addEdge('retrieve_memory', 'reason_engine')
    .addConditionalEdges(
      'reason_engine',
      (state: AgentStateType) => (state.peerActionRequired ? 'execute_peer_action' : 'synthesize_response'),
      {
        execute_peer_action: 'execute_peer_action',
        synthesize_response: 'synthesize_response'
      }
    )
    .addEdge('execute_peer_action', END)
    .addEdge('synthesize_response', END);

  return workflow.compile();
}
