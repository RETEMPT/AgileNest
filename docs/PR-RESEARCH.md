# GitHub PR 调研与落地 · 2026-10-03

核对了本仓开放 PR，以及 Plane、OpenProject 的相关 PR 详情与差异。这里记录采用的设计思路；本轮实现使用仓库现有组件和契约，没有移植外部项目代码或增加依赖。开放/关闭状态是本次观察时的快照，不表示开放 PR 已得到上游认可。

| 来源与观察状态 | 值得保留的地方 | 本项目落地 |
|---|---|---|
| [AgileNest #1](https://github.com/RETEMPT/AgileNest/pull/1)、[#2](https://github.com/RETEMPT/AgileNest/pull/2)，开放，10-02 更新 | 任务状态共享、模块边界、稳定卡片排序、URL 筛选、真实成员选择、契约测试 | 看板调用任务状态入口，任务按 sortOrder/createdAt 排序；视图切换保留筛选；指派按姓名选择，不手填 ID |
| [Plane #9902](https://github.com/makeplane/plane/pull/9902)，09-28 创建，开放 | 组操作和单条操作共用可编辑权限，避免界面显示操作后 API 拒绝 | 共享场景能力计算，权限决定拖动把手与合法目标；成员职务、身份确认仅显示给管理员 |
| [Plane #9810](https://github.com/makeplane/plane/pull/9810)，09-10 创建，已关闭、未合并 | 状态配置权限与其他管理动作一致，并为非管理员增加拒绝用例 | 保留五态定义，不向队长开放验收；增加课程/实验室/竞赛范围、撤权和非法跳转测试 |
| [OpenProject #25464](https://github.com/opf/openproject/pull/25464)，09-24 合并 | 共享交互菜单的描述信息，消费端保持已有布局 | 职务标签、说明和权限统一来自 identity/client；成员卡片、设置页、负责人选择沿用现有 Badge/Button/tokens |
| [Plane #9014](https://github.com/makeplane/plane/pull/9014)，05-05 合并，历史参考 | 检查请求人的管理员权限，而非目标成员的角色 | 职务与确认操作检查操作者权限，并重新核对目标团队归属；事务中再次核对管理员权限 |
| [Plane #8801](https://github.com/makeplane/plane/pull/8801)，03-26 合并，历史参考 | 不同布局共用语义样式 | 复用既有品牌蓝、点缀色与状态徽章，不为身份模块新增颜色系统 |

本仓 #1/#2 的来源是 `hina-0219-p/AgileNest:main`，目标分别为本仓 `feature/tasks-status`、`feature/board-views`，两者当时具有同一组 19 个变更文件。它们属于协作者分支交付；本轮审阅其思路，不代替 Owner 自动合并、关闭或改目标分支。本次完整体验与权限改进在 `codex/workspace-workflow` 提交 PR 到本仓 `main`。

[OpenProject 角色权限文档](https://www.openproject.org/docs/system-admin-guide/users-permissions/roles-permissions/)支持同一用户承担多个角色和按项目授予权限。本项目结合高校场景，将本科/硕士/博士/老师留作资料，将管理员/指导老师/队长/队员留作团队职务；权限按项目种类计算。飞书的多视图、成员选择和侧边任务详情取舍见 [UX.md](UX.md)。

没有采用通用软件“提交即完成”的语义，只有验收通过才是已完成；没有引入自定义工作流、Sprint、甘特、AI、学籍认证或实验数据文件库。规则与升级说明见 [IDENTITY.md](IDENTITY.md)。
