import {restoreWorkspaceState, type WorkspaceTabState} from "./workspaceTabState";

export const WORKSPACE_TABS_STORAGE_PREFIX = "gpu-erp-v2:workspace-tabs:";

export function workspaceTabsStorageKey(userId: string) {
  return `${WORKSPACE_TABS_STORAGE_PREFIX}${userId}`;
}

export function readStoredWorkspaceState(userId: string, allowedIds: string[]) {
  if (typeof window === "undefined") return restoreWorkspaceState(null, allowedIds);
  try {
    return restoreWorkspaceState(window.localStorage.getItem(workspaceTabsStorageKey(userId)), allowedIds);
  } catch {
    return restoreWorkspaceState(null, allowedIds);
  }
}

export function writeStoredWorkspaceState(userId: string, state: WorkspaceTabState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(workspaceTabsStorageKey(userId), JSON.stringify(state));
  } catch {
    // Storage is an enhancement; navigation remains usable when it is blocked.
  }
}
