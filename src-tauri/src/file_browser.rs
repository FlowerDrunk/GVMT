use crate::models::{
    RepositoryFileEntry, RepositoryFilePreview,
};
use std::{
    fs,
    path::Path,
    time::UNIX_EPOCH,
};

use crate::command_exec::{decode_command_output, os_str_to_string};

pub fn safe_repository_child_path(
    root: &Path,
    relative_path: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    let normalized = relative_path
        .map(normalize_relative_path)
        .transpose()?
        .unwrap_or_default();
    let candidate = if normalized.is_empty() {
        root.clone()
    } else {
        root.join(normalized.replace('/', std::path::MAIN_SEPARATOR_STR))
    };
    let canonical = candidate
        .canonicalize()
        .map_err(|error| error.to_string())?;

    if canonical.starts_with(&root) {
        Ok(canonical)
    } else {
        Err("路径超出仓库范围".to_string())
    }
}

pub fn normalize_relative_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let mut parts = Vec::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains(':') {
            return Err("路径包含不允许的片段".to_string());
        }
        parts.push(part);
    }

    Ok(parts.join("/"))
}

pub fn parent_relative_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }

    path.rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .or_else(|| Some(String::new()))
}

pub fn repository_file_entries(
    directory_path: &Path,
    current_path: &str,
) -> Result<Vec<RepositoryFileEntry>, String> {
    let mut entries = Vec::new();
    for item in fs::read_dir(directory_path).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        let file_name = os_str_to_string(&item.file_name());
        if should_hide_repository_entry(&file_name) {
            continue;
        }

        let metadata = match item.metadata() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let is_directory = metadata.is_dir();
        let entry_path = if current_path.is_empty() {
            file_name.clone()
        } else {
            format!("{current_path}/{file_name}")
        };
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_secs());

        entries.push(RepositoryFileEntry {
            name: file_name,
            path: entry_path,
            entry_type: if is_directory { "directory" } else { "file" }.to_string(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            modified_at,
            children: Vec::new(),
        });
    }

    sort_repository_entries(&mut entries);
    Ok(entries)
}

pub fn repository_file_preview(
    repository_id: i64,
    file_path: &Path,
    relative_path: &str,
) -> Result<RepositoryFilePreview, String> {
    const MAX_PREVIEW_BYTES: usize = 256 * 1024;
    const MAX_PREVIEW_LINES: usize = 1200;

    let metadata = file_path.metadata().map_err(|error| error.to_string())?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs());
    let name = file_path
        .file_name()
        .map(os_str_to_string)
        .unwrap_or_else(|| relative_path.to_string());
    let bytes = fs::read(file_path).map_err(|error| error.to_string())?;

    if bytes.contains(&0) {
        return Ok(RepositoryFilePreview {
            repository_id,
            path: relative_path.to_string(),
            name,
            size: metadata.len(),
            modified_at,
            content: String::new(),
            is_binary: true,
            warning: Some("二进制文件暂不展示内容预览。".to_string()),
        });
    }

    let slice_end = bytes.len().min(MAX_PREVIEW_BYTES);
    let mut content = decode_command_output(&bytes[..slice_end]);
    let mut warning = if bytes.len() > MAX_PREVIEW_BYTES {
        Some("文件较大，仅展示前 256KB 内容。".to_string())
    } else {
        None
    };

    let line_count = content.lines().count();
    if line_count > MAX_PREVIEW_LINES {
        content = content
            .lines()
            .take(MAX_PREVIEW_LINES)
            .collect::<Vec<_>>()
            .join("\n");
        warning = Some(match warning {
            Some(value) => format!("{value} 同时仅展示前 {MAX_PREVIEW_LINES} 行。"),
            None => format!("文件行数较多，仅展示前 {MAX_PREVIEW_LINES} 行。"),
        });
    }

    Ok(RepositoryFilePreview {
        repository_id,
        path: relative_path.to_string(),
        name,
        size: metadata.len(),
        modified_at,
        content,
        is_binary: false,
        warning,
    })
}

pub fn sort_repository_entries(entries: &mut [RepositoryFileEntry]) {
    entries.sort_by(|left, right| {
        let left_is_directory = left.entry_type == "directory";
        let right_is_directory = right.entry_type == "directory";
        right_is_directory
            .cmp(&left_is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
}

pub fn should_hide_repository_entry(name: &str) -> bool {
    matches!(name, ".git" | ".svn")
}

pub fn untracked_file_preview(
    root_path: &str,
    relative_path: &str,
) -> Result<(String, bool, Option<String>), String> {
    const MAX_PREVIEW_BYTES: usize = 160 * 1024;
    const MAX_PREVIEW_LINES: usize = 500;

    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let candidate = root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    let canonical = candidate
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("文件路径超出仓库范围".to_string());
    }

    let bytes = fs::read(&canonical).map_err(|error| error.to_string())?;
    if bytes.contains(&0) {
        return Ok((
            "未跟踪文件疑似为二进制文件，暂不展示内容预览。".to_string(),
            true,
            Some("二进制文件不会展开为文本 diff。".to_string()),
        ));
    }

    let warning = if bytes.len() > MAX_PREVIEW_BYTES {
        Some("文件较大，仅展示前 160KB 内容。".to_string())
    } else {
        None
    };
    let slice_end = bytes.len().min(MAX_PREVIEW_BYTES);
    let text = String::from_utf8_lossy(&bytes[..slice_end]);
    let mut content = format!("--- /dev/null\n+++ b/{relative_path}\n@@\n");
    for line in text.lines().take(MAX_PREVIEW_LINES) {
        content.push('+');
        content.push_str(line);
        content.push('\n');
    }
    if text.lines().count() > MAX_PREVIEW_LINES {
        content.push_str("+... 内容过长，已截断预览\n");
    }

    Ok((content, false, warning))
}
