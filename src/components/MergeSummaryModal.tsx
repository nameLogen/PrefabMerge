import { usePrefabStore } from "../store/prefabStore";
import { X, FileCheck, GitBranch } from "lucide-react";

export default function MergeSummaryModal() {
  const { mergeSummary, showMergeSummary, closeMergeSummary } = usePrefabStore();

  if (!showMergeSummary || !mergeSummary) return null;

  const { file, items } = mergeSummary;
  const nodeItems = items.filter((i) => i.kind === "node");
  const propertyItems = items.filter((i) => i.kind === "property");

  const leftCount = items.filter((i) => i.decision === "left").length;
  const rightCount = items.filter((i) => i.decision === "right").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileCheck size={18} className="text-green-600" />
            <h2 className="text-base font-semibold text-gray-800">合并完成</h2>
          </div>
          <button
            onClick={closeMergeSummary}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <GitBranch size={14} />
            <span className="truncate max-w-[300px]" title={file}>
              {file}
            </span>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <span className="text-blue-600 font-medium">保留左: {leftCount}</span>
            <span className="text-purple-600 font-medium">保留右: {rightCount}</span>
            <span className="text-gray-500">共 {items.length} 项</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              本次合并未做决策，直接写入当前版本
            </div>
          ) : (
            <div className="space-y-4">
              {nodeItems.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    节点决策 ({nodeItems.length})
                  </h3>
                  <div className="space-y-1">
                    {nodeItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded text-sm"
                      >
                        <span
                          className={`w-5 h-5 flex items-center justify-center rounded text-xs font-medium ${
                            item.decision === "left"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700"
                          }`}
                        >
                          {item.decision === "left" ? "L" : "R"}
                        </span>
                        <span className="text-gray-700 font-mono text-xs truncate flex-1">
                          {item.path}
                        </span>
                        {item.detail && (
                          <span className="text-gray-400 text-xs">{item.detail}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {propertyItems.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    属性决策 ({propertyItems.length})
                  </h3>
                  <div className="space-y-1">
                    {propertyItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded text-sm"
                      >
                        <span
                          className={`w-5 h-5 flex items-center justify-center rounded text-xs font-medium shrink-0 ${
                            item.decision === "left"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700"
                          }`}
                        >
                          {item.decision === "left" ? "L" : "R"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-gray-700 font-mono text-xs truncate">
                            {item.path}
                          </div>
                          {item.detail && (
                            <div className="text-gray-400 text-xs mt-0.5 truncate">
                              {item.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={closeMergeSummary}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
