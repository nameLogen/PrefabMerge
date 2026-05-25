import fs from "fs";
import {
  readPrefab,
  buildContext,
  buildTreeNode,
  diffPrefabs,
  applyDecisions,
  compactPrefabData,
  isIdRef,
} from "./index";
import type { NodeDiff, DecisionType } from "./types";

const basePrefabPath =
  "G:/ccProjects/aed/Aedclient-develop_vampire/GameWord/assets/R16/prefabsR16/spine/group/105006.prefab";

function loadPrefab(path: string) {
  const json = fs.readFileSync(path, "utf-8");
  const data = readPrefab(json);
  const ctx = buildContext(path, data);
  return { json, data, ctx };
}

function validateIdContinuity(data: unknown[]): boolean {
  for (let i = 0; i < data.length; i++) {
    if (data[i] == null) return false;
  }
  return true;
}

function validateNoDanglingRefs(data: unknown[]): string[] {
  const errors: string[] = [];
  function scan(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${path}[${i}]`));
    } else if (value && typeof value === "object" && isIdRef(value)) {
      const id = (value as { __id__: number }).__id__;
      if (id < 0 || id >= data.length || data[id] == null) {
        errors.push(`${path} -> __id__ ${id} is dangling`);
      }
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        scan(v, `${path}.${k}`);
      }
    }
  }
  data.forEach((item, i) => {
    if (item != null) scan(item, `[${i}]`);
  });
  return errors;
}

console.log("=== Advanced Test: Complex merge scenario ===");
const base = loadPrefab(basePrefabPath);

// Create two variants
const leftData = JSON.parse(JSON.stringify(base.data));
const rightData = JSON.parse(JSON.stringify(base.data));

// RIGHT changes:
// 1. Add a new child with a Sprite component
// 2. Modify root's _active
// 3. Modify existing child's _contentSize

const rightRoot = rightData[1] as Record<string, unknown>;
rightRoot._active = false;

// Modify child node (id=2) _contentSize
const rightChild = rightData[2] as Record<string, unknown>;
(rightChild._contentSize as Record<string, unknown>).width = 5000;

// Add new node with Sprite component
const newNodeId = rightData.length;
const newCompId = newNodeId + 1;
const newPrefabInfoId = newNodeId + 2;

const newNode = {
  __type__: "cc.Node",
  _name: "ui_button",
  _objFlags: 0,
  _parent: { __id__: 1 },
  _children: [],
  _active: true,
  _components: [{ __id__: newCompId }],
  _prefab: { __id__: newPrefabInfoId },
  _opacity: 255,
  _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 },
  _contentSize: { __type__: "cc.Size", width: 120, height: 40 },
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

const newComp = {
  __type__: "cc.Sprite",
  _name: "",
  _objFlags: 0,
  node: { __id__: newNodeId },
  _enabled: true,
  _materials: [{ __uuid__: "eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432" }],
  _srcBlendFactor: 770,
  _dstBlendFactor: 771,
  _spriteFrame: { __uuid__: "some-uuid-here" },
  _type: 0,
  _sizeMode: 2,
  _fillType: 0,
  _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
  _fillStart: 0,
  _fillRange: 0,
  _isTrimmedMode: true,
  _atlas: null,
  _id: "",
};

const newPrefabInfo = {
  __type__: "cc.PrefabInfo",
  root: { __id__: 1 },
  asset: { __id__: 0 },
  fileId: "",
  sync: false,
};

rightData.push(newNode, newComp, newPrefabInfo);
(rightRoot._children as unknown[]).push({ __id__: newNodeId });

const leftCtx = buildContext("left", leftData);
const rightCtx = buildContext("right", rightData);

console.log("Left nodes:", leftCtx.nodePathById.size);
console.log("Right nodes:", rightCtx.nodePathById.size);

const diff = diffPrefabs(leftCtx, rightCtx);

console.log("\nDiff result:");
function printDiff(node: NodeDiff, indent = 0) {
  if (node.diffType === "same" && node.children.length === 0) return;
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

// Test: merge with all-right decisions
console.log("\n=== Merge all right ===");
const nodeDecisions = new Map<string, DecisionType>();
nodeDecisions.set("105006", "right");
nodeDecisions.set("105006/105006", "right");
nodeDecisions.set("105006/ui_button", "right");

const propertyDecisions = new Map<string, DecisionType>();

const merged = applyDecisions(
  leftCtx,
  rightCtx,
  diff,
  nodeDecisions,
  propertyDecisions
);

console.log("Merged length:", merged.length);
console.log("ID continuity:", validateIdContinuity(merged));

const dangling = validateNoDanglingRefs(merged);
if (dangling.length > 0) {
  console.error("DANGLING REFS FOUND:", dangling);
  process.exit(1);
} else {
  console.log("No dangling refs ✓");
}

const mergedCtx = buildContext("merged", merged);
console.log("Merged nodes:", mergedCtx.nodePathById.size);
console.log("Has ui_button:", mergedCtx.nodeIdByPath.has("105006/ui_button"));

// Verify the new component's node reference points to the new node
const uiButtonId = mergedCtx.nodeIdByPath.get("105006/ui_button")!;
const uiButton = merged[uiButtonId] as Record<string, unknown>;
const compRef = (uiButton._components as unknown[])[0];
const compId = (compRef as { __id__: number }).__id__;
const comp = merged[compId] as Record<string, unknown>;
console.log("Component node ref:", (comp.node as { __id__: number }).__id__, "==", uiButtonId);
if ((comp.node as { __id__: number }).__id__ !== uiButtonId) {
  console.error("COMPONENT NODE REF MISMATCH!");
  process.exit(1);
}

// Verify root _active is false (from right)
const mergedRoot = merged[1] as Record<string, unknown>;
console.log("Root _active:", mergedRoot._active);

// Verify child _contentSize.width is 5000 (from right, with node decision)
const mergedChild = mergedCtx.nodeIdByPath.get("105006/105006");
if (mergedChild != null) {
  const childNode = merged[mergedChild] as Record<string, unknown>;
  const width = (childNode._contentSize as Record<string, unknown>).width;
  console.log("Child _contentSize.width:", width);
  if (width !== 5000) {
    console.error("CHILD CONTENT SIZE NOT MERGED!");
    process.exit(1);
  }
}

console.log("\n=== Test: property-level decision ===");
const nodeDecisions2 = new Map<string, DecisionType>();
nodeDecisions2.set("105006", "right");
nodeDecisions2.set("105006/ui_button", "right");

const propertyDecisions2 = new Map<string, DecisionType>();
propertyDecisions2.set("105006#_active", "left"); // Override: keep left's _active

const merged2 = applyDecisions(
  leftCtx,
  rightCtx,
  diff,
  nodeDecisions2,
  propertyDecisions2
);

const mergedRoot2 = merged2[1] as Record<string, unknown>;
console.log("Root _active (should be true from left):", mergedRoot2._active);

if (mergedRoot2._active !== true) {
  console.error("PROPERTY DECISION FAILED!");
  process.exit(1);
}

console.log("\n=== All advanced tests passed! ===");
