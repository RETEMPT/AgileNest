# AI 对话界面与草稿

本轮由用户确认先完成侧栏入口、统一风格的对话界面和本地草稿。登录后从侧栏“AI 对话”进入 `/ai`；桌面展开/折叠导航、移动导航均可使用，当前入口显示选中状态。

## 当前能力

- 新建、切换、搜索、重命名和删除对话草稿。删除需要确认，取消和 Esc 不改内容。
- 输入在停止编辑 450ms 后保存，失焦、切换草稿或离开页面时补保存；Ctrl / Cmd + Enter 手动保存，Enter 换行，输入法组合回车不会触发保存。
- 规划项目、拆解任务、准备验收、课题讨论只将提示提纲加入草稿，已有输入保留。复制使用浏览器剪贴板；无法访问剪贴板时选中文本供手动复制。
- 保存失败显示原因并保留当前输入；无法解析的已有草稿不覆盖。草稿最多 40 份，每份 6000 字，名称 40 字。
- 存储键为 `agilenest:ai-drafts:v1:<userId>`，按当前会话账号区分。此为当前浏览器存储，不是服务端权限边界，也不跨设备同步；清除浏览器数据会清除草稿。

## 接入边界

页面明确标记“界面预览 / 未连接模型”，发送按钮禁用。没有模型请求、模拟回复、Agent 调度、工具执行或自动任务读写；不收集模型密钥、不新增 AI SDK、数据库表或 API。现有 Credentials、飞书和 JWT 登录保持原样。

三级 Agent 与模型执行继续列在 [ROADMAP.md](ROADMAP.md)。后续接入需另行确认模型供应商、服务端凭据管理、会话数据范围、流式失败/取消和任务写入审核。

## 设计参考

- [DeepSeek Harness ui-chat](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/README.md)：参考对话正文与过程信息分层、简洁主区；本轮没有执行过程，不展示虚构过程行。
- [Harnss](https://github.com/OpenSource03/harnss)：参考会话列表、切换与内容搜索。仓库说明当前在早期开发及重写中，仅借鉴交互，不引入其运行时。
- [Open WebUI](https://github.com/open-webui/open-webui)：参考桌面与移动端一致的对话入口。沿用本仓品牌蓝、浅色背景、细线图标、Button/Input/Badge 和 Radix 弹窗，不移植代码、标识或字体。

具体范围与 Owner 见 [TEAM.md](TEAM.md)，页面验收见 [UX.md](UX.md)。
