import { z } from "zod";
import { aiConfigurationSchema, DEFAULT_AI } from "./ai/configuration-model";

const preferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  aiFloating: z.boolean(),
  ai: aiConfigurationSchema.default(DEFAULT_AI),
  autoTheme: z.boolean().default(false),
  dayStart: z.string().default("08:00"),
  nightStart: z.string().default("18:00"),
  eyeCare: z.boolean().default(false),
  eyeCareStart: z.string().default("21:00"),
  eyeCareEnd: z.string().default("07:00"),
  eyeCareStrength: z.number().min(0).max(100).default(30),
  backgroundImage: z.string().nullable().default(null),
});
export type UiPreferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: UiPreferences = {
  theme: "system",
  aiFloating: true,
  ai: DEFAULT_AI,
  autoTheme: false,
  dayStart: "08:00",
  nightStart: "18:00",
  eyeCare: false,
  eyeCareStart: "21:00",
  eyeCareEnd: "07:00",
  eyeCareStrength: 30,
  backgroundImage: null,
};
export const PREFERENCES_SERVER_SNAPSHOT = { preferences: DEFAULT_PREFERENCES, error: null as string | null };
export const preferencesKey = (userId: string) => `agilenest:preferences:v1:${userId}`;

export function createPreferencesStore(userId: string, storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const listeners = new Set<() => void>();
  let raw: string | null | undefined;
  let snapshot = PREFERENCES_SERVER_SNAPSHOT;
  const emit = () => listeners.forEach((listener) => listener());
  function getSnapshot() {
    try {
      const saved = storage().getItem(preferencesKey(userId));
      if (saved !== raw) {
        const value: unknown = saved === null ? null : JSON.parse(saved);
        const preferences = value === null ? DEFAULT_PREFERENCES : preferencesSchema.parse(value);
        snapshot = { preferences, error: null };
        if (value && typeof value === "object" && "ai" in value && value.ai && typeof value.ai === "object" && "model" in value.ai) {
          const cleaned = JSON.stringify(preferences);
          storage().setItem(preferencesKey(userId), cleaned);
          raw = cleaned;
        } else raw = saved;
      }
    } catch {
      if (!snapshot.error) snapshot = { ...snapshot, error: "无法读取偏好设置，请检查浏览器存储。" };
    }
    return snapshot;
  }
  return {
    getSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh() { raw = undefined; emit(); },
    reset() {
      try {
        storage().removeItem(preferencesKey(userId));
        raw = undefined;
        snapshot = PREFERENCES_SERVER_SNAPSHOT;
        emit();
        return true;
      } catch {
        snapshot = { preferences: DEFAULT_PREFERENCES, error: "无法重置偏好，浏览器存储不可用。" };
        emit();
        return false;
      }
    },
    update(change: Partial<UiPreferences>) {
      const current = getSnapshot();
      if (current.error) return false;
      try {
        const preferences = preferencesSchema.parse({ ...current.preferences, ...change });
        const saved = JSON.stringify(preferences);
        storage().setItem(preferencesKey(userId), saved);
        raw = saved;
        snapshot = { preferences, error: null };
        emit();
        return true;
      } catch {
        snapshot = { ...current, error: "偏好未保存，浏览器存储不可用或已满。" };
        emit();
        return false;
      }
    },
  };
}

const stores = new Map<string, ReturnType<typeof createPreferencesStore>>();
export function browserPreferencesStore(userId: string) {
  let store = stores.get(userId);
  if (!store) {
    store = createPreferencesStore(userId, () => window.localStorage);
    stores.set(userId, store);
  }
  return store;
}
