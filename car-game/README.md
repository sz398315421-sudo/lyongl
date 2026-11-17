# Paper Kart

浏览器里的 3D 纸片卡丁车，当前完成阶段 04：支持 1 名玩家 + 5 名 AI 的单机比赛、2～6 名真人联机，以及可选的 Supabase 邮箱账号、云端头像和基础战绩同步。空位仍由服务端 AI 补足至 6 台赛车；未配置或未登录时可完整使用游客模式。

## 启动

使用 Node.js 24.15 或更新的 24.x 版本，在项目根目录运行：

```sh
npm ci
npm run dev
```

`npm run dev` 会同时启动 Vite 客户端和 Colyseus 服务端。打开 <http://localhost:5173>，联机服务默认位于 <http://localhost:2567>。手机与电脑连接同一局域网后，可访问终端显示的电脑局域网地址；系统需要允许 5173 和 2567 端口。仅调试一侧时使用 `npm run dev:client` 或 `npm run dev:server`。

当前 Codex 环境有 Node.js 和 pnpm，但 npm 不在 PATH，可以使用：

```sh
pnpm dlx npm@12.0.2 ci
pnpm dlx npm@12.0.2 run dev
```

这里的 pnpm 仅用于调用命令；依赖锁文件统一使用 `package-lock.json`，不要额外生成另一种锁文件。

页面默认连接“当前网页主机”的 2567 端口。服务端部署在其他地址时，从 `.env.example` 复制配置并设置 `VITE_COLYSEUS_URL`；服务端监听地址可通过 `PAPER_KART_SERVER_HOST` 和 `PAPER_KART_SERVER_PORT` 调整。

## Supabase 账号配置

阶段 04 的云同步是可选能力，不影响游客游玩。创建 Supabase 项目后：

1. 将 `.env.example` 复制为 `.env.local`，填写 `VITE_SUPABASE_URL` 和浏览器可用的 `VITE_SUPABASE_PUBLISHABLE_KEY`。不要使用或提交 service-role 密钥。
2. 将 `supabase/migrations/20260910230000_stage04_accounts.sql` 应用到项目。首次使用 CLI 时先运行 `supabase init`，再执行 `supabase link --project-ref <项目引用>` 和 `supabase db push`；也可在 Dashboard SQL Editor 中执行该迁移。
3. 重启开发服务器。首页右上角“游客 · 登录同步”会切换为邮箱注册/登录入口。

迁移会创建 `profiles`、`race_stats`、公开读取但按用户目录限制写入的 `avatars` 存储桶，以及只更新当前登录用户战绩的 RPC。注册项目若启用了邮箱确认，首次注册后需先点击确认邮件。登录后会加载昵称、头像和参赛/胜场/最佳名次；首页更换头像会覆盖云端文件，同一账号在其他设备登录后可恢复。游客比赛不写入数据库。

## 操作与规则

| 操作 | 键盘 | 手机 |
| --- | --- | --- |
| 加速 | W / ↑ | ↑ 按钮 |
| 刹车 / 倒车 | S / ↓（行驶中刹车，停下后倒车） | 倒车按钮 |
| 转向 | A / ← 左转；D / → 右转 | 左右按钮 |
| 漂移 | 移动转弯时按住 Space | 转弯时按住漂移 |
| 小喷 | 蓄力条充满后松开 Space | 松开漂移 |
| 使用道具 | E | 道具按钮 |
| 重置 | R | 重置赛车 |

- 通过黄色指示标记，依序完成检查点后正向越过起终点计一圈；跑完三圈可以重新开始。
- 赛道中心线包含右侧大直线、近直角大弯、顶部连续 S 弯、左侧 C 型回转和底部大直线；路面、护栏、检查点和越界恢复共用同一套曲线。
- 可见道路由同一组中心线采样生成：蓝色路面、暖色纸肩、白色裁切边、中心虚线和红白路缘砖在弯道中保持对齐，不再使用彼此独立的重叠路带。
- 纸板托盘扩大为约 `172 × 128`，蓝色道路约 10 单位宽、游戏碰撞带约 12.8 单位宽；道路各分支保持安全间距，不使用桥梁或立交交叉。
- 树、纸屋、水池、花朵和路牌通过统一占位检查生成，自动避开道路、护栏、检查点与其他装饰。
- 碰撞护栏或纸箱会减速；路肩降低速度，持续越界 1.25 秒后返回最近通过的检查点。
- 彩色纸片道具盒会随机给予纸飞机、胶水、纸箱护盾或火箭加速；E 键/道具按钮使用当前道具。
- 首页右上角“道具图鉴”提供四种道具的效果、使用时机和电脑/手机操作说明。
- 重置不增加圈数或检查点进度，清除车速、漂移和小喷。
- S/↓ 行驶中刹车，停下后继续按住会倒车；W/↑ 会先收回倒车速度再前进。A/D 始终按玩家视角判定左右，遇到卡位可使用重置。
- 页面失焦或进入后台暂停比赛，并释放所有输入。回到页面后重新按下控制键即可继续。
- 真人联机：首页填写昵称后创建房间，或输入朋友分享的 4 位房间码加入；至少 2 人且所有人 Ready 后，由房主开始比赛。
- 联机比赛由服务端统一推进圈数、检查点、AI、道具和结果。掉线车手会暂时转为 AI 接管；连接失败时单人比赛不受影响。
- 云端账号：右上角车手证支持邮箱注册/登录；登录资料会自动填入当前车手，完赛后仅记录参赛数、胜场和最佳名次。

## GitHub Pages 部署

Paper Kart 的公开地址是 [lyongl.xyz/car-game](https://lyongl.xyz/car-game)。[lyongl 仓库](https://github.com/sz398315421-sudo/lyongl)在 `car-game/` 保存源码，GitHub Pages 从 `main` 分支的 `docs/` 发布网站。

更新游戏时，在游戏目录运行 `npm ci` 和 `npm run build -- --base=/car-game/`，将 `dist/` 的内容同步到网站仓库的 `docs/car-game/`，再提交源码和发布文件。

GitHub Pages 版可直接游玩单机。开放真人房间需要将 Colyseus 部署到支持 HTTPS 和 WebSocket 的 Node 服务，并在构建前设置 `VITE_COLYSEUS_URL`。开放账号同步需要应用 Supabase 迁移，并在构建前填写对应的项目 URL 和 publishable key。

## 开发与检查

```sh
npm test              # Vitest 核心逻辑与三圈驾驶验证
npm run lint         # ESLint 与 React Hooks 检查
npm run build        # TypeScript 检查及 Vite 生产构建
npm run test:e2e      # Playwright 真实浏览器测试
npm run test:production # 构建后验证生产预览中的实际驾驶
npm run preview      # 预览生产构建，默认端口 4173
npm run server       # 单独启动 Colyseus 服务端
```

当前环境将上述 `npm` 替换为 `pnpm dlx npm@12.0.2`，例如 `pnpm dlx npm@12.0.2 run build`。不要直接使用 `pnpm run`，当前 pnpm 版本会自动安装依赖并更改安装布局。浏览器测试默认使用已安装的 Google Chrome，自动启动本地开发服务器或复用已运行的实例。测试会保存截图至 `test-results/`，失败时保留诊断追踪。

## 目录与技术

- `client/`：React 首页、车手账号、联机大厅、头像、HUD、触控、PlayCanvas 场景，以及按需加载的 Supabase 与预测/插值客户端。
- `game-core/`：固定时间步 Arcade 控制、碰撞、赛道、检查点、比赛、AI 与道具；由单机和服务端共同复用。
- `server/`：Colyseus 权威房间、短房间码、输入消费、AI 补位、掉线接管和状态同步。
- `shared/`：输入、赛车、赛道、比赛类型及 Colyseus Schema。
- `supabase/migrations/`：资料、战绩、Storage 与行级访问策略的版本化 SQL。
- `tests/unit/`：运动、漂移、碰撞、越界、圈数、AI、道具与比赛结果测试。
- `tests/e2e/`：键盘、头像、6 台赛车、完整三圈、触屏，以及两个独立浏览器的创建/加入/同步/掉线测试。
- `tests/production/`：生产构建启动、真实输入及调试接口隔离检查。

React + Vite 管理网页，PlayCanvas Engine 直接管理 3D 画布。单机核心以 60Hz 固定步长更新；联机服务以 30Hz 接收输入、每次进行两个物理子步，客户端只发送操作。本地车使用服务端回滚修正，远端车使用 100ms 插值；联机模块仅在进入真人模式时加载，Supabase SDK 也仅在环境变量配置完整时加载。HUD 约 10Hz 更新。

`game-core/config.ts` 集中控制手感参数，`game-core/track.ts` 的中心线同时驱动视觉、碰撞、AI 与规则。`client/game/track-layout.ts` 负责道路网格和无重叠装饰。开发模式提供只读 `window.__paperKart` 诊断接口；生产构建不暴露它。

## 当前边界与下一阶段

这是轻量 Arcade 原型，采用平面运动与简单碰撞，不包含跳跃、翻车、真实悬挂或复杂匹配。登录账号只持久化昵称、头像和三项基础战绩；游客头像和昵称只在当前页面及本局房间内使用。网络断开超过基础重连窗口后，当前版本需要返回首页重新加入。

手机验证使用 Chrome 的触屏与尺寸模拟，不等于 iOS Safari 或 Android 真机验收；低端设备性能仍需实机确认。

Vite 构建时会提示 PlayCanvas 中未使用的 Draco / Gaussian Splat worker 的 `node:worker_threads` 浏览器兼容外置处理；该提示来自引擎包，本 Demo 不调用这些模块，生产预览驾驶测试已通过。

《Paper_Kart_Codex_最简开发任务清单.md》的阶段 05 已开始静态网页部署。真人联机服务、Supabase 云端配置、音效和加载优化仍待完成。
