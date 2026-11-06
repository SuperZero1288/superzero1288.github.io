// ZERO — 404ページ
// 隠し要素: 「404」の0を5回押すと、前のデザインのサイト（/legacy/）への扉が現れます。
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const path = $('errorPath');
  if (path && location.pathname !== '/404.html') {
    try { path.textContent = decodeURIComponent(location.pathname); } catch { path.textContent = location.pathname; }
  }

  $('historyBack').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = '/';
  });

  const SHAPES = ['cookie9', 'clover4', 'flower', 'burst', 'gem', 'pentagon', 'circle'];
  const CLICKS_TO_OPEN = 5;
  const zero = $('errorZero');
  const door = $('legacyDoor');
  let clicks = 0;
  zero.addEventListener('click', () => {
    clicks += 1;
    zero.style.setProperty('--zero-shape', `var(--shape-${SHAPES[clicks % SHAPES.length]})`);
    zero.style.setProperty('--zero-rotate', `${clicks * 45}deg`);
    if (clicks < CLICKS_TO_OPEN || !door.hidden) return;
    zero.classList.add('is-open');
    door.hidden = false;
    door.classList.add('is-revealed');
    window.zeroSite?.notify('隠し扉を見つけた…？');
    door.focus({preventScroll: true});
    door.scrollIntoView({block: 'nearest', behavior: window.zeroSite?.reducedMotion.matches ? 'instant' : 'smooth'});
  });
})();
