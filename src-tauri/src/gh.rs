use crate::command_exec::{run_command, run_command_args, resolve_program};
use serde::{Deserialize, Serialize};

// ── GH Status ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    pub installed: bool,
    pub authenticated: bool,
    pub auth_user: Option<String>,
    pub error: Option<String>,
}

pub fn check_gh_status() -> GhStatus {
    let resolved = resolve_program("gh");
    if !is_gh_available(&resolved) {
        return GhStatus {
            installed: false,
            authenticated: false,
            auth_user: None,
            error: Some("gh CLI 未安装。请从 https://cli.github.com/ 安装。".to_string()),
        };
    }

    match run_command(["gh", "auth", "status"]) {
        Ok(output) => {
            let authenticated = output.contains("Logged in");
            let auth_user = if authenticated {
                // Extract username from output like "Logged in to github.com as <username>"
                output
                    .lines()
                    .find_map(|line| {
                        let idx = line.find("as ")?;
                        let after_as = &line[idx + 3..];
                        let end = after_as.find(|c: char| c.is_whitespace() || c == '.').unwrap_or(after_as.len());
                        Some(after_as[..end].to_string())
                    })
            } else {
                None
            };
            GhStatus {
                installed: true,
                authenticated,
                auth_user,
                error: None,
            }
        }
        Err(error) => GhStatus {
            installed: true,
            authenticated: false,
            auth_user: None,
            error: Some(format!("gh 认证失败: {error}")),
        },
    }
}

fn is_gh_available(_program: &str) -> bool {
    // On Windows, if the resolved program still contains "svn" (no gh.exe found),
    // or if the program is just "gh" (not resolved), let run_command handle it
    run_command(["gh", "--version"]).is_ok()
}

// ── GitHub Repo Info ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhOwnerRepo {
    pub owner: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhRepoInfo {
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub url: String,
    pub default_branch: String,
    pub primary_language: Option<String>,
    pub is_private: bool,
}

impl GhRepoInfo {
    pub fn owner_slash_repo(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }
}

/// Extract owner/repo from a git remote URL.
/// Handles formats:
///   https://github.com/owner/repo.git
///   git@github.com:owner/repo.git
///   git://github.com/owner/repo.git
pub fn parse_owner_repo_from_remote(remote_url: &str) -> Option<(String, String)> {
    let url = remote_url.trim();

    // https://github.com/owner/repo.git
    if let Some(rest) = url.strip_prefix("https://github.com/").or_else(|| url.strip_prefix("http://github.com/")) {
        let rest = rest.strip_suffix(".git").unwrap_or(rest).trim_end_matches('/');
        let parts: Vec<&str> = rest.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1..].join("/")));
        }
    }

    // git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let rest = rest.strip_suffix(".git").unwrap_or(rest).trim_end_matches('/');
        let parts: Vec<&str> = rest.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1..].join("/")));
        }
    }

    // git://github.com/owner/repo.git
    if let Some(rest) = url.strip_prefix("git://github.com/") {
        let rest = rest.strip_suffix(".git").unwrap_or(rest).trim_end_matches('/');
        let parts: Vec<&str> = rest.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1..].join("/")));
        }
    }

    None
}

pub fn get_gh_repo_info(remote_url: &str) -> Result<GhRepoInfo, String> {
    let (owner, repo) = parse_owner_repo_from_remote(remote_url)
        .ok_or_else(|| format!("无法从远端地址解析 owner/repo: {remote_url}"))?;

    let output = run_command_args(
        "gh",
        &[
            "repo".into(),
            "view".into(),
            format!("{owner}/{repo}"),
            "--json".into(),
            "owner,name,description,url,defaultBranchRef,primaryLanguage,isPrivate".into(),
        ],
    )?;

    let json: serde_json::Value =
        serde_json::from_str(&output).map_err(|e| format!("解析 GitHub 仓库信息失败: {e}"))?;

    let owner_login = json["owner"]["login"]
        .as_str()
        .unwrap_or(&owner)
        .to_string();
    let name = json["name"].as_str().unwrap_or(&repo).to_string();
    let description = json["description"].as_str().map(|s| s.to_string());
    let url = json["url"].as_str().unwrap_or("").to_string();
    let default_branch = json["defaultBranchRef"]["name"]
        .as_str()
        .unwrap_or("main")
        .to_string();
    let primary_language = json["primaryLanguage"]["name"]
        .as_str()
        .map(|s| s.to_string());
    let is_private = json["isPrivate"].as_bool().unwrap_or(false);

    Ok(GhRepoInfo {
        owner: owner_login,
        name,
        description,
        url,
        default_branch,
        primary_language,
        is_private,
    })
}

// ── GitHub File Listing ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubEntry {
    pub name: String,
    pub path: String,
    pub entry_type: String, // "file" or "dir"
    pub size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDirectory {
    pub entries: Vec<GitHubEntry>,
}

pub fn gh_list_directory(remote_url: &str, path: &str, reference: Option<&str>) -> Result<GitHubDirectory, String> {
    let (owner, repo) = parse_owner_repo_from_remote(remote_url)
        .ok_or_else(|| format!("无法从远端地址解析 owner/repo: {remote_url}"))?;

    let api_path = if path.is_empty() || path == "/" {
        format!("repos/{owner}/{repo}/contents")
    } else {
        let trimmed = path.trim_start_matches('/');
        format!("repos/{owner}/{repo}/contents/{trimmed}")
    };

    let mut args = vec!["api".into(), api_path];
    if let Some(ref_name) = reference {
        args.push("-f".into());
        args.push(format!("ref={ref_name}"));
    }

    let output = run_command_args("gh", &args)?;
    let entries: Vec<serde_json::Value> = serde_json::from_str(&output)
        .map_err(|error| format!("解析 GitHub 文件列表失败: {error}"))?;

    let gh_entries: Vec<GitHubEntry> = entries
        .iter()
        .map(|entry| GitHubEntry {
            name: entry["name"].as_str().unwrap_or("").to_string(),
            path: entry["path"].as_str().unwrap_or("").to_string(),
            entry_type: match entry["type"].as_str() {
                Some("dir") => "directory".to_string(),
                _ => "file".to_string(),
            },
            size: entry["size"].as_i64(),
        })
        .collect();

    let mut gh_entries = gh_entries;
    sort_github_entries(&mut gh_entries);
    Ok(GitHubDirectory { entries: gh_entries })
}

fn sort_github_entries(entries: &mut [GitHubEntry]) {
    entries.sort_by(|left, right| {
        let left_is_dir = left.entry_type == "directory";
        let right_is_dir = right.entry_type == "directory";
        right_is_dir
            .cmp(&left_is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubFileContent {
    pub name: String,
    pub path: String,
    pub content: String,
    pub size: i64,
    pub is_binary: bool,
}

pub fn gh_read_file(remote_url: &str, path: &str, reference: Option<&str>) -> Result<GitHubFileContent, String> {
    let (owner, repo) = parse_owner_repo_from_remote(remote_url)
        .ok_or_else(|| format!("无法从远端地址解析 owner/repo: {remote_url}"))?;

    let api_path = format!("repos/{owner}/{repo}/contents/{path}");
    let mut args = vec!["api".into(), api_path];
    if let Some(ref_name) = reference {
        args.push("-f".into());
        args.push(format!("ref={ref_name}"));
    }

    let output = run_command_args("gh", &args)?;
    let json: serde_json::Value = serde_json::from_str(&output)
        .map_err(|error| format!("解析 GitHub 文件内容失败: {error}"))?;

    let name = json["name"].as_str().unwrap_or("").to_string();
    let file_path = json["path"].as_str().unwrap_or("").to_string();
    let size = json["size"].as_i64().unwrap_or(0);
    let encoding = json["encoding"].as_str().unwrap_or("");
    let raw_content = json["content"].as_str().unwrap_or("");

    if encoding == "base64" {
        use base64::Engine;
        let engine = base64::engine::general_purpose::STANDARD;
        // GitHub API returns base64 content with \n every 60 chars — strip them
        let clean_content = raw_content.replace(['\n', '\r'], "");
        let decoded = engine
            .decode(&clean_content)
            .map_err(|error| format!("base64 解码失败: {error}"))?;

        let content_str = String::from_utf8_lossy(&decoded).to_string();
        let is_binary = content_str.contains('\0') || content_str.chars().filter(|c| c.is_control() && *c != '\n' && *c != '\r' && *c != '\t').count() > content_str.len() / 20;

        Ok(GitHubFileContent {
            name,
            path: file_path,
            content: content_str,
            size,
            is_binary,
        })
    } else {
        Ok(GitHubFileContent {
            name,
            path: file_path,
            content: raw_content.to_string(),
            size,
            is_binary: false,
        })
    }
}

// ── GitHub PRs ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPr {
    pub number: i64,
    pub title: String,
    pub state: String,
    pub author: Option<String>,
    pub created_at: String,
    pub head_ref: String,
    pub base_ref: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPrList {
    pub prs: Vec<GitHubPr>,
}

pub fn gh_list_prs(remote_url: &str, state: Option<&str>) -> Result<GitHubPrList, String> {
    let (owner, repo) = parse_owner_repo_from_remote(remote_url)
        .ok_or_else(|| format!("无法从远端地址解析 owner/repo: {remote_url}"))?;

    let mut args = vec![
        "pr".into(),
        "list".into(),
        "--json".into(),
        "number,title,state,author,createdAt,headRefName,baseRefName,url".into(),
        "--repo".into(),
        format!("{owner}/{repo}"),
    ];
    if let Some(s) = state {
        args.push("-s".into());
        args.push(s.into());
    }

    let output = run_command_args("gh", &args)?;
    let prs: Vec<GitHubPr> = serde_json::from_str(&output)
        .map_err(|error| format!("解析 PR 列表失败: {error}"))?;

    Ok(GitHubPrList { prs })
}

// ── GitHub Actions Runs ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRun {
    pub name: String,
    pub head_branch: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub created_at: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRunList {
    pub runs: Vec<GitHubRun>,
}

pub fn gh_list_actions(remote_url: &str) -> Result<GitHubRunList, String> {
    let (owner, repo) = parse_owner_repo_from_remote(remote_url)
        .ok_or_else(|| format!("无法从远端地址解析 owner/repo: {remote_url}"))?;

    let output = run_command_args(
        "gh",
        &[
            "run".into(),
            "list".into(),
            "--json".into(),
            "name,headBranch,status,conclusion,createdAt,url".into(),
            "--repo".into(),
            format!("{owner}/{repo}"),
            "--limit".into(),
            "10".into(),
        ],
    )?;

    let runs: Vec<GitHubRun> = serde_json::from_str(&output)
        .map_err(|error| format!("解析 Actions 列表失败: {error}"))?;

    Ok(GitHubRunList { runs })
}

// ── Open in Browser ─────────────────────────────────────────────────────

pub fn gh_open_browser(remote_url: &str, page: &str) -> Result<(), String> {
    let (owner, repo) = parse_owner_repo_from_remote(remote_url)
        .ok_or_else(|| format!("无法从远端地址解析 owner/repo: {remote_url}"))?;

    let target = match page {
        "repo" => format!("{owner}/{repo}"),
        "prs" => format!("{owner}/{repo}/pulls"),
        "actions" => format!("{owner}/{repo}/actions"),
        _ => format!("{owner}/{repo}"),
    };

    run_command_args("gh", &["repo".into(), "view".into(), target, "--web".into()])
        .map(|_| ())
}
