# Issues 自动发布

在本仓库 Issues 新建文章，标题为文章标题，正文使用 Markdown，添加 documentation 标签。
仅仓库所有者 feeday 创建的 Issue 会发布，其他人的 Issue 和 Pull Request 不会发布。
已有符合条件的 Issue 会在首次运行时补发。编辑标题、正文或标签会自动重建。
关闭 Issue 不会下架文章；移除 documentation 标签后从搜索索引隐藏，文件及历史备份保留。

- 最新正文：/编号.md（旧 blog/md/编号.md 仍保留）。
- 文章地址位于根目录：中文标题默认 /编号.html；英文标题自动转为小写短横线地址，例如 win11-key → /win11-key.html。
- /编号.html、/编号 和旧 /blog/编号.html 均保留，自动跳转到当前文章地址。
- 自定义地址：在 Issue 正文最顶部填写 `<!-- permalink: /6 -->` 或 `<!-- permalink: /my-article.html -->`。仅允许一级路径，字符为英文字母、数字、短横线、下划线，可选 .html 后缀。
- GitHub Pages 的无后缀地址使用目录 index.html，因此访问 /6 会补为 /6/；.html 地址不会补斜杠。
- 自定义路径优先于英文标题；修改标题或路径后旧地址仍可访问。重名或覆盖现有网站页面会停止发布并在 Actions 报错。
- 兼容 HTML 副本：blog/posts/issue-编号.html。
- 历史备份：blog/backups/issue-编号/内容哈希.md 和 .html
- 搜索索引：data/posts.json、data/search.json（自动更新，无需手工维护）

导航页默认隐藏文章；搜索时显示匹配文章，清空搜索后再次隐藏。
索引中的正文由发布脚本生成；图片和附件仍引用 Issue 中的原始地址，不备份二进制附件。
备份 HTML 用于历史恢复，查看时可复制回 blog/posts 对应路径，内部导航是相对路径。

在 Actions → Publish Issues 查看进度或用 Run workflow 全量重建。
工作流使用内置 GITHUB_TOKEN，不需要个人 Token。
网站通过 deploy-pages 显式发布，避免内置 Token 的提交不触发 Pages 构建。
需要启用 GitHub Pages（Settings → Pages，建议 Source 为 GitHub Actions）；
受保护分支/环境可能要求人工批准，工作流不会绕过保护。
网站部署失败不影响已经提交成功的 MD/HTML 备份，修正 Pages 设置后重跑工作流。
