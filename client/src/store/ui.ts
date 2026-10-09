import { create } from 'zustand';

interface UiState {
  projectId: number | null;
  setProjectId: (id: number | null) => void;
}

export const useUi = create<UiState>((set) => ({
  projectId: null,
  setProjectId: (id) => set({ projectId: id }),
}));
