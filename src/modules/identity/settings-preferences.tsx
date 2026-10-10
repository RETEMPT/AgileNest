"use client";

import { Check, Monitor, Moon, Sun, MessageSquare, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiPreferences } from "@/components/preferences";
import { openAiFloating } from "@/components/ai/floating";
import { AiConfiguration } from "@/components/ai/configuration";

function PreferenceFeedback({ error, onReset }: { error: string | null; onReset: () => void }) {
  return error ? <div role="alert" className="mt-6 flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={onReset}>重置偏好</Button></div> : <p role="status" className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><Check size={14} />偏好立即生效，保存在当前账号的浏览器中。</p>;
}

export function AppearanceSettings({ userId }: { userId: string }) {
  const { preferences, update, error, reset } = useUiPreferences(userId);
  return <section>
    <h2 className="text-xl font-semibold">主题外观</h2>
    <p className="mt-2 text-sm text-muted-foreground">选择工作区的显示风格。</p>
    <fieldset className="mt-8"><legend className="mb-4 text-sm font-medium">颜色主题</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        {([
          { value: "light", label: "浅色", icon: Sun },
          { value: "dark", label: "深色", icon: Moon },
          { value: "system", label: "跟随系统", icon: Monitor },
        ] as const).map(({ value, label, icon: Icon }) => <label key={value} className={`relative cursor-pointer rounded-xl border p-3 transition-colors ${preferences.theme === value ? "border-brand ring-1 ring-brand" : "border-border hover:border-brand/40"}`}>
          <input type="radio" name="theme" value={value} checked={preferences.theme === value} onChange={() => update({ theme: value })} className="peer sr-only" />
          <div aria-hidden="true" className={`flex h-28 overflow-hidden rounded-lg border ${value === "dark" ? "border-[#39404b] bg-[#1c2330]" : "border-[#e1e5ec] bg-[#fbfcfe]"}`}>
            <div className={`w-1/4 space-y-2 p-3 ${value === "dark" ? "bg-[#252e3c]" : "bg-[#eef1f6]"}`}><div className="h-2 w-6 rounded bg-[#879ab7]/50" /><div className="h-2 rounded bg-[#879ab7]/30" /><div className="h-2 rounded bg-[#879ab7]/30" /></div>
            <div className="flex flex-1 flex-col gap-3 p-4"><div className="h-2 w-1/2 rounded bg-[#879ab7]/40" /><div className={`flex-1 rounded border ${value === "dark" ? "border-[#39465a] bg-[#252e3c]" : "border-[#e1e5ec] bg-white"}`} />{value === "system" && <div className="absolute top-3 right-3 h-28 w-[calc(37.5%-0.75rem)] rounded-r-lg bg-[#1c2330]/85" />}</div>
          </div>
          <span className="mt-3 flex items-center gap-2 rounded text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring"><Icon size={15} />{label}{preferences.theme === value && <Check size={15} className="ml-auto text-brand" />}</span>
        </label>)}
      </div>
    </fieldset>
    <PreferenceFeedback error={error} onReset={reset} />
  </section>;
}

export function AiSettings({ userId }: { userId: string }) {
  const { preferences, update, error, reset } = useUiPreferences(userId);
  return <section>
    <h2 className="text-xl font-semibold">AI 助手</h2>
    <p className="mt-2 text-sm text-muted-foreground">设置快速入口，随时继续整理当前对话草稿。</p>
    <div className="mt-8 rounded-xl border border-border">
      <label className="flex cursor-pointer items-center justify-between gap-5 p-5">
        <span className="flex items-start gap-3"><MessageSquare size={20} className="mt-0.5 shrink-0 text-brand" /><span><span className="block text-sm font-medium">AI 悬浮窗</span><span className="mt-1.5 block text-xs leading-5 text-muted-foreground">在其他页面显示快速入口，与 AI 工作区共享当前草稿。</span></span></span>
        <input type="checkbox" role="switch" aria-label="启用 AI 悬浮窗" checked={preferences.aiFloating} onChange={(event) => update({ aiFloating: event.target.checked })} className="h-5 w-5 shrink-0 accent-brand" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-background/50 px-5 py-4"><p className="text-xs text-muted-foreground">可打开、收起，或继续在完整工作区编辑。</p><Button variant="outline" size="sm" disabled={!preferences.aiFloating} onClick={openAiFloating}><PanelRightOpen size={15} />打开悬浮窗</Button></div>
    </div>
    <div className="mt-8"><AiConfiguration userId={userId} /></div>
    <PreferenceFeedback error={error} onReset={reset} />
  </section>;
}
