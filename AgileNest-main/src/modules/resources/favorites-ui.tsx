"use client";
import { accountFetch } from "@/components/account-request";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const itemSchema = z.object({ id: z.string(), title: z.string(), teamId: z.string(), projectId: z.string().nullable(), tags: z.array(z.string()) });
type Item = z.infer<typeof itemSchema>;
async function request(init?: RequestInit) {
  const response = await accountFetch("/api/v1/resources/favorites", { cache: "no-store", ...init });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(value).error);
  return value;
}
async function change(resourceId: string, favorite: boolean) {
  await request({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceId, favorite }) });
}
export function ResourceFavoriteButton({ resourceId }: { resourceId: string }) {
  return <FavoriteButton key={resourceId} resourceId={resourceId} />;
}
function FavoriteButton({ resourceId }: { resourceId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void request().then((value) => { const items = z.object({ resources: z.array(itemSchema) }).parse(value).resources; if (active) setSaved(items.some((item) => item.id === resourceId)); }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "收藏加载失败"); });
    return () => { active = false; };
  }, [resourceId, retry]);
  return <span className="inline-flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" aria-pressed={saved ?? false} disabled={busy || saved === null && !error} onClick={async () => {
    if (saved === null) { setError(""); setRetry((value) => value + 1); return; }
    setBusy(true); setError("");
    try { await change(resourceId, !saved); setSaved(!saved); } catch (e) { setError(e instanceof Error ? e.message : "收藏保存失败"); } finally { setBusy(false); }
  }}><Bookmark className={`h-4 w-4 ${saved ? "fill-current text-amber-600" : ""}`} />{busy ? "保存中…" : saved === null ? error ? "重试收藏状态" : "加载收藏…" : saved ? "已收藏" : "收藏"}</Button>{error && <span role="alert" className="text-xs text-destructive">{error}</span>}</span>;
}
export function ResourceFavoritesWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => request().then((value) => { setItems(z.object({ resources: z.array(itemSchema) }).parse(value).resources); }).catch((e: unknown) => { setError(e instanceof Error ? e.message : "收藏加载失败"); }).finally(() => { setLoading(false); }), []);
  useEffect(() => { void load(); }, [load]);
  const matches = items.filter((item) => `${item.title} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Bookmark className="h-6 w-6" />我的收藏</h1><p className="mt-2 text-sm text-muted-foreground">仅显示你当前仍可访问的资料。</p></div><Input aria-label="搜索收藏" placeholder="搜索标题或标签" value={query} onChange={(event) => setQuery(event.target.value)} />{error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" onClick={() => { setLoading(true); setError(""); void load(); }}>重试</Button></div>}{loading ? <p role="status">正在加载收藏…</p> : <><p className="text-sm text-muted-foreground">{matches.length} 条收藏</p>{matches.length === 0 && !error ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{query ? "没有匹配的收藏，试试其他关键词。" : "还没有可访问的收藏。打开团队或项目资料，点击「收藏」即可添加。"}</div> : <ul className="space-y-3">{matches.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><Link className="min-w-0 flex-1 rounded font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring" href={`${item.projectId ? `/p/${item.projectId}` : `/t/${item.teamId}`}/resources?resource=${item.id}`}><span className="block break-words">{item.title}</span><span className="mt-1 block break-words text-xs font-normal text-muted-foreground">{item.projectId ? "项目资料" : "团队资料"}{item.tags.length ? ` · ${item.tags.join(" · ")}` : ""}</span></Link><Button variant="ghost" size="sm" disabled={busy !== null} onClick={async () => { setBusy(item.id); setError(""); try { await change(item.id, false); setItems((rows) => rows.filter((row) => row.id !== item.id)); } catch (e) { setError(e instanceof Error ? e.message : "取消收藏失败"); } finally { setBusy(null); } }} aria-label={`取消收藏 ${item.title}`}><Bookmark className="h-4 w-4 fill-current text-amber-600" />{busy === item.id ? "保存中…" : "取消收藏"}</Button></li>)}</ul>}</>}</main>;
}
