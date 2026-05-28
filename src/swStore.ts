import { create } from "zustand";

interface SWState {
  updateAvailable: boolean;
  setUpdateAvailable: (v: boolean) => void;
}

export const useSWStore = create<SWState>((set) => ({
  updateAvailable: false,
  setUpdateAvailable: (v) => set({ updateAvailable: v }),
}));
