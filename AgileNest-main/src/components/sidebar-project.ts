import { z } from "zod";

const projectIdSchema = z.uuid();
export const sidebarProjectKey = (userId: string) => `agilenest:sidebar-project:v1:${userId}`;

export function resolveSidebarProject<T extends { id: string }>(pathname: string, projects: readonly T[], rememberedId: string | null): T | undefined {
  const routeId = pathname.match(/^\/p\/([^/]+)(?:\/|$)/)?.[1];
  return projects.find((project) => project.id === (routeId ?? rememberedId));
}

export function createSidebarProjectStore(userId: string, storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const listeners = new Set<() => void>();
  let storedValue: string | null | undefined;
  let selectedId: string | null = null;

  function getSnapshot() {
    try {
      const value = storage().getItem(sidebarProjectKey(userId));
      if (value !== storedValue) {
        storedValue = value;
        const saved = projectIdSchema.safeParse(value);
        selectedId = saved.success ? saved.data : null;
      }
    } catch {
      // 浏览器禁止存储时，仍保留当前访问中的项目上下文。
    }
    return selectedId;
  }

  return {
    getSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select(projectId: string | null) {
      if (projectId !== null && !projectIdSchema.safeParse(projectId).success) return;
      const changed = getSnapshot() !== projectId;
      if (!changed && storedValue === projectId) return;
      selectedId = projectId;
      try {
        if (projectId === null) storage().removeItem(sidebarProjectKey(userId));
        else storage().setItem(sidebarProjectKey(userId), projectId);
        storedValue = projectId;
      } catch {
        // 保留上次读到的原值，避免下一次读取撤销本次失败写入的选择。
      }
      if (changed) listeners.forEach((listener) => listener());
    },
  };
}

const stores = new Map<string, ReturnType<typeof createSidebarProjectStore>>();

export function browserSidebarProjectStore(userId: string) {
  let store = stores.get(userId);
  if (!store) {
    const localStore = createSidebarProjectStore(userId, () => window.localStorage);
    store = {
      ...localStore,
      subscribe(listener: () => void) {
        const unsubscribe = localStore.subscribe(listener);
        const onStorage = (event: StorageEvent) => {
          if (event.key !== null && event.key !== sidebarProjectKey(userId)) return;
          try {
            if (event.storageArea === window.localStorage) listener();
          } catch {
            // 禁用存储时无需处理其他页面的持久化更新。
          }
        };
        window.addEventListener("storage", onStorage);
        return () => {
          unsubscribe();
          window.removeEventListener("storage", onStorage);
        };
      },
    };
    stores.set(userId, store);
  }
  return store;
}
