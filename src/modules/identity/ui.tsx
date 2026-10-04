"use client";

import { useActionState, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  LogIn,
  Plus,
  Trophy,
  Users,
  X,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectKind } from "@/db/schema";
import {
  createTeamAction,
  joinTeamAction,
  createProjectAction,
  type IdentityFormState,
} from "./actions";

export const SPACE_KINDS = [
  {
    id: "course",
    title: "课程协作",
    description: "课程小组、作业分工与成果验收",
    example: "软件工程课程组",
    icon: BookOpen,
  },
  {
    id: "lab",
    title: "实验室课题",
    description: "实验室成员、课题推进与导师反馈",
    example: "智能系统实验室",
    icon: FlaskConical,
  },
  {
    id: "contest",
    title: "竞赛战队",
    description: "备赛分工、交付追踪与成果确认",
    example: "创新竞赛战队",
    icon: Trophy,
  },
] as const;

function Feedback({ state }: { state: IdentityFormState }) {
  return (
    <div aria-live="polite">
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
    </div>
  );
}

function FormDialog({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7">
          <Dialog.Title className="pr-8 text-xl font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mb-6 mt-2 text-sm text-muted-foreground">
            {description}
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="关闭"
              className="absolute right-3 top-3"
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CreateTeamForm() {
  const [state, action, pending] = useActionState(createTeamAction, null);
  const [kind, setKind] = useState<ProjectKind>("course");
  const [name, setName] = useState("");
  const id = useId();
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-5"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">你们准备如何协作？</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SPACE_KINDS.map((item) => (
            <label
              key={item.id}
              className={`cursor-pointer rounded-xl border p-4 transition ${kind === item.id ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-border hover:bg-accent"}`}
            >
              <input
                type="radio"
                name="scenario"
                value={item.id}
                checked={kind === item.id}
                onChange={() => setKind(item.id)}
                className="sr-only peer"
              />
              <item.icon className="mb-3 h-6 w-6 text-brand peer-focus-visible:ring-2" />
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <label htmlFor={id} className="text-sm font-medium">
          团队名称
        </label>
        <Input
          id={id}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          placeholder={SPACE_KINDS.find((item) => item.id === kind)?.example}
        />
        <p className="text-xs text-muted-foreground">
          创建者拥有管理员职务，可继续创建项目并邀请成员。
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <Users className="h-4 w-4" />
        创建空间
        <ArrowRight className="h-3 w-3" />
        邀请成员
        <ArrowRight className="h-3 w-3" />
        建立项目
      </div>
      <Feedback state={state} />
      <Button disabled={pending} className="w-full">
        {pending ? "创建中…" : "创建团队，继续建立项目"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function JoinTeamForm() {
  const [state, action, pending] = useActionState(joinTeamAction, null);
  const [inviteCode, setInviteCode] = useState("");
  const id = useId();
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-4"
    >
      <div className="space-y-2">
        <label htmlFor={id} className="text-sm font-medium">
          团队邀请码
        </label>
        <Input
          id={id}
          name="inviteCode"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          required
          maxLength={30}
          placeholder="粘贴管理员分享的邀请码"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          加入后拥有队员职务；管理员可在成员页设置指导老师、队长等职务。
        </p>
      </div>
      <Feedback state={state} />
      <Button disabled={pending} className="w-full">
        {pending ? "加入中…" : "加入并查看团队项目"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function TeamEntryActions({ large = false }: { large?: boolean }) {
  return (
    <div className={`grid gap-3 ${large ? "sm:grid-cols-2" : "sm:flex"}`}>
      <FormDialog
        title="创建团队空间"
        description="设置团队名称与默认项目类型。"
        trigger={
          large ? (
            <button className="rounded-2xl border border-brand/30 bg-brand-soft p-6 text-left transition hover:shadow-sm">
              <Plus className="mb-4 h-7 w-7 text-brand" />
              <span className="block text-lg font-semibold">
                创建团队
              </span>
              <span className="mt-2 block text-sm text-muted-foreground">
                设置团队名称，邀请成员并创建项目
              </span>
            </button>
          ) : (
            <Button>
              <Plus className="h-4 w-4" />
              创建团队
            </Button>
          )
        }
      >
        <CreateTeamForm />
      </FormDialog>
      <FormDialog
        title="加入已有团队"
        description="填写团队邀请码。加入后由管理员设置职务。"
        trigger={
          large ? (
            <button className="rounded-2xl border border-border bg-card p-6 text-left transition hover:border-brand/40 hover:shadow-sm">
              <LogIn className="mb-4 h-7 w-7 text-brand" />
              <span className="block text-lg font-semibold">加入团队</span>
              <span className="mt-2 block text-sm text-muted-foreground">
                粘贴邀请码，直接参与团队项目
              </span>
            </button>
          ) : (
            <Button variant="outline">
              <LogIn className="h-4 w-4" />
              加入团队
            </Button>
          )
        }
      >
        <JoinTeamForm />
      </FormDialog>
    </div>
  );
}

export function ProjectForm({
  teamId,
  defaultKind = "course",
  allowedKinds = ["course", "lab", "contest"],
}: {
  teamId: string;
  defaultKind?: ProjectKind;
  allowedKinds?: ProjectKind[];
}) {
  const [state, action, pending] = useActionState(createProjectAction, null);
  const [kind, setKind] = useState<ProjectKind>(
    allowedKinds.includes(defaultKind) ? defaultKind : allowedKinds[0],
  );
  const [fields, setFields] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
  });
  const id = useId();
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-5"
    >
      <input type="hidden" name="teamId" value={teamId} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">项目类型</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SPACE_KINDS.filter((item) => allowedKinds.includes(item.id)).map(
            (item) => (
              <label
                key={item.id}
                className={`cursor-pointer rounded-xl border p-4 ${kind === item.id ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={item.id}
                  checked={kind === item.id}
                  onChange={() => setKind(item.id)}
                  className="peer sr-only"
                />
                <item.icon className="mb-2 h-5 w-5 text-brand peer-focus-visible:ring-2" />
                <span className="block text-sm font-semibold">
                  {item.title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.description}
                </span>
              </label>
            ),
          )}
        </div>
      </fieldset>
      <div className="space-y-2">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          项目名称
        </label>
        <Input
          id={`${id}-name`}
          name="name"
          value={fields.name}
          onChange={(event) =>
            setFields({ ...fields, name: event.target.value })
          }
          required
          maxLength={100}
          placeholder={
            kind === "lab"
              ? "如：智能系统课题研究"
              : kind === "contest"
                ? "如：创新竞赛作品开发"
                : "如：敏捷平台课程设计"
          }
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          项目目标 <span className="text-muted-foreground">（选填）</span>
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          value={fields.description}
          onChange={(event) =>
            setFields({ ...fields, description: event.target.value })
          }
          maxLength={2000}
          rows={3}
          placeholder="团队最终要交付什么？"
          className="w-full rounded-md border border-input bg-background p-3 text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={`${id}-start`} className="text-sm">
            开始日期（选填）
          </label>
          <Input
            id={`${id}-start`}
            type="date"
            name="startDate"
            value={fields.startDate}
            onChange={(event) =>
              setFields({ ...fields, startDate: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-end`} className="text-sm">
            结束日期（选填）
          </label>
          <Input
            id={`${id}-end`}
            type="date"
            name="endDate"
            value={fields.endDate}
            onChange={(event) =>
              setFields({ ...fields, endDate: event.target.value })
            }
          />
        </div>
      </div>
      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        创建后进入任务看板。管理员或指导老师可验收；实验室和竞赛队长可指派任务。
      </p>
      <Feedback state={state} />
      <Button disabled={pending} className="w-full">
        {pending ? "创建中…" : "创建项目并进入看板"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function CreateProjectButton({
  teamId,
  defaultKind,
  allowedKinds,
}: {
  teamId: string;
  defaultKind?: ProjectKind;
  allowedKinds?: ProjectKind[];
}) {
  return (
    <FormDialog
      title="新建项目"
      description="设置项目名称、类型和计划日期。"
      trigger={
        <Button>
          <Plus className="h-4 w-4" />
          新建项目
        </Button>
      }
    >
      <ProjectForm
        teamId={teamId}
        defaultKind={defaultKind}
        allowedKinds={allowedKinds}
      />
    </FormDialog>
  );
}

export function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setError("");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败，请手动选中邀请码复制");
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="select-all rounded-md bg-muted px-2 py-1 text-sm">
          {code}
        </code>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "已复制" : "复制邀请码"}
        </Button>
      </div>
      <p role="status" className="text-xs text-destructive">
        {error}
      </p>
    </div>
  );
}
