import { FolderOpen } from "lucide-react";
import { usePrefabStore } from "../store/prefabStore";
import FileSelector from "./FileSelector";

export default function Toolbar() {
  const {
    repoPath,
    mode,
    conflictFiles,
    branches,
    selectedFile,
    leftBranch,
    rightBranch,
    diffFilter,
    showBasePanel,
    loadRepo,
    selectFile,
    setMode,
    setBranches,
    setDiffFilter,
    toggleShowBasePanel,
  } = usePrefabStore();

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2">
        <FolderOpen size={16} className="text-gray-500" />
        <span className="text-sm text-gray-600 truncate max-w-[240px]">
          {repoPath || "未选择仓库"}
        </span>
        <button
          className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
          onClick={() => {
            const path = prompt("请输入 Git 仓库路径:", repoPath);
            if (path) loadRepo(path);
          }}
        >
          选择仓库
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      <select
        className="text-xs border rounded px-2 py-1 bg-white"
        value={mode}
        onChange={(e) => setMode(e.target.value as "conflict" | "preview")}
      >
        <option value="conflict">冲突解决</option>
        <option value="preview">差异预览</option>
      </select>

      {mode === "conflict" ? (
        <FileSelector
          files={conflictFiles}
          selectedFile={selectedFile}
          onSelect={selectFile}
          placeholder="选择冲突文件..."
        />
      ) : (
        <>
          <select
            className="text-xs border rounded px-2 py-1 bg-white"
            value={leftBranch}
            onChange={(e) => setBranches(e.target.value, rightBranch)}
          >
            <option value="">左分支</option>
            <option value="__local__">本地工作区</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <span className="text-gray-400">vs</span>
          <select
            className="text-xs border rounded px-2 py-1 bg-white"
            value={rightBranch}
            onChange={(e) => setBranches(leftBranch, e.target.value)}
          >
            <option value="">右分支</option>
            <option value="__local__">本地工作区</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <FileSelector
            files={conflictFiles}
            selectedFile={selectedFile}
            onSelect={selectFile}
            placeholder="选择文件..."
          />
        </>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <select
          className="text-xs border rounded px-1.5 py-1 bg-white"
          value={diffFilter}
          onChange={(e) =>
            setDiffFilter(e.target.value as "all" | "structural" | "property" | "noIdRef")
          }
        >
          <option value="all">全部差异</option>
          <option value="structural">只看新增/删除</option>
          <option value="property">只看属性差异</option>
          <option value="noIdRef">忽略 __id__ 差异</option>
        </select>

        {mode === "preview" && (
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showBasePanel}
              onChange={toggleShowBasePanel}
            />
            显示 Base
          </label>
        )}
      </div>
    </div>
  );
}
