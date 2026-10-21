# 参考来源与采用取舍

本页集中保留已调研来源和设计决定，不重复功能清单、派工及验收。现行业务见 [DESIGN](DESIGN.md)，视觉标准见 [前端指南](FRONTEND-DESIGN-GUIDE.md)，实际检查见 [UX](UX.md)。2026-10-20 项目评估一节列出的来源已于本轮打开；其余历史链接仍保留当时调研事实，不代表本轮重新核对远端 PR 状态。

## 项目评估与登录视觉 · 2026-10-20

本次判断基于当前工作区源码、README/DESIGN/UX、13 个模块的公开入口及任务、AI、收藏的关键实现，并查阅下列外部一手资料。属于产品与工程抽查，不是完整安全审计、性能基准或全项目 GUI 验收；已有记录与本轮实测分别看 UX。当前定位适合“高校团队从目标到可验收成果的轻量协作平台”。

接续视觉迭代 rc.17 按用户要求改为浅蓝与深海军蓝、手机独立山海背景，并使用[厦门大学官方学校标识](https://www.xmu.edu.cn/sdgl/xxbs.htm)页面的校徽原图；原图与模型生成的建筑插画分别处理，来源和最终提示见[设计记录](design/login-rc17/README.md)。下文 rc.16 的红黑参考保留为当时取舍，当前视觉以最新设计记录为准。

### 已有优点与辨识度

| 观察 | 源码依据 | 用户价值 |
|---|---|---|
| 教学协作闭环完整 | tasks 状态机、结构化成果与逐项验收、delivery 通过版本引用 | 学生知道交什么，老师能按具体版本和要求反馈，完成不只是一张卡片移动 |
| 权限与数据一致性有基础 | identity 职务能力并集、service ACL、任务事务行锁、expectedUpdatedAt 与稳定请求键 | 前端入口和后端权限对齐，并发认领、旧稿覆盖和重复创建有明确保护 |
| 知识与工作有联系 | resources 正文/版本/引用保护、任务来源、按账号收藏与读取重验 ACL | 资料可以进入任务上下文，并作为后续查证的来源，超出单纯网盘目录 |
| AI 有明确的人为决定环节 | ai 的结构校验、受限检索、来源引用、规划预览和确认采纳 | 可以帮助整理真实课题，同时保留用户决定和教师验收权；“有 AI”本身不是独有创新 |
| Windows 交付考虑实际使用者 | start/stop、追加迁移、运行包与升级说明 | 便于课设展示和本机部署；已有运行包不代表当前候选增量已通过打包验收 |

### 完善顺序

| 优先级 | 具体缺口或风险 | 建议与完成信号 |
|---|---|---|
| P0，发布前 | rc.14/15 的浏览器待测项仍在，当前存在大量未提交的跨模块成果 | 冻结一个可演示版本，完成学生/指导老师两条核心链路、390px 与键盘检查，再做 Windows 全量测试/构建/升级；按实际提交和证据核对范围 |
| P0，对外部署前 | 抽查 auth 与 login action 未看到应用层登录节流/账号恢复实现，不能据此判断部署网关是否已有防护；演示账号与运维报错仍会展示 | 对照 OWASP 核验部署层限流、恢复流程和日志脱敏；生产与演示环境分别配置入口。此项是后续单独授权的登录安全工作，本轮保持认证语义不变 |
| P1，首次成功使用 | 13 个模块及较多入口增加新成员认知负担 | 按“加入团队 → 找到项目 → 认领任务 → 提交成果”提供角色相关下一步，空状态直接给已有真实操作；用新成员首次完成该链路的观察结果检验 |
| P1，页面一致性 | 知识阅读、任务抽屉、AI 规划、通知与项目上下文的交互在多轮演化，部分旧设计文档仍写模型未接入 | 统一返回、保存/取消、来源、筛选和错误表达，核对当前能力说明；登录本轮已采用局部独立视觉，并修正文档中相关过时描述 |
| P1，检索与性能 | 收藏逐条经 ACL 读取，最多 1000 条；AI workspace 约千行，服务端配置与收藏采用文件存储 | 先量测真实数据规模下的检索/首屏时间和请求数，再由各 Owner 分页、批量权限查询或拆分视图；备份应包括配置、收藏文件与解密所需密钥，部署多实例前明确共享存储策略 |
| P1，AI 可理解性 | 对话/附件仍是浏览器副本；不同模型的格式、引用与采纳稳定性需要持续核对 | 持续清楚展示提供商、发送范围、来源版本、失败/取消结果与确认差异；为真实典型课题保留可重复的质量样例，不能以 JSON 合规代替事实准确 |

本轮只实现登录展示与相关文档，不借评估改动其他 Owner 的业务、登录防护、存储结构或依赖。优先级表示建议顺序，不是已安排的开发承诺。

### 值得验证的创新方向（未实施）

1. **成果证据链视图**：把已有资料来源、任务验收要求、固定提交版本、评审结论与阶段交付按同一任务串起来，明确指出缺少哪个环节。先用现有公开契约做只读视图，收益是答辩/复盘时能解释“依据什么完成”。
2. **提交前证据体检**：用户主动选择提交版本，由 AI 对照逐项要求列出“找到证据 / 缺少证据 / 无法判断”，附引用并生成可编辑自检建议，最终仍由用户提交和老师验收。可与 Moodle 的显式评价标准思路比较，但不直接引入打分系统。
3. **阶段成长叙事**：基于现有里程碑和真实通过版本，生成“目标—关键产出—修改—完成”的可核验摘要；支持个人确认后的项目汇报草稿，不新增作品集、甘特或 Sprint 模块。
4. **可解释贡献**：沿用实际任务和验收记录，补充贡献来源与统计口径，允许按任务展开核对；不能用任务数、工时或 AI 推断给成员能力、诚信或最终成绩下结论。

### 外部参考与采用边界

以下来源于 2026-10-20 打开核对。对本项目的适配与优先级是本次推断，不代表来源产品提供了本仓相同功能。

| 一手来源 | 本次吸收 | 取舍 |
|---|---|---|
| [Persona 5 Royal 官方网站](https://persona.atlus.com/p5r/) | 红黑高对比、倾斜标题、纸片与漫画式层叠的视觉方向 | 用校园建筑重绘，标题和介绍均为 HTML；按用户反馈去掉人物，不使用游戏角色或原站标志 |
| [厦门大学建南楼群介绍及照片](https://archt.xmu.edu.cn/info/1013/12593.htm)、[嘉庚楼群](https://news.xmu.edu.cn/info/1047/41865.htm) | 建南大会堂的飞檐、石墙、柱廊、台阶与嘉庚楼群轮廓 | 官网照片仅作建筑参考，生成无人物的风格化拼贴；非实景测绘，不代表学校官方产品或授权背书 |
| [Linear 官网](https://linear.app/)、[My issues](https://linear.app/docs/my-issues) | 一句价值主张、清晰操作、围绕个人待处理事项组织工作 | 登录页只讲任务/知识/AI 三项已实现能力；业务页面保持原有品牌与五态，不把宣传视觉扩散到工作区 |
| [Notion 项目与任务](https://www.notion.com/help/guides/getting-started-with-projects-and-tasks)、[Wiki 与验证页面](https://www.notion.com/help/wikis-and-verified-pages) | 文档与项目相邻、知识可检索且来源/责任明确 | 沿用当前知识库与来源版本，页面验证和知识时效只作未来参考，不宣称已经实现 |
| [Plane Academy](https://academy.plane.so/) | Work/Wiki/AI 的能力分层、工作上下文附近使用 AI | 减少平级功能堆叠，保留本仓模块契约；不搬入 cycles 或通用 Agent 执行体系 |
| [Moodle Rubrics](https://docs.moodle.org/503/en/Rubrics) | 显式评价标准与教师判断 | 强化已有逐项验收和证据预检；不新增自动评分与成绩实体 |
| [W3C 表单通知](https://www.w3.org/WAI/tutorials/forms/notifications/) | 可见错误、字段关联与辅助技术通知 | 登录错误 role=alert 并关联字段；注册和飞书配置提示用 status，等待时防重复 |
| [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) | 登录节流、账号恢复、通用认证错误与监测的核验依据 | 记录后续对外部署检查项，本轮不改锁定认证文件或假设网关配置 |

视觉资源、最终生成提示与实际截图见 [登录设计记录](design/login-rc16/README.md)，实际验收与限制见 [UX](UX.md#051-rc16-登录展示与项目评估--2026-10-20)。

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
| [Notion 知识库与 Tatami 设计系统](NOTION-RESEARCH.md) | 纸质底色（#fffefc）、墨黑文字（#37352f）、平滑阴影、150/200ms 阻尼、Private/Shared/Team 空间三维隔离、移动端单列扁平化与键盘吸附栏、Verification 时效认证与双向引用 | 详见专用调研报告（含代码级组件规范与 ADR 架构记录）；本平台通过 resources 目录与阅读器逐步吸收，不增加破坏性依赖与复杂协同冲突 |

逐项打回的问题位置/通过条件、提交后目标冻结、指定提交版本评审，以及交付仅绑定真实通过版本，均为本平台的业务决定，不宣称飞书/GitHub 使用相同状态机。阶段交付不要求代码仓库或 GitHub 账号。

## 本地 AI 界面

| 来源 | 采用与限制 |
|---|---|
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[ui-chat](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/README.md)、[ui-attachment](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-attachment/README.md) | 会话/输入区分层、附件卡片、本地提纲与插件状态；只参考交互，不移植运行时 |
| [Harnss](https://github.com/OpenSource03/harnss)、[Open WebUI](https://github.com/open-webui/open-webui) | 会话列表、搜索与移动抽屉；不是官方 DeepSeek Chat 源码或已接入引擎 |
| [Codex 插件](https://developers.openai.com/plugins/concepts/plugins)、[图片输入](https://learn.chatgpt.com/docs/image-inputs)、[Claude 文件入口](https://support.claude.com/en/articles/8241126-upload-files-to-claude) | 独立文件上下文、加号/拖放入口、本地技能与未接入服务分组 |

当前存储和限制统一见 [AI](AI.md)。未生成模拟回复、思考、执行进度或任务自动写入；配置草稿不表示模型已连接。

## Agent 技术调研 · 2026-10-14

用户提出规划拆解、交付预审、资料问答与健康审计四类辅助 Agent。本轮结合现有公开契约形成 [分阶段方案](ROADMAP.md#agent-资料与工程协作方案--2026-10-14)，以下官方资料仅用于技术判断，没有引入对应依赖或运行时。

| 官方资料 | 学习重点与本项目取舍 |
|---|---|
| [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) | 中断依赖 checkpointer 与 thread_id，恢复会重新执行节点；可靠审批需要持久化与副作用幂等，不代替任务五态 |
| [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | 传输授权与令牌绑定；后续对外连接还需应用自身 ACL、委托范围与撤销，当前不部署 MCP Server |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | 区分工具调用与结构化响应；Schema 有支持范围，拒绝/不完整输出需处理，Zod 与业务校验保留，不宣称消除全部错误 |
| [GraphRAG 索引方式](https://github.com/microsoft/graphrag/blob/main/docs/index/methods.md)、[LightRAG](https://github.com/HKUDS/LightRAG) | 图索引存在成本/质量与运维取舍；先评测既有资料互链和任务依赖查询，不承诺优于其他检索方案 |
| [Yjs 协作编辑示例](https://docs.yjs.dev/getting-started/a-collaborative-editor) | 同步编辑作为独立能力；需要本平台补齐权限、审批与历史证据，不直接让 AI 以虚拟成员修改文档 |
| [Transformers.js WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu) | 浏览器 GPU 推理是可选执行环境；必须实测设备支持、模型大小与延迟，不等于物理隔离或零运行成本 |

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

所有参考按本仓约束自行实现，未复制外部源码、图形或整套产品。高级 Agent、同步、实时编辑和通信的未实施边界见 [ROADMAP](ROADMAP.md)。

## 真实模型配置参考 · 2026-10-15

按用户指定参考 [CC Switch 添加供应商](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.1-add.md)与[编辑配置](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.3-edit.md)，采用服务名称、API 地址、直接密钥、模型和接口格式等配置项；在本平台独立实现，不读取其本机配置或凭据，不宣称完全兼容其导入格式。

真实请求按 [OpenAI 文本生成](https://developers.openai.com/api/docs/guides/text)与 [Anthropic Messages](https://platform.claude.com/docs/en/build-with-claude/working-with-messages)适配 Chat Completions、Responses 和 Messages；使用原生 HTTP/HTTPS 和现有 Zod，不引入 SDK。不同服务支持的模型/参数仍需用户自己的连接测试；受控本机 HTTP 服务检查真实网络收发与错误边界，不能代替外部服务的密钥、计费和模型质量验证。

用户随后提供需求工程教学建议。本轮采用“需求先澄清、验收要求原文检查、结构化建议由本人采纳”，参考[用户故事生成与质量评估研究](https://arxiv.org/abs/2507.15157)关于清晰评价规则和生成多样性的讨论；不把研究中的实验评分当作本项目效果保证。借鉴 [Spec Kit](https://github.com/github/spec-kit) 的结构化成果和可选流程，不整套迁移 CLI 或强制固定用户故事句式。虚拟客户、需求变更演练、多角色评审、代码同步与自动成绩均未随本轮实现。

## 多服务商与连接诊断 · 2026-10-16

按用户要求参考 [CC Switch 主界面切换](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.2-switch.md)：采用多张提供商卡片、明确使用中、保存与切换分离。平台配置集中在个人设置，按服务器账号加密保存；不导入 CC Switch 的其他应用凭据。

本机指定模型域名解析为 `198.18.*`，与 [MetaCubeX Fake-IP 配置](https://wiki.metacubex.one/config/dns/#fake-ip-range)的虚拟地址模式相符；这是本机观测，不代表域名真实部署在该网段。参考 [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) 和 [Node 双栈连接](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener)，保留默认地址限制、固定已核验DNS、TLS校验和拒绝重定向，仅对本人指定服务设置完整origin例外。401无密钥响应只能证明网络可达。

用户提供的仓库诊断部分针对旧版本：当前已有真实模型执行、结构化验收要求与提交快照，历史工时只保留数据且写入入口停用；兼容创建接口仍可能产生缺验收项的旧式任务，不能将GUI发布约束写成所有旧接口都强制完整。教师/管理员权限来自职务能力，不使用学术身份授权。本轮采用配置集中、写入幂等、冲突保护、真实日期和中断处理；没有据此新增需求表、Sprint或自动成绩。

## DeepSeek Harness 文档工具参考 · 2026-10-16

用户确认参考 [DeepSeek 官方 Harness](https://github.com/deepseek-ai/deepseek-harness)。研究其工具分层及社区 [dsh-document](https://github.com/jiaoqsh/dsh-document) 的文档文字、位置和分页读取设计，以及 [web-ppt](https://github.com/unStone/dsh-plugin-web-ppt) 的演示文件读取方向。在现有模块内实现受限读取与引用，不安装整个 Harness、不执行第三方插件代码、不导入其他应用密钥或借用本机任意目录权限。

实现范围以真实解析和测试为准：PPTX/DOCX文字、平台资源权限与受限工具调用。社区插件支持的格式不能直接当作本平台能力，不能将图片识别、旧版Office、PDF OCR、XLSX或写回文件描述为已实现。插件管理目录检索未返回可直接连接的DeepHarness插件；本轮是参考机制实现平台适配，不宣称插件已安装。

## 插件库、MCP 与确认采纳 · 2026-10-16

参考 [Open WebUI 工具分类](https://docs.openwebui.com/features/extensibility/plugin/tools/)与[MCP连接说明](https://docs.openwebui.com/features/extensibility/mcp/)，将平台内置工具、外部工具服务和快捷提问分开呈现。采用发现工具、明确显示可调用项、逐项开关和真实处理反馈；工具设置按账号保存在服务器。未采用上传任意Python/JavaScript在网站进程执行的插件模式。

参考 [MCP 2025-06-18 Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)及[工具契约](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)，实现范围固定于明确支持的协议版本、初始化、工具发现和调用。会话标识随请求传递，JSON/SSE响应受限处理，调用可取消且有时间/次数边界；不将最新草案、stdio启动器、旧SSE或OAuth描述为默认兼容。工具只读注解是服务方声明，不是可信证明，平台仍要求本人信任连接并逐项启用。

参考 [DeepSeek Harness MCP桥接](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/mcp.md)的服务命名隔离、发现与执行边界。工具可以给文本模型提供文档文字、外部识别或转录的文字结果；返回图片本身不会使文本模型获得视觉能力，未配置实际识别服务时不得标记为已识别。本轮不安装或执行第三方插件代码，不自动取得本机文件或其他软件凭据。

需求扩展采用独立建议和前后对比：已知任务事实与待确认问题分开，扩展默认不采纳；本人选择后经现有任务权限、版本和目标冻结检查保存。规划路线仍为可讨论的工作安排，真实任务树须通过原规划确认创建入口，不借建议自动调整任务状态、负责人或验收结论。

## 交互式AI输出与改进请求 · 2026-10-16

按用户要求阅读外部项目README及官方交互文档，按当前Next.js、React、Zod和Radix边界适配机制，不整套引入框架或改变已选模型。研究材料中的安装、脚本和云服务配置仅是参考内容，不作为执行授权。

| 已阅读来源 | 采用机制与本仓边界 |
|---|---|
| [OpenAI ChatKit Widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets)、[Actions](https://developers.openai.com/api/docs/guides/chatkit-actions)、[UI Guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines) | 以摘要/路线/确认卡片组织输出，操作有等待与结果反馈；动作输入仍不可信，服务端再次校验账号、版本和权限。不安装ChatKit，不依赖特定模型 |
| [A2UI README](https://github.com/a2ui-project/a2ui/blob/main/README.md) | 声明式数据与客户端渲染分离，只映射预先定义的组件；不执行模型生成代码，不宣称本平台完整兼容A2UI协议 |
| [json-render README](https://github.com/vercel-labs/json-render/blob/main/README.md) | 有限数据结构、组件目录和动作白名单；使用现有Zod/React实现本项目所需卡片，不接受任意布局、网络地址或函数名 |
| [CopilotKit README](https://github.com/CopilotKit/CopilotKit/blob/main/README.md) | 将对话、界面状态和用户决策连起来，建议先展示再由人采纳；不新增其运行时或Agent编排框架 |
| [MCP Apps README](https://github.com/modelcontextprotocol/ext-apps/blob/main/README.md) | 参考工具结果与交互界面分层的设计；当前MCP连接只采用真实文字结果，不把远程HTML直接放进本平台页面，不称已支持任意MCP Apps |

生成结果只可表达摘要、待确认问题、路线和变更建议。提案中列出问题、建议、验收要求、影响与风险；用户明确范围为项目任务、需求和规划的修改，选中后进入现有规划的预览/确认创建流程。模型结构不合规时保留实际文本，不拼造卡片或伪称操作成功。任务目标修改另走真实任务版本检查及确认保存。

## 知识库阅读与收藏 · 2026-10-19

结合本地 NOTION-RESEARCH 的渐进展开与移动单列建议，核对 [MarkText](https://github.com/marktext/marktext) 和 [Outline](https://github.com/outline/outline) 的官方仓库，参考简洁 Markdown 阅读及知识导航方向，自主实现文章目录、阅读字号/宽度、资料排序、按需展示评论关联和独立个人收藏。不移植其运行时，不把本地 Notion 报告中的内部协议与性能宣称作为本仓已验证事实。收藏不等于关注或团队置顶，沿用实时资料 ACL。

本轮接续采纳 NOTION-RESEARCH 的页面主体、面包屑、淡色导航与渐进展开方向，直接改变资料库信息布局，保留本仓文件/文档模型，不将界面相似等同于完整 Notion 功能。
