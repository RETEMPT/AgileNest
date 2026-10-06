"use server";

import { revalidatePath } from "next/cache";
import { requireUser, toFormError } from "@/modules/core";
import { disconnectFeishu } from "./connection-service";
import type { IdentityFormState } from "./actions";

export async function disconnectFeishuAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  try {
    await disconnectFeishu(user.id, {
      bindingVersion: String(data.get("bindingVersion") ?? ""),
    });
  } catch (error) {
    return { error: toFormError(error, "解绑失败，请重试") };
  }
  revalidatePath("/settings");
  return { error: "", ok: "飞书账号已解绑" };
}
