"use client";

import { accountFetch } from "@/components/account-request";
import { useEffect, useState } from "react";
import { z } from "zod";
import { modelConfigurationSchema, type ModelConfigurationStatus } from "@/modules/ai/client";

export const MODEL_CONNECTION_EVENT = "agilenest:model-connection-changed";
export const MODEL_SETTINGS_GUARD_EVENT = "agilenest:model-settings-navigation";
export const MODEL_SETTINGS_OPEN_EVENT = "agilenest:open-model-settings";
export function canLeaveModelSettings() {
  return window.dispatchEvent(new Event(MODEL_SETTINGS_GUARD_EVENT, { cancelable: true }));
}
const statusSchema = z.object({ configured: z.boolean(), configuration: modelConfigurationSchema.optional() });

export async function modelRequest(path: string, body?: unknown, signal?: AbortSignal, method?: "PUT" | "PATCH"): Promise<unknown> {
  const response = await accountFetch(`/api/v1/ai/${path}`, { method: method ?? (body === undefined ? "GET" : "POST"), headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal, cache: "no-store" });
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error("服务返回内容无法读取，请稍后重试"); }
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(value);
    throw new Error(error.success ? error.data.error : "请求失败，请稍后重试");
  }
  return value;
}

export function useModelConnection(userId: string) {
  const [status, setStatus] = useState<ModelConfigurationStatus>({ configured: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void modelRequest("config", undefined, controller.signal).then((value) => { setStatus(statusSchema.parse(value)); setError(""); setLoading(false); }).catch(() => { if (!controller.signal.aborted) { setError("模型配置读取失败，请重试"); setLoading(false); } });
    return () => controller.abort();
  }, [userId, revision]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(MODEL_CONNECTION_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(MODEL_CONNECTION_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, []);
  return { ...status, loading, error, refresh: () => setRevision((value) => value + 1) };
}
