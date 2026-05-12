import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const repositories = [
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

    const changes = [
      { path: "src/App.tsx", status: "modified", vcsType: "git" },
      { path: "src-tauri/src/lib.rs", status: "modified", vcsType: "git" },
      { path: "CoilCalculatorWrapper/x64/runtime.dat", status: "untracked", vcsType: "svn" },
    ];

    const repositoryFiles = {
      repositoryId: 1,
      path: "",
      parentPath: null,
      entries: [
        {
          name: "src",
          path: "src",
          entryType: "directory",
          size: null,
          modifiedAt: 1777514400,
          children: [],
        },
        {
          name: "README.md",
          path: "README.md",
          entryType: "file",
          size: 3200,
          modifiedAt: 1777514400,
          children: [],
        },
      ],
    };

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        invoke: async (command: string, args: Record<string, unknown>) => {
          switch (command) {
            case "list_repositories":
              return repositories;
            case "consume_startup_context":
              return null;
            case "get_windows_context_menu_status":
              return {
                supported: true,
                installed: false,
                executablePath: "C:\\Users\\31047\\Desktop\\GVMT\\src-tauri\\target\\debug\\gvmt.exe",
                warning: null,
              };
            case "install_windows_context_menu":
              return {
                supported: true,
                installed: true,
                executablePath: "C:\\Users\\31047\\Desktop\\GVMT\\src-tauri\\target\\debug\\gvmt.exe",
                warning: null,
              };
            case "uninstall_windows_context_menu":
              return {
                supported: true,
                installed: false,
                executablePath: "C:\\Users\\31047\\Desktop\\GVMT\\src-tauri\\target\\debug\\gvmt.exe",
                warning: null,
              };
            case "get_repository_status":
              return {
                repositoryId: args.id,
                vcsType: "mixed",
                clean: false,
                warning: null,
                missingSvnCli: false,
                summary: {
                  total: changes.length,
                  added: 0,
                  modified: 2,
                  deleted: 0,
                  untracked: 1,
                  conflicted: 0,
                },
                changes,
              };
            case "list_repository_files":
              return repositoryFiles;
            case "read_repository_file":
              return {
                repositoryId: args.id,
                path: args.relativePath,
                name: "README.md",
                size: 3200,
                modifiedAt: 1777514400,
                content: "# GVMT\n\n本地仓库文件预览",
                isBinary: false,
                warning: null,
              };
            case "get_repository_diff":
              return {
                repositoryId: args.id,
                path: "src/App.tsx",
                vcsType: "git",
                status: "modified",
                content: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n-old\n+new",
                isBinary: false,
                warning: null,
              };
            case "list_quality_checks":
              return [
                {
                  checkType: "typescriptBuild",
                  label: "TypeScript build",
                  command: "npm run build",
                  available: true,
                  unavailableReason: null,
                },
                {
                  checkType: "playwrightUi",
                  label: "Playwright UI 测试",
                  command: "npm run test:ui",
                  available: true,
                  unavailableReason: null,
                },
                {
                  checkType: "cargoCheck",
                  label: "Rust cargo check",
                  command: "cargo check",
                  available: true,
                  unavailableReason: null,
                },
              ];
            case "run_quality_check":
              return {
                checkType: args.checkType,
                label: "TypeScript build",
                command: "npm run build",
                status: "success",
                success: true,
                startedAt: 1777514400,
                finishedAt: 1777514402,
                durationMs: 1200,
                summary: "TypeScript build 通过，用时 1.2s",
                output: "vite build ok",
                warning: null,
              };
            case "delete_repository":
              return null;
            case "commit_repository":
              return [
                {
                  operation: "commit",
                  vcsType: "git",
                  success: true,
                  summary: "Git 提交完成",
                  output: "mock commit",
                  warning: null,
                  missingSvnCli: false,
                },
              ];
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

test("workbench layout is clear and commit/delete flows open in dialogs", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "GVMT" })).toBeVisible();
  await expect(page.getByText("Selection backup").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "文件浏览" })).toBeVisible();
  await expect(page.getByText("README.md")).toBeVisible();
  await expect(page.getByText("本地仓库文件预览")).toHaveCount(0);
  await page.getByRole("button", { name: /README\.md/ }).dblclick();
  const filePreviewDialog = page.getByRole("dialog", { name: "README.md" });
  await expect(filePreviewDialog).toBeVisible();
  await expect(filePreviewDialog.getByText("本地仓库文件预览")).toBeVisible();
  await filePreviewDialog.getByRole("button", { title: "关闭" }).click();
  await expect(filePreviewDialog).toBeHidden();
  const commitButton = page.getByRole("button", { name: "提交", exact: true });
  await expect(commitButton).toBeVisible();

  const appChange = page.locator(".change-row", { hasText: "App.tsx" }).first();
  await appChange.click();
  await expect(page.getByRole("dialog", { name: "src/App.tsx" })).toHaveCount(0);
  await appChange.dblclick();
  const diffDialog = page.getByRole("dialog", { name: "src/App.tsx" });
  await expect(diffDialog).toBeVisible();
  await expect(diffDialog.getByText("new", { exact: true })).toBeVisible();
  await expect(diffDialog.locator(".syntax-keyword").first()).toBeVisible();
  await diffDialog.locator(".modal-heading").getByRole("button", { title: "关闭" }).click();
  await expect(diffDialog).toBeHidden();

  await page.locator(".change-row", { hasText: "lib.rs" }).first().click({ button: "right" });
  await page.getByRole("button", { name: "查看 diff" }).click();
  const contextDiffDialog = page.getByRole("dialog", { name: "src-tauri/src/lib.rs" });
  await expect(contextDiffDialog).toBeVisible();
  await contextDiffDialog.locator(".modal-heading").getByRole("button", { title: "关闭" }).click();

  const workspace = await page.locator(".workspace").boundingBox();
  const explorer = await page.locator(".explorer-pane").boundingBox();
  const changes = await page.locator(".changes-pane").boundingBox();
  expect(workspace).not.toBeNull();
  expect(explorer).not.toBeNull();
  expect(changes).not.toBeNull();
  expect(explorer!.x + explorer!.width).toBeLessThanOrEqual(workspace!.x + 2);
  expect(changes!.width).toBeGreaterThan(260);

  await page.getByRole("tab", { name: "评审与质量" }).click();
  await expect(page.getByText("http://svn.example.local/repo/选型管理/HaierSelectionAppDir")).toBeVisible();
  await expect(page.getByText("%E9%80%89%E5%9E%8B")).toHaveCount(0);
  await expect(page.getByText("本地质量检查", { exact: true })).toBeVisible();
  const typeScriptCheck = page.locator(".quality-check-item", { hasText: "TypeScript build" });
  await typeScriptCheck.getByRole("button", { name: "运行" }).click();
  await expect(typeScriptCheck.getByText("vite build ok")).toBeVisible();
  await expect(typeScriptCheck.getByText("TypeScript build 通过，用时 1.2s")).toBeVisible();

  await commitButton.click();
  const commitDialog = page.getByRole("dialog", { name: "提交变更" });
  await expect(commitDialog).toBeVisible();
  await expect(commitDialog.getByText("质量检查")).toBeVisible();
  await expect(commitDialog.getByText("TypeScript build 通过，用时 1.2s")).toBeVisible();
  await expect(commitDialog.getByText("选中文件", { exact: true })).toBeVisible();
  await expect(commitDialog.getByPlaceholder("说明这次变更的目的...")).toBeVisible();
  await commitDialog.locator(".modal-actions").getByRole("button", { name: "取消", exact: true }).click();
  await expect(commitDialog).toBeHidden();
  await page.waitForTimeout(500);

  await page.locator(".repo-list").getByRole("button", { name: /Selection backup/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "删除记录" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "删除仓库记录" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("将从 GVMT 的本地列表中移除")).toBeVisible();
  await deleteDialog.locator(".modal-actions").getByRole("button", { name: "取消", exact: true }).click();

  await page.locator(".activity-rail").getByRole("button", { name: "设置" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByText("Windows 右键菜单")).toBeVisible();
  await expect(settingsDialog.getByText("未安装")).toBeVisible();
  await settingsDialog.getByRole("button", { name: "安装右键菜单" }).click();
  await expect(settingsDialog.getByText("已安装")).toBeVisible();
  await settingsDialog.getByLabel("界面语言").selectOption("en-US");
  await expect(page.getByText("Repos").first()).toBeVisible();
  await expect(page.getByText("Update").first()).toBeVisible();
  await page.getByRole("dialog", { name: "Settings" }).getByText("Done").click();
});
