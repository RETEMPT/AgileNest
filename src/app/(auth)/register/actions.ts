"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createUser } from "@/lib/user";
import { AppError } from "@/modules/core/errors";

const registerSchema = z.object({
  name: z.string().min(1, "请填写姓名"),
  email: z.email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位").max(64, "密码最长 64 位"),
});

export type FormState = { error: string } | null;

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await createUser(parsed.data);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    console.error("[registerAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ECONNREFUSED") || msg.includes("5432")) {
      return { error: "数据库连接失败，请确认数据库服务已启动。" };
    }
    return { error: "注册失败，请稍后重试。" };
  }
  redirect("/login?registered=1");
}
