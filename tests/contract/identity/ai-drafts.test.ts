import { describe, expect, it } from "vitest";
import { createDraftStore } from "@/components/ai/draft-store";
import {
  decodeNotebook,
  draftStorageKey,
  EMPTY_NOTEBOOK,
  MAX_DRAFTS,
  removeDraft,
  saveDraft,
  searchDrafts,
  titleFromText,
  type AiDraft,
} from "@/components/ai/drafts";

const draft: AiDraft = {
  id: "initial",
  title: "课题计划",
  customTitle: false,
  text: "研究任务和验收要求",
  updatedAt: "2026-10-05T00:00:00.000Z",
};
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("foundation AI 本地草稿", () => {
  it("首次使用为空，保存后重新创建 store 仍可恢复草稿与选择", () => {
    const storage = memoryStorage();
    const store = createDraftStore("member-a", () => storage);
    expect(store.getSnapshot().notebook).toEqual(EMPTY_NOTEBOOK);
    expect(store.commit((current) => saveDraft(current, draft))).toBe(true);
    const restored = createDraftStore("member-a", () => storage).getSnapshot()
      .notebook;
    expect(restored.activeId).toBe(draft.id);
    expect(restored.drafts).toEqual([draft]);
  });

  it("账号隔离，同一浏览器的其他成员不会读到草稿", () => {
    const storage = memoryStorage();
    const first = createDraftStore("member-a", () => storage);
    first.commit((current) => saveDraft(current, draft));
    const second = createDraftStore("member-b", () => storage);
    expect(second.getSnapshot().notebook.drafts).toEqual([]);
    second.commit((current) =>
      saveDraft(current, { ...draft, text: "另一个人的内容" }),
    );
    expect(first.getSnapshot().notebook.drafts[0].text).toBe(draft.text);
  });

  it("损坏的存储不被保存动作覆盖，并显示可读错误", () => {
    const storage = memoryStorage();
    storage.setItem(draftStorageKey("member-a"), "{bad-json");
    const store = createDraftStore("member-a", () => storage);
    expect(store.getSnapshot().error).toContain("原数据未覆盖");
    expect(store.commit((current) => saveDraft(current, draft))).toBe(false);
    expect(storage.getItem(draftStorageKey("member-a"))).toBe("{bad-json");
  });

  it("存储读取被拒绝时不尝试覆盖已有数据", () => {
    let writes = 0;
    const store = createDraftStore("member-a", () => ({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        writes += 1;
      },
    }));
    expect(store.commit((current) => saveDraft(current, draft))).toBe(false);
    expect(writes).toBe(0);
    expect(store.getSnapshot().error).toContain("未允许本地存储");
  });

  it("写入失败不宣称已保存，失败解除后可重试", () => {
    const storage = memoryStorage();
    let blocked = true;
    const store = createDraftStore("member-a", () => ({
      ...storage,
      setItem: (key, value) => {
        if (blocked) throw new Error("quota");
        storage.setItem(key, value);
      },
    }));
    expect(store.commit((current) => saveDraft(current, draft))).toBe(false);
    expect(store.getSnapshot().notebook.drafts).toEqual([]);
    expect(store.getSnapshot().error).toContain("未保存");
    blocked = false;
    expect(store.commit((current) => saveDraft(current, draft))).toBe(true);
    expect(store.getSnapshot().error).toBeNull();
  });

  it("删除当前草稿后选择下一份，不修改原对象", () => {
    const second = {
      ...draft,
      id: "ac7e2740-dc8e-43ad-b36c-eaef3c6a4ac5",
      title: "另一课题",
    };
    const notebook = saveDraft(saveDraft(EMPTY_NOTEBOOK, draft), second);
    const result = removeDraft(notebook, draft.id);
    expect(result.activeId).toBe(second.id);
    expect(notebook.drafts).toHaveLength(2);
    expect(removeDraft(result, second.id).activeId).toBeNull();
  });

  it("容量上限拒绝新增，但可编辑原有草稿", () => {
    const drafts = Array.from({ length: MAX_DRAFTS }, (_, index) => ({
      ...draft,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    const notebook = { ...EMPTY_NOTEBOOK, activeId: drafts[0].id, drafts };
    expect(() => saveDraft(notebook, draft)).toThrow("最多保留");
    expect(
      saveDraft(notebook, { ...drafts[0], text: "已编辑" }).drafts[0].text,
    ).toBe("已编辑");
  });

  it("拒绝超长、重复标识、未知版本和无效选择", () => {
    expect(() =>
      saveDraft(EMPTY_NOTEBOOK, { ...draft, text: "a".repeat(6001) }),
    ).toThrow();
    expect(() =>
      decodeNotebook(
        JSON.stringify({ ...EMPTY_NOTEBOOK, drafts: [draft, draft] }),
      ),
    ).toThrow();
    expect(() =>
      decodeNotebook(JSON.stringify({ ...EMPTY_NOTEBOOK, version: 2 })),
    ).toThrow();
    expect(() =>
      decodeNotebook(
        JSON.stringify({ ...EMPTY_NOTEBOOK, activeId: "initial" }),
      ),
    ).toThrow();
  });

  it("搜索覆盖名称和内容，空搜索保留排序，名称从文本生成", () => {
    const drafts = [
      draft,
      {
        ...draft,
        id: "ac7e2740-dc8e-43ad-b36c-eaef3c6a4ac5",
        title: "API",
        text: "接口说明",
      },
    ];
    expect(searchDrafts(drafts, " 验收 ")).toEqual([draft]);
    expect(searchDrafts(drafts, "api")).toEqual([drafts[1]]);
    expect(searchDrafts(drafts, "")).toEqual(drafts);
    expect(titleFromText("  任务\n  分工 ")).toBe("任务 分工");
    expect(titleFromText("a".repeat(100))).toHaveLength(40);
  });
});
