"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, toFormError } from "@/modules/core";
import { markRead } from "./service";

export async function markReadAction(
  _prev: { error: string } | null,
  data: FormData,
) {
  const user = await requireUser();
  const id = z.uuid().safeParse(data.get("id"));
  if (!id.success) return { error: "消息无效" };
  try {
    await markRead(user.id, id.data);
  } catch (error) {
    return { error: toFormError(error) };
  }
  revalidatePath("/notifications");
  return { error: "" };
}
