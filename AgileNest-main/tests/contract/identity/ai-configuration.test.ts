import { describe, expect, it } from "vitest";
import { createPreferencesStore, preferencesKey, DEFAULT_PREFERENCES } from "@/components/preferences-store";
import { DEFAULT_MODEL, modelConfigurationSchema, modelConfigurationReadiness, importModelConfiguration, exportModelConfiguration } from "@/components/ai/configuration-model";

describe("旧配置兼容与浏览器偏好清理", () => {
  it("空配置可保存草稿但不能导出为可测试配置", () => {
    expect(modelConfigurationReadiness(DEFAULT_MODEL)).toEqual(["请填写模型标识"]);
    expect(() => exportModelConfiguration(DEFAULT_MODEL)).toThrow("模型标识");
  });
  it("完整配置导出与导入往返不包含密钥", () => {
    const model = { ...DEFAULT_MODEL, model: "test-model" };
    expect(importModelConfiguration(exportModelConfiguration(model))).toEqual(model);
    expect(modelConfigurationReadiness(model)).toEqual([]);
  });
  it("导入非法JSON或含实际密钥的未知字段时拒绝", () => {
    expect(() => importModelConfiguration("broken")).toThrow("JSON");
    expect(() => importModelConfiguration(JSON.stringify({ ...DEFAULT_MODEL, apiKey: "secret" }))).toThrow();
  });
  it("自定义地址缺失时校验准确提示", () => {
    expect(modelConfigurationReadiness({ ...DEFAULT_MODEL, baseUrl: "", model: "demo" })).toEqual(["请填写 API 基础地址"]);
  });
  it("导入保留原始模型标识和过程显示偏好", () => {
    const model = { ...DEFAULT_MODEL, provider: "compatible" as const, baseUrl: "http://127.0.0.1:11434/v1", model: "local-model", showReasoning: false };
    expect(importModelConfiguration(JSON.stringify(model))).toEqual(model);
  });
  it("导入非法地址和密钥变量不会采用", () => {
    expect(() => importModelConfiguration(JSON.stringify({ ...DEFAULT_MODEL, baseUrl: "https://example.test/?token=secret" }))).toThrow();
    expect(() => importModelConfiguration(JSON.stringify({ ...DEFAULT_MODEL, apiKeyEnv: "sk-secret" }))).toThrow();
  });
  it("旧主题偏好自动补齐 AI 配置，按账号持久化插件选择", () => {
    const values = new Map([[preferencesKey("a"),JSON.stringify({theme:"light",aiFloating:false})]]);
    const storage = {getItem:(key:string) => values.get(key) ?? null,setItem:(key:string,value:string) => {values.set(key,value);},removeItem:(key:string) => {values.delete(key);}};
    const store = createPreferencesStore("a",() => storage);
    expect(store.getSnapshot().preferences.ai).not.toHaveProperty("model");
    expect(store.update({ai:{plugins:["research"]}})).toBe(true);
    expect(createPreferencesStore("a",() => storage).getSnapshot().preferences.ai.plugins).toEqual(["research"]);
    expect(createPreferencesStore("b",() => storage).getSnapshot().preferences).toEqual(DEFAULT_PREFERENCES);
  });
  it("移除旧 API 镜像，只清理该账号的偏好键，保留会话及模板主题", () => {
    const old = {theme:"dark",aiFloating:false,ai:{model:{...DEFAULT_MODEL,baseUrl:"https://legacy.test/v1",model:"old-model"},plugins:["research"]}};
    const values = new Map([[preferencesKey("a"),JSON.stringify(old)],["agilenest:ai-drafts:v1:a","保留的会话"],[preferencesKey("b"),"其他账号"]]);
    const storage = {getItem:(key:string) => values.get(key) ?? null,setItem:(key:string,value:string) => {values.set(key,value);},removeItem:(key:string) => {values.delete(key);}};
    const current = createPreferencesStore("a",() => storage).getSnapshot();
    expect(current.preferences).toEqual({theme:"dark",aiFloating:false,ai:{plugins:["research"]}});
    expect(values.get(preferencesKey("a"))).not.toContain("legacy.test");
    expect(values.get("agilenest:ai-drafts:v1:a")).toBe("保留的会话");
    expect(values.get(preferencesKey("b"))).toBe("其他账号");
  });
  it("拒绝携带凭据、查询密钥、脚本协议的地址和密钥值", () => {
    for (const baseUrl of ["javascript:alert(1)","https://user:secret@example.com","https://example.com?key=secret","not-url"]) expect(modelConfigurationSchema.safeParse({...DEFAULT_MODEL,baseUrl}).success).toBe(false);
    expect(modelConfigurationSchema.safeParse({...DEFAULT_MODEL,apiKeyEnv:"sk-secret-key"}).success).toBe(false);
    expect(modelConfigurationSchema.safeParse({...DEFAULT_MODEL,baseUrl:"http://127.0.0.1:11434/v1",apiKeyEnv:"LOCAL_AI_KEY"}).success).toBe(true);
  });
});
