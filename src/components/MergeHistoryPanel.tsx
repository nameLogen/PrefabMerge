import { usePrefabStore } from "../store/prefabStore";
import { X, RotateCcw, FileText, Clock } from "lucide-react";

export default function MergeHistoryPanel() {
  const {
    mergeHistory,
    showHistoryPanel,
    toggleHistoryPanel,
    revertMerge,
    loading,
  } = usePrefabStore();

  if (!showHistoryPanel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-800">合并历史</h2>
          </div>
          <button
            onClick={toggleHistoryPanel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {mergeHistory.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              暂无合并记录
            </div>
          ) : (
            <div className="space-y-2">
              {mergeHistory.map((item) => {
                const nodeCount = item.nodeDecisions.length;
                const propCount = item.propertyDecisions.length;
                return (
                  <div
                    key={item.id}
                    className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <FileText size={14} className="text-gray-400" />
                        <span className="truncate max-w-[280px]" title={item.file}>
                          {item.file}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{item.timestamp}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>节点: {nodeCount}</span>
                        <span>属性: {propCount}</span>
                      </div>
                      <button
                        className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                        onClick={() => revertMerge(item)}
                        disabled={loading}
                      >
                        <RotateCcw size={12} />
                        撤销本次
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={toggleHistoryPanel}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
