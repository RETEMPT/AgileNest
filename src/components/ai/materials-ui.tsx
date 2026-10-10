"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Copy, Download, FileText, Image as ImageIcon, ListTree, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { getMaterial } from "./material-store";
import { csvPreview, findTextLines, formatBytes, organizeMaterial, textOutline, type LocalMaterial, type MaterialRef } from "./materials";

export function MaterialChips({items,onOpen,onRemove}: {items:MaterialRef[];onOpen:(item:MaterialRef) => void;onRemove?:(item:MaterialRef) => void}) {
  return <div className="custom-scrollbar flex gap-2 overflow-x-auto py-1">{items.map((item) => <div key={item.id} className="panel-enter flex w-48 shrink-0 items-center gap-2 rounded-xl border border-border bg-background/60 p-2">
    <button type="button" onClick={() => onOpen(item)} className="ui-press flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">{item.kind === "image" ? <ImageIcon size={17} /> : <FileText size={17} />}</span><span className="min-w-0"><span className="block truncate text-xs font-medium" title={item.name}>{item.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{formatBytes(item.size)} · {item.kind === "text" ? "已读取" : "预览"}</span></span></button>
    {onRemove && <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`移除资料：${item.name}`} onClick={() => onRemove(item)}><X size={12} /></Button>}
  </div>)}</div>;
}

export type MaterialsMode = {kind:"browse" | "organize";id?:string} | {kind:"paste"};
export function MaterialsDialog({mode,onClose,items,userId,importError,importing,onImport,onAttachText,onPick}: {
  mode:MaterialsMode | null;onClose:() => void;items:MaterialRef[];userId:string;
  importError:string;importing:boolean;onImport:(files:File[]) => Promise<boolean>;onAttachText:(text:string) => string | null;onPick:() => void;
}) {
  const [selectedId,setSelectedId] = useState<string | undefined>(mode && "id" in mode ? mode.id : undefined);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  return <Dialog.Root open={mode !== null} onOpenChange={(open) => {if (!open) onClose();}}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay fixed inset-0 z-80 bg-black/35" />
    <Dialog.Content className={`ai-material-dialog fixed top-1/2 left-1/2 z-80 flex max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl ${mode?.kind !== "paste" ? "h-[80dvh]" : ""}`} onCloseAutoFocus={(event) => {event.preventDefault();document.getElementById("ai-draft-input")?.focus();}}>
      <div className="shrink-0 border-b border-border px-4 py-4 sm:px-5"><Dialog.Title className="pr-8 text-base font-semibold">{mode?.kind === "paste" ? "添加文本资料" : "会话资料"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">仅保存在此浏览器 · 不发送给模型</Dialog.Description><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭资料面板" className="absolute top-3 right-3 h-8 w-8"><X size={16} /></Button></Dialog.Close></div>
      {importError && <p role="alert" className="shrink-0 px-5 pt-3 text-xs text-destructive">{importError}</p>}
      {importing && <p role="status" className="shrink-0 px-5 pt-3 text-xs text-brand">正在读取并保存资料…</p>}
      {mode?.kind === "paste" ? <PasteMaterial onImport={onImport} onClose={onClose} /> : <>
        <div className="custom-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border p-3">
          {items.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`ui-press max-w-52 shrink-0 truncate rounded-lg px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === item.id ? "bg-brand-soft text-brand" : "hover:bg-accent"}`}>{item.name}</button>)}
          <Button variant="outline" size="sm" disabled={importing} className="h-8 shrink-0 text-xs" onClick={onPick}><Plus size={14} />添加文件</Button>
        </div>
        {selected ? <MaterialReader key={selected.id} item={selected} userId={userId} initialTab={mode?.kind === "organize" ? "outline" : "text"} onAttachText={onAttachText} /> : <div className="px-6 py-14 text-center"><FileText size={28} className="mx-auto text-brand" /><p className="mt-4 text-sm">添加资料后，可在这里读取和整理内容</p><p className="mt-2 text-xs text-muted-foreground">文本、Markdown、CSV、JSON、代码、PDF 和图片</p><Button className="mt-5" onClick={onPick}>选择文件</Button></div>}
      </>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

function PasteMaterial({onImport,onClose}: {onImport:(files:File[]) => Promise<boolean>;onClose:() => void}) {
  const id = useId();
  const [name,setName] = useState("");
  const [text,setText] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  return <form className="custom-scrollbar space-y-4 overflow-y-auto p-4 sm:p-5" onSubmit={async (event) => {
    event.preventDefault();setBusy(true);setError("");
    const ok = await onImport([new File([text],`${name.trim() || "粘贴资料"}.txt`,{type:"text/plain"})]);
    setBusy(false);if (ok) onClose();else setError("添加失败，内容已保留。请查看工作区错误提示后重试。");
  }}>
    <div className="space-y-2"><Label htmlFor={`${id}-name`}>资料名称</Label><Input id={`${id}-name`} value={name} maxLength={180} placeholder="例如：课题需求" onChange={(event) => setName(event.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor={`${id}-text`}>资料正文</Label><Textarea id={`${id}-text`} value={text} maxLength={1000000} onChange={(event) => setText(event.target.value)} placeholder="粘贴需要整理的内容…" className="h-60 resize-y text-sm leading-6" /></div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{text.length.toLocaleString()} / 1,000,000 字</span><Button disabled={busy || !text.trim()} type="submit">{busy ? "保存中…" : "添加资料"}</Button></div>
  </form>;
}

function MaterialReader({item,userId,initialTab,onAttachText}: {item:MaterialRef;userId:string;initialTab:"text" | "outline";onAttachText:(text:string) => string | null}) {
  const [loaded,setLoaded] = useState<{material:LocalMaterial;url:string} | null>(null);
  const [error,setError] = useState("");
  const [generation,setGeneration] = useState(0);
  const [feedback,setFeedback] = useState("");
  useEffect(() => {
    let cancelled = false, url = "";
    getMaterial(userId,item.id).then((material) => {
      if (cancelled) return;
      url = URL.createObjectURL(material.blob);setLoaded({material,url});setError("");
    }).catch((error:unknown) => {if (!cancelled) setError(error instanceof Error ? error.message : "资料读取失败");});
    return () => {cancelled = true;if (url) URL.revokeObjectURL(url);};
  }, [item.id,userId,generation]);
  async function copy(text:string) {
    try {await navigator.clipboard.writeText(text);setFeedback("已复制");}
    catch {setFeedback("复制失败，可选择原文手动复制");}
  }
  if (error) return <div className="p-6"><p role="alert" className="text-sm text-destructive">{error}</p><Button className="mt-4" variant="outline" onClick={() => setGeneration((value) => value+1)}>重试读取</Button></div>;
  if (!loaded) return <p role="status" className="p-6 text-sm text-muted-foreground">正在读取资料…</p>;
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5"><p className="min-w-0 truncate text-xs text-muted-foreground">{formatBytes(item.size)}{item.kind !== "text" && " · 浏览器预览，尚未提取正文"}</p><div className="flex items-center gap-3"><span role="status" className="text-xs text-brand">{feedback}</span><a href={loaded.url} download={item.name} className="ui-press inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Download size={14} />下载原文件</a></div></div>
    {item.kind === "text" ? <TextMaterial item={item} text={loaded.material.text!} initialTab={initialTab} onCopy={copy} onAttachText={onAttachText} /> : <div className="custom-scrollbar min-h-0 overflow-auto p-4 sm:p-5">{item.kind === "image" ? <Image src={loaded.url} alt={item.name} unoptimized width={1200} height={900} className="mx-auto max-h-[60dvh] max-w-full rounded-lg object-contain" /> : <PdfMaterial item={item} url={loaded.url} />}</div>}
  </div>;
}

function PdfMaterial({item,url}: {item:MaterialRef;url:string}) {
  const [canPreview] = useState(() => navigator.pdfViewerEnabled);
  return <div>
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/50 p-4"><FileText size={24} className="shrink-0 text-brand" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{canPreview ? "下方使用浏览器 PDF 预览；若未显示，可下载原文件阅读。" : "当前浏览器不支持内嵌 PDF，可下载原文件阅读。"}</p></div><a href={url} download={item.name} className="ui-press rounded-lg bg-brand px-3 py-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">下载 PDF</a></div>
    {canPreview && <object aria-label={`PDF 预览：${item.name}`} data={url} type="application/pdf" className="h-[55dvh] w-full rounded-lg border border-border"><p className="p-5 text-sm text-muted-foreground">浏览器无法显示此 PDF，请使用上方下载入口阅读。</p></object>}
  </div>;
}

function TextMaterial({item,text,initialTab,onCopy,onAttachText}: {item:MaterialRef;text:string;initialTab:"text" | "outline";onCopy:(text:string) => void;onAttachText:(text:string) => string | null}) {
  const [tab,setTab] = useState<"text" | "outline" | "table">(initialTab);
  const [query,setQuery] = useState("");
  const [page,setPage] = useState(0);
  const [formatted,setFormatted] = useState<string | null>(null);
  const [error,setError] = useState("");
  const content = formatted ?? text;
  const lines = useMemo(() => content.split("\n"),[content]);
  const search = useMemo(() => findTextLines(content,query),[content,query]);
  const outline = useMemo(() => textOutline(content),[content]);
  const organized = useMemo(() => {try {return {text:organizeMaterial(item.name,content),error:""};} catch (error) {return {text:"",error:error instanceof Error ? error.message : "无法整理此资料"};}},[item.name,content]);
  const table = useMemo(() => {if (!/\.(csv|tsv)$/i.test(item.name)) return null;try {return csvPreview(text,/\.tsv$/i.test(item.name) ? "\t" : ",");} catch {return null;}},[item.name,text]);
  const totalPages = Math.ceil(lines.length / 100);
  const currentPage = Math.min(page,totalPages-1);
  const goTo = (line:number) => {setQuery("");setPage(Math.floor((line-1)/100));setTab("text");};
  const tabClass = (value:typeof tab) => `ui-press rounded-lg px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === value ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-accent"}`;
  return <>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"><div className="flex gap-1" role="group" aria-label="资料视图"><button type="button" aria-pressed={tab === "text"} className={tabClass("text")} onClick={() => setTab("text")}>原文</button><button type="button" aria-pressed={tab === "outline"} className={tabClass("outline")} onClick={() => setTab("outline")}>目录与结构</button>{table && <button type="button" aria-pressed={tab === "table"} className={tabClass("table")} onClick={() => setTab("table")}>表格</button>}</div><span className="text-xs text-muted-foreground">{content.length.toLocaleString()} 字 · {lines.length.toLocaleString()} 行</span></div>
    {tab === "text" && <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3 sm:px-5"><div className="relative min-w-32 flex-1"><Search size={14} className="absolute top-2.5 left-3 text-muted-foreground" /><Input aria-label="搜索资料正文" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="搜索正文…" className="h-9 pl-9 text-xs" /></div>{/\.json$/i.test(item.name) && <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => {try {setFormatted(JSON.stringify(JSON.parse(text),null,2));setPage(0);setError("");} catch {setError("JSON 格式无效，请检查原文");}}}>格式化 JSON</Button>}<Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => onCopy(content)}><Copy size={14} />复制全文</Button></div>}
    {(error || organized.error) && <p role="alert" className="px-5 pb-3 text-xs text-destructive">{error || organized.error}</p>}
    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto border-t border-border bg-background/40 p-4 sm:p-5">
      {tab === "text" && (query.trim() ? <><p className="mb-3 text-xs text-muted-foreground">匹配 {search.count} 行{search.count > 200 && "，显示前 200 条"}</p><div className="space-y-2">{search.matches.map((match) => <button type="button" key={match.line} className="ui-press block w-full rounded-lg border border-border bg-card p-3 text-left text-xs leading-6 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => goTo(match.line)}><span className="mr-3 text-brand">第 {match.line} 行</span><span className="break-all">{match.text}</span></button>)}</div></> : <pre className="text-xs leading-6">{lines.slice(currentPage*100,currentPage*100+100).map((line,index) => <div key={index} className="flex"><span className="mr-4 w-10 shrink-0 select-none text-right text-muted-foreground/60">{currentPage*100+index+1}</span><span className="whitespace-pre-wrap break-all">{line.slice(0,2000)}{line.length > 2000 && " …（此行过长，复制全文查看）"}{!line && " "}</span></div>)}</pre>)}
      {tab === "outline" && <div className="space-y-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ListTree size={14} />按原文标题与字段整理</p><pre className="whitespace-pre-wrap break-words text-sm leading-7">{organized.text}</pre>{outline.length > 0 && <details className="ai-details border-t border-border pt-3"><summary className="cursor-pointer text-xs text-brand">跳转至章节</summary><div className="ai-details-body pt-2">{outline.map((entry) => <button type="button" key={entry.line} className="ui-press block rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={() => goTo(entry.line)}>{entry.title}<span className="ml-2 text-muted-foreground">{entry.line}</span></button>)}</div></details>}</div>}
      {tab === "table" && table && <><p className="mb-3 text-xs text-muted-foreground">{table.count} 行（含表头） · 最多 {table.columns} 列 · 预览前 50 行、20 列</p><table className="w-full border-collapse text-xs"><thead><tr>{table.rows[0]?.slice(0,20).map((cell,index) => <th key={index} className="min-w-24 border border-border bg-brand-soft p-2 text-left font-medium">{cell.slice(0,500)}</th>)}</tr></thead><tbody>{table.rows.slice(1).map((row,index) => <tr key={index}>{row.slice(0,20).map((cell,column) => <td key={column} className="max-w-64 whitespace-pre-wrap break-words border border-border bg-card p-2">{cell.slice(0,500)}</td>)}</tr>)}</tbody></table></>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-3 sm:px-5">{tab === "text" && !query.trim() ? <div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="资料上一页" disabled={currentPage === 0} onClick={() => setPage(currentPage-1)}><ChevronLeft size={15} /></Button><span className="text-xs text-muted-foreground">{currentPage+1} / {totalPages} 页</span><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="资料下一页" disabled={currentPage+1 >= totalPages} onClick={() => setPage(currentPage+1)}><ChevronRight size={15} /></Button></div> : <span className="text-xs text-muted-foreground">原文件保留完整内容</span>}{tab === "outline" && <div className="flex gap-2"><Button variant="outline" size="sm" className="h-8 text-xs" disabled={!organized.text} onClick={() => onCopy(organized.text)}>复制目录</Button><Button size="sm" className="h-8 text-xs" disabled={!organized.text} onClick={() => setError(onAttachText(organized.text) ?? "")}>加入输入框</Button></div>}</div>
  </>;
}
