import { useMemo, useRef } from "react";
import NodeTree, { type NodeTreeRef } from "./NodeTree";
import PropertyDiffPanel from "./PropertyDiff";
import { usePrefabStore } from "../store/prefabStore";
import type { NodeDiff } from "../prefab/types";
import { FolderOpen, FolderClosed } from "lucide-react";

function buildDiffMap(diff: NodeDiff | null): Map<string, NodeDiff> {
  const map = new Map<string, NodeDiff>();
  if (!diff) return map;

  function walk(node: NodeDiff) {
    map.set(node.path, node);
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(diff);
  return map;
}

function TreePanel({
  title,
  tree,
  diffMap,
  decisions,
  selectedPath,
  syncNodePath,
  diffFilter,
  onSelectNode,
  onNodeDecision,
}: {
  title: string;
  tree: import("../prefab/types").PrefabNode;
  diffMap: Map<string, NodeDiff>;
  decisions: Map<string, import("../prefab/types").DecisionType>;
  selectedPath: string | null;
  syncNodePath: string | null;
  diffFilter: "all" | "structural" | "property" | "noIdRef";
  onSelectNode: (path: string) => void;
  onNodeDecision: (path: string, type: import("../prefab/types").DecisionType) => void;
}) {
  const treeRef = useRef<NodeTreeRef>(null);

  return (
    <div className="flex-1 border-r border-gray-200 flex flex-col">
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 shrink-0 flex items-center justify-between">
        <span>{title}</span>
        <div className="flex gap-1">
          <button
            className="p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
            onClick={() => treeRef.current?.expandAll()}
            title="展开全部"
          >
            <FolderOpen size={13} />
          </button>
          <button
            className="p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
            onClick={() => treeRef.current?.collapseAll()}
            title="折叠全部"
          >
            <FolderClosed size={13} />
          </button>
        </div>
      </div>
      <NodeTree
        ref={treeRef}
        tree={tree}
        diffMap={diffMap}
        decisions={decisions}
        selectedPath={selectedPath}
        syncNodePath={syncNodePath}
        diffFilter={diffFilter}
        onSelectNode={onSelectNode}
        onNodeDecision={onNodeDecision}
      />
    </div>
  );
}

export default function DiffPanel() {
  const {
    leftTree,
    rightTree,
    baseTree,
    diffTree,
    nodeDecisions,
    propertyDecisions,
    selectedNodePath,
    syncNodePath,
    diffFilter,
    showBasePanel,
    selectNode,
    setSyncNodePath,
    setNodeDecision,
    setPropertyDecision,
  } = usePrefabStore();

  const diffMap = useMemo(() => buildDiffMap(diffTree), [diffTree]);

  const selectedDiff = selectedNodePath
    ? diffMap.get(selectedNodePath)
    : undefined;

  const handleSelectLeft = (path: string) => {
    selectNode(path);
    setSyncNodePath(path);
  };

  const handleSelectRight = (path: string) => {
    selectNode(path);
    setSyncNodePath(path);
  };

  const handleSelectBase = (path: string) => {
    selectNode(path);
    setSyncNodePath(path);
  };

  const panels = [];
  if (showBasePanel && baseTree) {
    panels.push(
      <TreePanel
        key="base"
        title="Base (共同祖先)"
        tree={baseTree}
        diffMap={diffMap}
        decisions={nodeDecisions}
        selectedPath={selectedNodePath}
        syncNodePath={syncNodePath}
        diffFilter={diffFilter}
        onSelectNode={handleSelectBase}
        onNodeDecision={() => {}}
      />
    );
  }

  if (leftTree) {
    panels.push(
      <TreePanel
        key="left"
        title="左分支 (ours)"
        tree={leftTree}
        diffMap={diffMap}
        decisions={nodeDecisions}
        selectedPath={selectedNodePath}
        syncNodePath={syncNodePath}
        diffFilter={diffFilter}
        onSelectNode={handleSelectLeft}
        onNodeDecision={setNodeDecision}
      />
    );
  }

  if (rightTree) {
    panels.push(
      <TreePanel
        key="right"
        title="右分支 (theirs)"
        tree={rightTree}
        diffMap={diffMap}
        decisions={nodeDecisions}
        selectedPath={selectedNodePath}
        syncNodePath={syncNodePath}
        diffFilter={diffFilter}
        onSelectNode={handleSelectRight}
        onNodeDecision={setNodeDecision}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {panels.length > 0 ? (
          panels
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            请选择一个 prefab 文件进行对比
          </div>
        )}
      </div>

      {/* Property diff panel */}
      {selectedDiff && selectedDiff.propertyDiffs.length > 0 && (
        <div className="h-64 border-t border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 shrink-0">
            属性差异: {selectedNodePath}
          </div>
          <div className="flex-1 min-h-0">
            <PropertyDiffPanel
              diffs={selectedDiff.propertyDiffs}
              nodePath={selectedNodePath || ""}
              propertyDecisions={propertyDecisions}
              onPropertyDecision={setPropertyDecision}
            />
          </div>
        </div>
      )}
    </div>
  );
}
