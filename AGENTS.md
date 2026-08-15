# AGENTS.md — vas

本文件是 vas 项目的开发指南，供参与本项目的开发者与 AI 助手阅读。动手修改本项目前，请先完整阅读本文件，并在开发过程中遵守其中的约定。当架构、命令或约定发生变化时，同步更新本文件。

## 1. 项目概述

vas 是一款本地优先的手写笔记/白板 Web 应用，目标是提供接近 GoodNotes 的自然书写体验，但功能更精简：

- 打开网页即用，无需下载安装；支持 PWA（可添加到主屏、完全离线使用）
- 跨平台：PC（鼠标）、平板与手机（手指、Apple Pencil 等手写笔）
- 分页笔记本：A4 比例页面垂直连续滚动，双指缩放（最高 20 倍）
- 本地优先：数据存于浏览器 IndexedDB，无后端、无账号；支持 JSON 导入/导出用于备份迁移
- 典型场景：日常手写笔记；录制教学视频时作为屏幕白板

核心体验目标：**书写手感自然、延迟低**。任何设计决策与此冲突时，书写体验优先。

已实现的主要功能：

- 工具：钢笔（压感）、马克笔、橡皮（笔画级）、激光笔（渐隐轨迹，不落数据）、图形（直线/箭头/矩形/椭圆）、套索选择
- 选择：套索圈选（自动闭合；笔画与圈相交或落入圈内即整条选中），选中后可拖动移动、八手柄缩放/拉伸（角手柄等比、边手柄单向，全程矢量）、改色、删除、剪切/复制/粘贴（粘贴到当前页左上角并自动选中，借此实现跨页/跨笔记本搬运）
- 图片：插入图片（按钮或 Ctrl+V 读取系统剪贴板），渲染于笔迹之下可直接批注，橡皮不可擦；随选区移动/缩放/拉伸/删除/剪切/复制/粘贴；超大图片自动等比缩小到页内；存原图不重编码
- PDF 导入：主页导入 PDF 生成新笔记本（白纸空白模板），或在笔记本内经设置面板导入并**插入到当前页之后**（继承当前页纸色与模板）；每页栅格化（3 倍清晰度 JPEG）为**锁定**图片并**铺满整页**（允许放大，一个方向顶到页边、另一方向居中，至多一侧留白），支持密码保护文件；锁定图片不可被圈选/清除，批注层不受影响
- 页面：自动续页、指定位置插页、删页、清页、缩略图导航侧栏（缩略图保持 A4 比例纵向滚动，长按拖拽排序）
- 外观：每页独立纸色（预设 + 自定义 hex）与背景模板（空白/横线/方格/点阵/米字格），线条颜色按纸色亮度自适应
- 其他：撤销/重做（跨页历史栈）、演示模式（隐藏全部 UI）、多笔记本管理、笔记本合并（勾选顺序即页面顺序，单选即整本复制）、视图状态记忆（滚动位置与缩放，重开恢复并随导出携带）、矢量 PDF 导出、PNG 导出

## 2. 技术栈

| 用途 | 选型 | 备注 |
| --- | --- | --- |
| UI 框架 | React 19（函数组件 + Hooks） | 笔迹渲染不经 React 管线 |
| 语言 | TypeScript（strict 模式） |  |
| 构建 | Vite 8 |  |
| 状态管理 | zustand |  |
| 笔迹轮廓计算 | perfect-freehand |  |
| IndexedDB 封装 | idb |  |
| PDF 导出 | pdf-lib | 动态 `import()` 按需加载，不进主包 |
| PDF 导入渲染 | pdfjs-dist | 动态 `import()` 按需加载（含 worker），不进主包 |
| 备份打包 | fflate | 含图片的笔记导出为 zip（JSON + 图片文件） |
| PWA | vite-plugin-pwa | generateSW，autoUpdate |
| Lint / 格式化 | Biome |  |
| 单元测试 | Vitest | 纯 node 环境 |

环境要求：**Node.js ≥ 20.19（推荐 22/24 LTS）**。

约束：

- 不随意新增依赖。添加前先确认无法用现有手段简单实现，并向项目负责人说明理由。
- 不引入 UI 组件库；工具栏、弹窗等界面元素自行实现。
- 依赖升级（尤其跨大版本）先讨论再执行。

## 3. 架构

### 3.1 渲染分层（关键）

笔迹渲染**绝不经过 React 渲染管线**——React 重渲染是书写延迟的主要来源。React 只负责 UI 壳（工具栏、设置面板、侧栏、主页等）。

三层画布：

1. **页面位图缓存层**：每页一个离屏 canvas，缓存该页已提交笔画；只保留可视页及相邻页，滚动远离后淘汰。
2. **活动笔画层**：一个覆盖全屏的透明 canvas，正在书写的当前笔画与激光笔轨迹在此逐帧绘制；笔画结束后合并进页面缓存层。
3. **React UI 层**：普通 DOM，与 canvas 叠加。

### 3.2 渲染循环

- `pointermove` 只负责采样：读取 `event.getCoalescedEvents()` 追加到当前笔画缓冲区，不直接绘制。
- 绘制一律在 `requestAnimationFrame` 回调中进行（脏标记合并）。
- 浏览器支持时启用 `event.getPredictedEvents()` 进一步降低视觉延迟。
- 缩放/平移手势期间走缓存位图合成（允许短暂模糊），手势结束按新比例矢量重绘。页面缓存渲染精度有上限（约 1600 万像素），超过上限的缩放级别改为**矢量直绘**屏幕、缓存按上限精度同步保持新鲜。

### 3.3 坐标系

- 世界坐标：页面逻辑尺寸 794×1123（A4 比例）。笔画点坐标相对页面左上角存储，与设备分辨率、缩放级别完全解耦。
- world → screen 的视口变换集中在 `engine/viewport.ts`，不从多处各算各的。
- 所有 canvas 按 `devicePixelRatio` 缩放，DPR 变化时重建画布，保证高分屏清晰。

### 3.4 输入处理

- 统一使用 Pointer Events，通过 `pointerType` 区分 `pen` / `touch` / `mouse`。
- 手掌误触策略：首次检测到 pen 后（记忆于 localStorage），touch 触点只做平移/缩放；无笔设备单指书写、双指导航（第二指落下时取消误触笔画）。
- 笔画提交校验按键：只有起始按键的抬起才提交；右键/笔侧键全程忽略；移动事件中 `buttons === 0` 视为笔画结束（防模态框吞掉 pointerup）。
- canvas 容器设置 `touch-action: none`；必须处理 `pointercancel`（被系统手势、来电等打断时妥善结束当前笔画）。

### 3.5 数据模型

三层结构 `Notebook → Page → Stroke`：

```ts
// 示意，以 src/model/ 中的实际定义为准
interface Page {
  id: string;
  strokes: Stroke[];
  images: ImageItem[];   // 图片层：渲染于笔迹之下，可直接在图上批注
  paperColor: string;   // 每页独立的纸张颜色
  pattern: "blank" | "lined" | "grid" | "dots" | "rice";   // 每页独立的背景模板
}

interface Stroke {
  id: string;
  points: { x: number; y: number; pressure: number }[];
  color: string;
  size: number;
  pen: "pen" | "highlighter";
  shape?: "line" | "arrow" | "rect" | "ellipse"; // 图形笔画：points = [起点, 终点]
}

interface ImageItem {
  id: string;
  imageId: string;      // 指向 IndexedDB images 表中的原始 blob，多页/多副本可共享
  x: number; y: number; // 页内位置（页面左上角为原点）
  width: number; height: number;  // 版面尺寸，缩放/拉伸只改这里，不重编码
}
```

- 类型定义集中在 `src/model/`，全项目引用同一来源，不重复定义。
- 工具集 `TOOL_KINDS`：pen / highlighter / eraser / laser / select / line / arrow / rect / ellipse；laser 不留墨迹，图形走独立渲染与命中分支（`engine/shapes.ts`、`model/hitTest.ts`、`model/shapeGeometry.ts`）。
- 套索命中（`model/selection.ts`）：圈自动闭合（首尾连边），笔画与圈相交、落入圈内、或圈整体落在粗笔迹墨迹内均算选中；图形按其轮廓几何判定（椭圆以 32 段折线近似）；图片按矩形与圈的相交/包含判定。
- 选区变换（`model/transform.ts`）：移动/缩放为纯函数仿射变换，松手提交时才把新坐标写回笔画（bake）；笔迹粗细按 √(sx·sy) 几何均值跟随缩放；移动与缩放均被约束在当前页边界内，不支持跨页拖拽与旋转。
- 图片（`model/image.ts`）：插入/粘贴时若超出页面可用区域则等比缩小到页内，初始位置为页内左上角（`PLACEMENT_MARGIN`）；一律渲染于纸色/模板之上、笔迹之下，橡皮不命中图片；只含图片的页面不算空白页（`trimTrailingBlankPages`）。图片可带 `locked: true`（PDF 底图）：套索跳过（`imagesInLasso` 过滤）、Clear page 豁免、不参与选中变换；普通插入图片不锁定。
- PDF 导入（`persistence/importPdf.ts`）：pdf.js 懒加载（库与 worker 均按需），`rasterizePdf` 逐页按 3 倍清晰度栅格化为 JPEG 为共享入口——主页导入据此生成新笔记本（白纸空白模板）；笔记本内导入经 `insertPdfPages` 插入到当前页之后（新页继承当前页纸色与模板，页面级插入不进撤销历史，与 addPage 一致）并滚动到首个新页。图片按**整页**适配（`placeImageCentered`：允许放大，一个方向顶到页边、另一方向居中，至多一侧留白）并带 `locked`；密码保护文件经 `onPassword` 弹窗输入，取消时报友好提示；主页导入在全部页渲染完成后才建库落库，失败回滚。
- 橡皮为笔画级（命中哪条删哪条），命中判定计入马克笔的宽度系数；椭圆命中按 32 段折线轮廓测距（`shapeGeometry.ellipseOutline`，与套索共享）。
- 新增页的颜色与模板继承自源页（手动加页跟随当前页、自动补页跟随最后一页）。
- 背景模板几何由 `model/patternLayout.ts` 统一产出（Canvas 渲染与 PDF 导出共用）：只画完整格子、整页居中；横线模板首行下移一个行距。

### 3.6 持久化

- 实现于 `src/persistence/`。IndexedDB（版本 2）三张表：`notebooks`（元信息：标题、时间戳、页数）、`pages`（整页记录：paperColor + pattern + strokes + images，按 notebookId 索引）与 `images`（imageId → 原始图片 blob + mimeType，全局共享，不按笔记本隔离）。旧库经 upgrade 自动补建 images 表；老的 pages 记录没有 images 字段，读取时归一化为 `[]`。
- 图片字节一律存原图（不重编码）；页记录只存引用，保证自动保存轻量。渲染位图由 `engine/imageCache.ts` 按需异步解码并缓存，解码完成后通知引擎/缩略图重绘。打开笔记本时做图片 GC：全库扫描引用（含内存中当前页与剪贴板），删除无主 blob。
- 自动保存：`autosave.ts` 订阅 store，页面引用变化即增量写入对应页；页数减少时整本重写（保持索引连续）。无"保存"按钮，任何时刻关闭页面都不应丢数据；写入失败会捕获并一次性弹提示。
- 笔记本合并：`notebooks.ts` 的 `mergeNotebooks` 按用户勾选顺序拼接各笔记本的页面（单选即整本复制），页/笔画/图片条目 id 经 `clonePageWithNewIds` 重建（页 id 是 pages 表主键，必须重建），**imageId 保持不变**——全局 images 表按引用共享 blob，相同图片天然只存一份。
- 导入/导出：`transfer.ts`。无图片的笔记导出为纯 JSON；含图片的导出为 zip（`notebook.json` + `images/<imageId>.<ext>`，fflate）。文件格式 `version: 2`，导入兼容 version 1；按文件头嗅探 zip/JSON；导入做严格运行时校验（拒绝 NaN/Infinity、页面引用必须在图片清单内）并重建全部 id（含 imageId 重映射）；全部校验通过后才落库，失败回滚不留残本与孤儿 blob。
- PDF 导出为**矢量**（`exportPdf.ts`）：笔画按轮廓多边形写入 PDF 路径，非位图；纸色与模板同为矢量；JPEG/PNG 图片直接嵌入原字节，其余格式（含 SVG）按 3 倍分辨率栅格化为 PNG 嵌入；GIF 动图只取静态帧。导出时裁掉末尾连续空白页。PNG 导出当前页为位图（`exportImage.ts`，导出前等待全部位图就绪）。
- 工具偏好（工具/墨色/粗细/纸色/模板/侧栏）与"上次打开的笔记本"存于 localStorage（`prefs.ts`、`session.ts`）；偏好解析必须逐字段校验，只合并有效值。
- 视图状态（`viewState: { x, y, zoom }`）：存于 notebooks 元信息记录（不动 updatedAt），浏览时视口稳定后 400ms 防抖写入，返回主页/切换/页面隐藏时冲刷；`zoom` 为相对适配倍率（scale / fitScale(屏宽)），跨设备恢复时不越界。打开笔记本时按记录恢复视口；导入/导出的 JSON/ZIP 顶层携带同名字段（可选，严格校验）。
- 序列化与解析逻辑必须有单元测试覆盖。

### 3.7 状态管理

- zustand store 分两块：UI 状态（当前工具、颜色、粗细、演示模式、侧栏等，驱动 React）与文档状态（当前笔记本、页面列表、撤销历史）。
- 撤销/重做：编辑历史栈（add-stroke / remove-stroke / clear-page / add-elements / remove-elements / replace-elements），删页时清空历史；elements 类操作同时携带笔画与图片（clear-page 也含 images），replace-elements 以"前/后"快照统一承载移动、缩放与改色，一次手势提交只产生一条历史。
- 页面级操作（addPage / deletePage / movePage / insertPdfPages）不进撤销历史：addPage 与 insertPdfPages 本就不产生历史，deletePage 清空历史；movePage 重排页面时当前浏览页按页 id 跟随。
- 选区（selection）与剪贴板（clipboard，结构为 `{ strokes, images }`）为内存态，不进 IndexedDB；剪贴板可跨页、跨笔记本粘贴，粘贴时重建笔画与图片条目的 id（图片 blob 引用共享，不复制字节）。
- 选区的实时交互（套索轨迹、拖动/缩放手势预览）由渲染引擎持有，store 只保留选区快照供浮动工具条定位；选中期间页面缓存按"剔除选中元素"渲染，选中元素改在活动层绘制。
- 高频数据（当前笔画的采样点、激光轨迹）不进 store，由渲染引擎内部持有。

### 3.8 PWA

- `vite-plugin-pwa`（generateSW，autoUpdate）在构建时生成 Service Worker，预缓存**全部**构建产物，包括按需加载的 pdf-lib chunk 与图标——首次访问后完全离线可用。
- `workbox.globPatterns` 必须始终覆盖 js/mjs/css/html/svg/png/webmanifest；新增静态资源类型时同步检查（pdf.js worker 以 .mjs 产出，漏配会导致离线时 PDF 导入失效）。
- Service Worker 要求**安全上下文**（HTTPS 或 localhost）。HTTP + IP 地址访问时 PWA 不生效，正式部署需由反向代理终止 TLS。
- 图标由 `scripts/generate-icons.mjs` 生成（`node scripts/generate-icons.mjs`），输出到 `public/icons/`；改设计后需重新运行。

## 4. 目录结构

```
src/
  components/    React UI 组件（Home 主页、Toolbar、SettingsPanel、PageSidebar、SelectionBar、
                 ColorField、icons 等）
  engine/        渲染引擎：board（输入状态机与编排，含套索/选区手势）、viewport（视口变换）、
                 pageCache（页面位图缓存）、renderPage/renderStroke/patterns/shapes（渲染）、
                 imageCache（图片位图异步解码缓存）、canvas（2D 上下文工具）
  model/         数据模型与纯函数：stroke（笔画与工具枚举）、page（页面几何）、
                 color（颜色）、hitTest（橡皮命中检测）、patternLayout（背景模板布局）、
                 shapeGeometry（图形几何）、selection（套索命中）、transform（选区仿射变换）、
                 image（图片条目与版面放置）、viewState（视图状态）
  store/         zustand stores
  persistence/   持久化：db（IndexedDB 连接）、notebooks（CRUD）、transfer（导入导出，zip/JSON）、
                 images（图片 blob 存取与 GC）、insertImage（插入管线）、rasterize（栅格化）、
                 importPdf（PDF 导入管线）、
                 autosave（页面自动保存）、prefs（工具偏好）、session（打开/关闭笔记本）、
                 exportPdf（矢量 PDF）、exportImage（PNG）
  pwa/           service worker 注册
public/          PWA 图标（scripts/generate-icons.mjs 生成）
scripts/         一次性工具脚本
deploy/          nginx 配置（Docker 运行阶段使用）
docs/            README 截图等文档素材
.github/         GitHub Actions 工作流（GitHub Pages 部署）
```

## 5. 代码风格

- 代码一律使用**纯英文**：标识符、字符串、提交信息。UI 文案目前也用英文。
- 尽量不写注释——用清晰的命名和结构自我解释。确有必要时注释用英文，且解释 *why*，不复述 *what*。
- 可读性优先：函数短小、命名准确、优先早返回（early return）、避免深层嵌套。
- 不过度设计：不预加配置项、不写用不到的抽象；相似代码出现三次以上再考虑抽象。
- TypeScript strict；不使用 `any`（与第三方库交界处确实无法避免时，控制在最小范围）。
- 最小改动：只动与任务相关的代码，不随手重构、重排、重命名无关部分。
- 风格由 Biome 统一强制；提交前必须通过 lint 与 format 检查。

## 6. 测试与质量

- 纯逻辑必须有单元测试：`model/` 的几何与命中检测、`persistence/` 的序列化与校验等。
- 渲染引擎中可纯函数化的部分（如视口变换、模板布局）抽成独立可测模块。
- Definition of Done：
  1. lint 与单元测试全绿，生产构建通过。
  2. 涉及书写/渲染的改动，需在桌面与移动设备上实际验证手感与性能（目标：跟手无可见延迟、不掉帧）。
  3. 新行为至少在一种输入组合（鼠标 / 触摸 / 手写笔）下实测通过。
- 无法亲自验证的项目（如真机手感），如实向项目负责人说明，不得声称已验证。

## 7. 常用命令

- `npm run dev` — 启动开发服务器
- `npm run build` — 生产构建（先 `tsc --noEmit` 类型检查）
- `npm run preview` — 预览构建产物
- `npm test` — 运行单元测试
- `npm run lint` — Biome 检查
- `npm run format` — Biome 自动格式化

## 8. 工作方式约定

- 重大改动（新模块、架构调整、新增依赖、依赖大版本升级）先讨论方案，确认后再动手。
- 未经项目负责人明确要求，不执行 `git commit` / `git push` 等版本控制变更操作。提交信息使用英文，遵循 Conventional Commits。
- Git 工作流（0.3.0 起严格执行）：
  - `main` 始终等于最新发布的稳定版；push `main` 即触发 GitHub Pages 自动部署（见第 9 节），因此**日常开发绝不在 main 上直接提交**。
  - 日常开发（新功能、bug 修复）一律在 `dev` 分支进行；push `dev` 不触发部署。
  - 发布流程：在 `dev` 上将 `package.json` 的 `version` 改为目标版本号并提交（`chore(release): X.Y.Z`）→ 确认 lint / test / build 全绿 → 切到 `main` 执行 `git merge --no-ff dev`（保留发布节点）→ `git tag vX.Y.Z` → `git push origin main vX.Y.Z`。
  - 每个发布版本必须打 tag（`v0.2.0`、`v0.3.0`……）；线上紧急修复可基于对应 tag 开 hotfix 分支，修复后合回 `main` 与 `dev`。
  - 版本号显示在设置面板（`SettingsPanel.tsx` 从 `package.json` 读取），改 `package.json` 的 `version` 即全局生效，无其他硬编码位置。
- 每次任务完成后汇报：改动了哪些文件、如何验证、验证结果如何。
- 开发顺序（既定路线，已全部完成）：
  1. ~~项目骨架 + 单页 canvas 书写~~
  2. ~~分页滚动 + 缩放 + 页面缓存~~
  3. ~~IndexedDB 持久化 + 笔记本管理~~
  4. ~~橡皮、页面背景模板、导出~~
  5. ~~PWA 收尾~~
- 后续增量（已完成）：演示模式、激光笔、图形工具（直线/箭头/矩形/椭圆）、页面缩略图导航、Docker 部署、套索选择与剪贴板、插入图片、PDF 导入批注。

## 9. 部署

- 纯静态站点，Docker 多阶段构建：`Dockerfile`（node:24-alpine 构建 → nginx-unprivileged 运行），构建阶段执行 `lint + test + build` 作为质量门。
- 运行容器只出 HTTP（8080），TLS 由外层反向代理终止（PWA 的硬要求）。
- `deploy/nginx.conf`：`assets/*` 与 `workbox-*.js` 长缓存 immutable；`index.html`/`sw.js`/`manifest.webmanifest`/图标 `no-cache`（PWA 更新检测的前提，改动时不得破坏）；安全响应头统一抽在 `deploy/security-headers.conf`，经 `include /etc/nginx/snippets/security-headers.conf` 引入每个 location（nginx 的 add_header 不向下继承到有自定义头的 location，故必须逐个引入；该文件由 Dockerfile 单独 COPY）；`.mjs` 有独立 location 强制 `application/javascript`（nginx 的 mime.types 不含 mjs，而 pdf.js 的 module worker 要求 JS MIME）。
- `package.json` 声明 `engines.node >= 20.19`，与环境要求一致。
- 命令：`docker compose build && docker compose up -d`；离线部署用 `docker save` 导出 tar.gz 后 `docker load`。
- GitHub Pages 部署：`.github/workflows/deploy.yml`（push 到 main 或手动触发，质量门 lint + test + build 与 Dockerfile 一致），构建时注入环境变量 `VAS_BASE=/<仓库名>/`（由 `github.event.repository.name` 派生，fork 后无需改动）；`vite.config.ts` 默认 `base: "/"`（本地开发与 Docker），仅 GH Pages 构建用子路径，manifest 的 start_url/scope 与 workbox navigateFallback 均跟随 `base`。GitHub Pages 无法自定义响应头：缓存头统一为 `max-age=600`、无安全响应头——可接受，因为 PWA 二次访问后由 Service Worker 预缓存接管；首次部署后需实测 `.mjs`（pdf.js worker）MIME、PWA 安装与离线可用。
