import type { PrefabArray } from "./types";

const DELETE = Symbol("delete");

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isIdRef(value: unknown): value is { __id__: number } {
  return (
    isObject(value) &&
    Object.keys(value).length === 1 &&
    typeof value.__id__ === "number"
  );
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function rewriteRefs(
  value: unknown,
  remap: Map<number, number>
): unknown {
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    for (const item of value) {
      const rewritten = rewriteRefs(item, remap);
      if (rewritten !== DELETE) {
        next.push(rewritten);
      }
    }
    return next;
  }

  if (isIdRef(value)) {
    if (!remap.has(value.__id__)) {
      return DELETE;
    }
    return { __id__: remap.get(value.__id__) };
  }

  if (!isObject(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const rewritten = rewriteRefs(child, remap);
    next[key] = rewritten === DELETE ? null : rewritten;
  }
  return next;
}

export function compactPrefabData(data: PrefabArray): PrefabArray {
  const remap = new Map<number, number>();
  const compact: PrefabArray = [];

  for (let index = 0; index < data.length; index++) {
    if (data[index] != null) {
      remap.set(index, compact.length);
      compact.push(cloneJson(data[index]));
    }
  }

  return compact.map((item) => rewriteRefs(item, remap)) as PrefabArray;
}

export function allocate(data: PrefabArray, value: unknown): number {
  data.push(value);
  return data.length - 1;
}

export function getRefId(value: unknown): number | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "__id__" in value &&
    typeof (value as Record<string, unknown>).__id__ === "number"
  ) {
    return (value as Record<string, unknown>).__id__ as number;
  }
  return null;
}

export function getNodeChildrenIds(node: unknown): number[] {
  if (!isObject(node)) return [];
  if (!Array.isArray(node._children)) return [];
  return node._children
    .map((child: unknown) => getRefId(child))
    .filter((id): id is number => id !== null);
}

export function getNodeComponentIds(node: unknown): number[] {
  if (!isObject(node)) return [];
  if (!Array.isArray(node._components)) return [];
  return node._components
    .map((comp: unknown) => getRefId(comp))
    .filter((id): id is number => id !== null);
}

export function collectSubtreeIds(
  data: PrefabArray,
  rootId: number
): number[] {
  const ids: number[] = [];

  function collect(id: number) {
    if (ids.includes(id)) return;
    ids.push(id);

    const item = data[id];
    if (!isObject(item)) return;

    // Components
    for (const compId of getNodeComponentIds(item)) {
      if (!ids.includes(compId)) {
        ids.push(compId);
      }
    }

    // PrefabInfo
    const prefabInfoId = getRefId(item._prefab);
    if (prefabInfoId != null && !ids.includes(prefabInfoId)) {
      ids.push(prefabInfoId);
    }

    // Children
    for (const childId of getNodeChildrenIds(item)) {
      collect(childId);
    }
  }

  collect(rootId);
  return ids;
}

export function graftSubtree(
  targetData: PrefabArray,
  sourceData: PrefabArray,
  sourceRootId: number,
  targetParentId: number
): number {
  // 1. Collect all objects in the source subtree
  const sourceIds = collectSubtreeIds(sourceData, sourceRootId);

  // 2. Allocate new IDs in target (starting from targetData.length)
  const idMap = new Map<number, number>();
  for (const oldId of sourceIds) {
    const clone = cloneJson(sourceData[oldId]);
    const newId = allocate(targetData, clone);
    idMap.set(oldId, newId);
  }

  // 3. Rewrite internal references
  const remap = new Map(idMap);
  for (const [, newId] of idMap.entries()) {
    targetData[newId] = rewriteRefs(targetData[newId], remap);
  }

  // 4. Fix parent connection
  const newRootId = idMap.get(sourceRootId)!;
  const newRoot = targetData[newRootId] as Record<string, unknown>;
  newRoot._parent = { __id__: targetParentId };

  // 5. Attach to target parent's children
  const targetParent = targetData[targetParentId] as Record<string, unknown>;
  if (!Array.isArray(targetParent._children)) {
    targetParent._children = [];
  }
  (targetParent._children as unknown[]).push({ __id__: newRootId });

  return newRootId;
}

export function cleanupDeletedRefs(
  data: PrefabArray,
  deletedIds: Set<number>
): void {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      const next: unknown[] = [];
      for (const item of value) {
        const rewritten = visit(item);
        if (rewritten !== DELETE) {
          next.push(rewritten);
        }
      }
      return next;
    }
    if (isIdRef(value)) {
      return deletedIds.has(value.__id__) ? DELETE : value;
    }
    if (!isObject(value)) {
      return value;
    }
    for (const key of Object.keys(value)) {
      const rewritten = visit(value[key]);
      value[key] = rewritten === DELETE ? null : rewritten;
    }
    return value;
  }

  for (const item of data) {
    if (item != null) {
      visit(item);
    }
  }
}
