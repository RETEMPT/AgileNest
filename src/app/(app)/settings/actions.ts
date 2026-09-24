"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/core/session";
import { unbindFeishu } from "@/lib/user";

export async function unbindFeishuAction() {
  const user = await requireUser();
  await unbindFeishu(user.id);
  revalidatePath("/settings");
}
