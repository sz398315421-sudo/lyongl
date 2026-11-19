# ER-6 中文交互工程图

线上入口 https://lyongl.xyz/newcar/ 。本目录保存静态项目，GitHub Pages 从同一分支的 docs/newcar 发布。更新时请同步两个目录。

场景及车辆基于 https://fable-rover.vercel.app/ 的浏览器构建，界面已中文化。在右侧“更换车型”选择 ER-6、NASA 毅力号或 Ferrari 458 Italia。两个 GLB 随站点发布，在 ER-6 可操作后自动下载并组装，菜单标记“就绪”后可直接切换。也可打开本地自含贴图的 GLB。

毅力号支持六轮滚动、四角转向、原地转向、勘测与巡航模式。系统面板提供机械臂动作播放、暂停、进度拖动和复位。458 支持四轮滚动、前轮与方向盘联动，以及慢行和运动模式。速度档位为交互演示设定，地形可进一步限制车速。两款车共享原场景的地形接触与导航仿真。

model-config.js 定义车型、比例与档位，vehicle-rig.js 将轮速、转向与动作时间映射到模型节点。通过本地入口导入同款文件也会启用相应控制。其他 GLB 使用通用外观预览。

Three.js 的许可见 vendor/LICENSE，IBM Plex Mono 字体的许可见 assets/OFL.txt。
