import Link from "next/link";
import { ArrowDown, ArrowRight, Bell, Bot, ChartNoAxesCombined, Check, Code2, FileText, FolderOpen, GitBranch, History, ListTree, Plus, Search, type LucideIcon } from "lucide-react";
import { GuideIcon } from "@/components/icons";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findTransition, TRANSITIONS } from "@/modules/tasks/client";

const chapters = [
  { id: "tasks", title: "任务与验收", icon: FileText },
  { id: "files", title: "资料与文件", icon: FolderOpen },
  { id: "dependencies", title: "任务先后", icon: GitBranch },
  { id: "contribution", title: "成员贡献", icon: ChartNoAxesCombined },
  { id: "ai", title: "AI 与配置", icon: Bot },
  { id: "notifications", title: "消息与关注", icon: Bell },
] as const;

function ChapterTitle({ id, title, icon: Icon, children }: { id: string; title: string; icon: LucideIcon; children: React.ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-44 space-y-5 rounded-2xl border border-border bg-card p-5 sm:scroll-mt-32 sm:p-7 lg:scroll-mt-24">
    <h2 id={`${id}-heading`} className="flex items-center gap-3 text-lg font-semibold"><span className="rounded-lg bg-brand-soft p-2 text-brand"><Icon size={20} aria-hidden="true" /></span>{title}</h2>
    {children}
  </section>;
}

function TaskFlowFigure() {
  const actions = ["claim", "submit", "accept"] as const;
  const rules = actions.map((action) => TRANSITIONS.find((rule) => rule.action === action)!);
  const statuses = [rules[0].from[0], ...rules.map((rule) => rule.to)];
  const steps = ["选择负责人", "完成任务目标", "逐项核对成果", "保留通过版本"];
  const rejected = findTransition("reject", "submitted")!;
  const resubmit = findTransition("resubmit", rejected.to)!;
  return <figure aria-label="任务流程图例" className="space-y-4 rounded-xl bg-background p-4 sm:p-5">
    <figcaption className="text-xs font-medium text-muted-foreground">流程图例 · 从认领到验收</figcaption>
    <ol className="grid gap-3 sm:grid-cols-4">
      {statuses.map((status, index) => <li key={status} className="relative space-y-3 rounded-xl border border-border bg-card p-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{index + 1}</span>
        <StatusPill status={status} />
        <p className="text-sm">{steps[index]}</p>
        {rules[index] && <p className="flex items-center gap-2 text-xs font-medium text-brand">{rules[index].label}<ArrowRight size={14} aria-hidden="true" /></p>}
      </li>)}
    </ol>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs">
      <StatusPill status={rejected.from[0]} /><span>{rejected.label}</span><ArrowRight size={14} aria-hidden="true" /><StatusPill status={rejected.to} /><span>按意见修改</span><span className="inline-flex items-center gap-1 text-brand">{resubmit.label}<ArrowRight size={14} aria-hidden="true" /></span><StatusPill status={resubmit.to} />
    </div>
  </figure>;
}

function FileBrowserFigure() {
  return <figure aria-label="资料文件浏览图例" className="overflow-hidden rounded-xl border border-border">
    <figcaption className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3 text-xs"><span className="font-medium">资料浏览示意</span><span className="text-muted-foreground">示例文件</span></figcaption>
    <div className="grid sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="space-y-3 border-b border-border bg-background/60 p-4 sm:border-r sm:border-b-0">
        <p className="flex items-center gap-2 text-sm font-medium"><FolderOpen size={16} aria-hidden="true" />研究材料</p>
        <p className="flex items-center gap-2 pl-5 text-xs text-muted-foreground"><FolderOpen size={15} aria-hidden="true" />第一轮访谈</p>
        <p className="flex items-center gap-2 rounded-md bg-brand-soft px-2 py-2 text-xs text-brand"><FileText size={15} aria-hidden="true" />访谈提纲.md</p>
        <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground"><FileText size={15} aria-hidden="true" />原始数据.csv</p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs"><span className="inline-flex items-center gap-2"><FileText size={15} aria-hidden="true" />访谈提纲.md</span><span className="text-muted-foreground">版本 v2</span></div>
        <div className="flex gap-3 border-b border-border px-4 py-2 text-xs"><span className="rounded-md bg-brand-soft px-2 py-1 text-brand">预览</span><span className="inline-flex items-center gap-1 px-2 py-1 text-muted-foreground"><Code2 size={13} aria-hidden="true" />源码</span></div>
        <div className="space-y-3 p-4"><p className="text-base font-semibold">访谈目标</p><p className="text-sm text-muted-foreground">明确研究问题，收集可核对的证据。</p><div className="flex items-center gap-2 text-sm"><Check size={15} aria-hidden="true" className="text-brand" />记录资料来源</div></div>
      </div>
    </div>
    <ol className="grid gap-3 border-t border-border bg-background p-4 text-xs sm:grid-cols-3">
      {["打开目录，选择文件", "预览读排版，源码查行号", "下载原件；文档可看历史"].map((step, index) => <li key={step} className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">{index + 1}</span><span className="pt-0.5 leading-5">{step}</span></li>)}
    </ol>
  </figure>;
}

function DependencyFigure() {
  return <figure aria-label="任务先后图例" className="rounded-xl bg-background p-4 sm:p-5">
    <figcaption className="mb-4 text-xs font-medium text-muted-foreground">示意 · 报告需要先核对原始资料</figcaption>
    <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">先完成这项任务</p><p className="text-sm font-medium">整理访谈数据</p><StatusPill status="in_progress" /></div>
      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground"><ArrowRight size={22} aria-hidden="true" className="hidden sm:block" /><ArrowDown size={22} aria-hidden="true" className="sm:hidden" /><span>通过后再提交</span></div>
      <div className="space-y-2 rounded-xl border border-brand/25 bg-card p-4"><p className="text-xs text-muted-foreground">当前任务</p><p className="text-sm font-medium">撰写调研报告</p><span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200"><GitBranch size={13} aria-hidden="true" />等待其他任务验收</span></div>
    </div>
  </figure>;
}

function MilestoneFigure() {
  return <figure aria-label="里程碑任务树图例" className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
    <figcaption className="flex items-center gap-2 text-sm font-medium"><ListTree size={18} aria-hidden="true" />里程碑 · 中期报告（示意）</figcaption>
    <div className="grid gap-3 sm:grid-cols-2">{[
      { title: "调研模块", tasks: ["整理访谈数据", "核对需求范围"] },
      { title: "报告模块", tasks: ["撰写报告正文", "整理引用附件"] },
    ].map((module, index) => <div key={module.title} className="rounded-lg border border-brand/20 bg-background p-3"><p className="flex items-center justify-between gap-2 text-sm font-medium"><span>{module.title}</span><span className="text-xs text-brand">{index === 0 ? "2/2" : "0/2"} 子任务已验收</span></p><ul className="ml-2 mt-3 space-y-3 border-l-2 border-brand/30 pl-4">{module.tasks.map((task) => <li key={task} className="flex flex-wrap items-center gap-2 text-xs">{task}<StatusPill status={index === 0 ? "accepted" : "in_progress"} /></li>)}</ul></div>)}</div>
    <p className="text-xs leading-6 text-muted-foreground">先选里程碑，再按模块查看任务。模块沿用主任务，每个模块可拆为一层子任务；没有子任务的工作也可单独显示。详情默认收起，点击任务查看或操作，搜索时展示相关路径。</p>
    <p className="text-xs leading-6 text-muted-foreground">模块的连接线表示“包含哪些任务”，阶段排列不表示必须依次执行。“先后顺序”单独展示已设置的任务关联；子任务全部通过后，模块主任务仍需单独验收。</p>
    <p className="text-xs leading-6 text-muted-foreground">需要新增时点击列表末尾的加号卡片：阶段列表新建里程碑，阶段内新增主任务，展开模块后新增子任务。弹窗会带入对应阶段或父任务；实际入口由当前权限和任务状态决定。</p>
    <p className="text-xs leading-6 text-muted-foreground">点击里程碑的“AI 规划任务”，填写目标后让模型生成或调整任务树。核对名称、验收要求和先后顺序，再点击“创建项目任务”。未确认的规划保存在此设备，确认创建的任务进入项目。</p>
  </figure>;
}

export function GuideView() {
  return <div className="mx-auto max-w-6xl space-y-6 pb-8">
    <header className="rounded-2xl border border-brand/15 bg-brand-soft/40 p-6 sm:p-8">
      <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-brand"><GuideIcon size={20} aria-hidden="true" />AgileNest 协作手册</div>
      <h1 className="text-2xl font-semibold sm:text-3xl">使用指引</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">用图例了解任务、资料和协作入口。选择下面的主题，快速找到需要的操作。</p>
    </header>
    <nav aria-label="指引章节" className="sticky top-0 z-10 grid grid-cols-2 gap-2 rounded-xl border border-border bg-card/95 p-3 backdrop-blur-sm sm:grid-cols-3 lg:grid-cols-6">
      {chapters.map(({ id, title, icon: Icon }) => <a key={id} href={`#${id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon size={16} aria-hidden="true" className="shrink-0" />{title}</a>)}
    </nav>
    <ChapterTitle id="tasks" title="任务与验收" icon={FileText}>
      <p className="text-sm leading-6 text-muted-foreground">点击任务的文件图标或标题查看详情；提交时填写完成说明，附上成果并逐项自检。</p>
      <TaskFlowFigure />
      <MilestoneFigure />
      <p className="text-xs leading-6 text-muted-foreground">图例展示基本流程。实际可用操作由你的职务、负责人及其他任务的完成情况决定；通过版本会保留，后续调整须先重新打开。</p>
      <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"><FileText size={18} aria-hidden="true" className="text-brand" /><span>任务图标 / 标题</span><ArrowRight size={14} aria-hidden="true" /><span>查看目标、验收要求与成果记录</span></div>
    </ChapterTitle>
    <ChapterTitle id="files" title="资料与文件" icon={FolderOpen}>
      <FileBrowserFigure />
      <div className="grid gap-3 sm:grid-cols-2"><p className="text-sm leading-6 text-muted-foreground">Markdown 可读排版，也可切到源码按行查阅。搜索支持名称、标签和已保存的文本正文。</p><p className="text-sm leading-6 text-muted-foreground">回收资料可恢复；已有成果或讨论引用的资料受保护。PDF、图片没有转换正文时提供原件预览。</p></div>
    </ChapterTitle>
    <ChapterTitle id="dependencies" title="任务先后" icon={GitBranch}>
      <DependencyFigure />
      <p className="text-sm leading-6 text-muted-foreground">“等待其他任务验收”表示需要先完成的工作还没通过验收。当前任务仍可执行，提交、重交和验收要等这些任务全部通过；在详情里可查看具体任务及状态。</p>
    </ChapterTitle>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <ChapterTitle id="contribution" title="成员贡献" icon={ChartNoAxesCombined}>
        <figure aria-label="成员贡献图例" className="space-y-4 rounded-xl bg-background p-4"><figcaption className="text-xs text-muted-foreground">示意数据 · 按当前负责人统计</figcaption><div className="flex justify-between gap-2 text-sm font-medium"><span>示例成员 · 4 项任务</span><span>完成率 50%</span></div><div aria-hidden="true" className="h-2 rounded-full bg-muted"><div className="h-2 w-1/2 rounded-full bg-brand" /></div><div className="flex flex-wrap gap-2"><StatusPill status="accepted" /><span className="text-xs">2 项</span><StatusPill status="submitted" /><span className="text-xs">1 项</span><StatusPill status="in_progress" /><span className="text-xs">1 项</span></div></figure>
        <p className="text-sm leading-6 text-muted-foreground">展开成员查看任务、状态和截止日期。管理员、副管理员和指导老师查看全员，普通成员查看本人；项目完成度只统计顶层任务。</p>
      </ChapterTitle>
      <ChapterTitle id="ai" title="AI 与配置" icon={Bot}>
        <figure aria-label="AI 资料引用图例" className="rounded-xl bg-background p-4"><figcaption className="mb-4 text-xs text-muted-foreground">从资料到对话</figcaption><ol className="space-y-3">{[{ icon: FolderOpen, text: "选择会话项目和检索范围" }, { icon: Plus, text: "直接提问，或添加文件文字" }, { icon: FileText, text: "展开资料来源，核对版本与位置" }].map(({ icon: Icon, text }, index) => <li key={text} className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{index + 1}</span><Icon size={17} aria-hidden="true" className="text-brand" /><span className="text-sm">{text}</span></li>)}</ol></figure>
        <p className="text-sm leading-6 text-muted-foreground">模型仅在个人设置中配置。点击“添加 API 服务商”，填写地址、模型和 API Key，选择接口格式；可保存最多12项。保存后点击“使用此服务”，对话和规划才会使用它。“保存并测试”验证该服务的真实回复，不会替你切换当前使用项。已有密钥不会回显，配置导出不含密钥。</p>
        <p className="text-xs leading-6 text-muted-foreground">服务商、密钥和模型参数按账户加密保存在服务器，不缓存到浏览器。对话与附件副本仍保存在当前浏览器，清除浏览器数据会删除；项目中已创建的任务保留。</p>
        <p className="text-xs leading-6 text-muted-foreground">选择检索范围后直接提问，AI可按需查阅当前项目或全部有权访问的资料、任务与里程碑，回答附来源。可随时停止，来源详情默认收起。上传PPTX/DOCX可提取文字；图片/PDF仅预览，旧PPT需先转换。上传文件先由服务器提取，选择文字并发送后才交给模型。</p>
        <p className="text-xs leading-6 text-muted-foreground">“插件库”集中显示内置工具、快捷提问和外部MCP服务，开关按账户保存；关闭工具会停止后续调用。PPTX/DOCX文字提取可供纯文本模型使用；识图、转录等需要连接实际具备对应能力的服务，MCP连接本身不代表已具备这些能力。</p>
        <p className="text-xs leading-6 text-muted-foreground">聊天内容或已有任务简介可加入规划目标，先预览再确认创建。回复中的建议卡片默认不选中；展开方案与影响后，可选择建议进入新任务规划。任务详情中的AI建议可展示路线、待确认问题和可选需求扩展；勾选标题或背景修改后再次确认才会保存，已有验收要求和状态不随建议改变。</p>
        <p className="text-xs leading-6 text-muted-foreground">加号菜单可打开“AI 规划任务”。模型生成后先核对，再确认创建；部分创建失败时保留实际结果，可重试未完成项。AI不会自动修改已有任务或代替老师验收。</p>
        <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">怎样把需求和验收要求写清楚？</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6 text-muted-foreground"><li>在任务规划中展开“完善需求与验收要求（可选）”，点击“帮我澄清需求”。回答与目标、范围或异常情况有关的问题，再选择“将答复加入目标”。</li><li>生成或填写任务树后，点击“检查验收要求”。核对原句、问题原因和建议改写，只采用符合实际项目的内容；AI不能替你确定未提供的数字或业务规则。</li><li>这些检查不强制评分，也不阻止直接生成。已开始创建的批次不能再修改；新任务仍须按平台流程提交和验收。</li></ol></details>
        <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link href="/ai">打开 AI 工作区</Link></Button><Button asChild size="sm" variant="outline"><Link href="/settings?section=ai">模型配置</Link></Button></div>
      </ChapterTitle>
    </div>
    <ChapterTitle id="notifications" title="消息与关注" icon={Bell}>
      <div className="grid gap-3 sm:grid-cols-3">{[
        ["工作消息", "分工、提交、修改、验收与到期提醒", "同一事项优先显示最近一条。"],
        ["其他动态", "普通讨论、评论和资料更新", "需要时打开，不抢占工作气泡。"],
        ["全部消息", "完整的最近消息记录", "可结合“仅看未读”筛选。"],
      ].map(([title, description, hint]) => <div key={title} className="space-y-2 rounded-xl border border-border p-4"><p className="flex items-center gap-2 text-sm font-medium"><Bell size={16} aria-hidden="true" className="text-brand" />{title}</p><p className="text-sm leading-6 text-muted-foreground">{description}</p><p className="text-xs leading-5 text-muted-foreground">{hint}</p></div>)}</div>
      <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link href="/notifications">查看消息</Link></Button><Button asChild size="sm" variant="outline"><Link href="/settings?section=notifications">通知设置</Link></Button></div>
    </ChapterTitle>
    <section aria-labelledby="icons-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-7">
      <h2 id="icons-heading" className="mb-5 text-lg font-semibold">常用图标速查</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[
        { icon: FileText, title: "文件 / 任务详情", text: "打开文件正文或任务详情。" },
        { icon: FolderOpen, title: "资料目录", text: "进入主题或子文件夹。" },
        { icon: GitBranch, title: "任务先后", text: "查看先完成哪项、再做哪项。" },
        { icon: ListTree, title: "任务树", text: "查看主任务与子任务的拆分。" },
        { icon: Code2, title: "源码", text: "查看原始文本和行号。" },
        { icon: History, title: "历史版本", text: "查看旧版正文或成果记录。" },
        { icon: Search, title: "搜索", text: "缩小当前列表或正文范围。" },
      ].map(({ icon: Icon, title, text }) => <li key={title} className="flex items-start gap-3"><span className="rounded-lg bg-brand-soft p-2 text-brand"><Icon size={19} aria-hidden="true" /></span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></li>)}</ul>
      <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground"><GuideIcon size={19} aria-hidden="true" className="shrink-0 text-brand" />打开的手册图标，就是侧栏里的“使用指引”。</p>
    </section>
  </div>;
}
