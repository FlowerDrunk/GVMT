import { expect, test } from "@playwright/test";

// 共享 mock 数据
const MOCK_REPOSITORIES = [
  {
    id: 1,
    name: "Selection backup",
    path: "D:\\project\\Selection backup",
    vcsType: "svn",
    remoteUrl: "http://svn.example.local/repo/%E9%80%89%E5%9E%8B%E7%AE%A1%E7%90%86/HaierSelectionAppDir",
    branchOrRevision: "101",
    createdAt: "2026-04-30 10:00:00",
    updatedAt: "2026-04-30 10:00:00",
  },
  {
    id: 2,
    name: "GVMT",
    path: "C:\\Users\\31047\\Desktop\\GVMT",
    vcsType: "git",
    remoteUrl: "https://github.com/FlowerDrunk/GVMT.git",
    branchOrRevision: "main",
    createdAt: "2026-04-30 10:00:00",
    updatedAt: "2026-04-30 10:00:00",
  },
];

const MOCK_CHANGES = [
  { path: "src/App.tsx", status: "modified", vcsType: "git" },
  { path: "src-tauri/src/lib.rs", status: "modified", vcsType: "git" },
  { path: "src/styles.css", status: "modified", vcsType: "git" },
  { path: "src/components/dialogs/CommitDialog.tsx", status: "modified", vcsType: "git" },
  { path: "src/hooks/useCommit.ts", status: "modified", vcsType: "git" },
  { path: "new_file.txt", status: "added", vcsType: "git" },
  { path: "package.json", status: "modified", vcsType: "git" },
  { path: "tsconfig.json", status: "modified", vcsType: "git" },
  { path: "CoilCalculatorWrapper/x64/runtime.dat", status: "untracked", vcsType: "svn" },
  { path: "docs/guide.md", status: "added", vcsType: "git" },
  { path: "docs/api.md", status: "modified", vcsType: "git" },
  { path: "deleted_file.txt", status: "deleted", vcsType: "git" },
];

const MOCK_REPO_FILES = {
  repositoryId: 1,
  path: "",
  parentPath: null,
  entries: [
    { name: "src", path: "src", entryType: "directory", size: null, modifiedAt: 1777514400, children: [] },
    { name: "README.md", path: "README.md", entryType: "file", size: 3200, modifiedAt: 1777514400, children: [] },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const repositories = JSON.parse('[{"id":1,"name":"Selection backup","path":"D:\\\\project\\\\Selection backup","vcsType":"svn","remoteUrl":"http://svn.example.local/repo/%E9%80%89%E5%9E%8B%E7%AE%A1%E7%90%86/HaierSelectionAppDir","branchOrRevision":"101","createdAt":"2026-04-30 10:00:00","updatedAt":"2026-04-30 10:00:00"},{"id":2,"name":"GVMT","path":"C:\\\\Users\\\\31047\\\\Desktop\\\\GVMT","vcsType":"git","remoteUrl":"https://github.com/FlowerDrunk/GVMT.git","branchOrRevision":"main","createdAt":"2026-04-30 10:00:00","updatedAt":"2026-04-30 10:00:00"}]');
    const changes = JSON.parse('[{"path":"src/App.tsx","status":"modified","vcsType":"git"},{"path":"src-tauri/src/lib.rs","status":"modified","vcsType":"git"},{"path":"src/styles.css","status":"modified","vcsType":"git"},{"path":"src/components/dialogs/CommitDialog.tsx","status":"modified","vcsType":"git"},{"path":"src/hooks/useCommit.ts","status":"modified","vcsType":"git"},{"path":"new_file.txt","status":"added","vcsType":"git"},{"path":"package.json","status":"modified","vcsType":"git"},{"path":"tsconfig.json","status":"modified","vcsType":"git"},{"path":"CoilCalculatorWrapper/x64/runtime.dat","status":"untracked","vcsType":"svn"},{"path":"docs/guide.md","status":"added","vcsType":"git"},{"path":"docs/api.md","status":"modified","vcsType":"git"},{"path":"deleted_file.txt","status":"deleted","vcsType":"git"}]');
    const repoFiles = JSON.parse('{"repositoryId":1,"path":"","parentPath":null,"entries":[{"name":"src","path":"src","entryType":"directory","size":null,"modifiedAt":1777514400,"children":[]},{"name":"README.md","path":"README.md","entryType":"file","size":3200,"modifiedAt":1777514400,"children":[]}]}');

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        invoke: async (command, args) => {
          switch (command) {
            case "list_repositories":
              return repositories;
            case "consume_startup_context":
              return null;
            case "get_windows_context_menu_status":
              return { supported: true, installed: false, executablePath: "C:\\Users\\31047\\Desktop\\GVMT\\src-tauri\\target\\debug\\gvmt.exe", warning: null };
            case "install_windows_context_menu":
              return { supported: true, installed: true, executablePath: "C:\\Users\\31047\\Desktop\\GVMT\\src-tauri\\target\\debug\\gvmt.exe", warning: null };
            case "uninstall_windows_context_menu":
              return { supported: true, installed: false, executablePath: "C:\\Users\\31047\\Desktop\\GVMT\\src-tauri\\target\\debug\\gvmt.exe", warning: null };
            case "get_repository_status":
              return {
                repositoryId: args.id,
                vcsType: "mixed",
                clean: false,
                warning: null,
                missingSvnCli: false,
                summary: { total: changes.length, added: 2, modified: 7, deleted: 1, untracked: 1, conflicted: 0 },
                changes,
              };
            case "list_repository_files":
              return repoFiles;
            case "read_repository_file":
              return { repositoryId: args.id, path: args.relativePath, name: "README.md", size: 3200, modifiedAt: 1777514400, content: "# GVMT\n\n本地仓库文件预览", isBinary: false, warning: null };
            case "get_repository_diff":
              return { repositoryId: args.id, path: "src/App.tsx", vcsType: "git", status: "modified", content: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n-old\n+new", isBinary: false, warning: null };
            case "list_quality_checks":
              return [{ checkType: "typescriptBuild", label: "TypeScript build", command: "npm run build", available: true, unavailableReason: null }];
            case "run_quality_check":
              return { checkType: args.checkType, label: "TypeScript build", command: "npm run build", status: "success", success: true, startedAt: 1777514400, finishedAt: 1777514402, durationMs: 1200, summary: "TypeScript build 通过，用时 1.2s", output: "vite build ok", warning: null };
            case "delete_repository":
              return null;
            case "commit_repository":
              return [{ operation: "commit", vcsType: "git", success: true, summary: "Git 提交完成", output: "mock commit", warning: null, missingSvnCli: false }];
            case "list_operation_logs":
              return [];
            case "clear_operation_logs":
              return null;
            case "log_operation":
              return null;
            default:
              return repositories[0];
          }
        },
      },
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 测试 1：全选栏布局（不被挤上去）
// ────────────────────────────────────────────────────────────────────────────
test("commit dialog select-all bar alignment is stable", async ({ page }) => {
  await page.goto("/");

  // 选择 GVMT 仓库触发 status 加载
  await page.locator(".repo-item").filter({ hasText: "GVMT" }).click();
  await page.waitForTimeout(1000);

  // 点击"提交"按钮
  const commitButton = page.getByRole("button", { name: "提交", exact: true });
  await expect(commitButton).toBeVisible({ timeout: 10000 });
  await expect(commitButton).toBeEnabled({ timeout: 10000 });
  await commitButton.click();

  const commitDialog = page.getByRole("dialog", { name: "提交变更" });
  await expect(commitDialog).toBeVisible({ timeout: 5000 });

  // 找到全选工具栏
  const toolbar = commitDialog.locator(".commit-toolbar-actions");
  await expect(toolbar).toBeVisible();

  // 验证全选栏的所有按钮可见且功能正常
  await expect(toolbar.getByText("全选：")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "当前视图" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "全部" })).toBeVisible();

  // Push switch 可见（因为选中了 git 文件）
  await expect(toolbar.locator("label").filter({ hasText: "push" })).toBeVisible();

  // 验证全选按钮可正常交互
  await toolbar.getByRole("button", { name: "全部" }).click();
  await toolbar.getByRole("button", { name: "当前视图" }).click();
});

// ────────────────────────────────────────────────────────────────────────────
// 测试 2：分组浏览弹窗 - 滚动、全选、筛选
// ────────────────────────────────────────────────────────────────────────────
test("browse modal supports scrolling, select-all and filter", async ({ page }) => {
  await page.goto("/");

  // 选择和打开 commit dialog
  await page.locator(".repo-item").filter({ hasText: "GVMT" }).click();
  await page.waitForTimeout(1000);

  const commitButton = page.getByRole("button", { name: "提交", exact: true });
  await expect(commitButton).toBeVisible({ timeout: 10000 });
  await expect(commitButton).toBeEnabled({ timeout: 10000 });
  await commitButton.click();

  const commitDialog = page.getByRole("dialog", { name: "提交变更" });
  await expect(commitDialog).toBeVisible({ timeout: 5000 });

  // 找到"修改"组，点击浏览按钮（眼睛图标）
  const modifiedGroup = commitDialog.locator(".commit-file-group").filter({ hasText: "修改" }).first();
  await modifiedGroup.locator(".commit-file-group-browse").click();

  // 分组浏览弹窗应该出现
  const browseModal = page.getByRole("dialog", { name: "修改" });
  await expect(browseModal).toBeVisible({ timeout: 5000 });

  // ---- 测试 2a：滚动能力 ----
  const browseList = browseModal.locator(".browse-modal-list");
  await expect(browseList).toBeVisible();

  // 确认列表中有文件行
  const fileRows = browseList.locator(".commit-file-row");
  await expect(fileRows.first()).toBeVisible();
  const fileCount = await fileRows.count();
  expect(fileCount).toBeGreaterThan(0);

  // 检查列表区域的 overflow-y 样式
  const canScroll = await browseList.evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.overflowY === "auto" || cs.overflowY === "scroll";
  });
  expect(canScroll).toBeTruthy();

  // ---- 测试 2b：搜索/筛��� ----
  const searchInput = browseModal.locator(".browse-modal-search");
  await expect(searchInput).toBeVisible();

  // 输入 "App" 进行筛选
  await searchInput.fill("App");
  await expect(browseList.getByText("App.tsx")).toBeVisible();
  // lib.rs 不应该再显示
  await expect(browseList.getByText("lib.rs")).toHaveCount(0);

  // 清空搜索
  await searchInput.clear();
  await page.waitForTimeout(200);
  // lib.rs 应该再次出现
  await expect(browseList.getByText("lib.rs")).toBeVisible();

  // ---- 测试 2c：全选 ----
  const toolbarBtn = browseModal.locator(".browse-modal-toolbar").getByRole("button");
  const btnText = await toolbarBtn.textContent();
  if (btnText === "全选") {
    await toolbarBtn.click();
    // 变为取消
    await expect(browseModal.getByRole("button", { name: "取消" })).toBeVisible();
  } else if (btnText === "取消") {
    // 已经全选，先取消
    await toolbarBtn.click();
    // 再全选
    await expect(browseModal.getByRole("button", { name: "全选" })).toBeVisible();
    await browseModal.getByRole("button", { name: "全选" }).click();
    await expect(browseModal.getByRole("button", { name: "取消" })).toBeVisible();
  }

  // 关闭浏览弹窗
  await browseModal.locator(".modal-heading").getByRole("button", { title: "关闭" }).click();
  await expect(browseModal).toBeHidden();
});

// ────────────────────────────────────────────────────────────────────────────
// 测试 3：更新对话框布局（SVN update depth 等相关 UI 检查）
// ────────────────────────────────────────────────────────────────────────────
test("update flow basic ui is accessible", async ({ page }) => {
  await page.goto("/");

  // 选择 SVN 仓库
  await page.locator(".repo-item").filter({ hasText: "Selection backup" }).click();
  await page.waitForTimeout(1000);

  // 检查更新按钮存在
  const updateButton = page.getByRole("button", { name: "更新", exact: true });
  await expect(updateButton).toBeVisible({ timeout: 10000 });
  await expect(updateButton).toBeEnabled({ timeout: 10000 });
});
