# 提交钩子与质量检查脚本 — 设计说明

## 概述

将评审与质量面板中原有的硬编码质量检查改为用户可编辑的脚本方式，同时新增 pre/post-commit 钩子功能。所有脚本按仓库独立存储于 SQLite，支持 CMD 和 PowerShell。

## 数据库

### 表: `commit_hooks`

每个仓库固定两个槽位（pre-commit / post-commit），提交时由 Rust 端自动执行。

| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| repository_id | INTEGER | NOT NULL |
| hook_type | TEXT | NOT NULL ('pre-commit' / 'post-commit') |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| shell | TEXT | NOT NULL DEFAULT 'cmd' |
| script | TEXT | NOT NULL DEFAULT '' |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP |

UNIQUE(repository_id, hook_type)

### 表: `quality_scripts`

每个仓库可有多条质量检查脚本，用户在面板中手动触发执行。

| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| repository_id | INTEGER | NOT NULL |
| name | TEXT | NOT NULL |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| shell | TEXT | NOT NULL DEFAULT 'cmd' |
| script | TEXT | NOT NULL DEFAULT '' |
| last_status | TEXT | (运行时更新: 'pass' / 'fail' / null) |
| last_duration_ms | INTEGER | (运行时更新) |
| last_output | TEXT | (运行时更新) |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP |

## 后端 (Rust)

### 数据模型 (`models.rs`)

```rust
pub struct CommitHook {
    pub id: i64,
    pub repository_id: i64,
    pub hook_type: String,
    pub enabled: bool,
    pub shell: String,       // "cmd" | "powershell"
    pub script: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct SaveCommitHooksRequest {
    pub repository_id: i64,
    pub hooks: Vec<CommitHookInput>,
}

pub struct CommitHookInput {
    pub hook_type: String,
    pub enabled: bool,
    pub shell: String,
    pub script: String,
}

pub struct QualityScript {
    pub id: i64,
    pub repository_id: i64,
    pub name: String,
    pub enabled: bool,
    pub shell: String,
    pub script: String,
    pub last_status: Option<String>,
    pub last_duration_ms: Option<i64>,
    pub last_output: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct QualityScriptResult {
    pub script_id: i64,
    pub success: bool,
    pub output: String,
    pub duration_ms: i64,
}
```

### 数据库操作 (`db.rs`)

- `get_commit_hooks(repository_id) -> Vec<CommitHook>`
- `save_commit_hooks(repository_id, hooks: &[CommitHookInput])`
- `get_quality_scripts(repository_id) -> Vec<QualityScript>`
- `save_quality_script(script: &QualityScript)`
- `delete_quality_script(id)`
- `update_quality_script_result(id, status, duration_ms, output)`

### 命令 (`commands.rs`)

| 命令 | 功能 |
|------|------|
| `get_commit_hooks(repository_id)` | 获取仓库的提交钩子配置 |
| `save_commit_hooks(repository_id, hooks)` | 保存仓库的提交钩子配置 |
| `get_quality_scripts(repository_id)` | 获取仓库的质量检查脚本列表 |
| `save_quality_script(script)` | 新增/更新质量检查脚本 |
| `delete_quality_script(id)` | 删除质量检查脚本 |
| `run_quality_script(id)` | 手动执行一条质量检查脚本并返回结果 |
| `run_all_quality_scripts(repository_id)` | 执行仓库下所有启用的质量脚本 |

### 钩子执行逻辑（修改 `commit_repository`）

1. 提交前：读取 `hook_type='pre-commit'` 且 `enabled=1` 的记录
2. 脚本写入临时文件（`.bat` 或 `.ps1`）
3. 用对应 shell 执行：`cmd /c <tmpfile>` 或 `powershell -ExecutionPolicy Bypass -File <tmpfile>`
4. 非零退出码 → 中止提交，返回错误（含 stdout/stderr）
5. 正常执行 git/svn commit
6. 提交成功后：执行 `post-commit` 钩子，失败只记录到 operation_log 的 warning 字段，不回滚

### 内置模板（Rust 端定义，前端展示）

| 名称 | Shell | 脚本 | 使用场景 |
|------|-------|------|---------|
| TypeScript 类型检查 | cmd | `npx tsc --noEmit` | 前端项目 |
| Rust 编译检查 | cmd | `cargo check` | Rust 项目 |
| Playwright E2E | cmd | `npx playwright test` | E2E 测试 |
| Prettier 格式检查 | cmd | `npx prettier --check .` | 代码格式 |
| ESLint | cmd | `npx eslint .` | 代码规范 |

### lib.rs

注册 7 个新命令：`get_commit_hooks`, `save_commit_hooks`, `get_quality_scripts`, `save_quality_script`, `delete_quality_script`, `run_quality_script`, `run_all_quality_scripts`

## 前端

### `api.ts` 新增

```typescript
export interface CommitHook {
  id: number;
  repositoryId: number;
  hookType: "pre-commit" | "post-commit";
  enabled: boolean;
  shell: "cmd" | "powershell";
  script: string;
}

export interface QualityScript {
  id: number;
  repositoryId: number;
  name: string;
  enabled: boolean;
  shell: "cmd" | "powershell";
  script: string;
  lastStatus: string | null;
  lastDurationMs: number | null;
  lastOutput: string | null;
}

export const QUALITY_SCRIPT_TEMPLATES = [
  { name: "TypeScript 类型检查", shell: "cmd", script: "npx tsc --noEmit" },
  { name: "Rust 编译检查", shell: "cmd", script: "cargo check" },
  { name: "Playwright E2E", shell: "cmd", script: "npx playwright test" },
  { name: "Prettier 格式检查", shell: "cmd", script: "npx prettier --check ." },
  { name: "ESLint", shell: "cmd", script: "npx eslint ." },
];
```

### `ReviewPane.tsx` 改造

移除原有 hardcoded 质量检查逻辑，替换为两块：

1. **提交钩子区块**：pre-commit / post-commit 各一行，带启用开关、shell 下拉、脚本文本框、保存按钮、"从模板添加"下拉
2. **质量检查脚本区块**：表格列出所有脚本（名称/Shell/状态/操作），顶栏 [+ 新增] 和 [从模板添加 ▼]；每行有运行按钮，点击后显示执行结果（输出 + 耗时）；可编辑、可删除

仓库切换时自动通过 `invoke` 加载对应配置。

### CommitDialog 质量检查摘要移除

删除 `CommitDialog.tsx` 中 `latestQualityResult` prop 及相关 JSX。

### 移除的旧代码

| 文件 | 移除内容 |
|------|---------|
| `src/hooks/useQualityChecks.ts` | 整个文件删除 |
| `src/lib/api.ts` | `QualityCheckType`, `QualityCheckStatus`, `QualityCheckTemplate`, `QualityCheckResult` 类型；`listQualityChecks()`, `runQualityCheck()` 函数 |
| `src-tauri/src/quality.rs` | 整个文件删除 |
| `src-tauri/src/models.rs` | `QualityCheckType`, `QualityCheckDefinition`, `QualityCheckTemplate`, `QualityCheckResult` |
| `src-tauri/src/commands.rs` | `list_quality_checks`, `run_quality_check` 命令 |
| `src-tauri/src/lib.rs` | 移除 `mod quality;` 及命令注册 |
| `src/lib/i18n.ts` | 旧质量检查相关翻译键替换为新键 |

### i18n 新增键

| 键 | zh-CN | en-US |
|----|-------|-------|
| `review.commitHooks` | 提交钩子 | Commit Hooks |
| `review.preCommit` | 提交前 | Pre-commit |
| `review.postCommit` | 提交后 | Post-commit |
| `review.qualityScripts` | 质量检查脚本 | Quality Scripts |
| `review.addScript` | 新增 | Add |
| `review.fromTemplate` | 从模板添加 | From Template |
| `review.run` | 运行 | Run |
| `review.runAll` | 全部运行 | Run All |
| `review.pass` | 通过 | Pass |
| `review.fail` | 失败 | Fail |
| `review.duration` | 耗时 | Duration |
| `review.hookBlocked` | 提交前钩子执行失败 | Pre-commit hook failed |

## 验证

1. `cargo check`（`src-tauri/`）— Rust 编译
2. `npx tsc --noEmit` — TypeScript 类型检查
3. 手动测试：
   - 在评审面板中为某个仓库配置 pre-commit 脚本（如 `echo test`），执行提交，确认钩子被调用
   - 配置会失败的 pre-commit 脚本（如 `exit 1`），确认提交被阻止
   - 配置 post-commit 脚本，确认提交成功后执行
   - 新增质量检查脚本，点击运行，确认结果正确显示
   - 切换仓库，确认配置正确隔离
4. 确认 CommitDialog 中不再显示旧的质量检查摘要
