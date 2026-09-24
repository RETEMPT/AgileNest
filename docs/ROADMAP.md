# ROADMAP

## 本期（v0.2 框架）· 核心刚需 —— 做完整

- [x] 登录 / 注册 / 飞书绑定（原样保留）
- [x] 团队 / 成员 / 角色 / 项目（identity）
- [ ] 任务 CRUD · 子任务 · 指派 · 截止（A）
- [ ] 五态状态机 + 流转动作（A）
- [ ] 看板五列 + 拖拽 + 表格视图（B）
- [ ] 学生端：认领 / 提交 / 修改（C）
- [ ] 教师端：分派 / 验收 / 打回（C）
- [ ] 工时登记 + 完成度 %（D）
- [ ] 日历 + 里程碑（E）
- [ ] 截止提醒（cron + 飞书私信）（E）

## 下期 · 重要需求 —— 先占位

- [ ] 团队贡献统计（`modules/stats` 里已有签名）
- [ ] 站内消息完善（`modules/notify` 骨架）
- [ ] 甘特时间线（`modules/gantt`）
- [ ] 轻量 Sprint（`modules/sprint`）

## 远期 · 创新亮点 —— 只挂路牌

- [ ] 分层 AI：L1 个人助手 → L2 AI Scrum Master → L3 监督 AI → L4 知识库 AI（`modules/ai`）
- [ ] Agent 开放写入 API + 审计（`modules/agent-api`）
- [ ] 作品集 / 简历一键导出（`modules/portfolio`）
- [ ] 教师节点审核流程化（开题/中期/结题模板）
- [ ] 高校项目模板库（`modules/templates`）
- [ ] Webhook / GitHub 集成（代码进展同步任务）
- [ ] 竞赛日历 / 课程绑定

## 测试债（Phase 1 由模块 owner 补）

- [ ] `tests/contract/tasks/**` — 五态全部转移边 + 非法边
- [ ] `tests/contract/board/**` — 筛选 / 分组 / moveTask 合法性
- [ ] `tests/contract/review/**` — 双端越权矩阵
- [ ] `tests/contract/worklog/**` + `stats/**` — 工时汇总 / 完成度加权
- [ ] `tests/contract/{calendar,milestone}/**` — 月网格 / 节点 CRUD
- [ ] `tests/contract/notify/**` — cron 扫描
- [ ] E2E 冒烟脚本（Playwright，可选）
