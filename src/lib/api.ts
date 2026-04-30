import { invoke } from "@tauri-apps/api/core";

export type VcsType = "git" | "svn" | "mixed" | "unknown";

export interface Repository {
  id: number;
  name: string;
  path: string;
  vcsType: VcsType;
  remoteUrl: string | null;
  branchOrRevision: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DetectedRepository {
  path: string;
  name: string;
  vcsType: VcsType;
  remoteUrl: string | null;
  branchOrRevision: string | null;
}

export interface AddRepositoryInput {
  path: string;
  name?: string;
}

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function listRepositories(): Promise<Repository[]> {
  if (!isTauriRuntime()) return [];
  return invoke<Repository[]>("list_repositories");
}

export async function addRepository(input: AddRepositoryInput): Promise<Repository> {
  return invoke<Repository>("add_repository", { input });
}

export async function detectRepository(path: string): Promise<DetectedRepository> {
  return invoke<DetectedRepository>("detect_repository", { path });
}

