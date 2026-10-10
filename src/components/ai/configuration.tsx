"use client";

import { useId, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Check, ChevronDown, Copy, Plug, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useUiPreferences } from "@/components/preferences";
import { BUILTIN_PLUGINS, MODEL_PRESETS, modelConfigurationSchema, type ModelConfiguration } from "./configuration-model";

export function AiConfiguration({ userId, initialTab = "model" }: { userId: string; initialTab?: "model" | "plugins" }) {
  const { preferences, update, error, retry } = useUiPreferences(userId);
  const [savedFeedback, setSavedFeedback] = useState("");
  return <Tabs.Root defaultValue={initialTab}>
    <Tabs.List aria-label="AI 设置分区" className="mb-6 flex gap-1 border-b border-border">
      <Tabs.Trigger value="model" className="ui-press flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-brand data-[state=active]:text-brand"><SlidersHorizontal size={16} />模型配置</Tabs.Trigger>
      <Tabs.Trigger value="plugins" className="ui-press flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-brand data-[state=active]:text-brand"><Plug size={16} />插件</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="model" forceMount className="panel-enter data-[state=inactive]:hidden"><ModelSettings key={JSON.stringify(preferences.ai.model)} model={preferences.ai.model} onEdit={() => setSavedFeedback("")} onSave={(model) => { const ok = update({ai:{...preferences.ai,model}}); if (ok) setSavedFeedback("配置草稿已保存，尚未连接模型"); return ok; }} />{savedFeedback && <p role="status" className="mt-3 text-xs text-brand">{savedFeedback}</p>}</Tabs.Content>
    <Tabs.Content value="plugins" forceMount className="panel-enter data-[state=inactive]:hidden">
      <div className="mb-5"><h3 className="text-base font-semibold">本地技能</h3><p className="mt-1.5 text-sm text-muted-foreground">启用后可在输入框中插入整理提纲。</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {BUILTIN_PLUGINS.map((plugin) => <label key={plugin.id} className="ui-press flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 hover:border-brand/40 hover:bg-brand-soft/40"><span className="rounded-lg bg-brand-soft p-2 text-brand"><Plug size={17} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{plugin.name}</span><span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{plugin.description}</span></span><input type="checkbox" role="switch" aria-label={`启用${plugin.name}插件`} checked={preferences.ai.plugins.includes(plugin.id)} onChange={(event) => update({ai:{...preferences.ai,plugins: event.target.checked ? [...preferences.ai.plugins,plugin.id] : preferences.ai.plugins.filter((id) => id !== plugin.id)}})} className="mt-1 h-4 w-4 accent-brand" /></label>)}
      </div>
      <div className="mt-6 rounded-xl border border-dashed border-border p-5"><h3 className="text-sm font-medium">外部工具与连接</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">加号菜单支持本地文件读取、预览与结构整理。MCP 和在线服务尚未连接；本地技能只插入提纲，不安装外部插件，也不访问项目数据。</p><details className="ai-details mt-3"><summary className="ui-press flex cursor-pointer list-none items-center gap-2 text-xs text-brand"><ChevronDown size={14} />设计参考</summary><div className="ai-details-body"><div className="pt-3 text-xs leading-6 text-muted-foreground">按技能与外部工具分组，分别展示能力和连接状态。<div className="flex flex-wrap gap-4"><a className="text-brand underline" href="https://developers.openai.com/plugins/concepts/plugins" target="_blank" rel="noopener noreferrer">Codex 插件</a><a className="text-brand underline" href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener noreferrer">DeepSeek Harness</a></div></div></div></details></div>
    </Tabs.Content>
    {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}<Button variant="ghost" size="sm" onClick={retry}>重试</Button></p>}
  </Tabs.Root>;
}

function ModelSettings({ model, onSave, onEdit }: { model: ModelConfiguration; onSave: (value: ModelConfiguration) => boolean; onEdit: () => void }) {
  const id = useId();
  const [draft, setDraft] = useState(model);
  const [feedback, setFeedback] = useState("");
  const [invalid, setInvalid] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(model);
  function change(patch: Partial<ModelConfiguration>) { setDraft({...draft,...patch}); setFeedback(""); setInvalid(false); onEdit(); }
  return <form onSubmit={(event) => {
    event.preventDefault();
    const parsed = modelConfigurationSchema.safeParse(draft);
    if (!parsed.success) { setInvalid(true); setFeedback(parsed.error.issues[0].message); return; }
    setInvalid(false);
    onSave(parsed.data);
  }} className="space-y-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold">模型连接</h3><span className="rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">未连接</span></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${id}-provider`}>服务提供方</Label><select id={`${id}-provider`} value={draft.provider} onChange={(event) => { const provider = event.target.value as ModelConfiguration["provider"]; const preset = MODEL_PRESETS[provider]; change({provider,baseUrl:preset.baseUrl,model:preset.model,apiKeyEnv:preset.apiKeyEnv}); }} className="ui-press h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(MODEL_PRESETS).map(([value,preset]) => <option key={value} value={value}>{preset.label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor={`${id}-model`}>模型标识</Label><Input id={`${id}-model`} maxLength={100} placeholder="填写服务支持的模型标识" value={draft.model} onChange={(event) => change({model:event.target.value})} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-endpoint`}>服务地址</Label><Input id={`${id}-endpoint`} type="url" maxLength={300} placeholder="https://api.example.com/v1" value={draft.baseUrl} onChange={(event) => change({baseUrl:event.target.value})} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-key-env`}>密钥环境变量名</Label><Input id={`${id}-key-env`} maxLength={64} placeholder="AI_API_KEY" value={draft.apiKeyEnv} onChange={(event) => change({apiKeyEnv:event.target.value})} /><p className="text-xs leading-5 text-muted-foreground">这里只保存变量名。实际密钥由服务端配置，请勿在此粘贴密钥。</p></div>
    </div>
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-background p-4"><span><span className="block text-sm font-medium">显示思考与执行过程</span><span className="mt-1 block text-xs text-muted-foreground">接入后展示模型公开返回的摘要与工具进度。</span></span><input type="checkbox" role="switch" aria-label="显示思考与执行过程" checked={draft.showReasoning} onChange={(event) => change({showReasoning:event.target.checked})} className="h-4 w-4 accent-brand" /></label>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">当前仅保存配置，不发起连接或测试请求。</p><Button type="submit" disabled={!dirty}><Check size={15} />保存配置</Button></div>
    {feedback && <p role={invalid ? "alert" : "status"} className={`text-xs ${invalid ? "text-destructive" : "text-brand"}`}>{feedback}</p>}
    <ConfigurationExport model={model} />
  </form>;
}

function ConfigurationExport({ model }: { model: ModelConfiguration }) {
  const [feedback, setFeedback] = useState("");
  const text = JSON.stringify({provider:model.provider,baseUrl:model.baseUrl,model:model.model,apiKeyEnv:model.apiKeyEnv,showReasoning:model.showReasoning},null,2);
  return <details className="ai-details border-t border-border pt-4"><summary className="ui-press flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground"><ChevronDown size={14} />查看配置草稿</summary><div className="ai-details-body"><div className="space-y-3 pt-3"><pre className="overflow-auto rounded-lg bg-background p-3 text-xs leading-6">{text}</pre><Button type="button" size="sm" variant="outline" onClick={async () => { try {await navigator.clipboard.writeText(text); setFeedback("已复制配置");} catch {setFeedback("复制失败，可选择上方配置手动复制");} }}><Copy size={14} />复制配置</Button><span role="status" className="ml-3 text-xs text-muted-foreground">{feedback}</span></div></div></details>;
}
