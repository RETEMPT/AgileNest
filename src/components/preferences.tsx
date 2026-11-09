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

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function isNight(now: Date, dayStart: string, nightStart: string): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const day = toMinutes(dayStart);
  const night = toMinutes(nightStart);
  if (day === night) return false;
  if (day < night) return current >= night || current < day;
  return current >= night && current < day;
}

function inTimeWindow(now: Date, start: string, end: string): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === to) return false;
  if (from < to) return current >= from && current < to;
  return current >= from || current < to;
}

export function AppearanceProvider({ userId }: { userId: string }) {
  const { preferences } = useUiPreferences(userId);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const now = new Date();
      const theme = preferences.autoTheme
        ? (isNight(now, preferences.dayStart, preferences.nightStart) ? "dark" : "light")
        : preferences.theme === "system"
          ? (media.matches ? "dark" : "light")
          : preferences.theme;
      document.documentElement.dataset.theme = theme;

      const eyeCareOn = preferences.eyeCare && inTimeWindow(now, preferences.eyeCareStart, preferences.eyeCareEnd);
      document.documentElement.dataset.eyecare = eyeCareOn ? "on" : "off";
      document.documentElement.style.setProperty("--eyecare-alpha", String((preferences.eyeCareStrength / 100) * 0.45));

      if (preferences.backgroundImage) {
        document.documentElement.dataset.skin = "on";
        document.documentElement.style.setProperty("--skin-image", `url("${preferences.backgroundImage}")`);
      } else {
        delete document.documentElement.dataset.skin;
        document.documentElement.style.removeProperty("--skin-image");
      }
    };
    apply();
    media.addEventListener("change", apply);
    const timer = window.setInterval(apply, 30_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") apply(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      media.removeEventListener("change", apply);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      delete document.documentElement.dataset.theme;
      delete document.documentElement.dataset.eyecare;
      delete document.documentElement.dataset.skin;
      document.documentElement.style.removeProperty("--skin-image");
      document.documentElement.style.removeProperty("--eyecare-alpha");
    };
  }, [preferences]);
  return null;
}
