import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardCheck,
  FileCheck2,
  FolderOpen,
  ListTodo,
  MessagesSquare,
  PackageCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProjectJourney({
  projectId,
  actorId,
  canReview,
  canExecute,
}: {
  projectId: string;
  actorId: string;
  canReview: boolean;
  canExecute: boolean;
}) {
  const base = `/p/${projectId}`;
  const mine = `&assigneeId=${actorId}`;
  const steps = [
    {
      title: "资料与目标",
      icon: FolderOpen,
      href: `${base}/resources`,
      action: "整理项目资料",
    },
    {
      title: "任务分工",
      icon: ListTodo,
      href: `${base}/tasks`,
      action: "拆分与认领任务",
    },
    {
      title: "讨论与执行",
      icon: MessagesSquare,
      href: `${base}/board`,
      action: "进入执行看板",
    },
    {
      title: "成果提交",
      icon: FileCheck2,
      href: canExecute
        ? `${base}/table?status=in_progress&status=rejected${mine}`
        : `${base}/table?status=submitted`,
      action: canExecute ? "查看我的待提交任务" : "查看已提交成果",
    },
    {
      title: "成果验收",
      icon: ClipboardCheck,
      href: canReview ? `${base}/review` : `${base}/table?status=submitted`,
      action: canReview ? "进入成果验收" : "查看待验收任务",
    },
    {
      title: "阶段交付",
      icon: PackageCheck,
      href: `${base}/delivery`,
      action: "整理与查看阶段交付",
    },
  ];
  return (
    <section aria-labelledby="project-journey-title" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-brand">项目协作路径</p>
          <h2 id="project-journey-title" className="mt-2 text-lg font-semibold">从共同目标到可验收的成果</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">适用于课题研究、课程作业、竞赛方案与软件研发。资料提供共同依据，任务推进工作，指定成果版本用于验收和阶段交付。</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`${base}/resources`}><FolderOpen className="h-4 w-4" />项目资料库</Link>
        </Button>
      </div>
      <ol className="grid gap-0 divide-y divide-border sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex min-w-0 flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{index + 1}</span>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <step.icon aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-brand/70" />
            </div>
            <Link href={step.href} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              {step.action}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TeamProjectGuide({ teamId }: { teamId: string }) {
  const items = [
    { title: "明确成员与职务", detail: "管理员设置职务，执行与验收各有负责人。", href: `/t/${teamId}/members`, icon: Users },
    { title: "整理团队共用资料", detail: "公告、规范与共用参考资料在团队内共享。", href: `/t/${teamId}/resources`, icon: FolderOpen },
    { title: "选择项目开始协作", detail: "进入项目概览，按目标、任务、成果和验收推进。", href: "#team-project-list", icon: ListTodo },
  ];
  return (
    <section aria-label="团队项目协作说明" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3 sm:p-5">
      {items.map((item, index) => (
        <div key={item.title} className="min-w-0">
          <Link href={item.href} className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />{index + 1}. {item.title}
          </Link>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
        </div>
      ))}
    </section>
  );
}
