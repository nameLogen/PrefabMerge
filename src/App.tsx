import Toolbar from "./components/Toolbar";
import DiffPanel from "./components/DiffPanel";
import BottomStatusBar from "./components/BottomStatusBar";
import MergeSummaryModal from "./components/MergeSummaryModal";
import MergeHistoryPanel from "./components/MergeHistoryPanel";
import { usePrefabStore } from "./store/prefabStore";
import { AlertCircle, X } from "lucide-react";

function App() {
  const { error, clearError } = usePrefabStore();

  return (
    <div className="flex flex-col h-screen bg-white">
      <Toolbar />

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} />
          <span className="flex-1">{error}</span>
          <button
            className="p-1 hover:bg-red-100 rounded"
            onClick={clearError}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <DiffPanel />
      <BottomStatusBar />
      <MergeSummaryModal />
      <MergeHistoryPanel />
    </div>
  );
}

export default App;
