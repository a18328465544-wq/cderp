import {create} from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  aiDrawerOpen: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (value: boolean) => void;
  setAiDrawerOpen: (value: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  aiDrawerOpen: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({sidebarCollapsed}),
  toggleSidebar: () => set((state) => ({sidebarCollapsed: !state.sidebarCollapsed})),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({mobileSidebarOpen}),
  setAiDrawerOpen: (aiDrawerOpen) => set({aiDrawerOpen}),
}));
