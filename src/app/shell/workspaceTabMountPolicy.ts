/** A restored tab is mounted only after it has actually been viewed this session. */
export function shouldMountWorkspaceTab(tabId: string, activeTabId: string | undefined, visitedTabIds: readonly string[]) {
  return tabId === activeTabId || visitedTabIds.includes(tabId);
}

export function retainVisitedWorkspaceTabs(visitedTabIds: readonly string[], activeTabId: string | undefined, openTabIds: readonly string[]) {
  const open = new Set(openTabIds);
  const next = visitedTabIds.filter((id) => open.has(id));
  if (activeTabId && open.has(activeTabId) && !next.includes(activeTabId)) next.push(activeTabId);
  return next;
}
