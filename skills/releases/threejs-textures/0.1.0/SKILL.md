---
name: threejs-textures
description: Three.js纹理、UV与采样。用于需要这些具体知识的创作或实现任务；按需读取，不预设整件作品的形式。
license: MIT
metadata:
  authors: "CloudAI-X"
  source: "https://github.com/CloudAI-X/threejs-skills/blob/0e181866f095b5f06d005133876e926515390d95/skills/threejs-textures/SKILL.md"
  upstream-revision: 0e181866f095b5f06d005133876e926515390d95
---

# Three.js纹理、UV与采样

- 按当前问题读取 [上游 Skill 原文](upstream/SKILL.md) 的相关章节，再按其中索引读取参考、脚本或例子。

## 在 Artwork 中使用

上游例子以独立页面与r186为前提；本工程已有渲染器/共享时钟，不能重复创建renderer或用独立requestAnimationFrame接管作品。按实际锁定版本查API，释放归作品所有的资源。

已有明确的画面、数据编码或人工修改时，只取当前问题需要的知识。资源按原目录保留在 `upstream/`，实际引用路径以本包为准。外部引擎、依赖和脚本不会因为入库而自动安装或执行。

## 来源与入库状态

原作者/署名：[CloudAI-X](https://github.com/CloudAI-X)。原始版本：[0e181866f095](https://github.com/CloudAI-X/threejs-skills/blob/0e181866f095b5f06d005133876e926515390d95/skills/threejs-textures/SKILL.md)。许可原文见 [LICENSE](LICENSE)，文件清单与来源见 [UPSTREAM.json](UPSTREAM.json)，适配说明见 [ATTRIBUTION.md](ATTRIBUTION.md)。

本包完成内容入库与平台边界整理，尚未进行本产品作品效果测试。批量积累后按代表任务集中评估；格式与来源校验不代表艺术效果。
