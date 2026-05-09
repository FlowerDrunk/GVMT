# 第二阶段功能开发计划

> 基于当前代码库（35 commits）的完成度分析，列出第二阶段未完成功能的实现计划。
> 当前代码库已覆盖阶段 0（Git/SVN 基础闭环）和阶段 1（项目骨架），以及阶段 2-4 的大部分内容。

---

## 优先级排序

| 优先级 | 功能 | 预估工期（1人+Codex） | 说明 |
|--------|------|----------------------|------|
| P0 | PR 创建 GUI 入口 | 0.5 天 | 投入最小、价值最高 |
| P0 | 命令行 `--gvmt-commit` |  Favorite 天 | 补齐 CLI 入口 |
| P1 | 质量模板 CRUD + 启用/禁用 | 1.5 天 | 已有框架，自然扩展 |
| P1 | 质量检查阻止提交 | 0.5 天 | 利用已有框架 |
| P2 | ReviewTask 数据模型 + 本地评审 | 2 天 | 为团队协作铺路 |
| P3 | SVN 线上评审 Provider | 3 天 | 依赖 P2 |
| P3 | 团队级配置 | 2 天 | 依赖 P1、P2 |

---

## P0：PR 创建 GUI 入口

### 现状

- Rust 侧 `gh.rs` 已有：`gh_list_prs()`、`gh_list_actions()`、`gh_open_browser()`
- 前端 `GitHubPanel.tsx` 已有：展示仓库信息、PR 列表、Actions 列表
- **缺失**：`gh pr create` 命令封装、前端创建 PR 的按钮和表单

### 实现方案

**Rust 侧** — `src-tauri/src/gh.rs` 新增：

```rust
#[derive(Debug, Serialize)]
pub struct GhCreatePrInput {
    pub title: String,
    pub body: String,
    pub head: String,       // 源分支
    pub base: String,       // 目标分支
}

pub fn gh_create_pr(remote_url: &str, input: &GhCreatePrInput) -> Result<GitHubPr, String> { ... }
```

调用 `gh pr create --repo owner/repo --title "..." --body "..." --head branch --base branch --json number,title,state,url`。

**前端侧** — 在 `GitHubPanel.tsx` 新增：

- `"创建 PR"` 按钮（仅在当前分支有远端对应分支且不是默认分支时显示）
- 弹窗表单：标题、描述、源分支（自动填入当前分支）、目标分支（自动填入 default branch）

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src-tauri/src/gh.rs` | 新增 `gh_create_pr()` |
| `src-tauri/src/commands.rs` | 新增 `create_pr` Tauri 命令 |
| `src-tauri/src/lib.rs` | 注册 `create_pr` |
| `src/lib/api.ts` | 新增 `GhCreatePrInput` 接口、`createPr()` 函数 |
| `src/components/workspace/GitHubPanel.tsx` | 新增创建 PR 按钮和弹窗表单 |
| `src/lib/i18n.ts` | 新增相关文案 key |

---

## P0：命令行 `--gvmt-commit`

### 现状

- `startup.rs` 已有 CLI 入口框架：`exec_cli_*` 模式、`--json` 输出
- 已有 `commit_repository` Tauri 命令
- **缺失**：纯 CLI 方式的 `--gvmt-commit <路径>` 执行

### 实现方案

在 `startup.rs` 新增 `exec_cli_commit()`：

1. 检测仓库类型
2. 获取当前变更（git status / svn status）
3. 若无变更 → 输出提示并退出
4. 若有变更 → 整体 stage + commit（默认使用 `[GVMT] Auto commit` 作为提交信息，允许 `--message` 参数覆盖）
5. Git 支持 `--no-push` 跳过推送

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src-tauri/src/startup.rs` | 新增 `exec_cli_commit()`、注册 `--gvmt-commit` 参数解析 |

---

## P1：质量模板 CRUD + 启用/禁用

### 现状

- `quality.rs` 只有 3 个硬编码模板（TypeScriptBuild / PlaywrightUi / CargoCheck）
- 无 `quality_check_templates` 表
- 无用户增删改查能力
- **需保持** 内置模板依然可用

### 实现方案

**数据模型** — `src-tauri/src/models.rs` 新增 / 扩展：

当前 `QualityCheckTemplate` 是只读的 derive。需要新增质量模板 CRUD 的数据结构。

**数据库** — `db.rs` 新增表：

```sql
CREATE TABLE IF NOT EXISTS quality_check_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    language TEXT NOT NULL,         -- 语言/技术栈标识
    check_type TEXT NOT NULL,       -- format / lint / test / build / custom
    command TEXT NOT NULL,          -- 执行命令
    program TEXT NOT NULL DEFAULT '',
    args TEXT NOT NULL DEFAULT '[]', -- JSON 数组
    cwd TEXT,                      -- 工作目录（相对仓库根）
    enabled INTEGER NOT NULL DEFAULT 0,
    scope TEXT NOT NULL DEFAULT 'global',  -- global / team / repository
    editable INTEGER NOT NULL DEFAULT 1,
    builtin INTEGER NOT NULL DEFAULT 0,    -- 是否是内置模板
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Rust 侧** — 新增 `quality.rs` 和 `commands.rs` 中的 CRUD 命令：
- `list_quality_templates()` — 列出指定仓库的模板（内置 + 自定义）
- `create_quality_template()` — 创建自定义模板
- `update_quality_template()` — 更新模板
- `delete_quality_template()` — 删除模板（不可删除内置模板）
- `toggle_quality_template()` — 启用/禁用

**前端侧** — 在 `ReviewPane.tsx` 或设置面板新增：
- 模板列表（区分内置 / 自定义）
- 启用/禁用开关（每个模板独立）
- "新增模板" 表单 + "编辑模板" 弹窗 + "删除模板" 确认

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src-tauri/src/models.rs` | 新增模板 CRUD 相关数据结构 |
| `src-tauri/src/db.rs` | 新增 `quality_check_templates` 表迁移 |
| `src-tauri/src/quality.rs` | 新增 CRUD 实现函数 |
| `src-tauri/src/commands.rs` | 新增 CRUD Tauri 命令 |
| `src-tauri/src/lib.rs` | 注册新命令 |
| `src/lib/api.ts` | 新增前端接口 |
| `src/components/panels/ReviewPane.tsx` | 扩展模板管理 UI |
| `src/lib/i18n.ts` | 新增文案 key |

---

## P1：质量检查阻止提交

### 现状

- `CommitDialog.tsx` 中已有 `latestQualityResult` prop
- 但提交逻辑 `handleCommitRepository()` 在 `App.tsx` 中没有检查质量结果

### 实现方案

在 `App.tsx` 的 `handleCommitRepository()` 中增加检查：

```typescript
// 如果质量检查已运行且失败，阻止提交并提示
if (settings.blockCommitOnQualityFail && qualityChecks.latestResult && !qualityChecks.latestResult.success) {
  setStatus("质量检查未通过，已阻止提交。请在提交前修复问题或通过设置关闭质量门禁。");
  commit.setIsCommitLoading(false);
  return;
}
```

在 `SettingsDialog.tsx` 中新增开关：`"blockCommitOnQualityFail"`（默认关闭）。

在 `CommitDialog.tsx` 中展示质量检查状态提示条（通过/未运行/失败）。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/App.tsx` | 提交前检查质量结果 |
| `src/components/dialogs/SettingsDialog.tsx` | 新增"质量检查失败阻止提交"开关 |
| `src/components/dialogs/CommitDialog.tsx` | 展示质量检查状态提示 |
| `src/hooks/useSettings.ts` | 新增 `blockCommitOnQualityFail` 设置项 |
| `src/lib/i18n.ts` | 新增文案 key |

---

## P2：ReviewTask 数据模型 + 本地评审

### 现状

- ReviewTask、ReviewComment 数据结构在 `CLAUDE.md` 中定义了但未在任何代码中实现
- ReviewPane 目前只展示质量检查，没有评审功能
- 无 SQLite 表存储评审

### 实现方案

**数据模型** — `src-tauri/src/models.rs` 新增：

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewTask {
    pub id: i64,
    pub repository_id: i64,
    pub title: String,
    pub source_ref: String,        // 来源分支 / revision
    pub target_ref: String,
    pub status: String,            // draft / open / approved / changes_requested / merged / closed
    pub reviewers: Vec<String>,    // JSON array
    pub checks_status: String,     // quality_pending / quality_passed / quality_failed
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: i64,
    pub review_task_id: i64,
    pub file_path: String,
    pub line_number: Option<i64>,
    pub body: String,
    pub author: String,
    pub status: String,            // open / resolved
    pub created_at: String,
}
```

**数据库** — `db.rs` 新增表：

```sql
CREATE TABLE IF NOT EXISTS review_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    target_ref TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    reviewers TEXT NOT NULL DEFAULT '[]',  -- JSON array
    checks_status TEXT NOT NULL DEFAULT 'quality_pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repository_id) REFERENCES repositories(id)
);

CREATE TABLE IF NOT EXISTS review_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_task_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    body TEXT NOT NULL,
    author TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (review_task_id) REFERENCES review_tasks(id)
);
```

**Rust 侧** — 新增 `review.rs` 模块和 `commands.rs` 中的：
- `create_review_task()` — 从当前变更或分支创建评审
- `list_review_tasks()` — 列表
- `get_review_task()` — 详情
- `update_review_task_status()` — 更新状态
- `add_review_comment()` — 添加行级评论
- `list_review_comments()` — 查看评论
- `resolve_review_comment()` — 标记已解决

**前端侧** — 扩展 `ReviewPane.tsx`：
- 评审任务列表（选项卡：待评审 / 已通过 / 需修改 / 已合并）
- 创建评审 — 从当前变更集创建（自动填充 title、source/target ref）
- 评审详情视图 — 显示变更摘要、文件列表
- 在 diff 弹窗 `CodeBlock.tsx` 中集成行级评论 UI

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src-tauri/src/models.rs` | 新增 ReviewTask、ReviewComment |
| `src-tauri/src/db.rs` | 新增 review_tasks、review_comments 表 |
| `src-tauri/src/review.rs` | 新建模块，评审业务逻辑 |
| `src-tauri/src/commands.rs` | 新增评审相关 Tauri 命令 |
| `src-tauri/src/lib.rs` | 注册 review 模块和命令 |
| `src/lib/api.ts` | 新增前端接口 |
| `src/lib/i18n.ts` | 新增文案 |
| `src/components/panels/ReviewPane.tsx` | 扩展评审 UI |
| `src/components/shared/CodeBlock.tsx` | 集成行级评论 |

---

## P3：SVN 线上评审 Provider

### 实现方案

采用 CLAUDE.md 推荐的 **SVN 专用评审目录方案**。

**新模块** — `src-tauri/src/review_svn.rs`：

1. `get_review_dir_path(svn_url) -> String` — 确定仓库中 `/_reviews/` 路径
2. `list_review_tasks_svn(url) -> Vec<SvnReviewMeta>` — 从 `/_reviews/open/` 读取评审任务列表
3. `create_review_task_svn(url, metadata)` — 在 `/_reviews/open/review-{date}-{seq}/` 创建：
   - `metadata.json` — 标题、作者、评审人、来源、目标、状态
   - `changes.diff` — 变更快照
   - `comments.json` — 空评论数组
   - `checks.json` — 空质量检查结果
4. `add_comment_svn(url, review_id, comment)` — 追加评论文件或更新 `comments.json`
5. `update_review_status_svn(url, review_id, status)` — 移动评审从 open 到 closed 或更新状态
6. `sync_review_dir(url)` — 操作前调用 `svn update`

**冲突处理**：
- 写前先 `svn update _reviews`
- 评论文件按时间戳命名，避免多人同时编辑 `comments.json`
- 状态变更使用乐观锁（检查 metadata 中的 revision 是否匹配）

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src-tauri/src/review_svn.rs` | 新建模块 |
| `src-tauri/src/commands.rs` | 新增 SVN 评审 Tauri 命令 |
| `src-tauri/src/lib.rs` | 注册 review_svn 模块和命令 |
| `src/lib/api.ts` | 新增接口 |

---

## P3：团队级配置

### 实现方案

采用 **"本地 SQLite + 可选仓库同步"混合方案**。

**数据模型** — `models.rs`：

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct TeamConfig {
    pub id: i64,
    pub name: String,
    pub repositories: Vec<i64>,        // repo id 列表
    pub review_required: bool,
    pub required_approvals: i64,
    pub quality_gate_enabled: bool,
    pub enabled_quality_checks: Vec<String>,  // check_type 列表
    pub review_storage_type: String,   // "github" / "svn_review_dir" / "external_service"
    pub review_storage_location: Option<String>,
    pub updated_at: String,
}
```

**数据库** — `db.rs` 新增表：

```sql
CREATE TABLE IF NOT EXISTS team_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    repositories TEXT NOT NULL DEFAULT '[]',     -- JSON array of repo ids
    review_required INTEGER NOT NULL DEFAULT 0,
    required_approvals INTEGER NOT NULL DEFAULT 1,
    quality_gate_enabled INTEGER NOT NULL DEFAULT 0,
    enabled_quality_checks TEXT NOT NULL DEFAULT '[]',  -- JSON array
    review_storage_type TEXT NOT NULL DEFAULT 'github',
    review_storage_location TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**前端侧** — 新设团队设置页面或嵌入 `SettingsDialog.tsx`：
- 团队名称
- 关联仓库多选
- 是否强制评审 + 需要通过人数
- 质量门禁开关 + 选择启用哪些检查
- 评审存储方式选择（GitHub / SVN 目录 / 外部服务）

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src-tauri/src/models.rs` | 新增 TeamConfig |
| `src-tauri/src/db.rs` | 新增 team_configs 表 |
| `src-tauri/src/commands.rs` | 新增 CRUD Tauri 命令 |
| `src-tauri/src/lib.rs` | 注册新命令 |
| `src/lib/api.ts` | 新增接口 |
| `src/components/dialogs/SettingsDialog.tsx` | 嵌入团队配置面板 |
| `src/lib/i18n.ts` | 新增文案 |

---

## 附录：完整文件改动清单

| 文件 | P0-PR | P0-CLI | P1-模板 | P1-阻止 | P2-评审 | P3-SVN评审 | P3-团队 |
|------|:-----:|:------:|:--------:|:--------:|:--------:|:-----------:|:--------:|
| `src-tauri/src/gh.rs` | ✅ | | | | | | |
| `src-tauri/src/review.rs` | | | | | **新建** | | |
| `src-tauri/src/review_svn.rs` | | | | | | **新建** | |
| `src-tauri/src/quality.rs` | | | ✅ | | | | |
| `src-tauri/src/startup.rs` | | ✅ | | | | | |
| `src-tauri/src/models.rs` | | | ✅ | | ✅ | | ✅ |
| `src-tauri/src/db.rs` | | | ✅ | | ✅ | | ✅ |
| `src-tauri/src/commands.rs` | ✅ | | ✅ | | ✅ | ✅ | ✅ |
| `src-tauri/src/lib.rs` | ✅ | | ✅ | | ✅ | ✅ | ✅ |
| `src/lib/api.ts` | ✅ | | ✅ | | ✅ | ✅ | ✅ |
| `src/App.tsx` | | | | ✅ | | | |
| `src/components/...GitHubPanel.tsx` | ✅ | | | | | | |
| `src/components/...ReviewPane.tsx` | | | ✅ | | ✅ | | |
| `src/components/...CommitDialog.tsx` | | | | ✅ | | | |
| `src/components/...SettingsDialog.tsx` | | | | ✅ | | | ✅ |
| `src/components/...CodeBlock.tsx` | | | | | ✅ | | |
| `src/hooks/useSettings.ts` | | | | ✅ | | | |
| `src/lib/i18n.ts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
