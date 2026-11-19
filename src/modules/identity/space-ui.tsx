"use client";

import { accountFetch } from "@/components/account-request";
import { useId, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ChevronRight, Folder, FolderPlus, LayoutGrid, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { FollowButton } from "@/modules/notify/ui";
import { projectDirectorySchema, projectSpaceMoveError, projectSpacePath, type ProjectDirectoryDTO, type ProjectSpaceDTO, type ProjectSpaceMutation } from "./space-client";

const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30";
const kinds = { course: "课程协作", lab: "实验室课题", contest: "竞赛项目" };
type FolderDraft = { id?: string; version?: number; name: string; parentId: string | null };

export function ProjectDirectory({ teamId, initial, kind }: { teamId: string; initial: ProjectDirectoryDTO; kind?: string }) {
  const [data, setData] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  if (initial !== baseline) { setBaseline(initial); setData(initial); }
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const [removing, setRemoving] = useState<ProjectSpaceDTO | null>(null);
  const [moving, setMoving] = useState<{ project: ProjectDirectoryDTO["projects"][number]; spaceId: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const feedback = useFeedback();
  const id = useId();
  const path = projectSpacePath(data.spaces, selected ?? null);
  const scopedSpaces = new Set(selected ? data.spaces.filter((space) => projectSpacePath(data.spaces, space.id).some((item) => item.id === selected)).map((space) => space.id) : []);
  const visible = data.projects.filter((project) => (!kind || project.kind === kind) && (selected === undefined || selected === null ? selected === undefined || project.spaceId === null : project.spaceId !== null && scopedSpaces.has(project.spaceId)) && `${project.name} ${project.description ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  async function responseData(response: Response) {
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "目录操作失败，请重试");
    return projectDirectorySchema.parse(value);
  }
  async function refresh() {
    setPending(true); setRefreshError("");
    try { setData(await responseData(await accountFetch(`/api/v1/teams/${teamId}/project-spaces`, { cache: "no-store" }))); }
    catch (cause) { setRefreshError(cause instanceof Error ? cause.message : "目录加载失败"); }
    finally { setPending(false); }
  }
  async function save(input: ProjectSpaceMutation) {
    setPending(true); setError("");
    try {
      const updated = await responseData(await accountFetch(`/api/v1/teams/${teamId}/project-spaces`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
      setData(updated); setDraft(null); setRemoving(null); setMoving(null);
      if (selected && !updated.spaces.some((space) => space.id === selected)) setSelected(undefined);
      feedback(input.op === "place" ? "项目目录已更新" : input.op === "delete" ? "空目录已删除" : "目录已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，输入已保留"); }
    finally { setPending(false); }
  }
  function tree(parentId: string | null, depth = 0) {
    return data.spaces.filter((space) => space.parentId === parentId).map((space) => <div key={space.id}>
      <div className="group flex items-center gap-1 rounded-lg hover:bg-accent">
        <button type="button" disabled={pending} aria-pressed={selected === space.id} className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === space.id ? "bg-brand-soft font-medium text-brand" : "text-muted-foreground"}`} style={{ paddingLeft: `${12 + depth * 14}px` }} onClick={() => setSelected(space.id)}><Folder className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{space.name}</span><span className="ml-auto text-[10px]">{data.projects.filter((project) => project.spaceId === space.id).length}</span></button>
        {data.canManage && <div className="flex shrink-0 items-center"><Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={pending} aria-label={`编辑目录 ${space.name}`} onClick={() => { setDraft({ id: space.id, version: space.version, name: space.name, parentId: space.parentId }); setError(""); }}><Pencil className="h-3 w-3" /></Button><Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={pending} aria-label={`删除空目录 ${space.name}`} onClick={() => { setRemoving(space); setError(""); }}><Trash2 className="h-3 w-3" /></Button></div>}
      </div>{tree(space.id, depth + 1)}
    </div>);
  }
  const dialog = !!draft || !!removing || !!moving;
  return <section className="overflow-hidden rounded-2xl border border-border bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h2 className="text-sm font-semibold">项目空间目录</h2><p className="mt-1 text-xs text-muted-foreground">按课题和团队主题组织项目；目录内包含子目录中的项目。</p></div><div className="flex items-center gap-2"><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void refresh()}>刷新目录</Button>{data.canManage && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { setDraft({ name: "", parentId: selected ?? null }); setError(""); }}><FolderPlus className="h-3.5 w-3.5" />新建目录</Button>}</div></header>
    <div className="grid min-w-0 md:grid-cols-[230px_1fr]">
      <aside className="max-h-72 space-y-1 overflow-y-auto border-b border-border bg-muted/20 p-3 md:max-h-[650px] md:border-r md:border-b-0"><nav aria-label="团队项目目录"><button type="button" disabled={pending} className={`flex w-full items-center gap-2 rounded-lg p-2 text-xs ${selected === undefined ? "bg-brand-soft font-medium text-brand" : "text-muted-foreground hover:bg-accent"}`} onClick={() => setSelected(undefined)}><LayoutGrid className="h-3.5 w-3.5" />全部项目<span className="ml-auto">{data.projects.length}</span></button><button type="button" disabled={pending} className={`flex w-full items-center gap-2 rounded-lg p-2 text-xs ${selected === null ? "bg-brand-soft font-medium text-brand" : "text-muted-foreground hover:bg-accent"}`} onClick={() => setSelected(null)}><Folder className="h-3.5 w-3.5" />未分类<span className="ml-auto">{data.projects.filter((project) => !project.spaceId).length}</span></button><div className="mt-2 border-t border-border pt-2">{tree(null)}</div></nav>{!data.spaces.length && <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">{data.canManage ? "可先建立课题目录，再把项目移入。" : "管理员或副管理员整理目录后会显示在这里。"}</p>}</aside>
      <div className="min-w-0 space-y-4 p-4 sm:p-5"><nav aria-label="项目目录路径" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><button type="button" className="hover:text-brand" onClick={() => setSelected(undefined)}>项目空间</button>{selected === null && <><ChevronRight className="h-3 w-3" />未分类</>}{path.map((space) => <span key={space.id} className="inline-flex items-center gap-1"><ChevronRight className="h-3 w-3" /><button type="button" className="hover:text-brand" onClick={() => setSelected(space.id)}>{space.name}</button></span>)}</nav>
        <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="搜索目录中的项目" placeholder="搜索项目名称或说明" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="shrink-0 text-xs text-muted-foreground">{visible.length} 项</span></label><FormFeedback message={refreshError} />
        {!visible.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center"><Folder className="mx-auto h-8 w-8 text-brand/50" /><p className="mt-3 text-sm">{search ? "没有匹配的项目" : "当前目录暂无项目"}</p><p className="mt-2 text-xs text-muted-foreground">可切换目录或项目分类{data.canManage ? "，也可将已有项目移入此处。" : "。"}</p></div> : <div className="grid gap-3 xl:grid-cols-2">{visible.map((project) => {
          const percent = project.total ? Math.round(project.accepted / project.total * 100) : 0;
          return <article key={project.id} className="ui-card-hover flex min-w-0 flex-col rounded-xl border border-border bg-background p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs text-brand">{project.kind ? kinds[project.kind] : "团队项目"}</span><Badge variant="secondary">{project.status === "active" ? "进行中" : "已归档"}</Badge></div><h3 className="mt-3 truncate font-semibold"><Link href={`/p/${project.id}`} className="hover:text-brand">{project.name}</Link></h3><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{project.description || "未填写项目说明"}</p><div className="mt-4 space-y-2"><div className="flex justify-between text-xs"><span className="text-muted-foreground">已验收 {project.accepted}/{project.total}</span><span>{percent}%</span></div><div role="progressbar" aria-label={`${project.name}验收完成度`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} /></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><FollowButton target={{ kind: "project", id: project.id }} /><div className="flex items-center gap-1">{data.canManage && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setMoving({ project, spaceId: project.spaceId }); setError(""); }}>移至目录</Button>}<Button asChild variant="ghost" size="sm"><Link href={`/p/${project.id}`}>打开项目<ArrowRight className="h-3.5 w-3.5" /></Link></Button></div></div></article>;
        })}</div>}
      </div>
    </div>
    <Dialog.Root open={dialog} onOpenChange={(open) => { if (!open && !pending) { setDraft(null); setRemoving(null); setMoving(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-black/40" /><Dialog.Content aria-describedby={`${id}-description`} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()} className="dialog-surface fixed left-1/2 top-1/2 z-[70] max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"><header className="flex items-center justify-between gap-2"><Dialog.Title className="text-lg font-semibold">{removing ? "删除空目录" : moving ? "调整项目目录" : draft?.id ? "编辑目录" : "新建目录"}</Dialog.Title><Dialog.Close asChild><Button size="icon" variant="ghost" disabled={pending} aria-label="关闭目录操作"><X className="h-4 w-4" /></Button></Dialog.Close></header><Dialog.Description id={`${id}-description`} className="mt-3 text-xs leading-5 text-muted-foreground">{removing ? `仅删除空目录“${removing.name}”；有子目录或项目时会保留。` : "目录最多四层。调整位置只整理入口，项目所属团队与成员权限保持一致。"}</Dialog.Description><form className="mt-5 space-y-4" onSubmit={(event) => {
      event.preventDefault(); if (pending) return;
      if (removing) void save({ op: "delete", id: removing.id, version: removing.version });
      else if (moving) void save({ op: "place", projectId: moving.project.id, version: moving.project.placementVersion, spaceId: moving.spaceId });
      else if (draft) void save(draft.id ? { op: "update", id: draft.id, version: draft.version!, name: draft.name, parentId: draft.parentId } : { op: "create", name: draft.name, parentId: draft.parentId });
    }}>
      {draft && <label className="block space-y-2 text-sm">目录名称<input autoFocus className={inputClass} value={draft.name} required maxLength={80} disabled={pending} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>}
      {(draft || moving) && <label className="block space-y-2 text-sm">{moving ? `“${moving.project.name}”的目录` : "上级目录"}<select className={inputClass} disabled={pending} value={draft ? draft.parentId ?? "" : moving!.spaceId ?? ""} onChange={(event) => { if (draft) setDraft({ ...draft, parentId: event.target.value || null }); else if (moving) setMoving({ ...moving, spaceId: event.target.value || null }); }}><option value="">{moving ? "未分类" : "根目录"}</option>{data.spaces.filter((space) => !draft || !projectSpaceMoveError(data.spaces, draft.id ?? null, space.id)).map((space) => <option key={space.id} value={space.id}>{projectSpacePath(data.spaces, space.id).map((item) => item.name).join(" / ")}</option>)}</select></label>}
      <FormFeedback message={error} />{error && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void refresh()}>保留输入并刷新目录</Button>}{error && <p className="text-xs text-muted-foreground">刷新会保留草稿；若该条目已被修改，请取消后从最新条目重新编辑。</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => { setDraft(null); setRemoving(null); setMoving(null); setError(""); }}>取消</Button><Button type="submit" variant={removing ? "destructive" : "default"} disabled={pending || !!draft && !draft.name.trim()}>{pending ? "保存中…" : removing ? "删除空目录" : "保存"}</Button></div>
    </form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
