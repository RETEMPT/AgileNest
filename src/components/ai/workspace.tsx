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
import {
  ArrowUp,
  ChevronLeft,
  ChevronDown,
  Folder,
  Plug,
  SlidersHorizontal,
  Copy,
  FileText,
  Info,
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
} from "lucide-react";
import { AiChatIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { browserDraftStore, SERVER_SNAPSHOT } from "./draft-store";
import { useUiPreferences } from "@/components/preferences";
import { AiConfiguration } from "./configuration";
import { BUILTIN_PLUGINS } from "./configuration-model";
import { MATERIAL_ACCEPT, readMaterial, validateMaterialBatch, type LocalMaterial, type MaterialRef } from "./materials";
import { deleteMaterials, putMaterials } from "./material-store";
import { MaterialChips, MaterialsDialog, type MaterialsMode } from "./materials-ui";
import {
  draftMaterials,
  draftStorageKey,
  MAX_DRAFT_LENGTH,
  MAX_DRAFTS,
  MAX_TITLE_LENGTH,
  MAX_LOCAL_MESSAGES,
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
      <Button variant="ghost" className="mt-2 w-full justify-start text-muted-foreground" onClick={onPlugins}><Plug size={16} />插件</Button>
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
      <Label htmlFor={projectSelectId} className="mt-5 mb-2 px-2 text-xs text-muted-foreground">项目</Label>
      <select id={projectSelectId} value={projectId ?? ""} onChange={(event) => onProject(event.target.value || null)} className="ui-press mb-4 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">个人会话</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}{projectId && !projects.some((project) => project.id === projectId) && <option value={projectId}>已不可访问的项目（本地草稿）</option>}</select>
      <p className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground"><Folder size={14} />{projects.find((project) => project.id === projectId)?.name ?? (projectId ? "项目草稿" : "个人会话")}</p>
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
                {(draft.text || draft.messages?.at(-1)?.text || (draft.materials?.length ? draft.materials : draft.messages?.at(-1)?.materials)?.map((item) => item.name).join("、") || "空白草稿").replace(/\s+/g," ")}
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
      <p className="mt-4 border-t border-border/70 pt-4 text-[11px] text-muted-foreground">保存在此浏览器</p>
    </div>
  );
}

function DraftEditor({ draft, store, persistRef, focusOnOpen, compact, userId, projectName, onConfigure }: {
  draft: AiDraft;
  store: Store;
  persistRef: React.RefObject<(() => boolean) | null>;
  focusOnOpen: boolean;
  compact: boolean;
  userId: string;
  projectName: string;
  onConfigure: (tab: "model" | "plugins") => void;
}) {
  const [text, setText] = useState(draft.text);
  const [savedText, setSavedText] = useState(draft.text);
  const [remoteText, setRemoteText] = useState(draft.text);
  const [feedback, setFeedback] = useState("");
  const [materialError, setMaterialError] = useState("");
  const [importing, setImporting] = useState(false);
  const [removalIds, setRemovalIds] = useState<string[]>([]);
  const [materialsMode, setMaterialsMode] = useState<MaterialsMode | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { preferences } = useUiPreferences(userId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importLock = useRef(false);
  const dragDepth = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const latestPersist = useRef<(() => boolean) | null>(null);
  const dirty = text !== savedText;
  const messages = draft.messages ?? [];
  const enabledPlugins = BUILTIN_PLUGINS.filter((plugin) => preferences.ai.plugins.includes(plugin.id));
  useEffect(() => { if (focusOnOpen) inputRef.current?.focus(); }, [focusOnOpen]);
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
  useEffect(() => { transcriptRef.current?.scrollTo({top:transcriptRef.current.scrollHeight,behavior:"smooth"}); }, [messages.length]);
  const persist = useCallback(() => {
    const ok = store.saveText(draft,text,savedText,draft === INITIAL_DRAFT);
    if (ok) setSavedText(text);
    return ok;
  }, [draft, store, text, savedText]);
  useLayoutEffect(() => { latestPersist.current = persist; }, [persist]);
  useEffect(() => () => { latestPersist.current?.(); }, []);
  useLayoutEffect(() => {
    persistRef.current = persist;
    const onLeave = () => { persist(); };
    window.addEventListener("pagehide", onLeave);
    return () => { window.removeEventListener("pagehide", onLeave); persistRef.current = null; };
  }, [persist, persistRef]);
  useEffect(() => { if (!dirty) return; const timer = window.setTimeout(persist, 450); return () => window.clearTimeout(timer); }, [dirty,persist]);
  function recordMessage() {
    if (!text.trim() && !draft.materials?.length) return;
    if (messages.length >= MAX_LOCAL_MESSAGES) { setFeedback("每份会话最多记录 20 条，请新建会话"); return; }
    if (!persist()) return;
    const ok = store.commit((notebook) => {
      const current = notebook.drafts.find((item) => item.id === draft.id)!;
      return saveDraft(notebook,{...current,text:"",materials:[],messages:[...(current.messages ?? []),{id:crypto.randomUUID(),text:text.trim(),materials:current.materials,createdAt:new Date().toISOString()}],updatedAt:new Date().toISOString()});
    });
    if (ok) { setText(""); setSavedText(""); setMaterialError(""); setFeedback("已记录到本地会话，未发送给模型"); inputRef.current?.focus(); }
  }
  async function copyText() {
    const materialNames = (items?: MaterialRef[]) => items?.length ? `[资料：${items.map((item) => item.name).join("、")}]` : "";
    const content = [...messages.map((message) => [materialNames(message.materials),message.text].filter(Boolean).join("\n")),materialNames(draft.materials),text].filter(Boolean).join("\n\n");
    try { await navigator.clipboard.writeText(content); setFeedback("已复制会话内容"); }
    catch { inputRef.current?.focus(); inputRef.current?.select(); setFeedback("复制失败，请选择内容手动复制"); }
  }
  function applyPrompt(prompt: string) {
    const nextText = text.trim() ? `${text.trimEnd()}\n\n${prompt}` : prompt;
    if (nextText.length > MAX_DRAFT_LENGTH) { setFeedback("内容超过 6000 字，请先整理当前草稿"); return; }
    setText(nextText); setFeedback(""); inputRef.current?.focus();
  }
  async function importFiles(files: File[]) {
    if (!files.length || importLock.current) return false;
    if (!persist()) return false;
    importLock.current = true; setImporting(true); setMaterialError("");
    try {
      const current = store.getSnapshot().notebook.drafts.find((item) => item.id === draft.id) ?? draft;
      validateMaterialBatch(draftMaterials(current),files);
      const materials: LocalMaterial[] = [];
      for (const file of files) materials.push(await readMaterial(file));
      await putMaterials(userId,materials);
      const ok = store.commit((notebook) => {
        const latest = notebook.drafts.find((item) => item.id === draft.id);
        if (!latest && draft !== INITIAL_DRAFT) throw new Error("草稿已删除");
        validateMaterialBatch(draftMaterials(latest ?? draft),files);
        return saveDraft(notebook,{...(latest ?? draft),materials:[...(latest?.materials ?? []),...materials.map((item) => item.ref)],updatedAt:new Date().toISOString()});
      });
      if (!ok) {const ids = materials.map((item) => item.ref.id);await deleteMaterials(userId,ids).catch(() => setRemovalIds((current) => Array.from(new Set([...current,...ids]))));setMaterialError("资料未加入会话，请查看保存提示后重试");return false;}
      setFeedback(`已添加 ${materials.length} 份资料`);return true;
    } catch (error) {setMaterialError(error instanceof Error ? error.message : "文件读取失败，请重试");return false;}
    finally {importLock.current = false;setImporting(false);}
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
    {dragOver && <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-card/95"><div className="text-center"><Paperclip size={28} className="mx-auto text-brand" /><p className="mt-3 text-sm font-medium">松开以添加资料</p><p className="mt-2 text-xs text-muted-foreground">单文件 10 MB · 会话最多 10 份、50 MB</p></div></div>}
    <div ref={transcriptRef} className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto ${compact ? "px-4 py-5" : "px-5 py-8 sm:px-8"}`}>
      <div className="mx-auto w-full max-w-4xl">
        {messages.length === 0 ? <div className={`panel-enter ${compact ? "pt-2" : "pt-4 lg:pt-8"}`}>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><AiChatIcon size={23} /></div>
          <h2 className={`${compact ? "text-base" : "text-2xl"} font-semibold tracking-tight`}>{projectName === "个人会话" ? "从一个想法开始" : `一起推进${projectName}`}</h2>
          <p className="mt-3 text-sm text-muted-foreground">整理目标、讨论问题，留下下一步计划。</p>
          <div className="mt-6 flex flex-wrap gap-2">{enabledPlugins.map((plugin) => { const Icon = PLUGIN_ICONS[BUILTIN_PLUGINS.indexOf(plugin)]; return <button key={plugin.id} type="button" title={plugin.description} onClick={() => applyPrompt(plugin.prompt)} className="ui-press flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs hover:border-brand/30 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon size={15} />{plugin.name}</button>; })}</div>
        </div> : <div className="space-y-6">
          {messages.map((message) => <article key={message.id} className="panel-enter ml-auto max-w-[90%] rounded-2xl rounded-tr-md bg-brand-soft px-5 py-4 text-sm leading-7">{message.materials?.length ? <MaterialChips items={message.materials} onOpen={openMaterial} /> : null}{message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}<p className="mt-2 text-right text-[10px] text-muted-foreground">本地记录 · {new Date(message.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</p></article>)}
          {preferences.ai.model.showReasoning && <details className="ai-details rounded-xl border border-border p-4"><summary className="ui-press flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground"><ChevronDown size={14} />思考与执行过程<span className="ml-auto">等待模型接入</span></summary><div className="ai-details-body"><p className="pt-3 text-sm leading-6 text-muted-foreground">连接模型后，这里展示服务公开返回的思考摘要与工具执行进度。当前会话仅保存在本地。</p></div></details>}
        </div>}
      </div>
    </div>
    <div className={`shrink-0 bg-card ${compact ? "px-3 pt-2 pb-3" : "px-5 pt-3 pb-5 sm:px-8"}`}>
      <div className="mx-auto w-full max-w-3xl">
        {draft.materials?.length ? <div className="mb-2"><MaterialChips items={draft.materials} onOpen={openMaterial} onRemove={removeMaterial} /></div> : null}
        {materialError && <div role="alert" className="mb-2 flex items-start gap-2 text-xs leading-5 text-destructive"><p className="flex-1">{materialError}</p><Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" aria-label="关闭资料错误提示" onClick={() => setMaterialError("")}><X size={12} /></Button></div>}
        {removalIds.length > 0 && <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-destructive"><p>资料已移出会话，文件清理失败</p><Button variant="ghost" size="sm" onClick={() => cleanupDetached(removalIds)}>重试清理</Button></div>}
        {importing && <p role="status" className="mb-2 text-xs text-brand">正在读取并保存资料…</p>}
        <div className="ai-composer rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[0_4px_24px_-12px_rgba(41,74,120,0.16)] focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/10">
          <Label htmlFor="ai-draft-input" className="sr-only">对话内容</Label>
          <Textarea id="ai-draft-input" ref={inputRef} value={text} maxLength={MAX_DRAFT_LENGTH} onChange={(event) => { setText(event.target.value); setFeedback(""); }} onBlur={persist} onKeyDown={(event) => {
            if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); recordMessage(); }
          }} aria-describedby="ai-draft-hint" placeholder={projectName === "个人会话" ? "写下想法，+ 添加文件或资料…" : `讨论${projectName}，+ 添加资料…`} className="custom-scrollbar min-h-10 max-h-36 resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="添加文件与工具"><Plus size={18} /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="start" side="top" sideOffset={10} collisionPadding={12} className="ai-add-menu z-70 max-h-[min(540px,70dvh)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
              <DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs text-muted-foreground">添加内容</DropdownMenu.Label>
              <DropdownMenu.Item disabled={importing} onSelect={() => fileInputRef.current?.click()} className="ai-menu-item"><Paperclip size={17} /><span><span className="block">添加文件 / 图片</span><span className="mt-0.5 block text-xs text-muted-foreground">从本机选择，或拖入工作区</span></span></DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setMaterialsMode({kind:"paste"})} className="ai-menu-item"><ClipboardPaste size={17} /><span>粘贴文本资料</span></DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setMaterialsMode({kind:"organize"})} className="ai-menu-item"><ListTree size={17} /><span>读取与整理资料{draftMaterials(draft).length > 0 && <span className="ml-2 text-xs text-muted-foreground">{draftMaterials(draft).length}</span>}</span></DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
              {enabledPlugins.length > 0 && <><DropdownMenu.Label className="px-3 pt-1 pb-1 text-xs text-muted-foreground">本地技能</DropdownMenu.Label>{enabledPlugins.map((plugin) => {const Icon = PLUGIN_ICONS[BUILTIN_PLUGINS.indexOf(plugin)];return <DropdownMenu.Item key={plugin.id} onSelect={() => applyPrompt(plugin.prompt)} className="ai-menu-item"><Icon size={17} /><span>{plugin.name}</span></DropdownMenu.Item>;})}<DropdownMenu.Separator className="my-1.5 h-px bg-border" /></>}
              <DropdownMenu.Item onSelect={() => onConfigure("plugins")} className="ai-menu-item"><Plug size={17} />管理插件</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
            <div className="flex min-w-0 items-center gap-1.5"><Button variant="ghost" size="sm" className="h-7 max-w-44 truncate text-xs text-muted-foreground" onClick={() => onConfigure("model")}><span className="truncate">{preferences.ai.model.model || "选择模型"}</span><ChevronDown size={12} /></Button><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" aria-label="复制会话内容" disabled={!text.trim() && !messages.length} onClick={copyText}><Copy size={15} /></Button><Button size="icon" className="h-7 w-7 rounded-full" aria-label="记录到本地会话" title="记录到本地会话（不发送给模型）" disabled={importing || (!text.trim() && !draft.materials?.length)} onClick={recordMessage}><ArrowUp size={16} /></Button></div>
          </div>
        </div>
        <div id="ai-draft-hint" className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>模型未接入 · 仅本地记录</span><span role="status" className="truncate text-right">{feedback || (dirty ? "保存中…" : text ? "草稿已保存" : "Ctrl / ⌘ + Enter 记录")}</span></div>
      </div>
    </div>
    {materialsMode && <MaterialsDialog key={`${materialsMode.kind}:${"id" in materialsMode ? materialsMode.id ?? "" : ""}`} mode={materialsMode} onClose={() => setMaterialsMode(null)} items={draftMaterials(draft)} userId={userId} importError={materialError} importing={importing} onImport={importFiles} onPick={() => fileInputRef.current?.click()} onAttachText={(content) => {const next = text.trim() ? `${text.trimEnd()}\n\n${content}` : content;if (next.length > MAX_DRAFT_LENGTH) return "目录超过输入框剩余额度，可复制目录单独保存";applyPrompt(content);setMaterialsMode(null);return null;}} />}
  </div>;
}
export function AiWorkspace({ userId, projects, compact = false, saveGuardRef }: { userId: string; projects: Project[]; compact?: boolean; saveGuardRef?: React.RefObject<(() => boolean) | null> }) {
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
  const [configurationTab, setConfigurationTab] = useState<"model" | "plugins" | null>(null);
  const [cleanupError, setCleanupError] = useState("");
  const [cleanupIds, setCleanupIds] = useState<string[]>([]);
  const persistRef = useRef<(() => boolean) | null>(null);
  const menuRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const projectId = activeDraft.projectId ?? null;
  const projectName = projects.find((project) => project.id === projectId)?.name ?? (projectId ? "项目草稿" : "个人会话");
  function cleanupMaterials(ids: string[]) {
    const retained = new Set(store.getSnapshot().notebook.drafts.flatMap(draftMaterials).map((item) => item.id));
    const unused = Array.from(new Set([...cleanupIds,...ids])).filter((id) => !retained.has(id));
    void deleteMaterials(userId,unused).then(() => {setCleanupError("");setCleanupIds([]);}).catch(() => {setCleanupIds(unused);setCleanupError("草稿已删除，附件文件清理失败，请重试");});
  }

  useEffect(() => {
    if (!saveGuardRef) return;
    saveGuardRef.current = () => persistRef.current?.() ?? true;
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
    onPlugins: () => setConfigurationTab("plugins"),
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
          aria-label="对话草稿列表"
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
                  className={compact ? "hidden" : "h-8 w-8 text-muted-foreground lg:hidden"}
                  aria-label="打开对话草稿列表"
                >
                  <MessageSquare size={17} />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay fixed inset-0 z-60 bg-black/35" />
                <Dialog.Content className="drawer-left-surface fixed inset-y-0 left-0 z-60 flex w-[min(320px,85vw)] flex-col border-r border-border bg-card pt-5 shadow-xl">
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
              className={compact ? "hidden" : "hidden h-8 w-8 text-muted-foreground lg:inline-flex"}
              aria-label={showHistory ? "收起草稿列表" : "展开草稿列表"}
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
            <select aria-label="会话所属项目" value={projectId ?? ""} onChange={(event) => selectProject(event.target.value || null)} className="ui-press max-w-40 rounded-lg border border-border bg-card px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">个人会话</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}{projectId && !projects.some((project) => project.id === projectId) && <option value={projectId}>项目草稿</option>}</select>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" aria-label="打开模型配置" onClick={() => setConfigurationTab("model")}><SlidersHorizontal size={16} /></Button>
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
        {cleanupError && <div role="alert" className="flex items-center gap-3 border-b border-border px-5 py-2 text-xs text-destructive"><p>{cleanupError}</p><Button variant="ghost" size="sm" onClick={() => cleanupMaterials(cleanupIds)}>重试清理</Button></div>}
        <DraftEditor
          key={editorKey}
          draft={activeDraft}
          store={store}
          persistRef={persistRef}
          focusOnOpen={focusOnOpen}
          compact={compact}
          userId={userId}
          projectName={projectName}
          onConfigure={setConfigurationTab}
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
      <Dialog.Root open={configurationTab !== null} onOpenChange={(open) => { if (!open) setConfigurationTab(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-70 bg-black/35" /><Dialog.Content className="dialog-surface fixed top-1/2 left-1/2 z-70 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7"><Dialog.Title className="text-lg font-semibold">AI 设置</Dialog.Title><Dialog.Description className="mt-1 mb-4 text-xs text-muted-foreground">管理此账号的本地模型配置与插件。</Dialog.Description><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭 AI 设置" className="absolute top-3 right-3"><X size={17} /></Button></Dialog.Close>{configurationTab && <AiConfiguration key={configurationTab} userId={userId} initialTab={configurationTab} />}</Dialog.Content></Dialog.Portal></Dialog.Root>
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
              当前支持按项目整理本地会话、添加文件资料、插件提纲和模型配置草稿。加号可选择文件、粘贴文本或打开资料面板；记录按钮只保存内容，不发送给模型。
            </Dialog.Description>
            <p className="mt-4 rounded-xl bg-background p-4 text-xs leading-6 text-muted-foreground">
              草稿按当前账号保存在此浏览器。清除浏览器数据会删除草稿；需要保留的内容可使用复制按钮。每个账号最多
              40 份，每条最多 6000 字，每份最多 20 条记录。资料独立保存：单文件 10 MB，每份会话最多 10 份、合计 50 MB。文本可读取与提取目录；PDF、图片提供预览，暂不提取正文。
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
