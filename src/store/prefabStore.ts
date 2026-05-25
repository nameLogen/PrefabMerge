import { create } from "zustand";
import type {
  PrefabNode,
  NodeDiff,
  DecisionType,
} from "../prefab/types";
import {
  readPrefab,
  buildContext,
  buildTreeNode,
  diffPrefabs,
  applyDecisions,
} from "../prefab";
import {
  listConflictFiles,
  getPrefabThreeWay,
  listBranches,
  diffBranches,
  getPrefabFromBranch,
  writePrefab,
  restoreBackup,
  listBackups,
  getGitRoot,
  readWorkingTreePrefab,
} from "../git/api";

export interface MergeSummaryItem {
  kind: "node" | "property";
  path: string;
  decision: DecisionType;
  detail?: string;
}

export interface MergeSummary {
  file: string;
  items: MergeSummaryItem[];
}

export interface MergeHistoryItem {
  id: string;
  file: string;
  timestamp: string;
  nodeDecisions: [string, DecisionType][];
  propertyDecisions: [string, DecisionType][];
  backupTimestamp: string;
}

interface PrefabState {
  repoPath: string;
  mode: "conflict" | "preview";
  conflictFiles: string[];
  branches: string[];
  selectedFile: string | null;
  leftBranch: string;
  rightBranch: string;
  baseTree: PrefabNode | null;
  leftTree: PrefabNode | null;
  rightTree: PrefabNode | null;
  diffTree: NodeDiff | null;
  nodeDecisions: Map<string, DecisionType>;
  propertyDecisions: Map<string, DecisionType>;
  diffFilter: "all" | "structural" | "property" | "noIdRef";
  showBasePanel: boolean;
  selectedNodePath: string | null;
  syncNodePath: string | null;
  mergeSummary: MergeSummary | null;
  showMergeSummary: boolean;
  mergeHistory: MergeHistoryItem[];
  showHistoryPanel: boolean;
  loading: boolean;
  error: string | null;

  loadRepo: (path: string) => Promise<void>;
  selectFile: (file: string) => Promise<void>;
  setMode: (mode: "conflict" | "preview") => void;
  setBranches: (left: string, right: string) => Promise<void>;
  setNodeDecision: (path: string, type: DecisionType) => void;
  setPropertyDecision: (
    nodePath: string,
    key: string,
    type: DecisionType
  ) => void;
  applyMerge: () => Promise<void>;
  revertMerge: (item: MergeHistoryItem) => Promise<void>;
  undoMerge: () => Promise<void>;
  setDiffFilter: (filter: "all" | "structural" | "property" | "noIdRef") => void;
  toggleShowBasePanel: () => void;
  selectNode: (path: string | null) => void;
  setSyncNodePath: (path: string | null) => void;
  clearError: () => void;
  closeMergeSummary: () => void;
  toggleHistoryPanel: () => void;
  clearDecisions: () => void;
}

export const usePrefabStore = create<PrefabState>((set, get) => ({
  repoPath: "",
  mode: "conflict",
  conflictFiles: [],
  branches: [],
  selectedFile: null,
  leftBranch: "",
  rightBranch: "",
  baseTree: null,
  leftTree: null,
  rightTree: null,
  diffTree: null,
  nodeDecisions: new Map(),
  propertyDecisions: new Map(),
  diffFilter: "all",
  showBasePanel: false,
  selectedNodePath: null,
  syncNodePath: null,
  mergeSummary: null,
  showMergeSummary: false,
  mergeHistory: [],
  showHistoryPanel: false,
  loading: false,
  error: null,

  loadRepo: async (path) => {
    set({ loading: true, error: null });
    try {
      const trueRoot = await getGitRoot(path);
      set({ repoPath: trueRoot });
      const files = await listConflictFiles(trueRoot);
      const branches = await listBranches(trueRoot);
      set({
        conflictFiles: files,
        branches,
        loading: false,
      });
      if (files.length > 0) {
        await get().selectFile(files[0]);
      }
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectFile: async (file) => {
    const { repoPath, mode, leftBranch, rightBranch } = get();
    set({ selectedFile: file, loading: true, error: null });
    try {
      if (mode === "conflict") {
        const threeWay = await getPrefabThreeWay(repoPath, file);
        const leftData = readPrefab(threeWay.ours);
        const rightData = readPrefab(threeWay.theirs);
        const baseData = readPrefab(threeWay.base);

        const leftCtx = buildContext(file, leftData);
        const rightCtx = buildContext(file, rightData);
        const baseCtx = buildContext(file, baseData);

        set({
          leftTree: buildTreeNode(leftCtx, leftCtx.rootId),
          rightTree: buildTreeNode(rightCtx, rightCtx.rootId),
          baseTree: buildTreeNode(baseCtx, baseCtx.rootId),
          diffTree: diffPrefabs(leftCtx, rightCtx),
          nodeDecisions: new Map(),
          propertyDecisions: new Map(),
          selectedNodePath: null,
          syncNodePath: null,
          loading: false,
        });
      } else {
        const leftJsonPromise = leftBranch === "__local__"
          ? readWorkingTreePrefab(repoPath, file)
          : getPrefabFromBranch(repoPath, leftBranch, file);
        const rightJsonPromise = rightBranch === "__local__"
          ? readWorkingTreePrefab(repoPath, file)
          : getPrefabFromBranch(repoPath, rightBranch, file);

        const [leftJson, rightJson] = await Promise.all([
          leftJsonPromise,
          rightJsonPromise,
        ]);
        const leftData = readPrefab(leftJson);
        const rightData = readPrefab(rightJson);

        const leftCtx = buildContext(file, leftData);
        const rightCtx = buildContext(file, rightData);

        set({
          leftTree: buildTreeNode(leftCtx, leftCtx.rootId),
          rightTree: buildTreeNode(rightCtx, rightCtx.rootId),
          baseTree: null,
          diffTree: diffPrefabs(leftCtx, rightCtx),
          nodeDecisions: new Map(),
          propertyDecisions: new Map(),
          selectedNodePath: null,
          syncNodePath: null,
          loading: false,
        });
      }
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setMode: (mode) => {
    set({ mode, selectedFile: null, leftTree: null, rightTree: null, baseTree: null, diffTree: null });
  },

  setBranches: async (left, right) => {
    set({ leftBranch: left, rightBranch: right });
    const { repoPath } = get();
    try {
      const files = await diffBranches(repoPath, left, right);
      set({ conflictFiles: files.map((f) => f.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setNodeDecision: (path, type) => {
    const { nodeDecisions } = get();
    const next = new Map(nodeDecisions);
    next.set(path, type);
    set({ nodeDecisions: next });
  },

  setPropertyDecision: (nodePath, key, type) => {
    const { propertyDecisions } = get();
    const next = new Map(propertyDecisions);
    next.set(`${nodePath}#${key}`, type);
    set({ propertyDecisions: next });
  },

  applyMerge: async () => {
    const {
      repoPath,
      selectedFile,
      diffTree,
      nodeDecisions,
      propertyDecisions,
      mode,
      leftBranch,
      rightBranch,
      mergeHistory,
    } = get();
    if (!selectedFile || !diffTree) return;

    set({ loading: true, error: null });
    try {
      let leftJson: string;
      let rightJson: string;

      if (mode === "conflict") {
        const threeWay = await getPrefabThreeWay(repoPath, selectedFile);
        leftJson = threeWay.ours;
        rightJson = threeWay.theirs;
      } else {
        const leftJsonPromise = leftBranch === "__local__"
          ? readWorkingTreePrefab(repoPath, selectedFile)
          : getPrefabFromBranch(repoPath, leftBranch, selectedFile);
        const rightJsonPromise = rightBranch === "__local__"
          ? readWorkingTreePrefab(repoPath, selectedFile)
          : getPrefabFromBranch(repoPath, rightBranch, selectedFile);
        [leftJson, rightJson] = await Promise.all([
          leftJsonPromise,
          rightJsonPromise,
        ]);
      }

      const leftData = readPrefab(leftJson);
      const rightData = readPrefab(rightJson);
      const leftCtx = buildContext(selectedFile, leftData);
      const rightCtx = buildContext(selectedFile, rightData);

      const result = applyDecisions(
        leftCtx,
        rightCtx,
        diffTree,
        nodeDecisions,
        propertyDecisions
      );

      // Build summary
      const summaryItems: MergeSummaryItem[] = [];

      function walkDiff(node: NodeDiff) {
        const nodeDecision = nodeDecisions.get(node.path);
        if (nodeDecision) {
          const detail =
            node.diffType === "added"
              ? "保留新增子树"
              : node.diffType === "removed"
              ? "删除子树"
              : node.diffType === "modified"
              ? "替换节点属性"
              : "";
          summaryItems.push({
            kind: "node",
            path: node.path,
            decision: nodeDecision,
            detail,
          });
        }

        for (const prop of node.propertyDiffs) {
          const propDecision = propertyDecisions.get(`${node.path}#${prop.key}`);
          if (propDecision) {
            summaryItems.push({
              kind: "property",
              path: `${node.path}#${prop.key}`,
              decision: propDecision,
              detail: `${JSON.stringify(prop.leftValue)} → ${JSON.stringify(prop.rightValue)}`,
            });
          }
        }

        for (const child of node.children) {
          walkDiff(child);
        }
      }

      walkDiff(diffTree);

      const jsonData = JSON.stringify(result, null, 2);
      const writeResult = await writePrefab(repoPath, selectedFile, jsonData);

      const historyItem: MergeHistoryItem = {
        id: Date.now().toString(),
        file: selectedFile,
        timestamp: new Date().toLocaleString(),
        nodeDecisions: Array.from(nodeDecisions.entries()),
        propertyDecisions: Array.from(propertyDecisions.entries()),
        backupTimestamp: writeResult.backup_timestamp,
      };

      set({
        loading: false,
        mergeSummary: { file: selectedFile, items: summaryItems },
        showMergeSummary: true,
        mergeHistory: [historyItem, ...mergeHistory],
        nodeDecisions: new Map(),
        propertyDecisions: new Map(),
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  revertMerge: async (item) => {
    const { repoPath, mergeHistory } = get();
    set({ loading: true, error: null });
    try {
      await restoreBackup(repoPath, item.file, item.backupTimestamp);
      set({
        loading: false,
        mergeHistory: mergeHistory.filter((h) => h.id !== item.id),
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  undoMerge: async () => {
    const { repoPath, selectedFile } = get();
    if (!selectedFile) return;

    set({ loading: true, error: null });
    try {
      const backups = await listBackups(repoPath, selectedFile);
      if (backups.length === 0) {
        set({ error: "No backup found", loading: false });
        return;
      }
      const latest = backups[0];
      await restoreBackup(repoPath, selectedFile, latest.timestamp);
      set({ loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setDiffFilter: (filter) => {
    set({ diffFilter: filter });
  },

  toggleShowBasePanel: () => {
    set((state) => ({ showBasePanel: !state.showBasePanel }));
  },

  selectNode: (path) => {
    set({ selectedNodePath: path });
  },

  setSyncNodePath: (path) => {
    set({ syncNodePath: path });
  },

  clearError: () => {
    set({ error: null });
  },

  closeMergeSummary: () => {
    set({ showMergeSummary: false });
  },

  toggleHistoryPanel: () => {
    set((state) => ({ showHistoryPanel: !state.showHistoryPanel }));
  },

  clearDecisions: () => {
    set({ nodeDecisions: new Map(), propertyDecisions: new Map() });
  },
}));
