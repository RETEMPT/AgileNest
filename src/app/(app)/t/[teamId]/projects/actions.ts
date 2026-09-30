"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/core/session";
import { AppError } from "@/modules/core/errors";
import { createProject } from "@/modules/identity";

export type FormState = { error: string } | null;

const schema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1, "请填写项目名称"),
  description: z.string().optional(),
  kind: z.enum(["course", "lab", "contest"]).optional(),
});

export async function createProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createProject(user.id, parsed.data.teamId, {
      name: parsed.data.name,
      description: parsed.data.description,
      kind: parsed.data.kind,
    });
    revalidatePath(`/t/${parsed.data.teamId}/projects`);
    revalidatePath("/t");
    return null;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    console.error("[createProjectAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ECONNREFUSED") || msg.includes("5432")) {
      return { error: "数据库连接中断，请确认数据库服务已启动。" };
    }
    return { error: "创建项目失败，请稍后重试。" };
  }
}
