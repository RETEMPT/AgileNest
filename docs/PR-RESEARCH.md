# 参考来源与采用取舍

本页集中保留已调研来源和设计决定，不重复功能清单、派工及验收。现行业务见 [DESIGN](DESIGN.md)，视觉标准见 [前端指南](FRONTEND-DESIGN-GUIDE.md)，实际检查见 [UX](UX.md)。外部链接是此前调研记录，本轮文档整理未重新核对远端 PR 状态。

## 任务、资料与团队协作

| 来源 | 采用内容 | 本平台取舍 |
|---|---|---|
| [飞书任务创建](https://www.feishu.cn/hc/zh-CN/articles/360741352378-%E5%88%9B%E5%BB%BA%E4%BB%BB%E5%8A%A1) | 目标、负责人、日期、子任务与内容上下文 | 单一负责人、五态、发布验收标准，不采用重复任务或多负责人规则 |
| [飞书任务附件](https://www.feishu.cn/hc/zh-CN/articles/650357724285-%E5%9C%A8%E4%BB%BB%E5%8A%A1%E4%B8%AD%E6%B7%BB%E5%8A%A0%E9%99%84%E4%BB%B6) | 内容附近上传、预览、下载 | 讨论附件与正式提交分别选择；单文件 10 MB，成果绑定不可变版本 |
| [飞书云盘](https://www.feishu.cn/hc/zh-CN/articles/778513900437-%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B%E4%BA%91%E7%9B%98) | 目录树、路径、就地创建和上传 | 同空间/分类八层目录，移动校验整个子树，旧混合目录兼容 |
| [飞书删除与恢复](https://www.feishu.cn/hc/zh-CN/articles/360049067425-%E5%88%A0%E9%99%A4%E5%92%8C%E6%81%A2%E5%A4%8D%E4%BA%91%E6%96%87%E6%A1%A3-%E6%96%87%E4%BB%B6%E5%A4%B9) | 可解释回收和原位置恢复 | 引用证据禁止回收，目录仅空目录删除；无递归/永久清除或自动过期 |
| [飞书文档](https://www.feishu.cn/hc/zh-CN/articles/945900971706-%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B%E6%96%87%E6%A1%A3) | 引文评论、姓名提及、原文上下文 | 保留原文版本、行号和提及快照；不伪造多人光标 |
| [权限 FAQ](https://www.feishu.cn/hc/zh-CN/articles/360044508113-%E4%BA%91%E6%96%87%E6%A1%A3%E6%9D%83%E9%99%90%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98)、[知识库权限](https://www.feishu.cn/hc/zh-CN/articles/821998241087-%E5%BF%AB%E9%80%9F%E4%BA%86%E8%A7%A3%E7%9F%A5%E8%AF%86%E5%BA%93%E6%9D%83%E9%99%90) | 评论/编辑/管理分层 | 当前团队读取范围；edit 不等于 manage，不宣称选定成员私有阅读 |
| [飞书管理员类型](https://www.feishu.cn/hc/zh-CN/articles/927897012636-%E7%AE%A1%E7%90%86%E5%91%98%E7%B1%BB%E5%9E%8B%E5%92%8C%E8%A7%92%E8%89%B2%E4%BB%8B%E7%BB%8D)、[OpenProject 角色](https://www.openproject.org/docs/system-admin-guide/users-permissions/roles-permissions/) | 日常管理与权限授予分开，多角色按项目授权 | 固定五项可叠加职务，学术身份不授权，无自定义角色后台 |
| [GitHub 依赖](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)、[标签](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels) | 任务关系与分类 | 同项目 DAG；阻塞时禁止提交/验收是本平台自行确定的规则 |
| [GitHub 订阅](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-subscriptions-for-activity-on-github/managing-your-subscriptions)、[飞书任务设置](https://www.feishu.cn/hc/en-US/articles/791692860649-task-settings) | 本人关注、未读、提醒与偏好 | 持久化站内消息；单一协作入口，气泡消失不标已读，无外部投递 |
| [Linear 看板](https://linear.app/docs/board-layout)、[筛选](https://linear.app/docs/filters)、[自定义视图](https://linear.app/docs/custom-views) | 同数据多视图、筛选条件、保存与分享 | URL 连续性、共享详情及本人保存项，分享不扩权 |
| [Linear My issues](https://linear.app/docs/my-issues)、[飞书工作台](https://www.feishu.cn/content/3c6y1qwl) | 个人待办、逾期和优先事项 | 当前 ACL 队列，按逾期/优先级/截止排列，无模拟健康分或趋势 |
| [Plane 详情](https://docs.plane.so/work-items/work-item-details)、[Pages](https://docs.plane.so/pages/overview) | 正文、属性、证据、活动分层与文档组织 | 当前/历史版本与可操作目标分开，只有验收通过才完成 |
| [Marker](https://github.com/datalab-to/marker) | Markdown/JSON 转换产物及原文件分开保留 | 导入真实产物；未安装 OCR/PyTorch 或运行识别，不称为 PDF 自动提取 |
| [Radix Alert Dialog](https://www.radix-ui.com/primitives/docs/components/alert-dialog) | 取消、确认、焦点与键盘环路 | 复用既有原语，等待防重复、失败保留输入，取消返回原状态 |

逐项打回的问题位置/通过条件、提交后目标冻结、指定提交版本评审，以及交付仅绑定真实通过版本，均为本平台的业务决定，不宣称飞书/GitHub 使用相同状态机。阶段交付不要求代码仓库或 GitHub 账号。

## 本地 AI 界面

| 来源 | 采用与限制 |
|---|---|
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[ui-chat](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/README.md)、[ui-attachment](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-attachment/README.md) | 会话/输入区分层、附件卡片、本地提纲与插件状态；只参考交互，不移植运行时 |
| [Harnss](https://github.com/OpenSource03/harnss)、[Open WebUI](https://github.com/open-webui/open-webui) | 会话列表、搜索与移动抽屉；不是官方 DeepSeek Chat 源码或已接入引擎 |
| [Codex 插件](https://developers.openai.com/plugins/concepts/plugins)、[图片输入](https://learn.chatgpt.com/docs/image-inputs)、[Claude 文件入口](https://support.claude.com/en/articles/8241126-upload-files-to-claude) | 独立文件上下文、加号/拖放入口、本地技能与未接入服务分组 |

当前存储和限制统一见 [AI](AI.md)。未生成模拟回复、思考、执行进度或任务自动写入；配置草稿不表示模型已连接。

## 成员 PR 与用户资料的历史取舍

下表保留来源与实际采用内容，不报告其当前开放/关闭状态，也不代表整单合并。

| 来源 | 保留内容与取舍 |
|---|---|
| [本仓 #1](https://github.com/RETEMPT/AgileNest/pull/1)、[#2](https://github.com/RETEMPT/AgileNest/pull/2)，同源提交 b4520a8732f6742d51362451756a5c1e7f8ea0dd | 稳定排序、URL 筛选、真实成员选择与契约；未采用三态白名单、手写角色按钮表、prompt 表单或无事务状态写入 |
| [本仓 #5](https://github.com/RETEMPT/AgileNest/pull/5)，提交 6a536e23a48c3d35a5d7f92b49a41dbc393cb5b5 | 子任务动作、详情编辑、成功刷新与混合职务工作台；适配现有 Radix/权限契约，未采用独立锁文件清理 |
| [本仓 #7](https://github.com/RETEMPT/AgileNest/pull/7) | 已接受的项目月历、跨天排期与日程；补齐历史月份、共同筛选和可见窗口展开，个人日程仍独立 |
| [Plane #9902](https://github.com/makeplane/plane/pull/9902)、[#9810](https://github.com/makeplane/plane/pull/9810)、[#9014](https://github.com/makeplane/plane/pull/9014) | 统一单项/组操作权限、拒绝用例、校验操作者而非目标；本平台仍以场景能力和五态为准 |
| [OpenProject #25464](https://github.com/opf/openproject/pull/25464)、[Plane #8801](https://github.com/makeplane/plane/pull/8801) | 共享菜单说明及不同布局的语义样式，沿用本仓 tokens 和组件 |
| 用户 schedule.docx、script.js.docx、路由注测.docx、数据库建表.docx | 个人归属、月 CRUD、日期/时间、优先级和索引；按 Next.js/Zod/PostgreSQL 重做，未移植 Java/Vue/MySQL，原资料只读 |

## 运行与验证来源

- [GitHub PostgreSQL 服务容器](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)、[checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)：隔离测试库、Windows 构建和已核对的固定提交。
- [npm 锁文件](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)：历史 CI 修复 optional/dev/peer 标记与平台可选依赖；保留版本，不新增依赖声明。
- [Next.js devIndicators](https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators)：移除遮挡入口的开发浮标，保留错误反馈。
- [Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)：独立运行包静态资源；Node/EDB 来源、版本、哈希与版权集中见 [RELEASE](RELEASE.md)。

所有参考按本仓约束自行实现，未复制外部源码、图形或整套产品。模型/SDK、同步、实时编辑和通信的未实施边界见 [ROADMAP](ROADMAP.md)。
