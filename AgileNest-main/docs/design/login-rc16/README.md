# 登录视觉与美术资源

2026-10-20 的实装记录。桌面左侧展示无人物的校园建筑漫画拼贴、倾斜标题和可切换功能卡片，右侧使用米白表单；999px 及以下表单在前，介绍在后。用户反馈首版人物效果不理想后，以厦门大学官网建筑照片作参考重绘并替换。宣传页用局部红黑米白 tokens，业务页面继续沿用全局品牌。任务协作、知识共建和 AI 搭档文案仅描述当前能力，未接入功能不作为卖点。

## 资源与来源

- 最终资源：[`public/images/login/campus-architecture.webp`](../../../public/images/login/campus-architecture.webp)，1536×1024，408398 字节；从生成 PNG 转为 WebP 以降低页面传输体积。
- 使用内置 imagegen 工具重绘建筑。照片参考来自[厦门大学建筑与土木工程学院建南楼群文章](https://archt.xmu.edu.cn/info/1013/12593.htm)的建南楼正面及楼群全景，辅以[嘉庚楼群介绍](https://news.xmu.edu.cn/info/1047/41865.htm)。照片只作为生成输入，不随网站分发；画面是风格化建筑重绘，非实景测绘。图中的文字均在 HTML 中单独实现。
- 风格参考：[Persona 5 Royal 官方站](https://persona.atlus.com/p5r/)；内容层级参考 [Linear](https://linear.app/)。详细项目评估与其他一手来源见 [PR-RESEARCH](../../PR-RESEARCH.md#项目评估与登录视觉--2026-10-20)。

## 最终生成提示

```text
Use case: compositing / style-transfer. Asset: replacement illustration for a university collaboration login page. Image 1 is ONLY the reference for vermilion-red/black/ivory screenprint palette, torn-paper collage and manga graphic texture. Completely replace its entire subject and scene; REMOVE ALL PEOPLE and all traces of human figures. Images 2 and 3 are architectural references from Xiamen University: Jiannan Auditorium and the Jiannan complex overlooking Shangxian sports field, the coastal campus with the taller Jiageng roofed tower. Redraw these architectural features into an original premium editorial architectural print, preserving recognizable multi-tier Chinese swallowtail rooflines, symmetric stone facade, tall columns, broad empty terraced steps, lower wings and distant mountain silhouette. Composition: wide 3:2 landscape; keep the TOP 35 PERCENT mostly uncluttered solid vermilion red for separate website copy. In the CENTER and LOWER 65 PERCENT place a dramatic large three-quarter-front Jiannan Auditorium with crisp ivory stone walls and black shaded windows, layered with a smaller Jiageng tower and connecting campus buildings behind it, a few palm leaves, abstract coast wave shapes and angular paper shards. Keep the main auditorium in the central 50 percent so it survives a tall centered crop. The empty main staircase extends towards the bottom edge. Building-first composition, refined architectural linework, high-contrast black and warm ivory halftone, red background #e92e35, riso printing texture, layered paper-cut poster energy inspired by Persona 5 graphic art direction. Strict constraints: absolutely ZERO people, humans, faces, statues, silhouettes, crowds, characters or figurative outlines anywhere. No campus names or lettering, no signage, no captions, no watermarks, no UI. Do not reproduce red outline annotations or text from reference 3. Not photorealistic. No cars. No blue or green. No logos. Output a fully new scene, architecture only.
```

## 实际页面截图

- [桌面默认状态](login-desktop.jpg)
- [手机390×844布局](login-mobile.jpg)
- [数据库未启动的错误与输入保留](login-error.jpg)，使用合成邮箱/测试字符串，未填写用户真实密码。

截图来自当前页面，非生成的 UI 概念稿。浏览器完整截图输出会扣除滚动条宽度，390px 视口的页面内容宽度为375px；尺寸与溢出结论依据实际 DOM 测量。当前数据库未启动，成功登录与飞书真实授权未核验；详细操作与开发环境限制见 [UX](../../UX.md#051-rc16-登录展示与项目评估--2026-10-20)。
