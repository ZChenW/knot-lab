<div align="center">

# Knot Lab

**画一个纽结或链环，读出它的不变量。**

[![Release](https://img.shields.io/github/v/release/ZChenW/knot-lab?style=flat-square&color=24292f)](https://github.com/ZChenW/knot-lab/releases)
[![License](https://img.shields.io/badge/license-MIT-24292f?style=flat-square)](LICENSE)

[English](README.md) · 简体中文

<img src="docs/images/knot-lab.png" alt="8 字结的一组 5-染色、它的 Alexander 多项式和 coloring 矩阵" width="760">

</div>

Knot Lab 把画出的纽结变成可读的数学。手绘或垫图临摹，点击交叉切换上下，对照图形和矩阵，观察不变量如何变化。

## 安装

```sh
git clone https://github.com/ZChenW/knot-lab && cd knot-lab
pnpm install
./install.sh      # 构建程序并安装到 ~/.local
```

需要 Node.js 和 pnpm、Rust，以及 Tauri 用到的系统库。这些依赖、更新、卸载和单文件网页版见[安装](docs/install.md)。

## 开始使用

1. 从应用菜单打开 **Knot Lab**，或者运行 `knot-lab`。
2. 在画板上拖动，画一条闭合曲线；或者点右边的标题选一个例子。
3. 点击交叉切换上下，看结果跟着变。

## 文档

文档为英文。

- [安装](docs/install.md)：依赖、更新、卸载、网页版
- [使用指南](docs/guide.md)：画图、临摹、读数、Reidemeister 变换、对照两个纽结、文件、快捷键
- [曲面](docs/surfaces.md)：Seifert 曲面、圆盘加带子、三角剖分
- [约定](docs/conventions.md)：交叉的符号、矩阵，以及 Δ(t) 如何规范化
- [文件格式](docs/file-format.md)：`.knot` 文件和 `window.knotLab` 脚本接口

## 致谢

以 [MIT 许可证](LICENSE)发布。内置字体 [Instrument Sans](assets/licenses/Instrument-Sans-OFL.txt) 和 [STIX Two Text](assets/licenses/STIX-Two-Text-OFL.txt) 均采用 SIL Open Font License。
