(() => {
  const article = document.querySelector('article');
  if (!article) return;
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
    link.style.paddingLeft = (Number(heading.tagName.slice(1)) - 1) * 10 + 12 + 'px';
    link.addEventListener('click', () => {
      if (matchMedia('(max-width: 1250px)').matches) toc.open = false;
    });
    nav.append(link);
    links.push(link);
  });
  if (headings.length) {
    toc.append(nav);
    toc.open = matchMedia('(min-width: 1251px)').matches;
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
    details.open = true;
    const toggle = document.createElement('summary');
    toggle.textContent = '代码 · 展开 / 收起';
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
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = '已选中，请手动复制';
      }
      setTimeout(() => { button.textContent = '复制代码'; }, 2200);
    });
    pre.before(details);
    details.append(toggle, button, pre);
  });
  const top = document.createElement('a');
  top.href = '#article-top';
  top.className = 'back-top';
  top.textContent = '↑ 顶部';
  top.setAttribute('aria-label', '返回顶部');
  document.body.append(top);
})();
