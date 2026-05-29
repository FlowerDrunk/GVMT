export type AppLanguage = "zh-CN" | "en-US";

export type TranslationParams = Record<string, string | number>;

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
  | "review.commitHooks"
  | "review.preCommit"
  | "review.postCommit"
  | "review.qualityScripts"
  | "review.run"
  | "review.runAll"
  | "review.addScript"
  | "review.fromTemplate"
  | "review.deleteScript"
  | "review.edit"
  | "review.passed"
  | "review.failed"
  | "review.duration"
  | "review.scriptResult"
  | "review.shellLabel"
  | "review.scriptLabel"
  | "review.scriptPlaceholder"
  | "review.namePlaceholder"
  | "review.save"
  | "review.saved"
  | "review.hookPreCommitTitle"
  | "review.hookPostCommitTitle"
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
  | "operation.entryCount"
  // VCS type labels
  | "vcs.git"
  | "vcs.svn"
  | "vcs.mixed"
  | "vcs.unknown"
  // Change status labels
  | "change.added"
  | "change.modified"
  | "change.deleted"
  | "change.renamed"
  | "change.untracked"
  | "change.conflicted"
  | "change.missing"
  | "change.unknown"
  // Repository descriptions
  | "repo.emptyTitle"
  | "repo.emptyBody"
  | "repo.gitDetected"
  | "repo.svnDetected"
  | "repo.mixedDetected"
  | "repo.unknownDetected"
  | "repo.notDetected"
  | "repo.name"
  | "repo.notesLabel"
  // Shared UI
  | "ui.close"
  | "ui.dragToReorder"
  | "ui.folder"
  | "ui.directory"
  | "ui.items"
  | "ui.loading"
  | "ui.cancel"
  | "ui.save"
  | "ui.saving"
  | "ui.success"
  | "ui.failed"
  | "ui.warning"
  | "ui.output"
  | "ui.doubleClickDetail"
  | "ui.retryPush"
  | "ui.collapse"
  | "ui.expand"
  | "ui.selectAll"
  | "ui.deselectAll"
  | "ui.all"
  | "ui.file"
  | "ui.folderFilter"
  | "ui.noMatch"
  | "ui.searchFiles"
  | "ui.search"
  | "ui.currentView"
  | "ui.browseGroup"
  | "ui.viewDiff"
  | "ui.copyRevision"
  | "ui.viewDetail"
  | "ui.copyAddress"
  // Status messages (hooks)
  | "status.selectRepoFirst"
  | "status.changesDetected"
  | "status.updateComplete"
  | "status.updateStepsFailed"
  | "status.openedSlikSvn"
  | "status.openedTortoise"
  | "status.reposLoaded"
  | "status.enterRepoPath"
  | "status.repoAdded"
  | "status.enterDetectPath"
  | "status.detectResult"
  | "status.repoReDetected"
  | "status.repoRecordDeleted"
  | "status.rulesLoaded"
  | "status.ignoreFailed"
  | "status.unignoreFailed"
  | "status.diffLoaded"
  | "status.openedPath"
  | "status.openedRepoRoot"
  | "status.previewedFile"
  | "status.checkUnavailable"
  | "status.runningCheck"
  | "status.commitComplete"
  | "status.commitStepsFailed"
  | "status.selectFilesToCommit"
  | "status.enterCommitMessage"
  | "status.startupReady"
  | "status.openedFromContextMenu"
  | "status.enteredCommitFromContextMenu"
  | "status.cloneComplete"
  | "status.pushRetrySuccess"
  | "status.pushRetryFailed"
  | "status.pushFailedToast"
  | "status.commitSuccessToast"
  | "status.repoOpenedToast"
  | "status.noDiffInfo"
  | "status.contextMenuInstalled"
  | "status.contextMenuNotInstalled"
  | "status.contextMenuInstalledToast"
  | "status.contextMenuRemoved"
  | "status.contextMenuRemovedToast"
  | "status.pathRecognized"
  | "status.starting"
  // Update progress
  | "update.executing"
  | "update.elapsed"
  | "update.filesCount"
  | "update.remoteClone"
  | "update.clickToReopen"
  // Notification
  | "notification.remoteUpdateAvailable"
  | "notification.updating"
  | "notification.update"
  // Force update
  | "forceUpdate.title"
  | "forceUpdate.warning1"
  | "forceUpdate.warning2"
  | "forceUpdate.step1"
  | "forceUpdate.step2"
  | "forceUpdate.step3"
  | "forceUpdate.warningLoss"
  | "forceUpdate.confirmBtn"
  // Explorer pane
  | "explorer.subtitle"
  | "explorer.cloneRepo"
  | "explorer.remoteUrl"
  | "explorer.remoteUrlPlaceholder"
  | "explorer.localDirectory"
  | "explorer.localDirPlaceholder"
  | "explorer.selectFolder"
  | "explorer.addRepoBtn"
  | "explorer.cloneRepoBtn"
  | "explorer.cloning"
  | "explorer.adding"
  | "explorer.tauriWarning"
  | "explorer.repoList"
  | "explorer.searchRepo"
  | "explorer.noMatch"
  | "explorer.dropHint"
  | "explorer.editInfo"
  | "explorer.openDir"
  | "explorer.deleteRecordContext"
  | "explorer.editRepo"
  | "explorer.repoName"
  | "explorer.notes"
  | "explorer.notesPlaceholder"
  | "explorer.noRepoDetected"
  | "explorer.enterRemoteUrl"
  | "explorer.selectLocalDir"
  | "explorer.pleaseSelectRepoDir"
  | "explorer.cloningInProgress"
  | "explorer.gitOptions"
  | "explorer.svnOptions"
  | "explorer.shallowCloneDesc"
  | "explorer.ignoreExternalsDesc"
  | "explorer.dirCreateFailed"
  // GitHub panel
  | "github.primaryLanguage"
  | "github.defaultBranch"
  | "github.openInBrowser"
  | "github.cannotFetchInfo"
  | "github.noPrs"
  | "github.loadingPrs"
  | "github.createPrTitle"
  | "github.sourceBranch"
  | "github.targetBranch"
  | "github.titleField"
  | "github.titlePlaceholder"
  | "github.description"
  | "github.descriptionPlaceholder"
  | "github.creating"
  | "github.createPrBtn"
  | "github.prCreated"
  | "github.createPrLabel"
  // Context menu / StatusBar
  | "contextMenu.viewDiff"
  | "contextMenu.conflictResolve"
  | "contextMenu.acceptTheirs"
  | "contextMenu.acceptMine"
  | "contextMenu.acceptBase"
  | "contextMenu.markResolved"
  | "contextMenu.forceUpdate"
  | "contextMenu.addIgnore"
  | "contextMenu.ignoreExt"
  | "contextMenu.resetTitle"
  | "contextMenu.resetBody"
  | "contextMenu.confirmReset"
  | "contextMenu.revertFailed"
  | "contextMenu.resolveFailed"
  | "contextMenu.forceUpdateFailed"
  | "contextMenu.stashFailed"
  | "contextMenu.resetFailed"
  | "contextMenu.gitStashPush"
  | "contextMenu.gitResetSoft"
  | "contextMenu.logDetail"
  // Commit dialog extra
  | "commit.pushLabel"
  | "commit.onLabel"
  | "commit.offLabel"
  | "commit.messageLabel"
  | "commit.recentMessages"
  | "commit.currentView"
  | "commit.allFiles"
  | "commit.browseGroup"
  | "commit.viewDiff"
  | "commit.fileGroupOther"
  | "commit.svnUntrackedHint"
  | "commit.searchFiles"
  // Review states
  | "review.reviewStateClean"
  | "review.reviewStatePending"
  | "review.reviewStateWaiting"
  // Repository summary extra
  | "summary.name"
  | "summary.notes"
  | "summary.recentCommits"
  | "summary.loading"
  | "summary.noCommits"
  // General
  | "general.changedFiles";

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
    "review.commitHooks": "提交钩子",
    "review.preCommit": "提交前",
    "review.postCommit": "提交后",
    "review.qualityScripts": "质量检查脚本",
    "review.run": "运行",
    "review.runAll": "全部运行",
    "review.addScript": "新增",
    "review.fromTemplate": "从模板添加",
    "review.deleteScript": "删除",
    "review.edit": "编辑",
    "review.passed": "通过",
    "review.failed": "失败",
    "review.duration": "耗时",
    "review.scriptResult": "最近结果",
    "review.shellLabel": "Shell",
    "review.scriptLabel": "脚本内容",
    "review.scriptPlaceholder": "输入脚本内容...",
    "review.namePlaceholder": "脚本名称",
    "review.save": "保存",
    "review.saved": "已保存",
    "review.hookPreCommitTitle": "提交前脚本",
    "review.hookPostCommitTitle": "提交后脚本",
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
    "vcs.git": "Git",
    "vcs.svn": "SVN",
    "vcs.mixed": "Git + SVN",
    "vcs.unknown": "未知",
    "change.added": "新增",
    "change.modified": "修改",
    "change.deleted": "删除",
    "change.renamed": "重命名",
    "change.untracked": "未跟踪",
    "change.conflicted": "冲突",
    "change.missing": "缺失",
    "change.unknown": "未知",
    "repo.emptyTitle": "还没有仓库",
    "repo.emptyBody": "添加一个 Git 或 SVN 工作副本，GVMT 会识别类型并记录到本地 SQLite。",
    "repo.gitDetected": "已检测到 Git 工作区",
    "repo.svnDetected": "已检测到 SVN 工作副本",
    "repo.mixedDetected": "当前目录同时包含 Git 与 SVN 信息",
    "repo.unknownDetected": "未检测到 Git 或 SVN 元数据",
    "repo.notDetected": "未检测到",
    "repo.name": "名称",
    "repo.notesLabel": "备注",
    "ui.close": "关闭",
    "ui.dragToReorder": "拖拽排序",
    "ui.folder": "文件夹",
    "ui.directory": "目录",
    "ui.items": "项",
    "ui.loading": "加载中...",
    "ui.cancel": "取消",
    "ui.save": "保存",
    "ui.saving": "保存中...",
    "ui.success": "成功",
    "ui.failed": "失败",
    "ui.warning": "警告",
    "ui.output": "输出",
    "ui.doubleClickDetail": "双击查看详情",
    "ui.retryPush": "重试 Push",
    "ui.collapse": "收起",
    "ui.expand": "展开",
    "ui.selectAll": "全选",
    "ui.deselectAll": "取消",
    "ui.all": "全部",
    "ui.file": "文件",
    "ui.folderFilter": "文件夹",
    "ui.noMatch": "没有匹配的文件",
    "ui.searchFiles": "搜索文件...",
    "ui.search": "搜索...",
    "ui.currentView": "当前视图",
    "ui.browseGroup": "浏览此组",
    "ui.viewDiff": "查看 diff",
    "ui.copyRevision": "复制版本号",
    "ui.viewDetail": "查看详情",
    "ui.copyAddress": "复制地址",
    "status.selectRepoFirst": "请先选择一个仓库",
    "status.changesDetected": "检测到 {count} 个变更",
    "status.updateComplete": "更新完成",
    "status.updateStepsFailed": "{count} 个更新步骤失败",
    "status.openedSlikSvn": "已打开 SlikSVN 下载页",
    "status.openedTortoise": "已打开 TortoiseSVN 下载页",
    "status.reposLoaded": "已加载 {count} 个仓库",
    "status.enterRepoPath": "请输入本地仓库路径",
    "status.repoAdded": "已添加 {name}",
    "status.enterDetectPath": "请输入需要检测的路径",
    "status.detectResult": "检测结果：{name} / {type}",
    "status.repoReDetected": "已重新检测 {name}：{type}",
    "status.repoRecordDeleted": "已删除仓库记录，本地文件未受影响",
    "status.rulesLoaded": "已加载忽略规则",
    "status.ignoreFailed": "忽略操作失败：{reason}",
    "status.unignoreFailed": "取消忽略失败：{reason}",
    "status.diffLoaded": "已加载 diff：{path}",
    "status.openedPath": "已打开 {path}",
    "status.openedRepoRoot": "已打开仓库根目录",
    "status.previewedFile": "已预览 {path}",
    "status.checkUnavailable": "当前检查不可用",
    "status.runningCheck": "正在运行 {label}...",
    "status.commitComplete": "提交完成",
    "status.commitStepsFailed": "{count} 个提交步骤失败",
    "status.selectFilesToCommit": "请选择需要提交的文件",
    "status.enterCommitMessage": "请输入提交信息",
    "status.startupReady": "准备就绪 — 请添加仓库",
    "status.openedFromContextMenu": "已从右键菜单打开 {name}",
    "status.enteredCommitFromContextMenu": "已从右键菜单进入提交流程",
    "status.cloneComplete": "克隆完成",
    "status.pushRetrySuccess": "Push 重试成功",
    "status.pushRetryFailed": "Push 重试失败",
    "status.pushFailedToast": "本地提交成功，但 Push 失败，请点击重试按钮",
    "status.commitSuccessToast": "提交完成",
    "status.repoOpenedToast": "已打开 {name}",
    "status.noDiffInfo": "未找到可查看的 diff 信息",
    "status.contextMenuInstalled": "Windows 右键菜单已安装",
    "status.contextMenuNotInstalled": "Windows 右键菜单未安装",
    "status.contextMenuInstalledToast": "已安装 Windows 右键菜单",
    "status.contextMenuRemoved": "已移除 Windows 右键菜单",
    "status.contextMenuRemovedToast": "已移除 Windows 右键菜单",
    "status.pathRecognized": "已识别路径：{path}",
    "status.starting": "正在启动...",
    "update.executing": "正在执行...",
    "update.elapsed": "已耗时",
    "update.filesCount": "{count} 个文件",
    "update.remoteClone": "远程克隆",
    "update.clickToReopen": "点击重新打开进度面板",
    "notification.remoteUpdateAvailable": "远端有更新可用",
    "notification.updating": "更新中...",
    "notification.update": "更新",
    "forceUpdate.title": "强制更新确认",
    "forceUpdate.warning1": "强制更新将<strong>还原整个仓库</strong>到服务器最新版本。",
    "forceUpdate.warning2": "此操作包含三个步骤：",
    "forceUpdate.step1": "解除工作副本锁定",
    "forceUpdate.step2": "丢弃所有本地修改（不可撤销）",
    "forceUpdate.step3": "拉取服务器最新版本",
    "forceUpdate.warningLoss": "所有未提交的本地修改将永久丢失。",
    "forceUpdate.confirmBtn": "确认强制更新",
    "explorer.subtitle": "通用版本控制工具",
    "explorer.cloneRepo": "克隆远程仓库",
    "explorer.remoteUrl": "远程仓库地址",
    "explorer.remoteUrlPlaceholder": "https://github.com/user/repo.git 或 SVN URL",
    "explorer.localDirectory": "本地目录",
    "explorer.localDirPlaceholder": "输入或选择本地目录路径...",
    "explorer.selectFolder": "选择文件夹",
    "explorer.addRepoBtn": "添加仓库",
    "explorer.cloneRepoBtn": "克隆仓库",
    "explorer.cloning": "克隆中...",
    "explorer.adding": "添加中...",
    "explorer.tauriWarning": "请在 Tauri 桌面环境中使用完整功能",
    "explorer.repoList": "仓库列表",
    "explorer.searchRepo": "搜索仓库...",
    "explorer.noMatch": "无匹配仓库",
    "explorer.dropHint": "拖拽文件夹到此处，或点击 + 添加",
    "explorer.editInfo": "编辑信息",
    "explorer.openDir": "打开所在目录",
    "explorer.deleteRecordContext": "删除记录",
    "explorer.editRepo": "编辑仓库",
    "explorer.repoName": "仓库名称",
    "explorer.notes": "备注",
    "explorer.notesPlaceholder": "添加备注信息...",
    "explorer.noRepoDetected": "当前目录未检测到 Git 或 SVN 仓库，请确认路径正确",
    "explorer.enterRemoteUrl": "请输入远程仓库地址",
    "explorer.selectLocalDir": "请选择本地目录",
    "explorer.pleaseSelectRepoDir": "请先选择仓库目录",
    "explorer.cloningInProgress": "正在克隆... 请等待完成",
    "explorer.gitOptions": "Git 选项",
    "explorer.svnOptions": "SVN 选项",
    "explorer.shallowCloneDesc": "浅克隆（--depth 1，仅最新版本，速度快）",
    "explorer.ignoreExternalsDesc": "忽略外部依赖（svn:externals），大幅提速",
    "explorer.dirCreateFailed": "无法创建目录：{msg}",
    "github.primaryLanguage": "主要语言",
    "github.defaultBranch": "默认分支",
    "github.openInBrowser": "在浏览器中打开",
    "github.cannotFetchInfo": "无法获取仓库信息",
    "github.noPrs": "暂无 Pull Requests",
    "github.loadingPrs": "加载 PR 列表...",
    "github.createPrTitle": "创建 Pull Request",
    "github.sourceBranch": "源分支",
    "github.targetBranch": "目标分支",
    "github.titleField": "标题 *",
    "github.titlePlaceholder": "PR 标题",
    "github.description": "描述",
    "github.descriptionPlaceholder": "PR 描述（可选）",
    "github.creating": "创建中...",
    "github.createPrBtn": "创建 PR",
    "github.prCreated": "PR #{number} 创建成功",
    "github.createPrLabel": "创建 PR：{head} → {base}",
    "contextMenu.viewDiff": "查看 Diff",
    "contextMenu.conflictResolve": "冲突解决",
    "contextMenu.acceptTheirs": "接受服务器版本 (theirs)",
    "contextMenu.acceptMine": "保留本地版本 (mine)",
    "contextMenu.acceptBase": "还原原始版本 (base)",
    "contextMenu.markResolved": "标记已解决 (保留当前状态)",
    "contextMenu.forceUpdate": "强制更新",
    "contextMenu.addIgnore": "加入忽略",
    "contextMenu.ignoreExt": "忽略同后缀文件 (*{ext})",
    "contextMenu.resetTitle": "确认重置？",
    "contextMenu.resetBody": "将执行 git reset --soft HEAD，取消当前所有暂存。文件内容不会丢失。",
    "contextMenu.confirmReset": "确认 Reset",
    "contextMenu.revertFailed": "Revert 失败",
    "contextMenu.resolveFailed": "Resolve 失败",
    "contextMenu.forceUpdateFailed": "强制更新失败",
    "contextMenu.stashFailed": "Stash 失败",
    "contextMenu.resetFailed": "Reset 失败",
    "contextMenu.gitStashPush": "Git Stash Push (暂存变更)",
    "contextMenu.gitResetSoft": "Git Reset (soft)…",
    "contextMenu.logDetail": "提交历史",
    "commit.pushLabel": "Git push",
    "commit.onLabel": "开",
    "commit.offLabel": "关",
    "commit.messageLabel": "提交信息",
    "commit.recentMessages": "历史消息 ▾",
    "commit.currentView": "当前视图",
    "commit.allFiles": "全部",
    "commit.browseGroup": "浏览此组",
    "commit.viewDiff": "查看 diff",
    "commit.fileGroupOther": "其他",
    "commit.svnUntrackedHint": "SVN：{count} 个未跟踪文件将被自动 add",
    "commit.searchFiles": "搜索文件...",
    "review.reviewStateClean": "可进入评审",
    "review.reviewStatePending": "有待处理变更",
    "review.reviewStateWaiting": "等待检测",
    "summary.name": "名称",
    "summary.notes": "备注",
    "summary.recentCommits": "最近提交",
    "summary.loading": "加载中...",
    "summary.noCommits": "暂无提交记录",
    "general.changedFiles": "Changed files ({count})",
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
    "review.commitHooks": "Commit Hooks",
    "review.preCommit": "Pre-commit",
    "review.postCommit": "Post-commit",
    "review.qualityScripts": "Quality Scripts",
    "review.run": "Run",
    "review.runAll": "Run All",
    "review.addScript": "Add",
    "review.fromTemplate": "From Template",
    "review.deleteScript": "Delete",
    "review.edit": "Edit",
    "review.passed": "Passed",
    "review.failed": "Failed",
    "review.duration": "Duration",
    "review.scriptResult": "Latest Result",
    "review.shellLabel": "Shell",
    "review.scriptLabel": "Script",
    "review.scriptPlaceholder": "Enter script content...",
    "review.namePlaceholder": "Script name",
    "review.save": "Save",
    "review.saved": "Saved",
    "review.hookPreCommitTitle": "Pre-commit script",
    "review.hookPostCommitTitle": "Post-commit script",
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
    "vcs.git": "Git",
    "vcs.svn": "SVN",
    "vcs.mixed": "Git + SVN",
    "vcs.unknown": "Unknown",
    "change.added": "Added",
    "change.modified": "Modified",
    "change.deleted": "Deleted",
    "change.renamed": "Renamed",
    "change.untracked": "Untracked",
    "change.conflicted": "Conflicted",
    "change.missing": "Missing",
    "change.unknown": "Unknown",
    "repo.emptyTitle": "No repositories yet",
    "repo.emptyBody": "Add a Git or SVN working copy. GVMT will detect the type and store it in local SQLite.",
    "repo.gitDetected": "Git working tree detected",
    "repo.svnDetected": "SVN working copy detected",
    "repo.mixedDetected": "Directory contains both Git and SVN metadata",
    "repo.unknownDetected": "No Git or SVN metadata detected",
    "repo.notDetected": "Not detected",
    "repo.name": "Name",
    "repo.notesLabel": "Notes",
    "ui.close": "Close",
    "ui.dragToReorder": "Drag to reorder",
    "ui.folder": "Folder",
    "ui.directory": "Directory",
    "ui.items": "items",
    "ui.loading": "Loading...",
    "ui.cancel": "Cancel",
    "ui.save": "Save",
    "ui.saving": "Saving...",
    "ui.success": "Success",
    "ui.failed": "Failed",
    "ui.warning": "Warning",
    "ui.output": "Output",
    "ui.doubleClickDetail": "Double-click for details",
    "ui.retryPush": "Retry Push",
    "ui.collapse": "Collapse",
    "ui.expand": "Expand",
    "ui.selectAll": "Select all",
    "ui.deselectAll": "Deselect",
    "ui.all": "All",
    "ui.file": "File",
    "ui.folderFilter": "Folder",
    "ui.noMatch": "No matching files",
    "ui.searchFiles": "Search files...",
    "ui.search": "Search...",
    "ui.currentView": "Current view",
    "ui.browseGroup": "Browse this group",
    "ui.viewDiff": "View diff",
    "ui.copyRevision": "Copy revision",
    "ui.viewDetail": "View details",
    "ui.copyAddress": "Copy address",
    "status.selectRepoFirst": "Please select a repository first",
    "status.changesDetected": "Detected {count} change(s)",
    "status.updateComplete": "Update complete",
    "status.updateStepsFailed": "{count} update step(s) failed",
    "status.openedSlikSvn": "Opened SlikSVN download page",
    "status.openedTortoise": "Opened TortoiseSVN download page",
    "status.reposLoaded": "Loaded {count} repo(s)",
    "status.enterRepoPath": "Please enter a local repository path",
    "status.repoAdded": "Added {name}",
    "status.enterDetectPath": "Please enter the path to detect",
    "status.detectResult": "Detection result: {name} / {type}",
    "status.repoReDetected": "Re-detected {name}: {type}",
    "status.repoRecordDeleted": "Repository record deleted, local files unaffected",
    "status.rulesLoaded": "Ignore rules loaded",
    "status.ignoreFailed": "Ignore failed: {reason}",
    "status.unignoreFailed": "Un-ignore failed: {reason}",
    "status.diffLoaded": "Diff loaded: {path}",
    "status.openedPath": "Opened {path}",
    "status.openedRepoRoot": "Opened repository root",
    "status.previewedFile": "Previewed {path}",
    "status.checkUnavailable": "Current check unavailable",
    "status.runningCheck": "Running {label}...",
    "status.commitComplete": "Commit complete",
    "status.commitStepsFailed": "{count} commit step(s) failed",
    "status.selectFilesToCommit": "Please select files to commit",
    "status.enterCommitMessage": "Please enter a commit message",
    "status.startupReady": "Ready — please add a repository",
    "status.openedFromContextMenu": "Opened {name} from context menu",
    "status.enteredCommitFromContextMenu": "Entered commit flow from context menu",
    "status.cloneComplete": "Clone complete",
    "status.pushRetrySuccess": "Push retry succeeded",
    "status.pushRetryFailed": "Push retry failed",
    "status.pushFailedToast": "Local commit succeeded, but Push failed. Please click the retry button",
    "status.commitSuccessToast": "Commit completed",
    "status.repoOpenedToast": "Opened {name}",
    "status.noDiffInfo": "No diff information found",
    "status.contextMenuInstalled": "Windows context menu installed",
    "status.contextMenuNotInstalled": "Windows context menu not installed",
    "status.contextMenuInstalledToast": "Windows context menu installed",
    "status.contextMenuRemoved": "Windows context menu removed",
    "status.contextMenuRemovedToast": "Windows context menu removed",
    "status.pathRecognized": "Path recognized: {path}",
    "status.starting": "Starting...",
    "update.executing": "Executing...",
    "update.elapsed": "Elapsed",
    "update.filesCount": "{count} file(s)",
    "update.remoteClone": "Remote Clone",
    "update.clickToReopen": "Click to reopen progress panel",
    "notification.remoteUpdateAvailable": "Remote update available",
    "notification.updating": "Updating...",
    "notification.update": "Update",
    "forceUpdate.title": "Force Update Confirmation",
    "forceUpdate.warning1": "Force update will <strong>revert the entire repository</strong> to the latest server version.",
    "forceUpdate.warning2": "This operation includes three steps:",
    "forceUpdate.step1": "release working copy locks",
    "forceUpdate.step2": "discard all local modifications (irreversible)",
    "forceUpdate.step3": "pull latest from server",
    "forceUpdate.warningLoss": "All uncommitted local changes will be permanently lost.",
    "forceUpdate.confirmBtn": "Confirm Force Update",
    "explorer.subtitle": "Universal Version Control Tool",
    "explorer.cloneRepo": "Clone Remote Repository",
    "explorer.remoteUrl": "Remote Repository URL",
    "explorer.remoteUrlPlaceholder": "https://github.com/user/repo.git or SVN URL",
    "explorer.localDirectory": "Local Directory",
    "explorer.localDirPlaceholder": "Enter or select local directory path...",
    "explorer.selectFolder": "Select folder",
    "explorer.addRepoBtn": "Add Repository",
    "explorer.cloneRepoBtn": "Clone Repository",
    "explorer.cloning": "Cloning...",
    "explorer.adding": "Adding...",
    "explorer.tauriWarning": "Use full features in Tauri desktop environment",
    "explorer.repoList": "Repository List",
    "explorer.searchRepo": "Search repositories...",
    "explorer.noMatch": "No matching repos",
    "explorer.dropHint": "Drag a folder here, or click + to add",
    "explorer.editInfo": "Edit info",
    "explorer.openDir": "Open directory",
    "explorer.deleteRecordContext": "Delete record",
    "explorer.editRepo": "Edit Repository",
    "explorer.repoName": "Repository name",
    "explorer.notes": "Notes",
    "explorer.notesPlaceholder": "Add notes...",
    "explorer.noRepoDetected": "No Git or SVN repository detected in this directory. Please verify the path.",
    "explorer.enterRemoteUrl": "Please enter a remote repository URL",
    "explorer.selectLocalDir": "Please select a local directory",
    "explorer.pleaseSelectRepoDir": "Please select a repository directory first",
    "explorer.cloningInProgress": "Cloning... Please wait",
    "explorer.gitOptions": "Git Options",
    "explorer.svnOptions": "SVN Options",
    "explorer.shallowCloneDesc": "Shallow clone (--depth 1, latest version only, faster)",
    "explorer.ignoreExternalsDesc": "Ignore externals (svn:externals) for faster clone",
    "explorer.dirCreateFailed": "Cannot create directory: {msg}",
    "github.primaryLanguage": "Primary Language",
    "github.defaultBranch": "Default Branch",
    "github.openInBrowser": "Open in Browser",
    "github.cannotFetchInfo": "Cannot fetch repository info",
    "github.noPrs": "No Pull Requests",
    "github.loadingPrs": "Loading PRs...",
    "github.createPrTitle": "Create Pull Request",
    "github.sourceBranch": "Source Branch",
    "github.targetBranch": "Target Branch",
    "github.titleField": "Title *",
    "github.titlePlaceholder": "PR title",
    "github.description": "Description",
    "github.descriptionPlaceholder": "PR description (optional)",
    "github.creating": "Creating...",
    "github.createPrBtn": "Create PR",
    "github.prCreated": "PR #{number} created successfully",
    "github.createPrLabel": "Create PR: {head} → {base}",
    "contextMenu.viewDiff": "View Diff",
    "contextMenu.conflictResolve": "Conflict Resolution",
    "contextMenu.acceptTheirs": "Accept server version (theirs)",
    "contextMenu.acceptMine": "Keep local version (mine)",
    "contextMenu.acceptBase": "Restore original (base)",
    "contextMenu.markResolved": "Mark resolved (keep current state)",
    "contextMenu.forceUpdate": "Force Update",
    "contextMenu.addIgnore": "Add to ignore",
    "contextMenu.ignoreExt": "Ignore files with same extension (*{ext})",
    "contextMenu.resetTitle": "Confirm reset?",
    "contextMenu.resetBody": "This will perform git reset --soft HEAD, unstage all changes. File contents will not be lost.",
    "contextMenu.confirmReset": "Confirm Reset",
    "contextMenu.revertFailed": "Revert failed",
    "contextMenu.resolveFailed": "Resolve failed",
    "contextMenu.forceUpdateFailed": "Force update failed",
    "contextMenu.stashFailed": "Stash failed",
    "contextMenu.resetFailed": "Reset failed",
    "contextMenu.gitStashPush": "Git Stash Push (save changes)",
    "contextMenu.gitResetSoft": "Git Reset (soft)…",
    "contextMenu.logDetail": "Commit history",
    "commit.pushLabel": "Git push",
    "commit.onLabel": "On",
    "commit.offLabel": "Off",
    "commit.messageLabel": "Commit message",
    "commit.recentMessages": "Recent messages ▾",
    "commit.currentView": "Current view",
    "commit.allFiles": "All",
    "commit.browseGroup": "Browse group",
    "commit.viewDiff": "View diff",
    "commit.fileGroupOther": "Other",
    "commit.svnUntrackedHint": "SVN: {count} untracked file(s) will be auto-added",
    "commit.searchFiles": "Search files...",
    "review.reviewStateClean": "Ready for review",
    "review.reviewStatePending": "Changes pending",
    "review.reviewStateWaiting": "Waiting for detection",
    "summary.name": "Name",
    "summary.notes": "Notes",
    "summary.recentCommits": "Recent commits",
    "summary.loading": "Loading...",
    "summary.noCommits": "No commits",
    "general.changedFiles": "Changed files ({count})",
  },
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "zh-CN" || value === "en-US";
}

export function createTranslator(language: AppLanguage) {
  return (key: TranslationKey, params?: TranslationParams) => {
    let text = resources[language][key] ?? resources["zh-CN"][key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  };
}

export type Translator = ReturnType<typeof createTranslator>;

export function applyDocumentLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
}
