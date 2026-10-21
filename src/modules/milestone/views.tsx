import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { GuideIcon } from "@/components/icons";
import { requireUser, getProjectForUser } from "@/modules/core";
import { listProjectTasks } from "@/modules/tasks";
import { Button } from "@/components/ui/button";
import { listMilestones } from "./index";
import { MilestoneWorkspace } from "./ui";
import { milestonePlanningUrl } from "./client";

export async function MilestonesView({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const [milestones, tasks] = await Promise.all([listMilestones(user.id, projectId), listProjectTasks(user.id, projectId)]);
  return <main className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-display text-2xl font-semibold">里程碑进程</h1><p className="mt-1 text-sm text-muted-foreground">选择阶段，查看模块进展与任务。</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/guide#tasks"><GuideIcon className="h-4 w-4" aria-hidden="true" />图例指引</Link></Button><Button asChild><Link href={milestonePlanningUrl(projectId)}><Sparkles className="h-4 w-4" aria-hidden="true" />AI 规划任务</Link></Button></div>
    </header>
    <MilestoneWorkspace projectId={projectId} milestones={milestones} tasks={tasks} canCreateTasks={access.capabilities.task.actions.includes("create")} canCreateMilestones={access.role !== "student"} />
  </main>;
}
