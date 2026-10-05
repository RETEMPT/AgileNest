import { z } from "zod";

export const MAX_DRAFTS = 40;
export const MAX_DRAFT_LENGTH = 6000;
export const MAX_TITLE_LENGTH = 40;

const draftId = z.union([z.literal("initial"), z.uuid()]);
const draftSchema = z.object({
  id: draftId,
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  customTitle: z.boolean().default(false),
  text: z.string().max(MAX_DRAFT_LENGTH),
  updatedAt: z.iso.datetime(),
});
const notebookSchema = z
  .object({
    version: z.literal(1),
    activeId: draftId.nullable(),
    drafts: z.array(draftSchema).max(MAX_DRAFTS),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.drafts.map((draft) => draft.id));
    if (
      ids.size !== value.drafts.length ||
      (value.activeId && !ids.has(value.activeId))
    ) {
      ctx.addIssue({ code: "custom", message: "草稿索引无效" });
    }
  });

export type AiDraft = z.infer<typeof draftSchema>;
export type DraftNotebook = z.infer<typeof notebookSchema>;
export const EMPTY_NOTEBOOK: DraftNotebook = {
  version: 1,
  activeId: null,
  drafts: [],
};

export function draftStorageKey(userId: string) {
  return `agilenest:ai-drafts:v1:${userId}`;
}

export function decodeNotebook(raw: string | null): DraftNotebook {
  return raw === null ? EMPTY_NOTEBOOK : notebookSchema.parse(JSON.parse(raw));
}

export function titleFromText(text: string) {
  return (
    text.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH) || "新对话"
  );
}

export function searchDrafts(drafts: AiDraft[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  return drafts.filter(
    (draft) =>
      !term ||
      `${draft.title}\n${draft.text}`.toLocaleLowerCase().includes(term),
  );
}

export function saveDraft(
  notebook: DraftNotebook,
  draft: AiDraft,
): DraftNotebook {
  const existing = notebook.drafts.find((item) => item.id === draft.id);
  if (!existing && notebook.drafts.length >= MAX_DRAFTS)
    throw new Error("最多保留 40 份草稿，请先删除不需要的草稿。");
  return notebookSchema.parse({
    ...notebook,
    activeId: notebook.activeId ?? draft.id,
    drafts: [draft, ...notebook.drafts.filter((item) => item.id !== draft.id)],
  });
}

export function removeDraft(
  notebook: DraftNotebook,
  id: string,
): DraftNotebook {
  const drafts = notebook.drafts.filter((draft) => draft.id !== id);
  return {
    ...notebook,
    drafts,
    activeId:
      notebook.activeId === id ? (drafts[0]?.id ?? null) : notebook.activeId,
  };
}
