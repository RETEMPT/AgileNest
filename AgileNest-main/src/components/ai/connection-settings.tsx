"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { z } from "zod";
import { Check, Download, Eye, EyeOff, LoaderCircle, PlugZap, RefreshCw, Square } from "lucide-react";
import { modelConfigurationSchema, modelProviderListSchema, type ModelProviderList, type ModelConfiguration } from "@/modules/ai/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormFeedback } from "@/components/ui/feedback";
import { MODEL_CONNECTION_EVENT, modelRequest } from "./model-connection";

const presets = {
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com", protocol: "chat" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "responses" },
  anthropic: { name: "Anthropic", baseUrl: "https://api.anthropic.com", protocol: "anthropic" },
  compatible: { name: "自定义服务", baseUrl: "", protocol: "chat" },
} as const;
export const initialModelConfiguration: ModelConfiguration = { name: "自定义服务", provider: "compatible", baseUrl: "", model: "", protocol: "chat", timeoutSeconds: 90, maxOutputTokens: 4096 };

export function ConnectionForm({ configuration, providerId, knownIds, revision, onSaved, saveGuardRef }: { configuration: ModelConfiguration; providerId?: string; knownIds: string[]; revision: number; onSaved: (configuration: ModelConfiguration, list: ModelProviderList, savedId: string) => void; saveGuardRef?: RefObject<(() => boolean) | null> }) {
  const configured = !!providerId;
  const id = useId();
  const [form, setForm] = useState(configuration);
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "models" | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [importText, setImportText] = useState("");
  const [testResult, setTestResult] = useState<{ text: string; latencyMs: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(configuration) || !!key || !!importText;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!saveGuardRef) return;
    const guard = () => {
      if (busy) { setFailure("请求尚未结束，请等待完成或先停止请求"); return false; }
      if (dirty) { setFailure("配置尚未保存。请保存连接，或点击“放弃未保存内容”后关闭"); return false; }
      return true;
    };
    saveGuardRef.current = guard;
    return () => { if (saveGuardRef.current === guard) saveGuardRef.current = null; };
  }, [saveGuardRef, dirty, busy]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  function change(patch: Partial<ModelConfiguration>) { setForm((current) => ({ ...current, ...patch })); setTestResult(null); setFeedback(""); setFailure(""); }
  async function operate(operation: NonNullable<typeof busy>) {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setBusy(operation); setFailure(""); setFeedback("");
    try {
      if (operation === "models") {
        if (!configured && !key.trim()) { setFailure("请先填写 API Key，再获取模型列表"); return; }
        const value = await modelRequest("models", providerId ? { providerId, configuration: { ...form, apiKey: key || undefined } } : { ...form, apiKey: key || undefined }, request.signal);
        const result = z.object({ models: z.array(z.string()) }).parse(value); setModels(result.models);
        if (result.models.length && !form.model) setForm((current) => ({ ...current, model: result.models[0] }));
        setFeedback(result.models.length ? `已读取 ${result.models.length} 个模型，请在模型名称中选择` : "服务未返回可用模型，请手动填写模型名称"); return;
      }
      const parsed = modelConfigurationSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "请检查配置");
      const next = modelProviderListSchema.parse(await modelRequest("providers", { expectedRevision: revision, id: providerId, configuration: { ...parsed.data, apiKey: key || undefined } }, request.signal, "PUT"));
      const saved = next.providers.find((item) => providerId ? item.id === providerId : !knownIds.includes(item.id));
      if (!saved) throw new Error("保存结果无法确认，请刷新列表");
      setKey(""); setForm(saved.configuration); onSaved(saved.configuration, next, saved.id); window.dispatchEvent(new Event(MODEL_CONNECTION_EVENT));
      if (operation === "test") {
        const result = z.object({ text: z.string(), latencyMs: z.number() }).parse(await modelRequest("test", { providerId: saved.id }, request.signal));
        setTestResult(result); setFeedback("连接成功，已收到模型的真实回复");
      } else setFeedback("配置已保存；关闭后选择“使用此服务”即可启用");
    } catch (error) { setFailure(request.signal.aborted ? "已停止请求，填写内容保留" : error instanceof Error ? error.message : "请求失败，请重试"); }
    finally { controller.current = null; setBusy(null); }
  }
  return <form autoComplete="off" className="space-y-5" onSubmit={(event) => { event.preventDefault(); void operate("save"); }}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">模型连接</h3><span className="rounded-full bg-brand-soft px-3 py-1 text-xs text-brand">{testResult ? "测试通过" : configured ? "已配置" : "尚未配置"}</span></div>
    <fieldset disabled={!!busy} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${id}-preset`}>服务预设</Label><select id={`${id}-preset`} value={form.provider} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm" onChange={(event) => { const provider = event.target.value as ModelConfiguration["provider"]; change({ provider, ...presets[provider], model: "", reasoningEffort: undefined }); setKey(""); setModels([]); }}>
        {Object.entries(presets).map(([value, preset]) => <option key={value} value={value}>{preset.name}</option>)}
      </select></div>
      <div className="space-y-2"><Label htmlFor={`${id}-name`}>服务名称</Label><Input id={`${id}-name`} value={form.name} maxLength={60} onChange={(event) => change({ name: event.target.value })} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-url`}>API 地址</Label><Input id={`${id}-url`} type="url" name="model_api_endpoint" autoComplete="off" value={form.baseUrl} maxLength={500} placeholder="https://api.example.com/v1" onChange={(event) => { change({ baseUrl: event.target.value }); setModels([]); }} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-key`}>API Key</Label><div className="flex gap-2"><Input id={`${id}-key`} type={visible ? "text" : "password"} name="model_api_key" autoComplete="new-password" spellCheck={false} value={key} maxLength={1024} placeholder={configured ? "已保存密钥；留空继续使用，填写以替换" : "直接粘贴服务提供的 API 密钥"} onChange={(event) => { setKey(event.target.value); setTestResult(null); }} /><Button type="button" variant="outline" size="icon" aria-label={visible ? "隐藏 API Key" : "显示 API Key"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</Button></div><p className="text-xs text-muted-foreground">密钥加密保存，不进入会话、配置导出或浏览器本地明文存储。</p></div>
      <div className="space-y-2"><Label htmlFor={`${id}-model`}>模型名称</Label><Input id={`${id}-model`} list={`${id}-models`} value={form.model} maxLength={120} placeholder="填写或获取后选择模型" onChange={(event) => change({ model: event.target.value })} /><datalist id={`${id}-models`}>{models.map((model) => <option key={model} value={model} />)}</datalist></div>
      <div className="flex items-end"><Button type="button" variant="outline" disabled={!form.baseUrl} onClick={() => void operate("models")}><RefreshCw size={15} />获取模型列表</Button></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-protocol`}>接口格式</Label><select id={`${id}-protocol`} value={form.protocol} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm" onChange={(event) => change({ protocol: event.target.value as ModelConfiguration["protocol"], reasoningEffort: undefined })}><option value="chat">OpenAI 兼容（Chat Completions）</option><option value="responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option></select></div>
    </fieldset>
    <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm">更多选项</summary><fieldset disabled={!!busy} className="mt-4 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm">等待时间（秒）<Input type="number" min={10} max={180} value={form.timeoutSeconds} onChange={(event) => change({ timeoutSeconds: Number(event.target.value) })} /></label><label className="space-y-2 text-sm">最长回复（tokens）<Input type="number" min={128} max={8192} value={form.maxOutputTokens} onChange={(event) => change({ maxOutputTokens: Number(event.target.value) })} /></label><label className="space-y-2 text-sm sm:col-span-2">推理强度<select className="block h-10 w-full rounded-lg border border-input bg-card px-3 text-sm" value={form.reasoningEffort ?? ""} onChange={(event) => change({ reasoningEffort: event.target.value ? event.target.value as ModelConfiguration["reasoningEffort"] : undefined })}><option value="">服务默认</option>{form.protocol !== "anthropic" && <option value="none">不启用</option>}<option value="low">低</option><option value="medium">中</option><option value="high">高</option></select><span className="block text-xs text-muted-foreground">仅在服务和模型支持时设置。</span></label></fieldset></details>
    <FormFeedback message={failure} /><FormFeedback message={feedback} tone="success" />
    {testResult && <div className="space-y-2 rounded-lg bg-background p-4"><p className="text-xs text-muted-foreground">模型实际回复 · {testResult.latencyMs} ms</p><p className="whitespace-pre-wrap break-words text-sm">{testResult.text}</p></div>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!!busy}><Check size={15} />保存连接</Button><Button type="button" variant="outline" disabled={!!busy} onClick={() => void operate("test")}>{busy === "test" ? <LoaderCircle className="animate-spin" size={15} /> : <PlugZap size={15} />}保存并测试</Button>{busy && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}><Square size={14} />停止</Button>}{dirty && !busy && <Button type="button" variant="ghost" onClick={() => { setForm(configuration); setKey(""); setImportText(""); setFailure(""); }}>放弃未保存内容</Button>}</div>
    <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm text-brand">配置文件</summary><div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">导出仅包含地址和模型等配置，密钥需要另行填写。</p><Button type="button" variant="outline" size="sm" onClick={() => { const parsed = modelConfigurationSchema.safeParse(form); if (!parsed.success) { setFailure("请先补全地址与模型名称"); return; } const url = URL.createObjectURL(new Blob([JSON.stringify(parsed.data, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "agilenest-model-config.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={14} />导出配置</Button><label className="block space-y-2 text-sm" htmlFor={`${id}-import`}>导入配置 JSON<textarea id={`${id}-import`} disabled={!!busy} value={importText} maxLength={5000} onChange={(event) => setImportText(event.target.value)} className="block min-h-28 w-full rounded-lg border border-input bg-background p-3 font-mono text-xs" /></label><Button type="button" size="sm" variant="outline" disabled={!!busy || !importText.trim()} onClick={() => { try { const parsed = modelConfigurationSchema.safeParse(JSON.parse(importText)); if (!parsed.success) throw new Error(); setForm(parsed.data); setKey(""); setImportText(""); setModels([]); setTestResult(null); setFailure(""); setFeedback("已载入连接配置，请填写密钥后保存"); } catch { setFailure("配置 JSON 格式不正确，或包含密钥等不支持的字段；原配置保留"); } }}>载入表单</Button></div></details>
  </form>;
}
