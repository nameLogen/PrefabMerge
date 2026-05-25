import fs from "fs";
import {
  readPrefab,
  buildContext,
  buildTreeNode,
  diffPrefabs,
  applyDecisions,
} from "./index";

const mainPrePath =
  "G:/ccProjects/aed/Aedclient-develop_vampire/GameWord/assets/resources/Prefab/mainpanel/MainPre.prefab";

console.log("=== Performance Test: MainPre.prefab ===");

const json = fs.readFileSync(mainPrePath, "utf-8");
console.log("File size:", (json.length / 1024).toFixed(1), "KB");

// Parse
const t0 = performance.now();
const data = readPrefab(json);
const t1 = performance.now();
console.log("Parse time:", (t1 - t0).toFixed(1), "ms");
console.log("Array length:", data.length);

// Build context + tree
const ctx = buildContext(mainPrePath, data);
const tree = buildTreeNode(ctx, ctx.rootId);
const t2 = performance.now();
console.log("Build tree time:", (t2 - t1).toFixed(1), "ms");

// Count nodes
function countNodes(node: typeof tree): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}
console.log("Total nodes:", countNodes(tree));

// Diff against itself (worst case: all same)
const t3 = performance.now();
const diff = diffPrefabs(ctx, ctx);
const t4 = performance.now();
console.log("Diff (same) time:", (t4 - t3).toFixed(1), "ms");

// Create a modified version: clone and change a few things
const rightData = JSON.parse(JSON.stringify(data));
const root = rightData[1] as Record<string, unknown>;
root._active = false;

// Modify a deep child's property
function findDeepChild(
  data: unknown[],
  ctx: ReturnType<typeof buildContext>,
  targetPath: string
): number | null {
  return ctx.nodeIdByPath.get(targetPath) ?? null;
}

const deepPath = Array.from(ctx.nodePathById.values()).find((p) =>
  p.includes("left")
);
if (deepPath) {
  const deepId = ctx.nodeIdByPath.get(deepPath);
  if (deepId != null) {
    const node = rightData[deepId] as Record<string, unknown>;
    if (node._contentSize) {
      (node._contentSize as Record<string, unknown>).width = 9999;
    }
  }
}

const rightCtx = buildContext(mainPrePath, rightData);

const t5 = performance.now();
const diff2 = diffPrefabs(ctx, rightCtx);
const t6 = performance.now();
console.log("Diff (modified) time:", (t6 - t5).toFixed(1), "ms");

// Merge test
const nodeDecisions = new Map();
const propertyDecisions = new Map();

const t7 = performance.now();
const merged = applyDecisions(ctx, rightCtx, diff2, nodeDecisions, propertyDecisions);
const t8 = performance.now();
console.log("Merge time:", (t8 - t7).toFixed(1), "ms");
console.log("Merged array length:", merged.length);

console.log("\n=== Performance test complete ===");
