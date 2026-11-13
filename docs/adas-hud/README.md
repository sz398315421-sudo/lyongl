# ADAS HUD

[打开 ADAS HUD](https://lyongl.xyz/adas-hud/)。

点击「蓝色光轨」，再播放「右变道演示」。旁车从最左车道并入中间车道，本车追近后短暂跟车，再缓慢向右变道。下载菜单可导出整段演示动画或当前帧的透明 PNG。

「透明视频（WebM）」保留整段动画的 Alpha 通道，可叠加到其他画面上。导出前会验证浏览器编码是否保留透明度，建议使用 Chrome 或 Edge。

在仓库根目录配置 `HMI_BUILD_PACKAGE` 指向包含 `three` 和 `esbuild` 的 `package.json`，再运行以下命令重新生成页面和渲染包：

```powershell
$env:HMI_HUD_DIRECTORY = 'adas-hud'
node scripts/build-hud-preview.mjs
```

页面与 `/adas/` 共用车型、场景资源和样式。素材来源见 [鸣谢](CREDITS.md)。
