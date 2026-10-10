import { describe, expect, it } from "vitest";
import { createPreferencesStore, DEFAULT_PREFERENCES, preferencesKey } from "@/components/preferences-store";
import { settingsSection } from "@/modules/identity/settings-sections";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe("foundation 使用偏好", () => {
  it("主题与悬浮窗偏好按账号隔离，刷新后恢复", () => {
    const storage = memoryStorage();
    const first = createPreferencesStore("a", () => storage);
    expect(first.update({ theme: "dark", aiFloating: false })).toBe(true);
    expect(createPreferencesStore("a", () => storage).getSnapshot().preferences).toEqual({ ...DEFAULT_PREFERENCES, theme: "dark", aiFloating: false });
    expect(createPreferencesStore("b", () => storage).getSnapshot().preferences).toEqual(DEFAULT_PREFERENCES);
  });
  it("拒绝读取时不覆盖存储", () => {
    let writes = 0;
    const store = createPreferencesStore("a", () => ({ getItem: () => { throw new Error("denied"); }, setItem: () => { writes += 1; }, removeItem: () => { writes += 1; } }));
    expect(store.update({ theme: "dark" })).toBe(false);
    expect(writes).toBe(0);
    expect(store.getSnapshot().error).toContain("无法读取");
  });
  it("损坏或不支持的偏好不覆盖原值", () => {
    for (const value of ["{broken", JSON.stringify({ theme: "unknown", aiFloating: true })]) {
      const storage = memoryStorage();
      storage.setItem(preferencesKey("a"), value);
      const store = createPreferencesStore("a", () => storage);
      expect(store.update({ theme: "light" })).toBe(false);
      expect(storage.getItem(preferencesKey("a"))).toBe(value);
    }
  });
  it("写入失败保持当前主题，恢复后可重试", () => {
    const storage = memoryStorage();
    let blocked = true;
    const store = createPreferencesStore("a", () => ({ ...storage, setItem: (key, value) => { if (blocked) throw new Error("quota"); storage.setItem(key, value); } }));
    expect(store.update({ theme: "dark" })).toBe(false);
    expect(store.getSnapshot().preferences.theme).toBe("system");
    blocked = false;
    store.refresh();
    expect(store.update({ theme: "dark" })).toBe(true);
    expect(store.getSnapshot().error).toBeNull();
  });
  it("损坏值可重置回默认偏好并重新保存", () => {
    const storage = memoryStorage();
    storage.setItem(preferencesKey("a"), "{broken");
    const store = createPreferencesStore("a", () => storage);
    expect(store.update({ theme: "dark" })).toBe(false);
    expect(store.reset()).toBe(true);
    expect(storage.getItem(preferencesKey("a"))).toBeNull();
    expect(store.getSnapshot()).toEqual({ preferences: DEFAULT_PREFERENCES, error: null });
    expect(store.update({ theme: "dark" })).toBe(true);
    expect(createPreferencesStore("a", () => storage).getSnapshot().preferences.theme).toBe("dark");
  });
  it("同一浏览器的设置修改通知所有订阅者", () => {
    const storage = memoryStorage();
    const store = createPreferencesStore("a", () => storage);
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls += 1; });
    store.update({ aiFloating: false });
    expect(calls).toBe(1);
    unsubscribe();
    store.update({ theme: "light" });
    expect(calls).toBe(1);
  });
  it("其他标签页修改经刷新读取，未知分区回到个人资料", () => {
    const storage = memoryStorage();
    const store = createPreferencesStore("a", () => storage);
    store.getSnapshot();
    storage.setItem(preferencesKey("a"), JSON.stringify({ theme: "light", aiFloating: false }));
    store.refresh();
    expect(store.getSnapshot().preferences.aiFloating).toBe(false);
    expect(settingsSection("appearance")).toBe("appearance");
    expect(settingsSection("unknown")).toBe("profile");
  });
});
