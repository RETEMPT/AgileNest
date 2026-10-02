"use client";

import { useActionState, useId, useState } from "react";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACADEMIC_IDENTITIES,
  ACADEMIC_LABELS,
  TEAM_POSITIONS,
  POSITION_META,
  type AcademicIdentity,
  type TeamPosition,
} from "./client";
import {
  saveAcademicProfileAction,
  updatePositionsAction,
  confirmAcademicIdentityAction,
  updateProjectAction,
  type IdentityFormState,
} from "./actions";

function Result({ state }: { state: IdentityFormState }) {
  return (
    state && (
      <p
        role={state.error ? "alert" : "status"}
        className={`text-xs ${state.error ? "text-destructive" : "text-brand"}`}
      >
        {state.error || state.ok}
      </p>
    )
  );
}

export function AcademicProfileForm({
  profile,
}: {
  profile: {
    identity: AcademicIdentity;
    institution: string;
    department: string;
    researchFocus: string;
  } | null;
}) {
  const [state, action, pending] = useActionState(
    saveAcademicProfileAction,
    null,
  );
  const [identity, setIdentity] = useState<AcademicIdentity | "">(
    profile?.identity ?? "",
  );
  const [fields, setFields] = useState({
    institution: profile?.institution ?? "",
    department: profile?.department ?? "",
    researchFocus: profile?.researchFocus ?? "",
  });
  const id = useId();
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
    >
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <GraduationCap className="h-5 w-5 text-brand" />
          学术身份
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          填写自己的身份，所在团队的管理员核对后确认。修改资料后需要重新确认；团队权限由职务决定。
        </p>
      </div>
      <fieldset disabled={pending}>
        <legend className="mb-2 text-sm font-medium">我的身份</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACADEMIC_IDENTITIES.map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border p-3 text-sm ${identity === value ? "border-brand bg-brand-soft text-brand" : "border-border"}`}
            >
              <input
                type="radio"
                name="identity"
                value={value}
                required
                checked={identity === value}
                onChange={() => setIdentity(value)}
                className="mr-2 accent-brand"
              />
              {ACADEMIC_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["institution", "学校 / 机构"],
            ["department", "院系 / 部门"],
          ] as const
        ).map(([key, label]) => (
          <div className="space-y-1" key={key}>
            <label htmlFor={`${id}-${key}`} className="text-xs font-medium">
              {label}（选填）
            </label>
            <Input
              id={`${id}-${key}`}
              name={key}
              value={fields[key]}
              onChange={(event) =>
                setFields({ ...fields, [key]: event.target.value })
              }
              maxLength={100}
              disabled={pending}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-focus`} className="text-xs font-medium">
          研究方向（选填）
        </label>
        <Input
          id={`${id}-focus`}
          name="researchFocus"
          value={fields.researchFocus}
          onChange={(event) =>
            setFields({ ...fields, researchFocus: event.target.value })
          }
          maxLength={300}
          disabled={pending}
        />
      </div>
      <Result state={state} />
      <Button disabled={pending}>{pending ? "保存中…" : "保存身份信息"}</Button>
    </form>
  );
}

export function MemberPositionsForm({
  teamId,
  member,
}: {
  teamId: string;
  member: { id: string; name: string; positions: TeamPosition[] };
}) {
  const [state, action, pending] = useActionState(updatePositionsAction, null);
  const [selected, setSelected] = useState(member.positions);
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-3 border-t border-border pt-4"
    >
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="userId" value={member.id} />
      <fieldset disabled={pending}>
        <legend className="mb-2 text-xs font-medium">
          {member.name}的团队职务（可多选）
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {TEAM_POSITIONS.map((position) => (
            <label
              key={position}
              title={POSITION_META[position].description}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-xs ${selected.includes(position) ? "border-brand/40 bg-brand-soft" : "border-border"}`}
            >
              <input
                type="checkbox"
                name="positions"
                value={position}
                checked={selected.includes(position)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, position]
                      : selected.filter((value) => value !== position),
                  )
                }
                className="accent-brand"
              />
              {POSITION_META[position].label}
            </label>
          ))}
        </div>
      </fieldset>
      <Result state={state} />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || selected.length === 0}
      >
        {pending ? "保存中…" : "保存团队职务"}
      </Button>
    </form>
  );
}

export function ConfirmIdentityButton({
  teamId,
  userId,
  version,
}: {
  teamId: string;
  userId: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(
    confirmAcademicIdentityAction,
    null,
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="version" value={version} />
      <Button size="sm" variant="outline" disabled={pending}>
        <ShieldCheck className="h-3.5 w-3.5" />
        {pending ? "确认中…" : "核对并确认身份"}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function ProjectSettingsForm({
  project,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    status: "active" | "archived";
  };
}) {
  const [state, action, pending] = useActionState(updateProjectAction, null);
  const [fields, setFields] = useState({
    name: project.name,
    description: project.description ?? "",
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    status: project.status,
  });
  const id = useId();
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
    >
      <h2 className="text-base font-semibold">维护项目目标</h2>
      <input type="hidden" name="projectId" value={project.id} />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${id}-name`}>
          项目名称
        </label>
        <Input
          id={`${id}-name`}
          name="name"
          required
          maxLength={100}
          value={fields.name}
          disabled={pending}
          onChange={(event) =>
            setFields({ ...fields, name: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${id}-description`}>
          项目目标
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={3}
          maxLength={2000}
          value={fields.description}
          disabled={pending}
          onChange={(event) =>
            setFields({ ...fields, description: event.target.value })
          }
          className="w-full rounded-md border border-input bg-background p-3 text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["startDate", "开始日期"],
            ["endDate", "结束日期"],
          ] as const
        ).map(([key, label]) => (
          <div className="space-y-2" key={key}>
            <label htmlFor={`${id}-${key}`} className="text-sm">
              {label}（选填）
            </label>
            <Input
              id={`${id}-${key}`}
              name={key}
              type="date"
              disabled={pending}
              value={fields[key]}
              onChange={(event) =>
                setFields({ ...fields, [key]: event.target.value })
              }
            />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-status`} className="text-sm font-medium">
          项目状态
        </label>
        <select
          id={`${id}-status`}
          name="status"
          disabled={pending}
          value={fields.status}
          onChange={(event) =>
            setFields({
              ...fields,
              status: event.target.value as "active" | "archived",
            })
          }
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="active">进行中</option>
          <option value="archived">已归档</option>
        </select>
      </div>
      <Result state={state} />
      <Button disabled={pending}>{pending ? "保存中…" : "保存项目设置"}</Button>
    </form>
  );
}
