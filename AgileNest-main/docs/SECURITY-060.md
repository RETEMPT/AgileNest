# 0.6.0 账号与 API 配置检查

2026-10-21，按用户要求保留演示和历史业务数据，重点防止个人 API 配置进入 GitHub 或运行包。本文记录实际措施和验证边界，不表示已完成独立渗透测试。

## 已修复

- 浏览器请求携带页面账号，服务端将它与实际会话比较，错配返回409；账号头不能代替登录、指定操作者或绕过现有 ACL。同一浏览器其他标签切换/退出账号后，旧页面停用并取消请求，恢复焦点时另行核对会话。共享界面在账号变化时整体重新挂载。
- API 通用异常与登录 action 不再记录完整异常链、查询或连接对象。模型和 MCP 凭据仍按账号在服务器加密保存，摘要与导出不返回密钥；模型响应意外回显当前 API 密钥时替换为隐藏提示，模型列表排除包含该密钥的异常名称。
- 三处文档/测试示例中的个人服务端点改为保留示例域名；不改本机实际配置。临时检查目录加入 Git 与代码规范忽略规则，避免缓存进入提交。
- 修正动态文件读取导致的构建过度追踪：账号配置读取声明为运行时数据，追踪排除账号目录和源码/工具/缓存。Next standalone仍可能自动带入环境文件，因此打包只复制运行必需文件、排除本地环境和数据，并增加发布前失败即停止的敏感信息扫描；中间产物不能直接分享。
- Windows 运行包把服务商、插件和个人收藏保存到本安装的 `data/private`，随完整 data 和原加密密钥一起备份、升级，不继承其他安装的存储路径。

## 核对方式

`node scripts/release/audit-private.mjs --history` 读取本机实际密钥和私有端点，仅在内存中比较待发布文件及 HEAD、origin 分支和标签的可达历史。输出只有文件名、对象标识和问题类别，不输出命中值；不推送的编辑快照不属于发布历史。

`node scripts/release/audit-private.mjs --bundle <解包目录>` 检查包内环境文件、运行数据、加密配置和常见凭据格式，并与本机实际值比较。打包命令自动执行同一检查；只分享原始未运行 ZIP。默认演示账号和公开测试库凭据可以保留。

新增契约覆盖账号一致/错配/未登录、账号头不可冒充身份、请求取消、版本冲突区分、响应无账号详情、日志脱敏和构建包门禁。最终测试与产物结果见 [UX](UX.md) 和 [Release](RELEASE.md)。

## 边界

账号 namespace 并不是浏览器存储的加密或访问控制：AI 对话、规划和附件仍在本机浏览器，使用共用电脑时应使用独立浏览器配置或系统账号；API 密钥不在这些浏览器副本中。已发往本人选择的模型/MCP服务的数据受该服务规则约束。本轮不更换认证库，不调整既有登录语义，不删除本机业务资料，也未验证真实飞书 OAuth。

参考 [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) 的逐请求授权要求、[HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) 的浏览器敏感信息存储边界，以及 [Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) 的文件追踪配置。动态读取声明还参考了[官方仓库的对应问题记录](https://github.com/vercel/next.js/issues/95125)，最终以本机实际构建和运行包验证为准。
