# 漫画工坊 / Comic Studio

资源包同时包含插件与 `comic-creation` Skill，请一起安装。可以直接向现有创作 Agent 说「使用这些角色和画风参考，生成这一话的全部页面」，或显式输入 `/comic-creation`。Agent 保存逐页脚本和统一参考，再逐页调用现有生成工具；左侧显示整话已生成／已采用的数量，Agent 的执行步骤沿用通用 Todo。没有独立的漫画执行器或后台队列。

中断后说「继续这一话」即可；新会话也能读取保存的脚本、参考和请求。已生成页面跳过，未完成请求先查询原 receipt，不自动重发。确需重试失败请求时，明确要求重试，Agent 使用 `action: retry` 和新 command ID，仍沿用保存的模型与参考。说「采用这一话的全部候选」可批量采用；中途手动切换过当前图片的页面单独返回冲突，其余页面继续采用，原图片和历史保留。

安装本资源包中的插件并授权，在一级菜单打开「漫画」。使用创作 Agent 已有的语言模型配置，为插件选择支持图像输入的图像模型，创建分话和页面。左侧用分话和页面缩略图组织故事；中间显示整页漫画，只保留选区、对比、历史与候选采用；右侧创作助手统一接收剧情构思、整页生成和自然语言修改。点击输入框的「参考图」上传多图或选择共享资料库，下一次生成/修改会一起使用。没有固定分镜、气泡与图层编辑器。

点击「新分话」「新页面」直接创建，默认按「第 N 话 / 第 N 页」编号，无需命名弹窗。分页没有标题；新页面创建后会自动选中。

直接拖动列表项可调整分话顺序或同一分话内的页序，触屏长按后拖动，也支持空格与方向键操作。拖动时原列表项沿列内上下移动，其他项自动让位。分话的「更多操作」提供重命名；分话和分页均可删除并从回收站恢复。删除仅移动目录记录，图片、页面内容与历史仍保留；若分页所属分话也已删除，先恢复分话再恢复分页。排序后页码自动更新，当前选中的页面保持不变。

所有作品保存在同一个 Project：

```text
comic/comic.json                         图像模型选择、分话与页面顺序、回收站
comic/episodes/<episode-id>/episode.json  整话图像模型与统一参考快照
comic/pages/<page-id>/page.json          当前图片、引用、历史、请求进度
comic/assets/pages/<page-id>/<id>.png    原图与候选
comic/assets/references/<id>.png         用户上传的参考
```

图片格式由模型结果决定。页面与素材使用稳定 ID，引用使用相对路径；图片名不承担业务身份。单页引用复用当前 Project 的共享 Lore，生成时读取最新正文与本地封面。整话脚本保存时固定参考正文、图片和图像模型，后续修改资料库或工具栏模型不会改变已保存脚本；重新保存脚本可明确更新参考。Agent journal、模型凭据和执行 receipt 由宿主保存在原有 Project Store；导出/备份作品使用 Project 文件与版本流程，插件私有内容 ZIP 不包含 comic/。

漫画中间栏顶部通过紧凑的下拉按钮选择图像模型，列表来自 Denova `/images/models`，选择保存在作品的 `imageModelId`；切换只影响下一次生成，不重启插件。已失效的模型保留选择并提示重选。插件启停、权限及自定义配置统一在资源中心管理。

生成先保存包含模型 ID 的准确请求，刷新后可「查看进度」查询已有 receipt。中断状态不会自动重发付费请求。新结果保存为候选，用户采用后仅切换当前图片，原图保留；并发修改返回冲突，不覆盖其他编辑。

需要 Denova 0.6.0、Node.js 22+、配置好的语言与图像模型。右侧直接复用 Denova 的 Project 创作 Agent、会话、Skills 与运行时能力；插件仅提供漫画上下文和业务工具。OpenAI/Gemini/Ark/xAI 支持图像输入；具体模型必须支持编辑，xAI 至多 5 张输入图。ComfyUI 当前只支持不带图片输入的生成。OpenAI 将选区变为透明 mask，其他协议接收坐标与指令；选区外像素是否保留取决于模型。

漫画声明四个工具：`comic_inspect`（读取作品、整话进度和资料库）、`comic_structure`（管理分话、批量建页及保存脚本）、`comic_render`（复用单页生成、编辑和请求恢复）、`comic_adopt`（逐项批量采用）。Denova 为模型调用统一加 `plugin_` 前缀，不包含 hash。整话读取默认返回 10 页详细脚本，按 `nextOffset` 继续读取；`detail: summary` 提供全话精简进度。

Install both the plugin and the `comic-creation` Skill. Ask the existing creation Agent to generate an episode with shared character and style references, resume remaining pages, or adopt all candidates. The Agent saves ordinary page scripts with fixed reference text, images and model selection, then uses the existing single-page tool. Episode counts come from saved artwork; execution steps use the native Todo. Recovery queries original receipts and never automatically resubmits paid requests. Bulk adoption returns independent outcomes and protects manual current-image changes. There is no comic-specific executor or queue. The four tools are exposed as `plugin_comic_inspect`, `plugin_comic_structure`, `plugin_comic_render` and `plugin_comic_adopt`. Full episode inspection is paginated in groups of up to 10 pages.

仓库检查：`npm test` 与 `npm run build`。跨仓库真实安装与页面验收，在 Denova 根运行：

```sh
DENOVA_TEST_COMIC_PLUGIN=/absolute/path/to/denova-index/examples/comic-studio/plugin pnpm --dir web test:e2e comic-plugin.spec.ts comic-episode.spec.ts
```

前端源码在 `frontend/`，使用 React、Tailwind 与 shadcn/ui（Button、Collapsible、Dialog、Sheet、ScrollArea、Field 等）。安装包包含已构建的 `plugin/web/build/`，用户安装无需下载前端依赖。修改 UI 后在 index 仓库运行：

```sh
pnpm --dir examples/comic-studio/frontend install --frozen-lockfile
pnpm --dir examples/comic-studio/frontend check
pnpm --dir examples/comic-studio/frontend build
```

Commit the rebuilt `plugin/web/build/` together with its React/shadcn source. Adding an episode or page creates it immediately with positional numbering, without a naming dialog. Pages have no titles and newly created pages are selected automatically. The host owns the single assistant composer; the plugin supplies display metadata and handles reference-picker actions through the public SDK. Displayed page selection is a local UI preference keyed by stable Project ID. Artwork, story context and version history remain portable Project files.

The plugin adds a Project-bound Comic page: episodes/pages on the left, a complete image in the center, and the existing Project creation Agent on the right. The plugin does not own a chat UI, language-model slot or Agent runtime; it contributes page context and writing/general Agent tools. Generate pages, edit images or dialogue using natural language and an optional region, combine uploaded references with shared Lore, compare and adopt candidates, retain history and export images. All artwork lives under the current Project's `comic/`; Lore remains shared with writing and games. Agent journals and model credentials stay with the host. Recovery queries existing receipts without automatically retrying paid generation. Models must support image inputs; region guidance cannot guarantee unchanged pixels outside the selection.

Drag the rows directly (long-press on touch screens, or use Space and arrow keys) to reorder episodes and pages within an episode. The original row moves vertically within its column while other rows make room. The item menu supports episode renaming and deletion of episodes or pages. Trash entries persist in `comic/comic.json`; restoring an episode restores its pages together. Restore a deleted parent episode before restoring an individually deleted page. Page files, artwork and history remain untouched, and numbering follows the new order while selection follows the stable page ID.

原生设定：左栏顶部「设定」通过 `client.openTab('lore')` 打开 Denova 共享资料库，复用写作的编辑器和引用到 Agent 流程。返回漫画保留当前页与会话。作品沿用当前书籍／项目名称，不另设漫画名称与简介；「参考图」仍由漫画管理本页长期引用。

Lore is available at the top of the sidebar through `client.openTab('lore')`, reusing the host editor and Agent reference flow. The comic belongs to the current book or Project without a separate title or synopsis form. Returning preserves the selected page and conversation; page references remain managed by the comic plugin.
