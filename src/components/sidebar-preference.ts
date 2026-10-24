export const sidebarPreferenceKey = "agilenest_sidebar_collapsed";

export function createSidebarPreferenceStore(storage: () => Pick<Storage, "getItem" | "setItem">) {
  let storedValue: string | null | undefined;
  let collapsed = false;
  const listeners = new Set<() => void>();

  function getSnapshot() {
    try {
      const saved = storage().getItem(sidebarPreferenceKey);
      if (saved !== storedValue) {
        storedValue = saved;
        collapsed = saved === "true";
      }
    } catch {
      // 存储不可用时继续使用当前访问中的折叠状态。
    }
    return collapsed;
  }

  return {
    getSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    toggle() {
      collapsed = !getSnapshot();
      try {
        const saved = String(collapsed);
        storage().setItem(sidebarPreferenceKey, saved);
        storedValue = saved;
      } catch {
        // 原始存储未变化时，不撤销本次折叠操作。
      }
      listeners.forEach((listener) => listener());
    },
  };
}

const preferenceStore = createSidebarPreferenceStore(() => window.localStorage);
export const sidebarPreferenceStore = {
  ...preferenceStore,
  subscribe(listener: () => void) {
    const unsubscribe = preferenceStore.subscribe(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== sidebarPreferenceKey) return;
      try {
        if (event.storageArea === window.localStorage) listener();
      } catch {
        // 禁用存储时只接收本页的折叠操作。
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  },
};

export function isSidebarToggleShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "isComposing" | "defaultPrevented">,
  editing: boolean,
) {
  return !editing && !event.defaultPrevented && !event.repeat && !event.isComposing &&
    !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b";
}
