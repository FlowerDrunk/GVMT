export type AppLanguage = "zh-CN" | "en-US";

export type TranslationKey =
  | "activity.aria"
  | "activity.repositories"
  | "activity.files"
  | "activity.changes"
  | "activity.review"
  | "activity.settings"
  | "activity.light"
  | "activity.dark"
  | "activity.system"
  | "activity.ready"
  | "activity.busy"
  | "activity.openRepositories"
  | "activity.closeRepositories"
  | "activity.openFiles"
  | "activity.closeFiles"
  | "activity.openChanges"
  | "activity.closeChanges"
  | "activity.openReview"
  | "activity.closeReview"
  | "command.selectRepository"
  | "command.changes"
  | "command.redetect"
  | "command.refreshStatus"
  | "command.commit"
  | "command.ignore"
  | "command.update"
  | "command.fetch"
  | "command.stash"
  | "command.stashPush"
  | "command.stashPop"
  | "command.stashEmpty"
  | "command.stashDrop"
  | "command.log"
  | "command.logTitle"
  | "command.logEmpty"
  | "command.logLoading"
  | "command.cleanup"
  | "command.refreshRepo"
  | "settings.eyebrow"
  | "settings.title"
  | "settings.language"
  | "settings.languageHelp"
  | "settings.languageField"
  | "settings.autoRefresh"
  | "settings.autoRefreshHelp"
  | "settings.enableAutoRefresh"
  | "settings.refreshInterval"
  | "settings.seconds"
  | "settings.changeList"
  | "settings.changeListHelp"
  | "settings.defaultView"
  | "settings.flatView"
  | "settings.treeView"
  | "settings.done"
  | "settings.svnDepth"
  | "settings.svnDepthHelp"
  | "settings.remoteCheck"
  | "settings.remoteCheckHelp"
  | "settings.enableRemoteCheck"
  | "settings.remoteCheckInterval"
  | "settings.remoteCheckOff"
  | "settings.remoteCheck1h"
  | "settings.remoteCheck2h"
  | "settings.remoteCheck4h"
  | "settings.svnDepthInfinity"
  | "settings.svnDepthImmediates"
  | "settings.svnDepthFiles"
  | "settings.svnDepthEmpty"
  // StatusPanel
  | "status.workspaceStatus"
  | "status.refresh"
  | "status.totalChanges"
  | "status.added"
  | "status.modified"
  | "status.untracked"
  | "status.clean"
  | "status.noChanges"
  | "status.notRefreshed"
  | "status.notRefreshedDesc"
  | "status.downloadTortoise"
  | "status.downloadSlikSvn"
  | "status.showAll"
  | "status.showLess"
  // CommitDialog
  | "commit.title"
  | "commit.selectedFiles"
  | "commit.committable"
  | "commit.pushAfterCommit"
  | "commit.on"
  | "commit.off"
  | "commit.qualityCheck"
  | "commit.notRun"
  | "commit.notRunDesc"
  | "commit.selectAll"
  | "commit.deselectAll"
  | "commit.message"
  | "commit.placeholder"
  | "commit.cancel"
  | "commit.submit"
  | "commit.submitting"
  // ExplorerPane
  | "explorer.title"
  | "explorer.openRepo"
  | "explorer.detect"
  | "explorer.add"
  | "explorer.tauriOnly"
  | "explorer.repositories"
  | "explorer.deleteRecord"
  | "explorer.refresh"
  // ChangesPane
  | "changes.title"
  | "changes.flatView"
  | "changes.treeView"
  | "changes.filter"
  | "changes.noMatch"
  | "changes.notRefreshed"
  | "changes.totalRepos"
  | "changes.pending"
  | "changes.stagingArea"
  | "changes.staged"
  | "changes.unstaged"
  | "changes.stageAll"
  | "changes.unstageAll"
  | "changes.commitStaged"
  | "changes.stagedFiles"
  | "changes.noStagedFiles"
  | "changes.unstage"
  // FileBrowser
  | "browser.title"
  | "browser.refresh"
  | "browser.goUp"
  | "browser.currentPath"
  | "browser.root"
  | "browser.empty"
  | "browser.emptyDesc"
  | "browser.notLoaded"
  | "browser.notLoadedDesc"
  // FilePreview
  | "preview.loading"
  | "preview.binary"
  | "preview.binaryDesc"
  | "preview.empty"
  | "preview.failed"
  | "preview.failedDesc"
  // Diff
  | "diff.loading"
  | "diff.empty"
  | "diff.view"
  // ReviewPane
  | "review.repoInfo"
  | "review.notSelected"
  | "review.path"
  | "review.remote"
  | "review.branch"
  | "review.notDetected"
  | "review.reviewQuality"
  | "review.changesCount"
  | "review.stepRefresh"
  | "review.stepChanges"
  | "review.stepReview"
  | "review.stepQuality"
  | "review.qualityCheck"
  | "review.qualityDesc"
  | "review.run"
  | "review.running"
  | "review.recentResult"
  | "review.noResult"
  | "review.passed"
  | "review.failed"
  | "review.idle"
  // General
  | "general.loading"
  | "general.folder"
  | "general.directory"
  // DeleteConfirm
  | "delete.title"
  | "delete.body"
  | "delete.path"
  | "delete.cancel"
  | "delete.confirm"
  // IgnoreDialog
  | "ignore.title"
  | "ignore.saving"
  | "ignore.saved"
  | "ignore.save"
  // BranchSwitcher
  | "branch.title"
  | "branch.loading"
  | "branch.noInfo"
  | "branch.current"
  | "branch.switching"
  // ContextMenu
  | "menu.viewDiff"
  | "menu.ignoreFile"
  | "menu.deleteRecord"
  // StatusBar
  | "statusBar.ready"
  // ErrorBoundary
  | "error.title"
  | "error.description"
  | "error.reload"
  // Operations
  | "operation.recent"
  | "operation.history"
  | "operation.current"
  | "operation.showHistory"
  | "operation.hideHistory"
  | "operation.entryCount";

const resources: Record<AppLanguage, Record<TranslationKey, string>> = {
  "zh-CN": {
    "activity.aria": "主导航",
    "activity.repositories": "仓库",
    "activity.files": "文件",
    "activity.changes": "变更",
    "activity.review": "评审",
    "activity.settings": "设置",
    "activity.light": "浅色",
    "activity.dark": "深色",
    "activity.system": "系统",
    "activity.ready": "准备就绪",
    "activity.busy": "处理中",
    "activity.openRepositories": "打开仓库管理",
    "activity.closeRepositories": "关闭仓库管理",
    "activity.openFiles": "打开文件浏览",
    "activity.closeFiles": "关闭文件浏览",
    "activity.openChanges": "打开变更状态",
    "activity.closeChanges": "关闭变更状态",
    "activity.openReview": "打开评审质量",
    "activity.closeReview": "关闭评审质量",
    "command.selectRepository": "选择或添加仓库",
    "command.changes": "变更",
    "command.redetect": "重新检测",
    "command.refreshStatus": "检测",
    "command.commit": "提交",
    "command.ignore": "忽略",
    "command.update": "更新",
    "command.fetch": "拉取",
    "command.stash": "暂存",
    "command.stashPush": "保存变更",
    "command.stashPop": "恢复最近",
    "command.stashEmpty": "暂无暂存",
    "command.stashDrop": "丢弃",
    "command.log": "历史",
    "command.logTitle": "最近提交",
    "command.logEmpty": "暂无提交记录",
    "command.logLoading": "加载中...",
    "command.cleanup": "清理",
    "command.refreshRepo": "重检测",
    "settings.eyebrow": "Application",
    "settings.title": "设置",
    "settings.language": "语言",
    "settings.languageHelp": "切换界面的基础显示语言，后续模块会逐步纳入同一资源结构。",
    "settings.languageField": "界面语言",
    "settings.autoRefresh": "自动刷新",
    "settings.autoRefreshHelp": "定时检测当前仓库的工作区状态变更。",
    "settings.enableAutoRefresh": "启用自动刷新",
    "settings.refreshInterval": "刷新间隔（秒）",
    "settings.seconds": "秒",
    "settings.changeList": "变更列表",
    "settings.changeListHelp": "变更面板默认使用的展示方式。",
    "settings.defaultView": "默认视图",
    "settings.flatView": "路径分组",
    "settings.treeView": "树形展开",
    "settings.done": "完成",
    "settings.svnDepth": "检出/更新深度",
    "settings.svnDepthHelp": "SVN update 命令的 --depth 参数，默认 infinity 更新整个目录树。",
    "settings.remoteCheck": "远端更新检测",
    "settings.remoteCheckHelp": "定时检测仓库远端是否有新的提交，检测到更新后以弹窗提醒。",
    "settings.enableRemoteCheck": "启用远端检测",
    "settings.remoteCheckInterval": "检测间隔",
    "settings.remoteCheckOff": "关闭",
    "settings.remoteCheck1h": "1 小时",
    "settings.remoteCheck2h": "2 小时",
    "settings.remoteCheck4h": "4 小时",
    "settings.svnDepthInfinity": "Infinity — 完整递归",
    "settings.svnDepthImmediates": "Immediates — 仅子目录和文件",
    "settings.svnDepthFiles": "Files — 仅文件",
    "settings.svnDepthEmpty": "Empty — 仅目录自身",
    "status.workspaceStatus": "工作区状态",
    "status.refresh": "刷新",
    "status.totalChanges": "总变更",
    "status.added": "新增",
    "status.modified": "修改",
    "status.untracked": "未跟踪",
    "status.clean": "工作区干净",
    "status.noChanges": "没有检测到新增、修改、删除或冲突文件。",
    "status.notRefreshed": "尚未刷新状态",
    "status.notRefreshedDesc": "选择仓库后点击刷新状态，这里会显示 Git / SVN 的变更摘要和文件列表。",
    "status.downloadTortoise": "下载 / 修改 TortoiseSVN",
    "status.downloadSlikSvn": "下载 SlikSVN",
    "status.showAll": "显示全部",
    "status.showLess": "折叠",
    "commit.title": "提交变更",
    "commit.selectedFiles": "选中文件",
    "commit.committable": "可提交",
    "commit.pushAfterCommit": "Git 提交后 push",
    "commit.on": "开启",
    "commit.off": "关闭",
    "commit.qualityCheck": "最近一次本地质量检查",
    "commit.notRun": "尚未运行",
    "commit.notRunDesc": "可以先在右侧\"评审与质量\"中运行 build、UI 测试或 cargo check。",
    "commit.selectAll": "全选文件",
    "commit.deselectAll": "取消全选",
    "commit.message": "提交信息",
    "commit.placeholder": "说明这次变更的目的...",
    "commit.cancel": "取消",
    "commit.submit": "提交选中文件",
    "commit.submitting": "提交中...",
    "explorer.title": "版本控制工作台",
    "explorer.openRepo": "打开本地仓库",
    "explorer.detect": "检测",
    "explorer.add": "添加",
    "explorer.tauriOnly": "需要 Tauri 运行时访问本地仓库。",
    "explorer.repositories": "仓库",
    "explorer.deleteRecord": "删除仓库记录",
    "explorer.refresh": "刷新仓库",
    "changes.title": "变更状态",
    "changes.flatView": "路径分组",
    "changes.treeView": "树形展开",
    "changes.filter": "筛选文件...",
    "changes.noMatch": "没有匹配的文件",
    "changes.notRefreshed": "尚未刷新状态",
    "changes.totalRepos": "总仓库",
    "changes.pending": "待确认",
    "changes.stagingArea": "暂存区",
    "changes.staged": "已暂存",
    "changes.unstaged": "未暂存",
    "changes.stageAll": "暂存全部",
    "changes.unstageAll": "取消暂存",
    "changes.commitStaged": "提交已暂存",
    "changes.stagedFiles": "已暂存文件",
    "changes.noStagedFiles": "暂存区为空",
    "changes.unstage": "取消暂存",
    "browser.title": "文件浏览",
    "browser.refresh": "刷新",
    "browser.goUp": "返回上级",
    "browser.currentPath": "当前路径",
    "browser.root": "根目录",
    "browser.empty": "目录为空",
    "browser.emptyDesc": "当前目录下没有可展示的文件或文件夹。",
    "browser.notLoaded": "尚未加载文件",
    "browser.notLoadedDesc": "从左侧选择一个仓库后，这里会显示文件列表。",
    "preview.loading": "正在加载预览",
    "preview.binary": "二进制文件",
    "preview.binaryDesc": "此文件不适合直接作为文本预览。",
    "preview.empty": "文件为空",
    "preview.failed": "未能加载文件",
    "preview.failedDesc": "请重新双击文件打开预览。",
    "diff.loading": "正在加载 diff...",
    "diff.empty": "暂无 diff 内容",
    "diff.view": "Diff view",
    "review.repoInfo": "仓库信息",
    "review.notSelected": "未选择",
    "review.path": "路径",
    "review.remote": "远端",
    "review.branch": "分支 / Revision",
    "review.notDetected": "未检测到",
    "review.reviewQuality": "评审与质量",
    "review.changesCount": "个变更",
    "review.stepRefresh": "刷新状态",
    "review.stepChanges": "处理变更",
    "review.stepReview": "发起评审",
    "review.stepQuality": "质量检查",
    "review.qualityCheck": "本地质量检查",
    "review.qualityDesc": "提交前参考最近一次结果",
    "review.run": "运行",
    "review.running": "运行中",
    "review.recentResult": "提交前最近结果",
    "review.noResult": "还没有运行本地质量检查",
    "review.passed": "通过",
    "review.failed": "失败",
    "review.idle": "未运行",
    "general.loading": "正在加载...",
    "general.folder": "文件夹",
    "general.directory": "目录",
    "delete.title": "删除仓库记录",
    "delete.body": "将从 GVMT 的本地列表中移除",
    "delete.path": "路径",
    "delete.cancel": "取消",
    "delete.confirm": "删除记录",
    "ignore.title": "忽略管理",
    "ignore.saving": "正在保存...",
    "ignore.saved": "已保存",
    "ignore.save": "保存",
    "branch.title": "分支切换",
    "branch.loading": "正在加载分支列表...",
    "branch.noInfo": "暂无分支信息",
    "branch.current": "当前",
    "branch.switching": "切换中...",
    "menu.viewDiff": "查看 diff",
    "menu.ignoreFile": "忽略此文件",
    "menu.deleteRecord": "删除仓库记录",
    "statusBar.ready": "准备就绪",
    "error.title": "应用出现错误",
    "error.description": "抱歉，应用遇到了一个意外错误。请刷新页面重试。",
    "error.reload": "刷新重试",
    "operation.recent": "最近操作",
    "operation.history": "操作记录",
    "operation.current": "本次",
    "operation.showHistory": "查看历史记录",
    "operation.hideHistory": "收起历史记录",
    "operation.entryCount": "条",
  },
  "en-US": {
    "activity.aria": "Primary navigation",
    "activity.repositories": "Repos",
    "activity.files": "Files",
    "activity.changes": "Changes",
    "activity.review": "Review",
    "activity.settings": "Settings",
    "activity.light": "Light",
    "activity.dark": "Dark",
    "activity.system": "System",
    "activity.ready": "Ready",
    "activity.busy": "Working",
    "activity.openRepositories": "Open repository management",
    "activity.closeRepositories": "Close repository management",
    "activity.openFiles": "Open file browser",
    "activity.closeFiles": "Close file browser",
    "activity.openChanges": "Open change status",
    "activity.closeChanges": "Close change status",
    "activity.openReview": "Open review and quality",
    "activity.closeReview": "Close review and quality",
    "command.selectRepository": "Select or add a repository",
    "command.changes": "Changes",
    "command.redetect": "Detect",
    "command.refreshStatus": "Refresh",
    "command.commit": "Commit",
    "command.ignore": "Ignore",
    "command.update": "Update",
    "command.fetch": "Fetch",
    "command.stash": "Stash",
    "command.stashPush": "Push changes",
    "command.stashPop": "Pop latest",
    "command.stashEmpty": "No stashes",
    "command.stashDrop": "Drop",
    "command.log": "Log",
    "command.logTitle": "Recent commits",
    "command.logEmpty": "No commits yet",
    "command.logLoading": "Loading...",
    "command.cleanup": "Cleanup",
    "command.refreshRepo": "Re-detect",
    "settings.eyebrow": "Application",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.languageHelp": "Switch the basic interface language. More modules can be migrated into this resource layer over time.",
    "settings.languageField": "Interface language",
    "settings.autoRefresh": "Auto refresh",
    "settings.autoRefreshHelp": "Periodically check the selected repository for working tree changes.",
    "settings.enableAutoRefresh": "Enable auto refresh",
    "settings.refreshInterval": "Refresh interval (seconds)",
    "settings.seconds": "sec",
    "settings.changeList": "Change list",
    "settings.changeListHelp": "Default display mode for the changes panel.",
    "settings.defaultView": "Default view",
    "settings.flatView": "Path groups",
    "settings.treeView": "Tree",
    "settings.done": "Done",
    "settings.svnDepth": "Checkout/Update depth",
    "settings.svnDepthHelp": "Controls how deeply SVN update traverses the directory tree.",
    "settings.remoteCheck": "Remote Update Check",
    "settings.remoteCheckHelp": "Periodically check remote repositories for new commits and notify via popup.",
    "settings.enableRemoteCheck": "Enable remote check",
    "settings.remoteCheckInterval": "Check interval",
    "settings.remoteCheckOff": "Off",
    "settings.remoteCheck1h": "1 hour",
    "settings.remoteCheck2h": "2 hours",
    "settings.remoteCheck4h": "4 hours",
    "settings.svnDepthInfinity": "Infinity — full recursion",
    "settings.svnDepthImmediates": "Immediates — children only",
    "settings.svnDepthFiles": "Files — file entries only",
    "settings.svnDepthEmpty": "Empty — directory only",
    "status.workspaceStatus": "Workspace Status",
    "status.refresh": "Refresh",
    "status.totalChanges": "Total",
    "status.added": "Added",
    "status.modified": "Modified",
    "status.untracked": "Untracked",
    "status.clean": "Working tree clean",
    "status.noChanges": "No new, modified, deleted, or conflicted files detected.",
    "status.notRefreshed": "Not refreshed yet",
    "status.notRefreshedDesc": "Select a repository and click refresh to see Git/SVN change summary and file list.",
    "status.downloadTortoise": "Download / Fix TortoiseSVN",
    "status.downloadSlikSvn": "Download SlikSVN",
    "status.showAll": "Show all",
    "status.showLess": "Collapse",
    "commit.title": "Commit Changes",
    "commit.selectedFiles": "Selected",
    "commit.committable": "Committable",
    "commit.pushAfterCommit": "Push after commit",
    "commit.on": "On",
    "commit.off": "Off",
    "commit.qualityCheck": "Last local quality check",
    "commit.notRun": "Not run yet",
    "commit.notRunDesc": "Run build, UI tests, or cargo check in the Review & Quality panel first.",
    "commit.selectAll": "Select all",
    "commit.deselectAll": "Deselect all",
    "commit.message": "Commit message",
    "commit.placeholder": "Describe the purpose of this change...",
    "commit.cancel": "Cancel",
    "commit.submit": "Commit selected",
    "commit.submitting": "Committing...",
    "explorer.title": "Version Control Workbench",
    "explorer.openRepo": "Open local repository",
    "explorer.detect": "Detect",
    "explorer.add": "Add",
    "explorer.tauriOnly": "Tauri runtime required to access local repositories.",
    "explorer.repositories": "Repositories",
    "explorer.deleteRecord": "Delete repository record",
    "explorer.refresh": "Refresh repos",
    "changes.title": "Changes",
    "changes.flatView": "Path groups",
    "changes.treeView": "Tree",
    "changes.filter": "Filter files...",
    "changes.noMatch": "No matching files",
    "changes.notRefreshed": "Not refreshed yet",
    "changes.totalRepos": "Total repos",
    "changes.pending": "Pending",
    "changes.stagingArea": "Staging Area",
    "changes.staged": "Staged",
    "changes.unstaged": "Unstaged",
    "changes.stageAll": "Stage All",
    "changes.unstageAll": "Unstage All",
    "changes.commitStaged": "Commit Staged",
    "changes.stagedFiles": "Staged Files",
    "changes.noStagedFiles": "No staged files",
    "changes.unstage": "Unstage",
    "browser.title": "File Browser",
    "browser.refresh": "Refresh",
    "browser.goUp": "Go up",
    "browser.currentPath": "Current path",
    "browser.root": "Root",
    "browser.empty": "Empty directory",
    "browser.emptyDesc": "No files or folders to show in this directory.",
    "browser.notLoaded": "Not loaded yet",
    "browser.notLoadedDesc": "Select a repository from the left to view its file tree.",
    "preview.loading": "Loading preview",
    "preview.binary": "Binary file",
    "preview.binaryDesc": "This file cannot be previewed as text.",
    "preview.empty": "File is empty",
    "preview.failed": "Failed to load file",
    "preview.failedDesc": "Double-click the file again to retry.",
    "diff.loading": "Loading diff...",
    "diff.empty": "No diff content",
    "diff.view": "Diff view",
    "review.repoInfo": "Repository Info",
    "review.notSelected": "Not selected",
    "review.path": "Path",
    "review.remote": "Remote",
    "review.branch": "Branch / Revision",
    "review.notDetected": "Not detected",
    "review.reviewQuality": "Review & Quality",
    "review.changesCount": "change(s)",
    "review.stepRefresh": "Refresh status",
    "review.stepChanges": "Handle changes",
    "review.stepReview": "Start review",
    "review.stepQuality": "Quality check",
    "review.qualityCheck": "Local quality checks",
    "review.qualityDesc": "Run checks before committing",
    "review.run": "Run",
    "review.running": "Running",
    "review.recentResult": "Most recent result",
    "review.noResult": "No quality check run yet",
    "review.passed": "Passed",
    "review.failed": "Failed",
    "review.idle": "Idle",
    "general.loading": "Loading...",
    "general.folder": "Folder",
    "general.directory": "Directory",
    "delete.title": "Delete Repository Record",
    "delete.body": "This will remove from the GVMT local list",
    "delete.path": "Path",
    "delete.cancel": "Cancel",
    "delete.confirm": "Delete record",
    "ignore.title": "Ignore Rules",
    "ignore.saving": "Saving...",
    "ignore.saved": "Saved",
    "ignore.save": "Save",
    "branch.title": "Switch Branch",
    "branch.loading": "Loading branches...",
    "branch.noInfo": "No branch info",
    "branch.current": "Current",
    "branch.switching": "Switching...",
    "menu.viewDiff": "View diff",
    "menu.ignoreFile": "Ignore file",
    "menu.deleteRecord": "Delete repository record",
    "statusBar.ready": "Ready",
    "error.title": "An error occurred",
    "error.description": "Sorry, the app encountered an unexpected error. Please reload the page.",
    "error.reload": "Reload",
    "operation.recent": "Recent operations",
    "operation.history": "Operation history",
    "operation.current": "Current",
    "operation.showHistory": "Show history",
    "operation.hideHistory": "Hide history",
    "operation.entryCount": "entries",
  },
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "zh-CN" || value === "en-US";
}

export function createTranslator(language: AppLanguage) {
  return (key: TranslationKey) => resources[language][key] ?? resources["zh-CN"][key] ?? key;
}

export type Translator = ReturnType<typeof createTranslator>;

export function applyDocumentLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
}
