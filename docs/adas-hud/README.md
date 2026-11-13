# ADAS HUD

[打开 ADAS HUD](https://lyongl.xyz/adas-hud/)。

「蓝色光轨」和「HUD 光毯」可直接应用到当前道路场景。可继续使用原来的车道、视角、车辆、场景元素及动画控件。使用「应用预设视角」可切换到预设自带的镜头。

在普通道路上选择「蓝色光轨」，起始车道右侧有可用车道时，播放「右变道 · 路口右转」即可观看约 15 秒的演示。本车先驶入最右侧车道，随后在路口减速右转。HUD 光毯演示向左变道。在普通道路的三车道模式下关闭动态交通流，蓝色光轨会显示停在最左侧车道的旁车。开启「仅显示光毯」可单独预览光束。

桌面右侧和手机预览下方的设置区域可独立滚动。

「透明视频（WebM）」保留整段动画的 Alpha 通道，可叠加到其他画面上。导出前会验证浏览器编码是否保留透明度，建议使用 Chrome 或 Edge。

在 After Effects 中使用「透明 PNG 序列（AE）」。导出时可指定帧率及总帧数，解压 ZIP 后选择 `frames/HUD_0001.png` 并勾选 PNG 序列。通过「解释素材 → 主要」设定 ZIP 说明中记录的帧率。

在仓库根目录配置 `HMI_BUILD_PACKAGE` 指向包含 `three` 和 `esbuild` 的 `package.json`，再运行以下命令重新生成页面和渲染包：

```powershell
$env:HMI_HUD_DIRECTORY = 'adas-hud'
node scripts/build-hud-preview.mjs
```

页面与 `/adas/` 共用车型、场景资源和样式。素材来源见 [鸣谢](CREDITS.md)。
