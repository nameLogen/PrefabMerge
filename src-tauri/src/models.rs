use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug)]
pub struct PrefabThreeWay {
    pub base: String,
    pub ours: String,
    pub theirs: String,
}

#[derive(Serialize, Debug)]
pub struct DiffFileInfo {
    pub path: String,
    pub status: String,
}

#[derive(Serialize, Debug)]
pub struct BackupInfo {
    pub timestamp: String,
    pub path: String,
    pub size: u64,
}

#[derive(Serialize, Debug)]
pub struct WriteResult {
    pub success: bool,
    pub backup_path: String,
    pub backup_timestamp: String,
}

#[derive(Serialize, Debug)]
pub struct PrefabValidationError {
    pub code: String,
    pub message: String,
    pub details: Vec<String>,
}
