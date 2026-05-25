import type {
  PrefabContext,
  PrefabNode,
  NodeDiff,
  PropertyDiff,
  DiffType,
} from "./types";
import { getRefId, isIdRef } from "./id-rules";

const IGNORE_FIELDS = new Set([
  "__type__",
  "node",
  "_name",
  "_objFlags",
  "_id",
  "_enabled",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function idRefToPath(
  value: unknown,
  ctx: PrefabContext
): unknown {
  if (!isIdRef(value)) return value;
  const id = getRefId(value);
  if (id == null) return value;
  const item = ctx.data[id];
  if (!isObject(item)) return value;

  // Node reference (already mapped)
  const path = ctx.nodePathById.get(id);
  if (path) return { __path__: path };

  const type = item.__type__ as string;

  // PrefabInfo reference
  if (type === "cc.PrefabInfo") {
    const rootId = getRefId(item.root);
    if (rootId != null) {
      const rootPath = ctx.nodePathById.get(rootId);
      if (rootPath) {
        return { __prefabInfo__: rootPath };
      }
    }
    return { __prefabInfo__: "__unknown__" };
  }

  // Component reference (cc.Sprite, cc.Label, scripts, etc.)
  const nodeId = getRefId(item.node);
  if (nodeId != null) {
    const nodePath = ctx.nodePathById.get(nodeId);
    if (nodePath) {
      return { __component__: `${nodePath}#${type}` };
    }
  }

  // Fallback: return original for unrecognized types
  return value;
}

function semanticCompare(
  left: unknown,
  right: unknown,
  leftCtx: PrefabContext,
  rightCtx: PrefabContext
): boolean {
  if (left === right) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!semanticCompare(left[i], right[i], leftCtx, rightCtx)) {
        return false;
      }
    }
    return true;
  }

  // Compare __id__ refs by path
  if (isIdRef(left) || isIdRef(right)) {
    const leftPath = idRefToPath(left, leftCtx);
    const rightPath = idRefToPath(right, rightCtx);
    return JSON.stringify(leftPath) === JSON.stringify(rightPath);
  }

  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!rightKeys.includes(key)) return false;
      if (!semanticCompare(left[key], right[key], leftCtx, rightCtx)) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function diffProperties(
  leftNode: PrefabNode,
  rightNode: PrefabNode,
  leftCtx: PrefabContext,
  rightCtx: PrefabContext
): PropertyDiff[] {
  const leftObj = leftCtx.data[leftNode.id] as Record<string, unknown>;
  const rightObj = rightCtx.data[rightNode.id] as Record<string, unknown>;

  const diffs: PropertyDiff[] = [];
  const allKeys = new Set([
    ...Object.keys(leftObj),
    ...Object.keys(rightObj),
  ]);

  for (const key of allKeys) {
    if (IGNORE_FIELDS.has(key)) continue;

    const leftVal = leftObj[key];
    const rightVal = rightObj[key];

    if (semanticCompare(leftVal, rightVal, leftCtx, rightCtx)) {
      continue;
    }

    diffs.push({
      key,
      diffType: "modified",
      leftValue: leftVal,
      rightValue: rightVal,
    });
  }

  return diffs;
}

function diffNodeRecursive(
  leftTree: PrefabNode | undefined,
  rightTree: PrefabNode | undefined,
  leftCtx: PrefabContext | undefined,
  rightCtx: PrefabContext | undefined
): NodeDiff {
  const path = leftTree?.path || rightTree?.path || "";

  // Determine diff type at this node level
  let diffType: DiffType;
  if (!leftTree && rightTree) {
    diffType = "added";
  } else if (leftTree && !rightTree) {
    diffType = "removed";
  } else if (!leftTree && !rightTree) {
    diffType = "same";
  } else {
    diffType = "same";
  }

  // Property diffs
  let propertyDiffs: PropertyDiff[] = [];
  if (leftTree && rightTree && leftCtx && rightCtx) {
    propertyDiffs = diffProperties(leftTree, rightTree, leftCtx, rightCtx);
    if (propertyDiffs.length > 0) {
      diffType = "modified";
    }
  }

  // Children diff
  const children: NodeDiff[] = [];

  if (diffType === "added" || diffType === "removed") {
    // If node is added/removed as a whole, don't diff children individually
    // But we still include them in the tree for display
    const sourceTree = leftTree || rightTree;
    if (sourceTree) {
      for (const child of sourceTree.children) {
        children.push({
          path: child.path,
          diffType,
          leftNode: leftTree ? child : undefined,
          rightNode: rightTree ? child : undefined,
          propertyDiffs: [],
          children: [],
        });
      }
    }
  } else {
    // Align children by path
    const leftChildMap = leftTree
      ? new Map(leftTree.children.map((c) => [c.path, c]))
      : new Map();
    const rightChildMap = rightTree
      ? new Map(rightTree.children.map((c) => [c.path, c]))
      : new Map();

    const allPaths = new Set([
      ...leftChildMap.keys(),
      ...rightChildMap.keys(),
    ]);

    for (const childPath of allPaths) {
      const leftChild = leftChildMap.get(childPath);
      const rightChild = rightChildMap.get(childPath);

      const childDiff = diffNodeRecursive(
        leftChild,
        rightChild,
        leftCtx,
        rightCtx
      );

      if (childDiff.diffType !== "same" || childDiff.children.length > 0) {
        children.push(childDiff);
      }

      // Also propagate modified status to parent
      if (childDiff.diffType !== "same") {
        diffType = "modified";
      }
    }
  }

  return {
    path,
    diffType,
    leftNode: leftTree,
    rightNode: rightTree,
    propertyDiffs,
    children,
  };
}

export function diffPrefabs(
  leftCtx: PrefabContext,
  rightCtx: PrefabContext
): NodeDiff {
  const leftTree = buildTreeNode(leftCtx, leftCtx.rootId);
  const rightTree = buildTreeNode(rightCtx, rightCtx.rootId);
  return diffNodeRecursive(leftTree, rightTree, leftCtx, rightCtx);
}

// Re-export from parser to avoid circular deps
function buildTreeNode(ctx: PrefabContext, nodeId: number): PrefabNode {
  const node = ctx.data[nodeId] as Record<string, unknown>;
  const children = getNodeChildrenIds(node).map((childId) =>
    buildTreeNode(ctx, childId)
  );
  return {
    id: nodeId,
    path: ctx.nodePathById.get(nodeId) || `__id__${nodeId}`,
    name: (node._name as string) || "",
    active: Boolean(node._active),
    components: getNodeComponentIds(node)
      .map((compId) => summarizeComponent(ctx, compId))
      .filter((c): c is NonNullable<typeof c> => c !== null),
    children,
  };
}

function getNodeChildrenIds(node: unknown): number[] {
  if (!isObject(node)) return [];
  if (!Array.isArray(node._children)) return [];
  return node._children
    .map((child: unknown) => getRefId(child))
    .filter((id): id is number => id !== null);
}

function getNodeComponentIds(node: unknown): number[] {
  if (!isObject(node)) return [];
  if (!Array.isArray(node._components)) return [];
  return node._components
    .map((comp: unknown) => getRefId(comp))
    .filter((id): id is number => id !== null);
}

function summarizeComponent(
  ctx: PrefabContext,
  compId: number
): { id: number; type: string; properties: Record<string, unknown> } | null {
  const comp = ctx.data[compId] as Record<string, unknown> | undefined;
  if (!comp) return null;
  return {
    id: compId,
    type: comp.__type__ as string,
    properties: {},
  };
}
