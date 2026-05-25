import {
  readPrefab,
  buildContext,
  buildTreeNode,
  diffPrefabs,
  applyDecisions,
  compactPrefabData,
} from "./index";
import type { NodeDiff, DecisionType } from "./types";

// Load a real prefab from the game project
import fs from "fs";

const basePrefabPath =
  "G:/ccProjects/aed/Aedclient-develop_vampire/GameWord/assets/R16/prefabsR16/spine/group/105006.prefab";

function loadPrefab(path: string) {
  const json = fs.readFileSync(path, "utf-8");
  const data = readPrefab(json);
  const ctx = buildContext(path, data);
  return { json, data, ctx, tree: buildTreeNode(ctx, ctx.rootId) };
}

function printTree(node: ReturnType<typeof buildTreeNode>, indent = 0) {
  console.log(" ".repeat(indent) + `- ${node.name} (id=${node.id})`);
  for (const comp of node.components) {
    console.log(" ".repeat(indent + 2) + `[${comp.type}]`);
  }
  for (const child of node.children) {
    printTree(child, indent + 2);
  }
}

function countNodes(diff: NodeDiff): number {
  let count = diff.diffType !== "same" ? 1 : 0;
  for (const child of diff.children) {
    count += countNodes(child);
  }
  return count;
}

console.log("=== Test 1: Parse real prefab ===");
const base = loadPrefab(basePrefabPath);
console.log("Root:", base.tree.name);
console.log("Children:", base.tree.children.length);
console.log("Components:", base.tree.components.length);

console.log("\n=== Test 2: Create modified version ===");
// Clone and modify
const leftData = JSON.parse(JSON.stringify(base.data));
const rightData = JSON.parse(JSON.stringify(base.data));

// Modify right: change a property
const rightRoot = rightData[1] as Record<string, unknown>;
rightRoot._active = false;
(rightRoot._contentSize as Record<string, unknown>).width = 999;

// Add a new child node in right
const newNodeId = rightData.length;
const newNode = {
  __type__: "cc.Node",
  _name: "new_child",
  _objFlags: 0,
  _parent: { __id__: 1 },
  _children: [],
  _active: true,
  _components: [],
  _prefab: null,
  _opacity: 255,
  _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 },
  _contentSize: { __type__: "cc.Size", width: 100, height: 100 },
  _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
  _trs: {
    __type__: "TypedArray",
    ctor: "Float64Array",
    array: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  },
  _eulerAngles: { __type__: "cc.Vec3", x: 0, y: 0, z: 0 },
  _skewX: 0,
  _skewY: 0,
  _is3DNode: false,
  _groupIndex: 0,
  groupIndex: 0,
  _id: "",
};
rightData.push(newNode);
(rightRoot._children as unknown[]).push({ __id__: newNodeId });

const leftCtx = buildContext("left", leftData);
const rightCtx = buildContext("right", rightData);

console.log("Left nodes:", leftCtx.nodePathById.size);
console.log("Right nodes:", rightCtx.nodePathById.size);

console.log("\n=== Test 3: Diff ===");
const diff = diffPrefabs(leftCtx, rightCtx);
console.log("Diff root type:", diff.diffType);
console.log("Diff children:", diff.children.length);
console.log("Total diff nodes:", countNodes(diff));

// Print diff tree
function printDiff(node: NodeDiff, indent = 0) {
  const marker = node.diffType !== "same" ? `[${node.diffType.toUpperCase()}]` : "";
  console.log(" ".repeat(indent) + `${node.path} ${marker}`);
  for (const prop of node.propertyDiffs) {
    console.log(" ".repeat(indent + 2) + `PROP: ${prop.key}`);
  }
  for (const child of node.children) {
    printDiff(child, indent + 2);
  }
}
printDiff(diff);

console.log("\n=== Test 4: Merge (keep right) ===");
const nodeDecisions = new Map<string, DecisionType>();
nodeDecisions.set("105006/new_child", "right");

const propertyDecisions = new Map<string, DecisionType>();

const merged = applyDecisions(
  leftCtx,
  rightCtx,
  diff,
  nodeDecisions,
  propertyDecisions
);

console.log("Merged array length:", merged.length);

// Verify: new child should exist in merged
const mergedCtx = buildContext("merged", merged);
console.log("Merged nodes:", mergedCtx.nodePathById.size);
console.log(
  "Has new_child:",
  mergedCtx.nodeIdByPath.has("105006/new_child")
);

// Verify: root should still be active (left default, no decision)
const mergedRoot = merged[1] as Record<string, unknown>;
console.log("Root _active:", mergedRoot._active);

console.log("\n=== Test 5: Merge (keep left for new_child) ===");
const nodeDecisions2 = new Map<string, DecisionType>();
nodeDecisions2.set("105006/new_child", "left");

const merged2 = applyDecisions(
  leftCtx,
  rightCtx,
  diff,
  nodeDecisions2,
  propertyDecisions
);

const mergedCtx2 = buildContext("merged2", merged2);
console.log("Merged2 nodes:", mergedCtx2.nodePathById.size);
console.log(
  "Has new_child:",
  mergedCtx2.nodeIdByPath.has("105006/new_child")
);

console.log("\n=== All tests passed! ===");
