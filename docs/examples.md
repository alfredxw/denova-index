# 两个示例资源包

## 青岚修仙 · 创作起步包

定位是“拿到后可以开始写作或互动故事”的传统修仙资料。开篇围绕青岚宗、青禾坊市和雾松谷展开，从日常值役、技艺、交易、同伴关系与第一次历练积累到筑基机会。金丹、元婴、化神提供长线尺度，不在入门时强行拉入高阶大战。

### 内容清单

资料集中保存在一份 `lore.json`，导入后是一个世界资料条目，人物与地点作为其中的章节维护。没有为每个概念、人物或地点再建独立文件。

- **五份规则资料**：境界与突破、灵根与资质、灵石与贡献、功法与器物、斗法与历练。
- **一份地区资料**：云川青岚山的地理、凡人生活及势力关系。
- **三个地点**：青岚宗外门、青禾坊市、雾松谷外围。
- **五位人物**：灵田学徒林照、器房杂役杜衡、药铺掌柜许知秋、外门执事周守拙、家族来客沈言。
- **一份入门篇发展资料**：灵田缺水、药材质量与阵基失修之间的联系，以及人物各自的利益和可发展的任务。
- **三个开场**：山门初试、散修的第一笔生意、家族的一车药材。
- **叙事风格与文风参考**：重视积累、选择、因果和成长回报，附原创场景示范。
- **插图风格**：用于人物、山门、洞府、坊市与斗法的单幅国风插图，附[参考图](../examples/cultivation-starter/assets/qinglan-irrigation.png)，完整生成提示词见下文。
- **通用拆书 Skill**：阅读指定作品或范围，按证据、机制、效果、复用条件拆解；不限修仙题材。

默认采用炼气一至九层，筑基、金丹、元婴、化神分初、中、后期及圆满。这是本包的可修改世界规则，不宣称所有修仙作品都采用同一口径。主角没有预设姓名、性别、隐藏血脉或必然道侣；有明确初始修为和财物的开场会在正文中写明。

### 使用

1. 在资源市场预览本包。导入资料和开场时选择目标书籍；只想使用拆书 Skill 时可以单独勾选。
2. 勾选一个开场会同时选中其依赖资料；文风说明已直接包含在叙事预设中。全套安装更适合长期游玩，不同开场彼此独立。
3. 写作时让 Agent 使用已导入的资料，明确主角和写作范围。互动故事中选择相应开场，并在预设设置中选用导入的叙事风格。导入不会自动切换已有故事配置。
4. 需要插图时先配置图像模型，选择“青岚修仙 · 国风插图”，给出角色、动作、地点和境界。样图由内置 ImageGen 单独生成，用于展示视觉方向；不同模型的实际结果会有差异。

可直接使用的请求：

> 以青岚宗入门为起点。主角是木水土三灵根的新弟子，性格谨慎但愿意交朋友。先写他第一次值役，不安排隐藏血脉和高阶机缘。让一次具体选择影响他与林照的关系。

> 使用 book-analysis 拆解我指定的前三章，重点分析主角目标、章节结尾的牵引和伏笔。标明实际读到的范围，给出可定位的证据，再提炼我能用于自己作品的方法。

## 扩展示例 · 文本统计与邻里来信

包内是两个可独立安装的扩展，没有彼此依赖。

### 文本统计

安装后在 Denova 中启用对应插件及工具集，需要本机 Node.js。工具接受直接传入的文本，不读取文件、不调用模型。

返回：
- `characters`：非空白字素簇数量，组合字符和家庭 emoji 按一个字素簇处理。
- `wordSegments`：Unicode 词语边界片段，使用 `Intl.Segmenter('en')`，不是模型 token 数，也不是统一的中文出版字数。
- `paragraphs`：空行分隔的非空段落。
- `sentences`：包含文字或数字的 Unicode 句子分段。

单次输入上限为 100,000 个 UTF-16 代码单元。原插件 ID 保持 `index.text-statistics`；已有独立安装可能需要先在导入界面处理原来源的归属冲突。

### 邻里来信 / Small Circle

一个现代生活题材的微信式社交模拟游戏。你刚搬进梧桐里，设计师林蔓、咖啡店主许宁和摄影师唐越正在筹备周末影展。

- **对话列表**：联系人搜索、最近消息、未读提示。
- **私聊**：自由输入、角色独立记忆、流式回复、停止回复、加载更早历史；切换联系人保留各自当前页面的输入草稿。
- **朋友圈**：三条原创开场动态、用户发布动态、点赞和评论。评论动态时由动态作者回复；评论自己的动态时可选择邀请哪位联系人回复。
- **联动**：角色能看到最近八条公开动态及当前评论目标；其他联系人的私聊不会传入其上下文。AI 评论保留在角色会话中，朋友圈保存其完成引用。初版不会自行定时发布 NPC 动态或后台发消息。
- **恢复**：已接受的请求保存稳定编号，刷新或断线后恢复原请求；回复失败或进程中断不会自动再次生成。保存冲突必须重新读取最新进度。聊天正文由 Denova 保存，游戏不另外复制一套聊天记录。
- **外观**：中英文、明暗主题、桌面对话分栏与手机单页导航。用户自由输入和既有模型回复保持原语言，切换界面语言不会改写历史。

安装时授权 `agents.run` 和 `gameData`。新建故事线时选择“邻里来信”，为“角色对话模型”选一个文本模型。模型配置及凭证由 Denova 管理，游戏没有自己的 API Key 输入框，也不需要 Node 后端。

这个游戏使用原创人物和本地游戏数据，不连接真实微信账号。文本统计插件是否安装，不影响游戏运行。

### 验证与本地预览

仓库根目录执行：

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

预览地址为 `http://127.0.0.1:4381`，采用明确的脚本测试回复，服务退出后测试数据消失。实际 AI 游玩需安装到 Denova。

有扩展平台的 Denova 源码时可运行：

```sh
npm run test:denova -- /absolute/path/to/denova
```

该验证会启动真实的隔离扩展页面与角色会话，模型使用测试替身，数据使用临时目录；不会读取或改变正常用户的数据目录。


## 插图示例的来源与提示词

此图由内置 ImageGen 工具生成，展示低阶弟子、朴素器物与山门环境的视觉方向。它是风格参考，不代表在 Denova 内用任意图像模型都能得到相同结果，也不额外定义画面背景人物的剧情身份。

配套预设为“青岚修仙 · 国风插图”。实际使用时，提供角色外观、当前动作、地点与境界；将下方场景换成所需内容。

### 完整生成提示词

Use case: illustration-story. Create one polished landscape illustration for an original traditional Chinese cultivation-fiction starter pack. Scene: early morning on the stone terrace of a modest mountain sect called Qinglan, an outer disciple Lin Zhao, nineteen-year-old Chinese woman with tied-back black hair wearing practical faded indigo and sage-green cloth robes, crouches beside a bamboo irrigation channel and directs a narrow thread of water using a subtle low-level cultivation technique. A simple bamboo basket and worn hand tools rest nearby. In the middle ground stand weathered timber teaching halls; layered mountain slopes and drifting mist recede in the background. Style: refined painterly linework, layered ink-wash atmosphere, restrained mineral colors, jade greens, warm stone, indigo cloth, tiny cinnabar accents. One clear action focal point, readable hands and anatomy, spacious calm composition with practical lived-in details. This is the first stage of cultivation, modest equipment and no grand magical power. No text, captions, Chinese writing, logos, watermarks, collage, floating swords or modern machinery. One image, 3:2 landscape.
