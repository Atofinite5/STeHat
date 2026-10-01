/**
 * @file state.ts
 * @description LangGraph State Annotation Schema for WhisperMesh.
 */

import { Annotation } from '@langchain/langgraph';

export interface MessageItem {
  role: 'user' | 'assistant' | 'peer' | 'system';
  content: string;
}

export const AgentStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => ''
  }),
  query: Annotation<string>({
    reducer: (_, next) => next,
    default: () => ''
  }),
  sanitized: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false
  }),
  graphContext: Annotation<string>({
    reducer: (_, next) => next,
    default: () => ''
  }),
  peerActionRequired: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false
  }),
  targetPeerName: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined
  }),
  response: Annotation<string>({
    reducer: (_, next) => next,
    default: () => ''
  }),
  executionLog: Annotation<string[]>({
    reducer: (curr, next) => curr.concat(next),
    default: () => []
  })
});

export type AgentStateType = typeof AgentStateAnnotation.State;
