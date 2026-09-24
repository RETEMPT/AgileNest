# agent-api · Agent 开放写入 API（路牌）

**状态**：未实现（PPT 创新亮点）
**Owner**：未分配
**建议分支**：`feature/agent-api`

## 要做的事
- Personal API Token（生成/撤销，库中只存 sha256 hash）
- `POST /api/v1/agent/tasks` · `POST /api/v1/agent/tasks/complete` · `POST /api/v1/agent/resource-usage` 等
- 全量审计日志；第三方 Agent 可安全接入
- Claude Code skill（`.claude/skills/agilecampus/`）

## 与本期的关系
本期只留此路牌。实现时**复用** `modules/tasks` 的 service（不要绕过状态机与 ACL）。
