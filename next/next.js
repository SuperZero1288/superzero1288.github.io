(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // スクロールで要素を登場させる
  const revealItems = document.querySelectorAll('.reveal');
  const showAll = () => revealItems.forEach((item) => item.classList.add('is-visible'));
  if (!('IntersectionObserver' in window) || reducedMotion.matches) {
    showAll();
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.12});
    revealItems.forEach((item) => observer.observe(item));
  }
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) showAll(); });

  // ヒーローの図形をマウスの位置に合わせて少しずらす
  const hero = document.getElementById('hero');
  const shapes = hero?.querySelector('.hero-shapes');
  if (hero && shapes && matchMedia('(pointer: fine)').matches) {
    let frame = 0;
    hero.addEventListener('pointermove', (event) => {
      if (reducedMotion.matches || frame) return;
      frame = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        shapes.style.setProperty('--px', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
        shapes.style.setProperty('--py', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
        frame = 0;
      });
    });
    hero.addEventListener('pointerleave', () => {
      shapes.style.setProperty('--px', '0');
      shapes.style.setProperty('--py', '0');
    });
  }

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'})
      .format(date).replaceAll('/', '.');
  };

  const element = (tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const safeUrl = (value, fallback) => {
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  };

  // 同期済みのnote記事を表示する（取得できなければ、HTMLに書いた記事をそのまま使う）
  const noteList = document.getElementById('noteList');
  fetch('/blog/articles.json').then((response) => {
    if (!response.ok) throw new Error(`note: ${response.status}`);
    return response.json();
  }).then((articles) => {
    if (!noteList || !articles.length) return;
    noteList.replaceChildren(...articles.slice(0, 3).map((article) => {
      const link = element('a', 'note-card reveal is-visible');
      link.href = article.generated ? `/blog/${article.id}.html` : safeUrl(article.sourceUrl, 'https://note.com/zerrrrro_1288');
      if (!article.generated) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      const cover = article.coverPath ? `/blog/${article.coverPath}` : article.thumbnail;
      if (cover) {
        const image = element('img');
        image.src = safeUrl(cover, '');
        image.alt = '';
        image.loading = 'lazy';
        link.append(image);
      }
      const copy = element('span', 'note-copy');
      const time = element('time', '', formatDate(article.publishedAt));
      time.dateTime = article.publishedAt;
      copy.append(time, element('strong', '', article.title), element('span', 'note-more', article.generated ? 'サイト内で読む →' : 'noteで読む ↗'));
      link.append(copy);
      return link;
    }));
  }).catch((error) => console.warn('note記事はページ内の表示を使います', error));

  // 最近更新したGitHubリポジトリ
  const repoList = document.getElementById('repoList');
  fetch('/blog/latest-links.json').then((response) => {
    if (!response.ok) throw new Error(`links: ${response.status}`);
    return response.json();
  }).then((latest) => {
    const repositories = latest.githubRepositories?.slice(0, 3) || [];
    if (!repoList || !repositories.length) return;
    repoList.replaceChildren(...repositories.map((repository) => {
      const item = element('li');
      const link = element('a');
      link.href = safeUrl(repository.html_url, 'https://github.com/SuperZero1288');
      link.target = '_blank';
      link.rel = 'noopener';
      const meta = [formatDate(repository.pushed_at), repository.language].filter(Boolean).join(' / ');
      link.append(element('strong', '', repository.name), element('small', '', meta));
      item.append(link);
      return item;
    }));
  }).catch((error) => console.warn('GitHubの更新情報はページ内の表示を使います', error));
})();
