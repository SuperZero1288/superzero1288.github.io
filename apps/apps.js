// ZERO — 自作アプリ（/apps/）と F Launcher の配布ページの動き
//  - F Launcher の世界の時計（ステータスバー・ウィジェット・小さなスマホ）
//  - 一覧: F Launcher のカードにカーソルを乗せる（キーボードで選ぶ）と、ページ全体が F Launcher の世界になる
//  - 一覧: カードを押した場所を覚えておき、配布ページではそこから世界が広がる（配布ページの head）
//  - 配布ページ: スマホのイメージが、カーソルのほうへ少し傾く
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------- 時計 ---------- */
  const clocks = document.querySelectorAll('[data-fl-clock]');
  const timeFormat = new Intl.DateTimeFormat('ja-JP', {hour: '2-digit', minute: '2-digit', hour12: false});
  const dateFormat = new Intl.DateTimeFormat('ja-JP', {month: 'long', day: 'numeric', weekday: 'short'});
  const tick = () => {
    const now = new Date();
    const time = timeFormat.format(now);
    const date = dateFormat.format(now);
    clocks.forEach((element) => { element.textContent = element.dataset.flClock === 'date' ? date : time; });
  };
  if (clocks.length) { tick(); setInterval(tick, 15000); }

  /* ---------- 一覧: F Launcher の世界に入る・出る ---------- */
  const card = document.getElementById('fLauncherCard');
  const world = document.getElementById('flWorld');
  if (card && world) {
    let enterTimer = 0;
    let leaveTimer = 0;
    let switchingTimer = 0;
    let pointer = null;
    const isActive = () => root.dataset.world === 'f';
    const center = () => {
      const rect = card.getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    // 円の中心（入った場所・出た場所）と、画面のいちばん遠い角まで届く半径
    const placeOrigin = ([x, y]) => {
      const radius = Math.round(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 24);
      world.style.setProperty('--x', `${Math.round(x)}px`);
      world.style.setProperty('--y', `${Math.round(y)}px`);
      world.style.setProperty('--r', `${radius}px`);
      world.style.setProperty('--r-num', String(radius));
    };
    const setWorld = (on, origin) => {
      if (on === isActive()) return;
      placeOrigin(origin);
      // 切り替えのあいだだけ、ページの色をなめらかに変える
      root.classList.add('fl-switching');
      clearTimeout(switchingTimer);
      switchingTimer = setTimeout(() => root.classList.remove('fl-switching'), 900);
      if (on) root.dataset.world = 'f';
      else root.removeAttribute('data-world');
    };
    // カードの上を通り過ぎただけでは切り替えない（少し待つ）
    const enter = () => {
      clearTimeout(leaveTimer);
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => setWorld(true, pointer || center()), 70);
    };
    const leave = () => {
      clearTimeout(enterTimer);
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => setWorld(false, pointer || center()), 120);
    };
    const isMouse = (event) => event.pointerType === 'mouse' || event.pointerType === 'pen';
    card.addEventListener('pointerenter', (event) => {
      if (!isMouse(event)) return;
      pointer = [event.clientX, event.clientY];
      enter();
    });
    card.addEventListener('pointermove', (event) => {
      if (!isMouse(event)) return;
      pointer = [event.clientX, event.clientY];
      // カードの中の光が、カーソルについてくる
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${Math.round(event.clientX - rect.left)}px`);
      card.style.setProperty('--my', `${Math.round(event.clientY - rect.top)}px`);
    });
    card.addEventListener('pointerleave', (event) => {
      if (!isMouse(event)) return;
      pointer = [event.clientX, event.clientY];
      if (card.matches(':focus-visible')) return;
      leave();
    });
    // キーボードで選んだときも、同じように世界に入る（カードの真ん中から）
    card.addEventListener('focus', () => {
      if (!card.matches(':focus-visible')) return;
      pointer = null;
      enter();
    });
    card.addEventListener('blur', () => {
      if (card.matches(':hover')) return;
      pointer = null;
      leave();
    });
    // 押した場所を覚えておく（配布ページで、そこから世界が広がる）
    card.addEventListener('click', (event) => {
      const [cx, cy] = center();
      const x = event.detail ? event.clientX : cx;
      const y = event.detail ? event.clientY : cy;
      try { sessionStorage.setItem('fl-enter', JSON.stringify({x: Math.round(x), y: Math.round(y), t: Date.now(), world: isActive()})); } catch {}
    });
    // 戻るボタンで戻ってきたときは、世界を閉じた状態から
    addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      clearTimeout(enterTimer);
      clearTimeout(leaveTimer);
      root.removeAttribute('data-world');
      root.classList.remove('fl-switching');
    });
  }

  /* ---------- 配布ページ: スマホのイメージが、カーソルのほうへ少し傾く ---------- */
  const phone = document.querySelector('.fl-phone');
  const hero = document.querySelector('.fl-hero');
  if (phone && hero) {
    const reset = () => {
      phone.style.setProperty('--tilt-x', '0deg');
      phone.style.setProperty('--tilt-y', '0deg');
    };
    hero.addEventListener('pointermove', (event) => {
      if (!finePointer.matches || reducedMotion.matches || event.pointerType !== 'mouse') return;
      const rect = phone.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / innerWidth;
      const dy = (event.clientY - (rect.top + rect.height / 2)) / innerHeight;
      phone.style.setProperty('--tilt-y', `${(dx * 18).toFixed(2)}deg`);
      phone.style.setProperty('--tilt-x', `${(-dy * 14).toFixed(2)}deg`);
    });
    hero.addEventListener('pointerleave', reset);
  }
})();
