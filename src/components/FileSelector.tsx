import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, FileText } from "lucide-react";

interface FileSelectorProps {
  files: string[];
  selectedFile: string | null;
  onSelect: (file: string) => void;
  placeholder?: string;
}

function matchQuery(query: string, text: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  // 直接子串匹配
  if (t.includes(q)) return true;
  // 按路径分隔符分段后，每段的首字母拼接匹配
  const segments = t.split(/[\/_.-]/).filter(Boolean);
  const initials = segments.map((s) => s[0]).join("");
  if (initials.includes(q)) return true;
  return false;
}

export default function FileSelector({
  files,
  selectedFile,
  onSelect,
  placeholder = "搜索或选择文件...",
}: FileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    return files.filter((f) => matchQuery(query, f));
  }, [files, query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        onSelect(filtered[highlightIndex]);
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displayText = selectedFile
    ? selectedFile.split("/").pop() || selectedFile
    : placeholder;

  return (
    <div ref={containerRef} className="relative min-w-[200px]">
      <button
        className="flex items-center gap-2 w-full text-xs border rounded px-2 py-1.5 bg-white hover:bg-gray-50 text-left"
        onClick={() => {
          setOpen(!open);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        onKeyDown={handleKeyDown}
      >
        <FileText size={14} className="text-gray-400 shrink-0" />
        <span className="truncate text-gray-700">{displayText}</span>
        <Search size={12} className="text-gray-400 ml-auto shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 flex flex-col max-h-[400px] w-auto max-w-[600px]">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100">
            <Search size={14} className="text-gray-400" />
            <input
              ref={inputRef}
              className="flex-1 text-xs outline-none text-gray-700 min-w-[200px]"
              placeholder="输入文件名或路径..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button
                className="p-0.5 hover:bg-gray-100 rounded"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <X size={12} className="text-gray-400" />
              </button>
            )}
          </div>

          <div className="overflow-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                无匹配文件
              </div>
            ) : (
              filtered.map((file, index) => {
                const isSelected = file === selectedFile;
                const isHighlighted = index === highlightIndex;
                return (
                  <div
                    key={file}
                    className={`px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap ${
                      isHighlighted
                        ? "bg-blue-50 text-blue-700"
                        : isSelected
                        ? "bg-gray-100 text-gray-900 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      onSelect(file);
                      setOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                  >
                    {file}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-2 py-1 border-t border-gray-100 text-[10px] text-gray-400 text-center">
            {filtered.length} / {files.length} 个文件
          </div>
        </div>
      )}
    </div>
  );
}
