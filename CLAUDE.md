# GVMT — 通用版本管理工具

## 项目是什么
基于 Tauri v2 + React 19 + TypeScript 的桌面 GUI 工具，为 Git 和 SVN 仓库提供统一的可视化管理。前端 Vite 构建 + Radix UI/Tailwind CSS，后端 Rust（模块化），SQLite 持久化仓库记录和操作日志。

核心模型：`Repository`（仓库记录，含 vcs_type/path/remote_url/branch_or_revision）、`ChangeItem`（变更文件，含 path/status/vcsType/staged）、`OperationResult`（操作结果统一结构）。

## 关键约束（改代码前必读）
- Rust 后端模块化在 `src-tauri/src/`，各文件职责明确：`commands.rs` 为 Tauri 命令入口、`git.rs` 和 `svn.rs` 为底层实现、`db.rs` 为 SQLite 操作、`models.rs` 为共享数据结构。不要合并这些文件。
- 前后端通信通过 Tauri `invoke()` 调用，前端 API 封装在 `src/lib/api.ts`，新增命令需同时在 `commands.rs`（实现）、`lib.rs`（注册）、`api.ts`（前端调用）三处添加。
- 变更状态类型 `ChangeStatus` 定义在 `api.ts:30`，SVN 状态映射在 `svn.rs:svn_status_kind()`，修改状态类型时需同时更新 `ChangeBadge.tsx` 的 `changeLabels` 和 `styles.css` 的对应样式。
- CSS 全部在 `src/styles.css`（约 5500 行），使用 CSS 自定义属性做主题切换，不要新增 CSS 文件。
- 前端组件目录约定：`dialogs/`（弹窗）、`layout/`（布局框架）、`panels/`（功能面板）、`shared/`（通用组件）、`ui/`（基础 UI 组件 Radix 封装）、`workspace/`（工作区组件）。
- SVN 操作大量使用 `run_command` / `run_command_args` 调用外部 svn.exe，错误处理需区分：svn.exe 缺失（`is_missing_svn_cli_error`）、工作副本锁定（`is_svn_locked_error`）、文件过期（`is_svn_out_of_date_error`）、树冲突（`is_svn_tree_conflict_error`）。
- 所有 Git 命令输出文件路径的地方必须加 `-c core.quotePath=false`，否则中文文件名会八进制转义。

## 常用命令
- 开发：`npm run dev`（启动完整 Tauri 开发模式）
- 仅前端：`npm run dev`（Vite，端口 1420）
- 类型检查：`npx tsc --noEmit`
- Rust 检查：`cargo check`（在 `src-tauri/` 下）
- 构建：`npm run tauri build`
- E2E 测试：`npm run test:ui`

## 代码规范
- 默认不写注释。只在 WHY 不显而易见时加一行简短注释。
- 前端 UI 字符串直接写中文，通过 i18n 系统（`src/lib/i18n.ts`）支持中英文切换。新增用户可见字符串需同时添加 `zh-CN` 和 `en-US` 翻译。
- Rust 函数使用 `pub fn` 暴露给 `commands.rs`，内部辅助函数保持 `fn`（私有）。
- 错误处理：Rust 端返回 `Result<T, String>`，操作结果使用 `OperationResult` 结构（含 success/summary/output/warning/missingSvnCli 字段）。

## 改完代码后
1. `npx tsc --noEmit`（项目根目录）— TypeScript 类型检查
2. `cargo check`（`src-tauri/` 目录）— Rust 编译检查
3. 如果涉及 UI 变更，`npm run dev` 启动后在浏览器中验证

## 禁止事项
- 不要新增 CSS 文件，所有样式放在 `src/styles.css`。
- 不要把 Rust 代码合并到单一文件，保持 `git.rs` / `svn.rs` / `commands.rs` / `db.rs` 的模块分离。
- 不要在前端直接调用 `invoke()`，通过 `src/lib/api.ts` 封装。
- 不要在 Git 命令中遗漏 `-c core.quotePath=false`（处理中文文件名）。
- 不要破坏 `ChangeStatus` 类型的向后兼容性。

## 专题文档（按需阅读）
- 功能概览：`项目功能概览.html`
- 开发计划：`开发计划.html`
- SVN 实现（约 1200 行）：`src-tauri/src/svn.rs`
- Git 实现（约 600 行）：`src-tauri/src/git.rs`
- Tauri 命令入口：`src-tauri/src/commands.rs`
- i18n 翻译资源：`src/lib/i18n.ts`
