# lyongl
这是我的个人网站

## 作品集网站

访问 [lyongl.xyz](https://lyongl.xyz/)。GitHub Pages 从 `main` 分支的 `docs/` 目录直接发布静态文件。

2026-10-26 更新为庭院首页、水下作品画廊、穿云探索页和关于与联系页面，包含当前的封面悬停、镜头转场与背景音乐。网站的 HTML、CSS、JavaScript 和资源均保存在 `docs/`，无需在线构建。

- 首页：`docs/index.html`
- 作品与 10 个作品详情：`docs/projects/`
- 探索：`docs/explore/`；卡片内容和入口在 `docs/deep-sea.js`
- 关于与联系：`docs/about/`

探索中的独立项目保留原文件和地址：[ADAS 场景](https://lyongl.xyz/adas/)、[路有谱](https://lyongl.xyz/luyoupu/)、[CHROMAFALL](https://lyongl.xyz/danmugame/)、[星际外勤](https://lyongl.xyz/game-demo2/)。后续更新作品集时保留这些目录、旧的共享 `docs/assets/` 文件及 `docs/CNAME`，不要清空整个 `docs/`。`docs/.nojekyll` 让 Pages 直接提供静态资源。

2026-10-27 修复首屏慢速加载：20 秒后允许静态浏览，但继续加载庭院，完成后自动恢复动态场景；确认失败时提供重试。首页和深链接统一使用带版本号的脚本及样式。回归检查：`node --test tests/scene-recovery.test.mjs`。

备用首页使用真实庭院渲染器导出的截图，分别适配 1920×1080 桌面、3440×1271 超宽屏和 390×844 手机（2 倍像素）。文件为 `docs/assets/hero-courtyard-poster*.webp`，已包含场景标题；静态模式保留可访问的标题、可点击作品入口和加载失败重试，不再重复绘制标题或叠加调色与颗粒。

返回首页的水面镜头通过 `docs/home-return-motion.js` 按真实相机离水高度限制下潜距离。返回为 2.4 秒三次缓动，位移由归一化进度连续计算，避免大屏穿过水面、微小位移被动画库舍入和指数缓动产生的停顿。画廊退至不可见后停止其额外绘制；进入作品仍保留原有 3 秒节奏。回归检查：`node --test tests/*.test.mjs`。

手机开场的加载条直接包含在 HTML 中，脚本下载期间也可显示；随后按实际资源完成数量和首帧生成阶段更新进度。庭院首帧会等待字体生成，并主动预渲染文字、反射和水面，不依赖隐藏 iframe 的动画帧。20 秒后可先浏览静态首页，45 秒仍未完成则结束该次加载，保留低负载重试入口。`docs/scene-start.js` 让手机优先准备庭院，之后再加载画廊；作品详情的海面仅在进入详情时初始化。

## 弹幕小游戏

[打开 CHROMAFALL · 霓虹颜料领地](https://lyongl.xyz/danmugame/)

网页版支持对局与技能演示；MP4 导出需本地转换服务。
