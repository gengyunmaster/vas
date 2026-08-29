# AGENTS.md — vas

本文件是 vas 项目的开发指南，供参与本项目的开发者与 AI 助手阅读。动手修改本项目前，请先完整阅读本文件，并在开发过程中遵守其中的约定。当架构、命令或约定发生变化时，同步更新本文件。

## 1. 项目概述

vas 是一款本地优先的手写笔记/白板 Web 应用，目标是提供接近 GoodNotes 的自然书写体验，但功能更精简：

- 打开网页即用，无需下载安装；支持 PWA（可添加到主屏、完全离线使用）
- 跨平台：PC（鼠标）、平板与手机（手指、Apple Pencil 等手写笔）
- 分页笔记本：页面垂直连续滚动，双指缩放（最高 20 倍）；页面尺寸每页独立（默认 A4 比例 794×1123，设置面板可改当前页，范围 200–5000px，允许同本混排）
- 本地优先：数据存于浏览器 IndexedDB，无后端、无账号；支持 JSON 导入/导出用于备份迁移
- 典型场景：日常手写笔记；录制教学视频时作为屏幕白板

核心体验目标：**书写手感自然、延迟低**。任何设计决策与此冲突时，书写体验优先。

已实现的主要功能：

- 工具：钢笔（压感）、马克笔、橡皮（笔画级）、激光笔（渐隐轨迹，不落数据）、图形（直线/箭头/矩形/椭圆）、套索选择、文字（键盘输入）
- 文字：Text 工具点页面任意位置放置文本框，源码 textarea 编辑 + 页面上实时预览；支持 markdown 子集（标题/列表/引用/代码/粗斜体/删除线/链接/分割线）与 LaTeX 公式（`$...$` 或 `\(...\)` 行内、`$$...$$` 或 `\[...\]` 行间，屏幕 KaTeX、导出 MathJax 矢量字形，复用几何画板管线）；`{#hex|text}` 语法混排文字颜色（公式内部同样可用——`mathColor.ts` 将其重写为作用域严格的 `\textcolor` 再交给 KaTeX/MathJax；LaTeX 原生 `\color`/`\textcolor` 也支持，导出端经 MathJax color 扩展保持与屏幕一致）；代码块额外支持 `{#hex|text}` 手动着色（内容按字面处理、不嵌套）与自动语法高亮（围栏块带语言名如 ` ```js ` 时经 highlight.js 高亮，明/暗纸色两套调色板，hljs span 输出解析回着色段；无语言名或语言未知保持单色，行内 `` `code` `` 不参与）；链接只允许 `https?`/`mailto` 协议（其余静默剥除），屏幕与导出统一为**跟随墨色 + 下划线**（排版引擎产出 underline/strikeLine 装饰线段，三个导出后端各自绘制），PDF 导出额外写入真正的 Link 注解（不依赖阅读器的 URL 自动识别），SVG 导出包 `<a href>` 可在浏览器点击，PNG 位图不可点击是格式本身的限制；笔记本内点按链接在 **Select 工具**下于新标签页打开（文字层整层 `pointer-events: none`，`BoardCanvas` 在容器捕获阶段用 `getClientRects` 逐段命中 `<a>` 并拦下 pointerdown——不触发空套索、保留现有选区；其余工具下书写优先，链接惰性）；文内图片只允许引用笔记本内已存图片（`![](image:<imageId>)`，外部 URL 被剥除）；宽度可调、高度随内容自动增长，触底拒收输入；图层位于图片之上、笔迹之下；参与套索（外接矩形）、拖动、改色、删除、剪切/复制/粘贴；选区缩放只改宽度重排（字号不变）；橡皮不擦
- 选择：套索圈选（自动闭合；笔画与圈相交或落入圈内即整条选中），选中后可拖动移动、水平/垂直居中（选区包围盒对齐当前页中心，内容不越出页边界）、八手柄缩放/拉伸（角手柄等比、边手柄单向，全程矢量）、改色、删除、剪切/复制/粘贴（粘贴到当前页左上角并自动选中，借此实现跨页/跨笔记本搬运）
- 图片：插入图片（按钮或 Ctrl+V 读取系统剪贴板），渲染于笔迹之下可直接批注，橡皮不可擦；随选区移动/缩放/拉伸/删除/剪切/复制/粘贴；超大图片自动等比缩小到页内；存原图不重编码。插入选择器也接受 **PDF 文件**（`insertPdfImageFile`）：走导入同款密码/解密/入库流程，经单页版页码对话框选**一页**，该页按 4 倍清晰度栅格化为**透明背景**预览图（pdf.js 总是铺白底渲染，故渲染后做白底抠除 `applyBackgroundKeying`：近白像素转透明，隐式白底与显式白底一并去除，代价是纯白内容会与白纸一起消失；抠除后无透明像素时退回 JPEG 省空间）作为普通图片插入——可选中、移动、缩放、拉伸，与 PDF 底图的锁定行为相反；导出 PDF 时经 `embedPage` 以矢量嵌入原始页（不铺白衬底，源页未画背景则天然透明）
- PDF 导入：主页导入 PDF 生成新笔记本（白纸空白模板），或在笔记本内经设置面板导入并**插入到当前页之后**（继承当前页纸色与模板）；文件选定（含密码输入）后弹出页码范围对话框，显示总页数，支持反填自动排序与单页，越界报错重填、可取消；每页栅格化（3 倍清晰度 JPEG）为**锁定**图片并**铺满整页**（允许放大，一个方向顶到页边、另一方向居中，至多一侧留白），支持密码保护文件；锁定图片不可被圈选/清除，批注层不受影响；**完整原始 PDF**（不截取范围）同时入库，导出 PDF 时以矢量图层形式嵌入（见 3.6）
- 页面：自动续页、指定位置插页、删页、清页、缩略图导航侧栏（缩略图保持页面长宽比纵向滚动，长按拖拽排序）
- 几何画板：设置面板进入全屏几何编辑器（点/线段/圆/垂线/角平分线/坐标轴/函数图像/滑块/变量/动画等构造工具，LaTeX 标签），Embed 后以透明底 SVG 图片插入页面（内容包围盒裁剪）；选中嵌入图形可点 Edit 重新打开编辑器修改并原位替换（保持位置与显示缩放，内容包围盒变化时按比例重算尺寸）；随选区移动/缩放/复制/粘贴；导出 SVG/PDF 时全程保持矢量
- 外观：每页独立纸色（预设 + 自定义 hex）与背景模板（空白/横线/方格/点阵/米字格），线条颜色按纸色亮度自适应
- 其他：撤销/重做（跨页历史栈）、演示模式（全屏黑底、当前页 contain 适配居中、滚轮/双指滑动/方向键翻页带纵向滚动动画、可继续书写；隐藏页码指示，保留右上角悬浮工具栏与选区工具条）、多笔记本管理、笔记本合并（勾选顺序即页面顺序，单选即整本复制）、视图状态记忆（滚动位置与缩放，重开恢复并随导出携带）、矢量 PDF 导出、PNG 导出、SVG 导出

## 2. 技术栈

| 用途 | 选型 | 备注 |
| --- | --- | --- |
| UI 框架 | React 19（函数组件 + Hooks） | 笔迹渲染不经 React 管线 |
| 语言 | TypeScript（strict 模式） |  |
| 构建 | Vite 8 |  |
| 状态管理 | zustand |  |
| 笔迹轮廓计算 | perfect-freehand |  |
| IndexedDB 封装 | idb |  |
| PDF 导出 | jspdf + svg2pdf.js | 动态 `import()` 按需加载，不进主包；页面先经 `pageToSvg` 序列化为 SVG 再渲染为矢量 PDF |
| PDF 导入渲染 | pdfjs-dist | 动态 `import()` 按需加载（含 worker），不进主包 |
| PDF 页面嵌入 | pdf-lib | 动态 `import()` 按需加载；导出 PDF 时分层组装：嵌入原始 PDF 矢量页并叠加批注层 |
| PDF 解密 | @neslinesli93/qpdf-wasm | 动态 `import()` 按需加载（wasm 独立文件经 `?url` 引用）；导入时去除 PDF 密码保护，使导出能嵌入矢量页 |
| 备份打包 | fflate | 含图片或 PDF 的笔记导出为 zip（JSON + 图片文件 + 原始 PDF + 几何文档） |
| 几何画板渲染 | jsxgraph | 几何编辑器（`src/geo/`）的画板绘制与拖拽交互，编辑器整体随 `GeometryOverlay` 懒加载 |
| 公式输入 | mathlive | 几何编辑器的函数/表达式输入框（math-field，输出 LaTeX） |
| 表达式求值 | @cortex-js/compute-engine | LaTeX 表达式 → 数值求值（函数图像、滑块、变量） |
| 画板标签渲染 | katex | 几何编辑器画布与文字项公式的屏幕渲染（HTML overlay，仅供屏幕显示） |
| 导出标签矢量化 | @mathjax/src | MathJax v4 动态 `import()` 懒加载；嵌入/导出时把 LaTeX 标签与文内公式转为 SVG 矢量字形 |
| Markdown 引擎 | markdown-it | 文字项解析；自写三条规则：行内/行间公式、`{#hex|text}` 混排颜色、图片 sanitize（只放行 `image:<imageId>`）；不开 `html:true`（防 XSS） |
| 代码块高亮 | highlight.js | 文字项代码块语法高亮；动态 `import()`（`highlight.js/lib/common`，约 40 种语言）按需加载，不进主包；hljs span 输出经明/暗调色板映射为具体 hex（导出管线需要），不引 hljs CSS |
| PDF 文字字体 | @pdf-lib/fontkit | 动态 `import()` 按需加载；导出 PDF 时内嵌子集化 Noto Sans SC（regular/bold）绘制真实可选中矢量文字 |
| 屏幕/导出统一字体 | Noto Sans SC 子集 TTF | `public/fonts/`（GB2312 字符集子集，`scripts/subset-fonts.mjs` 生成）；`src/fonts.ts` 注入 @font-face，屏幕排版与导出度量同源 |
| PWA | vite-plugin-pwa | generateSW，autoUpdate |
| Lint / 格式化 | Biome |  |
| 单元测试 | Vitest | 纯 node 环境，个别组件测试用 jsdom（文件头 `@vitest-environment jsdom` pragma） |

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

文字项是例外：它们走 DOM overlay（`components/TextOverlay.tsx`），**不进页面位图缓存**——位置由渲染引擎逐帧经 `text/textFrameBus.ts` 发布（绕开 React 60fps 状态往返），内容由 store 驱动；选中手势期间由 overlay 按 gesture 快照命令式应用 CSS transform。

层叠顺序必须与导出一致（纸色/模板 < 图片 < 文字 < 笔迹）：文字层经 `createPortal` 挂在 `.board` 容器**内部**（`.board` 是 fixed 元素、自带层叠上下文，挂在外面会压住全部 canvas），z 序为基础画布 < 文字层（z 8）< 活动画布（z 9）。含文字的页面其已提交笔迹不进基础缓存，改由独立的透明墨迹缓存（`Board.inkCache`，复用 `PageCache`、派生 `{...page, images: [], pattern: "blank", paperColor: "transparent"}` 页）合成到活动画布一侧（`renderPageInk`），选区手势中的图片则改绘到基础画布以保持图片在文字之下；无文字的页面走原单缓存路径，零额外开销。

### 3.2 渲染循环

- `pointermove` 只负责采样：读取 `event.getCoalescedEvents()` 追加到当前笔画缓冲区，不直接绘制。
- 绘制一律在 `requestAnimationFrame` 回调中进行（脏标记合并）。
- 浏览器支持时启用 `event.getPredictedEvents()` 进一步降低视觉延迟。
- 缩放/平移手势期间走缓存位图合成（允许短暂模糊），手势结束按新比例矢量重绘。页面缓存渲染精度有上限（约 1600 万像素），超过上限的缩放级别改为**矢量直绘**屏幕、缓存按上限精度同步保持新鲜。

### 3.3 坐标系

- 世界坐标：每页独立的逻辑尺寸 `width`/`height`（默认 794×1123，A4 比例）。笔画点坐标相对页面左上角存储，与设备分辨率、缩放级别完全解耦。
- 板面布局：板面宽度取最宽页（`page.boardWidth`，空板默认 794），每页水平居中（`page.pageLeftX`），垂直堆叠位置由页高前缀和计算（`page.pageTops`）；`pageIndexAtY`/`pageAt` 负责屏幕坐标 → 页归属与页内局部坐标。
- world → screen 的视口变换集中在 `engine/viewport.ts`（适配缩放按板面宽度），不从多处各算各的。页面变宽导致当前视口放不下整个板面时（调大页宽、追加更宽页），`syncPages` 自动回到横向适配缩放——桌面留白两侧对称，且不依赖横向平移（PC 鼠标滚轮只能纵向平移）；fitted 状态下板面变窄（调窄或删除最宽页）同样跟随重适配。
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
  width: number;        // 页逻辑尺寸，默认 794×1123（A4 比例），范围 200–5000
  height: number;
  strokes: Stroke[];
  images: ImageItem[];   // 图片层：渲染于笔迹之下，可直接在图上批注
  texts: TextItem[];    // 文字层：图片之上、笔迹之下，DOM overlay 屏幕渲染
  paperColor: string;   // 每页独立的纸张颜色
  pattern: "blank" | "lined" | "grid" | "dots" | "rice";   // 每页独立的背景模板
  pdfSource?: { docId: string; pageIndex: number };   // PDF 底图页对原始 PDF 的引用（0 基页码）
}

interface Stroke {
  id: string;
  points: { x: number; y: number; pressure: number }[];
  color: string;
  size: number;
  pen: "pen" | "highlighter";
  simulatePressure: boolean;   // 非手写笔输入用速度模拟压感
  shape?: "line" | "arrow" | "rect" | "ellipse"; // 图形笔画：points = [起点, 终点]
}

interface ImageItem {
  id: string;
  imageId: string;      // 指向 IndexedDB images 表中的原始 blob，多页/多副本可共享
  x: number; y: number; // 页内位置（页面左上角为原点）
  width: number; height: number;  // 版面尺寸，缩放/拉伸只改这里，不重编码
  locked?: boolean;     // PDF 底图：套索跳过、Clear page 豁免、不参与选中变换
  geometryId?: string;  // 几何画板嵌入图形：指向 geometries 表中的可编辑文档
  pdfSource?: { docId: string; pageIndex: number };   // 以图片形式插入的 PDF 页：imageId 为透明底栅格预览，pdfSource 指向原始 PDF 供导出时矢量嵌入
}

interface TextItem {
  id: string;
  x: number; y: number; // 页内位置
  width: number;        // 盒宽固定可调；高度永远由排版导出，不落库
  fontSize: number;
  color: string;        // 基础墨色；{#hex|text} 语法可混排更多颜色
  markdown: string;     // markdown 源码，可含 $公式$ 与 ![](image:<imageId>)
}
```

- 类型定义集中在 `src/model/`，全项目引用同一来源，不重复定义。
- 工具集 `TOOL_KINDS`：pen / highlighter / eraser / laser / select / text / line / arrow / rect / ellipse；laser 不留墨迹，图形走独立渲染与命中分支（`engine/shapes.ts`、`model/hitTest.ts`、`model/shapeGeometry.ts`）。
- 文字（`model/textItem.ts` + `src/markdown/` + `src/text/`）：markdown-it 自写规则产出平铺 Block[]（`markdown/blocks.ts`），屏幕经 `markdown/html.ts` 渲染为安全 HTML（全转义、KaTeX 公式、文内图片 object URL），导出共用纯函数排版引擎 `text/layout.ts`（canvas measureText 度量 + MathJax 字形 + CJK 逐字断行/Latin 按词；行高随行内公式动态增长——分式等超高内容会撑大行盒，类似 KaTeX strut，排版总高度保证包住全部字形；链接与删除线文字额外产出 underline/strikeLine 装饰线段，颜色跟随墨色，跨行链接逐段产出；代码块按着色段逐行产 run——`{#hex|text}` 手动色优先，无色段在围栏带语言名时经 `markdown/highlight.ts`（highlight.js 懒加载，hljs span 输出解析回 CodeSegment，明/暗调色板随纸色亮度切换）细分，行内 x 用 measure 累进）；`text/textHeight.ts` 缓存排版高度供套索/包围盒等同步消费者使用（DOM 实测与排版引擎两个来源取较大者，确保导出包围盒不裁内容）；编辑器（`components/TextEditor.tsx`）乐观更新 + 次帧实测，触底（页底 - 8px）回退到最后接受值。再编辑入口：Text 工具点击既有文本，或套索选中单个文本框后点 SelectionBar 的 Edit（进入编辑时清空选区）。编辑生命周期：`addTextItem`/`updateTextItem` 静默无历史，`setEditingText(null)` 时 finalize——空内容静默删除、新项补一条 add-elements、改旧项补一条 replace-elements（`textEditOrigin` 快照对比）。
- 套索命中（`model/selection.ts`）：圈自动闭合（首尾连边），笔画与圈相交、落入圈内、或圈整体落在粗笔迹墨迹内均算选中；图形按其轮廓几何判定（椭圆以 32 段折线近似）；图片按矩形与圈的相交/包含判定；文字按外接矩形（高度取 textHeight 缓存）判定。
- 选区变换（`model/transform.ts`）：移动/缩放为纯函数仿射变换，松手提交时才把新坐标写回笔画（bake）；笔迹粗细按 √(sx·sy) 几何均值跟随缩放；文字选区缩放只改宽度重排（`scaleTextReflow`，字号不变），页面尺寸调整/粘贴 fit 走 `scaleTextUniform`（字号同步缩放）；移动与缩放均被约束在当前页边界内，不支持跨页拖拽与旋转。
- 图片（`model/image.ts`）：插入/粘贴时若超出页面可用区域则等比缩小到页内，初始位置为页内左上角（`PLACEMENT_MARGIN`）；一律渲染于纸色/模板之上、笔迹之下，橡皮不命中图片；只含图片的页面不算空白页（`trimTrailingBlankPages`）。图片可带 `locked: true`（PDF 底图）：套索跳过（`imagesInLasso` 过滤）、Clear page 豁免、不参与选中变换；普通插入图片不锁定。图片还可带 `pdfSource`（**以图片形式插入的 PDF**，`importPdf.ts` 的 `insertPdfImageFile`）：插入图片选择器接受 PDF（按 `type`/`扩展名`嗅探），走 `rasterizePdf` 的 `promptMode: "single"` + `transparent: true` 分支——密码/解密/整份入库与导入完全一致，页码对话框为单页模式（`PageRangeDialog` 按 `pdfRangeRequest.mode` 渲染单输入框，返回 `{from:n,to:n}`）；栅格化先铺白底渲染再做白底抠除（`applyBackgroundKeying`，近白像素阈值 248 转透明——pdf.js 主画布强制 `alpha:false` 且无条件铺白底，透明只能靠后处理抠出；纯白内容与白纸不可区分会一并消失，抗锯齿边缘可能留浅色细边），之后扫 alpha 通道（`canvasHasTransparency`）决定存 PNG（有透明）还是 JPEG（无透明，省空间）；自然尺寸取 PDF 点数 × 4/3（非栅格像素），走普通图片的 shrink-only 放置；可编辑性与普通图片一致（可选中/移动/缩放/拉伸/复制粘贴，**不锁定**）。**透明边界**：彩色/深色背景（如深色幻灯片）不抠除、原样保留；导出 PDF 矢量嵌入时不铺白衬底，源页自身绘制的非白背景同样保留。
- PDF 导入（`persistence/importPdf.ts`）：pdf.js 懒加载（库与 worker 均按需），`rasterizePdf` 逐页按固定 4 倍（PDF 点数 ×4，与原 A4 页的 3 倍清晰度等价，与目标页尺寸解耦）栅格化为 JPEG 为共享入口（底图页渲染显式传 `background: "#ffffff"`——JPEG 无 alpha，不显式铺底时未绘制区域会编码成黑色）——主页导入据此生成新笔记本（白纸空白模板），**页尺寸取自 PDF 页**（`pdfPageSize`：点数 × 4/3 取整并收敛到 200–5000，A4 PDF 恰好得 794×1123，混尺寸 PDF 产生对应尺寸页）；笔记本内导入走 `importPdfIntoNotebook`：任务**绑定 notebookId**，完成时若该笔记本仍打开则经 `insertPdfPages` 插入到当前浏览页之后并滚动到首个新页，若已关闭或切走则按该笔记本持久化的视图状态定位"当前页"（`pdfInsertIndex`），在 DB 层直接插入到该页之后（`replacePages`）。新页纸色、模板与尺寸继承插入点前一页；页面级插入不进撤销历史，与 addPage 一致。页面构建统一由 `model/pdfPage.ts` 的 `buildPdfPages` 承担（两条导入路径与 store 共用，页尺寸经 `sizeFor` 回调注入）。导入进度存于 store 的 `pdfImports`（按 notebookId 记录），设置面板的进度行据此跨组件卸载存活。**页码范围选择**：文档加载成功（含密码通过后）经 `store/pdfRangePrompt.ts` 的 ask/settle 桥接弹出 `PageRangeDialog`（显示总页数、预填 1–N），管线 await 用户选择——`normalizePageRange`（`model/pdfPage.ts`，纯函数）负责反填排序与校验（非整数/越界返回 null，对话框内报错重填），取消则抛 "Import cancelled" 中止整个导入；范围只决定栅格化与插入哪些页，存储仍是完整 PDF，故 `pdfSource.pageIndex` 记录**真实 0 基页码**（`RasterizedPdfPage.pageIndex`，范围导入时不再等于数组下标）。图片按**整页**适配（`placeImageCentered`：允许放大，一个方向顶到页边、另一方向居中，至多一侧留白）并带 `locked`；密码保护文件经 `onPassword` 弹窗输入，取消时报友好提示；主页导入在全部页渲染完成后才建库落库，失败回滚。**原始 PDF 字节整份保留**：导入时先经 qpdf wasm（`decryptPdf.ts`，动态加载）跑 `--decrypt` 去除密码保护（密码来自 pdf.js `onPassword` 弹窗捕获，解密失败回退存原字节），再由 `saveSourcePdf` 存入全局 `pdfs` 表（不裁剪、与 images 表同款的按引用共享）——库内与 zip 备份中的 PDF 均为无密码版本；每页记录 `pdfSource: { docId, pageIndex }`（0 基页码）；合并笔记本时 `clonePageWithNewIds` 原样携带该引用（含图片条目上的 `pdfSource`）；打开笔记本时 GC 无引用的 PDF。调整 PDF 底图页的尺寸时底图只重新居中，仅当页面放大超过原栅格清晰度才经 `reRasterizePdfBase` 从原始 PDF 重渲染替换（加密未解密文件回退沿用旧图）。
- 橡皮为笔画级（命中哪条删哪条），命中判定计入马克笔的宽度系数；椭圆命中按 32 段折线轮廓测距（`shapeGeometry.ellipseOutline`，与套索共享）。
- 新增页的颜色、模板与尺寸继承自源页（手动加页跟随当前页、自动补页跟随最后一页）。
- 页面尺寸调整（`model/pageSize.ts` 的 `resizePage` + store `setPageSize`）：设置面板改当前页尺寸（200–5000px 取整，`clampPageSize` 收敛）；变小时非锁定内容按 `min(新/旧, 1)` 等比缩放（只缩不放）置左上角，变大时内容不动；锁定 PDF 底图始终只重新居中（放大超清晰度时的重栅格化见 PDF 导入条目）；调尺寸清空撤销历史并取消选区。跨尺寸粘贴时若选区包围盒超出目标页可用区域则等比缩小到页内（store `pasteClipboard` 的 fit）。
- 背景模板几何由 `model/patternLayout.ts` 统一产出（按页尺寸参数化，Canvas 渲染与 PDF/SVG 导出共用）：只画完整格子、整页居中；横线模板首行下移一个行距。
- 几何图形（`src/geo/`，详见 3.9）：嵌入产物是普通 SVG 图片条目（走图片的一切既有机制：移动/缩放/复制/粘贴/导出），额外携带 `geometryId` 指向 `geometries` 表中的 webgeo 文档（JSON 字符串）以支持再编辑；复制/粘贴共享同一 geometryId（文档不可变，编辑时生成新 id），删除图形后无主文档由 GC 清理。

### 3.6 持久化

- 实现于 `src/persistence/`。IndexedDB（版本 4）五张表：`notebooks`（元信息：标题、时间戳、页数）、`pages`（整页记录：width/height + paperColor + pattern + strokes + images + texts + pdfSource，按 notebookId 索引）、`images`（imageId → 原始图片 blob + mimeType，全局共享，不按笔记本隔离）、`pdfs`（docId → 原始 PDF blob，全局共享）与 `geometries`（geometryId → webgeo 文档 JSON 字符串，全局共享，几何图形再编辑的依据）。旧库经 upgrade 自动补建 images/pdfs/geometries 表；老的 pages 记录没有 images/pdfSource/width/height/texts 字段，读取时归一化（尺寸缺失视为 A4 默认值，texts 缺失视为空）。
- 图片字节一律存原图（不重编码，PDF 图片的栅格预览除外——那是程序生成的派生物，原图即完整 PDF 存 pdfs 表）；页记录只存引用，保证自动保存轻量。渲染位图由 `engine/imageCache.ts` 按需异步解码并缓存，解码完成后通知引擎/缩略图重绘；关闭笔记本时清空缓存（`clearImageCache`），避免多本往返累计占用内存。打开笔记本时做图片 GC：全库扫描引用（pages.images + **pages.texts 的 `image:` 引用** + 内存中当前页与剪贴板），删除无主 blob；几何文档同款 GC（`geometries.ts` 的 `gcUnreferencedGeometries`，扫 pages.images 的 geometryId + 内存页 + 剪贴板）；PDF 同款 GC（`pdfs.ts` 的 `gcUnreferencedPdfs`，扫 pages.pdfSource + **pages.images 的 pdfSource** + 内存页 + 剪贴板图片）。在途 PDF 导入的 blob 由 `retainImages`/`retainPdfs` 豁免名单保护，GC 不会误删尚未挂上页面的导入产物。
- 自动保存：`autosave.ts` 订阅 store，页面引用变化即增量写入对应页；页数减少时整本重写（保持索引连续）。无"保存"按钮，任何时刻关闭页面都不应丢数据；写入失败会捕获并一次性弹提示。
- 笔记本合并：`notebooks.ts` 的 `mergeNotebooks` 按用户勾选顺序拼接各笔记本的页面（单选即整本复制），页/笔画/图片条目 id 经 `clonePageWithNewIds` 重建（页 id 是 pages 表主键，必须重建），**imageId 保持不变**——全局 images 表按引用共享 blob，相同图片天然只存一份。
- 导入/导出：`transfer.ts`。无图片的笔记导出为纯 JSON；含图片、PDF 或几何图形的导出为 zip（`notebook.json` + `images/<imageId>.<ext>` + `pdfs/<docId>.pdf` + `geometries/<geometryId>.json`，fflate）。文件格式 `version: 5`（v5 新增每页 texts 文字项），导入兼容 version 1–4（texts 缺失静默视为空）；页面尺寸 width/height 随页序列化（读取时缺失静默归一化为 A4 默认、越界拒绝）；按文件头嗅探 zip/JSON；导入做严格运行时校验（拒绝 NaN/Infinity、页面引用必须在图片/PDF/几何清单内——**含 texts 内的 `image:` 引用，重映射全部 id**，含 imageId、docId 与 geometryId 重映射）；全部校验通过后才落库，失败回滚不留残本与孤儿 blob。图片条目携带可选 `geometryId` 与可选 `pdfSource`（docId 同样重映射、引用未知 PDF 拒绝导入）；导出时收集被引用的几何文档与 PDF 写入清单与 zip 条目（含图片条目上的 pdfSource 引用），缺失记录时剥掉 geometryId/pdfSource 降级为普通图片；texts 内指向缺失 blob 的 `image:` 引用在导出时剥除（`dropUnknownTextImageRefs`）。
- PDF 导出为**矢量**（`exportPdf.ts`）：每页按自身尺寸出纸（jsPDF 逐页 `format` + 显式 `orientation`，pdf-lib 分层同尺寸），先经 `pageToSvg` 序列化为 SVG，再由 svg2pdf.js + jsPDF 渲染进 PDF——笔画/图形/模板/纸色均为矢量；PNG/JPEG 图片按原字节嵌入，SVG 图片保持矢量（svg2pdf 直接解析渲染），其余格式（GIF/AVIF/WebP 等）经 `rasterizeToPng` 栅格化为 PNG 嵌入（GIF 动图只取静态帧）。含 `pdfSource`（页级或**图片条目级**）**或文字项**的笔记本改走 pdf-lib 分层组装，层序与屏幕一致（纸色/模板 < 图片 < 文字 < 笔迹）：pdf-lib 原语画纸色与模板 → 底图矩形内铺白衬底 → `embedPage` 嵌入原始 PDF 矢量页（底图）→ **PDF 图片条目逐个 `embedPage` 矢量嵌入（`drawPdfImage`，不铺白衬底保持透明，失败回退栅格预览）** → **普通图片层**（`pageToSvg` 的 `imagesOnly` 输出经 jsPDF+svg2pdf 生成后 `embedPdf`，SVG 图片在此保持矢量）→ **文字层（`pdfTextLayer.ts`：pdf-lib 原语画引用条/代码底色/分割线/下划线/删除线装饰，`drawText` 以内嵌子集 Noto Sans SC 绘制真实可选中文字，链接文字逐段写入 Link 注解（URI action），斜体经变换矩阵合成 oblique；字体按字重惰性嵌入、**禁用 pdf-lib 的 `subset: true`**——其二次子集化会破坏该字体的字形映射导致大面积缺字，直接整嵌我们已子集化的 TTF；同时**关闭 fontkit 整形特性**（`features: { liga: false, locl: false }`）——默认整形会把 fi/fl 合成连字字形、把数字替换成 locl 变体，这些字形不在 pdf-lib 生成的 ToUnicode 映射内（复制/提取文本丢失）且宽度错误（渲染间距异常））** → 批注层（`pageToSvg` 的 `annotationOnly` + `skipImages` + `textMode: "pathsOnly"` 输出，只含笔画/图形/公式字形/文内图片）经 jsPDF+svg2pdf 生成后 `embedPdf` 叠加在最上层；原始 PDF 嵌入失败（如加密文件，pdf-lib 无解密能力）时该页回退为 JPEG 栅格底图。**选中部分导出 PDF** 在含文字或 PDF 图片时同样走 pdf-lib 分层（白底 + PDF 图片矢量嵌入 + 图片层 + 文字层 + 批注层，坐标按选区包围盒偏移），否则维持单次 svg2pdf。导出时裁掉末尾连续空白页。PNG 导出为位图（`exportImage.ts`，导出前等待全部位图就绪，文字经 `text/paintTexts.ts` 逐 run 栅格绘制——公式字形 SVG 先转位图再贴）。位图栅格化倍率统一经 `rasterize.ts` 的 `cappedRenderScale` 按 16M 像素预算钳制（iOS Safari 超限静默空白），PDF 导入的 4 倍栅格化同样受其约束。SVG 导出为**矢量**（`exportSvg.ts`）：笔画/图形/模板/纸色均为矢量元素，文字保留真实 `<text>` 元素（查看端系统字体渲染，字体回退链声明在 font-family 内），公式为 MathJax 矢量字形；位图与 SVG 图片以 data URI（base64 原字节）内嵌进 `<image>`（同时写 `href` 与 `xlink:href` 兼容老查看器；**PDF 图片条目以其透明栅格预览内嵌**，SVG 无法携带 PDF 矢量），缺失图片跳过；轮廓转路径的 `outlineToSvgPath` 抽在 `svgPath.ts`，图片字节转 data URI 的 `collectImageDataUris` 抽在 `imageDataUri.ts`，PDF 与 SVG 导出共用。
- 导出范围统一为三档（设置面板，范围 × 格式两个维度）：**选中部分**只含选中的笔画、图片与文字（`selection.pickElements` 按 id 提取），无纸色/模板/锁定图片，尺寸贴合选区包围盒（`transform.elementsBounds`）——SVG 经 `pageToSvg` 的 `clipTo` 裁剪 viewBox、PNG 经 `renderPage.paintElements` 平移渲染，二者背景透明；PDF 无透明概念，为包围盒尺寸的单页白底（含文字或 PDF 图片时同样走 pdf-lib 分层）。**当前页**为单文件所见即所得（含背景与 PDF 底图）。**整本**导出时 SVG/PNG 若超过一页自动打 zip（`exportZip.ts`，fflate），单页直接下载；三格式整本导出均裁掉末尾连续空白页。
- 工具偏好（工具/墨色/粗细/纸色/模板/侧栏）与"上次打开的笔记本"存于 localStorage（`prefs.ts`、`session.ts`）；偏好解析必须逐字段校验，只合并有效值。
- 视图状态（`viewState: { x, y, zoom }`）：存于 notebooks 元信息记录（不动 updatedAt），浏览时视口稳定后 400ms 防抖写入，返回主页/切换/页面隐藏时冲刷；`zoom` 为相对适配倍率（scale / fitScale(屏宽)），跨设备恢复时不越界。打开笔记本时按记录恢复视口；导入/导出的 JSON/ZIP 顶层携带同名字段（可选，严格校验）。
- 序列化与解析逻辑必须有单元测试覆盖。

### 3.7 状态管理

- zustand 单一 store（`store/useBoardStore.ts`），状态逻辑上分两类：UI 状态（当前工具、颜色、粗细、演示模式、侧栏等，驱动 React）与文档状态（当前笔记本、页面列表、撤销历史）。
- 撤销/重做：编辑历史栈（add-stroke / remove-stroke / clear-page / add-elements / remove-elements / replace-elements），删页时清空历史；elements 类操作同时携带笔画、图片与文字（clear-page 也含 images/texts），replace-elements 以"前/后"快照统一承载移动、缩放与改色，一次手势提交只产生一条历史。
- 页面级操作（addPage / deletePage / movePage / insertPdfPages / setPageSize）不进撤销历史：addPage 与 insertPdfPages 本就不产生历史，deletePage 与 setPageSize 清空历史（setPageSize 同时取消选区）；movePage 重排页面时当前浏览页按页 id 跟随。
- 选区（selection，`{ pageId, strokeIds, imageIds, textIds }`）与剪贴板（clipboard，结构为 `{ strokes, images, texts }`）为内存态，不进 IndexedDB；剪贴板可跨页、跨笔记本粘贴，粘贴时重建笔画、图片与文字条目的 id（图片 blob 引用共享，不复制字节）。
- 文字编辑态：`editingText`（`{ pageId, itemId } | null`）+ `textEditOrigin`（打开时的快照，关闭时对比产生历史）；Done、Esc、切换工具都经 `setEditingText(null)` 单出口 finalize；删页/关闭笔记本时清理。
- 任务态：`pdfImports`（按 notebookId 的在途 PDF 导入进度）、`exporting`（导出进行中）与 `pdfRangeRequest`（待决的 PDF 页码询问，`{ numPages, mode: "range" | "single" }`，`store/pdfRangePrompt.ts` 桥接给导入/插入管线 await，single 模式返回 `{from:n,to:n}`，对话框打开期间 App 键盘快捷键挂起）存于 store，跨组件卸载存活；导出期间引擎 pointerdown、键盘编辑快捷键、系统粘贴与设置面板的文档变更按钮统一闸门禁用（导出本身基于点击时的不可变快照，闸门是为杜绝并发变更的隐患）。
- 几何编辑器开关态：`geometryEditor`（`{ mode: "insert" } | { mode: "edit"; pageId; itemId } | null`）；编辑模式的 Embed 走 `replaceGeometryImage`（replace-elements 历史，图片条目 id 保持不变，选区不失效），替换后的页面矩形由 `model/image.ts` 的 `rescaledImageRect` 计算——保持旧图的显示缩放（sx/sy 相对旧 SVG 自然尺寸）与锚点位置，新内容包围盒变化时按比例缩放，超出页边界时等比收敛并钳位，旧自然尺寸不可得时回退为新插入尺寸；旧 blob 与旧几何文档由下次 GC 回收。
- 选区的实时交互（套索轨迹、拖动/缩放手势预览）由渲染引擎持有，store 只保留选区快照供浮动工具条定位；选中期间页面缓存按"剔除选中元素"渲染，选中元素改在活动层绘制。
- 高频数据（当前笔画的采样点、激光轨迹）不进 store，由渲染引擎内部持有。

### 3.8 PWA

- `vite-plugin-pwa`（generateSW，autoUpdate）在构建时生成 Service Worker，预缓存**全部**构建产物，包括按需加载的 pdf-lib chunk 与图标——首次访问后完全离线可用。
- `workbox.globPatterns` 必须始终覆盖 js/mjs/css/html/svg/png/webmanifest/wasm/ttf；新增静态资源类型时同步检查（pdf.js worker 以 .mjs 产出、qpdf 以 .wasm 产出、文字字体以 .ttf 产出，漏配会导致离线时 PDF 导入/解密/文字导出失效）。
- Service Worker 要求**安全上下文**（HTTPS 或 localhost）。HTTP + IP 地址访问时 PWA 不生效，正式部署需由反向代理终止 TLS。
- 图标由 `scripts/generate-icons.mjs` 生成（`node scripts/generate-icons.mjs`），输出到 `public/icons/`；改设计后需重新运行。

### 3.9 几何画板（src/geo/）

几何编辑器由独立项目 webgeo 集成而来（`components/GeometryOverlay.tsx` 全屏 overlay，`lazy()` 按需加载，主包不含 jsxgraph/mathlive），与笔记本体只通过"嵌入图片 + 几何文档"交互，不参与笔迹渲染管线。

- 结构：`model/`（纯函数文档模型与约束求解，全部 node 可测）、`board/`（`controller.ts` 把文档同步到 JSXGraph 画板并回写拖拽、`palette.ts` 调色板）、`tools/`（构造工具与自定义工具）、`ui/`（inspector、export 等）、`history/`（编辑器内独立的撤销栈）、`latexSvg.ts`（MathJax 懒加载封装）。
- 编辑器文档模型与 vas 的 Page/Stroke 完全无关：一张图 = 一份 webgeo document（JSON 序列化存 `geometries` 表）+ 一份导出 SVG（存 `images` 表）。
- 嵌入/导出管线（`ui/export.ts` 的 `composeBoardSvg`）：克隆画板 SVG → 按内容包围盒裁剪（`CROP_MARGIN`，与画板矩形求交）→ 可选底色（嵌入时 `background: null` 透明底）→ overlay 层把 KaTeX 屏幕标签换成 MathJax 矢量字形（`placeGlyph` 按实测标签 rect 缩放居中）→ `vectorizeSvgTexts` 把 JSXGraph 刻度 `<text>` 也转为矢量路径（svg2pdf 会丢弃 SVG `<text>`，不转则导出 PDF 丢刻度）。
- LaTeX 标签双轨：屏幕上用 KaTeX（HTML overlay，快），嵌入/导出时用 MathJax 转 SVG 字形（矢量，字体风格一致）；`latexSvg.ts` 必须保持 `linebreaks: { inline: false }`（否则一个标签断成多个 svg）与 `fontCache: "none"`（字形内联，SVG 自包含）；序列化必须用 `serializeXML` 而非 `outerHTML`——后者按 HTML 规则不转义属性值中的 `<`，而 MathJax 会把 TeX 源码写进 `data-latex` 属性（如公式含 `a<b`），导致导出的 SVG 成为非法 XML（PNG 栅格化与 svg2pdf 同样失败）。
- 函数图像标签布局：每条曲线的表达式标签吸附在"离视图边缘最远"的可见采样点附近；`board/labelLayout.ts`（纯函数，单测覆盖）做全局防重叠——已放置的标签矩形（先是坐标轴 x/y 字母，再按创建顺序的各曲线标签）成为后续标签的障碍，候选点沿曲线取、含四个方向偏移，全部相撞时退化为拥挤度最小者；KaTeX 异步加载完成后按真实字形尺寸重排一次。
- 纸色适配：编辑器画板底色 = 当前页纸色（`applyPaperPalette` + 画板宿主元素背景同步），深色纸切换 dark 调色板保证线条可见；嵌入图形本身透明底，落到什么纸色上都成立。
- 样式隔离：vas 全局 `.toolbar` 样式会泄漏进编辑器，`App.css` 的 `.geo .toolbar` 块负责复位（position/size）；编辑器渲染错误由 `ui/ErrorBoundary` 兜底，不拖垮笔记界面。

## 4. 目录结构

```
src/
  components/    React UI 组件（Home 主页、Toolbar、SettingsPanel、PageSidebar、SelectionBar、
                 ColorField、GeometryOverlay 几何编辑器宿主、PageRangeDialog 页码范围对话框、
                 TextOverlay 文字层 overlay、TextEditor 文字源码编辑器、icons 等）
  engine/        渲染引擎：board（输入状态机与编排，含套索/选区手势）、viewport（视口变换）、
                 pageCache（页面位图缓存）、renderPage/renderStroke/patterns/shapes（渲染）、
                 imageCache（图片位图异步解码缓存）、canvas（2D 上下文工具）
  geo/           几何画板（webgeo 集成，见 3.9）：App（编辑器壳）、model（纯函数文档模型）、
                 board（JSXGraph 同步与调色板）、tools（构造工具）、ui（inspector/导出管线）、
                 history（编辑器内撤销栈）、latexSvg（MathJax 懒加载）、test（模型与组件测试）
  model/         数据模型与纯函数：stroke（笔画与工具枚举）、page（页面几何与板面布局）、
                 pageSize（页面尺寸调整）、color（颜色）、hitTest（橡皮命中检测）、patternLayout（背景模板布局）、
                 shapeGeometry（图形几何）、selection（套索命中）、transform（选区仿射变换）、
                 image（图片条目与版面放置）、pdfPage（PDF 页面构建与插入位置）、viewState（视图状态）、
                 textItem（文字条目）
  markdown/      文字项 markdown 管线：md（markdown-it 封装与三条自写规则）、
                 blocks（解析结果为平铺 Block[]，代码块切分手动着色段并提取语言名）、
                 html（屏幕渲染为安全 HTML）、katex（懒加载封装）、
                 mathColor（公式内 {#hex|text} → \textcolor 重写与花括号配对扫描）、
                 highlight（代码块 highlight.js 懒加载、hljs span 输出 → 着色段解析、明/暗调色板）
  text/          文字排版与导出：layout（纯函数排版引擎，canvas measureText 度量 +
                 MathJax 字形 + CJK 逐字断行/Latin 按词）、measure（度量缓存）、
                 textHeight（排版高度缓存，供套索/包围盒同步消费）、textFrameBus（逐帧位置发布通道）、
                 textElements（overlay 测量注册表）、layoutItem（条目排版入口）、
                 paintTexts（PNG 逐 run 栅格绘制）、textToSvg（SVG `<text>` 输出）
  store/         zustand stores（useBoardStore 主 store、pdfRangePrompt 页码范围询问桥接）
  persistence/   持久化：db（IndexedDB 连接）、notebooks（CRUD）、transfer（导入导出，zip/JSON）、
                 images（图片 blob 存取与 GC）、pdfs（原始 PDF blob 存取与 GC）、
                 geometries（几何文档存取与 GC）、
                 insertImage（插入管线）、rasterize（栅格化）、importPdf（PDF 导入管线）、
                 decryptPdf（qpdf wasm 去除 PDF 密码保护）、
                 autosave（页面自动保存）、prefs（工具偏好）、session（打开/关闭笔记本）、
                 exportPdf（矢量 PDF）、exportImage（PNG）、exportSvg（矢量 SVG）、exportZip（多页打包）、
                 pdfTextLayer（PDF 文字层：pdf-lib drawText + 子集字体）、
                 svgPath（轮廓转路径共用）与 imageDataUri（图片字节转 data URI 共用）
  pwa/           service worker 注册
public/          PWA 图标（scripts/generate-icons.mjs 生成）与 fonts/（Noto Sans SC 子集 TTF，
                 scripts/subset-fonts.mjs 生成，屏幕排版与导出度量同源）
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
