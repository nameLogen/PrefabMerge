import { CheckCircle, Save, History } from "lucide-react";
import { usePrefabStore } from "../store/prefabStore";

export default function BottomStatusBar() {
  const {
    diffTree,
    nodeDecisions,
    propertyDecisions,
    loading,
    applyMerge,
    toggleHistoryPanel,
    mergeHistory,
  } = usePrefabStore();

  if (!diffTree) {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-gray-200 shrink-0 text-sm text-gray-400">
        等待加载 prefab...
      </div>
    );
  }

  // Count diff nodes
  function countDiffs(node: typeof diffTree): { total: number; resolved: number } {
    if (!node) return { total: 0, resolved: 0 };
    let total = node.diffType !== "same" ? 1 : 0;
    let resolved =
      node.diffType !== "same" && nodeDecisions.has(node.path) ? 1 : 0;
    for (const child of node.children) {
      const childCount = countDiffs(child);
      total += childCount.total;
      resolved += childCount.resolved;
    }
    return { total, resolved };
  }

  const { total, resolved } = countDiffs(diffTree);
  const allResolved = total > 0 && resolved === total;

  // Any decision made at all (node or property)
  const hasAnyDecision =
    nodeDecisions.size > 0 || propertyDecisions.size > 0;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-gray-200 shrink-0">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">
          差异节点: <span className="font-medium">{total}</span>
        </span>
        <span className="text-gray-600">
          已决策:{" "}
          <span
            className={`font-medium ${
              allResolved ? "text-green-600" : "text-amber-600"
            }`}
          >
            {resolved}/{total}
          </span>
        </span>
        {allResolved && (
          <span className="flex items-center gap-1 text-green-600 text-xs">
            <CheckCircle size={14} />
            全部完成
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded relative"
          onClick={toggleHistoryPanel}
          disabled={loading}
        >
          <History size={14} />
          历史记录
          {mergeHistory.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
              {mergeHistory.length}
            </span>
          )}
        </button>

        <button
          className={`flex items-center gap-1 px-4 py-1.5 text-sm rounded font-medium ${
            hasAnyDecision
              ? "bg-blue-500 hover:bg-blue-600 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
          onClick={applyMerge}
          disabled={!hasAnyDecision || loading}
        >
          <Save size={14} />
          {loading ? "处理中..." : "应用合并"}
        </button>
      </div>
    </div>
  );
}
