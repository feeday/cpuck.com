(() => {
  const article = document.querySelector('article');
  if (!article) return;
  const themeButton = document.querySelector('.theme-toggle');
  const setTheme = theme => {
    document.documentElement.dataset.theme = theme;
    if (themeButton) {
      themeButton.textContent = theme === 'dark' ? '浅色' : '深色';
      themeButton.setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
    }
  };
  let theme = 'light';
  try { theme = localStorage.getItem('cpuck-article-theme') === 'dark' ? 'dark' : 'light'; } catch {}
  setTheme(theme);
  themeButton?.addEventListener('click', () => {
    theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
    try { localStorage.setItem('cpuck-article-theme', theme); } catch {}
  });
  const readingTime = document.querySelector('.reading-time');
  if (readingTime) readingTime.textContent = '约 ' + Math.max(1, Math.ceil(article.textContent.replace(/\s/g, '').length / 500)) + ' 分钟阅读';
  const headings = [...article.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const toc = document.createElement('details');
  toc.className = 'article-toc';
  const summary = document.createElement('summary');
  summary.textContent = '文章目录';
  toc.append(summary);
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', '文章目录');
  const links = [];
  headings.forEach((heading, index) => {
    if (!heading.id) {
      let id = 'article-section-' + (index + 1);
      while (document.getElementById(id)) id += '-';
      heading.id = id;
    }
    const link = document.createElement('a');
    link.href = '#' + encodeURIComponent(heading.id);
    link.textContent = heading.textContent.trim();
    const minLevel = Math.min(...headings.map(h => Number(h.tagName.slice(1))));
    link.style.paddingLeft = (Number(heading.tagName.slice(1)) - minLevel) * 10 + 12 + 'px';
    link.title = link.textContent;
    link.addEventListener('click', () => {
      if (matchMedia('(max-width: 1199px)').matches) toc.open = false;
    });
    nav.append(link);
    links.push(link);
  });
  if (headings.length) {
    toc.append(nav);
    toc.open = matchMedia('(min-width: 1200px)').matches;
    document.body.classList.add('has-toc');
    document.body.append(toc);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        const current = entries.find(entry => entry.isIntersecting);
        if (!current) return;
        const index = headings.indexOf(current.target);
        links.forEach((link, i) => {
          if (i === index) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }, {rootMargin: '0px 0px -65% 0px'});
      headings.forEach(heading => observer.observe(heading));
    }
  }
  article.querySelectorAll('pre').forEach(pre => {
    const details = document.createElement('details');
    details.className = 'code-fold';
    const frame = document.createElement('div');
    frame.className = 'code-frame';
    const toggle = document.createElement('summary');
    const language = pre.getAttribute('lang') || '代码';
    const lineCount = pre.textContent.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length;
    details.open = lineCount <= 10;
    const updateLabel = () => {
      toggle.textContent = language + ' · ' + lineCount + ' 行 · ' + (details.open ? '收起' : '展开');
    };
    updateLabel();
    details.addEventListener('toggle', updateLabel);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = '复制代码';
    button.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent);
        button.textContent = '已复制';
      } catch {
        details.open = true;
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = '已选中，请手动复制';
      }
      setTimeout(() => { button.textContent = '复制代码'; }, 2200);
    });
    pre.before(frame);
    frame.append(details, button);
    details.append(toggle, pre);
  });
  const top = document.createElement('a');
  top.href = '#article-top';
  top.className = 'back-top';
  top.textContent = '↑ 顶部';
  top.setAttribute('aria-label', '返回顶部');
  document.body.append(top);
})();
