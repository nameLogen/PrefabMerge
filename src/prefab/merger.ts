import type { PrefabArray, PrefabContext, NodeDiff, DecisionType } from "./types";
import {
  cloneJson,
  compactPrefabData,
  graftSubtree,
  isIdRef,
  getRefId,
  cleanupDeletedRefs,
} from "./id-rules";
import { buildContext } from "./parser";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsIdRef(value: unknown): boolean {
  if (isIdRef(value)) return true;
  if (Array.isArray(value)) {
    return value.some(containsIdRef);
  }
  if (isObject(value)) {
    return Object.values(value).some(containsIdRef);
  }
  return false;
}

function remapIdRefs(
  value: unknown,
  rightCtx: PrefabContext,
  resultCtx: PrefabContext
): unknown {
  if (isIdRef(value)) {
    const refId = getRefId(value);
    if (refId == null) return value;

    const target = rightCtx.data[refId];
    if (!isObject(target)) return value;

    const targetType = target.__type__ as string;

    if (targetType === "cc.Node" || targetType === "cc.PrivateNode") {
      // Find by path
      const path = rightCtx.nodePathById.get(refId);
      if (path) {
        const newId = resultCtx.nodeIdByPath.get(path);
        if (newId != null) {
          return { __id__: newId };
        }
      }
    } else if (targetType === "cc.PrefabInfo") {
      // Find by root reference
      const rootId = getRefId(target.root);
      if (rootId != null) {
        const rootPath = rightCtx.nodePathById.get(rootId);
        if (rootPath) {
          const newRootId = resultCtx.nodeIdByPath.get(rootPath);
          if (newRootId != null) {
            // Find PrefabInfo on the result node
            const resultNode = resultCtx.data[newRootId];
            if (isObject(resultNode)) {
              const newPrefabInfoId = getRefId(resultNode._prefab);
              if (newPrefabInfoId != null) {
                return { __id__: newPrefabInfoId };
              }
            }
          }
        }
      }
    } else {
      // Component: find by node path + component type
      const nodeId = getRefId(target.node);
      if (nodeId != null) {
        const nodePath = rightCtx.nodePathById.get(nodeId);
        if (nodePath) {
          const newNodeId = resultCtx.nodeIdByPath.get(nodePath);
          if (newNodeId != null) {
            const resultNode = resultCtx.data[newNodeId] as Record<
              string,
              unknown
            >;
            const components = (resultNode._components as unknown[]) || [];
            for (const compRef of components) {
              const compId = getRefId(compRef);
              if (compId == null) continue;
              const comp = resultCtx.data[compId];
              if (
                isObject(comp) &&
                comp.__type__ === targetType
              ) {
                return { __id__: compId };
              }
            }
          }
        }
      }
    }

    // Fallback: keep original (might create dangling ref, caught by validation)
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => remapIdRefs(v, rightCtx, resultCtx));
  }

  if (isObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = remapIdRefs(v, rightCtx, resultCtx);
    }
    return next;
  }

  return value;
}

function deleteSubtree(data: PrefabArray, nodeId: number): void {
  const deletedIds = new Set<number>();

  function collect(id: number) {
    if (deletedIds.has(id)) return;
    deletedIds.add(id);

    const item = data[id];
    if (!isObject(item)) return;

    for (const compId of (item._components as unknown[])
      ?.map(getRefId)
      .filter((id): id is number => id !== null) || []) {
      deletedIds.add(compId);
    }

    const prefabInfoId = getRefId(item._prefab);
    if (prefabInfoId != null) {
      deletedIds.add(prefabInfoId);
    }

    for (const childId of (item._children as unknown[])
      ?.map(getRefId)
      .filter((id): id is number => id !== null) || []) {
      collect(childId);
    }
  }

  collect(nodeId);

  // Remove from parent's children
  const node = data[nodeId] as Record<string, unknown>;
  const parentId = getRefId(node._parent);
  if (parentId != null) {
    const parent = data[parentId] as Record<string, unknown>;
    if (Array.isArray(parent._children)) {
      parent._children = parent._children.filter(
        (ref: unknown) => getRefId(ref) !== nodeId
      );
    }
  }

  // Mark deleted
  for (const id of deletedIds) {
    data[id] = null;
  }

  cleanupDeletedRefs(data, deletedIds);
}

export function applyDecisions(
  leftCtx: PrefabContext,
  rightCtx: PrefabContext,
  diffTree: NodeDiff,
  nodeDecisions: Map<string, DecisionType>,
  propertyDecisions: Map<string, DecisionType>
): PrefabArray {
  // Start with left data
  const result = cloneJson(leftCtx.data) as PrefabArray;
  let resultCtx = buildContext("result", result);

  function applyNodeDiff(diff: NodeDiff) {
    const decision = nodeDecisions.get(diff.path);

    if (diff.diffType === "added") {
      if (decision === "right" && diff.rightNode) {
        const parentPath = diff.path.substring(0, diff.path.lastIndexOf("/"));
        const parentId = resultCtx.nodeIdByPath.get(parentPath);
        if (parentId != null) {
          graftSubtree(result, rightCtx.data, diff.rightNode.id, parentId);
          resultCtx = buildContext("result", result);
        }
      }
    } else if (diff.diffType === "removed") {
      if (decision === "right") {
        const nodeId = resultCtx.nodeIdByPath.get(diff.path);
        if (nodeId != null) {
          deleteSubtree(result, nodeId);
          resultCtx = buildContext("result", result);
        }
      }
    } else if (diff.diffType === "modified") {
      applyPropertyDiffs(diff, resultCtx, rightCtx, decision, propertyDecisions);
    }

    // Recurse for children
    for (const child of diff.children) {
      applyNodeDiff(child);
    }
  }

  applyNodeDiff(diffTree);

  return compactPrefabData(result);
}

function applyPropertyDiffs(
  diff: NodeDiff,
  resultCtx: PrefabContext,
  rightCtx: PrefabContext,
  nodeDecision: DecisionType | undefined,
  propertyDecisions: Map<string, DecisionType>
) {
  const resultNodeId = resultCtx.nodeIdByPath.get(diff.path);
  if (resultNodeId == null) return;

  const resultNode = resultCtx.data[resultNodeId] as Record<string, unknown>;
  const rightNodeId = rightCtx.nodeIdByPath.get(diff.path);
  const rightNode =
    rightNodeId != null
      ? (rightCtx.data[rightNodeId] as Record<string, unknown>)
      : null;

  if (!rightNode) return;

  for (const propDiff of diff.propertyDiffs) {
    const propKey = propDiff.key;
    const propDecision = propertyDecisions.get(`${diff.path}#${propKey}`);

    let useRight = false;
    if (propDecision === "right") {
      useRight = true;
    } else if (propDecision === "left") {
      useRight = false;
    } else if (nodeDecision === "right") {
      useRight = true;
    }

    if (!useRight) continue;

    const rightValue = rightNode[propKey];
    if (containsIdRef(rightValue)) {
      resultNode[propKey] = remapIdRefs(rightValue, rightCtx, resultCtx);
    } else {
      resultNode[propKey] = cloneJson(rightValue);
    }
  }
}
