# Issues 自动发布

在本仓库 Issues 新建文章，标题为文章标题，正文使用 Markdown，添加 documentation 标签。
仅仓库所有者 feeday 创建的 Issue 会发布；Pull Request 不发布。修改标题、正文或标签会自动重建。
关闭 Issue 不下架；移除 documentation 标签会从搜索索引隐藏，已有文章文件保留。

## 文件与链接

所有文章文件平铺在 `data` 中，不再向仓库写入 blog、数字目录或根目录文章副本：

- `data/6.md`：Markdown 正文。
- `data/6.html`：文章 HTML。
- `data/article-routes.json`：文章公开地址及旧地址映射。
- `data/posts.json`、`data/search.json`：搜索索引。

历史修订通过 Git 提交记录查看，不再额外生成 backups 副本。迁移前的备份仍可在 Git 历史中找回。

公开链接保持简洁：中文标题默认 `/编号.html`；英文标题转为小写短横线地址，例如 `win11-key` → `/win11-key.html`。
在 Issue 正文最顶部添加 `<!-- permalink: /6 -->` 或 `<!-- permalink: /my-article.html -->` 可指定地址。
自定义路径仅允许一级英文字母、数字、短横线、下划线，可选 `.html` 后缀；优先于标题生成规则。
重名或与网站已有页面冲突会停止发布，并在 Actions 中报错。

GitHub Pages 无后缀地址使用目录 index.html，访问 `/6` 会补为 `/6/`。
`scripts/stage_site.py` 仅在仓库外的临时部署目录生成公开页面和兼容跳转，绝不提交这些页面。
旧数字链接、旧 blog 链接及以前的标题地址继续跳转到当前地址。
文章内 Markdown 下载指向 `/data/编号.md`。

代码块超过 10 行默认折叠，10 行及以内默认展开；均保留复制按钮。
首页默认隐藏文章，搜索完整文章索引。

## 发布

Actions → Publish Issues → Run workflow 可全量重建。
工作流使用内置 GITHUB_TOKEN；GitHub Pages 的 Source 设为 GitHub Actions。
文章仅写回 data，之后生成部署产物并使用 deploy-pages 发布。
图片与附件引用 Issue 原始地址，不下载二进制附件。
