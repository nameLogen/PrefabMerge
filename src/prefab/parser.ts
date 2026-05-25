import type {
  PrefabArray,
  PrefabContext,
  PrefabNode,
  PrefabComponent,
  PrefabTree,
} from "./types";
import { getRefId } from "./id-rules";

import { getNodeChildrenIds, getNodeComponentIds } from "./id-rules";

export function isNodeLike(item: unknown): boolean {
  return (
    item != null &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    ((item as Record<string, unknown>).__type__ === "cc.Node" ||
      (item as Record<string, unknown>).__type__ === "cc.PrivateNode")
  );
}

export function readPrefab(json: string): PrefabArray {
  const data = JSON.parse(json);
  if (!Array.isArray(data) || !data.length) {
    throw new Error("Invalid prefab data: not an array");
  }
  const root = data[0];
  if (!root || (root as Record<string, unknown>).__type__ !== "cc.Prefab") {
    throw new Error("Invalid prefab data: first element is not cc.Prefab");
  }
  return data;
}

export function getRootId(data: PrefabArray): number {
  const root = data[0] as Record<string, unknown>;
  const rootId = getRefId(root.data);
  if (rootId == null) {
    throw new Error("Prefab root node not found");
  }
  return rootId;
}

export function summarizeComponent(
  ctx: PrefabContext,
  compId: number
): PrefabComponent | null {
  const comp = ctx.data[compId] as Record<string, unknown> | undefined;
  if (!comp) return null;

  const type = comp.__type__ as string;
  const result: PrefabComponent = {
    id: compId,
    type,
    properties: {},
  };

  // Extract key properties for display
  if (type === "cc.Label") {
    result.properties._string = comp._string;
  } else if (type === "cc.Sprite") {
    result.properties._spriteFrame = comp._spriteFrame;
  } else if (type === "sp.Skeleton") {
    result.properties._N$skeletonData = comp["_N$skeletonData"];
    result.properties.defaultAnimation = comp.defaultAnimation;
    result.properties.defaultSkin = comp.defaultSkin;
  }

  return result;
}

export function buildTreeNode(
  ctx: PrefabContext,
  nodeId: number
): PrefabNode {
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
      .filter((c): c is PrefabComponent => c !== null),
    children,
  };
}

export function buildContext(file: string, data: PrefabArray): PrefabContext {
  const rootId = getRootId(data);
  const nodePathById = new Map<number, string>();
  const nodeIdByPath = new Map<string, number>();

  function walk(nodeId: number, parentPath: string) {
    const node = data[nodeId];
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;
    if (n.__type__ !== "cc.Node") return;

    const currentPath = parentPath
      ? `${parentPath}/${n._name || ""}`
      : (n._name as string) || "";
    nodePathById.set(nodeId, currentPath);
    nodeIdByPath.set(currentPath, nodeId);

    for (const childId of getNodeChildrenIds(node)) {
      walk(childId, currentPath);
    }
  }

  walk(rootId, "");

  return {
    file,
    data,
    rootId,
    nodeIdByPath,
    nodePathById,
  };
}

export function treePrefab(file: string, json: string): PrefabTree {
  const data = readPrefab(json);
  const ctx = buildContext(file, data);
  return {
    file,
    tree: buildTreeNode(ctx, ctx.rootId),
  };
}

export function findNodeByPath(
  ctx: PrefabContext,
  path: string
): { nodeId: number; node: Record<string, unknown> } | null {
  const nodeId = ctx.nodeIdByPath.get(path);
  if (nodeId == null) return null;
  const node = ctx.data[nodeId] as Record<string, unknown>;
  return { nodeId, node };
}
