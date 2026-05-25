use std::process::Command;

use crate::models::{DiffFileInfo, PrefabThreeWay};

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git command failed: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn list_conflict_files(repo_path: String) -> Result<Vec<String>, String> {
    let output = run_git(&repo_path, &["diff", "--name-only", "--diff-filter=U"])?;
    let files: Vec<String> = output
        .lines()
        .filter(|line| line.ends_with(".prefab"))
        .map(|line| line.to_string())
        .collect();
    Ok(files)
}

#[tauri::command]
pub fn get_prefab_three_way(repo_path: String, file_path: String) -> Result<PrefabThreeWay, String> {
    let base = run_git(&repo_path, &["show", &format!(":1:{}", file_path)])?;
    let ours = run_git(&repo_path, &["show", &format!(":2:{}", file_path)])?;
    let theirs = run_git(&repo_path, &["show", &format!(":3:{}", file_path)])?;

    Ok(PrefabThreeWay { base, ours, theirs })
}

#[tauri::command]
pub fn list_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = run_git(&repo_path, &["branch", "-a"])?;
    let branches: Vec<String> = output
        .lines()
        .map(|line| {
            line.trim()
                .trim_start_matches("* ")
                .trim_start_matches("+ ")
                .to_string()
        })
        .filter(|line| !line.is_empty() && line != "origin" && !line.starts_with("HEAD"))
        .collect();
    Ok(branches)
}

#[tauri::command]
pub fn diff_branches(
    repo_path: String,
    left_branch: String,
    right_branch: String,
) -> Result<Vec<DiffFileInfo>, String> {
    let output;
    if left_branch == "__local__" && right_branch == "__local__" {
        return Ok(vec![]);
    } else if left_branch == "__local__" {
        output = run_git(&repo_path, &["diff", "--name-status", &right_branch])?;
    } else if right_branch == "__local__" {
        output = run_git(&repo_path, &["diff", "--name-status", &left_branch])?;
    } else {
        let range = format!("{}..{}", left_branch, right_branch);
        output = run_git(&repo_path, &["diff", "--name-status", &range])?;
    }

    let files: Vec<DiffFileInfo> = output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                return None;
            }
            let status = parts[0].to_string();
            let path = parts[parts.len() - 1].to_string();
            if !path.ends_with(".prefab") {
                return None;
            }
            Some(DiffFileInfo { path, status })
        })
        .collect();

    Ok(files)
}

#[tauri::command]
pub fn get_prefab_from_branch(
    repo_path: String,
    branch: String,
    file_path: String,
) -> Result<String, String> {
    run_git(&repo_path, &["show", &format!("{}:{}", branch, file_path)])
}

#[tauri::command]
pub fn get_git_root(repo_path: String) -> Result<String, String> {
    let root = run_git(&repo_path, &["rev-parse", "--show-toplevel"])?;
    // Convert forward slashes to native path separators for Windows
    let root = std::path::Path::new(&root)
        .to_string_lossy()
        .to_string();
    Ok(root)
}

#[tauri::command]
pub fn read_working_tree_prefab(repo_path: String, file_path: String) -> Result<String, String> {
    let full_path = std::path::Path::new(&repo_path).join(&file_path);
    std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}
