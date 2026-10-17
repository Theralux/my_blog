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

目前推送只同步源码，服务器自动部署尚未配置。依赖、构建产物与 `.env` 文件由 `.gitignore` 排除。

## 构建与预览

```powershell
pnpm.cmd build
pnpm.cmd serve
```

构建结果位于 `dist/`。当前为本地阶段；正式部署前需设置 `site.config.ts` 中的 `url`，以及子路径部署所需的 `vite.base`。

官方文档：[Valaxy](https://valaxy.site/zh/guide/getting-started)
