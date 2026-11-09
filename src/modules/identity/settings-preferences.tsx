"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Check, Image as ImageIcon, Monitor, Moon, Sun, MessageSquare, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiPreferences } from "@/components/preferences";
import { openAiFloating } from "@/components/ai/floating";
import { AiConfiguration } from "@/components/ai/configuration";

function processBackgroundImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法解析该图片"));
      image.onload = () => {
        const maxWidth = 1920;
        const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) { reject(new Error("当前浏览器不支持图片处理")); return; }
        context.drawImage(image, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          reject(new Error("图片过大或格式不支持，请换一张图片"));
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function PreferenceFeedback({ error, onReset }: { error: string | null; onReset: () => void }) {
  return error ? <div role="alert" className="mt-6 flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={onReset}>重置偏好</Button></div> : <p role="status" className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><Check size={14} />偏好立即生效，保存在当前账号的浏览器中。</p>;
}

export function AppearanceSettings({ userId }: { userId: string }) {
  const { preferences, update, error, reset } = useUiPreferences(userId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [skinMessage, setSkinMessage] = useState("");

  async function handleSkinPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setSkinMessage("请选择图片文件"); return; }
    setSkinMessage("正在处理图片…");
    try {
      const dataUrl = await processBackgroundImage(file);
      update({ backgroundImage: dataUrl });
      setSkinMessage("背景已更新，可在下方移除。");
    } catch (err) {
      setSkinMessage(err instanceof Error ? err.message : "图片处理失败");
    }
  }

  return <section>
    <h2 className="text-xl font-semibold">主题外观</h2>
    <p className="mt-2 text-sm text-muted-foreground">选择工作区的显示风格，并管理日夜切换、护眼模式与背景皮肤。</p>
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

    <fieldset className="mt-8"><legend className="mb-3 text-sm font-medium">日夜切换</legend>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">开启后按时间自动切换浅色与深色，优先级高于上方「颜色主题」。</p>
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-4">
        <span><span className="block text-sm font-medium">自动切换日夜模式</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">默认晚上 18:00 进入深色，早上 08:00 回到浅色。</span></span>
        <input type="checkbox" role="switch" aria-label="自动切换日夜模式" checked={preferences.autoTheme} onChange={(event) => update({ autoTheme: event.target.checked })} className="h-5 w-5 shrink-0 accent-brand" />
      </label>
      {preferences.autoTheme && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-medium">进入日间（浅色）</span><input type="time" value={preferences.dayStart} onChange={(event) => update({ dayStart: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium">进入夜间（深色）</span><input type="time" value={preferences.nightStart} onChange={(event) => update({ nightStart: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
        </div>
      )}
    </fieldset>

    <fieldset className="mt-8"><legend className="mb-3 text-sm font-medium">护眼模式</legend>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">在设定时间段内为页面叠加柔和暖色滤镜，减少夜间蓝光刺激。</p>
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-4">
        <span><span className="block text-sm font-medium">定时开启护眼模式</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">默认 21:00 开启，次日 07:00 关闭。</span></span>
        <input type="checkbox" role="switch" aria-label="定时开启护眼模式" checked={preferences.eyeCare} onChange={(event) => update({ eyeCare: event.target.checked })} className="h-5 w-5 shrink-0 accent-brand" />
      </label>
      {preferences.eyeCare && (
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-medium">开始时间</span><input type="time" value={preferences.eyeCareStart} onChange={(event) => update({ eyeCareStart: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium">结束时间</span><input type="time" value={preferences.eyeCareEnd} onChange={(event) => update({ eyeCareEnd: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
          </div>
          <label className="block space-y-2">
            <span className="flex items-center justify-between text-xs font-medium"><span>滤镜强度</span><span className="tabular-nums text-muted-foreground">{preferences.eyeCareStrength}%</span></span>
            <input type="range" min={0} max={100} step={5} value={preferences.eyeCareStrength} onChange={(event) => update({ eyeCareStrength: Number(event.target.value) })} aria-label="护眼滤镜强度" className="w-full accent-brand" />
          </label>
        </div>
      )}
    </fieldset>

    <fieldset className="mt-8"><legend className="mb-3 text-sm font-medium">更换皮肤（背景图片）</legend>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">从电脑选择一张图片作为网站背景。图片会在浏览器本地压缩后保存，不会上传到服务器。</p>
      <div className="flex flex-wrap items-center gap-4">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleSkinPick} className="hidden" />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><ImageIcon className="h-4 w-4" />选择图片</Button>
        {preferences.backgroundImage && (<>
          <img src={preferences.backgroundImage} alt="当前背景预览" className="h-16 w-28 rounded-lg border border-border object-cover" />
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { update({ backgroundImage: null }); setSkinMessage("背景已移除。"); }}>移除背景</Button>
        </>)}
      </div>
      {skinMessage && <p role="status" className="mt-2 text-xs text-muted-foreground">{skinMessage}</p>}
    </fieldset>

    <PreferenceFeedback error={error} onReset={reset} />
  </section>;
}

export function AiSettings({ userId }: { userId: string }) {
  const { preferences, update, error, reset } = useUiPreferences(userId);
  return <section>
    <h2 className="text-xl font-semibold">AI 助手</h2>
    <p className="mt-2 text-sm text-muted-foreground">在此统一管理模型服务，并选择用于对话与任务规划的当前服务。</p>
    <div className="mt-8 rounded-xl border border-border">
      <label className="flex cursor-pointer items-center justify-between gap-5 p-5">
        <span className="flex items-start gap-3"><MessageSquare size={20} className="mt-0.5 shrink-0 text-brand" /><span><span className="block text-sm font-medium">协作中心内的 AI 助手</span><span className="mt-1.5 block text-xs leading-5 text-muted-foreground">在协作中心继续对话，与完整 AI 工作区共用当前浏览器的对话内容。使用前请先配置模型并测试连接。</span></span></span>
        <input type="checkbox" role="switch" aria-label="启用协作中心内的 AI 助手" checked={preferences.aiFloating} onChange={(event) => update({ aiFloating: event.target.checked })} className="h-5 w-5 shrink-0 accent-brand" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-background/50 px-5 py-4"><p className="text-xs text-muted-foreground">消息与 AI 共用右下角入口，也可前往完整工作区。</p><Button variant="outline" size="sm" disabled={!preferences.aiFloating} onClick={openAiFloating}><PanelRightOpen size={15} />打开协作中心 AI</Button></div>
    </div>
    <div className="mt-8"><AiConfiguration userId={userId} /></div>
    {error ? <PreferenceFeedback error={error} onReset={reset} /> : <p role="status" className="mt-6 text-xs text-muted-foreground">API 服务商、密钥和插件开关按账号保存在服务器；页面显示偏好与会话保存在当前浏览器中。</p>}
  </section>;
}
