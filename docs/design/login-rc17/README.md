# 浅蓝登录页与独立手机背景

2026-10-20，候选 0.5.1-rc.17。用户要求手机不再复用桌面背景、改用浅蓝并加入厦门大学校徽，随后明确“浅蓝偏淡，增强深浅对比”。桌面保留建筑拼贴，手机采用重新构图的山海校园全景；深海军蓝的标题、按钮、框线与外框强化层次。

## 资源

| 资源 | 文件 | 尺寸/体积 | 来源 |
|---|---|---|---|
| 桌面建筑拼贴 | [campus-desktop-blue.webp](../../../public/images/login/campus-desktop-blue.webp) | 1536×1024 / 382460 字节 | 内置 imagegen 对上一版建筑图进行配色重绘 |
| 独立手机全景 | [campus-mobile-blue.webp](../../../public/images/login/campus-mobile-blue.webp) | 960×640 / 84390 字节 | 内置 imagegen 参考建南楼群实景另行构图，并压缩为手机资源 |
| 厦门大学校徽 | [xmu-emblem.jpg](../../../public/images/login/xmu-emblem.jpg) | 150×150 / 40038 字节 | [厦门大学官方学校标识页](https://www.xmu.edu.cn/sdgl/xxbs.htm)公开原图，保留原始文件与比例，未由模型生成 |

建筑照片来源：[厦门大学建南楼群介绍](https://archt.xmu.edu.cn/info/1013/12593.htm)的正面照片/全景，建筑背景是风格化重绘。网页文字、功能卡片和校徽与插画分开渲染。外部校徽链接只打开官方来源，不改变本站认证入口。

## 响应式与颜色

- 1000px 及以上，左侧大幅建筑拼贴、右侧表单；999px 及以下用 picture 的媒体条件选择独立手机图，不用桌面图片裁切替代。
- 手机表单先显示，后续插画为约250px高的全景，功能介绍放在下方自然排版，避免卡片盖住建筑。
- 主内容面 #f5faff，文字/主按钮 #143c60，浅蓝背景 #c7e5f4，强调 #87bfdf，外框 #102e4b。业务页面的全局主题不变。
- 计算对比度：主要文字/内容面约10.84:1，辅助文字约5.97:1，输入边界/白底约3.12:1，表单焦点/内容面约5.76:1；这不是全站 WCAG 验收结论。

## 最终生成提示

使用内置 imagegen，未使用 CLI/API 脚本调用。生成 PNG 保留在工具默认位置，网站引用的最终 WebP 已保存到上述仓库路径。

### 桌面图

输入是 rc.16 的无人物校园建筑插画。

```text
Use case: style-transfer. Edit the supplied architectural screenprint into a LIGHT SKY BLUE edition for an existing university project collaboration login page. Preserve the recognizable Xiamen University Jiannan Auditorium with layered swallowtail eaves, stone facade, tall columns and broad stairway; keep the smaller Jiageng tower, mountains, sea and palms. Replace EVERY red/vermillion/orange region with very pale sky blue #c7e5f4 and brighter powder blue #9bcce8; replace black with deep academic navy #174669, and warm cream with cool white #f7fbff. Overall airy, fresh and light, blue dominant, refined architectural ink engraving with gentle halftone and subtle torn-paper shapes. Keep top 35 percent predominantly clear pale-blue sky for HTML headings. Main auditorium centered in lower 65 percent, recognizable in tall centered crop. Wide 3:2 composition. No people, silhouettes, human shapes, statues, cars, text, logos, badges, letters or watermarks. Do not add a university seal: it will be rendered separately from an official asset. Maintain crisp layered editorial poster style with much lighter contrast and more white space. No gradients. Full bleed.
```

### 手机图

输入是官网文章中的建南楼群全景照片；手机图为独立构图。

```text
Use case: illustration-story. Create a separate MOBILE-SPECIFIC architectural artwork for a university collaboration website, NOT a crop of a desktop poster. Use the supplied real Xiamen University Jiannan complex panorama as architectural reference only. New composition: minimalist wide horizontal coastal campus panorama at a distance, with a small elegant navy-outline Jiannan Auditorium at center-right, the slim Jiageng tower on the left, layered low campus rooflines, distant soft mountains, a few delicate palms, and a broad empty sea foreground. Large clean pale sky fills upper HALF, campus buildings occupy a thin band across the lower middle, pale sea waves at bottom. Flat airy screenprint / refined architectural line illustration, navy blue #174669, powder blue #9bcce8, very pale sky blue #dbeef8 and cool white #f7fbff. Landscape 3:2 image, intentionally sparse with restrained fine lines, less detail and NO torn-paper shards or heavy dramatic perspective. This must read as a quiet mobile travel-sketch illustration, distinct from the desktop grand auditorium collage. No people, silhouettes, faces, statues, cars, text, annotations, logos, seals or watermark. No red, no orange, no black. Draw roof shapes from architectural reference without reproducing reference annotations.
```

## 页面证据

- [桌面](login-desktop.jpg)
- [手机首屏](login-mobile.jpg)
- [手机独立背景与功能切换](login-mobile-background.jpg)

实际尺寸与键盘检查见 [UX](../../UX.md#051-rc17-浅蓝主题校徽与独立手机背景--2026-10-20)。旧红色设计和上一轮测试保留在 [rc.16 记录](../login-rc16/README.md)，不作为当前配色。

