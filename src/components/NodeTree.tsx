import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import type { PrefabNode, NodeDiff, DecisionType } from "../prefab/types";
import { ChevronRight, ChevronDown } from "lucide-react";

interface NodeTreeProps {
  tree: PrefabNode;
  diffMap: Map<string, NodeDiff>;
  decisions: Map<string, DecisionType>;
  selectedPath: string | null;
  syncNodePath: string | null;
  diffFilter: "all" | "structural" | "property" | "noIdRef";
  onSelectNode: (path: string) => void;
  onNodeDecision: (path: string, type: DecisionType) => void;
  onExpandedPathsChange?: (paths: Set<string>) => void;
  parentScrollRef?: React.RefObject<HTMLDivElement | null>;
}

function getDiffColor(diffType: string): string {
  switch (diffType) {
    case "added":
      return "text-green-500";
    case "removed":
      return "text-red-500";
    case "modified":
      return "text-amber-500";
    default:
      return "text-gray-400";
  }
}

function getDiffIcon(diffType: string): string {
  switch (diffType) {
    case "added":
      return "+";
    case "removed":
      return "−";
    case "modified":
      return "●";
    default:
      return "○";
  }
}

function TreeNode({
  node,
  diff,
  depth,
  decisions,
  selectedPath,
  expandedPaths,
  onToggleExpand,
  diffFilter,
  onSelectNode,
  onNodeDecision,
}: {
  node: PrefabNode;
  diff?: NodeDiff;
  depth: number;
  decisions: Map<string, DecisionType>;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  diffFilter: "all" | "structural" | "property" | "noIdRef";
  onSelectNode: (path: string) => void;
  onNodeDecision: (path: string, type: DecisionType) => void;
}) {
  const diffType = diff?.diffType || "same";
  const decision = decisions.get(node.path);
  const isSelected = selectedPath === node.path;
  const isSettled = decision !== undefined;

  const isLeaf = node.children.length === 0;
  const expanded = expandedPaths.has(node.path);

  function isVisible(dt: string): boolean {
    if (diffFilter === "all" || diffFilter === "noIdRef") {
      return dt !== "same";
    }
    if (diffFilter === "structural") {
      return dt === "added" || dt === "removed";
    }
    if (diffFilter === "property") {
      return dt === "modified";
    }
    return true;
  }

  const visible = isVisible(diffType);

  // Recursively check if any descendant is visible
  function hasVisibleDescendant(nodeDiff: NodeDiff | undefined): boolean {
    if (!nodeDiff) return false;
    return nodeDiff.children.some(
      (c) => isVisible(c.diffType) || hasVisibleDescendant(c)
    );
  }
  const hasVisibleChildren = hasVisibleDescendant(diff);

  if (!visible && !hasVisibleChildren) {
    return null;
  }

  return (
    <div>
      <div
        data-tree-path={node.path}
        className={`flex items-center gap-1 py-0.5 pr-2 cursor-pointer select-none transition-colors duration-150 ${
          isSelected
            ? "bg-blue-100 border-l-2 border-blue-500"
            : "hover:bg-gray-50 border-l-2 border-transparent"
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => onSelectNode(node.path)}
      >
        {!isLeaf && (
          <button
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.path);
            }}
          >
            {expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        )}
        {isLeaf && <span className="w-4" />}

        {visible ? (
          <>
            <span className={`text-xs ${isSettled ? "text-gray-300" : getDiffColor(diffType)}`}>
              {getDiffIcon(diffType)}
            </span>
            <span className={`text-sm truncate ${
              isSelected
                ? "font-medium text-gray-900"
                : isSettled
                ? "text-gray-400"
                : "text-gray-700"
            }`}>
              {node.name}
            </span>
            {diffType !== "same" && (
              <div className="flex gap-0.5 ml-auto">
                <button
                  className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                    decision === "left"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNodeDecision(node.path, "left");
                  }}
                  title="保留左分支"
                >
                  ←
                </button>
                <button
                  className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                    decision === "right"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNodeDecision(node.path, "right");
                  }}
                  title="保留右分支"
                >
                  →
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <span className="text-xs text-gray-300">○</span>
            <span className="text-sm text-gray-400 truncate">{node.name}</span>
          </>
        )}
      </div>

      {expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            diff={diff?.children.find((c) => c.path === child.path)}
            depth={depth + 1}
            decisions={decisions}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            diffFilter={diffFilter}
            onSelectNode={onSelectNode}
            onNodeDecision={onNodeDecision}
          />
        ))}
    </div>
  );
}

function collectAllPaths(node: PrefabNode): Set<string> {
  const set = new Set<string>();
  function walk(n: PrefabNode) {
    set.add(n.path);
    for (const child of n.children) {
      walk(child);
    }
  }
  walk(node);
  return set;
}

export interface NodeTreeRef {
  expandAll: () => void;
  collapseAll: () => void;
}

const NodeTree = forwardRef<NodeTreeRef, NodeTreeProps>(function NodeTree(
  {
    tree,
    diffMap,
    decisions,
    selectedPath,
    syncNodePath,
    diffFilter,
    onSelectNode,
    onNodeDecision,
  },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const allPathsRef = useRef<Set<string>>(new Set());

  // Collect all paths that should be expanded based on visible nodes
  const getDefaultExpanded = useCallback((node: PrefabNode): Set<string> => {
    const set = new Set<string>();
    set.add(node.path);
    allPathsRef.current = collectAllPaths(node);

    function isVisible(dt: string): boolean {
      if (diffFilter === "all" || diffFilter === "noIdRef") {
        return dt !== "same";
      }
      if (diffFilter === "structural") {
        return dt === "added" || dt === "removed";
      }
      if (diffFilter === "property") {
        return dt === "modified";
      }
      return true;
    }

    function walk(n: PrefabNode, parentDiff?: NodeDiff) {
      const diff = parentDiff?.children.find((c) => c.path === n.path);
      const dt = diff?.diffType || "same";
      const visible = isVisible(dt);
      const hasVisibleChildren = diff?.children.some((c) => isVisible(c.diffType));

      if (visible || hasVisibleChildren) {
        set.add(n.path);
        for (const child of n.children) {
          walk(child, diff);
        }
      }
    }

    for (const child of node.children) {
      walk(child, diffMap.get(node.path));
    }
    return set;
  }, [diffMap, diffFilter]);

  // Initialize expanded paths
  useEffect(() => {
    setExpandedPaths(getDefaultExpanded(tree));
  }, [tree, diffFilter, getDefaultExpanded]);

  // When syncNodePath changes, expand to it and scroll
  useEffect(() => {
    if (!syncNodePath) return;

    // Expand all parent paths
    const parts = syncNodePath.split("/");
    const parents: string[] = [];
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      parents.push(current);
    }

    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const p of parents) {
        next.add(p);
      }
      return next;
    });

    // Scroll into view after expand (search within this panel only)
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const el = container.querySelector(`[data-tree-path="${syncNodePath}"]`);
      if (el) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = elRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({
          top: relativeTop - container.clientHeight / 3,
          behavior: "smooth",
        });
      }
    });
  }, [syncNodePath]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  useImperativeHandle(ref, () => ({
    expandAll: () => {
      setExpandedPaths(new Set(allPathsRef.current));
    },
    collapseAll: () => {
      setExpandedPaths(new Set([tree.path]));
    },
  }));

  return (
    <div className="overflow-auto h-full text-sm" ref={scrollRef}>
      <div data-tree-path={tree.path}>
        <TreeNode
          node={tree}
          diff={diffMap.get(tree.path)}
          depth={0}
          decisions={decisions}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onToggleExpand={handleToggleExpand}
          diffFilter={diffFilter}
          onSelectNode={onSelectNode}
          onNodeDecision={onNodeDecision}
        />
      </div>
    </div>
  );
});

export default NodeTree;
