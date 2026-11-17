# Repository Guidelines

## 项目目标与需求优先级

项目名称：Paper Kart。开发一个网页版多人 3D 纸片风格卡丁车游戏，支持玩家上传自己的头像作为赛车驾驶员，与真人玩家或 AI 赛车手一起比赛。

开发时始终参考《[Paper_Kart_Codex_最简开发任务清单.md](Paper_Kart_Codex_最简开发任务清单.md)》。项目需求与该文档或本指南冲突时，以用户当前聊天中的最新要求为最高优先级。

## 长期技术路线

- TypeScript：统一开发语言。
- React + Vite：网页、菜单、HUD 与前端开发构建。
- PlayCanvas：3D 场景与游戏呈现。
- Colyseus：多人房间与实时状态同步。
- Supabase：账号、头像存储与战绩同步。

按当前阶段引入所需能力，不因长期技术路线而提前接入后续服务。

## 开发原则

1. 优先保证浏览器可以直接运行。
2. 同时兼容 PC 和手机浏览器，覆盖键盘与触控操作。
3. 采用 Arcade Kart 玩法，不追求真实赛车模拟。
4. 游戏核心逻辑与 UI 尽量分离。
5. 赛车控制、比赛规则、AI、道具等逻辑保持模块化。
6. 不要过度工程化，按实际需求增加抽象。
7. 优先使用简单可靠的实现方案。
8. 每次完成任务后必须运行 build 或测试，检查并处理报错，交付时说明验证结果。
9. 按任务清单 01 → 05 推进，不要未经要求提前开发后续阶段。
10. 每个阶段都必须保持项目处于可运行状态，运行验证通过后再进入下一阶段。

## 视觉目标与核心玩法

视觉方向为 **3D Paper Diorama / 手绘纸模卡通风格**：纸板、彩纸、手绘线条、白色裁切边、哑光材质、轻微纸张纹理、卡通比例，整体简洁明亮，不追求写实 PBR。优先低面数与轻量资源，避免重型后处理和超高分辨率贴图。

长期玩法核心包括第三人称赛车、加速、漂移、漂移蓄力小喷、道具、捷径、AI 赛车手与真人多人比赛。每局约 6 名车手，真人不足时由 AI 自动补齐；具体实现范围遵循当前阶段，不能将长期目标视为本次全部开发授权。

## 项目结构与模块组织

当前实现阶段 04 账号持久化版本，采用单项目结构：

- `client/`：React 菜单、账号、大厅、头像、HUD、触控、PlayCanvas 呈现与联机预测；Supabase SDK 按配置动态加载。
- `game-core/`：可独立测试并由单机/服务端复用的控制、比赛、AI 与道具逻辑。
- `shared/`：客户端和服务端共享类型、输入及 Colyseus Schema。
- `server/`：Colyseus 房间、权威比赛状态、AI 补位与掉线接管。
- `supabase/migrations/`：资料、战绩、头像 Storage 与 RLS 策略。
- `assets/`：引入外部资源时再建立；当前使用程序化纸片模型与浏览器头像贴图。
- `tests/`：单元、集成与浏览器回归测试。

保持核心逻辑独立于渲染和 UI；联网或 Supabase 不可用时仍保留单机玩法。

## 构建、测试与开发命令

使用 Node.js 24.15+，在根目录运行以下命令；有锁文件时优先 `npm ci`：

- `npm install`：安装依赖。
- `npm run dev`：同时启动 Vite 客户端与 Colyseus 服务端。
- `npm run dev:client` / `npm run dev:server`：单独调试客户端或服务端。
- `npm run build`：类型检查并生成生产构建。
- `npm test`：运行自动化测试。
- `npm run lint`：执行已配置的静态与格式检查。
- `npm run test:e2e`：使用已安装的 Chrome 运行 Playwright 浏览器测试。
- `npm run test:production`：构建后检查生产预览与开发调试接口隔离。
- `npm run preview`：预览生产构建。

当前环境 npm 不在 PATH 时，用 `pnpm dlx npm@12.0.2 ci` 安装依赖，`pnpm dlx npm@12.0.2 run dev` 等命令运行脚本；避免直接 `pnpm run` 自动更改安装布局，统一保留 `package-lock.json`。验证无法执行时说明原因，不得声称通过。

## 编码风格与命名

使用 TypeScript 严格检查、两空格缩进、小型纯函数与显式接口，避免隐式 `any`。组件和类用 `PascalCase`，函数和变量用 `camelCase`，常量可用 `UPPER_SNAKE_CASE`。单元测试使用 `*.test.ts`，浏览器测试使用 `*.spec.ts`。提交前运行 ESLint；当前未配置自动格式化工具。

## 测试规范

使用 Vitest 测试独立游戏核心与账号输入边界，Playwright 验证键盘、头像、6 台赛车、3 圈、触控、游客回退与页面恢复；尚无覆盖率门槛。联机改动必须用两个独立浏览器验证创建/加入同一房间、AI 补足、权威同步与掉线接管。阶段 04 的真实云端验收还需验证注册/登录、刷新后头像、跨设备资料与完赛统计；自动测试不得依赖生产凭据，浏览器模拟、Supabase 项目验证与真机验证分别报告。

## 提交、PR 与配置规范

采用 Conventional Commits，例如 `feat: add checkpoint validation`、`fix: correct drift boost timing`。每次提交聚焦当前阶段；阶段完成、运行通过后提交 Git。

PR 说明玩家可见变化、验证命令与结果、配置或数据结构变化；有对应 issue 时关联，UI 或玩法变更附截图或短视频。配置通过环境变量管理，变更时更新 `.env.example`，只允许浏览器 publishable key，不要提交 service-role 密钥或真实凭据。
