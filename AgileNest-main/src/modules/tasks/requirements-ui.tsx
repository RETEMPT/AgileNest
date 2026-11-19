"use client";

import { useActionState, useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import type { FormState } from "./actions";
import { loadTaskDeliveryAction, saveTaskRequirementsAction } from "./actions";
import type { TaskDeliveryDTO } from "./delivery-types";

type Requirements = TaskDeliveryDTO["requirements"];
type RequirementsState = (NonNullable<FormState> & { requirements?: Requirements }) | null;

export function TaskRequirementsEditor({ taskId, requirements, canEdit, taskStatus }: {
  taskId: string;
  requirements: Requirements;
  canEdit: boolean;
  taskStatus?: "unclaimed" | "in_progress" | "submitted" | "accepted" | "rejected";
}) {
  const id = useId();
  const notify = useFeedback();
  const [version, setVersion] = useState(requirements.version);
  const [criteria, setCriteria] = useState(requirements.criteria);
  const [baseline, setBaseline] = useState(JSON.stringify(requirements.criteria));
  const [latest, setLatest] = useState<Requirements | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const dirty = JSON.stringify(criteria) !== baseline;
  const [state, action, pending] = useActionState<RequirementsState, FormData>(async (previous, data) => {
    const result = await saveTaskRequirementsAction(previous, data);
    if (result?.ok && "requirements" in result && result.requirements) {
      setVersion(result.requirements.version);
      setCriteria(result.requirements.criteria);
      setBaseline(JSON.stringify(result.requirements.criteria));
      setLatest(null);
      notify(result.ok);
    }
    return result;
  }, null);

  async function loadLatest() {
    setLoading(true); setLoadError("");
    try {
      const result = await loadTaskDeliveryAction(taskId);
      if (result.delivery) setLatest(result.delivery.requirements);
      else setLoadError(result.error || "无法加载最新验收要求");
    } catch { setLoadError("无法加载最新验收要求，请重试"); }
    finally { setLoading(false); }
  }

  return <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">验收清单</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">提交人逐项自检，验收人核对同一份提交快照。</p></div><span className="text-xs tabular-nums text-muted-foreground">要求 v{version}{dirty ? " · 有未保存修改" : ""}</span></div>
    {canEdit ? <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
      <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="version" value={version} /><input type="hidden" name="criteria" value={JSON.stringify(criteria)} />
      <fieldset disabled={pending || loading} className="space-y-3">
        {criteria.map((criterion, index) => <div key={criterion.id} className="flex items-start gap-2"><label htmlFor={`${id}-${criterion.id}`} className="pt-2.5 text-xs tabular-nums text-muted-foreground">{index + 1}</label><Input id={`${id}-${criterion.id}`} aria-label={`第 ${index + 1} 项验收要求`} value={criterion.text} required maxLength={1000} placeholder="写明可核对的交付内容或通过条件" className="min-w-0 flex-1" onChange={(event) => setCriteria((current) => current.map((item) => item.id === criterion.id ? { ...item, text: event.target.value } : item))} /><Button type="button" variant="ghost" size="icon" aria-label={`移除第 ${index + 1} 项要求`} onClick={() => setCriteria((current) => current.filter((item) => item.id !== criterion.id))}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></div>)}
        {!criteria.length && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">尚无验收要求。至少保存一项清单后，任务才能提交成果。</p>}
        <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={criteria.length >= 30} onClick={() => setCriteria((current) => [...current, { id: crypto.randomUUID(), text: "" }])}><Plus aria-hidden="true" className="h-4 w-4" />添加验收项</Button><Button type="submit" size="sm" loading={pending} disabled={!dirty || !criteria.length}>保存验收清单</Button></div>
      </fieldset>
      <FormFeedback message={state?.error} />
      {state?.error?.includes("修改") && <Button type="button" variant="outline" size="sm" disabled={pending || loading} loading={loading} onClick={() => void loadLatest()}>保留草稿并查看最新要求</Button>}
      <FormFeedback message={loadError} />
      {latest && <div className="space-y-3 rounded-lg border border-brand/20 bg-brand-soft p-3"><p className="text-sm font-medium">服务器最新要求 v{latest.version}</p><ol className="list-inside list-decimal space-y-1 text-sm">{latest.criteria.map((criterion) => <li key={criterion.id} className="break-words">{criterion.text}</li>)}</ol>{!latest.criteria.length && <p className="text-sm text-muted-foreground">最新要求为空。</p>}<p className="text-xs text-muted-foreground">上方草稿仍保留。请先核对差异，再选择是否用草稿替换最新要求。</p><Button type="button" variant="outline" size="sm" onClick={() => { setVersion(latest.version); setLatest(null); }}>已核对，使用草稿重试</Button></div>}
    </form> : <ol className="space-y-2">{requirements.criteria.map((criterion, index) => <li key={criterion.id} className="flex gap-2 rounded-lg bg-muted/35 p-3 text-sm"><span className="shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span><span className="min-w-0 break-words">{criterion.text}</span></li>)}{!requirements.criteria.length && <li className="text-sm text-muted-foreground">尚未设置验收清单，请联系有任务维护权限的成员完善。</li>}</ol>}
    <p className="text-xs leading-relaxed text-muted-foreground">{taskStatus === "submitted" || taskStatus === "accepted" ? "当前验收阶段的清单已冻结。如需调整工作目标或通过条件，请先打回或重新打开任务；原提交和评审记录完整保留。" : "更新清单会产生新要求版本；已经提交的成果继续保留当时的要求与自检。"}</p>
  </section>;
}
