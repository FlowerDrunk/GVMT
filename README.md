# GVMT — 通用版本管理工具

GVMT 是一个基于 **Tauri v2 + React + TypeScript** 的桌面 GUI 工具，为 Git 和 SVN 仓库提供统一的可视化管理体验。

## 功能概览

### 仓库管理
- 自动检测本地 Git / SVN 工作副本，支持混合仓库（Git + SVN 共存）
- 仓库添加、删除、刷新、信息更新
- 支持 SVN wc.db 数据库离线检测（无需 SVN 命令行工具）

### 变更管理
- 工作区状态实时刷新（Git status / SVN status）
- 文件变更可视化：新增、修改、删除、重命名、未跟踪、缺失、冲突
- 暂存区操作：暂存全部 / 取消暂存 / 单文件暂存 / 单文件取消暂存
- `.gitignore` 和 SVN `.svnignore` 忽略规则管理

### 提交流程
- 文件选择、提交信息编辑
- SVN 自动 `add` 未跟踪文件
- 提交失败自动重试（out-of-date 时先 update 再提交）
- Git 提交后可选 push

### 更新与同步
- **更新**（Git fetch / SVN update）— 支持流式输出
- **强制更新**（SVN `update --force`）— 自动恢复缺失目录
- **远端检测** — 定时检测 SVN 最新 revision 或 Git 最新 commit hash，弹窗提醒
- 克隆仓库（SVN checkout 流式进度）

### Diff 与日志
- 文件 diff 查看（Git diff / SVN diff）
- 提交历史日志，点击展开查看变更文件列表与完整 diff
- 右键菜单：复制版本号

### 辅助功能
- 质量检查（本地 build / test / cargo check）
- 操作历史记录与详情查看
- GitHub 集成（gh CLI）：PR 列表、Actions 状态、文件浏览
- Windows 右键菜单集成
- 中英文双语界面
- 可自定义主题（CSS 变量 JSON 配置）
- SVN 分支/版本号显示与切换

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | [Tauri v2](https://v2.tauri.app/) |
| 前端 | React 19 + TypeScript + Vite |
| UI 组件 | Radix UI + Tailwind CSS |
| 数据库 | SQLite（rusqlite，bundled） |
| 后端 | Rust |

## 开始使用

### 前置条件
- [Rust](https://www.rust-lang.org/) 工具链
- [Node.js](https://nodejs.org/) 18+
- （可选）Git 命令行工具
- （可选）SVN 命令行工具（SlikSVN 或 TortoiseSVN 含命令行组件）

### 开发运行
```bash
# 安装依赖
npm install

# 启动开发模式
npm run tauri dev
```

### 构建
```bash
npm run tauri build
```

## 项目结构

```
src/                      # React 前端
├── components/
│   ├── dialogs/          # 弹窗组件（提交、设置、忽略等）
│   ├── layout/           # 布局组件（命令栏、活动栏）
│   ├── panels/           # 面板组件（文件树、变更列表、状态摘要）
│   ├── shared/           # 共享组件（Modal、TreeView、Badge）
│   ├── ui/               # 基础 UI 组件（Button、Switch 等）
│   └── workspace/        # 工作区组件（状态栏、通知、操作面板）
├── hooks/                # 自定义 Hooks
├── lib/                  # 工具库（API、i18n、主题、常量）
└── styles.css            # 全局样式

src-tauri/                # Rust 后端
├── src/
│   ├── commands.rs       # Tauri 命令入口
│   ├── git.rs            # Git 操作实现
│   ├── svn.rs            # SVN 操作实现
│   ├── db.rs             # SQLite 数据库操作
│   ├── models.rs         # 数据模型
│   └── lib.rs            # 插件注册
└── Cargo.toml
```

## License

MIT
