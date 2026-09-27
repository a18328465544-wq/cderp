import type {NavigationItem} from "@/src/config/navigation";
import {WORKSPACE_HOME_ID} from "./workspaceTabState";

/**
 * Workspace tabs represent pages, not every historical menu alias.
 *
 * The dashboard is the one canonical 首页 entry. Older persisted workspace
 * state can contain an alias with the same label or route, so the visible tab
 * list must collapse those aliases before rendering. The first item wins;
 * WorkspaceTabs orders pinned items first, which keeps the canonical dashboard
 * ahead of a stale alias.
 */
export function dedupeWorkspaceTabItems(items: NavigationItem[]) {
  const home = items.find((item) => item.id === WORKSPACE_HOME_ID);
  const seen = new Set<string>();

  return items.filter((item) => {
    const isHomeAlias = item.id === WORKSPACE_HOME_ID ||
      (home && (item.path === home.path || item.label === home.label));
    const key = isHomeAlias ? `home:${WORKSPACE_HOME_ID}` : `path:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
