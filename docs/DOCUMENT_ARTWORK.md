# 可交互文档作品

`renderer.document` 与 Canvas2D、Three.js 一样，是通用作品运行环境。章节、翻页、长页、科普内容、布局、动画和交互全部在项目源码中，不属于工作台固定业务。AVA 仍负责项目数据的导入与查询。

创建空项目：

```sh
npm run --silent art -- create --name "我的作品" --preset blank --renderer renderer.document
```

然后通过 `import`、`query --apply`、`files` 写入实际数据与模块。修改前读取当前 revision 和文件 hash，保留界面修改。

入口 `src/artwork.ts` 导出 `createArtwork(context)`。context 提供 `root`、`width`、`height`、`parameters`、`data`、`mapping`、`seed`、`time`、`selectedId`、`mode`，以及 `onParameters(partial)` 和 `onSelected(id)`。作品可在 root 内组织 HTML、SVG、Canvas 或 Three.js 画布；交互状态在 controls.json 声明后回传，才能持久化并让 Agent 接续。

返回实例支持 `update(context)`、`ready`、`objects`、`dispose()`；有特殊媒体时可提供 `capture(request)` 返回 PNG data URL。异步素材完成后才确认画面就绪。无需共享宿主 DOM，也不能依赖服务端库。

作品的字体、底色与排版由创作者和 Agent 在作品源码里决定。可以直接写 CSS、使用 `@font-face` 或在画布代码中设置字体，字体无需在 `controls.json` 声明。随作品内嵌的字体可用于预览与离线导出。工作台的深色外壳、界面字体和预览边框属于平台界面。

屏幕模式 `mode=screen` 可以翻页或原生滚动；导图临时进入 `mode=poster`，作品决定如何展开内容。通用截图复制真实排版与 Canvas 像素，按内容比例生成长图，所选尺寸作为输出上限，不留适配白边、不裁掉长页底部。导出后恢复屏幕布局、参数与滚动位置。推荐先用 1440×6400，再根据内容比例选尺寸；宽最大4096、高最大16384，总像素最多2400万。仅改变输出比例不能代替海报设计。

HTML 和观看链接保留 screen 交互，冻结发布时的作品状态。内嵌素材可离线运行；通用 PNG 不隐瞒跨来源素材/字体导出失败，需要将它们内嵌或实现作品 capture。截图并发、版本改变和失败均明确反馈，不能返回过期图片。

### 在观看时计算所选数据

作品可以从 `@art/artwork-data` 导入 `exploreArtworkRows`。把作品上下文的公开结果行传给它，声明等值或数值范围条件，以及要计算的字段。返回匹配的原行、AVA 计算的行数，以及每个指定字段的最小值、最大值、均值和缺失数。作品决定如何显示这些结果和联动画面。

```ts
const selection = await exploreArtworkRows(context.data, {
  filters: [{ field: 'magnitude', min: 3 }],
  fields: ['depth'],
});
```

发布前通过创作阶段的查询明确选择可公开的行和字段。独立网页和嵌入页基于发布时的行在浏览器内计算。AVA 4.0.0 的浏览器统计模块由数据适配层装配，作品的共享隔离规则适用。

新模板使用此能力；已保存的 Canvas2D/Three.js 创作者项目保持原样，需要作者显式迁移。SkinBloom 旧花瓣源码和门户局部示例也继续保留。
