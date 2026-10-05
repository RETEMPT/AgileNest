import {
  decodeNotebook,
  draftStorageKey,
  EMPTY_NOTEBOOK,
  type DraftNotebook,
} from "./drafts";

type Snapshot = { notebook: DraftNotebook; error: string | null };
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export const SERVER_SNAPSHOT: Snapshot = {
  notebook: EMPTY_NOTEBOOK,
  error: null,
};

export function createDraftStore(userId: string, storage: () => StorageAccess) {
  const key = draftStorageKey(userId);
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let snapshot = SERVER_SNAPSHOT;
  let unreadable = false;
  let readFailed = false;
  const emit = () => listeners.forEach((listener) => listener());

  function getSnapshot() {
    try {
      const raw = storage().getItem(key);
      readFailed = false;
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        try {
          snapshot = { notebook: decodeNotebook(raw), error: null };
          unreadable = false;
        } catch {
          unreadable = true;
          snapshot = {
            notebook: EMPTY_NOTEBOOK,
            error: "无法读取本地草稿，原数据未覆盖。请检查浏览器存储后重试。",
          };
        }
      }
    } catch {
      readFailed = true;
      if (!snapshot.error)
        snapshot = {
          ...snapshot,
          error: "浏览器未允许本地存储，输入暂未保存。可复制内容后再离开。",
        };
    }
    return snapshot;
  }

  function commit(change: (current: DraftNotebook) => DraftNotebook) {
    const current = getSnapshot();
    if (unreadable || readFailed) return false;
    try {
      const notebook = change(current.notebook);
      const raw = JSON.stringify(notebook);
      decodeNotebook(raw);
      storage().setItem(key, raw);
      cachedRaw = raw;
      snapshot = { notebook, error: null };
      emit();
      return true;
    } catch (error) {
      snapshot = {
        ...current,
        error:
          error instanceof Error && error.message.startsWith("最多保留")
            ? error.message
            : "草稿未保存，浏览器存储不可用或已满。输入已保留，可复制内容后重试。",
      };
      emit();
      return false;
    }
  }

  return {
    getSnapshot,
    commit,
    refresh() {
      cachedRaw = undefined;
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const stores = new Map<string, ReturnType<typeof createDraftStore>>();
export function browserDraftStore(userId: string) {
  let store = stores.get(userId);
  if (!store) {
    store = createDraftStore(userId, () => window.localStorage);
    stores.set(userId, store);
  }
  return store;
}
