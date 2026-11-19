"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, FileText, Flag, GitBranch, Layers3, ListTree, Plus, Search, Sparkles } from "lucide-react";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  buildMilestoneTaskGraph, dependencyLayers, filterMilestoneTree, milestonePlanningUrl, summarizeTaskBranch,
  MILESTONE_KIND_LABELS, MILESTONE_STATUS_LABELS, UNGROUPED_MILESTONE,
  type MilestoneSummary, type MilestoneTask, type MilestoneTaskNode, type TaskDependencyEdge,
} from "./client";

import { MilestoneAddCard, MilestoneCreationDialog, type MilestoneCreation } from "./creation-ui";

function taskHref(task: MilestoneTask) { return `/p/${task.projectId}/tasks/${task.id}`; }

function TaskMeta({ task }: { task: MilestoneTask }) {
  return <p className="text-xs leading-5 text-muted-foreground"><span>{task.assigneeName ?? "未指派"}</span><span className="mx-1.5">·</span>{task.dueDate ? <time dateTime={task.dueDate}>截止 {task.dueDate}</time> : "未设截止日期"}</p>;
}

function AcceptanceProgress({ label, accepted, total }: { label: string; accepted: number; total: number }) {
  return <progress aria-label={label} value={accepted} max={total || 1} className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-brand [&::-moz-progress-bar]:bg-brand" />;
}

export function MilestoneModuleCard({ node, fullNode = node, query, taskById, onCreateTask }: { node: MilestoneTaskNode; fullNode?: MilestoneTaskNode; query: string; taskById: Map<string, MilestoneTask>; onCreateTask?: (creation: MilestoneCreation) => void }) {
  const [expanded, setExpanded] = useState(Boolean(query.trim()));
  const { task } = node;
  const canAdd = Boolean(onCreateTask) && !task.parentTaskId && !["submitted", "accepted"].includes(task.status);
  const summary = summarizeTaskBranch(fullNode);
  const prerequisites = (task.blockedByIds ?? []).flatMap((id) => taskById.get(id) ?? []);
  return <article className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="mb-1 text-xs font-medium text-muted-foreground">{node.externalParent ? "跨阶段子任务" : fullNode.children.length ? "工作模块" : "独立任务"}</p><Link href={taskHref(task)} className="break-words text-sm font-semibold hover:text-brand hover:underline">{task.title}</Link></div><StatusPill status={task.status} className="shrink-0" /></div>
      <TaskMeta task={task} />
      <div className="space-y-1.5"><div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground"><span>{summary.accepted}/{summary.total} 项已验收</span><span>{summary.percent}%{summary.submitted ? ` · ${summary.submitted} 项待验收` : ""}</span></div><AcceptanceProgress label={`${task.title}验收进度`} accepted={summary.accepted} total={summary.total} /></div>
      {node.externalParent && <p className="text-xs text-muted-foreground">所属主任务：<Link href={taskHref(node.externalParent)} className="text-brand underline">{node.externalParent.title}</Link></p>}
      {prerequisites.length > 0 && <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground"><span>{prerequisites.every((item) => item.status === "accepted") ? "先做的任务已验收：" : "需要先完成："}</span>{prerequisites.map((item) => <Link key={item.id} className="text-brand underline" href={taskHref(item)}>{item.title}</Link>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2"><Link href={taskHref(task)} className="text-xs text-brand underline">查看详情 / 管理任务</Link>{(node.children.length > 0 || canAdd) && <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-label={`${expanded ? "折叠" : "展开"}${task.title}的子任务`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{expanded ? "收起子任务" : fullNode.children.length ? `查看子任务（${fullNode.children.length}）` : "拆分子任务"}</button>}</div>
    </div>
    {expanded && (node.children.length > 0 || canAdd) && <div className="border-t border-border bg-muted/20 p-3"><ul className="ml-2 space-y-2 border-l-2 border-dashed border-brand/25 pl-3">{node.children.map((child) => <TreeNode key={child.task.id} node={child} query={query} taskById={taskById} />)}{canAdd && <li><MilestoneAddCard title="新增子任务" description="拆分一项可验收的工作" onClick={() => onCreateTask?.({ kind: "task", parentTaskId: task.id, milestoneId: task.milestoneId ?? undefined, context: task.title })} /></li>}</ul></div>}
  </article>;
}

export function MilestoneProcess({ projectId, groups, fullGroups = groups, query, taskById, selectedId, onSelect, onCreateMilestone, onCreateTask }: {
  projectId: string;
  groups: ReturnType<typeof buildMilestoneTaskGraph>["groups"];
  fullGroups?: ReturnType<typeof buildMilestoneTaskGraph>["groups"];
  query: string;
  taskById: Map<string, MilestoneTask>;
  selectedId: string;
  onSelect: (id: string) => void;
  onCreateMilestone?: () => void;
  onCreateTask?: (creation: MilestoneCreation) => void;
}) {
  const selected = groups.find((group) => group.id === selectedId);
  const displayed = query.trim() ? groups : selected ? [selected] : [];
  return <div className="space-y-5">
    <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">阶段进程</h2><span className="text-xs text-muted-foreground">按目标日期排列 · 点击阶段查看模块</span></div><ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{groups.map((group) => { const fullGroup = fullGroups.find((item) => item.id === group.id) ?? group; return <li key={group.id} className="relative min-w-0"><button type="button" aria-pressed={selectedId === group.id} onClick={() => onSelect(selectedId === group.id ? "all" : group.id)} className={`h-full w-full rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === group.id ? "border-brand ring-1 ring-brand/20" : "border-border hover:border-brand/50"}`}><div className="mb-3 flex items-start gap-2"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{group.milestone ? fullGroups.findIndex((item) => item.id === group.id) + 1 : <Layers3 className="h-3.5 w-3.5" />}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{group.milestone?.title ?? "未关联里程碑"}</p><p className="mt-1 text-xs text-muted-foreground">{group.milestone?.targetDate ? `目标 ${group.milestone.targetDate}` : "未设目标日期"}</p></div>{group.milestone && <Badge variant={group.milestone.status === "done" ? "success" : "secondary"}>{MILESTONE_STATUS_LABELS[group.milestone.status]}</Badge>}</div><div className="mb-1.5 flex flex-wrap justify-between gap-1 text-xs text-muted-foreground"><span>{fullGroup.roots.filter((node) => node.children.length > 0).length} 个模块 · {fullGroup.roots.filter((node) => node.children.length === 0).length} 项任务</span><span>{group.accepted}/{group.total} 项已验收</span></div><AcceptanceProgress label={`${group.milestone?.title ?? "未关联里程碑"}任务验收进度`} accepted={group.accepted} total={group.total} /><p className="mt-2 truncate text-xs text-muted-foreground">{query.trim() ? "搜索命中：" : ""}{group.roots.slice(0, 3).map((node) => node.task.title).join(" / ") || "尚未拆分任务"}{group.roots.length > 3 ? ` 等 ${group.roots.length} 项工作` : ""}</p></button></li>; })}{onCreateMilestone && <li><MilestoneAddCard title="新建里程碑" description="添加下一个阶段" onClick={onCreateMilestone} /></li>}</ol></div>
    {!displayed.length && groups.length > 0 && <p className="text-center text-sm text-muted-foreground">选择一个阶段，查看模块进展与下辖任务。</p>}
    {displayed.map((group) => {
      const fullGroup = fullGroups.find((item) => item.id === group.id) ?? group;
      return <section key={`${group.id}-${query}`} aria-label={`${group.milestone?.title ?? "未关联里程碑"}模块进程`} className="min-w-0 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{group.milestone?.title ?? "未关联里程碑"}<span className="ml-2 text-sm font-normal text-muted-foreground">模块与任务</span></h2>{group.milestone?.description && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">阶段说明</summary><p className="mt-2 whitespace-pre-wrap leading-5">{group.milestone.description}</p></details>}</div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={`/p/${projectId}/tasks`}>任务管理</Link></Button><Button asChild size="sm"><Link href={milestonePlanningUrl(projectId, group.id === UNGROUPED_MILESTONE ? undefined : group.id)}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />AI 拆分任务</Link></Button></div></div>{group.roots.length ? <><p className="text-xs text-muted-foreground">有子任务的主任务作为模块展示；展开查看子任务。连线表示拆分层级，执行先后可切换到“先后顺序”。</p><div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">{group.roots.map((node) => <MilestoneModuleCard key={`${node.task.id}-${query}`} node={node} fullNode={fullGroup.roots.find((item) => item.task.id === node.task.id)} query={query} taskById={taskById} onCreateTask={onCreateTask} />)}{onCreateTask && <MilestoneAddCard title="新建模块 / 任务" description="为此阶段添加工作" onClick={() => onCreateTask({ kind: "task", milestoneId: group.milestone?.id, context: group.milestone?.title ?? "未关联里程碑" })} />}</div></> : <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">此阶段尚未关联任务。{onCreateTask ? <div className="mt-3"><MilestoneAddCard title="新建模块 / 任务" description="为此阶段添加第一项工作" onClick={() => onCreateTask({ kind: "task", milestoneId: group.milestone?.id, context: group.milestone?.title ?? "未关联里程碑" })} /></div> : "可用 AI 拆分后确认创建，或到任务详情选择此里程碑。"}</div>}</section>;
    })}
  </div>;
}

function TreeNode({ node, query, taskById }: { node: MilestoneTaskNode; query: string; taskById: Map<string, MilestoneTask> }) {
  const [expanded, setExpanded] = useState(Boolean(query.trim()));
  const open = expanded;
  const { task } = node;
  const prerequisites = (task.blockedByIds ?? []).flatMap((id) => taskById.get(id) ?? []);
  return <li className="min-w-0">
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        {node.children.length ? <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={open} aria-label={`${open ? "折叠" : "展开"}${task.title}的子任务`} className="mt-0.5 rounded p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> : <FileText className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0 flex-1 space-y-1.5"><div className="flex flex-wrap items-start justify-between gap-2"><Link href={taskHref(task)} className="min-w-0 break-words font-medium text-sm hover:text-brand hover:underline">{task.title}</Link><StatusPill status={task.status} /></div><TaskMeta task={task} />
          {node.externalParent && <p className="text-xs text-muted-foreground">跨里程碑父任务：<Link href={taskHref(node.externalParent)} className="text-brand underline">{node.externalParent.title}</Link></p>}
          {prerequisites.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{prerequisites.every((item) => item.status === "accepted") ? "先做的任务已验收：" : "需要先完成："}</span>{prerequisites.map((item) => <Link key={item.id} href={taskHref(item)} className="rounded border border-border px-1.5 py-0.5 hover:text-brand">{item.title}{item.milestoneId !== task.milestoneId ? "（跨里程碑）" : ""}</Link>)}{task.blocked && <Badge variant="warning">等待其他任务验收</Badge>}</div>}
        </div>
      </div>
    </div>
    {node.children.length > 0 && open && <ul className="ml-3 mt-2 space-y-2 border-l-2 border-dashed border-brand/25 pl-3 sm:ml-6 sm:pl-5">{node.children.map((child) => <TreeNode key={child.task.id} node={child} query={query} taskById={taskById} />)}</ul>}
  </li>;
}


export function MilestoneTaskGroup({ projectId, group, query, taskById, selected = false }: {
  projectId: string;
  group: ReturnType<typeof buildMilestoneTaskGraph>["groups"][number];
  query: string;
  taskById: Map<string, MilestoneTask>;
  selected?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(query.trim()) || selected);
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="rounded-xl border border-border bg-card"><summary className="cursor-pointer p-4"><span className="inline-flex flex-wrap items-center gap-2"><Flag className="h-4 w-4 text-brand" aria-hidden="true" /><span className="font-semibold">{group.milestone?.title ?? "未关联里程碑"}</span>{group.milestone && <><Badge variant="secondary">{MILESTONE_KIND_LABELS[group.milestone.kind]}</Badge><Badge variant="outline">{MILESTONE_STATUS_LABELS[group.milestone.status]}</Badge></>}<span className="text-xs text-muted-foreground">{group.accepted}/{group.total} 项已验收{group.milestone?.targetDate ? ` · 目标 ${group.milestone.targetDate}` : ""}</span></span></summary><div className="space-y-3 border-t border-border p-3 sm:p-4">{group.milestone?.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{group.milestone.description}</p>}<div className="flex items-center gap-3"><progress aria-label={`${group.milestone?.title ?? "未关联里程碑"}任务验收进度`} value={group.accepted} max={group.total || 1} className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-brand [&::-moz-progress-bar]:bg-brand" /><Button asChild variant="ghost" size="sm"><Link href={milestonePlanningUrl(projectId, group.id === UNGROUPED_MILESTONE ? undefined : group.id)}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />AI 规划任务</Link></Button></div>{group.roots.length ? <ul className="space-y-2">{group.roots.map((node) => <TreeNode key={node.task.id} node={node} query={query} taskById={taskById} />)}</ul> : <p className="p-3 text-sm text-muted-foreground">尚未关联任务。可在任务详情中选择此里程碑。</p>}</div></details>;
}

function DependencyDiagram({ tasks, edges, highlighted, milestoneNames }: { tasks: MilestoneTask[]; edges: TaskDependencyEdge[]; highlighted: Set<string>; milestoneNames: Map<string, string> }) {
  const markerId = useId().replace(/:/g, "");
  const { layers, unresolved } = dependencyLayers(tasks, edges);
  const positions = new Map(layers.flatMap((layer, column) => layer.map((task, row) => [task.id, { x: column * 320 + 16, y: row * 172 + 56 }] as const)));
  const width = Math.max(1, layers.length) * 320;
  const height = Math.max(1, ...layers.map((layer) => layer.length)) * 172 + 56;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return <div className="space-y-3">
    <p className="text-xs leading-5 text-muted-foreground">箭头表示先完成左边任务，再提交或验收右边任务。当前任务仍可执行；提交、重交和验收需等先做的任务验收通过。同列任务没有先后顺序；灰色虚线表示先做的任务已验收。</p>
    {unresolved.length > 0 && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><p>部分任务被排成互相等待的顺序，无法展示。请打开任务详情调整先后顺序；以下任务及其关联仍保留在清单中。</p><ul className="mt-2 space-y-1">{unresolved.map((task) => <li key={task.id}><Link className="text-brand underline" href={taskHref(task)}>{task.title}</Link></li>)}</ul></div>}
    <div role="region" aria-label="任务先后顺序图，可横向及纵向滚动" tabIndex={0} className="max-h-[640px] overflow-auto rounded-xl border border-border bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative" style={{ width, height }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={width} height={height}><defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="currentColor" /></marker></defs>{edges.map((edge) => {
          const from = positions.get(edge.from), to = positions.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + 260, y1 = from.y + 64, x2 = to.x - 4, y2 = to.y + 64;
          return <path key={`${edge.from}-${edge.to}`} d={`M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={edge.fulfilled ? "5 4" : undefined} markerEnd={`url(#${markerId})`} className={edge.fulfilled ? "text-muted-foreground/50" : "text-brand/70"} />;
        })}</svg>
        {layers.map((layer, column) => <div key={column} className="absolute top-4 text-xs font-semibold text-muted-foreground" style={{ left: column * 320 + 16 }}>{column === 0 ? "图内可先进行" : `接续顺序 ${column + 1}`}</div>)}
        {tasks.map((task) => {
          const position = positions.get(task.id);
          if (!position) return null;
          return <Link key={task.id} href={taskHref(task)} style={{ left: position.x, top: position.y, width: 260, height: 140 }} className={`absolute flex flex-col justify-between rounded-xl border bg-card p-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-brand ${highlighted.has(task.id) ? "border-brand/35" : "border-border"}`}><div className="flex items-center justify-between gap-2"><StatusPill status={task.status} />{!highlighted.has(task.id) && <span className="text-[10px] text-muted-foreground">关联任务</span>}</div><p className="line-clamp-2 text-sm font-medium leading-5" title={task.title}>{task.title}</p><div><p className="truncate text-[11px] text-muted-foreground">{milestoneNames.get(task.milestoneId ?? "") ?? "未关联里程碑"}</p><TaskMeta task={task} /></div></Link>;
        })}
      </div>
    </div>
    <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">查看任务先后清单（{edges.length} 条关联）</summary>{edges.length ? <ul className="mt-3 space-y-3 text-sm">{edges.map((edge) => <li key={`${edge.from}-${edge.to}`} className="flex flex-wrap items-center gap-2"><Link className="text-brand underline" href={taskHref(taskById.get(edge.from)!)}>{taskById.get(edge.from)!.title}</Link><ArrowRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only">验收通过后，可提交或验收</span><Link className="text-brand underline" href={taskHref(taskById.get(edge.to)!)}>{taskById.get(edge.to)!.title}</Link><Badge variant={edge.fulfilled ? "success" : "warning"}>{edge.fulfilled ? "先做的任务已验收" : "等待其他任务验收"}</Badge>{edge.crossMilestone && <Badge variant="outline">跨里程碑</Badge>}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">这些任务尚未设置先后顺序，可以分别推进。</p>}</details>
  </div>;
}

export function MilestoneWorkspace({ projectId, milestones, tasks, canCreateTasks = false, canCreateMilestones = false }: { projectId: string; milestones: MilestoneSummary[]; tasks: MilestoneTask[]; canCreateTasks?: boolean; canCreateMilestones?: boolean }) {
  const [creation, setCreation] = useState<MilestoneCreation | null>(null);
  const [view, setView] = useState<"process" | "tree" | "dependencies">("process");
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("all");
  const graph = useMemo(() => buildMilestoneTaskGraph(projectId, milestones, tasks), [projectId, milestones, tasks]);
  const taskById = new Map(graph.tasks.map((task) => [task.id, task]));
  const milestoneNames = new Map(graph.groups.map((group) => [group.id, group.milestone?.title ?? "未关联里程碑"]));
  const processGroups = graph.groups.map((group) => ({ ...group, roots: filterMilestoneTree(group.roots, query) })).filter((group) => !query.trim() || group.roots.length);
  const groups = processGroups.filter((group) => groupId === "all" || group.id === groupId);
  const visibleIds = new Set<string>();
  const collect = (nodes: MilestoneTaskNode[]) => nodes.forEach((node) => { visibleIds.add(node.task.id); collect(node.children); });
  (view === "process" ? processGroups : groups).forEach((group) => collect(group.roots));
  const diagramIds = new Set(visibleIds);
  for (const edge of graph.edges) if (visibleIds.has(edge.from) || visibleIds.has(edge.to)) { diagramIds.add(edge.from); diagramIds.add(edge.to); }
  const diagramTasks = graph.tasks.filter((task) => diagramIds.has(task.id));
  const diagramEdges = graph.edges.filter((edge) => diagramIds.has(edge.from) && diagramIds.has(edge.to));
  const accepted = graph.tasks.filter((task) => task.status === "accepted").length;
  return <section className="min-w-0 space-y-4" aria-label="里程碑任务可视化">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-center gap-4 text-sm"><span><strong className="text-lg">{graph.groups.filter((group) => group.milestone).length}</strong> 个里程碑</span><span><strong className="text-lg">{graph.tasks.length}</strong> 项任务</span><span><strong className="text-lg">{accepted}</strong> 项已验收</span></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{graph.edges.length} 条先后关系</Badge>{canCreateMilestones && <Button variant="outline" size="sm" onClick={() => setCreation({ kind: "milestone" })}><Plus className="h-4 w-4" aria-hidden="true" />新建里程碑</Button>}</div></div>
    <div className="flex flex-wrap gap-3"><div className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border p-1" aria-label="任务可视化方式"><Button variant={view === "process" ? "secondary" : "ghost"} aria-pressed={view === "process"} onClick={() => setView("process")}><Layers3 className="h-4 w-4" aria-hidden="true" />阶段进程</Button><Button variant={view === "tree" ? "secondary" : "ghost"} aria-pressed={view === "tree"} onClick={() => setView("tree")}><ListTree className="h-4 w-4" aria-hidden="true" />任务树</Button><Button variant={view === "dependencies" ? "secondary" : "ghost"} aria-pressed={view === "dependencies"} onClick={() => setView("dependencies")}><GitBranch className="h-4 w-4" aria-hidden="true" />先后顺序</Button></div><div className="relative min-w-40 flex-1 self-center"><Label htmlFor="milestone-task-search" className="sr-only">搜索任务或负责人</Label><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input id="milestone-task-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务或负责人" className="pl-9" /></div><div className="w-full self-center sm:w-52"><Label htmlFor="milestone-filter" className="sr-only">筛选里程碑</Label><Select id="milestone-filter" value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="all">全部里程碑</option>{graph.groups.map((group) => <option key={group.id} value={group.id}>{group.milestone?.title ?? "未关联里程碑"}</option>)}</Select></div></div>
    <p className="text-xs text-muted-foreground">{view === "process" ? "按阶段查看工作模块与下辖任务；阶段日期不代表任务执行先后。" : view === "tree" ? "缩进连线表示任务拆分；执行先后请切换“先后顺序”。点击任务名称查看详情。" : "箭头表示已设置的先后顺序，也显示与筛选结果直接相连的任务。"}</p>
    {graph.tasks.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">项目还没有任务。可先用 AI 规划任务，预览后发布并关联里程碑。</p>}
    {query.trim() && !visibleIds.size && <p role="status" className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">没有找到匹配的任务或负责人。<button className="ml-2 text-brand underline" onClick={() => setQuery("")}>清除搜索</button></p>}
    {view === "dependencies" && !query.trim() && !diagramTasks.length && graph.tasks.length > 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">当前里程碑尚未关联任务，可切换到其他里程碑查看。</p>}
    {view === "process" ? <MilestoneProcess projectId={projectId} groups={processGroups} fullGroups={graph.groups} query={query} taskById={taskById} selectedId={groupId} onSelect={setGroupId} onCreateMilestone={canCreateMilestones ? () => setCreation({ kind: "milestone" }) : undefined} onCreateTask={canCreateTasks ? setCreation : undefined} /> : view === "tree" ? <div className="space-y-4">{groups.map((group) => <MilestoneTaskGroup key={`${group.id}-${query}-${groupId}`} projectId={projectId} group={group} query={query} taskById={taskById} selected={groupId === group.id} />)}</div> : diagramTasks.length > 0 && <DependencyDiagram tasks={diagramTasks} edges={diagramEdges} highlighted={visibleIds} milestoneNames={milestoneNames} />}
    {creation && <MilestoneCreationDialog projectId={projectId} creation={creation} onClose={() => setCreation(null)} />}
  </section>;
}
