"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowUp,
  Check,
  ChevronLeft,
  Copy,
  FileText,
  Info,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { AiChatIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { browserDraftStore, SERVER_SNAPSHOT } from "./draft-store";
import {
  draftStorageKey,
  MAX_DRAFT_LENGTH,
  MAX_DRAFTS,
  MAX_TITLE_LENGTH,
  removeDraft,
  saveDraft,
  searchDrafts,
  titleFromText,
  type AiDraft,
} from "./drafts";

type Store = ReturnType<typeof browserDraftStore>;
type DraftOperation = { kind: "rename" | "delete"; draft: AiDraft };
const INITIAL_DRAFT: AiDraft = {
  id: "initial",
  title: "新对话",
  customTitle: false,
  text: "",
  updatedAt: "1970-01-01T00:00:00.000Z",
};
const PROMPTS = [
  {
    title: "规划项目",
    description: "目标、范围与交付安排",
    icon: FileText,
    text: "请帮我梳理项目计划。\n项目目标：\n参与成员：\n预期交付：\n截止时间：",
  },
  {
    title: "拆解任务",
    description: "明确分工与验收要求",
    icon: ListChecks,
    text: "请将以下需求拆成可执行的任务，并列出每项任务的交付物和验收标准。\n需求说明：",
  },
  {
    title: "准备验收",
    description: "整理成果与待确认事项",
    icon: ShieldCheck,
    text: "请帮我整理验收材料。\n本次完成：\n成果链接或说明：\n验证结果：\n待确认事项：",
  },
  {
    title: "课题讨论",
    description: "研究问题与下一步安排",
    icon: MessageSquare,
    text: "请帮我梳理课题的研究思路。\n研究问题：\n已有进展：\n当前困难：\n下一步计划：",
  },
];

function DraftList({
  drafts,
  activeId,
  query,
  onQuery,
  onSelect,
  onNew,
  onOperation,
  menuRefs,
}: {
  drafts: AiDraft[];
  activeId: string;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOperation: (operation: DraftOperation) => void;
  menuRefs: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  const filtered = searchDrafts(drafts, query);
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">对话草稿</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {drafts.length}/{MAX_DRAFTS}
        </span>
      </div>
      <Button
        variant="outline"
        className="w-full justify-start border-brand/20 bg-card text-brand hover:bg-brand-soft"
        onClick={onNew}
      >
        <Plus size={16} aria-hidden="true" />
        新对话
      </Button>
      <div className="relative mt-4">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 text-muted-foreground"
        />
        <Input
          aria-label="搜索对话草稿"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="搜索草稿"
          className="border-transparent bg-card/80 pl-8 shadow-none"
        />
      </div>
      <p className="mt-6 mb-2 px-2 text-[11px] font-medium text-muted-foreground">
        最近编辑
      </p>
      <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto">
        {filtered.map((draft) => (
          <div
            key={draft.id}
            className={`group flex items-center gap-1 rounded-lg p-1 ${draft.id === activeId ? "bg-brand-soft" : "hover:bg-muted"}`}
          >
            <button
              type="button"
              aria-current={draft.id === activeId ? "true" : undefined}
              onClick={() => onSelect(draft.id)}
              className="min-w-0 flex-1 rounded-md px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p
                className={`truncate text-xs font-medium ${draft.id === activeId ? "text-brand" : "text-foreground"}`}
              >
                {draft.title}
              </p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {draft.text.trim()
                  ? draft.text.replace(/\s+/g, " ")
                  : "空白草稿"}
              </p>
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  ref={(element) => {
                    if (element) menuRefs.current.set(draft.id, element);
                    else menuRefs.current.delete(draft.id);
                  }}
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label={`管理草稿：${draft.title}`}
                >
                  <MoreHorizontal size={15} />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-70 min-w-36 rounded-lg border border-border bg-popover p-1 shadow-lg"
                >
                  <DropdownMenu.Item
                    onSelect={() => onOperation({ kind: "rename", draft })}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs outline-none focus:bg-accent"
                  >
                    <Pencil size={13} />
                    重命名
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => onOperation({ kind: "delete", draft })}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-destructive outline-none focus:bg-accent"
                  >
                    <Trash2 size={13} />
                    删除草稿
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-center text-xs leading-6 text-muted-foreground">
            {query.trim() ? (
              <>
                <p>没有匹配的草稿</p>
                <Button size="sm" variant="ghost" onClick={() => onQuery("")}>
                  清除搜索
                </Button>
              </>
            ) : (
              <>
                <MessageSquare
                  size={22}
                  className="mx-auto mb-3 text-brand/40"
                />
                <p>暂无对话草稿</p>
                <p>输入内容后自动保存</p>
              </>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 border-t border-border/70 pt-4 text-[11px] leading-5 text-muted-foreground">
        草稿仅保存在当前浏览器，
        <br />
        不会同步到其他设备。
      </p>
    </div>
  );
}

function DraftEditor({
  draft,
  store,
  persistRef,
  focusOnOpen,
}: {
  draft: AiDraft;
  store: Store;
  persistRef: React.RefObject<(() => boolean) | null>;
  focusOnOpen: boolean;
}) {
  const [text, setText] = useState(draft.text);
  const [savedText, setSavedText] = useState(draft.text);
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== savedText;

  useEffect(() => {
    if (focusOnOpen) inputRef.current?.focus();
  }, [focusOnOpen]);

  const persist = useCallback(() => {
    const current = store
      .getSnapshot()
      .notebook.drafts.find((item) => item.id === draft.id);
    if (!current && !text.trim()) return true;
    if (current?.text === text) {
      setSavedText(text);
      return true;
    }
    // A deleted draft must not be resurrected by a delayed editor save.
    if (draft.id !== "initial" && !current) return false;
    const ok = store.commit((notebook) =>
      saveDraft(notebook, {
        ...draft,
        title: current?.customTitle ? current.title : titleFromText(text),
        customTitle: current?.customTitle ?? false,
        text,
        updatedAt: new Date().toISOString(),
      }),
    );
    if (ok) setSavedText(text);
    return ok;
  }, [draft, store, text]);

  useEffect(() => {
    persistRef.current = persist;
    const onLeave = () => {
      persist();
    };
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      persistRef.current = null;
    };
  }, [persist, persistRef]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(persist, 450);
    return () => window.clearTimeout(timer);
  }, [dirty, persist]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("已复制草稿");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setFeedback("请按 Ctrl+C 复制选中的内容");
    }
  }

  function applyPrompt(prompt: string) {
    const nextText = text.trim() ? `${text.trimEnd()}\n\n${prompt}` : prompt;
    if (nextText.length > MAX_DRAFT_LENGTH) {
      setFeedback("内容超过 6000 字，请先整理当前草稿");
      return;
    }
    setText(nextText);
    setFeedback("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 py-6 sm:px-8">
        <div className="my-auto w-full max-w-2xl">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/10 bg-brand-soft text-brand shadow-xs">
              <AiChatIcon size={28} className="text-brand" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                项目讨论与协作
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm">
                整理项目计划、拆解任务，或准备课题与验收材料。
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROMPTS.map(({ title, description, icon: Icon, text: prompt }) => (
              <button
                key={title}
                type="button"
                onClick={() => applyPrompt(prompt)}
                className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-brand/30 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon
                  size={18}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-brand"
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
            <p>模型尚未接入。可先整理并保存草稿，当前内容不会发送给 AI。</p>
          </div>
        </div>
      </div>
      <div className="shrink-0 px-4 pb-5 sm:px-8 sm:pb-7">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-[0_4px_20px_-8px_rgba(41,74,120,0.12)] focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/10 sm:p-4">
            <Label htmlFor="ai-draft-input" className="sr-only">
              对话内容
            </Label>
            <Textarea
              id="ai-draft-input"
              ref={inputRef}
              value={text}
              maxLength={MAX_DRAFT_LENGTH}
              onChange={(event) => {
                setText(event.target.value);
                setFeedback("");
              }}
              onBlur={persist}
              onKeyDown={(event) => {
                if (
                  !event.nativeEvent.isComposing &&
                  (event.ctrlKey || event.metaKey) &&
                  event.key === "Enter"
                ) {
                  event.preventDefault();
                  if (persist()) setFeedback("草稿已保存");
                }
              }}
              aria-describedby="ai-draft-hint"
              placeholder="输入项目问题或整理思路…"
              className="custom-scrollbar min-h-24 max-h-52 resize-y rounded-none border-0 bg-transparent p-1 text-sm leading-6 shadow-none focus-visible:ring-0"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  未连接模型
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {text.length}/{MAX_DRAFT_LENGTH}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label="复制草稿"
                  disabled={!text.trim()}
                  onClick={copyText}
                >
                  <Copy size={15} />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!dirty}
                  onClick={() => {
                    if (persist()) setFeedback("草稿已保存");
                  }}
                >
                  保存草稿
                </Button>
                <Button
                  size="icon"
                  disabled
                  aria-label="发送消息（模型尚未接入）"
                  title="模型尚未接入"
                  className="h-8 w-8 rounded-lg"
                >
                  <ArrowUp size={17} />
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <p id="ai-draft-hint">Enter 换行 · Ctrl / ⌘ + Enter 保存</p>
            <p role="status" className="flex shrink-0 items-center gap-1">
              {feedback ||
                (dirty ? (
                  "未保存修改"
                ) : text.trim() ? (
                  <>
                    <Check size={12} />
                    已保存到浏览器
                  </>
                ) : (
                  "本地草稿"
                ))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiWorkspace({ userId }: { userId: string }) {
  const store = useMemo(() => browserDraftStore(userId), [userId]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const { notebook, error } = snapshot;
  const activeDraft =
    notebook.drafts.find((draft) => draft.id === notebook.activeId) ??
    INITIAL_DRAFT;
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [operation, setOperation] = useState<DraftOperation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const persistRef = useRef<(() => boolean) | null>(null);
  const menuRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === draftStorageKey(userId))
        store.refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store, userId]);

  function selectDraft(id: string) {
    if (persistRef.current && !persistRef.current()) return;
    if (store.commit((current) => ({ ...current, activeId: id }))) {
      setHistoryOpen(false);
      setFocusOnOpen(true);
    }
  }
  function newDraft() {
    if (persistRef.current && !persistRef.current()) return;
    const draft: AiDraft = {
      id: crypto.randomUUID(),
      title: "新对话",
      customTitle: false,
      text: "",
      updatedAt: new Date().toISOString(),
    };
    if (
      store.commit((current) => ({
        ...saveDraft(current, draft),
        activeId: draft.id,
      }))
    ) {
      setQuery("");
      setHistoryOpen(false);
      setFocusOnOpen(true);
    }
  }
  function openOperation(next: DraftOperation) {
    if (persistRef.current && !persistRef.current()) return;
    returnFocus.current = menuRefs.current.get(next.draft.id) ?? null;
    setNewTitle(next.draft.title);
    setOperation(next);
  }
  const listProps = {
    drafts: notebook.drafts,
    activeId: activeDraft.id,
    query,
    onQuery: setQuery,
    onSelect: selectDraft,
    onNew: newDraft,
    onOperation: openOperation,
    menuRefs,
  };

  // Mount editor state after hydration reads the account's stored draft.
  const editorKey = `${snapshot === SERVER_SNAPSHOT ? "loading" : "ready"}:${activeDraft.id}:${editorGeneration}`;

  return (
    <section
      aria-label="AI 对话工作区"
      className="flex min-h-[700px] overflow-hidden rounded-2xl border border-border bg-card shadow-xs md:h-[calc(100dvh-4rem)] md:min-h-[640px]"
    >
      {showHistory && (
        <aside
          aria-label="对话草稿列表"
          className="hidden w-60 shrink-0 flex-col border-r border-border bg-background/70 lg:flex"
        >
          <DraftList {...listProps} />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog.Root open={historyOpen} onOpenChange={setHistoryOpen}>
              <Dialog.Trigger asChild>
                <Button
                  ref={historyTrigger}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground lg:hidden"
                  aria-label="打开对话草稿列表"
                >
                  <MessageSquare size={17} />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay fixed inset-0 z-60 bg-black/35" />
                <Dialog.Content className="dialog-surface fixed inset-y-0 left-0 z-60 flex w-[min(320px,85vw)] flex-col border-r border-border bg-card pt-5 shadow-xl">
                  <Dialog.Title className="sr-only">对话草稿</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    选择或管理保存在当前浏览器的对话草稿。
                  </Dialog.Description>
                  <Dialog.Close asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="关闭草稿列表"
                      className="absolute top-2 right-2 h-7 w-7"
                    >
                      <X size={16} />
                    </Button>
                  </Dialog.Close>
                  <DraftList {...listProps} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 text-muted-foreground lg:inline-flex"
              aria-label={showHistory ? "收起草稿列表" : "展开草稿列表"}
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? (
                <ChevronLeft size={17} />
              ) : (
                <MessageSquare size={17} />
              )}
            </Button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold">AI 对话</h1>
              <p
                className="mt-0.5 max-w-52 truncate text-[11px] text-muted-foreground"
                title={activeDraft.title}
              >
                {activeDraft.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="border border-border bg-background font-normal"
            >
              界面预览
            </Badge>
            <Button
              ref={helpTrigger}
              size="icon"
              variant="ghost"
              aria-label="查看 AI 页面说明"
              onClick={() => setHelpOpen(true)}
              className="h-8 w-8 text-muted-foreground"
            >
              <Info size={17} />
            </Button>
          </div>
        </header>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-5 py-3 text-xs text-destructive"
          >
            <p className="flex-1">{error}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                store.refresh();
                persistRef.current?.();
              }}
            >
              重试
            </Button>
          </div>
        )}
        <DraftEditor
          key={editorKey}
          draft={activeDraft}
          store={store}
          persistRef={persistRef}
          focusOnOpen={focusOnOpen}
        />
      </div>
      <Dialog.Root
        open={operation !== null}
        onOpenChange={(open) => {
          if (!open) setOperation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-70 bg-black/35" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (returnFocus.current?.isConnected) returnFocus.current.focus();
              else document.getElementById("ai-draft-input")?.focus();
            }}
            className="dialog-surface fixed top-1/2 left-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <Dialog.Title className="text-lg font-semibold">
              {operation?.kind === "rename" ? "重命名草稿" : "删除草稿"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 break-words text-sm leading-6 text-muted-foreground">
              {operation?.kind === "rename"
                ? "修改草稿名称，内容会保留。"
                : `删除“${operation?.draft.title ?? ""}”后无法恢复。`}
            </Dialog.Description>
            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!operation) return;
                const ok = store.commit((current) =>
                  operation.kind === "delete"
                    ? removeDraft(current, operation.draft.id)
                    : {
                        ...current,
                        drafts: current.drafts.map((draft) =>
                          draft.id === operation.draft.id
                            ? {
                                ...draft,
                                title: newTitle.trim(),
                                customTitle: true,
                              }
                            : draft,
                        ),
                      },
                );
                if (ok) {
                  if (
                    operation.kind === "delete" &&
                    operation.draft.id === activeDraft.id
                  )
                    setEditorGeneration((current) => current + 1);
                  setOperation(null);
                }
              }}
            >
              {operation?.kind === "rename" && (
                <div className="space-y-2">
                  <Label htmlFor="draft-title">草稿名称</Label>
                  <Input
                    id="draft-title"
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    maxLength={MAX_TITLE_LENGTH}
                    required
                  />
                </div>
              )}
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="outline" type="button">
                    取消
                  </Button>
                </Dialog.Close>
                <Button
                  variant={
                    operation?.kind === "delete" ? "destructive" : "default"
                  }
                  disabled={operation?.kind === "rename" && !newTitle.trim()}
                  type="submit"
                >
                  {operation?.kind === "delete" ? "删除草稿" : "保存名称"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-70 bg-black/35" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              helpTrigger.current?.focus();
            }}
            className="dialog-surface fixed top-1/2 left-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
              <AiChatIcon size={22} className="text-brand" />
              AI 对话
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
              当前提供对话界面与本地草稿管理，尚未接入模型或三级
              Agent。内容不会发送给外部服务，也不会读取或修改团队任务。
            </Dialog.Description>
            <p className="mt-4 rounded-xl bg-background p-4 text-xs leading-6 text-muted-foreground">
              草稿按当前账号保存在此浏览器。清除浏览器数据会删除草稿；需要保留的内容可使用复制按钮。每个账号最多
              40 份，每份最多 6000 字。
            </p>
            <div className="mt-5 flex justify-end">
              <Dialog.Close asChild>
                <Button variant="outline">关闭说明</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
