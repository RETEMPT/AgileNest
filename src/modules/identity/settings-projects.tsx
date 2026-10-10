"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderKanban, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Project = { id: string; name: string; teamName: string; kind: string | null; status: string; positions: string[] };
const KINDS: Record<string, string> = { course: "课程项目", lab: "实验室课题", contest: "竞赛项目" };
export function SettingsProjects({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const filtered = projects.filter((project) => (status === "all" || project.status === status) && `${project.name} ${project.teamName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section>
    <h2 className="text-xl font-semibold">参与项目</h2>
    <p className="mt-2 text-sm text-muted-foreground">查看所在团队的项目及当前职务，团队职务决定项目操作权限。</p>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg bg-muted p-1" aria-label="项目状态筛选">{[["active", "进行中"], ["archived", "已归档"], ["all", "全部"]].map(([value, label]) => <Button key={value} variant="ghost" size="sm" aria-pressed={status === value} onClick={() => setStatus(value)} className={status === value ? "bg-card shadow-xs" : "text-muted-foreground"}>{label}</Button>)}</div>
      <div className="relative w-full sm:w-60"><Search size={15} className="absolute top-3 left-3 text-muted-foreground" /><Input aria-label="搜索参与项目" placeholder="搜索项目或团队" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div>
    </div>
    <p className="mt-5 mb-3 text-xs text-muted-foreground">{filtered.length} 个项目</p>
    <div className="divide-y divide-border rounded-xl border border-border">
      {filtered.map((project) => <article key={project.id} className="flex items-center gap-4 p-4 sm:p-5">
        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand sm:flex"><FolderKanban size={20} /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-semibold">{project.name}</h3><Badge variant="secondary">{project.kind ? KINDS[project.kind] : "项目"}</Badge>{project.status === "archived" && <Badge variant="secondary">已归档</Badge>}</div><p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{project.teamName} · {project.positions.join("、")}</p></div>
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-brand"><Link href={`/p/${project.id}/board`} aria-label={`打开项目：${project.name}`}><span className="hidden sm:inline">进入项目</span><ArrowUpRight size={16} /></Link></Button>
      </article>)}
      {filtered.length === 0 && <div className="px-5 py-12 text-center"><FolderKanban size={26} className="mx-auto mb-3 text-muted-foreground" /><p className="text-sm">{projects.length ? "没有符合条件的项目" : "尚未参与项目"}</p><p className="mt-2 text-xs text-muted-foreground">{projects.length ? "更换状态或清除搜索后查看。" : "加入团队后，可以在此查看团队项目。"}</p><div className="mt-4">{projects.length ? <Button variant="outline" size="sm" onClick={() => { setQuery(""); setStatus("all"); }}>清除筛选</Button> : <Button asChild variant="outline" size="sm"><Link href="/t">加入或创建团队</Link></Button>}</div></div>}
    </div>
  </section>;
}
