# 业务完善 · 实施契约与验收

日期：2026-10-10 · 基线：7c53f70 / 0.4.0-rc.5 · 分支：codex/business-completion

本轮由用户授权成果提交、独立提交版本、逐项验收和团队信息中心，并授权查阅外部开源资料与并行 agent 实施。以下接口在实施开始时冻结；最终验收结果在收尾补充。

## 分工

| Owner | 范围 |
|---|---|
| foundation / root | resources 模块与公开 UI、共享详情/导航、追加 schema/迁移、旧契约测试迁移、版本与集成验收 |
| identity | 团队资料与设置、公告、邀请码更新、退出/移除成员；阻止移除最后管理员和仍承担未完成任务的成员 |
| A / tasks | 验收要求、结构化提交、文件证据、不可变版本、带版本的逐项评审；仍由 transitionTask 事务提交状态与事件 |
| C / B | 真实提交历史展示、验收台对齐、任务详情 URL 与看板/表格导航；不修改 tasks 内部 |

## 公开契约

所有日期继续使用现有规范；资源和提交的 createdAt 为 ISO 时间戳。

```ts
// tasks/client：纯类型，tasks 根入口也 re-export
type AcceptanceCriterion = { id: string; text: string };
type DeliveryInput = {
  summary: string; verification: string; requirementsVersion: number;
  links: { title: string; url: string }[];
  resourceIds: string[];
  checks: { criterionId: string; met: boolean; note?: string }[];
};
type ReviewInput = {
  submissionId: string; summary: string;
  checks: { criterionId: string; passed: boolean; note?: string }[];
};
type SubmissionDTO = {
  id: string; taskId: string; version: number;
  submittedById: string | null; submittedByName: string | null; submittedAt: string;
  summary: string; verification: string;
  links: { title: string; url: string }[];
  resources: { id: string; title: string; fileName: string | null; mimeType: string | null; size: number }[];
  criteria: { id: string; text: string; met: boolean; note?: string }[];
  review: { action: "accept" | "reject"; reviewerName: string | null; reviewedAt: string; summary: string; checks: { criterionId: string; passed: boolean; note?: string }[] } | null;
  source: "structured" | "legacy";
};
getTaskDelivery(actorId, taskId): Promise<{ requirements: { version: number; criteria: AcceptanceCriterion[] }; submissions: SubmissionDTO[] }>;
saveTaskRequirements(actorId, taskId, { version, criteria });
// transitionTask 的 input 增加 delivery? / review?；普通认领、指派等保持原契约。
// 新 submit/resubmit 必须至少一项验收要求、完成说明、验证结果、至少一份链接或文件证据；已有事件不伪造证据。
// accept/reject 绑定当前 submissionId；全验收项确认才能通过，打回必须写修改要求，并标明未通过项的问题位置与通过条件。

// resources：由 foundation 提供，tasks 在现有 tx 内调用
bindSubmissionResources(actorId: string, projectId: string, resourceIds: string[], submissionId: string, tx: DbTx): Promise<{ id: string; title: string; fileName: string | null; mimeType: string | null; size: number }[]>;
// 检查项目/团队及文件可读性，锁资源，建立引用；已引用文件禁止删除。
// resources/ui：客户端安全入口
ResourcePicker({ projectId, selectedIds, onChange, disabled?, onUploadingChange? });

// review/ui：共享只读版本面板，详情页与抽屉均消费
SubmissionTimeline({ taskId: string, updatedAt?: string, compact?: boolean });
```

GET `/api/v1/tasks/[taskId]/delivery` 返回 getTaskDelivery 原始对象。验收要求写入由 tasks/actions 承接。资源 GET `/api/v1/resources?projectId=...` 返回 `{ resources: ResourceDTO[] }`；POST 接受 FormData 的 `projectId`（或 teamId）、`file`、`title`，返回 `{ resource: ResourceDTO }`。资源元数据包含 `id/title/fileName/mimeType/size/kind`。GET `/api/v1/resources/[resourceId]/file` 经过会话和团队权限返回预览/下载内容，不提供公开文件地址。

## 数据与交互原则

- root 在 schema 末尾统一追加任务要求、提交、评审、团队资料、公告、资源/版本/引用表；不改既有表块或清空历史数据。
- 文件正文保存在本机数据库，与现有备份一起保留；限制类型、单文件容量与导入文本长度。文件永不覆盖；文档采用版本冲突检查与历史。
- 新提交不能退化为一个自由说明框；验收项由任务维护者设定，提交快照保留当时要求，重交产生新版本。
- 既有 submitted 任务无结构化版本时采用明确标记的历史记录，由评审输入确认旧成果；不得捏造链接、文件或测试结果。
- 外部链接只记录用户提供的地址，不代替代码评审、不自动访问或宣称验证通过。
- 资料整理支持真实文本/Markdown/CSV/JSON 的目录、检索与预览，接受 Marker 产物；PDF/Office 没有提取结果时明确为原文件预览/下载。
- 团队与项目资料为团队成员共享；个人 AI 草稿和资料不自动迁入团队。
- 新界面参考 Plane 分层详情/文档、Linear 工作视图；使用现有 tokens、Radix、Lucide 和轻量动效，保留减少动效、焦点、取消与失败输入。

## 验收范围

用户最新要求：本轮只做必要自动检查和关键入口试用，完整人工综合验收移至最终迭代。以下完整闭环是最终验收目标，本轮不宣称已跑全套。

新增契约覆盖正常提交、无证据/缺验收项、跨团队文件、并发提交、过期评审、旧要求版本、成员移除保护、文档冲突和引用文件删除保护。完整 npm test 与 Windows npm run build 后，在真实浏览器验证资料上传→关联任务→提交 v1→打回→v2→指定版本验收，以及团队资料/公告/文档和 390px 布局。

## 参考

- [Marker](https://github.com/datalab-to/marker)：参考 Markdown/JSON 转换产物；当前需要 Python/PyTorch 与 OCR 推理环境，本轮不下载模型或假装 OCR 已执行。
- [Plane 任务详情](https://docs.plane.so/work-items/work-item-details)：详情、附件与活动分层。
- [Plane 文档](https://docs.plane.so/pages/overview)：团队文档组织与版本概念。
- [Linear 看板](https://linear.app/docs/board-layout)：同一批工作项的视图与筛选一致性。

以上为设计参考与自行实现，不是复制整个开源产品，也不引入其模型或许可证受限资产。

## 验收结论与集成结果

- **自动化契约测试**：`npm test` 全绿，39 个测试文件、378 条用例通过（覆盖 tasks 提交证据/要求版本/逐项打回、identity 团队信息/公告/成员移除保护、resources 文档冲突/引用绑定/权限隔离、board 结构化移动与跨列验收等完整矩阵）。
- **Windows 生产构建**：`npm run build`（Next.js Turbopack）零改动通过，新增资源与提交接口、团队和项目页面正常编译，无类型或导出报错。
- **代码规范与格式**：ESLint 检查源码与契约测试通过；`git diff --check` 无空白错误。
- **业务状态机原子性**：成果提交不可变版本与 transitionTask 事务深度绑定，全项验收确认方可通过，打回必须明确修改要求；已引用资源锁定，保护证据链完整。
- **关键入口试用**：本机演示管理员创建 Markdown 文档、上传文本原文件、建立任务和验收项，关联文件提交 v1，填写逐项问题与通过条件后打回，补充验证路径重交 v2，再逐项验收通过；切回 v1 仍显示原成果、自检和打回意见。重新核对同一要求版本时保留草稿与自检输入。团队资料页、公告/邀请/资料中心入口已打开查看，未修改演示团队的成员权限或邀请码。
- **界面记录**：[文档预览](design/business-rc6/document.jpg)、[提交表单](design/business-rc6/submission-form.jpg)、[v1 历史与修改意见](design/business-rc6/submission-history.jpg)、[团队信息](design/business-rc6/team-information.jpg)。演示记录保留在开发库，清楚标明本机试用；它们不代表全面验收结果。
- **人工检查边界**：此次单账号关键流程不替代完整角色矩阵；全面多端/主题/键盘/角色矩阵、运行包与外部服务联调待最终迭代统一进行。
