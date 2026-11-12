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

    const links = [...document.querySelectorAll('.toc a, .tabbar a')];
    const sections = [...new Set(links.map((link) => link.getAttribute('href')))].map((href) => document.querySelector(href)).filter(Boolean);
    // 目次から選んだセクション。自分でスクロールするまでは、こちらを優先する
    // （短いセクションは画面の上まで来られないので、位置だけでは選べないことがある）
    let picked = null;
    const pick = (hash) => { picked = sections.find((section) => `#${section.id}` === hash) || null; };
    const release = () => { if (picked) { picked = null; spy(); } };
    let marked;
    const mark = (current) => {
      if (current === marked) return;
      marked = current;
      links.forEach((link) => {
        if (current && link.getAttribute('href') === `#${current.id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      // タブが横にはみ出しているときは、選んだタブが見えるようにタブだけを横に動かす
      // （scrollIntoView はページのスクロールまで止めてしまうので使わない）
      const active = tabbar.querySelector('[aria-current]');
      if (active && list.scrollWidth > list.clientWidth) {
        const box = active.getBoundingClientRect();
        const view = list.getBoundingClientRect();
        if (box.left < view.left) list.scrollLeft -= view.left - box.left + 8;
        else if (box.right > view.right) list.scrollLeft += box.right - view.right + 8;
      }
    };
    const spy = () => {
      let current = picked;
      if (!current) {
        const scroller = document.scrollingElement || root;
        if (scrollY > 0 && scrollY + innerHeight >= scroller.scrollHeight - 2) {
          // いちばん下まで来たら、最後のセクション
          current = sections[sections.length - 1];
        } else {
          // 上のタブ（スマホ）の少し下に引いた線を、見出しが越えた最後のセクション（まだ越えていなければ最初のセクション）
          const top = tabbar.getBoundingClientRect().height ? tabbar.getBoundingClientRect().bottom : 0;
          const line = top + Math.min(innerHeight * 0.3, 200);
          current = sections[0] || null;
          sections.forEach((section) => { if (section.getBoundingClientRect().top <= line) current = section; });
        }
      }
      mark(current);
    };
    links.forEach((link) => link.addEventListener('click', () => { pick(link.getAttribute('href')); mark(picked); }));
    ['wheel', 'touchstart', 'keydown'].forEach((type) => addEventListener(type, release, {passive: true}));
    addEventListener('hashchange', () => { pick(location.hash); spy(); });
    if (location.hash) pick(location.hash);
    let queued = false;
    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; spy(); });
    }, {passive: true});
    addEventListener('resize', spy);
    spy();
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
