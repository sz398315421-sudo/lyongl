# AR-HUD设计指南

v1.3 · 基础资料核验日期 2026-11-07

[打开在线指南](https://lyongl.xyz/arhud-guidelines/) · [车型布局研究](vehicle-layout-study.html)

本指南包括国内供应商与标准、HUD布局、字体与图标、状态和硬件适配。页面内提供光学换算、原图案例、来源索引及可下载的共享参数。

离线使用时下载 docs/arhud-guidelines 内的文件，打开 index.html。保留同目录的样式、脚本及 assets。引用来源网页需要联网。

第三方插图的发布方、版本和引用位置见[图片来源与使用说明](图片来源与使用说明.md)。Noto Sans SC 字体使用 [SIL OFL 1.1](assets/OFL-NotoSansSC.txt)。

## 功能与模式（2026-11-23 新增）

[HUD 功能与模式研究](vehicle-function-study.html)：26 款车型，22 款附原图；含功能释义、7 类驾驶场景、双车对照、逐车矩阵及国内外差异。指南头部新增“功能与模式”入口。

[完整矩阵 CSV](vehicle-function-matrix.csv) · [证据与图源 JSON](vehicle-function-evidence.json) · [原图索引](vehicle-function-figures.json) · [研究正文](HUD功能与模式研究.md)

离线可读；每车列明市场、版本、来源及待核验项。官方演示、手册图和媒体画面分开标注，未用绘制的 HUD 界面代替实际图源。

“功能含义与作用”的 22 项词条逐项附参考图，分别标注实车拍摄、车主驻车实拍、官方界面与技术示意，并说明观察位置和证据边界。新增参考图见 `assets/glossary-study`，逐项映射见 [功能图解索引](vehicle-function-glossary.json)。

## 统一导航与版式

设计指南、布局研究、功能与模式共用 `guide-shell.css` 和 `guide-shell.js`：头部采用文字导航及当前栏目下划线，各页面左侧只列自身章节。三页统一字体、白底蓝灰配色、内容宽度和标题层级；手机端目录改为可横向滚动的页内导航。保留同目录共享文件即可离线使用。
