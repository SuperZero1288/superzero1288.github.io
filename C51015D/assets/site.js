// C51015D — どのページでも使う動き（背景、ドックのメニュー、ダーク/ライト、今いる場所の表示、404の表示）
// ページの <body> に data-root（サイトのいちばん上までの相対パス）と data-page（home / blog / article / 404）を書いておきます。
(() => {
  'use strict';
  const BRAND = 'C5';
  const THEME_KEY = 'c51015d:theme';
  const root = document.documentElement;
  const body = document.body;
  const base = body.dataset.root || './';
  const page = body.dataset.page || 'home';
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');

  const ICONS = {
    about: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z"/>',
    works: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
    note: '<path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-5 14H7v-2h7v2Zm3-4H7v-2h10v2Zm0-4H7V7h10v2Z"/>',
    links: '<path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 0-10Z"/>',
    moon: '<path d="M11.38 2.02C9.92 3.39 9 5.34 9 7.5 9 11.64 12.36 15 16.5 15c2.16 0 4.11-.92 5.48-2.38C21.66 17.85 17.31 22 12 22 6.48 22 2 17.52 2 12c0-5.31 4.15-9.66 9.38-9.98Z"/>',
    sun: '<path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12ZM11 1h2v3h-2V1Zm0 19h2v3h-2v-3ZM3.51 4.93l1.42-1.42 2.12 2.13-1.41 1.41-2.13-2.12Zm13.44 13.43 1.41-1.41 2.13 2.12-1.42 1.42-2.12-2.13Zm2.12-14.85 1.42 1.42-2.13 2.12-1.41-1.41 2.12-2.13ZM5.64 16.95l1.41 1.41-2.12 2.13-1.42-1.42 2.13-2.12ZM23 11v2h-3v-2h3ZM4 11v2H1v-2h3Z"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ---------- 背景 ---------- */
  if (!document.querySelector('.backdrop')) {
    body.insertAdjacentHTML('afterbegin', '<div class="backdrop" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="blob b4"></span></div>');
  }

  /* ---------- ドックのメニュー ---------- */
  const onArticlePages = page === 'blog' || page === 'article';
  const items = [
    {id: 'about', label: 'About', href: `${base}#about`},
    {id: 'works', label: 'Works', href: `${base}#works`},
    {id: 'note', label: 'note記事', href: onArticlePages ? `${base}blog/` : `${base}#note`},
    {id: 'links', label: 'Links', href: `${base}#links`},
  ];
  const nav = document.createElement('nav');
  nav.className = 'dock glass';
  nav.setAttribute('aria-label', 'サイトのメニュー');
  nav.innerHTML = `<a class="dock-brand" href="${base}" aria-label="ホームへ">${BRAND}</a>
<ul class="dock-items">${items.map((item) => `<li><a href="${item.href}" data-section="${item.id}"${item.id === 'note' && onArticlePages ? ' aria-current="page"' : ''}>${svg(item.id)}<span class="dock-label">${item.label}</span></a></li>`).join('')}</ul>
<button class="dock-theme" id="themeToggle" type="button"><span class="dock-icon"></span><span class="dock-label"></span></button>`;
  const skip = document.querySelector('.skip');
  if (skip) skip.after(nav); else body.prepend(nav);
  // 文字が見えないアイコンだけのリンクにも、読み上げ用の名前を付ける
  nav.querySelectorAll('.dock-items a').forEach((link) => link.setAttribute('aria-label', link.querySelector('.dock-label').textContent));

  /* ---------- ダーク/ライト ---------- */
  const toggle = document.getElementById('themeToggle');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : prefersDark.matches);
  const renderTheme = () => {
    const dark = isDark();
    const label = dark ? 'ライトモードにする' : 'ダークモードにする';
    toggle.querySelector('.dock-icon').innerHTML = svg(dark ? 'sun' : 'moon');
    toggle.querySelector('.dock-label').textContent = label;
    toggle.setAttribute('aria-label', label);
  };
  toggle.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    renderTheme();
  });
  prefersDark.addEventListener('change', renderTheme);
  addEventListener('storage', (event) => {
    if (event.key !== THEME_KEY) return;
    if (event.newValue === 'light' || event.newValue === 'dark') root.dataset.theme = event.newValue;
    renderTheme();
  });
  renderTheme();

  /* ---------- トップページ: 今見ている場所をドックで光らせる ---------- */
  if (page === 'home' && 'IntersectionObserver' in window) {
    const links = new Map([...nav.querySelectorAll('[data-section]')].map((link) => [link.dataset.section, link]));
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visible.set(entry.target.id, entry.intersectionRatio));
      let best = '';
      let bestRatio = 0;
      visible.forEach((ratio, id) => { if (ratio > bestRatio) { best = id; bestRatio = ratio; } });
      links.forEach((link, id) => {
        if (id === best && bestRatio > 0) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }, {threshold: [0, 0.25, 0.5, 0.75, 1]});
    links.forEach((link, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
  }

  /* ---------- 404: 開こうとしたアドレスを出す ---------- */
  if (page === '404') {
    const target = document.getElementById('notfoundPath');
    const requested = new URLSearchParams(location.search).get('path');
    if (target && requested && requested.startsWith('/')) target.textContent = requested;
  }
})();
