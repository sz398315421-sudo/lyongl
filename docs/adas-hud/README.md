# ADAS HUD

[打开 ADAS HUD](https://lyongl.xyz/adas-hud/)。

点击「蓝色光轨」，再播放「右变道演示」。本车从中间车道出发，追近同车道的前车，减速短暂跟车，然后向右变道。下载菜单可导出整段演示动画或当前帧的透明 PNG。

在仓库根目录配置 `HMI_BUILD_PACKAGE` 指向包含 `three` 和 `esbuild` 的 `package.json`，再运行以下命令重新生成页面和渲染包：

```powershell
$env:HMI_HUD_DIRECTORY = 'adas-hud'
node scripts/build-hud-preview.mjs
```

页面与 `/adas/` 共用车型、场景资源和样式。素材来源见 [鸣谢](CREDITS.md)。
