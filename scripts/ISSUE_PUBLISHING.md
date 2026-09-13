# Issues 自动发布

在本仓库 Issues 新建文章，标题为文章标题，正文使用 Markdown，添加 documentation 标签。
仅仓库所有者 feeday 创建的 Issue 会发布，其他人的 Issue 和 Pull Request 不会发布。
已有符合条件的 Issue 会在首次运行时补发。编辑标题、正文或标签会自动重建。
关闭 Issue 不会下架文章；移除 documentation 标签后从搜索索引隐藏，文件及历史备份保留。

- 最新正文：blog/posts/issue-编号.md
- 最新网页：blog/posts/issue-编号.html
- 历史备份：blog/backups/issue-编号/内容哈希.md 和 .html
- 搜索索引：data/posts.json、data/search.json（自动更新，无需手工维护）

t2.html 默认隐藏文章；搜索时显示匹配文章，清空搜索后再次隐藏。
索引中的正文由发布脚本生成；图片和附件仍引用 Issue 中的原始地址，不备份二进制附件。
备份 HTML 用于历史恢复，查看时可复制回 blog/posts 对应路径，内部导航是相对路径。

在 Actions → Publish Issues 查看进度或用 Run workflow 全量重建。
工作流使用内置 GITHUB_TOKEN，不需要个人 Token。
网站通过 deploy-pages 显式发布，避免内置 Token 的提交不触发 Pages 构建。
需要启用 GitHub Pages（Settings → Pages，建议 Source 为 GitHub Actions）；
受保护分支/环境可能要求人工批准，工作流不会绕过保护。
网站部署失败不影响已经提交成功的 MD/HTML 备份，修正 Pages 设置后重跑工作流。
