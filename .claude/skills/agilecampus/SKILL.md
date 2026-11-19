---
name: agilecampus
description: 读写 AgileCampus 敏捷校园——查项目与任务、创建任务、填写完成情况。当用户说"我有哪些任务""这个项目进度如何""给项目X加任务Y""把任务Z标记完成，情况是…"时触发。需事先配置 AGILECAMPUS_URL 与 AGILECAMPUS_TOKEN。
---

# AgileCampus 开放 Agent 接入

通过 Personal API Token 以当前用户身份读写 AgileCampus。请求走 `/api/v1/agent/*`（或兼容别名 `/api/agent/*`），携带 `Authorization: Bearer <token>`。

## 前置环境配置

需要两个环境变量（在网页「个人中心 → 访问令牌」生成）：

- `AGILECAMPUS_URL`：站点地址，例如 `http://localhost:3000`
- `AGILECAMPUS_TOKEN`：令牌明文（以 `agc_` 开头）

## 核心接口

### 1. 新建任务 (`POST /api/v1/agent/tasks`)

携带 `projectId` 与 `title`：

```bash
curl -sS -X POST "$AGILECAMPUS_URL/api/v1/agent/tasks" \
  -H "Authorization: Bearer $AGILECAMPUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<UUID>","title":"自动化集成验证","priority":"high"}'
```

可选参数：`description`、`assigneeId`、`startDate`、`dueDate`（`YYYY-MM-DD`）、`priority`（`low`|`medium`|`high`）、`milestoneId`。

### 2. 填写完成情况 (`POST /api/v1/agent/tasks/complete`)

```bash
curl -sS -X POST "$AGILECAMPUS_URL/api/v1/agent/tasks/complete" \
  -H "Authorization: Bearer $AGILECAMPUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"<UUID>","completionNote":"已通过单元测试与静态分析"}'
```

## 响应规范

- `201 / 200`：成功，返回对应实体数据。
- `400`：参数校验错误。
- `401`：未授权、令牌无效或已过期。
- `403`：权限不足（非项目成员或无权操作）。
