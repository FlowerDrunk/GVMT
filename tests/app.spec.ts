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
  await page.getByRole("button", { name: /README\.md/ }).click();
  await expect(page.getByText("本地仓库文件预览")).toBeVisible();
  const commitButton = page.getByRole("button", { name: "提交", exact: true });
  await expect(commitButton).toBeVisible();

  const workspace = await page.locator(".workspace").boundingBox();
  const explorer = await page.locator(".explorer-pane").boundingBox();
  const changes = await page.locator(".changes-pane").boundingBox();
  expect(workspace).not.toBeNull();
  expect(explorer).not.toBeNull();
  expect(changes).not.toBeNull();
  expect(explorer!.x + explorer!.width).toBeLessThanOrEqual(workspace!.x + 2);
  expect(changes!.width).toBeGreaterThan(260);

  await page.getByRole("button", { name: "评审与质量" }).click();
  await expect(page.getByText("http://svn.example.local/repo/选型管理/HaierSelectionAppDir")).toBeVisible();
  await expect(page.getByText("%E9%80%89%E5%9E%8B")).toHaveCount(0);

  await commitButton.click();
  const commitDialog = page.getByRole("dialog", { name: "提交变更" });
  await expect(commitDialog).toBeVisible();
  await expect(commitDialog.getByText("选中文件", { exact: true })).toBeVisible();
  await expect(commitDialog.getByPlaceholder("说明这次变更的目的...")).toBeVisible();
  await commitDialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(commitDialog).toBeHidden();

  await page.locator(".repo-list").getByRole("button", { name: /Selection backup/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "删除仓库记录" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "删除仓库记录" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("不会删除磁盘上的仓库文件")).toBeVisible();
});
