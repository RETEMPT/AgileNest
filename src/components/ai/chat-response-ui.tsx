"use client";

import { useState } from "react";
import { Check, CheckCircle2, ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import type { ChatProgress, ChatResult } from "@/modules/ai/client";

export function safeChatSourceHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return undefined;
  try {
    const url = new URL(href, "https://agilenest.local");
    return /^\/(?:p|t)\/[a-f0-9-]{36}\/(?:resources|tasks|milestones|board)(?:\/[a-f0-9-]{36})?$/.test(url.pathname) ? href : undefined;
  } catch { return undefined; }
}

const PHASE_CONFIG: Record<
  ChatProgress["phase"],
  { label: string; iconBg: string; badgeText: string }
> = {
  intent: {
    label: "意图解析",
    iconBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    badgeText: "意图识别",
  },
  searching: {
    label: "资料检索",
    iconBg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    badgeText: "目录检索",
  },
  reading: {
    label: "正文核验",
    iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    badgeText: "内容读取",
  },
  tasks: {
    label: "工作治理",
    iconBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    badgeText: "任务治理",
  },
  planning: {
    label: "方案规划",
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    badgeText: "规划生成",
  },
  answering: {
    label: "生成响应",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    badgeText: "结构化响应",
  },
};

export function ChatWorkflowTrace({ progress, active = false }: { progress?: ChatProgress[]; active?: boolean }) {
  const [open, setOpen] = useState(active);
  if (!progress?.length) return null;

  return (
    <div className="my-3 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs p-3 shadow-xs transition-all hover:border-brand/30">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 text-left focus:outline-hidden"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-soft text-brand">
            <Sparkles size={12} className={active ? "animate-pulse" : ""} />
          </div>
          <span className="text-xs font-semibold text-foreground">工作链路</span>
          {active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
              <LoaderCircle size={10} className="animate-spin" />
              正在执行 · 第 {progress.length} 步
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={11} />
              已就绪 · 共 {progress.length} 步
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{open ? "收起" : "展开详情"}</span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="relative mt-3 pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-border/80">
          {progress.map((item, index) => {
            const isLatest = index === progress.length - 1;
            const config = PHASE_CONFIG[item.phase] || PHASE_CONFIG.answering;
            return (
              <div key={index} className="relative flex items-start gap-2.5 text-xs">
                <div
                  className={`absolute -left-6 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-[10px] font-semibold ${
                    isLatest && active
                      ? "border-brand text-brand ring-2 ring-brand/20 animate-pulse"
                      : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                  }`}
                >
                  {isLatest && active ? <LoaderCircle size={11} className="animate-spin" /> : <Check size={11} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${config.iconBg}`}>
                      {item.stepTitle || config.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">STEP 0{index + 1}</span>
                  </div>
                  <p className="mt-1 font-sans text-xs leading-relaxed break-words text-foreground/85">
                    {item.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChatProgressList({ progress, active = false }: { progress: ChatProgress[]; active?: boolean }) {
  return <ChatWorkflowTrace progress={progress} active={active} />;
}

export function ChatSources({ sources, workSources, toolSources, retrieval }: { sources?: ChatResult["sources"]; workSources?: ChatResult["workSources"]; toolSources?: ChatResult["toolSources"]; retrieval?: ChatResult["retrieval"] }) {
  if (!retrieval && !sources?.length && !workSources?.length && !toolSources?.length) return null;
  return <details className="mt-3 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs"><summary className="cursor-pointer text-muted-foreground">资料来源与检索记录 · {(sources?.length ?? 0) + (workSources?.length ?? 0) + (toolSources?.length ?? 0)} 项</summary><div className="mt-3 space-y-3">{retrieval && <p className="leading-5 text-muted-foreground">已检索 {retrieval.searchedScopes} 个范围，命中 {retrieval.matchedResources} 份，读取 {retrieval.readResources} 份。{retrieval.truncated && "已达到本次读取上限，可缩小范围继续询问。"}</p>}{sources?.map((source, index) => <div key={`${source.resourceId}:${source.version}:${index}`} className="min-w-0"><a href={safeChatSourceHref(source.href)} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-brand underline underline-offset-4">[{index + 1}] {source.title} · v{source.version}{source.location ? ` · ${source.location}` : ""}</a><p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{source.excerpt}</p></div>)}{workSources?.map((source) => <div key={`${source.kind}:${source.id}`}><a href={safeChatSourceHref(source.href)} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-brand underline underline-offset-4">{source.kind === "task" ? "任务" : "里程碑"} · {source.title}</a><p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{source.excerpt}</p></div>)}{toolSources?.map((source, index) => <div key={`${source.serverId}:${source.toolName}:${index}`}><p className="break-words font-medium text-brand">[工具来源{index + 1}] {source.serverName} · {source.toolName}</p><p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{source.excerpt}</p>{source.truncated && <p className="text-[11px] text-muted-foreground">仅展示工具返回内容节选</p>}</div>)}{!sources?.length && !workSources?.length && !toolSources?.length && <p className="text-muted-foreground">本次未读取可引用正文；回复中的其他内容请自行核对。</p>}</div></details>;
}

