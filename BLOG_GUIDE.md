# luxの手札 · 本地维护指南

这是写给博客维护者 Theralux 的操作说明，不是网站页面文案。
项目目录：`F:\my_blog`；框架：Valaxy，主题：Yun。

## 1. 启动博客

在 PowerShell 中运行：

```powershell
cd F:\my_blog
pnpm.cmd dev
```

打开终端显示的本地地址。修改配置、文章或样式后，页面通常会自动刷新。
停止服务时，在终端按 `Ctrl+C`。
PowerShell 中使用 `pnpm.cmd` 可避开 `pnpm.ps1` 的执行策略限制。
当前环境为 Node.js 24.21、pnpm 10.27；项目要求 Node.js ≥22.12、pnpm ≥10.26。

## 2. 改资料与外观

| 文件 | 用途 |
| --- | --- |
| `site.config.ts` | 博客标题、作者、介绍、中文语言、时区、正式站点 URL 等 |
| `valaxy.config.ts` | Yun 主题横幅、配色、导航等 |
| `pages/` | 首页之外的独立页面，例如关于页 |
| `pages/posts/` | Markdown 文章 |
| `public/images/` | 可通过 `/images/文件名` 引用的图片 |
| `templates/post.md` | 新文章的起点 |

编辑配置时保留 TypeScript 的逗号、引号和括号；一次改少量内容，方便检查效果。
目前以 Yun 原版为基础，先保持文字阅读清晰，再逐步加入你选定的动漫插画。
头像文件是 `public/images/avatar.jpg`，站点图标是 `public/favicon.svg`。
后续可换成 PNG、WebP 等图片，并同步修改配置中的引用路径。
图片放进 `public/images/` 后，引用路径不用带 `public`。

## 3. 写一篇文章

复制模板并打开新文件：

```powershell
cd F:\my_blog
Copy-Item -LiteralPath templates/post.md -Destination pages/posts/my-first-post.md
```

文件名建议使用简短英文和连字符，例如 `hello-valaxy.md`。
文件顶部的 `---` 区域称为 frontmatter，用来描述文章：

```markdown
---
title: 我的第一篇手札
date: 2026-10-17T20:00:00+08:00
updated: 2026-10-17T20:00:00+08:00
categories:
  - 随笔
tags:
  - 开始
draft: true
---

这里开始写正文。

## 一个小标题

用 Markdown 记录今天想留下的内容。
```

- `title`：文章标题；`date`：发布时间；`updated`：最后更新时间。
- 日期带 `+08:00`，明确使用北京时间，避免部署环境改变显示时间。
- `categories`：文章所属栏目；多个数组项表示从上到下的分类层级。
- `tags`：文章涉及的关键词，同一篇可用多个，例如“Valaxy”“阅读”。
- `draft: true`：草稿；准备公开时改成 `false` 或删除这一行。

文章图片示例：`![图片说明](/images/example.webp)`。
`draft: true` 的文章只在开发预览中显示，生产构建会排除它。
复制模板后，请更新标题、日期和摘要，再把准备公开的文章改为 `draft: false`。

## 4. 检查生产版本

```powershell
cd F:\my_blog
pnpm.cmd build
pnpm.cmd serve
```

`build` 把站点生成到 `dist/`，`serve` 用于本地预览构建结果。
打开终端给出的地址，检查首页、文章、导航、图片和手机宽度下的显示。
以后更新内容时，编辑源文件并重新构建，不直接修改 `dist/`。

## 5. 发布与自动更新

源码仓库为 [Theralux/my_blog](https://github.com/Theralux/my_blog)，部署平台为 Vercel，
正式地址为 `https://civilighteterna.top/`。
修改文章、图片或配置后，先在本地预览，再同步源码：

```powershell
cd F:\my_blog
git status
git add .
git commit -m "更新博客内容"
git push
```

`git status` 可先检查本次修改；没有新修改时，无需再次提交。
Vercel 接入仓库后，推送到 `main` 会自动执行生产构建并更新正式网站。
其他分支可生成独立的预览部署，不会直接替换正式网站。

Vercel 的固定设置写在 `vercel.json`：使用 pnpm 安装依赖、执行 `pnpm build`，
并发布 `dist` 目录。`site.config.ts` 中的正式站点 URL 已配置为根域名。
首次上线仍需在 Vercel 控制台导入仓库、添加 `civilighteterna.top` 与
`www.civilighteterna.top`，再按 Vercel 给出的值配置阿里云 DNS。

官方参考：[快速开始](https://valaxy.site/zh/guide/getting-started) · [部署](https://valaxy.site/guide/deploy)
