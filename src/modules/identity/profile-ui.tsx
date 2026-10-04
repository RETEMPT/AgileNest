"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { saveAccountProfileAction, type AccountFormState } from "./actions";

async function prepareAvatar(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 5 * 1024 * 1024) throw new Error("原图不能超过 5 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片，请重试");
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - edge) / 2,
      (image.naturalHeight - edge) / 2,
      edge,
      edge,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AccountProfileForm({
  profile,
  feishuName,
}: {
  profile: {
    name: string;
    email: string;
    bio: string;
    avatarUrl: string | null;
  };
  feishuName?: string | null;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState("");
  const [imageError, setImageError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saved, setSaved] = useState(profile);
  const [showFeedback, setShowFeedback] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await saveAccountProfileAction(prev, data);
      if (result?.saved) {
        setSaved({ ...saved, ...result.saved });
        setName(result.saved.name);
        setBio(result.saved.bio);
        setAvatar("");
      }
      setShowFeedback(true);
      return result;
    },
    null,
  );
  const preview = avatar === "remove" ? null : avatar || saved.avatarUrl;
  const dirty = name !== saved.name || bio !== saved.bio || avatar !== "";
  const importedName = feishuName?.trim().slice(0, 50);
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
    >
      <div className="border-b border-border bg-gradient-to-r from-brand-soft to-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <UserRound className="h-5 w-5 text-brand" />
          个人资料
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          姓名和头像显示在团队成员、任务负责人等位置。
        </p>
      </div>
      <fieldset
        disabled={pending || processing}
        className="space-y-6 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-5">
          <UserAvatar
            name={name}
            src={preview}
            className="h-20 w-20 text-3xl ring-4 ring-brand-soft"
          />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                {processing ? "处理图片中…" : "选择头像"}
              </Button>
              {preview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAvatar(saved.avatarUrl ? "remove" : "");
                    setImageError("");
                    setShowFeedback(false);
                  }}
                >
                  移除
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              支持 JPG、PNG、WebP，最大 5 MB。自动居中裁切并压缩。
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="上传头像"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setProcessing(true);
                setImageError("");
                setShowFeedback(false);
                try {
                  setAvatar(await prepareAvatar(file));
                } catch (error) {
                  setImageError(
                    error instanceof Error ? error.message : "图片处理失败",
                  );
                } finally {
                  setProcessing(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />
            {imageError && (
              <p role="alert" className="text-xs text-destructive">
                {imageError}
              </p>
            )}
          </div>
        </div>
        <input type="hidden" name="avatar" value={avatar} />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={`${id}-name`} className="text-sm font-medium">
              姓名 / 昵称
            </label>
            <Input
              id={`${id}-name`}
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowFeedback(false);
              }}
              maxLength={50}
              required
              autoComplete="name"
            />
            {importedName && importedName !== name && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-auto max-w-full justify-start whitespace-normal px-0 text-left text-xs text-brand"
                onClick={() => {
                  setName(importedName);
                  setShowFeedback(false);
                }}
              >
                使用飞书姓名：{importedName}（保存后生效）
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor={`${id}-email`} className="text-sm font-medium">
              登录邮箱
            </label>
            <Input
              id={`${id}-email`}
              value={profile.email}
              readOnly
              className="bg-muted/50 text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              邮箱用于登录与识别账号。
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-bio`} className="text-sm font-medium">
            个人简介
          </label>
          <textarea
            id={`${id}-bio`}
            name="bio"
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              setShowFeedback(false);
            }}
            rows={3}
            maxLength={300}
            placeholder="填写研究方向、技能或工作职责"
            className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-right text-xs text-muted-foreground">
            {bio.length} / 300
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs leading-6 text-muted-foreground">
            {dirty && (
              <span className="mr-2 font-medium text-brand">有未保存的修改</span>
            )}
            修改姓名后，学术身份需由团队重新确认。
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={!dirty}
              onClick={() => {
                setName(saved.name);
                setBio(saved.bio);
                setAvatar("");
                setImageError("");
                setShowFeedback(false);
              }}
            >
              还原修改
            </Button>
            <Button type="submit" disabled={!dirty}>
              {pending ? "保存中…" : "保存个人资料"}
            </Button>
          </div>
        </div>
      </fieldset>
      {state && showFeedback && (
        <p
          role={state.error ? "alert" : "status"}
          className={`px-6 pb-5 text-sm ${state.error ? "text-destructive" : "text-brand"}`}
        >
          {state.error || state.ok}
        </p>
      )}
    </form>
  );
}
