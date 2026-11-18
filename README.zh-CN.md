# VisBloom

**面向数字艺术与数据可视化的本地创作工作台。**

用自己的编程 Agent 构思，在同一个工程里调整作品的源码、数据和参数。可以做静态画面、动画或交互作品。需要数据时，导入 CSV 或 JSON，通过 [AntV AVA](https://github.com/antvis/AVA) 查看、整理和计算。

[浏览作品集](https://artwork.euantop.work/collection.html) · [用 Agent 开始创作](https://artwork.euantop.work/help/agent-setup.html?lang=zh) · [English](README.md)

## 快速开始

1. 打开[接入指南](https://artwork.euantop.work/help/agent-setup.html?lang=zh)，把提示词发给可以在你的电脑上执行命令的编程 Agent。
2. 说说你想做的作品，或者提供本地文件。想先试数据作品，可以从内置的[《生长之间》](https://artwork.euantop.work/artworks/physarum.html)开始。
3. 打开 Agent 给你的工作台地址。可以在对话里继续改，也可以在画布上调参数或直接编辑源码。完成后导出 PNG 或独立 HTML。

Creator Kit 支持 macOS 和 Linux，要求 Node.js 22.13 或以上版本。本地工作台无需账号，目前界面为简体中文。

## 从源码运行

```sh
npm ci
npm run dev
```

打开 [http://127.0.0.1:4318](http://127.0.0.1:4318)。项目默认存放在 `.art-workbench/`，也可以用 `ART_WORKBENCH_DIR` 指定目录。

## 主要组件

- **创作指引。** VisBloom Skill 按作品意图进入数字艺术或数据创作流程。遇到具体设计问题时可查专项 Skill 和公开社区作品。
- **工作台。** 在浏览器里预览 Canvas 2D、Three.js 和文档作品。源码、参数、数据和版本随工程保存。
- **Agent 接入。** Creator Kit 提供 CLI 和可选的本地 MCP，都连接同一个工作台。独立 Skill 下载包提供创作指引。团队私有参考库由管理员另行授权。
- **分享。** 独立 HTML 可以脱离工作台观看。你可以发布到自己的 GitHub Pages，也可以配置分享服务来生成冻结版本的观看链接和 iframe。

## 开发与贡献

```sh
npm run check
npm test
npm run build
```

`npm run build:portal` 会把静态官网、作品集、社区索引和下载包构建到 `dist/portal/`。

| 目录 | 内容 |
| --- | --- |
| `apps/` | 工作台、项目 API、Agent 接入和分享服务 |
| `packages/` | 工程核心、数据适配、存储、渲染和导出 |
| `skills/` | 创作引导、专项 Skill 和冻结版本 |
| `cases/` | 内置示例和数据来源 |

提交改动时请附上能覆盖改动的检查结果。引入第三方代码、媒体和数据时，保留作者署名、来源和许可证声明。

[CLI 文档](docs/CLI.md) · [部署文档](docs/DEPLOYMENT.md) · [Skill 目录](skills/entries.json)

## 许可与致谢

VisBloom 的原创平台代码和原创 Skills 采用 [CC BY-NC 4.0（署名–非商业性使用）](LICENSE)。用于非商业分享或改编时，请署名 VisBloom 及其贡献者，附上许可证链接并注明改动。第三方代码、字体、数据、作品和改编 Skills 继续遵循各自的许可与署名要求。见[门户致谢](https://artwork.euantop.work/portal/credits.html)及 [Skill 来源与署名清单](skills/catalog.json)。
