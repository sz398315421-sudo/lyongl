# ADAS HUD

[打开 ADAS HUD](https://lyongl.xyz/adas-hud/)。

点击「蓝色光轨」，再播放「右变道演示」。旁车停在最左车道，本车先在中间车道直行，再缓慢向右变道。下载菜单可导出整段演示动画或当前帧的透明 PNG。

「HUD 光毯」采用较低的前向视角，只显示贴地渐变光毯。播放「左变道演示」可预览光毯由直行到向左弯曲，再回到直行的过程。支持透明 WebM 和 PNG 序列。

「透明视频（WebM）」保留整段动画的 Alpha 通道，可叠加到其他画面上。导出前会验证浏览器编码是否保留透明度，建议使用 Chrome 或 Edge。

在 After Effects 中使用「透明 PNG 序列（AE）」。导出时可指定帧率及总帧数，解压 ZIP 后选择 `frames/HUD_0001.png` 并勾选 PNG 序列。通过「解释素材 → 主要」设定 ZIP 说明中记录的帧率。

在仓库根目录配置 `HMI_BUILD_PACKAGE` 指向包含 `three` 和 `esbuild` 的 `package.json`，再运行以下命令重新生成页面和渲染包：

```powershell
$env:HMI_HUD_DIRECTORY = 'adas-hud'
node scripts/build-hud-preview.mjs
```

页面与 `/adas/` 共用车型、场景资源和样式。素材来源见 [鸣谢](CREDITS.md)。
