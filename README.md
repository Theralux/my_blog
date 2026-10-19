# luxの手札

Theralux 的个人博客，使用 Valaxy 1.1.0 与 Yun 主题。

## 本地写作工作台

需要 Node.js >=22.12.0 和 pnpm >=10.26.0。

平时可直接双击项目目录中的 `start-workbench.cmd`，会启动工作台并打开浏览器。也可以使用命令：

```powershell
cd F:\my_blog
pnpm.cmd install
pnpm.cmd workbench
```

打开 `http://127.0.0.1:4861/`。在工作台里新建文章、填写标题和正文、上传图片，先保存为草稿；写好后取消草稿，点击“预览博客”检查页面，再点“同步到线上”确认发布。工作台会把改动推送到 GitHub，Vercel 随后自动更新正式网站。关闭工作台时，在运行它的终端按 Ctrl+C。

详细步骤见 [中文维护指南](BLOG_GUIDE.md)。

## 单独启动博客预览

```powershell
cd F:\my_blog
pnpm.cmd dev
```

打开终端显示的地址。结束预览时按 Ctrl+C；工作台里的“预览博客”也可以启动预览。

## 日常维护

- `site.config.ts`：站点名称、作者、语言和网址。
- `valaxy.config.ts`：首页标题、Yun 主题、导航和配色。
- `pages/posts/`：Markdown 文章。
- `templates/post.md`：文章模板，默认标记为草稿。
- `public/images/`：头像和文章图片。
- `public/favicon.svg`：站点图标。

## 手动同步到 GitHub

源码仓库：[Theralux/my_blog](https://github.com/Theralux/my_blog)。

修改文章或配置，完成本地预览后：

```powershell
git status
git add .
git commit -m "更新博客内容"
git push
```

推送到 `main` 会自动触发 Vercel 构建并更新 [正式博客](https://civilighteterna.top/)。
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
- 正式域名：[civilighteterna.top](https://civilighteterna.top/)，已接入 Vercel
- HTTPS：由 Vercel 自动签发并续期 SSL 证书
- 构建环境：Node.js 24.x、pnpm 10.x
- 构建命令：`pnpm build`
- 输出目录：`dist`

GitHub 仓库、Vercel 自动部署与域名均已接通。日常更新可在本地工作台完成。

官方文档：[Valaxy](https://valaxy.site/zh/guide/getting-started)
