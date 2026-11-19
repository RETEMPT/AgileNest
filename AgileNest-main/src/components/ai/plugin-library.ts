"use client";

import { useCallback, useEffect, useState } from "react";
import { pluginLibrarySchema, type BuiltinId, type PluginLibrary } from "@/modules/ai/client";
import { modelRequest } from "./model-connection";

export const PLUGIN_LIBRARY_EVENT = "agilenest:plugin-library-changed";
export function builtinEnabled(library: PluginLibrary | null, id: BuiltinId) { return library?.builtins.some((item) => item.id === id && item.enabled) ?? false; }
export async function requestPluginChange(body: unknown, signal: AbortSignal, method: "PUT" | "PATCH" | "discover") {
  return pluginLibrarySchema.parse(await modelRequest(method === "discover" ? "plugins/discover" : "plugins", body, signal, method === "discover" ? undefined : method));
}
export function usePluginLibrary(userId: string) {
  const [library, setLibrary] = useState<PluginLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setLoading(true); setRevision((old) => old + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void modelRequest("plugins", undefined, controller.signal).then((result) => { setLibrary(pluginLibrarySchema.parse(result)); setError(""); }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "插件配置加载失败，请重试"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, revision]);
  useEffect(() => { window.addEventListener(PLUGIN_LIBRARY_EVENT, refresh); window.addEventListener("focus", refresh); return () => { window.removeEventListener(PLUGIN_LIBRARY_EVENT, refresh); window.removeEventListener("focus", refresh); }; }, [refresh]);
  return { library, setLibrary, loading, error, refresh };
}
