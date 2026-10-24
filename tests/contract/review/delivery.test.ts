import { describe, expect, it } from "vitest";
import { parseTaskDeliveryPayload, sortSubmissionVersions } from "@/modules/review/client";
import type { SubmissionDTO } from "@/modules/tasks/client";

const taskId = "75d0dbf3-1943-4324-8f99-9e8a9195eedd";
const resourceId = "d9bb677c-7d7f-4f8c-a758-99aa6bf703be";
const submission = (patch: Partial<SubmissionDTO> = {}): SubmissionDTO => ({
  id: "v1", taskId, version: 1, submittedById: "member", submittedByName: "执行成员",
  submittedAt: "2026-10-10T01:30:00Z", summary: "功能已完成", verification: "边界用例通过",
  links: [{ title: "成果页面", url: "https://example.com/result" }],
  resources: [{ id: resourceId, title: "验证结果", fileName: "result.md", mimeType: "text/markdown", size: 2048 }],
  criteria: [{ id: "a", text: "支持取消", met: true, note: "已检查取消后原状态保留" }],
  review: { action: "reject", reviewerName: "指导老师", reviewedAt: "2026-10-10T02:30:00Z", summary: "补充失败路径", checks: [{ criterionId: "a", passed: false, note: "还需验证网络失败" }] },
  source: "structured", ...patch,
});
const payload = (items: SubmissionDTO[]) => ({ requirements: { version: 3, criteria: [{ id: "new", text: "当前更新的要求" }] }, submissions: items });

describe("提交版本只读契约", () => {
  it("保留提交快照与当时逐项意见，不用当前要求替换历史", () => {
    const parsed = parseTaskDeliveryPayload(payload([submission()]), taskId);
    expect(parsed.requirements.version).toBe(3);
    expect(parsed.submissions[0].criteria).toEqual([{ id: "a", text: "支持取消", met: true, note: "已检查取消后原状态保留" }]);
    expect(parsed.submissions[0].review?.checks).toEqual([{ criterionId: "a", passed: false, note: "还需验证网络失败" }]);
  });
  it("历史记录明确保持 legacy 和空证据，不生成验证结果", () => {
    const legacy = submission({ id: "legacy", version: 0, source: "legacy", verification: "", links: [], resources: [], criteria: [], review: null });
    expect(parseTaskDeliveryPayload(payload([legacy]), taskId).submissions[0]).toEqual(legacy);
  });
  it("空提交仍保留当前验收要求", () => {
    expect(parseTaskDeliveryPayload(payload([]), taskId)).toEqual(payload([]));
  });
  it("拒绝跨任务响应，防止旧请求内容进入当前详情", () => {
    expect(() => parseTaskDeliveryPayload(payload([submission({ taskId: "other" })]), taskId)).toThrow("提交记录与当前任务不一致");
  });
  it("成果链接仅接受真实 HTTP 与 HTTPS 地址", () => {
    for (const url of ["javascript:alert(1)", "file:///tmp/result", "data:text/html,test"]) {
      expect(() => parseTaskDeliveryPayload(payload([submission({ links: [{ title: "地址", url }] })]), taskId)).toThrow();
    }
    expect(parseTaskDeliveryPayload(payload([submission({ links: [{ title: "本地成果", url: "http://localhost:3000/result" }] })]), taskId).submissions[0].links[0].url).toBe("http://localhost:3000/result");
  });
  it("拒绝无效文件标识、负容量和不完整响应", () => {
    expect(() => parseTaskDeliveryPayload({ submissions: [] }, taskId)).toThrow();
    expect(() => parseTaskDeliveryPayload(payload([submission({ resources: [{ id: "../private", title: "文件", fileName: null, mimeType: null, size: -1 }] })]), taskId)).toThrow();
  });
  it("最新版本优先且不修改输入，时间相同仍有稳定顺序", () => {
    const items = [submission({ id: "v1" }), submission({ id: "legacy", source: "legacy", version: 0 }), submission({ id: "v2-b", version: 2 }), submission({ id: "v2-a", version: 2 })];
    const before = items.map((item) => item.id);
    expect(sortSubmissionVersions(items).map((item) => item.id)).toEqual(["v2-a", "v2-b", "v1", "legacy"]);
    expect(items.map((item) => item.id)).toEqual(before);
  });
});
