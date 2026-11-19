import { afterEach, describe, expect, it, vi } from "vitest";
import { browserSidebarProjectStore, createSidebarProjectStore, resolveSidebarProject, sidebarProjectKey } from "@/components/sidebar-project";

const first = { id: "f186a2e1-1db7-4fa4-a6dc-82ef609929a0", name: "课程项目" };
const second = { id: "ef64b5c8-2c76-4b7a-a1f7-bbfbc3e24e52", name: "研究项目" };
const projects = [first, second];

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("foundation 侧栏项目上下文", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("首次进入全局页面不自动选择任何项目", () => {
    expect(resolveSidebarProject("/home", projects, null)).toBeUndefined();
    expect(resolveSidebarProject("/t", projects, null)).toBeUndefined();
  });

  it("选中项目后，全局页面、操作刷新和重新打开均保留项目导航", () => {
    const storage = memoryStorage();
    const store = createSidebarProjectStore("member", () => storage);
    store.select(first.id);
    for (const pathname of ["/home", "/settings", "/notifications", "/calendar", "/ai", "/t/team/resources"]) {
      expect(resolveSidebarProject(pathname, projects, store.getSnapshot())).toBe(first);
      const refreshed = createSidebarProjectStore("member", () => storage);
      expect(resolveSidebarProject(pathname, projects, refreshed.getSnapshot())).toBe(first);
    }
  });

  it("进入另一项目及前进后退时使用地址中的项目并记住新的选择", () => {
    const storage = memoryStorage();
    const store = createSidebarProjectStore("member", () => storage);
    store.select(first.id);
    for (const project of [second, first, second]) {
      const selected = resolveSidebarProject(`/p/${project.id}/tasks/task`, projects, store.getSnapshot());
      expect(selected).toBe(project);
      store.select(selected!.id);
      expect(resolveSidebarProject("/home", projects, store.getSnapshot())).toBe(project);
    }
  });

  it("地址指向无权访问的项目时不展示另一个项目的导航", () => {
    expect(resolveSidebarProject(`/p/${second.id}/board`, [first], first.id)).toBeUndefined();
    expect(resolveSidebarProject("/projects", projects, first.id)).toBe(first);
  });

  it("记住的项目不在当前可访问列表时不回退到首个项目，可清除旧选择", () => {
    const storage = memoryStorage();
    const store = createSidebarProjectStore("member", () => storage);
    store.select(first.id);
    expect(resolveSidebarProject("/settings", [second], store.getSnapshot())).toBeUndefined();
    store.select(null);
    expect(storage.getItem(sidebarProjectKey("member"))).toBeNull();
    expect(createSidebarProjectStore("member", () => storage).getSnapshot()).toBeNull();
    expect(resolveSidebarProject("/home", [], first.id)).toBeUndefined();
  });

  it("切换账号不会继承另一个账号的选择", () => {
    const storage = memoryStorage();
    const firstAccount = createSidebarProjectStore("a", () => storage);
    const secondAccount = createSidebarProjectStore("b", () => storage);
    firstAccount.select(first.id);
    expect(secondAccount.getSnapshot()).toBeNull();
    secondAccount.select(second.id);
    expect(createSidebarProjectStore("a", () => storage).getSnapshot()).toBe(first.id);
    expect(createSidebarProjectStore("b", () => storage).getSnapshot()).toBe(second.id);
  });

  it("存储不可用时仍在本次访问保持选择，失败写入不恢复到旧值", () => {
    const storage = memoryStorage();
    storage.setItem(sidebarProjectKey("member"), first.id);
    const store = createSidebarProjectStore("member", () => ({ ...storage, setItem: () => { throw new Error("quota"); } }));
    store.select(second.id);
    expect(resolveSidebarProject("/home", projects, store.getSnapshot())).toBe(second);
    expect(storage.getItem(sidebarProjectKey("member"))).toBe(first.id);
    const denied = createSidebarProjectStore("other", () => { throw new Error("denied"); });
    denied.select(first.id);
    expect(resolveSidebarProject("/settings", projects, denied.getSnapshot())).toBe(first);
  });

  it("损坏或恶意存储不成为项目链接，可由真实项目导航修复", () => {
    for (const value of ["{broken", "javascript:alert(1)", "/p/other", "undefined"]) {
      const storage = memoryStorage();
      storage.setItem(sidebarProjectKey("member"), value);
      const store = createSidebarProjectStore("member", () => storage);
      expect(store.getSnapshot()).toBeNull();
      store.select(first.id);
      expect(createSidebarProjectStore("member", () => storage).getSnapshot()).toBe(first.id);
      store.select("/t/other");
      expect(store.getSnapshot()).toBe(first.id);
    }
  });

  it("清理损坏记录时实际移除原始存储，空快照不阻止清理", () => {
    const storage = memoryStorage();
    storage.setItem(sidebarProjectKey("member"), "broken");
    const store = createSidebarProjectStore("member", () => storage);
    expect(store.getSnapshot()).toBeNull();
    store.select(null);
    expect(storage.getItem(sidebarProjectKey("member"))).toBeNull();
  });

  it("其他标签切换或清除后读取最新记录，项目地址仍优先且读取不回写", () => {
    const storage = memoryStorage();
    const firstTab = createSidebarProjectStore("member", () => storage);
    const secondTab = createSidebarProjectStore("member", () => storage);
    firstTab.select(first.id);
    expect(secondTab.getSnapshot()).toBe(first.id);
    secondTab.select(second.id);
    expect(resolveSidebarProject(`/p/${first.id}/board`, projects, firstTab.getSnapshot())).toBe(first);
    expect(resolveSidebarProject("/home", projects, firstTab.getSnapshot())).toBe(second);
    expect(storage.getItem(sidebarProjectKey("member"))).toBe(second.id);
    firstTab.select(first.id);
    expect(resolveSidebarProject("/home", projects, secondTab.getSnapshot())).toBe(first);
    secondTab.select(null);
    expect(firstTab.getSnapshot()).toBeNull();
  });

  it("清理存储失败仍在当前访问清除失效项目，存储恢复后可重试", () => {
    const storage = memoryStorage();
    storage.setItem(sidebarProjectKey("member"), first.id);
    let denied = true;
    const store = createSidebarProjectStore("member", () => ({
      ...storage,
      removeItem(key: string) {
        if (denied) throw new Error("denied");
        storage.removeItem(key);
      },
    }));
    store.select(null);
    expect(store.getSnapshot()).toBeNull();
    expect(storage.getItem(sidebarProjectKey("member"))).toBe(first.id);
    denied = false;
    store.select(null);
    expect(storage.getItem(sidebarProjectKey("member"))).toBeNull();
  });

  it("重复选择不重复通知或写入，取消订阅后停止通知", () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, "setItem");
    const store = createSidebarProjectStore("member", () => storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.select(first.id);
    store.select(first.id);
    store.select("not-a-project");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.select(second.id);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("写入失败的内存选择不会被相同旧值撤销，真实外部更新仍可同步", () => {
    const storage = memoryStorage();
    storage.setItem(sidebarProjectKey("member"), first.id);
    const store = createSidebarProjectStore("member", () => ({
      ...storage,
      setItem: () => { throw new Error("quota"); },
    }));
    store.select(second.id);
    expect(store.getSnapshot()).toBe(second.id);
    expect(store.getSnapshot()).toBe(second.id);
    storage.removeItem(sidebarProjectKey("member"));
    expect(store.getSnapshot()).toBeNull();
  });

  it("浏览器只订阅本账号的本地存储和整区清除，并释放事件监听", () => {
    const storage = memoryStorage();
    const browser = Object.assign(new EventTarget(), { localStorage: storage });
    vi.stubGlobal("window", browser);
    const store = browserSidebarProjectStore("browser-subscriber");
    const listener = vi.fn(() => store.getSnapshot());
    const unsubscribe = store.subscribe(listener);
    const key = sidebarProjectKey("browser-subscriber");
    const emitStorage = (changedKey: string | null, storageArea = storage) => {
      browser.dispatchEvent(Object.assign(new Event("storage"), { key: changedKey, storageArea }));
    };
    storage.setItem(key, first.id);
    emitStorage(key);
    expect(listener).toHaveLastReturnedWith(first.id);
    emitStorage(sidebarProjectKey("another-user"));
    emitStorage(key, memoryStorage());
    expect(listener).toHaveBeenCalledTimes(1);
    storage.removeItem(key);
    emitStorage(null);
    expect(listener).toHaveLastReturnedWith(null);
    unsubscribe();
    emitStorage(key);
    store.select(second.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
