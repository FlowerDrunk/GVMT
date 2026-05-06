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
  | "settings.done";

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
    "command.refreshStatus": "刷新状态",
    "command.commit": "提交",
    "command.ignore": "忽略",
    "command.update": "更新",
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
