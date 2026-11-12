// C51015D — どのページでも使う動き
//  - 表示（自動・ライト・ダーク）の切り替え
//  - トップページ: スマホ用のタブ（左の目次から作る）と、今読んでいる場所の表示
//  - 上部のバー: スクロールしたら下に区切り線を出す
//  - 404: 開こうとしたアドレスを出す
(() => {
  'use strict';
  const THEME_KEY = 'c51015d:theme';
  const root = document.documentElement;
  const page = document.body.dataset.page || 'home';

  /* ---------- 表示の切り替え ---------- */
  const readTheme = () => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'auto';
    } catch { return 'auto'; }
  };
  const applyTheme = (value) => {
    if (value === 'light' || value === 'dark') root.dataset.theme = value;
    else delete root.dataset.theme;
    document.querySelectorAll('input[name="appearance"]').forEach((input) => { input.checked = input.value === value; });
  };
  document.querySelectorAll('input[name="appearance"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      try {
        if (input.value === 'auto') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, input.value);
      } catch {}
      applyTheme(input.value);
    });
  });
  addEventListener('storage', (event) => { if (event.key === THEME_KEY) applyTheme(readTheme()); });
  applyTheme(readTheme());

  /* ---------- 上部のバー: スクロールしたら区切り線 ---------- */
  const bars = () => document.querySelectorAll('.appbar, .tabbar');
  const onScroll = () => bars().forEach((bar) => bar.classList.toggle('is-scrolled', scrollY > 4));

  /* ---------- トップページ: スマホ用のタブと、今いる場所 ---------- */
  const toc = document.querySelector('.sidebar .toc');
  if (page === 'home' && toc) {
    const tabbar = document.createElement('nav');
    tabbar.className = 'tabbar';
    tabbar.setAttribute('aria-label', 'ページ内の移動（タブ）');
    const list = document.createElement('ol');
    toc.querySelectorAll('a').forEach((link) => {
      const item = document.createElement('li');
      const tab = document.createElement('a');
      tab.href = link.getAttribute('href');
      tab.textContent = link.firstChild.textContent.trim();
      item.append(tab);
      list.append(item);
    });
    tabbar.append(list);
    document.querySelector('.content')?.before(tabbar);

    if ('IntersectionObserver' in window) {
      const links = [...document.querySelectorAll('.toc a, .tabbar a')];
      const sections = [...new Set(links.map((link) => link.getAttribute('href')))].map((href) => document.querySelector(href)).filter(Boolean);
      const ratios = new Map();
      const mark = () => {
        // いちばん多く見えているセクション（同じなら上のもの）
        let current = null;
        let best = 0;
        sections.forEach((section) => { const ratio = ratios.get(section) || 0; if (ratio > best + 0.001) { best = ratio; current = section; } });
        links.forEach((link) => {
          if (current && link.getAttribute('href') === `#${current.id}`) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
        const active = tabbar.querySelector('[aria-current]');
        if (active && tabbar.scrollWidth > tabbar.clientWidth) active.scrollIntoView({block: 'nearest', inline: 'nearest'});
      };
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRect.height / innerHeight : 0));
        mark();
      }, {threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]});
      sections.forEach((section) => observer.observe(section));
    }
  }

  addEventListener('scroll', onScroll, {passive: true});
  onScroll();

  /* ---------- 404: 開こうとしたアドレス ---------- */
  if (page === '404') {
    const target = document.getElementById('notfoundPath');
    const requested = new URLSearchParams(location.search).get('path');
    if (target && requested && requested.startsWith('/')) target.textContent = requested;
  }
})();
