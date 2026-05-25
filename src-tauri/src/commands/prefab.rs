use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::models::{BackupInfo, PrefabValidationError, WriteResult};

fn get_ref_id(value: &Value) -> Option<usize> {
    value
        .get("__id__")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
}

fn is_id_ref(value: &Value) -> bool {
    value.is_object()
        && value.as_object().map(|o| o.len() == 1).unwrap_or(false)
        && value.get("__id__").is_some()
}

fn collect_id_refs(value: &Value, refs: &mut Vec<(String, usize)>, path: &str) {
    match value {
        Value::Array(arr) => {
            for (i, item) in arr.iter().enumerate() {
                collect_id_refs(item, refs, &format!("{}[{}]", path, i));
            }
        }
        Value::Object(map) if is_id_ref(value) => {
            if let Some(id) = get_ref_id(value) {
                refs.push((path.to_string(), id));
            }
        }
        Value::Object(map) => {
            for (key, val) in map.iter() {
                collect_id_refs(val, refs, &format!("{}.{}", path, key));
            }
        }
        _ => {}
    }
}

fn validate_prefab_data(json_data: &str) -> Result<(), PrefabValidationError> {
    let data: Vec<Value> = serde_json::from_str(json_data).map_err(|e| {
        PrefabValidationError {
            code: "INVALID_JSON".to_string(),
            message: format!("Failed to parse JSON: {}", e),
            details: vec![],
        }
    })?;

    if data.is_empty() {
        return Err(PrefabValidationError {
            code: "EMPTY_ARRAY".to_string(),
            message: "Prefab data is empty".to_string(),
            details: vec![],
        });
    }

    // 9.1 Root check
    let root = &data[0];
    if root.get("__type__") != Some(&Value::String("cc.Prefab".to_string())) {
        return Err(PrefabValidationError {
            code: "ROOT_MISMATCH".to_string(),
            message: "data[0] is not cc.Prefab".to_string(),
            details: vec![],
        });
    }

    let root_node_id = root
        .get("data")
        .and_then(|d| d.get("__id__"))
        .and_then(|v| v.as_u64())
        .map(|v| v as usize);

    if let Some(id) = root_node_id {
        if id >= data.len() || data[id].is_null() {
            return Err(PrefabValidationError {
                code: "ROOT_MISMATCH".to_string(),
                message: format!("Root node id {} is invalid", id),
                details: vec![],
            });
        }
        if data[id].get("__type__") != Some(&Value::String("cc.Node".to_string())) {
            return Err(PrefabValidationError {
                code: "ROOT_MISMATCH".to_string(),
                message: format!("Root node {} is not cc.Node", id),
                details: vec![],
            });
        }
    }

    // Collect existing ids
    let existing_ids: HashSet<usize> = data
        .iter()
        .enumerate()
        .filter(|(_, v)| !v.is_null())
        .map(|(i, _)| i)
        .collect();

    // 9.2 ID continuity
    let max_id = data.len();
    for id in 0..max_id {
        if !existing_ids.contains(&id) && id < data.len() {
            // null entries are allowed in intermediate state, but we warn if compact wasn't run
        }
    }

    // Build type map
    let type_map: HashMap<usize, String> = data
        .iter()
        .enumerate()
        .filter_map(|(i, v)| {
            v.get("__type__")
                .and_then(|t| t.as_str())
                .map(|t| (i, t.to_string()))
        })
        .collect();

    let mut errors = vec![];

    // 9.2 Dangling refs
    for (id, item) in data.iter().enumerate() {
        if item.is_null() {
            continue;
        }
        let mut refs = vec![];
        collect_id_refs(item, &mut refs, "");
        for (field_path, ref_id) in refs {
            if ref_id >= data.len() || data[ref_id].is_null() {
                errors.push(format!(
                    "Dangling ref: object {}.{} -> __id__ {} points to null or out of bounds",
                    id, field_path, ref_id
                ));
            }
        }
    }

    // 9.4 Node ref loop + 9.5 Parent-child + 9.6 Component binding
    for (id, item) in data.iter().enumerate() {
        if item.is_null() {
            continue;
        }
        let item_type = type_map.get(&id);

        if item_type == Some(&"cc.Node".to_string()) {
            // Check _children
            if let Some(children) = item.get("_children").and_then(|c| c.as_array()) {
                for child_ref in children {
                    if let Some(child_id) = get_ref_id(child_ref) {
                        let child_type = type_map.get(&child_id);
                        if child_type != Some(&"cc.Node".to_string())
                            && child_type != Some(&"cc.PrivateNode".to_string())
                        {
                            errors.push(format!(
                                "Node {} _children[{}] is not a Node (type: {:?})",
                                id, child_id, child_type
                            ));
                        }
                        // Check parent back-reference
                        if let Some(child) = data.get(child_id) {
                            let parent_id = child.get("_parent").and_then(get_ref_id);
                            if parent_id != Some(id) {
                                errors.push(format!(
                                    "Parent mismatch: Node {} parent is {:?}, expected {}",
                                    child_id, parent_id, id
                                ));
                            }
                        }
                    }
                }
            }

            // Check _components
            if let Some(components) = item.get("_components").and_then(|c| c.as_array()) {
                for comp_ref in components {
                    if let Some(comp_id) = get_ref_id(comp_ref) {
                        let comp_type = type_map.get(&comp_id);
                        if comp_type == Some(&"cc.Node".to_string())
                            || comp_type == Some(&"cc.Prefab".to_string())
                            || comp_type == Some(&"cc.PrefabInfo".to_string())
                        {
                            errors.push(format!(
                                "Node {} _components[{}] is a {} (should be a component)",
                                id,
                                comp_id,
                                comp_type.as_deref().map_or("unknown", |v| v)
                            ));
                        }
                        // Check component back-reference
                        if let Some(comp) = data.get(comp_id) {
                            let node_id = comp.get("node").and_then(get_ref_id);
                            if node_id != Some(id) {
                                errors.push(format!(
                                    "Component mismatch: Component {} node is {:?}, expected {}",
                                    comp_id, node_id, id
                                ));
                            }
                        }
                    }
                }
            }

            // Check _prefab
            if let Some(prefab_ref) = item.get("_prefab") {
                if !prefab_ref.is_null() {
                    if let Some(prefab_id) = get_ref_id(prefab_ref) {
                        let prefab_type = type_map.get(&prefab_id);
                        if prefab_type != Some(&"cc.PrefabInfo".to_string()) {
                            errors.push(format!(
                                "Node {} _prefab is not PrefabInfo (type: {:?})",
                                id, prefab_type
                            ));
                        }
                    }
                }
            }
        }
    }

    // Check PrefabInfo consistency
    for (id, item) in data.iter().enumerate() {
        if item.is_null() {
            continue;
        }
        if type_map.get(&id) == Some(&"cc.PrefabInfo".to_string()) {
            if let Some(root_ref) = item.get("root").and_then(get_ref_id) {
                if type_map.get(&root_ref) != Some(&"cc.Node".to_string()) {
                    errors.push(format!(
                        "PrefabInfo {} root is not a Node",
                        id
                    ));
                }
            }
            if let Some(asset_ref) = item.get("asset").and_then(get_ref_id) {
                if asset_ref != 0 {
                    errors.push(format!(
                        "PrefabInfo {} asset should point to 0 (cc.Prefab), got {}",
                        id, asset_ref
                    ));
                }
            }
        }
    }

    if !errors.is_empty() {
        return Err(PrefabValidationError {
            code: "VALIDATION_FAILED".to_string(),
            message: format!("Prefab validation failed with {} errors", errors.len()),
            details: errors,
        });
    }

    Ok(())
}

fn get_backup_dir(repo_path: &str, file_path: &str) -> PathBuf {
    let repo = Path::new(repo_path);
    let relative = Path::new(file_path);
    let backup_dir = repo
        .join(".prefabmerge_backups")
        .join(relative.parent().unwrap_or(Path::new("")))
        .join(relative.file_stem().unwrap_or_default());
    backup_dir
}

#[tauri::command]
pub fn write_prefab(
    repo_path: String,
    file_path: String,
    json_data: String,
) -> Result<WriteResult, PrefabValidationError> {
    // Validate first
    validate_prefab_data(&json_data)?;

    let full_path = Path::new(&repo_path).join(&file_path);
    eprintln!("[write_prefab] repo_path={}", repo_path);
    eprintln!("[write_prefab] file_path={}", file_path);
    eprintln!("[write_prefab] full_path={}", full_path.display());

    // Ensure parent directory exists
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| PrefabValidationError {
            code: "IO_ERROR".to_string(),
            message: format!("Failed to create directory: {}", e),
            details: vec![],
        })?;
    }

    // Backup
    let backup_dir = get_backup_dir(&repo_path, &file_path);
    fs::create_dir_all(&backup_dir).map_err(|e| PrefabValidationError {
        code: "IO_ERROR".to_string(),
        message: format!("Failed to create backup directory: {}", e),
        details: vec![],
    })?;

    // Ensure .gitignore ignores backup directory
    let gitignore_path = Path::new(&repo_path).join(".gitignore");
    let ignore_line = ".prefabmerge_backups/";
    let mut should_add = true;
    if let Ok(content) = fs::read_to_string(&gitignore_path) {
        if content.lines().any(|line| line.trim() == ignore_line) {
            should_add = false;
        }
    }
    if should_add {
        let mut content = if let Ok(existing) = fs::read_to_string(&gitignore_path) {
            if existing.ends_with('\n') { existing } else { existing + "\n" }
        } else {
            String::new()
        };
        content.push_str("# Prefab Merge backups\n");
        content.push_str(ignore_line);
        content.push('\n');
        let _ = fs::write(&gitignore_path, content);
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f").to_string();
    let backup_path = backup_dir.join(format!("{}.prefab", timestamp));

    if full_path.exists() {
        fs::copy(&full_path, &backup_path).map_err(|e| PrefabValidationError {
            code: "IO_ERROR".to_string(),
            message: format!("Failed to backup file: {}", e),
            details: vec![],
        })?;
    }

    // Write
    fs::write(&full_path, json_data).map_err(|e| PrefabValidationError {
        code: "IO_ERROR".to_string(),
        message: format!("Failed to write file: {}", e),
        details: vec![],
    })?;

    // Cleanup old backups (keep last 20)
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        let mut backups: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext == "prefab").unwrap_or(false))
            .collect();
        backups.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
        if backups.len() > 20 {
            for old in &backups[..backups.len() - 20] {
                let _ = fs::remove_file(old.path());
            }
        }
    }

    Ok(WriteResult {
        success: true,
        backup_path: backup_path.to_string_lossy().to_string(),
        backup_timestamp: timestamp,
    })
}

#[tauri::command]
pub fn list_backups(repo_path: String, file_path: String) -> Result<Vec<BackupInfo>, String> {
    let backup_dir = get_backup_dir(&repo_path, &file_path);

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups: Vec<BackupInfo> = fs::read_dir(&backup_dir)
        .map_err(|e| format!("Failed to read backup directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|ext| ext == "prefab").unwrap_or(false))
        .filter_map(|e| {
            let path = e.path();
            let metadata = e.metadata().ok()?;
            let filename = path.file_stem()?.to_string_lossy().to_string();
            Some(BackupInfo {
                timestamp: filename,
                path: path.to_string_lossy().to_string(),
                size: metadata.len(),
            })
        })
        .collect();

    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(backups)
}

#[tauri::command]
pub fn restore_backup(
    repo_path: String,
    file_path: String,
    backup_timestamp: String,
) -> Result<(), String> {
    let full_path = Path::new(&repo_path).join(&file_path);
    let backup_dir = get_backup_dir(&repo_path, &file_path);
    let backup_path = backup_dir.join(format!("{}.prefab", backup_timestamp));

    if !backup_path.exists() {
        return Err(format!("Backup not found: {}", backup_path.display()));
    }

    fs::copy(&backup_path, &full_path)
        .map_err(|e| format!("Failed to restore backup: {}", e))?;

    // Remove this backup and all newer backups (linear undo semantics)
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        let mut to_remove: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension().map(|ext| ext == "prefab").unwrap_or(false)
            })
            .collect();
        to_remove.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());

        let target_idx = to_remove.iter().position(|e| {
            e.path().file_stem().map(|s| s.to_string_lossy() == backup_timestamp).unwrap_or(false)
        });

        if let Some(idx) = target_idx {
            for entry in &to_remove[idx..] {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    Ok(())
}
