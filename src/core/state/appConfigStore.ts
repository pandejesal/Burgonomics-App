import { create } from "zustand";

// Runtime feature flags / remote config. Populated by /config API sync.
interface AppConfigState {
  maintenance: boolean;
  forceUpdate: boolean;
  minimumAppVersion: string;
  isOnline: boolean;
  setMaintenance: (v: boolean) => void;
  setForceUpdate: (v: boolean) => void;
  setOnline: (v: boolean) => void;
}

export const useAppConfig = create<AppConfigState>()((set) => ({
  maintenance: false,
  forceUpdate: false,
  minimumAppVersion: "1.0.0",
  isOnline: true,
  setMaintenance: (maintenance) => set({ maintenance }),
  setForceUpdate: (forceUpdate) => set({ forceUpdate }),
  setOnline: (isOnline) => set({ isOnline }),
}));
