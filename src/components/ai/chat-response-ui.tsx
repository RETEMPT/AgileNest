"use client";

import type { ChatProgress, ChatResult } from "@/modules/ai/client";

export function safeChatSourceHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return undefined;
  try {
    const url = new URL(href, "https://agilenest.local");
    return /^\/(?:p|t)\/[a-f0-9-]{36}\/(?:resources|tasks|milestones)(?:\/[a-f0-9-]{36})?$/.test(url.pathname) ? href : undefined;
  } catch { return undefined; }
}

export function ChatProgressList({ progress }: { progress: ChatProgress[] }) {
  return progress.length ? <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">查看处理记录 · {progress.length} 步</summary><ol className="mt-2 list-decimal space-y-1 pl-5">{progress.map((item, index) => <li key={index}>{item.message}</li>)}</ol></details> : null;
}

export function ChatSources({ sources, workSources, toolSources, retrieval }: { sources?: ChatResult["sources"]; workSources?: ChatResult["workSources"]; toolSources?: ChatResult["toolSources"]; retrieval?: ChatResult["retrieval"] }) {
  if (!retrieval && !sources?.length && !workSources?.length && !toolSources?.length) return null;
  return <details className="mt-3 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs"><summary className="cursor-pointer text-muted-foreground">资料来源与检索记录 · {(sources?.length ?? 0) + (workSources?.length ?? 0) + (toolSources?.length ?? 0)} 项</summary><div className="mt-3 space-y-3">{retrieval && <p className="leading-5 text-muted-foreground">已检索 {retrieval.searchedScopes} 个范围，命中 {retrieval.matchedResources} 份，读取 {retrieval.readResources} 份。{retrieval.truncated && "已达到本次读取上限，可缩小范围继续询问。"}</p>}{sources?.map((source, index) => <div key={`${source.resourceId}:${source.version}:${index}`} className="min-w-0"><a href={safeChatSourceHref(source.href)} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-brand underline underline-offset-4">[{index + 1}] {source.title} · v{source.version}{source.location ? ` · ${source.location}` : ""}</a><p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{source.excerpt}</p></div>)}{workSources?.map((source) => <div key={`${source.kind}:${source.id}`}><a href={safeChatSourceHref(source.href)} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-brand underline underline-offset-4">{source.kind === "task" ? "任务" : "里程碑"} · {source.title}</a><p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{source.excerpt}</p></div>)}{toolSources?.map((source, index) => <div key={`${source.serverId}:${source.toolName}:${index}`}><p className="break-words font-medium text-brand">[工具来源{index + 1}] {source.serverName} · {source.toolName}</p><p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{source.excerpt}</p>{source.truncated && <p className="text-[11px] text-muted-foreground">仅展示工具返回内容节选</p>}</div>)}{!sources?.length && !workSources?.length && !toolSources?.length && <p className="text-muted-foreground">本次未读取可引用正文；回复中的其他内容请自行核对。</p>}</div></details>;
}

