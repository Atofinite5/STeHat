/**
 * @file memory.ts
 * @description Local Graph Index and Semantic Memory for WhisperMesh Edge Agent.
 * Stores entities, session summaries, and relationships strictly on the local device.
 */

export interface GraphNode {
  id: string;
  type: 'peer' | 'topic' | 'session';
  label: string;
  properties: Record<string, string | number | boolean>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
}

export class LocalGraphIndex {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];

  /**
   * Adds or updates a node in the local memory graph.
   */
  upsertNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Links two nodes with a semantic relationship.
   */
  addEdge(source: string, target: string, relationship: string): void {
    const exists = this.edges.some(
      e => e.source === source && e.target === target && e.relationship === relationship
    );
    if (!exists) {
      this.edges.push({ source, target, relationship });
    }
  }

  /**
   * Retrieves related context for an entity.
   */
  getRelatedContext(nodeId: string): { node: GraphNode | undefined; related: GraphNode[] } {
    const node = this.nodes.get(nodeId);
    const relatedIds = this.edges
      .filter(e => e.source === nodeId || e.target === nodeId)
      .map(e => (e.source === nodeId ? e.target : e.source));

    const related = relatedIds
      .map(id => this.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined);

    return { node, related };
  }

  /**
   * Serializes current memory into contextual text for agent reasoning.
   */
  summarizeContext(): string {
    const summary = Array.from(this.nodes.values())
      .map(n => `[${n.type.toUpperCase()}] ${n.label}`)
      .join('\n');
    return summary || 'No prior graph context.';
  }
}
