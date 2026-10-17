# luxの手札

Theralux 的个人博客，使用 Valaxy 1.1.0 与 Yun 主题。

## 本地启动

需要 Node.js >=22.12.0 和 pnpm >=10.26.0。

```powershell
cd F:\my_blog
pnpm.cmd install
pnpm.cmd dev
```

打开终端显示的地址。结束预览时按 Ctrl+C。

## 日常维护

- `site.config.ts`：站点名称、作者、语言和网址。
- `valaxy.config.ts`：首页标题、Yun 主题、导航和配色。
- `pages/posts/`：Markdown 文章。
- `templates/post.md`：文章模板，默认标记为草稿。
- `public/images/`：头像和文章图片。
- `public/favicon.svg`：站点图标。

具体操作见 [中文维护指南](BLOG_GUIDE.md)。

## 同步到 GitHub

源码仓库：[Theralux/my_blog](https://github.com/Theralux/my_blog)。

修改文章或配置，完成本地预览后：

```powershell
git status
git add .
git commit -m "更新博客内容"
git push
```

Vercel 接入仓库后，推送到 `main` 会自动构建并发布到 `https://civilighteterna.top/`。
依赖、构建产物、Vercel 本地配置与 `.env` 文件由 `.gitignore` 排除。

## 构建与预览

```powershell
pnpm.cmd build
pnpm.cmd serve
```

构建结果位于 `dist/`。Vercel 的构建命令和输出目录记录在 `vercel.json` 中。

## 线上部署

- 平台：Vercel Hobby（个人、非商业用途）
- 生产分支：`main`
- 正式域名：`https://civilighteterna.top/`
- 构建环境：Node.js 24.x、pnpm 10.x
- 构建命令：`pnpm build`
- 输出目录：`dist`

首次上线需要在 Vercel 导入 GitHub 仓库并绑定域名；完成后，日常更新只需推送代码。

官方文档：[Valaxy](https://valaxy.site/zh/guide/getting-started)
