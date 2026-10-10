"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock3, FileText, History, RotateCcw, XCircle } from "lucide-react";
import type { TeamRole } from "@/db/schema";
import type { TaskDTO } from "@/modules/tasks";
import { TaskDrawer } from "@/components/cards/task-drawer";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { FormFeedback } from "@/components/ui/feedback";
import type { SubmissionDTO, TaskDeliveryDTO } from "@/modules/tasks/client";
import { parseTaskDeliveryPayload, sortSubmissionVersions } from "./client";

export function ReviewTaskDetails({ task, role, actorId }: {
  task: TaskDTO;
  role: TeamRole;
  actorId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" aria-label={`查看详情与修改历史：${task.title}`} onClick={() => setOpen(true)}>
        详情与修改历史
      </Button>
      <TaskDrawer task={task} role={role} actorId={actorId} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

function timestampLabel(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function reviewLabel(submission: SubmissionDTO) {
  if (!submission.review) return "尚无评审记录";
  return submission.review.action === "accept" ? "验收通过" : "要求修改";
}

export function SubmissionTimeline({ taskId, updatedAt, compact = false }: {
  taskId: string;
  updatedAt?: string;
  compact?: boolean;
}) {
  const id = useId();
  const [retry, setRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; data?: TaskDeliveryDTO; error?: string } | null>(null);
  const [selection, setSelection] = useState<{ taskId: string; submissionId: string } | null>(null);
  const requestKey = `${taskId}:${updatedAt ?? ""}:${retry}`;
  const current = snapshot?.key === requestKey ? snapshot : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}/delivery`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 || response.status === 404 ? "此任务的提交记录暂不可用，请返回当前可访问的任务。" : "提交记录暂时无法加载，请重试。");
        const input: unknown = await response.json();
        const data = parseTaskDeliveryPayload(input, taskId);
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, data });
      } catch (error) {
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, error: error instanceof Error && error.message.startsWith("此任务") ? error.message : "提交记录暂时无法加载，请重试。" });
      }
    }
    void load();
    return () => controller.abort();
  }, [taskId, requestKey]);

  const versions = sortSubmissionVersions(current?.data?.submissions ?? []);
  const selected = versions.find((submission) => selection?.taskId === taskId && selection.submissionId === submission.id) ?? versions[0];
  const latest = selected && selected.id === versions[0]?.id;

  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="flex items-center gap-2 text-sm font-semibold"><History aria-hidden="true" className="h-4 w-4 text-brand" />提交与验收记录</h2>
        {current?.data && <span className="text-xs text-muted-foreground">{versions.length} 份记录</span>}
      </header>
      {!current ? (
        <div role="status" className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 aria-hidden="true" className="h-4 w-4" />正在读取真实提交记录…</p>
          <div aria-hidden="true" className="mt-3 space-y-2 motion-safe:animate-pulse"><div className="h-3 w-2/3 rounded bg-muted" /><div className="h-3 w-1/2 rounded bg-muted" /></div>
        </div>
      ) : current.error ? (
        <div className="space-y-3"><FormFeedback message={current.error} /><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />重新加载提交记录</Button></div>
      ) : !selected ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm">
          <p className="font-medium">暂无提交版本</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">完成说明、验证结果和成果证据提交后，会在这里保留每次交付与评审。</p>
          {Boolean(current.data?.requirements.criteria.length) && <div className="mt-4 border-t border-border pt-3"><h3 className="text-xs font-medium">当前验收要求</h3><ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">{current.data?.requirements.criteria.map((criterion) => <li key={criterion.id} className="break-words">{criterion.text}</li>)}</ol></div>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
            <Label htmlFor={`${id}-version`} className="text-xs text-muted-foreground">查看提交版本</Label>
            <Select id={`${id}-version`} value={selected.id} onChange={(event) => setSelection({ taskId, submissionId: event.target.value })}>
              {versions.map((submission) => <option key={submission.id} value={submission.id}>{submission.source === "legacy" ? "历史提交" : `v${submission.version}`} · {reviewLabel(submission)}{submission.id === versions[0].id ? " · 最新" : ""}</option>)}
            </Select>
          </div>
          <article key={selected.id} className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-3 motion-safe:transition-colors sm:p-4">
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
              <div className="min-w-0"><h3 className="text-sm font-semibold">{selected.source === "legacy" ? "历史提交" : `提交 v${selected.version}`}{latest ? " · 最新记录" : ""}</h3><p className="mt-1 break-words text-xs text-muted-foreground">{selected.submittedByName || "原提交人"} · <time dateTime={selected.submittedAt}>{timestampLabel(selected.submittedAt)}</time></p></div>
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${selected.review?.action === "reject" ? "bg-destructive/10 text-destructive" : selected.review?.action === "accept" ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground"}`}>{reviewLabel(selected)}</span>
            </header>
            {selected.source === "legacy" && <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">历史提交沿用原有完成说明与评审意见，结构化验证和成果证据尚未记录。</p>}
            <div><h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">完成说明</h4><p className={`${compact ? "max-h-40 overflow-y-auto" : ""} whitespace-pre-wrap break-words text-sm leading-6`}>{selected.summary || "该次记录未保留完成说明。"}</p></div>
            <div><h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">验证结果</h4><p className="whitespace-pre-wrap break-words text-sm leading-6">{selected.verification || "该次历史提交未记录验证结果。"}</p></div>
            <div className="space-y-2"><h4 className="text-xs font-semibold text-muted-foreground">成果证据</h4>
              {selected.links.length === 0 && selected.resources.length === 0 ? <p className="text-sm text-muted-foreground">该次历史提交没有成果链接或文件记录。</p> : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {selected.links.map((link, index) => <li key={`${link.url}-${index}`} className="px-3 py-2"><a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-sm text-brand hover:underline"><ArrowUpRight aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0" /><span className="min-w-0"><span className="block break-words font-medium">{link.title || link.url}</span><span className="mt-0.5 block break-all text-xs text-muted-foreground">{link.url}</span></span></a></li>)}
                  {selected.resources.map((resource) => <li key={resource.id} className="px-3 py-2"><a href={`/api/v1/resources/${resource.id}/file`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-sm text-brand hover:underline"><FileText aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0" /><span className="min-w-0"><span className="block break-words font-medium">{resource.title || resource.fileName || "成果文件"}</span><span className="mt-0.5 block break-words text-xs text-muted-foreground">{resource.fileName || "原文件"} · {resource.size < 1024 ? `${resource.size} 字节` : `${(resource.size / 1024).toFixed(1)} KB`} · 打开文件</span></span></a></li>)}
                </ul>
              )}
              {selected.links.length > 0 && <p className="text-xs text-muted-foreground">链接为提交人提供的成果地址，验证结果由提交人与评审者说明。</p>}
            </div>
            <div className="space-y-2"><h4 className="text-xs font-semibold text-muted-foreground">提交时的验收要求</h4>
              {selected.criteria.length === 0 ? <p className="text-sm text-muted-foreground">该次提交未设逐项验收要求。</p> : <ol className="divide-y divide-border rounded-lg border border-border">{selected.criteria.map((criterion, index) => {
                const check = selected.review?.checks.find((item) => item.criterionId === criterion.id);
                const Icon = check?.passed ? CheckCircle2 : check ? XCircle : Clock3;
                return <li key={criterion.id} className="space-y-2 p-3"><p className="break-words text-sm font-medium">{index + 1}. {criterion.text}</p><div className="grid gap-2 text-xs sm:grid-cols-2"><div className="min-w-0"><p className={criterion.met ? "text-brand" : "text-destructive"}>提交者：{criterion.met ? "已满足" : "未满足"}</p>{criterion.note && <p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{criterion.note}</p>}</div><div className="min-w-0"><p className={`flex items-center gap-1.5 ${check?.passed ? "text-brand" : check ? "text-destructive" : "text-muted-foreground"}`}><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />评审：{check ? check.passed ? "通过" : "需修改" : selected.review ? "未记录逐项意见" : "尚未评审"}</p>{check?.note && <p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{check.note}</p>}</div></div></li>;
              })}</ol>}
            </div>
            {selected.review && <div className={`rounded-lg border p-3 ${selected.review.action === "reject" ? "border-destructive/20 bg-destructive/5" : "border-brand/20 bg-brand-soft/40"}`}><h4 className="text-sm font-medium">{selected.review.action === "accept" ? "验收结论" : "修改要求"}</h4><p className="mt-1 text-xs text-muted-foreground">{selected.review.reviewerName || "原评审人"} · <time dateTime={selected.review.reviewedAt}>{timestampLabel(selected.review.reviewedAt)}</time></p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selected.review.summary || "该次评审未附总体说明。"}</p></div>}
          </article>
        </div>
      )}
    </section>
  );
}

export function ReviewSubmissionEvidence({ taskId, updatedAt }: { taskId: string; updatedAt?: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details className="rounded-lg border border-border p-3" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-brand">查看提交版本、成果证据与逐项评审</summary>
      {expanded && <div className="mt-4 border-t border-border pt-4"><SubmissionTimeline taskId={taskId} updatedAt={updatedAt} compact /></div>}
    </details>
  );
}
