"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { z, ZodError } from "zod";
import { CheckCircle2, Download, GitBranch, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/feedback";
import { planAssistResultSchema, readyTaskPlanSchema, type PlanAssistResult } from "@/modules/ai/client";
import { PlanningCoach } from "./planning-coach-ui";
import { adoptCriteriaSuggestions, appendClarificationAnswers } from "./planning-coach";
import { modelRequest, useModelConnection } from "./model-connection";
import { appendPlanningSource } from "./planning-context";
import { decodeTaskPlan, emptyTaskPlan, encodeTaskPlan, importTaskPlan, MAX_PLAN_NODES, prepareTaskPlanPublication, removePlanLeaf, taskPlanApplyResultSchema, taskPlanPublicationSchema, taskPlanSchema, taskPlanStorageKey, updatePlanNode, writeTaskPlan, type TaskPlan, type TaskPlanContext, type TaskPlanNode, type TaskPlanPublication } from "./task-plan";

type Props = { userId: string; projectId: string | null; context?: TaskPlanContext; initialGoal?: string; onClose: () => void; onReturnFocus: () => void; onAttach: (text: string) => string | null; onConfigure?: () => void; saveGuardRef?: RefObject<(() => boolean) | null> };
const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40";
function message(error: unknown) {
  if (error instanceof SyntaxError) return "返回内容不是有效 JSON，请检查接口协议或重新生成";
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (issue?.code === "unrecognized_keys") return "规划包含不支持的字段，请只保留任务信息";
    return issue && ["custom", "too_big", "too_small", "invalid_format"].includes(issue.code) ? issue.message : "规划格式不正确，请核对任务信息和先后顺序";
  }
  return error instanceof Error ? error.message : "操作失败，输入已保留";
}

export function TaskPlanDialog(props: Props) {
  return <TaskPlanContent key={taskPlanStorageKey(props.userId, props.projectId, props.context)} {...props} />;
}
function TaskPlanContent({ userId, projectId, context, initialGoal, onClose, onReturnFocus, onAttach, onConfigure, saveGuardRef }: Props) {
  const router = useRouter();
  const key = taskPlanStorageKey(userId, projectId, context);
  const connection = useModelConnection(userId);
  const [plan, setPlan] = useState<TaskPlan>(emptyTaskPlan);
  const [goal, setGoal] = useState("");
  const [sourceAdopted, setSourceAdopted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<{ plan: TaskPlan; source: string } | null>(null);
  const [publication, setPublication] = useState<TaskPlanPublication | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);
  const [pending, setPending] = useState<"model" | "apply" | "assist" | null>(null);
  const [assistance, setAssistance] = useState<{ result: PlanAssistResult & { model: string }; snapshot: string } | null>(null);
  const assistanceStale = !!assistance && assistance.snapshot !== JSON.stringify({ goal, plan });
  const baseline = useRef<string | null>(null);
  const goalBaseline = useRef<string | null>(null);
  const publicationBaseline = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [blockedRead, setBlockedRead] = useState(false);
  const [recoveryData, setRecoveryData] = useState("");
  const frozen = publication !== null;
  const selected = plan.nodes.find((node) => node.id === selectedId);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      let raw: string | null = null; let rawPublication: string | null = null; let rawGoal: string | null = null;
      try {
        raw = localStorage.getItem(key); rawPublication = localStorage.getItem(`${key}:publication`); rawGoal = localStorage.getItem(`${key}:goal`);
        const saved = decodeTaskPlan(raw);
        baseline.current = raw;
        goalBaseline.current = rawGoal;
        setGoal(goalBaseline.current ?? "");
        publicationBaseline.current = rawPublication;
        const published = rawPublication ? taskPlanPublicationSchema.parse(JSON.parse(rawPublication)) : null;
        setPublication(published);
        setPlan(published?.plan ?? saved);
        setSelectedId((published?.plan ?? saved).nodes[0]?.id ?? null);
      } catch { setBlockedRead(true); setRecoveryData(JSON.stringify({ savedPlan: raw, savedCreation: rawPublication, savedGoal: rawGoal }, null, 2)); setStorageError("本地规划无法读取或已损坏。旧记录未覆盖；请先下载原始备份，检查浏览器存储后重试。"); }
      setLoaded(true);
    });
    return () => { active = false; abort.current?.abort(); };
  }, [key]);
  useEffect(() => {
    if (!storageError && !importText && !preview && !pending && !assistance) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [storageError, importText, preview, pending, assistance]);
  useEffect(() => {
    if (!saveGuardRef) return;
    const guard = () => {
      if (!loaded || storageError || importText || preview || pending || assistance) { setError("请先处理当前生成结果、辅导建议、导入内容或创建请求，再关闭规划。"); return false; }
      return true;
    };
    saveGuardRef.current = guard;
    return () => { if (saveGuardRef.current === guard) saveGuardRef.current = null; };
  }, [saveGuardRef, loaded, storageError, importText, preview, pending, assistance]);
  function persist(next: TaskPlan) {
    setPlan(next); setError(""); setConfirmCreate(false);
    if (blockedRead) return;
    try { baseline.current = writeTaskPlan(localStorage, key, baseline.current, next); }
    catch (failure) { setStorageError(`${message(failure)}。当前输入仍在，请下载备份后再关闭。`); }
  }
  function saveGoal(next: string) {
    setGoal(next);
    if (blockedRead) return false;
    try {
      if (localStorage.getItem(`${key}:goal`) !== goalBaseline.current) throw new Error("另一窗口已修改规划目标，请先备份当前输入");
      localStorage.setItem(`${key}:goal`, next); goalBaseline.current = next; return true;
    } catch (failure) { setStorageError(message(failure)); return false; }
  }
  function savePublication(next: TaskPlanPublication) {
    if (localStorage.getItem(`${key}:publication`) !== publicationBaseline.current) throw new Error("另一窗口已变更创建进度，请重新打开规划查看，避免重复创建");
    const raw = JSON.stringify(taskPlanPublicationSchema.parse(next));
    localStorage.setItem(`${key}:publication`, raw); publicationBaseline.current = raw;
    setPublication(next);
  }
  function retryStorage() {
    if (blockedRead) return;
    try {
      baseline.current = writeTaskPlan(localStorage, key, baseline.current, plan);
      if (localStorage.getItem(`${key}:goal`) !== goalBaseline.current) throw new Error("另一窗口已修改规划目标，请先备份当前输入");
      localStorage.setItem(`${key}:goal`, goal); goalBaseline.current = goal;
      if (publication) savePublication(publication);
      setStorageError("");
    } catch (failure) { setStorageError(message(failure)); }
  }
  function mutate(action: () => TaskPlan) { if (frozen || pending) return; try { persist(action()); } catch (failure) { setError(message(failure)); } }
  function edit(patch: Partial<TaskPlanNode>) { if (selected) mutate(() => updatePlanNode(plan, { ...selected, ...patch })); }
  function add(parentId: string | null = null) {
    const id = crypto.randomUUID();
    mutate(() => taskPlanSchema.parse({ ...plan, nodes: [...plan.nodes, { id, title: "", criteria: [], parentId, dependsOn: [] }] }));
    if (plan.nodes.length < MAX_PLAN_NODES) setSelectedId(id);
  }
  function close() {
    if (pending === "apply") { setError("正在创建项目任务，请等待创建结果。"); return; }
    if (storageError || importText || preview || assistance) setCloseWarning(true);
    else { abort.current?.abort(); onClose(); }
  }
  function configure() {
    if (storageError || importText || preview || pending || assistance) { setError("请先处理当前生成结果或未保存内容，再打开模型设置。"); return; }
    if (onConfigure) onConfigure();
    else router.push("/settings?section=ai");
  }
  function exportPlan(format: "json" | "text", attach: boolean) {
    try {
      const text = !attach && format === "json" ? JSON.stringify(taskPlanSchema.parse(plan), null, 2) : encodeTaskPlan(plan, format, context);
      if (attach) {
        if (importText || preview || assistance) throw new Error("请先采用或放弃预览内容和辅导建议，再加入对话");
        const failure = onAttach(text); if (failure) throw new Error(failure);
        onClose();
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = `task-plan.${format === "json" ? "json" : "md"}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (failure) { setError(message(failure)); }
  }
  function exportRecovery() {
    const url = URL.createObjectURL(new Blob([recoveryData], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "task-plan-recovery.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function generate() {
    if (!projectId) { setError("请先选择项目，再生成任务规划"); return; }
    if (!goal.trim()) { setError("请输入任务目标和交付要求"); return; }
    if (!connection.configured) { setError("请先配置并测试模型 API"); return; }
    if (frozen || pending || abort.current) return;
    if (importText || assistance) { setError("请先处理 JSON 输入或关闭这次辅导建议"); return; }
    const controller = new AbortController(); abort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), ((connection.configuration?.timeoutSeconds ?? 180) + 10) * 1000);
    setPending("model"); setError(""); setPreview(null);
    try {
      const value = await modelRequest("plan", { projectId, ...(context?.milestoneId ? { milestoneId: context.milestoneId } : {}), goal, ...(plan.nodes.length ? { plan } : {}) }, controller.signal);
      const result = z.object({ plan: readyTaskPlanSchema, model: z.string() }).parse(value);
      if (!controller.signal.aborted) setPreview({ plan: result.plan, source: `模型 ${result.model}` });
    } catch (failure) { setError(controller.signal.aborted ? "已取消或请求超时，规划目标与现有任务已保留，可重新生成" : message(failure)); }
    finally { window.clearTimeout(timer); abort.current = null; setPending(null); }
  }
  async function assist(mode: "clarify" | "review") {
    if (!projectId || !connection.configured || frozen || pending || abort.current) return;
    if (!goal.trim()) { setError("请先填写任务目标与交付要求"); return; }
    if (storageError || blockedRead || importText || preview || assistance) { setError("请先处理当前未保存内容或生成结果"); return; }
    const controller = new AbortController(); abort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), ((connection.configuration?.timeoutSeconds ?? 180) + 10) * 1000);
    const snapshot = JSON.stringify({ goal, plan });
    setPending("assist"); setConfirmCreate(false); setError("");
    try {
      const value = await modelRequest("assist", { mode, projectId, ...(context ? { milestoneId: context.milestoneId } : {}), goal, ...(plan.nodes.length ? { plan } : {}) }, controller.signal);
      const { model, ...payload } = z.object({ model: z.string() }).passthrough().parse(value);
      const result = { ...planAssistResultSchema.parse(payload), model };
      if (!controller.signal.aborted) setAssistance({ result, snapshot });
    } catch (failure) { setError(controller.signal.aborted ? "检查已取消或超时，目标与规划已保留" : message(failure)); }
    finally { window.clearTimeout(timer); abort.current = null; setPending(null); }
  }
  function adoptAnswers(answers: string[]) {
    if (!assistance || assistance.result.mode !== "clarify" || assistanceStale || pending || frozen) return;
    try { saveGoal(appendClarificationAnswers(goal, assistance.result.questions, answers)); setAssistance(null); }
    catch (failure) { setError(message(failure)); }
  }
  function adoptReview(indices: number[]) {
    if (!assistance || assistance.result.mode !== "review" || assistanceStale || pending || frozen) return;
    try { persist(adoptCriteriaSuggestions(plan, assistance.result, indices)); setAssistance(null); }
    catch (failure) { setError(message(failure)); }
  }
  function reviewCreation() {
    try {
      if (!projectId) throw new Error("请先选择项目");
      if (storageError || blockedRead || importText || preview || assistance) throw new Error("请先处理未保存内容、生成结果或辅导建议，再创建项目任务");
      prepareTaskPlanPublication(plan, crypto.randomUUID());
      setConfirmCreate(true); setError("");
    } catch (failure) { setError(message(failure)); }
  }
  async function publish() {
    if (!projectId || pending || abort.current) return;
    if (assistance || preview || importText || storageError || blockedRead) { setError("请先处理未采用的建议或未保存内容，再创建任务"); return; }
    let batch = publication;
    try {
      if (!batch) { batch = prepareTaskPlanPublication(plan, crypto.randomUUID()); savePublication(batch); }
    } catch (failure) { setError(`无法保存创建请求：${message(failure)}。尚未开始创建。`); return; }
    const controller = new AbortController(); abort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 190000);
    setPending("apply"); setConfirmCreate(false); setError("");
    try {
      const value = await modelRequest("apply-plan", { projectId, ...(context ? { milestoneId: context.milestoneId } : {}), runId: batch.runId, plan: batch.plan }, controller.signal);
      const result = taskPlanApplyResultSchema.parse(value);
      const updated = { ...batch, result };
      setPublication(updated);
      try { savePublication(updated); }
      catch (failure) { setStorageError(`任务创建进度未能保存在此设备：${message(failure)}。原创建请求已保留，可重新打开后重试核对。`); }
      if (result.error) setError(result.error);
    } catch (failure) { setError(controller.signal.aborted ? "请求超时，服务端可能已创建部分任务。请使用“重试未完成项”核对，已创建的任务不会重复。" : message(failure)); }
    finally { window.clearTimeout(timer); abort.current = null; setPending(null); }
  }
  function startNew() {
    if (!publication?.result?.complete || pending) return;
    try {
      if (localStorage.getItem(`${key}:publication`) !== publicationBaseline.current) throw new Error("创建进度已在另一窗口变化，请重新打开规划");
      localStorage.removeItem(`${key}:publication`); publicationBaseline.current = null;
      setPublication(null); persist(emptyTaskPlan()); setSelectedId(null); saveGoal("");
    } catch (failure) { setError(message(failure)); }
  }
  function treeNode(node: TaskPlanNode) {
    return <li key={node.id}><button type="button" aria-pressed={selectedId === node.id} onClick={() => setSelectedId(node.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === node.id ? "bg-brand-soft text-brand" : "hover:bg-muted"}`}><span className="block truncate">{node.title || "未命名任务"}</span>{!!node.dependsOn.length && <span className="mt-1 block text-xs text-muted-foreground">先完成：{node.dependsOn.map((id) => plan.nodes.find((item) => item.id === id)?.title || "未命名任务").join("、")}</span>}</button>{!node.parentId && <ul className="ml-4 border-l border-border pl-2">{plan.nodes.filter((child) => child.parentId === node.id).map(treeNode)}</ul>}</li>;
  }
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-70 bg-black/35" /><Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }} onInteractOutside={(event) => event.preventDefault()} className="dialog-surface fixed left-1/2 top-1/2 z-70 flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
    <header className="flex items-start justify-between gap-3 border-b border-border p-4"><div><Dialog.Title className="flex items-center gap-2 font-semibold"><GitBranch size={18} />任务规划</Dialog.Title><Dialog.Description className="mt-2 text-xs leading-5 text-muted-foreground">描述目标，让 AI 拆分任务；核对任务树与验收要求后，创建到当前项目。</Dialog.Description>{context && <p className="mt-1 text-xs text-brand">{context.taskId ? "来源任务" : context.sourceId ? "来源对话" : "里程碑"}：{context.title}</p>}</div><Button variant="ghost" size="icon" aria-label="关闭任务规划" onClick={close} disabled={pending === "apply"}><X size={18} /></Button></header>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"><FormFeedback message={error} /><FormFeedback message={storageError} />{storageError && !blockedRead && <Button size="sm" variant="outline" disabled={!!pending} onClick={retryStorage}>重试保存输入与创建进度</Button>}{blockedRead && recoveryData && <Button size="sm" variant="outline" onClick={exportRecovery}>下载原始规划与创建记录备份</Button>}
      {closeWarning && <div role="alert" className="rounded-lg border border-border p-3 text-sm"><p>还有未保存输入或未采用的结果。关闭前请复制目标、辅导答复、JSON 输入，或下载规划备份。</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setCloseWarning(false)}>继续编辑</Button><Button size="sm" variant="destructive" onClick={() => { abort.current?.abort(); onClose(); }}>放弃未保存内容并关闭</Button></div></div>}
      {!loaded ? <p role="status" className="py-8 text-sm text-muted-foreground">读取规划…</p> : <>
        {initialGoal && !sourceAdopted && <details className="rounded-xl border border-brand/25 bg-brand-soft/20 p-4"><summary className="cursor-pointer text-sm font-medium">来源内容（尚未加入目标）</summary><p className="mt-3 text-xs leading-5 text-muted-foreground">保留原有目标与规划。只有点击采纳，才会将下方内容追加到目标；不会自动请求模型或修改来源任务。</p><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{initialGoal}</pre><Button className="mt-3" size="sm" disabled={!loaded || !!pending || frozen || blockedRead || !!storageError} onClick={() => { try { if (saveGoal(appendPlanningSource(goal, initialGoal))) setSourceAdopted(true); } catch (failure) { setError(message(failure)); } }}>将对话或来源内容加入规划目标</Button></details>}
        {!frozen && <section aria-label="AI 任务规划" className="space-y-3 rounded-xl border border-brand/20 bg-brand-soft/30 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{connection.loading ? "读取模型配置…" : connection.configured ? `使用 ${connection.configuration?.name ?? "当前模型"} · ${connection.configuration?.model ?? ""}` : "请先配置真实模型 API"}</span><Button size="sm" variant="ghost" onClick={configure} disabled={!!pending}>模型设置</Button></div><FormFeedback message={connection.error} /><label className="block text-xs font-medium">任务目标与交付要求<textarea className={`${inputClass} mt-2 min-h-24`} maxLength={30000} disabled={!!pending} value={goal} onChange={(event) => saveGoal(event.target.value)} placeholder="例如：两周内完成课题开题，包括文献调研、方案设计和开题报告。每项任务都需要可核验的验收要求。" /></label><div className="flex flex-wrap items-center gap-2"><Button size="sm" disabled={!!pending || !projectId || connection.loading || !connection.configured} onClick={() => void generate()}>{pending === "model" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{plan.nodes.length ? "让 AI 调整规划" : "AI 生成任务规划"}</Button>{pending === "model" && <Button size="sm" variant="outline" onClick={() => abort.current?.abort()}>取消生成</Button>}<span className="text-xs text-muted-foreground">仅发送这里填写的目标与当前规划。</span></div>{!projectId && <p className="text-xs text-muted-foreground">请关闭规划并先选择项目。</p>}</section>}
        {!frozen && <PlanningCoach plan={plan} result={assistance?.result ?? null} stale={assistanceStale} pending={pending === "assist"} disabled={!!pending || !projectId || !connection.configured || connection.loading || !!preview || !!storageError || blockedRead} onRequest={(mode) => void assist(mode)} onStop={() => abort.current?.abort()} onDiscard={() => setAssistance(null)} onAnswers={adoptAnswers} onAdopt={adoptReview} />}
        {preview && <section aria-label="预览生成的任务规划" className="space-y-3 rounded-xl border border-brand/25 p-4"><h3 className="text-sm font-semibold">{preview.source}返回 {preview.plan.nodes.length} 项任务，请核对后采用</h3><ul className="max-h-64 space-y-3 overflow-auto">{preview.plan.nodes.map((node) => <li key={node.id} className="border-l-2 border-brand/30 pl-3 text-sm"><p className="font-medium">{node.parentId ? "子任务 · " : "主任务 · "}{node.title}</p><p className="mt-1 text-xs text-muted-foreground">先完成：{node.dependsOn.map((id) => preview.plan.nodes.find((item) => item.id === id)?.title).join("、") || "无"}</p><ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{node.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>{!node.criteria.length && <p className="text-xs text-destructive">需补充验收要求</p>}</li>)}</ul><p className="text-xs text-muted-foreground">采用后替换当前规划，可继续编辑；尚未创建项目任务。</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => { persist(preview.plan); setSelectedId(preview.plan.nodes[0]?.id ?? null); setPreview(null); setImportText(""); setImportOpen(false); }}>采用此规划</Button><Button size="sm" variant="outline" onClick={() => setPreview(null)}>保留原规划</Button></div></section>}
        {publication && <section aria-label="任务创建进度" className="space-y-3 rounded-xl border border-brand/25 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold">{publication.result?.complete ? <CheckCircle2 size={16} /> : pending === "apply" ? <Loader2 size={16} className="animate-spin" /> : null}{publication.result?.complete ? "项目任务已创建，先后顺序已设置" : pending === "apply" ? "正在创建项目任务…" : "创建尚未全部完成，可重试核对"}</h3><p className="text-xs text-muted-foreground">这次确认的规划已固定，避免重试时产生重复任务。已创建的任务保留。</p><ul className="space-y-2 text-sm">{publication.plan.nodes.map((node) => { const created = publication.result?.tasks.find((task) => task.nodeId === node.id); return <li key={node.id} className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words">{node.title}</span>{created ? <Link className="shrink-0 text-xs text-brand underline" href={`/p/${projectId}/tasks/${created.taskId}`}>已创建 · 查看任务</Link> : <span className="text-xs text-muted-foreground">{pending === "apply" ? "等待创建结果" : "待重试核对"}</span>}</li>; })}</ul><div className="flex flex-wrap gap-2">{!publication.result?.complete && <Button size="sm" onClick={() => void publish()} disabled={!!pending}>重试未完成项</Button>}{publication.result?.complete && <Button size="sm" variant="outline" onClick={startNew}>开始新规划</Button>}{context?.milestoneId && <Link className="self-center text-xs text-brand underline" href={`/p/${projectId}/milestones`}>查看里程碑任务树</Link>}</div></section>}
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{plan.nodes.length} / {MAX_PLAN_NODES} 个任务 · {projectId ? "当前项目" : "未选择项目"}</span>{!frozen && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!!pending} onClick={() => setImportOpen(!importOpen)}>导入规划 JSON</Button><Button size="sm" disabled={!!pending || plan.nodes.length >= MAX_PLAN_NODES} onClick={() => add()}><Plus size={14} />主任务</Button></div>}</div>
        {importOpen && !frozen && <section aria-label="导入规划" className="space-y-3 rounded-lg border border-border p-3"><label className="block text-xs font-medium">粘贴规划 JSON<textarea className={`${inputClass} mt-2 min-h-32 font-mono text-xs`} maxLength={700000} value={importText} disabled={!!pending} onChange={(event) => { setImportText(event.target.value); setPreview(null); }} placeholder={'{"version":1,"nodes":[]}'} /></label><Button size="sm" variant="outline" disabled={!!pending} onClick={() => { try { setPreview({ plan: importTaskPlan(importText), source: "导入内容" }); setError(""); } catch (failure) { setError(message(failure)); } }}>校验并预览导入</Button><Button size="sm" variant="ghost" onClick={() => { setImportText(""); setPreview(null); setImportOpen(false); }}>取消导入</Button></section>}
        <div className="grid gap-4 md:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]"><nav aria-label="规划任务树" className="min-w-0 rounded-lg border border-border p-2"><ul className="space-y-1">{plan.nodes.filter((node) => !node.parentId).map(treeNode)}</ul>{!plan.nodes.length && <p className="p-4 text-sm leading-6 text-muted-foreground">填写目标让 AI 拆分，也可以手动添加任务。</p>}</nav><section aria-label="编辑规划任务" className="min-w-0 space-y-4 rounded-lg border border-border p-4">{selected ? <fieldset disabled={frozen || !!pending} className="min-w-0 space-y-4"><label className="block text-xs font-medium">任务名称<input className={`${inputClass} mt-2`} maxLength={200} value={selected.title} onChange={(event) => edit({ title: event.target.value })} /></label><label className="block text-xs font-medium">所属主任务<select className={`${inputClass} mt-2`} value={selected.parentId ?? ""} onChange={(event) => edit({ parentId: event.target.value || null })}><option value="">作为主任务</option>{plan.nodes.filter((node) => node.id !== selected.id && !node.parentId).map((node) => <option key={node.id} value={node.id}>{node.title || "未命名任务"}</option>)}</select></label><label className="block text-xs font-medium">验收要求（每行一项，最多 30 项）<textarea className={`${inputClass} mt-2 min-h-32`} maxLength={15030} value={selected.criteria.join("\n")} onChange={(event) => edit({ criteria: event.target.value ? event.target.value.split("\n") : [] })} /></label><fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium">先完成哪些任务</legend>{plan.nodes.filter((node) => node.id !== selected.id && node.id !== selected.parentId).map((node) => <label key={node.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.dependsOn.includes(node.id)} onChange={(event) => edit({ dependsOn: event.target.checked ? [...selected.dependsOn, node.id] : selected.dependsOn.filter((id) => id !== node.id) })} /><span className="min-w-0 break-words">{node.title || "未命名任务"}{node.parentId ? "（子任务）" : ""}</span></label>)}{plan.nodes.length === 1 && <p className="text-xs text-muted-foreground">添加其他任务后可设置先后顺序。</p>}</fieldset><div className="flex flex-wrap gap-2">{!selected.parentId && <Button size="sm" variant="outline" disabled={plan.nodes.length >= MAX_PLAN_NODES} onClick={() => add(selected.id)}><Plus size={14} />添加子任务</Button>}<Button size="sm" variant="outline" onClick={() => { try { const next = removePlanLeaf(plan, selected.id); persist(next); setSelectedId(next.nodes[0]?.id ?? null); } catch (failure) { setError(message(failure)); } }}><Trash2 size={14} />删除此任务</Button></div></fieldset> : <p className="text-sm text-muted-foreground">选择任务查看和编辑。</p>}</section></div>
        {confirmCreate && <section aria-label="确认创建项目任务" className="space-y-3 rounded-xl border border-brand/30 bg-brand-soft/30 p-4"><h3 className="text-sm font-semibold">确认将这 {plan.nodes.length} 项规划创建为项目任务？</h3><p className="text-xs leading-5 text-muted-foreground">包括主子任务、逐项验收要求与先后顺序。新任务等待成员认领{context?.milestoneId ? `，归入“${context.title}”里程碑` : ""}；请先核对名称、层级和要求。</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void publish()}>确认创建 {plan.nodes.length} 个任务</Button><Button size="sm" variant="outline" onClick={() => setConfirmCreate(false)}>继续调整</Button></div></section>}
      </>}
    </div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><span role="status" className="text-xs text-muted-foreground">{pending === "model" ? "AI 正在生成真实规划…" : pending === "apply" ? "正在创建项目任务…" : pending === "assist" ? "AI 正在检查需求与验收要求…" : storageError ? "本地保存异常，请备份输入" : loaded ? frozen ? "保留本次创建进度" : "目标与规划自动保存在此设备" : "正在加载"}</span><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!loaded || !!pending} onClick={() => exportPlan("json", false)}><Download size={14} />备份 JSON</Button><Button size="sm" variant="outline" disabled={!loaded || !!pending} onClick={() => exportPlan("text", true)}>加入对话</Button>{!frozen && <Button size="sm" disabled={!loaded || !!pending || !projectId || !plan.nodes.length || !!preview} onClick={reviewCreation}>创建项目任务</Button>}</div></footer>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
