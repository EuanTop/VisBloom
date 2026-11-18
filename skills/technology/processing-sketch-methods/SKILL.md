---
name: processing-sketch-methods
description: "把 Processing 的绘制循环、坐标变换与生成艺术方法迁移到网页创作。"
---

# 把 Processing 的绘制循环、坐标变换与生成艺术方法迁移到网页创作

- 先确定作品使用 Processing、p5.js 还是 Canvas2D。将算法独立成输入、状态推进和绘制三段，再按实际宿主适配。
- 把绘制循环中累积的全局变换拆成成对的局部坐标保存与恢复。逻辑画幅与物理像素比保持独立。
- 将每帧生成的随机数和按实体稳定生成的随机值区分。连续运动以实际时间或固定步长控制，避免依据浏览器帧数变化。
- 用小规模例子核对弧度、矩阵顺序、颜色空间和噪声参数。不同引擎的同名 API 需要单独核实，参考 [Processing 官方手册](https://processing.org/reference/)。
