# ROADMAP

> 未来功能**只写在这里**，不在 `src/modules/` 建空目录。

## 本期（v0.2 框架）· 核心刚需

- [x] 登录 / 注册 / 飞书绑定
- [x] 团队 / 成员 / 角色 / 项目
- [ ] 任务 CRUD · 子任务 · 指派 · 截止（A）
- [ ] 五态状态机 + 流转动作（A）
- [ ] 看板五列 + 拖拽 + 表格视图（B）
- [ ] 学生：认领 / 提交 / 修改（C）
- [ ] 教师：分派 / 验收 / 打回（C）
- [ ] 工时登记 + 完成度 %（D）
- [ ] 日历 + 里程碑（E）
- [ ] 截止提醒（cron + 飞书私信）（E）

## 下期 · 重要

- [ ] 团队贡献统计（已在 `worklog` 契约里）
- [ ] 站内消息完善（`notify` 骨架）
- [ ] 甘特时间线（第 4 视图，复用 tasks）
- [ ] 轻量 Sprint

## 远期 · 创新（只挂路牌）

- [ ] 分层 AI：L1 助手 → L2 Scrum Master → L3 监督 → L4 知识库
- [ ] Agent 开放写入 API + 审计
- [ ] 作品集 / 简历一键导出
- [ ] 教师节点审核流程化（开题/中期/结题模板）
- [ ] 高校项目模板库
- [ ] Webhook / GitHub 集成
- [ ] 竞赛日历 / 课程绑定

## 测试债

- [ ] `tests/contract/tasks/**` — 五态全部转移边 + 非法边
- [ ] `tests/contract/board/**` — 筛选 / 分组 / moveTask
- [ ] `tests/contract/review/**` — 双端越权矩阵
- [ ] `tests/contract/worklog/**` — 工时汇总 / 完成度加权
- [ ] `tests/contract/{calendar,milestone}/**`
- [ ] `tests/contract/notify/**` — cron 扫描
