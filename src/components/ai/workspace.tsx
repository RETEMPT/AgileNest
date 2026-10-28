"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { z } from "zod";
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronDown,
  Folder,
  Plug,
  SlidersHorizontal,
  Sparkles,
  Copy,
  FileText,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Paperclip,
  ClipboardPaste,
  ListTree,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Square,
  LoaderCircle,
} from "lucide-react";
import { AiChatIcon, GuideIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { browserDraftStore, SERVER_SNAPSHOT } from "./draft-store";
import { useRouter } from "next/navigation";
import { BUILTIN_PLUGINS } from "./configuration-model";
import { MATERIAL_ACCEPT, readMaterial, validateMaterialBatch, type LocalMaterial, type MaterialRef } from "./materials";
import { deleteMaterials, getMaterial, putMaterials } from "./material-store";
import { appendModelReply, chatMessages } from "./chat-client";
import { requestChat } from "./chat-stream";
import { ChatOutputCards } from "./chat-output-ui";
import { ChatProgressList, ChatSources } from "./chat-response-ui";
import { builtinEnabled, usePluginLibrary } from "./plugin-library";
import { PluginLibraryDialog } from "./plugin-library-ui";
import { needsServerExtraction } from "./materials";
import { ResourceMarkdown } from "@/modules/resources/ui";
import type { ChatResult, ChatProgress, PluginLibrary } from "@/modules/ai/client";
import { MODEL_SETTINGS_OPEN_EVENT, useModelConnection } from "./model-connection";
import { MaterialChips, MaterialsDialog, type MaterialsMode } from "./materials-ui";
import { SharedResourcesDialog } from "./shared-resources-ui";
import { TaskPlanDialog } from "./task-plan-ui";
import type { AiPlanningContext } from "./planning-context";
import type { TaskPlanContext } from "./task-plan";
import {
  draftMaterials,
  draftStorageKey,
  MAX_DRAFT_LENGTH,
  MAX_DRAFTS,
  MAX_TITLE_LENGTH,
  removeDraft,
  saveDraft,
  searchDrafts,
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
type Project = { id: string; name: string; teamName: string };
const PLUGIN_ICONS = [FileText, ListChecks, ShieldCheck, MessageSquare];

function DraftList({
  drafts,
  activeId,
  query,
  onQuery,
  onSelect,
  onNew,
  onOperation,
  menuRefs,
  projects,
  projectId,
  onProject,
  onPlugins,
}: {
  drafts: AiDraft[];
  activeId: string;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOperation: (operation: DraftOperation) => void;
  menuRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  projects: Project[];
  projectId: string | null;
  onProject: (id: string | null) => void;
  onPlugins: () => void;
}) {
  const projectSelectId = useId();
  const filtered = searchDrafts(drafts.filter((draft) => (draft.projectId ?? null) === projectId), query);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">AI 工作区</h2>
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
      <Button variant="ghost" className="mt-2 w-full justify-start text-muted-foreground" onClick={onPlugins}><Plug size={16} />插件库</Button>
      <div className="relative mt-4">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 text-muted-foreground"
        />
        <Input
          aria-label="搜索会话"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="搜索会话"
          className="border-transparent bg-card/80 pl-8 shadow-none"
        />
      </div>
      <Label htmlFor={projectSelectId} className="mt-5 mb-2 px-2 text-xs text-muted-foreground">项目</Label>
      <select id={projectSelectId} value={projectId ?? ""} onChange={(event) => onProject(event.target.value || null)} className="ui-press mb-4 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">个人会话</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}{projectId && !projects.some((project) => project.id === projectId) && <option value={projectId}>已不可访问的项目（本机记录）</option>}</select>
      <p className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground"><Folder size={14} />{projects.find((project) => project.id === projectId)?.name ?? (projectId ? "项目会话" : "个人会话")}</p>
      <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto">
        {filtered.map((draft) => (
          <div
            key={draft.id}
            className={`ui-press group flex items-center gap-1 rounded-lg p-1 ${draft.id === activeId ? "bg-brand-soft" : "hover:bg-muted"}`}
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
                {(draft.text || draft.messages?.at(-1)?.text || (draft.materials?.length ? draft.materials : draft.messages?.at(-1)?.materials)?.map((item) => item.name).join("、") || "还没有消息").replace(/\s+/g," ")}
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
                  aria-label={`管理会话：${draft.title}`}
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
                    删除会话
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
                <p>没有匹配的会话</p>
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
                <p>暂无对话</p>
                <p>输入内容后自动保存</p>
              </>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 border-t border-border/70 pt-4 text-[11px] text-muted-foreground">会话保存在此浏览器</p>
    </div>
  );
}

function AssistantMessageBubble({
  message,
  openMaterial,
  onPreview,
  planningDisabled,
}: {
  message: {
    id: string;
    text: string;
    ui?: ChatResult["ui"];
    sources?: ChatResult["sources"];
    workSources?: ChatResult["workSources"];
    toolSources?: ChatResult["toolSources"];
    retrieval?: ChatResult["retrieval"];
    model?: string;
    createdAt: string;
    materials?: MaterialRef[];
  };
  openMaterial: (item: MaterialRef) => void;
  onPreview: (text: string, selectionKey: string) => void;
  planningDisabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <article className="panel-enter group relative mr-auto max-w-[90%] rounded-2xl border border-border/80 bg-background/95 px-5 py-4 text-sm leading-7 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-soft text-brand">
            <Sparkles size={12} />
          </div>
          <span className="text-xs font-semibold text-foreground/90">
            {message.model || "AI 助手"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="复制回复"
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground opacity-70 transition-opacity hover:opacity-100 group-hover:opacity-100"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-500" />
              <span className="text-emerald-500">已复制</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>复制</span>
            </>
          )}
        </button>
      </div>

      {message.materials?.length ? (
        <div className="mb-2">
          <MaterialChips items={message.materials} onOpen={openMaterial} />
        </div>
      ) : null}

      <ResourceMarkdown text={message.text} idPrefix={`chat-${message.id}`} />
      {message.ui && <ChatOutputCards ui={message.ui} workSources={message.workSources} disabled={planningDisabled} onPreview={onPreview} />}
      <ChatSources sources={message.sources} workSources={message.workSources} toolSources={message.toolSources} retrieval={message.retrieval} />

      <p className="mt-2 text-right text-[10px] text-muted-foreground">
        {new Date(message.createdAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </article>
  );
}

function DraftEditor({ draft, store, persistRef, busyRef, inputId, focusOnOpen, compact, userId, projectName, accessibleProjectId, onConfigure, onPlan, pluginLibrary, pluginsError, onPlanMessage }: {
  draft: AiDraft;
  store: Store;
  persistRef: React.RefObject<(() => boolean) | null>;
  busyRef?: React.RefObject<boolean>;
  inputId: string;
  focusOnOpen: boolean;
  compact: boolean;
  userId: string;
  projectName: string;
  accessibleProjectId: string | null;
  onConfigure: (tab: "model" | "plugins") => void;
  onPlan: () => void;
  onPlanMessage: (text: string, sourceId?: string) => void;
  pluginLibrary: PluginLibrary | null;
  pluginsError: string;
}) {
  const [text, setText] = useState(draft.text);
  const [savedText, setSavedText] = useState(draft.text);
  const [remoteText, setRemoteText] = useState(draft.text);
  const [feedback, setFeedback] = useState("");
  const [materialError, setMaterialError] = useState("");
  const [importing, setImporting] = useState(false);
  const [removalIds, setRemovalIds] = useState<string[]>([]);
  const [materialsMode, setMaterialsMode] = useState<MaterialsMode | null>(null);
  const [sharedResourcesOpen, setSharedResourcesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [unsavedReply, setUnsavedReply] = useState<ChatResult | null>(null);
  const [knowledgeScope, setKnowledgeScope] = useState<"project" | "accessible" | "none">(accessibleProjectId ? "project" : "none");
  const [progress, setProgress] = useState<ChatProgress[]>([]);
  const importRequest = useRef<AbortController | null>(null);
  const [pendingTurn, setPendingTurn] = useState<{ text: string; materials: MaterialRef[]; createdAt: string } | null>(null);
  const backupTextRef = useRef<string>("");
  const requestRef = useRef<AbortController | null>(null);
  const connection = useModelConnection(userId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importLock = useRef(false);
  const dragDepth = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const latestPersist = useRef<(() => boolean) | null>(null);
  const dirty = text !== savedText;
  const messages = draft.messages ?? [];
  const enabledPlugins = BUILTIN_PLUGINS.filter((plugin) => builtinEnabled(pluginLibrary, plugin.id));
  useEffect(() => { if (focusOnOpen) inputRef.current?.focus(); }, [focusOnOpen]);
  useEffect(() => () => { requestRef.current?.abort(); importRequest.current?.abort(); if (busyRef) busyRef.current = false; }, [busyRef]);
  useEffect(() => {
    if (!sending && !unsavedReply && !importing) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [sending, unsavedReply, importing]);
  // Another tab or the floating window may have saved newer text; adopt it, but only while this editor is clean.
  if (text === savedText && draft.text !== remoteText) {
    setRemoteText(draft.text);
    setText(draft.text);
    setSavedText(draft.text);
  }
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    const currentHeight = getComputedStyle(element).height;
    const transition = element.style.transition;
    element.style.transition = "none";
    element.style.height = "auto";
    const nextHeight = Math.min(144, Math.max(40, element.scrollHeight));
    element.style.height = currentHeight;
    // Measure first, then animate from the current height, including shrinking.
    void element.offsetHeight;
    element.style.transition = transition;
    element.style.height = `${nextHeight}px`;
  }, [text]);
  useEffect(() => { transcriptRef.current?.scrollTo({top:transcriptRef.current.scrollHeight,behavior:"smooth"}); }, [messages.length, pendingTurn]);
  const persist = useCallback(() => {
    const ok = store.saveText(draft,text,savedText,draft === INITIAL_DRAFT);
    if (ok) setSavedText(text);
    return ok;
  }, [draft, store, text, savedText]);
  useLayoutEffect(() => { latestPersist.current = persist; }, [persist]);
  useEffect(() => () => { latestPersist.current?.(); }, []);
  useLayoutEffect(() => {
    persistRef.current = () => !importLock.current && !requestRef.current && !unsavedReply && persist();
    const onLeave = () => { persist(); };
    window.addEventListener("pagehide", onLeave);
    return () => { window.removeEventListener("pagehide", onLeave); persistRef.current = null; };
  }, [persist, persistRef, unsavedReply]);
  useEffect(() => { if (!dirty) return; const timer = window.setTimeout(persist, 450); return () => window.clearTimeout(timer); }, [dirty,persist]);
  async function sendMessage() {
    if (requestRef.current || importLock.current || (!text.trim() && !draft.materials?.length)) return;
    if (!connection.configured) { setRequestError("请先配置模型连接，再发送消息"); onConfigure("model"); return; }
    if (!persist()) { setRequestError("输入尚未保存，请检查浏览器存储后重试"); return; }
    const source = store.getSnapshot().notebook.drafts.find((item) => item.id === draft.id) ?? { ...draft, text };
    const outgoingText = text;
    const outgoingMaterials = [...draft.materials ?? []];
    backupTextRef.current = outgoingText;
    setText("");
    setSavedText("");
    setPendingTurn({
      text: outgoingText,
      materials: outgoingMaterials,
      createdAt: new Date().toISOString(),
    });
    const request = new AbortController(); requestRef.current = request; setSending(true); setProgress([]); setRequestError(""); setFeedback(""); if (busyRef) busyRef.current = true;
    try {
      const outgoing = await chatMessages(source, outgoingText, (id) => getMaterial(userId, id));
      const result = await requestChat({ projectId: source.projectId ?? null, messages: outgoing, knowledgeScope }, request.signal, (event) => setProgress((items) => [...items.slice(-19), event]));
      request.signal.throwIfAborted();
      setUnsavedReply(result);
      let saveFailure = "";
      const ok = store.commit((notebook) => {
        try { return appendModelReply(notebook, source, outgoingText, result, new Date().toISOString()); }
        catch (error) { saveFailure = error instanceof Error ? error.message : "模型回复保存失败，请复制保留"; throw error; }
      });
      if (ok) { setUnsavedReply(null); setPendingTurn(null); backupTextRef.current = ""; setFeedback("已收到模型回复"); }
      else setRequestError(saveFailure || "已收到模型回复，但浏览器未能保存。请复制下方回复后继续");
    } catch (error) {
      if (backupTextRef.current) {
        setText(backupTextRef.current);
        setSavedText(backupTextRef.current);
      }
      setPendingTurn(null);
      setRequestError(request.signal.aborted ? "已停止生成，输入已恢复到对话框" : error instanceof z.ZodError ? "模型返回的回复无法读取，输入已恢复到对话框" : error instanceof Error ? error.message : "模型请求失败，输入已恢复到对话框，请重试");
    }
    finally { requestRef.current = null; setSending(false); if (busyRef) busyRef.current = false; }
  }
  async function copyText() {
    const materialNames = (items?: MaterialRef[]) => items?.length ? `[资料：${items.map((item) => item.name).join("、")}]` : "";
    const content = [...messages.map((message) => [materialNames(message.materials),message.text].filter(Boolean).join("\n")),materialNames(draft.materials),text].filter(Boolean).join("\n\n");
    try { await navigator.clipboard.writeText(content); setFeedback("已复制会话内容"); }
    catch { inputRef.current?.focus(); inputRef.current?.select(); setFeedback("复制失败，请选择内容手动复制"); }
  }
  function applyPrompt(prompt: string) {
    if (requestRef.current) return;
    const nextText = text.trim() ? `${text.trimEnd()}\n\n${prompt}` : prompt;
    if (nextText.length > MAX_DRAFT_LENGTH) { setFeedback("内容超过 6000 字，请先整理当前输入"); return; }
    setText(nextText); setFeedback(""); inputRef.current?.focus();
  }
  async function importFiles(files: File[]) {
    if (!files.length || importLock.current || requestRef.current) return false;
    if (!persist()) return false;
    importLock.current = true; setImporting(true); setMaterialError("");
    const controller = new AbortController(); importRequest.current = controller;
    if (busyRef) busyRef.current = true;
    try {
      const current = store.getSnapshot().notebook.drafts.find((item) => item.id === draft.id) ?? draft;
      validateMaterialBatch(draftMaterials(current),files);
      if (files.some((file) => needsServerExtraction(file.name)) && !builtinEnabled(pluginLibrary, "office-reader")) throw new Error("Office 文字读取插件尚未启用，请先在插件库中开启");
      const materials: LocalMaterial[] = [];
      for (const file of files) materials.push(await readMaterial(file, controller.signal));
      controller.signal.throwIfAborted();
      await putMaterials(userId,materials);
      if (controller.signal.aborted) {
        await deleteMaterials(userId, materials.map((item) => item.ref.id)).catch(() => setRemovalIds((ids) => [...ids, ...materials.map((item) => item.ref.id)]));
        controller.signal.throwIfAborted();
      }
      const ok = store.commit((notebook) => {
        const latest = notebook.drafts.find((item) => item.id === draft.id);
        if (!latest && draft !== INITIAL_DRAFT) throw new Error("会话已删除");
        validateMaterialBatch(draftMaterials(latest ?? draft),files);
        return saveDraft(notebook,{...(latest ?? draft),materials:[...(latest?.materials ?? []),...materials.map((item) => item.ref)],updatedAt:new Date().toISOString()});
      });
      if (!ok) {const ids = materials.map((item) => item.ref.id);await deleteMaterials(userId,ids).catch(() => setRemovalIds((current) => Array.from(new Set([...current,...ids]))));setMaterialError("资料未加入会话，请查看保存提示后重试");return false;}
      setFeedback(`已添加 ${materials.length} 份资料`);return true;
    } catch (error) {setMaterialError(controller.signal.aborted ? "已停止读取，所选文件未加入会话" : error instanceof z.ZodError ? "文件提取结果无法读取，请重试" : error instanceof Error ? error.message : "文件读取失败，请重试");return false;}
    finally {importRequest.current = null;importLock.current = false;if (busyRef) busyRef.current = false;setImporting(false);}
  }
  function openMaterial(item: MaterialRef) {setMaterialsMode({kind:"browse",id:item.id});}
  function cleanupDetached(ids: string[]) {
    const retained = new Set(store.getSnapshot().notebook.drafts.flatMap(draftMaterials).map((item) => item.id));
    const unused = Array.from(new Set([...removalIds,...ids])).filter((id) => !retained.has(id));
    void deleteMaterials(userId,unused).then(() => setRemovalIds([])).catch(() => setRemovalIds(unused));
  }
  function removeMaterial(item: MaterialRef) {
    if (!persist()) return;
    const ok = store.commit((notebook) => {
      const latest = notebook.drafts.find((value) => value.id === draft.id)!;
      return saveDraft(notebook,{...latest,materials:latest.materials?.filter((value) => value.id !== item.id),updatedAt:new Date().toISOString()});
    });
    if (ok) cleanupDetached([item.id]);
  }
  return <div className="relative flex min-h-0 flex-1 flex-col" onDragEnter={(event) => {if (event.dataTransfer.types.includes("Files")) {event.preventDefault();dragDepth.current++;setDragOver(true);}}} onDragOver={(event) => {if (event.dataTransfer.types.includes("Files")) {event.preventDefault();event.dataTransfer.dropEffect = "copy";}}} onDragLeave={(event) => {if (event.dataTransfer.types.includes("Files")) {event.preventDefault();dragDepth.current--;if (dragDepth.current <= 0) setDragOver(false);}}} onDrop={(event) => {if (event.dataTransfer.types.includes("Files")) {event.preventDefault();dragDepth.current = 0;setDragOver(false);void importFiles(Array.from(event.dataTransfer.files));}}}>
    <input ref={fileInputRef} type="file" multiple accept={MATERIAL_ACCEPT} className="hidden" aria-label="选择本地资料文件" onChange={(event) => {const files = Array.from(event.target.files ?? []);event.target.value = "";void importFiles(files);}} />
    {dragOver && <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-card/95"><div className="text-center"><Paperclip size={28} className="mx-auto text-brand" /><p className="mt-3 text-sm font-medium">松开以添加资料</p><p className="mt-2 text-xs text-muted-foreground">单文件 10 MB · 会话最多 10 份、50 MB；PPTX / DOCX 上传服务器提取文字</p></div></div>}
    <div ref={transcriptRef} className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto ${compact ? "px-4 py-5" : "px-5 py-8 sm:px-8"}`}>
      <div className="mx-auto w-full max-w-4xl">
        {messages.length === 0 && !pendingTurn ? <div className={`panel-enter ${compact ? "pt-2" : "pt-4 lg:pt-8"}`}>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><AiChatIcon size={23} /></div>
          <h2 className={`${compact ? "text-base" : "text-2xl"} font-semibold tracking-tight`}>{projectName === "个人会话" ? "从一个想法开始" : `一起推进${projectName}`}</h2>
          <p className="mt-3 text-sm text-muted-foreground">整理目标、讨论问题，留下下一步计划。</p>
          <div className="mt-6 flex flex-wrap gap-2">{enabledPlugins.map((plugin) => { const Icon = PLUGIN_ICONS[BUILTIN_PLUGINS.indexOf(plugin)]; return <button key={plugin.id} type="button" title={plugin.description} onClick={() => applyPrompt(plugin.prompt)} className="ui-press flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs hover:border-brand/30 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon size={15} />{plugin.name}</button>; })}</div>
        </div> : <div className="space-y-6">
          {messages.map((message) => message.role === "assistant" ? (
            <div key={message.id}><AssistantMessageBubble message={message} openMaterial={openMaterial} planningDisabled={sending || importing || !!unsavedReply || !builtinEnabled(pluginLibrary, "task-planner")} onPreview={(source, selectionKey) => { if (accessibleProjectId) onPlanMessage(source, `${message.id}:changes:${selectionKey}`); else setRequestError("请先选择项目，再预览新任务规划"); }} />{<Button size="sm" variant="ghost" className="mt-2 text-xs text-brand" disabled={sending || importing || !!unsavedReply || !builtinEnabled(pluginLibrary, "task-planner")} onClick={() => { if (accessibleProjectId) onPlanMessage(message.text, message.id); else setRequestError("请先选择此规划所属项目，再使用对话内容规划任务"); }}><ListTree size={13} />用这段内容规划任务</Button>}</div>
          ) : (
            <article key={message.id} className="panel-enter ml-auto max-w-[90%] rounded-2xl rounded-tr-md bg-brand-soft px-5 py-4 text-sm leading-7 text-foreground shadow-sm">
              <p className="mb-2 text-xs font-semibold text-brand">你</p>
              {message.materials?.length ? <MaterialChips items={message.materials} onOpen={openMaterial} /> : null}
              {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
              <p className="mt-2 text-right text-[10px] text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</p>
            </article>
          ))}
          {pendingTurn && (
            <>
              <article className="panel-enter ml-auto max-w-[90%] rounded-2xl rounded-tr-md bg-brand-soft px-5 py-4 text-sm leading-7 text-foreground shadow-sm">
                <p className="mb-2 text-xs font-semibold text-brand">你</p>
                {pendingTurn.materials?.length ? <MaterialChips items={pendingTurn.materials} onOpen={openMaterial} /> : null}
                {pendingTurn.text && <p className="whitespace-pre-wrap break-words">{pendingTurn.text}</p>}
                <p className="mt-2 text-right text-[10px] text-muted-foreground">{new Date(pendingTurn.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</p>
              </article>
              <article className="panel-enter mr-auto max-w-[90%] rounded-2xl border border-brand/25 bg-background/95 px-5 py-4 text-sm leading-7 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-soft text-brand">
                      <Sparkles size={12} className="animate-pulse" />
                    </div>
                    <span className="text-xs font-semibold text-brand">{connection.configuration?.name || "AI 助手"}</span>
                    <span className="text-[11px] text-muted-foreground">({connection.configuration?.model || "模型调用中"})</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => requestRef.current?.abort()}>
                    <Square size={10} className="fill-current" />
                    停止生成
                  </Button>
                </div>
                <div role="status" aria-live="polite" className="my-2 flex items-center gap-3 rounded-xl border border-brand/15 bg-brand-soft/40 px-3.5 py-3 text-xs text-foreground/90">
                  <LoaderCircle size={15} className="animate-spin text-brand shrink-0" />
                  <span className="animate-pulse font-medium">{progress.at(-1)?.message || "正在准备消息…"}</span>
                </div>
                <ChatProgressList progress={progress} />
              </article>
            </>
          )}
        </div>}
        {unsavedReply && <article className="mt-5 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">模型回复已收到，浏览器保存遇阻，请复制备份</p>
          <ResourceMarkdown text={unsavedReply.text} idPrefix="unsaved-reply" />
          {unsavedReply.ui && <ChatOutputCards ui={unsavedReply.ui} workSources={unsavedReply.workSources} disabled onPreview={() => undefined} />}
          <ChatSources sources={unsavedReply.sources} workSources={unsavedReply.workSources} toolSources={unsavedReply.toolSources} retrieval={unsavedReply.retrieval} />
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(unsavedReply.text); setFeedback("已复制模型回复"); } catch { setRequestError("复制失败，请选择上方回复手动复制"); } }}>复制回复</Button><Button variant="ghost" size="sm" onClick={() => { setUnsavedReply(null); setPendingTurn(null); setText(backupTextRef.current); setSavedText(backupTextRef.current); setFeedback("未保存的回复未加入历史，可重新发送原输入"); }}>已保留，继续对话</Button></div>
        </article>}
      </div>
    </div>
    <div className={`shrink-0 bg-card ${compact ? "px-3 pt-2 pb-3" : "px-5 pt-3 pb-5 sm:px-8"}`}>
      <div className="mx-auto w-full max-w-3xl">
        {draft.materials?.length ? <div className="mb-2"><MaterialChips items={draft.materials} onOpen={openMaterial} onRemove={sending || importing ? undefined : removeMaterial} /></div> : null}
        {materialError && <div role="alert" className="mb-2 flex items-start gap-2 text-xs leading-5 text-destructive"><p className="flex-1">{materialError}</p><Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" aria-label="关闭资料错误提示" onClick={() => setMaterialError("")}><X size={12} /></Button></div>}
        {removalIds.length > 0 && <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-destructive"><p>资料已移出会话，文件清理失败</p><Button variant="ghost" size="sm" onClick={() => cleanupDetached(removalIds)}>重试清理</Button></div>}
        {importing && <div role="status" className="mb-2 flex items-center gap-2 text-xs text-brand"><p>正在读取所选资料；PPTX / DOCX 将上传服务器提取文字…</p><Button size="sm" variant="ghost" onClick={() => importRequest.current?.abort()}>停止读取</Button></div>}
        {requestError && <div className="mb-3"><p role="alert" className="whitespace-pre-wrap text-sm text-destructive">{requestError}</p><ChatProgressList progress={progress} /></div>}
        {pluginsError && <p role="alert" className="mb-2 text-xs text-destructive">插件配置无法读取，请打开插件库重试；工具入口暂不可用。</p>}
        {connection.error && <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-destructive"><p>{connection.error}</p><Button variant="ghost" size="sm" onClick={connection.refresh}>重新读取配置</Button></div>}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><label htmlFor={`${inputId}-scope`}>资料检索范围</label><select id={`${inputId}-scope`} value={knowledgeScope} disabled={sending || importing} onChange={(event) => setKnowledgeScope(event.target.value as typeof knowledgeScope)} className="max-w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs"><option value="none">不查询平台资料</option><option value="project" disabled={!accessibleProjectId}>当前项目及团队共享资料</option><option value="accessible">全部可访问的团队与项目</option></select></div>
        <div className="ai-composer rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[0_4px_24px_-12px_rgba(41,74,120,0.16)] focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/10">
          <Label htmlFor={inputId} className="sr-only">对话内容</Label>
          <Textarea id={inputId} ref={inputRef} value={text} maxLength={MAX_DRAFT_LENGTH} onChange={(event) => { setText(event.target.value); setFeedback(""); }} onBlur={persist} onKeyDown={(event) => {
            if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void sendMessage(); }
          }} readOnly={sending} aria-describedby={`${inputId}-hint`} placeholder={projectName === "个人会话" ? "向 AI 提问，+ 选择要发送的文字资料…" : `讨论${projectName}，+ 选择资料…`} className="custom-scrollbar min-h-10 max-h-36 resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="添加文件与工具" disabled={sending}><Plus size={18} /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="start" side="top" sideOffset={10} collisionPadding={12} className="ai-add-menu z-70 max-h-[min(540px,70dvh)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
              <DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs text-muted-foreground">添加内容</DropdownMenu.Label>
              <DropdownMenu.Item disabled={importing} onSelect={() => fileInputRef.current?.click()} className="ai-menu-item"><Paperclip size={17} /><span><span className="block">添加文件 / 图片</span><span className="mt-0.5 block text-xs text-muted-foreground">PPTX / DOCX 上传服务器提取文字；也可拖入</span></span></DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setMaterialsMode({kind:"paste"})} className="ai-menu-item"><ClipboardPaste size={17} /><span>粘贴文本资料</span></DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setMaterialsMode({kind:"organize"})} className="ai-menu-item"><ListTree size={17} /><span>读取与整理资料{draftMaterials(draft).length > 0 && <span className="ml-2 text-xs text-muted-foreground">{draftMaterials(draft).length}</span>}</span></DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => { if (persist()) setSharedResourcesOpen(true); }} className="ai-menu-item"><Folder size={17} /><span>查阅与整理共享资料库</span></DropdownMenu.Item>
              <DropdownMenu.Item disabled={!builtinEnabled(pluginLibrary, "task-planner")} onSelect={onPlan} className="ai-menu-item"><ListTree size={17} /><span>AI 规划任务</span></DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
              {enabledPlugins.length > 0 && <><DropdownMenu.Label className="px-3 pt-1 pb-1 text-xs text-muted-foreground">快捷提问</DropdownMenu.Label>{enabledPlugins.map((plugin) => {const Icon = PLUGIN_ICONS[BUILTIN_PLUGINS.indexOf(plugin)];return <DropdownMenu.Item key={plugin.id} onSelect={() => applyPrompt(plugin.prompt)} className="ai-menu-item"><Icon size={17} /><span>{plugin.name}</span></DropdownMenu.Item>;})}<DropdownMenu.Separator className="my-1.5 h-px bg-border" /></>}
              <DropdownMenu.Item onSelect={() => onConfigure("plugins")} className="ai-menu-item"><Plug size={17} />打开插件库</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
            <div className="flex min-w-0 items-center gap-1.5"><Button variant="ghost" size="sm" className="h-7 max-w-44 truncate text-xs text-muted-foreground" disabled={sending} onClick={() => onConfigure("model")}><span className="truncate">{connection.configuration?.model || "配置模型"}</span><ChevronDown size={12} /></Button><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" aria-label="复制会话内容" disabled={!text.trim() && !messages.length} onClick={copyText}><Copy size={15} /></Button>{sending ? <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" aria-label="停止生成" onClick={() => requestRef.current?.abort()}><Square size={13} /></Button> : <Button size="icon" className="h-7 w-7 rounded-full" aria-label="发送消息" title="发送给当前配置的模型" disabled={importing || !!unsavedReply || connection.loading || (!text.trim() && !draft.materials?.length)} onClick={() => void sendMessage()}><ArrowUp size={16} /></Button>}</div>
          </div>
        </div>
        <div id={`${inputId}-hint`} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{connection.loading ? "读取模型配置…" : connection.configured ? `发送给 ${connection.configuration?.name} · ${knowledgeScope === "none" ? "不查询平台资料；外部工具由插件库控制" : knowledgeScope === "project" ? "按需检索当前项目资料" : "按需检索本人可访问资料"}` : "请先配置模型连接"}</span><span role="status" className="truncate text-right">{feedback || (dirty ? "保存输入中…" : text ? "输入已保存" : "Ctrl / ⌘ + Enter 发送")}</span></div>
      </div>
    </div>
    {materialsMode && <MaterialsDialog key={`${materialsMode.kind}:${"id" in materialsMode ? materialsMode.id ?? "" : ""}`} mode={materialsMode} onClose={() => setMaterialsMode(null)} onReturnFocus={() => inputRef.current?.focus()} items={draftMaterials(draft)} userId={userId} importError={materialError} importing={importing} onImport={importFiles} onPick={() => fileInputRef.current?.click()} onAttachText={(content) => {const next = text.trim() ? `${text.trimEnd()}\n\n${content}` : content;if (next.length > MAX_DRAFT_LENGTH) return "目录超过输入框剩余额度，可复制目录单独保存";applyPrompt(content);setMaterialsMode(null);return null;}} />}
    {sharedResourcesOpen && <SharedResourcesDialog projectId={accessibleProjectId} onClose={() => setSharedResourcesOpen(false)} onReturnFocus={() => inputRef.current?.focus()} onBusyChange={(value) => { importLock.current = value; if (busyRef) busyRef.current = value; }} onAttach={(content) => {
      const next = text.trim() ? `${text.trimEnd()}\n\n${content}` : content;
      if (next.length > MAX_DRAFT_LENGTH) return "引用超过输入框剩余额度，请先整理输入或仅引用来源";
      if (!store.saveText(draft, next, savedText, draft === INITIAL_DRAFT)) return "输入保存失败，原输入保留，请关闭资料面板后检查存储提示";
      setText(next); setSavedText(next); return null;
    }} />}
  </div>;
}
export function AiWorkspace({ userId, projects, compact = false, saveGuardRef, busyRef, planningContext, planningError = false }: { userId: string; projects: Project[]; compact?: boolean; saveGuardRef?: React.RefObject<(() => boolean) | null>; busyRef?: React.RefObject<boolean>; planningContext?: AiPlanningContext; planningError?: boolean }) {
  const inputId = useId();
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
  const plugins = usePluginLibrary(userId);
  const [pluginLibraryOpen, setPluginLibraryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [operation, setOperation] = useState<DraftOperation | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const router = useRouter();
  function openConfiguration(tab: "model" | "plugins" = "model") {
    if (!(pluginSaveRef.current?.() ?? true) || !(planningSaveRef.current?.() ?? true) || !(persistRef.current?.() ?? true)) return;
    if (tab === "plugins") { setHistoryOpen(false); setPluginLibraryOpen(true); return; }
    if (compact) window.dispatchEvent(new Event(MODEL_SETTINGS_OPEN_EVENT));
    router.push("/settings?section=ai");
  }
  const [cleanupError, setCleanupError] = useState("");
  const [cleanupIds, setCleanupIds] = useState<string[]>([]);
  const [planningTarget, setPlanningTarget] = useState<{ draftId: string; projectId: string | null; context?: TaskPlanContext; initialGoal?: string } | null>(null);
  const planningSaveRef = useRef<(() => boolean) | null>(null);
  const pluginSaveRef = useRef<(() => boolean) | null>(null);
  const persistRef = useRef<(() => boolean) | null>(null);
  const menuRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<HTMLButtonElement | null>(null);

  const historyTrigger = useRef<HTMLButtonElement>(null);
  const projectId = activeDraft.projectId ?? null;
  const projectName = projects.find((project) => project.id === projectId)?.name ?? (projectId ? "项目会话" : "个人会话");
  function cleanupMaterials(ids: string[]) {
    const retained = new Set(store.getSnapshot().notebook.drafts.flatMap(draftMaterials).map((item) => item.id));
    const unused = Array.from(new Set([...cleanupIds,...ids])).filter((id) => !retained.has(id));
    void deleteMaterials(userId,unused).then(() => {setCleanupError("");setCleanupIds([]);}).catch(() => {setCleanupIds(unused);setCleanupError("会话已删除，附件文件清理失败，请重试");});
  }

  useEffect(() => {
    if (!saveGuardRef) return;
    saveGuardRef.current = () => (pluginSaveRef.current?.() ?? true) && (planningSaveRef.current?.() ?? true) && (persistRef.current?.() ?? true);
    return () => { saveGuardRef.current = null; };
  }, [saveGuardRef]);

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
  function newDraft(nextProjectId: string | null = projectId) {
    if (persistRef.current && !persistRef.current()) return;
    const draft: AiDraft = {
      id: crypto.randomUUID(),
      title: "新对话",
      customTitle: false,
      text: "",
      projectId: nextProjectId,
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
  function selectProject(nextProjectId: string | null) {
    if (nextProjectId === projectId) return;
    if (nextProjectId && !projects.some((project) => project.id === nextProjectId)) return;
    const existing = notebook.drafts.find((draft) => (draft.projectId ?? null) === nextProjectId);
    if (existing) selectDraft(existing.id);
    else newDraft(nextProjectId);
  }
  function openDraftPlan(initialGoal?: string, sourceId?: string) {
    if (!builtinEnabled(plugins.library, "task-planner")) return;
    if (persistRef.current && !persistRef.current()) return;
    if (projectId && !projects.some((project) => project.id === projectId)) return;
    setPlanningTarget({ draftId: activeDraft.id, projectId, initialGoal, ...(sourceId ? { context: { sourceId, title: "对话建议" } } : {}) });
  }
  function openMilestonePlan() {
    if (!planningContext || !builtinEnabled(plugins.library, "task-planner") || (persistRef.current && !persistRef.current())) return;
    const current = store.getSnapshot().notebook;
    const existing = current.drafts.find((draft) => draft.projectId === planningContext.projectId);
    const target: AiDraft = existing ?? { id: crypto.randomUUID(), title: "任务规划", customTitle: false, text: "", projectId: planningContext.projectId, updatedAt: new Date().toISOString() };
    if (store.commit((notebook) => ({ ...(existing ? notebook : saveDraft(notebook, target)), activeId: target.id }))) {
      setPlanningTarget({ draftId: target.id, projectId: planningContext.projectId, context: planningContext.taskId ? { taskId: planningContext.taskId, title: planningContext.title } : planningContext.milestoneId ? { milestoneId: planningContext.milestoneId, title: planningContext.title } : undefined, initialGoal: planningContext.sourceText });
    }
  }
  function attachTaskPlan(content: string) {
    if (!planningTarget) return "请重新打开任务规划";
    if (persistRef.current && !persistRef.current()) return "会话尚未保存，请先保留输入后重试";
    let failure: string | null = null;
    const reject = (message: string): never => { failure = message; throw new Error(message); };
    const ok = store.commit((notebook) => {
      if (notebook.activeId && notebook.activeId !== planningTarget.draftId) reject("当前会话已切换，请关闭规划并从目标会话重新打开");
      const draft = notebook.drafts.find((item) => item.id === planningTarget.draftId);
      if (!draft && planningTarget.draftId !== "initial") reject("目标会话已删除，任务规划仍保留");
      const current = draft ?? INITIAL_DRAFT;
      if ((current.projectId ?? null) !== planningTarget.projectId) reject("会话所属项目已变化，请重新选择");
      const next = current.text.trim() ? `${current.text.trimEnd()}\n\n${content}` : content;
      if (next.length > MAX_DRAFT_LENGTH) reject("规划超过会话剩余额度，可先导出 JSON，或新建会话再添加");
      return saveDraft(notebook, { ...current, text: next, updatedAt: new Date().toISOString() });
    });
    return ok ? null : failure ?? store.getSnapshot().error ?? "会话保存失败，规划内容保留，请重试";
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
    onNew: () => newDraft(),
    onOperation: openOperation,
    menuRefs,
    projects,
    projectId,
    onProject: selectProject,
    onPlugins: () => openConfiguration("plugins"),
  };

  // Mount editor state after hydration reads the account's stored draft.
  const editorKey = `${snapshot === SERVER_SNAPSHOT ? "loading" : "ready"}:${activeDraft.id}:${editorGeneration}`;

  return (
    <section
      aria-label="AI 对话工作区"
      className={compact ? "flex h-full min-h-0 overflow-hidden bg-card" : "flex h-[calc(100dvh-3.5rem)] min-h-[480px] overflow-hidden bg-card md:h-dvh"}
    >
      {!compact && (
        <aside
          id="ai-history-list"
          aria-label="会话列表"
          aria-hidden={!showHistory}
          inert={!showHistory}
          style={{width:showHistory ? 240 : 0}}
          className="ai-history hidden shrink-0 overflow-hidden border-border bg-background/70 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex"
        >
          <div className={`flex w-60 min-w-60 flex-col border-r border-border transition-[opacity,transform] duration-250 ${showHistory ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3"}`}><DraftList {...listProps} /></div>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog.Root open={historyOpen} onOpenChange={setHistoryOpen}>
              <Dialog.Trigger asChild>
                <Button
                  ref={historyTrigger}
                  size="icon"
                  variant="ghost"
                  className={compact ? "h-8 w-8 text-muted-foreground" : "h-8 w-8 text-muted-foreground lg:hidden"}
                  aria-label="打开会话列表"
                >
                  <MessageSquare size={17} />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay fixed inset-0 z-60 bg-black/35" />
                <Dialog.Content className="drawer-left-surface fixed inset-y-0 left-0 z-60 flex w-[min(320px,85vw)] flex-col border-r border-border bg-card pt-5 shadow-xl">
                  <Dialog.Title className="sr-only">会话</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    选择或管理保存在当前浏览器的会话。
                  </Dialog.Description>
                  <Dialog.Close asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="关闭会话列表"
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
              className={compact ? "hidden" : "hidden h-8 w-8 text-muted-foreground lg:inline-flex"}
              aria-label={showHistory ? "收起会话列表" : "展开会话列表"}
              aria-expanded={showHistory}
              aria-controls="ai-history-list"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? (
                <ChevronLeft size={17} />
              ) : (
                <MessageSquare size={17} />
              )}
            </Button>
            <div className="min-w-0">
              <h1 className="max-w-52 truncate text-sm font-semibold">{activeDraft.title}</h1>
              <p
                className="mt-0.5 max-w-52 truncate text-[11px] text-muted-foreground"
                title={activeDraft.title}
              >
                {projectName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="会话所属项目" value={projectId ?? ""} onChange={(event) => selectProject(event.target.value || null)} className="ui-press max-w-40 rounded-lg border border-border bg-card px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">个人会话</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}{projectId && !projects.some((project) => project.id === projectId) && <option value={projectId}>项目会话</option>}</select>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" aria-label="打开模型配置" onClick={() => openConfiguration()}><SlidersHorizontal size={16} /></Button>
            <a href="/guide#ai" aria-label="查看 AI 使用指引" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><GuideIcon size={17} /></a>
          </div>
        </header>
        {planningContext && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-brand-soft/40 px-4 py-3 text-xs sm:px-6"><p className="min-w-0 break-words">{planningContext.taskId ? "任务" : planningContext.milestoneId ? "里程碑" : "项目"}规划：{planningContext.title}</p><Button type="button" size="sm" variant="outline" disabled={!builtinEnabled(plugins.library, "task-planner")} onClick={openMilestonePlan}><ListTree size={15} />打开任务规划</Button></div>}
        {planningError && <p role="alert" className="shrink-0 border-b border-border px-4 py-3 text-xs text-destructive">此规划来源已失效或不可访问，请从可访问的里程碑重新进入。</p>}
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
        {cleanupError && <div role="alert" className="flex items-center gap-3 border-b border-border px-5 py-2 text-xs text-destructive"><p>{cleanupError}</p><Button variant="ghost" size="sm" onClick={() => cleanupMaterials(cleanupIds)}>重试清理</Button></div>}
        <DraftEditor
          key={editorKey}
          draft={activeDraft}
          store={store}
          persistRef={persistRef}
          busyRef={busyRef}
          inputId={inputId}
          focusOnOpen={focusOnOpen}
          compact={compact}
          userId={userId}
          projectName={projectName}
          accessibleProjectId={projects.some((project) => project.id === projectId) ? projectId : null}
          onConfigure={openConfiguration}
          onPlan={() => openDraftPlan()}
          onPlanMessage={openDraftPlan}
          pluginLibrary={plugins.library}
          pluginsError={plugins.error}
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
              else document.getElementById(inputId)?.focus();
            }}
            className="dialog-surface fixed top-1/2 left-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <Dialog.Title className="text-lg font-semibold">
              {operation?.kind === "rename" ? "重命名会话" : "删除会话"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 break-words text-sm leading-6 text-muted-foreground">
              {operation?.kind === "rename"
                ? "修改会话名称，内容会保留。"
                : `删除“${operation?.draft.title ?? ""}”后无法恢复。`}
            </Dialog.Description>
            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!operation) return;
                const removed = operation.kind === "delete" ? store.getSnapshot().notebook.drafts.find((draft) => draft.id === operation.draft.id) : undefined;
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
                  if (removed) cleanupMaterials(draftMaterials(removed).map((item) => item.id));
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
                  <Label htmlFor="draft-title">会话名称</Label>
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
                  {operation?.kind === "delete" ? "删除会话" : "保存名称"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {pluginLibraryOpen && <PluginLibraryDialog userId={userId} saveGuardRef={pluginSaveRef} onClose={() => setPluginLibraryOpen(false)} onReturnFocus={() => document.getElementById(inputId)?.focus()} />}
      {planningTarget && <TaskPlanDialog key={`${userId}:${planningTarget.projectId ?? "personal"}:${planningTarget.context?.taskId ?? planningTarget.context?.sourceId ?? planningTarget.context?.milestoneId ?? "general"}`} userId={userId} projectId={planningTarget.projectId} context={planningTarget.context} initialGoal={planningTarget.initialGoal} onClose={() => setPlanningTarget(null)} onReturnFocus={() => document.getElementById(inputId)?.focus()} onAttach={attachTaskPlan} saveGuardRef={planningSaveRef} onConfigure={openConfiguration} />}
    </section>
  );
}
