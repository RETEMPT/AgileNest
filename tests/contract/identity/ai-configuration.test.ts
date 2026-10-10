import { describe, expect, it } from "vitest";
import { createPreferencesStore, preferencesKey, DEFAULT_PREFERENCES } from "@/components/preferences-store";
import { DEFAULT_MODEL, modelConfigurationSchema } from "@/components/ai/configuration-model";

describe("AI 配置草稿", () => {
  it("旧主题偏好自动补齐 AI 配置，按账号持久化插件选择", () => {
    const values = new Map([[preferencesKey("a"),JSON.stringify({theme:"light",aiFloating:false})]]);
    const storage = {getItem:(key:string) => values.get(key) ?? null,setItem:(key:string,value:string) => {values.set(key,value);}};
    const store = createPreferencesStore("a",() => storage);
    expect(store.getSnapshot().preferences.ai.model).toEqual(DEFAULT_MODEL);
    expect(store.update({ai:{model:{...DEFAULT_MODEL,model:"my-model"},plugins:["research"]}})).toBe(true);
    expect(createPreferencesStore("a",() => storage).getSnapshot().preferences.ai.plugins).toEqual(["research"]);
    expect(createPreferencesStore("b",() => storage).getSnapshot().preferences).toEqual(DEFAULT_PREFERENCES);
  });
  it("拒绝携带凭据、查询密钥、脚本协议的地址和密钥值", () => {
    for (const baseUrl of ["javascript:alert(1)","https://user:secret@example.com","https://example.com?key=secret","not-url"]) expect(modelConfigurationSchema.safeParse({...DEFAULT_MODEL,baseUrl}).success).toBe(false);
    expect(modelConfigurationSchema.safeParse({...DEFAULT_MODEL,apiKeyEnv:"sk-secret-key"}).success).toBe(false);
    expect(modelConfigurationSchema.safeParse({...DEFAULT_MODEL,baseUrl:"http://127.0.0.1:11434/v1",apiKeyEnv:"LOCAL_AI_KEY"}).success).toBe(true);
  });
});
