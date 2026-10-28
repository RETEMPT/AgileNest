"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plug, Plus, RefreshCw, Search, X } from "lucide-react";
import { builtinCatalog, type BuiltinId, type PluginLibrary } from "@/modules/ai/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MODEL_SETTINGS_GUARD_EVENT } from "./model-connection";
import { builtinEnabled, PLUGIN_LIBRARY_EVENT, usePluginLibrary, requestPluginChange } from "./plugin-library";

type Server = PluginLibrary["mcpServers"][number];
type ServerForm = { id?: string; name: string; url: string; token: string; replaceToken: boolean; noToken: boolean };
const emptyServer = (): ServerForm => ({ name: "", url: "", token: "", replaceToken: false, noToken: true });
export function pluginMatches(query: string, ...values: string[]) { return values.join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()); }

export function PluginLibraryDialog({ userId, onClose, onReturnFocus, saveGuardRef }: { userId: string; onClose: () => void; onReturnFocus?: () => void; saveGuardRef?: RefObject<(() => boolean) | null> }) {
  const localGuardRef = useRef<(() => boolean) | null>(null);
  const guardRef = saveGuardRef ?? localGuardRef;
  return <Dialog.Root open onOpenChange={(open) => { if (!open && (guardRef.current?.() ?? true)) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-80 bg-black/35" /><Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-80 flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl" onCloseAutoFocus={(event) => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }}><header className="shrink-0 border-b border-border p-5"><Dialog.Title className="flex items-center gap-2 pr-8 text-lg font-semibold"><Plug size={20} />插件库</Dialog.Title><Dialog.Description className="mt-2 text-xs text-muted-foreground">按账号保存在服务器，为当前模型选择可使用的工具。</Dialog.Description><Dialog.Close asChild><Button size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="关闭插件库"><X size={18} /></Button></Dialog.Close></header><div className="custom-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5"><PluginLibraryPanel userId={userId} saveGuardRef={guardRef} /></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function PluginLibraryPanel({ userId, saveGuardRef }: { userId: string; saveGuardRef?: RefObject<(() => boolean) | null> }) {
  const { library, setLibrary, loading, error: loadError, refresh } = usePluginLibrary(userId);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<ServerForm | null>(null);
  const [baseline, setBaseline] = useState("");
  const [deleting, setDeleting] = useState<Server | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const id = useId();
  const dirty = editor !== null && JSON.stringify(editor) !== baseline;
  const editing = editor !== null;
  useEffect(() => { if (editing) document.getElementById(`${id}-name`)?.focus(); }, [editing, id]);
  useEffect(() => {
    const guard = () => { if (pending || dirty) { setError(pending ? "正在保存或发现工具，请等待完成或停止请求后再关闭" : "连接表单有未保存内容，请先保存或放弃修改"); return false; } return true; };
    if (saveGuardRef) saveGuardRef.current = guard;
    const onNavigate = (event: Event) => { if (!guard()) event.preventDefault(); };
    const onLeave = (event: BeforeUnloadEvent) => { if (!guard()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener(MODEL_SETTINGS_GUARD_EVENT, onNavigate); window.addEventListener("beforeunload", onLeave);
    return () => { if (saveGuardRef) saveGuardRef.current = null; window.removeEventListener(MODEL_SETTINGS_GUARD_EVENT, onNavigate); window.removeEventListener("beforeunload", onLeave); };
  }, [dirty, pending, saveGuardRef]);
  useEffect(() => () => requestRef.current?.abort(), []);
  async function mutate(body: unknown, method: "PUT" | "PATCH" | "discover") {
    if (requestRef.current) return false;
    const controller = new AbortController(); requestRef.current = controller; setPending(true); setError(""); setNotice("");
    try {
      const next = await requestPluginChange(body, controller.signal, method);
      controller.signal.throwIfAborted(); setLibrary(next); setNotice(method === "discover" ? "工具发现完成；新工具默认关闭，请核对后逐项启用" : "已保存到当前账号服务器配置"); window.dispatchEvent(new Event(PLUGIN_LIBRARY_EVENT)); return true;
    } catch (error) { setError(controller.signal.aborted ? "请求已停止，请重新加载确认服务器状态；未保存的表单仍保留" : error instanceof Error ? error.message : "保存失败，原配置保留，请重试"); return false; }
    finally { requestRef.current = null; setPending(false); }
  }
  function edit(server?: Server) {
    if (pending || dirty) { setError("请先保存或放弃当前连接修改"); return; }
    const form = server ? { id: server.id, name: server.name, url: server.url, token: "", replaceToken: false, noToken: !server.hasToken } : emptyServer();
    setEditor(form); setBaseline(JSON.stringify(form)); setError("");
  }
  const toggleBuiltin = (builtinId: BuiltinId, enabled: boolean) => library && void mutate({ expectedRevision: library.revision, builtins: [{ id: builtinId, enabled }] }, "PUT");
  const tools = builtinCatalog.filter((item) => item.kind === "tool" && pluginMatches(query, item.name, item.description));
  const prompts = builtinCatalog.filter((item) => item.kind === "prompt" && pluginMatches(query, item.name, item.description));
  const servers = library?.mcpServers.filter((server) => pluginMatches(query, server.name, server.url, ...server.tools.map((tool) => `${tool.name} ${tool.description}`))) ?? [];
  const locked = pending || loading || !library;
  return <section aria-label="插件库内容" className="space-y-5">
    <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-40 flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><Input aria-label="搜索插件" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索功能、工具或服务" className="pl-8" /></div><select aria-label="插件分类" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm"><option value="all">全部功能</option><option value="tools">内置工具</option><option value="prompts">快捷提问</option><option value="mcp">MCP 连接</option></select><Button variant="outline" size="sm" disabled={pending} onClick={refresh}><RefreshCw size={14} />重新加载</Button></div>
    {(loadError || error) && <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs leading-6 text-destructive"><p>{error || loadError}</p><p>若其他窗口修改了配置，请重新加载最新版本后再试。当前连接表单会保留。</p><Button size="sm" variant="ghost" disabled={pending} onClick={refresh}>加载最新配置</Button></div>}
    {notice && <p role="status" className="text-xs text-brand">{notice}</p>}{loading && <p role="status" className="text-xs text-muted-foreground">正在读取账号插件配置…</p>}
    {pending && <div role="status" className="flex items-center gap-2 text-xs text-brand"><span>正在处理…</span><Button variant="ghost" size="sm" onClick={() => requestRef.current?.abort()}>停止请求</Button></div>}
    {(category === "all" || category === "tools") && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">内置工具 · {tools.length}</summary><div className="mt-4 space-y-3">{tools.map((item) => <label key={item.id} className="flex items-start justify-between gap-4 rounded-xl bg-muted/25 p-3"><span><span className="block text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span><span className="mt-1 block text-[11px] text-brand">{library ? builtinEnabled(library, item.id) ? "已启用" : "已关闭" : "配置尚未读取"}</span></span><input type="checkbox" role="switch" className="mt-1 h-4 w-4 shrink-0 accent-brand" aria-label={`启用${item.name}`} checked={builtinEnabled(library, item.id)} disabled={locked} onChange={(event) => toggleBuiltin(item.id, event.target.checked)} /></label>)}<p className="text-xs leading-5 text-muted-foreground">PPTX / DOCX 先提取文字，再供文本模型阅读；图片中的文字不在本功能范围内。关闭规划不会删除已创建任务。</p></div></details>}
    {(category === "all" || category === "prompts") && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">快捷提问 · {prompts.length}</summary><div className="mt-4 space-y-3"><p className="text-xs text-muted-foreground">只在输入框插入提纲，不是可执行工具。</p>{prompts.map((item) => <label key={item.id} className="flex items-start justify-between gap-4 rounded-xl bg-muted/25 p-3"><span><span className="block text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.description}</span></span><input type="checkbox" role="switch" aria-label={`启用${item.name}`} className="mt-1 h-4 w-4 shrink-0 accent-brand" checked={builtinEnabled(library, item.id)} disabled={locked} onChange={(event) => toggleBuiltin(item.id, event.target.checked)} /></label>)}</div></details>}
    {(category === "all" || category === "mcp") && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">MCP 连接 · {servers.length}</summary><div className="mt-4 space-y-4"><p className="text-xs leading-5 text-muted-foreground">MCP 是工具连接协议。识图、转录等能力需要接入实际提供该能力的服务；仅保存地址不会获得这些能力。仅启用你信任的服务，调用参数会发送至该地址，参数可能含问题或资料文字。本轮不会自动发送平台附件原件，也不授予数据库或本机访问权。</p>{servers.map((server) => <div key={server.id} className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{server.name}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{server.url}</p><p className="mt-1 text-[11px] text-muted-foreground">{server.enabled ? "服务已启用" : "服务已关闭"} · 已发现 {server.tools.length} 个工具 · {server.hasToken ? "已保存访问令牌" : "未设置访问令牌"}</p></div><input type="checkbox" role="switch" aria-label={`启用服务：${server.name}`} checked={server.enabled} disabled={locked} className="mt-1 h-4 w-4 shrink-0 accent-brand" onChange={(event) => void mutate({ expectedRevision: library!.revision, op: "toggle-server", serverId: server.id, enabled: event.target.checked }, "PATCH")} /></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={locked || dirty} onClick={() => edit(server)}>编辑连接</Button><Button size="sm" variant="outline" disabled={locked || dirty} onClick={() => void mutate({ serverId: server.id, expectedRevision: library!.revision }, "discover")}>发现工具</Button><Button size="sm" variant="ghost" disabled={locked || dirty} onClick={() => setDeleting(server)}>删除服务…</Button></div><details className="rounded-lg bg-muted/25 p-3"><summary className="cursor-pointer text-xs font-medium">工具列表 · {server.tools.length}</summary><div className="mt-3 space-y-3">{!server.tools.length && <p className="text-xs text-muted-foreground">尚未发现工具。请先保存连接，再点击“发现工具”。</p>}{server.tools.filter((tool) => !query.trim() || pluginMatches(query, server.name, tool.name, tool.description)).map((tool) => <label key={tool.name} className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block break-words text-xs font-medium">{tool.name}</span><span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">{tool.description || "服务未提供说明"}</span><span className="mt-1 block text-[11px] text-muted-foreground">{!tool.readOnly ? "服务未标注只读，暂不允许启用" : !server.enabled ? "服务关闭，工具暂不可调用" : tool.enabled ? "只读工具已启用" : "只读工具未启用"}</span></span><input type="checkbox" role="switch" aria-label={`启用工具：${server.name} / ${tool.name}`} checked={tool.enabled} disabled={locked || !tool.readOnly} className="mt-1 h-4 w-4 shrink-0 accent-brand" onChange={(event) => void mutate({ expectedRevision: library!.revision, op: "toggle-tool", serverId: server.id, toolName: tool.name, enabled: event.target.checked }, "PATCH")} /></label>)}</div></details></div>)}<Button variant="outline" className="w-full border-dashed" disabled={locked || dirty || (library?.mcpServers.length ?? 0) >= 8} onClick={() => edit()}><Plus size={15} />添加 MCP 服务</Button></div></details>}
    {editor && <form autoComplete="off" className="space-y-4 rounded-xl border border-brand/25 bg-brand-soft/20 p-4" onSubmit={async (event) => { event.preventDefault(); if (!library) return; const current = library.mcpServers.find((server) => server.id === editor.id); const changedUrl = current?.url !== editor.url.trim(); if (!editor.noToken && !editor.token.trim() && (!current || changedUrl || editor.replaceToken)) { setError("请填写访问令牌，或明确选择无需令牌"); return; } const token = editor.noToken ? "" : editor.token.trim() || undefined; const saved = await mutate({ expectedRevision: library.revision, server: { id: editor.id, name: editor.name.trim(), url: editor.url.trim(), ...(token !== undefined ? { token } : {}) } }, "PUT"); if (saved) { setEditor(null); setBaseline(""); } }}>
      <h3 className="text-sm font-semibold">{editor.id ? "编辑 MCP 连接" : "添加 MCP 连接"}</h3><p className="text-xs leading-5 text-muted-foreground">仅支持远程 HTTP / HTTPS 服务，不安装插件代码、不执行本机命令。新服务和新工具默认关闭。只读标签由服务提供，不能替代你对服务的信任判断。</p><div className="space-y-2"><Label htmlFor={`${id}-name`}>服务名称</Label><Input id={`${id}-name`} maxLength={60} required disabled={pending} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`${id}-url`}>MCP 服务地址</Label><Input id={`${id}-url`} type="url" name="mcp_service_endpoint" autoComplete="off" maxLength={1000} required disabled={pending} placeholder="https://example.com/mcp" value={editor.url} onChange={(event) => setEditor({ ...editor, url: event.target.value })} /></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editor.noToken} disabled={pending} onChange={(event) => setEditor({ ...editor, noToken: event.target.checked, replaceToken: true })} />无需访问令牌（保存时清除原令牌）</label>{!editor.noToken && <div className="space-y-2"><Label htmlFor={`${id}-token`}>Bearer 访问令牌</Label><Input id={`${id}-token`} type="password" name="mcp_access_token" autoComplete="new-password" maxLength={2048} disabled={pending} value={editor.token} placeholder={editor.id ? "留空保留同地址的已保存令牌" : "填写访问令牌"} onChange={(event) => setEditor({ ...editor, token: event.target.value, replaceToken: true })} /><p className="text-xs leading-5 text-muted-foreground">已有令牌不回显，不保存在浏览器；更换地址时请重新填写。</p></div>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || loading}>保存连接</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { setEditor(null); setBaseline(""); setError(""); }}>放弃未保存内容</Button></div>
    </form>}
    {deleting && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm"><p>删除服务“{deleting.name}”及其工具配置？</p><div className="mt-3 flex gap-2"><Button variant="destructive" size="sm" disabled={pending || !library} onClick={async () => { if (library && await mutate({ expectedRevision: library.revision, op: "delete-server", serverId: deleting.id }, "PATCH")) setDeleting(null); }}>确认删除</Button><Button variant="outline" size="sm" disabled={pending} onClick={() => setDeleting(null)}>取消</Button></div></div>}
    <p className="text-[11px] leading-5 text-muted-foreground">设置仅作用于当前账号。模型 API 配置请前往个人设置中的“模型配置”。</p>
  </section>;
}
