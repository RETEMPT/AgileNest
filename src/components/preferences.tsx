"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { browserPreferencesStore, PREFERENCES_SERVER_SNAPSHOT, preferencesKey } from "./preferences-store";

export function useUiPreferences(userId: string) {
  const store = useMemo(() => browserPreferencesStore(userId), [userId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => PREFERENCES_SERVER_SNAPSHOT);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === preferencesKey(userId)) store.refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store, userId]);
  return { ...snapshot, update: store.update, retry: store.refresh, reset: store.reset };
}

export function AppearanceProvider({ userId }: { userId: string }) {
  const { preferences } = useUiPreferences(userId);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => { media.removeEventListener("change", apply); delete document.documentElement.dataset.theme; };
  }, [preferences.theme]);
  return null;
}
