export interface WorkspaceTabState {
  openIds: string[];
  pinnedIds: string[];
  recentIds: string[];
  activeId: string;
}

export const WORKSPACE_HOME_ID = "dashboard";
export const WORKSPACE_MAX_TABS = 10;

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

function keepAllowed(values: string[], allowedIds: string[]) {
  const allowed = new Set(allowedIds);
  return unique(values).filter((id) => allowed.has(id));
}

function normalizeState(state: WorkspaceTabState, allowedIds: string[]) {
  const allowed = new Set(allowedIds);
  let openIds = unique([WORKSPACE_HOME_ID, ...state.openIds]).filter((id) => allowed.has(id) || id === WORKSPACE_HOME_ID);
  const requestedPinnedIds = unique([WORKSPACE_HOME_ID, ...state.pinnedIds]).filter((id) => openIds.includes(id));
  const recentIdsBeforeTrim = unique([...state.recentIds, ...openIds]).filter((id) => openIds.includes(id));
  while (openIds.length > WORKSPACE_MAX_TABS) {
    const removable = openIds
      .filter((id) => id !== WORKSPACE_HOME_ID && !requestedPinnedIds.includes(id))
      .sort((left, right) => recentIdsBeforeTrim.indexOf(left) - recentIdsBeforeTrim.indexOf(right))[0];
    const fallback = openIds.find((id) => id !== WORKSPACE_HOME_ID && !requestedPinnedIds.includes(id));
    const candidate = removable || fallback || openIds[openIds.length - 1];
    openIds = openIds.filter((id) => id !== candidate);
  }
  const pinnedIds = requestedPinnedIds.filter((id) => openIds.includes(id));
  const recentIds = unique([...recentIdsBeforeTrim, ...openIds]).filter((id) => openIds.includes(id));
  const activeId = openIds.includes(state.activeId) ? state.activeId : WORKSPACE_HOME_ID;
  return {openIds, pinnedIds, recentIds, activeId};
}

export function createWorkspaceState(activeId = WORKSPACE_HOME_ID): WorkspaceTabState {
  const target = activeId || WORKSPACE_HOME_ID;
  return {
    openIds: target === WORKSPACE_HOME_ID ? [WORKSPACE_HOME_ID] : [WORKSPACE_HOME_ID, target],
    pinnedIds: [WORKSPACE_HOME_ID],
    recentIds: target === WORKSPACE_HOME_ID ? [WORKSPACE_HOME_ID] : [WORKSPACE_HOME_ID, target],
    activeId: target,
  };
}

export function restoreWorkspaceState(raw: string | null, allowedIds: string[], requestedId?: string | null): WorkspaceTabState {
  if (!raw) return normalizeState(createWorkspaceState(requestedId || WORKSPACE_HOME_ID), allowedIds);
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceTabState>;
    const restored: WorkspaceTabState = {
      openIds: Array.isArray(parsed.openIds) ? parsed.openIds.filter((id): id is string => typeof id === "string") : [],
      pinnedIds: Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds.filter((id): id is string => typeof id === "string") : [],
      recentIds: Array.isArray(parsed.recentIds) ? parsed.recentIds.filter((id): id is string => typeof id === "string") : [],
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : WORKSPACE_HOME_ID,
    };
    const state = normalizeState(restored, allowedIds);
    if (requestedId && (allowedIds.includes(requestedId) || requestedId === WORKSPACE_HOME_ID)) return openWorkspaceTab(state, requestedId);
    return state;
  } catch {
    return normalizeState(createWorkspaceState(), allowedIds);
  }
}

/**
 * Returns the existing tab that opening `id` would evict at capacity.
 * Keeping this decision separate lets the shell ask the runtime whether the
 * candidate contains unsaved work before mutating the tab state.
 */
export function workspaceTabToEvict(state: WorkspaceTabState, id: string): string | null {
  if (!id || state.openIds.includes(id) || state.openIds.length < WORKSPACE_MAX_TABS) return null;
  return state.openIds.find((candidate) => candidate !== id && candidate !== WORKSPACE_HOME_ID && !state.pinnedIds.includes(candidate)) || null;
}

export function openWorkspaceTab(state: WorkspaceTabState, id: string): WorkspaceTabState {
  if (!id) return state;
  const openIds = state.openIds.includes(id) ? [...state.openIds] : [...state.openIds, id];
  const removable = workspaceTabToEvict(state, id);
  if (removable) openIds.splice(openIds.indexOf(removable), 1);
  const recentIds = [...state.recentIds.filter((candidate) => candidate !== id && openIds.includes(candidate)), id];
  return normalizeState({openIds, pinnedIds: state.pinnedIds, recentIds, activeId: id}, [WORKSPACE_HOME_ID, ...openIds]);
}

export function closeWorkspaceTab(state: WorkspaceTabState, id: string): WorkspaceTabState {
  if (id === WORKSPACE_HOME_ID || !state.openIds.includes(id)) return state;
  const openIds = state.openIds.filter((candidate) => candidate !== id);
  const recentIds = state.recentIds.filter((candidate) => candidate !== id);
  const fallback = [...recentIds].reverse().find((candidate) => openIds.includes(candidate)) || openIds[openIds.length - 1] || WORKSPACE_HOME_ID;
  return {
    openIds: openIds.length ? openIds : [WORKSPACE_HOME_ID],
    pinnedIds: state.pinnedIds.filter((candidate) => candidate !== id && openIds.includes(candidate)).concat(WORKSPACE_HOME_ID),
    recentIds: [...recentIds.filter((candidate) => openIds.includes(candidate)), fallback],
    activeId: state.activeId === id ? fallback : state.activeId,
  };
}

export function closeOtherWorkspaceTabs(state: WorkspaceTabState, id: string): WorkspaceTabState {
  const openIds = state.openIds.filter((candidate) => candidate === id || state.pinnedIds.includes(candidate) || candidate === WORKSPACE_HOME_ID);
  const activeId = openIds.includes(id) ? id : WORKSPACE_HOME_ID;
  return normalizeState({openIds, pinnedIds: state.pinnedIds, recentIds: [WORKSPACE_HOME_ID, id], activeId}, [WORKSPACE_HOME_ID, ...openIds]);
}

export function closeClosableWorkspaceTabs(state: WorkspaceTabState): WorkspaceTabState {
  const openIds = state.openIds.filter((id) => state.pinnedIds.includes(id) || id === WORKSPACE_HOME_ID);
  const activeId = openIds.includes(state.activeId) ? state.activeId : WORKSPACE_HOME_ID;
  return normalizeState({openIds, pinnedIds: state.pinnedIds, recentIds: openIds, activeId}, [WORKSPACE_HOME_ID, ...openIds]);
}

export function toggleWorkspaceTabPin(state: WorkspaceTabState, id: string): WorkspaceTabState {
  if (id === WORKSPACE_HOME_ID || !state.openIds.includes(id)) return state;
  const pinnedIds = state.pinnedIds.includes(id) ? state.pinnedIds.filter((candidate) => candidate !== id) : [...state.pinnedIds, id];
  return {...state, pinnedIds};
}

export function filterWorkspaceStateByPermissions(state: WorkspaceTabState, allowedIds: string[]): WorkspaceTabState {
  const openIds = keepAllowed(state.openIds, allowedIds);
  return normalizeState({...state, openIds}, allowedIds);
}
