"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormFeedback } from "@/components/ui/feedback";
import { ResourcePicker } from "@/modules/resources/ui";
import { loadTaskDeliveryAction } from "./actions";
import type { TaskDTO } from "./service";
import type { DeliveryInput, ReviewInput, TaskDeliveryDTO } from "./delivery-types";

type CheckAnswer = { value?: boolean; note: string };
type LinkField = { key: string; title: string; url: string };

export function StructuredTransitionFields({ task, action, disabled, onReadyChange, onDirtyChange, onBusyChange }: {
  task: TaskDTO;
  action: "submit" | "resubmit" | "accept" | "reject";
  disabled: boolean;
  onReadyChange: (ready: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const submitting = action === "submit" || action === "resubmit";
  const [data, setData] = useState<TaskDeliveryDTO | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [summary, setSummary] = useState("");
  const [verification, setVerification] = useState("");
  const [links, setLinks] = useState<LinkField[]>([]);
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<string, CheckAnswer>>({});
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const versionKey = useRef("");
  const [versionNotice, setVersionNotice] = useState("");
  useEffect(() => { onBusyChange(uploading); return () => onBusyChange(false); }, [uploading, onBusyChange]);
  useEffect(() => {
    let active = true;
    void loadTaskDeliveryAction(task.id).then((result) => {
      if (!active) return;
      if (result.delivery) {
        const nextKey = submitting ? `requirements:${result.delivery.requirements.version}` : result.delivery.submissions[0]?.id ?? "none";
        if (versionKey.current && versionKey.current !== nextKey) {
          setChecks({}); setLegacyConfirmed(false);
          setVersionNotice("版本已变化，完成说明和证据仍保留，请重新逐项核对当前要求。");
        }
        versionKey.current = nextKey; setData(result.delivery);
      }
      else setLoadError(result.error || "无法加载验收要求与提交版本");
    }).catch(() => { if (active) setLoadError("无法加载验收要求与提交版本，请重试"); });
    return () => { active = false; };
  }, [task.id, retry, submitting]);

  const submission = data?.submissions[0];
  const criteria = submitting ? data?.requirements.criteria : submission?.criteria;
  const allAnswered = Boolean(criteria?.every((criterion) => typeof checks[criterion.id]?.value === "boolean"));
  const allPassed = Boolean(criteria?.every((criterion) => checks[criterion.id]?.value === true));
  const rejectionReady = submission?.source === "legacy" || Boolean(
    criteria?.some((criterion) => checks[criterion.id]?.value === false) &&
    criteria.every((criterion) => checks[criterion.id]?.value !== false || checks[criterion.id]?.note.trim()),
  );
  const evidenceLinks = links.filter((link) => link.title.trim() || link.url.trim()).map(({ title, url }) => ({ title, url }));
  const ready = Boolean(data && !loadError && !uploading && summary.trim() && allAnswered && (
    submitting
      ? criteria?.length && verification.trim() && evidenceLinks.length + resourceIds.length > 0
      : submission && !submission.review && (submission.source !== "legacy" || legacyConfirmed) && (action === "accept" ? allPassed : rejectionReady)
  ));
  useEffect(() => { onReadyChange(ready); }, [ready, onReadyChange]);

  const delivery: DeliveryInput = {
    requirementsVersion: data?.requirements.version ?? 0, summary, verification, links: evidenceLinks, resourceIds,
    checks: (criteria ?? []).flatMap((criterion) => typeof checks[criterion.id]?.value === "boolean"
      ? [{ criterionId: criterion.id, met: checks[criterion.id].value!, note: checks[criterion.id].note }]
      : []),
  };
  const review: ReviewInput = {
    submissionId: submission?.id ?? "", summary,
    checks: (criteria ?? []).flatMap((criterion) => typeof checks[criterion.id]?.value === "boolean"
      ? [{ criterionId: criterion.id, passed: checks[criterion.id].value!, note: checks[criterion.id].note }]
      : []),
  };
  const textarea = "w-full rounded-lg border border-input bg-background p-3 text-sm leading-relaxed";

  function reload() { setData(null); setLoadError(""); setRetry((value) => value + 1); }

  return (
    <div className="space-y-5" onInput={() => onDirtyChange(true)}>
      <input type="hidden" name={submitting ? "delivery" : "review"} value={JSON.stringify(submitting ? delivery : review)} />
      {loadError ? <div className="space-y-2"><FormFeedback message={loadError} /><Button type="button" variant="outline" size="sm" onClick={reload} disabled={disabled}>重新加载</Button></div> : !data ? <p role="status" className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">正在加载验收要求与提交版本…</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{submitting ? `验收要求 v${data.requirements.version}` : `评审提交 v${submission?.version ?? "—"}`}</span>
            <Button type="button" variant="ghost" size="sm" onClick={reload} disabled={disabled}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />重新核对</Button>
          </div>
          {versionNotice && <p role="status" className="rounded-lg bg-brand-soft p-3 text-xs leading-5 text-brand">{versionNotice}</p>}
          {submitting && !criteria?.length && <div className="space-y-2 rounded-lg border border-border bg-muted p-3 text-sm"><p>任务尚未设置验收清单，请由有维护权限的成员先完善。</p><a href={`/p/${task.projectId}/tasks/${task.id}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">在新页面设置验收要求</a><p className="text-xs text-muted-foreground">保存要求后回到这里点击“重新核对”，当前草稿会保留。</p></div>}
          {!submitting && submission && (
            <section className="space-y-3 rounded-xl border border-border bg-muted/35 p-4">
              <h3 className="text-sm font-semibold">本次验收的成果 · v{submission.version}</h3>
              {submission.source === "legacy" && <p className="text-xs leading-relaxed text-muted-foreground">历史提交只保留原完成说明，未记录结构化验证或成果证据。</p>}
              <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{submission.summary || "历史提交未附说明"}</p>
              {submission.verification && <div className="border-t border-border pt-3"><p className="mb-1 text-xs text-muted-foreground">提交人提供的验证结果</p><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{submission.verification}</p></div>}
              <ul className="space-y-2">
                {submission.links.map((link, index) => <li key={`${link.url}:${index}`}><a href={link.url} target="_blank" rel="noreferrer noopener" className="flex items-start gap-2 text-sm text-brand hover:underline"><ExternalLink aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{link.title}</span></a></li>)}
                {submission.resources.map((resource) => <li key={resource.id}><a href={`/api/v1/resources/${resource.id}/file`} target="_blank" rel="noreferrer noopener" className="flex items-start gap-2 text-sm text-brand hover:underline"><FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{resource.title} · {resource.fileName}</span></a></li>)}
              </ul>
              {submission.source === "legacy" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={legacyConfirmed} onChange={(event) => setLegacyConfirmed(event.target.checked)} required className="mt-1" /><span>我已核对历史成果，明确按该历史版本进行评审。</span></label>}
            </section>
          )}
          {!submitting && !submission && <FormFeedback message="当前没有可评审的提交版本，请重新加载任务。" />}
          <section className="space-y-2">
            <label htmlFor={`${id}-summary`} className="text-sm font-medium">{submitting ? "完成说明" : action === "reject" ? "修改要求" : "验收结论"} <span className="text-destructive">*</span></label>
            <textarea id={`${id}-summary`} value={summary} onChange={(event) => setSummary(event.target.value)} required maxLength={5000} rows={3} className={textarea} placeholder={submitting ? "说明本次完成内容和交付范围" : action === "reject" ? "指出需要修改的内容，以及重新提交时应补充的证据" : "说明核对的成果及通过依据"} />
          </section>
          {submitting && (
            <>
              <section className="space-y-2">
                <label htmlFor={`${id}-verification`} className="text-sm font-medium">验证方法与结果 <span className="text-destructive">*</span></label>
                <textarea id={`${id}-verification`} value={verification} onChange={(event) => setVerification(event.target.value)} required maxLength={10000} rows={3} className={textarea} placeholder="记录测试步骤、检查结果及尚未解决的问题" />
              </section>
              <section className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">成果链接</h3><Button type="button" variant="outline" size="sm" disabled={disabled || links.length >= 20} onClick={() => { setLinks((items) => [...items, { key: crypto.randomUUID(), title: "", url: "" }]); onDirtyChange(true); }}><Plus aria-hidden="true" className="h-3.5 w-3.5" />添加链接</Button></div>
                {links.map((link, index) => <div key={link.key} className="space-y-2 rounded-lg bg-muted/40 p-3"><div className="flex gap-2"><Input aria-label={`成果链接 ${index + 1} 标题`} placeholder="成果名称，如报告或代码地址" value={link.title} maxLength={200} required={Boolean(link.url.trim())} onChange={(event) => setLinks((items) => items.map((item) => item.key === link.key ? { ...item, title: event.target.value } : item))} /><Button type="button" variant="ghost" size="icon" aria-label={`移除成果链接 ${index + 1}`} onClick={() => { setLinks((items) => items.filter((item) => item.key !== link.key)); onDirtyChange(true); }}><Trash2 className="h-4 w-4" /></Button></div><Input aria-label={`成果链接 ${index + 1} 地址`} type="url" placeholder="https://…" value={link.url} required={Boolean(link.title.trim())} onChange={(event) => setLinks((items) => items.map((item) => item.key === link.key ? { ...item, url: event.target.value } : item))} /></div>)}
                <p className="text-xs text-muted-foreground">至少关联一个链接或下方成果文件。链接内容由验收人实际核对。</p>
              </section>
              <ResourcePicker projectId={task.projectId} selectedIds={resourceIds} onChange={(ids) => { setResourceIds(ids); onDirtyChange(true); }} disabled={disabled} onUploadingChange={setUploading} />
            </>
          )}
          {Boolean(criteria?.length) && <section className="space-y-3"><h3 className="text-sm font-semibold">{submitting ? "逐项自检" : "逐项验收"}</h3><ol className="space-y-3">{criteria!.map((criterion, index) => <li key={criterion.id} className="space-y-2 rounded-xl border border-border p-3"><p className="break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{index + 1}. {criterion.text}</p><select aria-label={`第 ${index + 1} 项${submitting ? "自检" : "验收"}结果`} required value={checks[criterion.id]?.value === undefined ? "" : checks[criterion.id].value ? "yes" : "no"} onChange={(event) => setChecks((current) => ({ ...current, [criterion.id]: { value: event.target.value === "yes", note: current[criterion.id]?.note ?? "" } }))} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="" disabled>请选择结果</option><option value="yes">{submitting ? "已达到要求" : "验收通过"}</option><option value="no">{submitting ? "尚未达到要求" : "需要修改"}</option></select><Input aria-label={`第 ${index + 1} 项补充说明`} required={action === "reject" && checks[criterion.id]?.value === false} placeholder={action === "reject" && checks[criterion.id]?.value === false ? "问题位置和通过条件（必填）" : "补充证据或问题（可选）"} value={checks[criterion.id]?.note ?? ""} maxLength={5000} onChange={(event) => setChecks((current) => ({ ...current, [criterion.id]: { value: current[criterion.id]?.value, note: event.target.value } }))} /></li>)}</ol><p className="text-xs text-muted-foreground">{submitting ? "自检结果会随本次提交保存，后续修改要求不会覆盖此快照。" : action === "reject" ? "至少标明一项需要修改的要求，并逐项填写问题位置和通过条件。" : "验收通过需要逐项确认；本次结论只对应所显示的提交版本。"}</p></section>}
        </>
      )}
    </div>
  );
}
