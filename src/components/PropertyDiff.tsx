import type { PropertyDiff, DecisionType } from "../prefab/types";
import { CheckCircle2 } from "lucide-react";

interface PropertyDiffProps {
  diffs: PropertyDiff[];
  nodePath: string;
  propertyDecisions: Map<string, DecisionType>;
  onPropertyDecision: (nodePath: string, key: string, type: DecisionType) => void;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (value.length > 80) return `"${value.slice(0, 80)}..."`;
    return `"${value}"`;
  }
  const json = JSON.stringify(value);
  if (json.length > 120) return `${json.slice(0, 120)}...`;
  return json;
}

export default function PropertyDiffPanel({
  diffs,
  nodePath,
  propertyDecisions,
  onPropertyDecision,
}: PropertyDiffProps) {
  if (diffs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        无属性差异
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-48">
              属性
            </th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">
              左值
            </th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">
              右值
            </th>
            <th className="text-center px-3 py-2 font-medium text-gray-600 w-28">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => {
            const decision = propertyDecisions.get(`${nodePath}#${diff.key}`);
            const isSettled = decision !== undefined;
            return (
              <tr
                key={diff.key}
                className={`border-b border-gray-100 transition-colors ${
                  isSettled ? "bg-gray-50/60" : "hover:bg-gray-50"
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs">
                  <span className={isSettled ? "text-gray-400" : "text-gray-700"}>
                    {diff.key}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs break-all">
                  <span className={isSettled ? "text-gray-400" : "text-gray-600"}>
                    {formatValue(diff.leftValue)}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs break-all">
                  <span className={isSettled ? "text-gray-400" : "text-gray-600"}>
                    {formatValue(diff.rightValue)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-center items-center">
                    <button
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        decision === "left"
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                      onClick={() =>
                        onPropertyDecision(nodePath, diff.key, "left")
                      }
                      title="保留左值"
                    >
                      ←左
                    </button>
                    <button
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        decision === "right"
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                      onClick={() =>
                        onPropertyDecision(nodePath, diff.key, "right")
                      }
                      title="保留右值"
                    >
                      右→
                    </button>
                    {isSettled && (
                      <CheckCircle2 size={14} className="text-green-500 ml-0.5" />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
