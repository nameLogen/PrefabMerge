import { invoke } from "@tauri-apps/api/core";

export interface PrefabThreeWay {
  base: string;
  ours: string;
  theirs: string;
}

export interface DiffFileInfo {
  path: string;
  status: string;
}

export interface BackupInfo {
  timestamp: string;
  path: string;
  size: number;
}

export interface WriteResult {
  success: boolean;
  backup_path: string;
  backup_timestamp: string;
}

export interface PrefabValidationError {
  code: string;
  message: string;
  details: string[];
}

export async function listConflictFiles(repoPath: string): Promise<string[]> {
  return invoke("list_conflict_files", { repoPath });
}

export async function getPrefabThreeWay(
  repoPath: string,
  filePath: string
): Promise<PrefabThreeWay> {
  return invoke("get_prefab_three_way", { repoPath, filePath });
}

export async function listBranches(repoPath: string): Promise<string[]> {
  return invoke("list_branches", { repoPath });
}

export async function diffBranches(
  repoPath: string,
  leftBranch: string,
  rightBranch: string
): Promise<DiffFileInfo[]> {
  return invoke("diff_branches", { repoPath, leftBranch, rightBranch });
}

export async function getPrefabFromBranch(
  repoPath: string,
  branch: string,
  filePath: string
): Promise<string> {
  return invoke("get_prefab_from_branch", { repoPath, branch, filePath });
}

export async function writePrefab(
  repoPath: string,
  filePath: string,
  jsonData: string
): Promise<WriteResult> {
  return invoke("write_prefab", { repoPath, filePath, jsonData });
}

export async function listBackups(
  repoPath: string,
  filePath: string
): Promise<BackupInfo[]> {
  return invoke("list_backups", { repoPath, filePath });
}

export async function restoreBackup(
  repoPath: string,
  filePath: string,
  backupTimestamp: string
): Promise<void> {
  return invoke("restore_backup", { repoPath, filePath, backupTimestamp });
}

export async function getGitRoot(repoPath: string): Promise<string> {
  return invoke("get_git_root", { repoPath });
}

export async function readWorkingTreePrefab(
  repoPath: string,
  filePath: string
): Promise<string> {
  return invoke("read_working_tree_prefab", { repoPath, filePath });
}
