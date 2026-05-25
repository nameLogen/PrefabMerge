mod commands;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::git::list_conflict_files,
            commands::git::get_prefab_three_way,
            commands::git::list_branches,
            commands::git::diff_branches,
            commands::git::get_prefab_from_branch,
            commands::git::get_git_root,
            commands::git::read_working_tree_prefab,
            commands::prefab::write_prefab,
            commands::prefab::list_backups,
            commands::prefab::restore_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
