import { afterEach, describe, expect, it, vi } from "vitest";
import { createSidebarPreferenceStore, isSidebarToggleShortcut, sidebarPreferenceKey, sidebarPreferenceStore } from "@/components/sidebar-preference";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const shortcut = {
  key: "b", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
  repeat: false, isComposing: false, defaultPrevented: false,
};

describe("foundation 侧栏折叠与快捷键", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("首次默认展开，兼容既有布尔记录，损坏内容不视为折叠", () => {
    const storage = memoryStorage();
    const store = createSidebarPreferenceStore(() => storage);
    expect(store.getSnapshot()).toBe(false);
    for (const value of ["true", "false", "broken"]) {
      storage.setItem(sidebarPreferenceKey, value);
      expect(store.getSnapshot()).toBe(value === "true");
    }
  });

  it("连续折叠与展开可刷新恢复，订阅只在操作时触发且能解除", () => {
    const storage = memoryStorage();
    const store = createSidebarPreferenceStore(() => storage);
    const listener = vi.fn(() => store.getSnapshot());
    const unsubscribe = store.subscribe(listener);
    store.toggle();
    expect(listener).toHaveLastReturnedWith(true);
    expect(createSidebarPreferenceStore(() => storage).getSnapshot()).toBe(true);
    store.toggle();
    expect(listener).toHaveLastReturnedWith(false);
    expect(createSidebarPreferenceStore(() => storage).getSnapshot()).toBe(false);
    unsubscribe();
    store.toggle();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("配额或写入失败不让旧记录撤销操作，反复点击仍正常切换", () => {
    const storage = memoryStorage();
    storage.setItem(sidebarPreferenceKey, "true");
    const store = createSidebarPreferenceStore(() => ({
      ...storage, setItem: () => { throw new Error("quota"); },
    }));
    store.toggle();
    expect(store.getSnapshot()).toBe(false);
    expect(store.getSnapshot()).toBe(false);
    expect(storage.getItem(sidebarPreferenceKey)).toBe("true");
    store.toggle();
    expect(store.getSnapshot()).toBe(true);
    store.toggle();
    expect(store.getSnapshot()).toBe(false);
  });

  it("完全拒绝存储时本次访问仍能折叠与展开", () => {
    const store = createSidebarPreferenceStore(() => { throw new Error("denied"); });
    expect(store.getSnapshot()).toBe(false);
    store.toggle();
    expect(store.getSnapshot()).toBe(true);
    store.toggle();
    expect(store.getSnapshot()).toBe(false);
  });

  it("其他标签更新与清除记录后采用真实值，清除恢复默认展开", () => {
    const storage = memoryStorage();
    const first = createSidebarPreferenceStore(() => storage);
    const second = createSidebarPreferenceStore(() => storage);
    first.toggle();
    expect(second.getSnapshot()).toBe(true);
    second.toggle();
    expect(first.getSnapshot()).toBe(false);
    first.toggle();
    storage.removeItem(sidebarPreferenceKey);
    expect(first.getSnapshot()).toBe(false);
    expect(second.getSnapshot()).toBe(false);
  });

  it("支持 Ctrl+B 与 Cmd+B，普通字母不触发", () => {
    expect(isSidebarToggleShortcut(shortcut, false)).toBe(true);
    expect(isSidebarToggleShortcut({ ...shortcut, key: "B", ctrlKey: false, metaKey: true }, false)).toBe(true);
    expect(isSidebarToggleShortcut({ ...shortcut, ctrlKey: false }, false)).toBe(false);
    expect(isSidebarToggleShortcut({ ...shortcut, key: "a" }, false)).toBe(false);
  });

  it("编辑输入、组合输入、长按、已处理事件及其他组合键不被抢占", () => {
    expect(isSidebarToggleShortcut(shortcut, true)).toBe(false);
    for (const flag of ["repeat", "isComposing", "defaultPrevented", "altKey", "shiftKey"] as const) {
      expect(isSidebarToggleShortcut({ ...shortcut, [flag]: true }, false)).toBe(false);
    }
  });

  it("浏览器只接收相关本地存储事件，解除订阅后不再更新监听者", () => {
    const storage = memoryStorage();
    const browser = Object.assign(new EventTarget(), { localStorage: storage });
    vi.stubGlobal("window", browser);
    const listener = vi.fn(() => sidebarPreferenceStore.getSnapshot());
    const unsubscribe = sidebarPreferenceStore.subscribe(listener);
    const emit = (key: string | null, storageArea = storage) => browser.dispatchEvent(
      Object.assign(new Event("storage"), { key, storageArea }),
    );
    storage.setItem(sidebarPreferenceKey, "true");
    emit(sidebarPreferenceKey);
    expect(listener).toHaveLastReturnedWith(true);
    emit("unrelated");
    emit(sidebarPreferenceKey, memoryStorage());
    expect(listener).toHaveBeenCalledTimes(1);
    storage.removeItem(sidebarPreferenceKey);
    emit(null);
    expect(listener).toHaveLastReturnedWith(false);
    unsubscribe();
    emit(sidebarPreferenceKey);
    sidebarPreferenceStore.toggle();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
