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

作品画廊保留向后翻卷的效果，将卷曲幅度收小两成、滚动波纹收小三成；静止时的波纹再降至滚动时的约四成，停止滚动后平缓收敛。画面和链接点击区域使用相同的波纹强度。

## 作品集访问密码

首页、作品列表与详情、关于页面需要输入访问密码。探索页（含旧入口 `/#explore`）以及 ADAS、路有谱、CHROMAFALL、星际外勤及它们的子页面保持公开。从探索跳转到作品集也会显示密码界面。当前标签页解锁后刷新或继续浏览无需重复输入，关闭会话后恢复锁定。

访问界面在 `docs/access-control.js`、`docs/access-control.css`，共享标记由 `node scripts/prepare-access.mjs` 更新到所有作品集 HTML。GitHub Pages 仅提供静态文件；此功能是前端浏览门槛，无法替代服务器认证，也不会保护公开仓库或静态资源的直接访问。

## 弹幕小游戏

[打开 CHROMAFALL · 霓虹颜料领地](https://lyongl.xyz/danmugame/)

网页版支持对局与技能演示；MP4 导出需本地转换服务。

2026-10-28 同步重力感应与移动端加载优化：加载页瞳孔、庭院和云海共享倾斜输入，自动识别已有权限，并兼容方向、重力加速度及原生 Accelerometer；只有收到数据才显示连接状态。手机使用较小的 WebP 贴图，减少首屏下载及纹理转码，隐藏页面封面按需加载。保留已发布的桌面眼睛跟随、首次画廊转场和返程镜头修复。检查：`node --test tests/*.test.mjs`。

## 像素造物

[打开像素造物](https://lyongl.xyz/xszw/) · [源码](./xszw/)

全中文图像艺术工作台，支持图片与视频的五类实时效果、尺寸设置、本地收藏和六种导出格式。探索页已加入入口。源码位于 `xszw/`，GitHub Pages 发布文件位于 `docs/xszw/`。

更新后运行 `npm --prefix xszw ci`、`node scripts/build-xszw.mjs`，将源码和发布文件一起提交。原始算法版权声明保留于 `xszw/LICENSE` 与 `docs/xszw/LICENSE`。
