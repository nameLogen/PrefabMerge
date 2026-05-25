export type PrefabArray = unknown[];

export interface PrefabContext {
  file: string;
  data: PrefabArray;
  rootId: number;
  nodeIdByPath: Map<string, number>;
  nodePathById: Map<number, string>;
}

export interface PrefabComponent {
  id: number;
  type: string;
  scriptClass?: string;
  properties: Record<string, unknown>;
}

export interface PrefabNode {
  id: number;
  path: string;
  name: string;
  active: boolean;
  children: PrefabNode[];
  components: PrefabComponent[];
}

export type DiffType = "same" | "added" | "removed" | "modified";

export interface PropertyDiff {
  key: string;
  diffType: DiffType;
  leftValue?: unknown;
  rightValue?: unknown;
}

export interface NodeDiff {
  path: string;
  diffType: DiffType;
  leftNode?: PrefabNode;
  rightNode?: PrefabNode;
  propertyDiffs: PropertyDiff[];
  children: NodeDiff[];
}

export type DecisionType = "left" | "right";

export interface NodeDecision {
  path: string;
  type: DecisionType;
}

export interface PropertyDecision {
  nodePath: string;
  propertyKey: string;
  type: DecisionType;
}

export interface PrefabTree {
  file: string;
  tree: PrefabNode;
}
