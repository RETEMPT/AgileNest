import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardCheck,
  FileCheck2,
  FolderOpen,
  ListTodo,
  MessagesSquare,
  Users,
} from "lucide-react";
import type { TaskStatus } from "@/db/schema";
import { Button } from "@/components/ui/button";

type TaskCounts = Record<TaskStatus, number>;

export function ProjectJourney({
  projectId,
  actorId,
  counts,
  ownCounts,
  canReview,
  canExecute,
  canAssign,
}: {
  projectId: string;
  actorId: string;
  counts: TaskCounts;
  ownCounts: TaskCounts;
  canReview: boolean;
  canExecute: boolean;
  canAssign: boolean;
}) {
  const base = `/p/${projectId}`;
  const mine = `&assigneeId=${actorId}`;
  const steps = [
    {
      title: "资料与目标",
      icon: FolderOpen,
      owner: "项目协调者与团队成员",
      description: "整理目标、需求说明和参考文件，让团队有共同依据。",
      output: "项目资料与需求文档",
      href: `${base}/resources`,
      action: "整理项目资料",
    },
    {
      title: "任务分工",
      icon: ListTodo,
      owner: "协调者安排 · 成员认领",
      description: "把目标拆成任务，明确负责人、截止时间和验收要求。",
      output: "有负责人和验收项的任务",
      href: `${base}/tasks`,
      action: "拆分与认领任务",
    },
    {
      title: "讨论与执行",
      icon: MessagesSquare,
      owner: "任务负责人及协作者",
      description: "围绕任务讨论、补充附件与答复，负责人执行并记录实际工时。",
      output: "执行进度与任务讨论",
      href: `${base}/board`,
      action: "进入执行看板",
    },
    {
      title: "成果提交",
      icon: FileCheck2,
      owner: "任务负责人",
      description: "逐项自检，填写验证结果，附上成果文件或链接再提交。",
      output: "可追溯的成果版本",
      href: canExecute
        ? `${base}/table?status=in_progress&status=rejected${mine}`
        : `${base}/table?status=submitted`,
      action: canExecute ? "查看我的待提交任务" : "查看已提交成果",
    },
    {
      title: "验收与交付",
      icon: ClipboardCheck,
      owner: "管理员或指导老师",
      description: "按指定提交版本逐项检查；通过完成交付，打回后修改重交。",
      output: "验收结论与修改意见",
      href: canReview ? `${base}/review` : `${base}/table?status=submitted`,
      action: canReview ? "进入成果验收" : "查看待验收任务",
    },
  ];
  const next = canReview && counts.submitted
    ? {
        title: `${counts.submitted} 个顶层任务等待验收`,
        description: "查看负责人提交的具体版本，逐项通过或给出修改意见。",
        href: `${base}/review`,
        action: "去验收成果",
      }
    : canExecute && ownCounts.rejected
      ? {
          title: `我的 ${ownCounts.rejected} 个顶层任务需要修改`,
          description: "先查看打回版本的逐项意见，补充成果后重新提交。",
          href: `${base}/table?status=rejected${mine}`,
          action: "查看修改意见",
        }
      : canExecute && ownCounts.in_progress
        ? {
            title: `我的 ${ownCounts.in_progress} 个顶层任务正在执行`,
            description: "在任务详情补充完成说明、验证结果与文件，按验收要求提交。",
            href: `${base}/table?status=in_progress${mine}`,
            action: "继续我的任务",
          }
        : counts.unclaimed && (canExecute || canAssign)
          ? {
              title: `${counts.unclaimed} 个顶层任务等待分工`,
              description: canAssign
                ? "为任务安排负责人，确认验收要求后开始执行。"
                : "选择可认领的任务，核对目标与验收要求后开始执行。",
              href: `${base}/tasks?status=unclaimed`,
              action: canAssign ? "安排任务分工" : "选择并认领任务",
            }
          : canExecute && ownCounts.submitted
            ? {
                title: `我的 ${ownCounts.submitted} 个顶层任务正在等待验收`,
                description: "查看已提交版本与验收结果，收到打回意见后再修改重交。",
                href: `${base}/table?status=submitted${mine}`,
                action: "查看提交进度",
              }
            : counts.accepted > 0 && counts.unclaimed + counts.in_progress + counts.submitted + counts.rejected === 0
              ? {
                  title: "当前顶层任务已全部验收",
                  description: "回看成果版本与验收记录，核对阶段交付；新增工作仍可继续拆分任务。",
                  href: `${base}/table?status=accepted`,
                  action: "查看已验收成果",
                }
              : {
                  title: "从目标与任务开始协作",
                  description: "先整理项目资料，再把目标拆成明确的任务；每个任务各自推进与验收。",
                  href: `${base}/tasks`,
                  action: "查看与拆分任务",
                };

  return (
    <section aria-labelledby="project-journey-title" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-brand">项目协作路径</p>
          <h2 id="project-journey-title" className="mt-2 text-lg font-semibold">从共同目标到可验收的成果</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">资料是协作依据，任务是执行单元，成果版本是验收依据。多个任务可以同时处于不同阶段。</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`${base}/resources`}><FolderOpen className="h-4 w-4" />项目资料库</Link>
        </Button>
      </div>
      <ol className="grid gap-0 divide-y divide-border lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="flex min-w-0 flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{index + 1}</span>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <step.icon aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-brand/70" />
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">{step.owner}</p>
            <p className="mt-2 flex-1 text-sm leading-6">{step.description}</p>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">交付物：{step.output}</p>
            <Link href={step.href} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              {step.action}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 border-t border-border bg-brand-soft/40 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-4 lg:border-r lg:border-brand/15 lg:pr-6">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">现在可以做什么</h3>
            <p className="mt-1 text-sm font-medium text-brand">{next.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{next.description}</p>
          </div>
          <Button asChild size="sm"><Link href={next.href}>{next.action}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></Button>
        </div>
        <div>
          <h3 className="text-sm font-semibold">资料、附件和提交版本如何配合？</h3>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">需求与参考材料放在资料库，讨论附件用于沟通。需要验收的成果在提交时上传或从资料库选择，并把文件、验证结果与自检记录绑定到本次版本。重交生成新版本，保留旧成果和验收意见。</p>
        </div>
      </div>
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
