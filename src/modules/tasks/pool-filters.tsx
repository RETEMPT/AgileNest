import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BOARD_STATUS_ORDER, serializeFilters, type BoardFilters, type GroupBy } from "@/modules/board/client";
import { STATUS_LABELS } from "./states";

export function TaskPoolFilters({ projectId, filters, members, milestones, groupBy }: {
  projectId: string;
  filters: BoardFilters;
  members: { id: string; name: string }[];
  milestones: { id: string; title: string }[];
  groupBy: GroupBy;
}) {
  const key = serializeFilters(filters).toString();
  const hasFilters = Boolean(key);
  const selectClass = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm";
  return <form key={key} action={`/p/${projectId}/tasks`} method="get" className="space-y-3 rounded-xl border border-border bg-card p-4">
    {groupBy !== "status" && <input type="hidden" name="groupBy" value={groupBy} />}
    <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_auto]">
      <div className="space-y-1.5"><label htmlFor={`${projectId}-pool-search`} className="text-xs font-medium">搜索任务</label><Input id={`${projectId}-pool-search`} name="q" placeholder="搜索标题或目标描述" defaultValue={filters.q ?? ""} /></div>
      <div className="space-y-1.5"><label htmlFor={`${projectId}-pool-assignee`} className="text-xs font-medium">负责人</label><select id={`${projectId}-pool-assignee`} name="assigneeId" defaultValue={filters.assigneeId ?? ""} className={selectClass}><option value="">全部成员</option>{filters.assigneeId && !members.some((member) => member.id === filters.assigneeId) && <option value={filters.assigneeId}>当前负责人已不可用</option>}{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>
      <div className="space-y-1.5"><label htmlFor={`${projectId}-pool-milestone`} className="text-xs font-medium">里程碑</label><select id={`${projectId}-pool-milestone`} name="milestoneId" defaultValue={filters.milestoneId ?? ""} className={selectClass}><option value="">全部里程碑</option>{filters.milestoneId && !milestones.some((milestone) => milestone.id === filters.milestoneId) && <option value={filters.milestoneId}>当前里程碑已不可用</option>}{milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></div>
      <div className="flex gap-2"><Button type="submit">应用筛选</Button>{hasFilters && <Button asChild variant="outline"><Link href={`/p/${projectId}/tasks${groupBy !== "status" ? `?groupBy=${groupBy}` : ""}`}>重置</Link></Button>}</div>
    </div>
    <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-3">
      <fieldset className="min-w-0"><legend className="mb-2 text-xs font-medium text-muted-foreground">状态</legend><div className="flex flex-wrap gap-x-3 gap-y-2">{BOARD_STATUS_ORDER.map((status) => <label key={status} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="status" value={status} defaultChecked={filters.status?.includes(status)} />{STATUS_LABELS[status]}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-xs font-medium text-muted-foreground">优先级</legend><div className="flex flex-wrap gap-3">{[{ value: "high", label: "高" }, { value: "medium", label: "中" }, { value: "low", label: "低" }].map((priority) => <label key={priority.value} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="priority" value={priority.value} defaultChecked={filters.priority?.includes(priority.value)} />{priority.label}</label>)}</div></fieldset>
    </div>
  </form>;
}
