// ZERO — 自作アプリ（/apps/）と F Launcher の配布ページの動き
//  - ホーム画面の見本: セカンドスペースのテンプレートとテーマが、自動でランダムに入れかわる
//    （F Launcher の編集画面のように、ガラスの枠とマスの点を出してから入れかえる）
//  - 一覧: F Launcher のカードにカーソルを乗せる（キーボードで選ぶ）と、後ろにホーム画面が円で広がり、
//          ページの部品は同じ位置のまま、色・角丸・面が Material 3 のものへなめらかに変わる（CSS）。
//          書体だけはなめらかに変えられないので、文字だけその場で重ねて入れかえる（View Transitions）
//  - 一覧: カードを押した場所を覚えておき、配布ページではそこから広がる（配布ページの head）
//  - 配布ページ: 自動の入れかえを止める・動かすボタン。上のバーは、下へスクロールすると名前が出る
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const TEMPLATE_NAMES = {custom: 'カスタム', blank: '空白', clock: '時計', stripe: 'ストライプ', deck: 'デッキ'};
  const STYLE_NAMES = {material: 'マテリアル', blur: 'ブラー', glass: 'Liquid Glass'};
  const STYLES = Object.keys(STYLE_NAMES);
  const pickOther = (list, current) => {
    const options = list.filter((item) => item !== current);
    return options[Math.floor(Math.random() * options.length)];
  };

  /* ---------- セカンドスペースを入れかえる ---------- */
  const editTimers = new WeakMap();
  const customize = (space, styleHost, template, style, onChange) => {
    (editTimers.get(space) || []).forEach(clearTimeout);
    space.classList.add('is-editing');
    editTimers.set(space, [
      setTimeout(() => {
        space.dataset.template = template;
        if (style) styleHost.dataset.style = style;
        onChange?.();
      }, 220),
      setTimeout(() => space.classList.remove('is-editing'), 1000),
    ]);
  };
  // テンプレートは毎回ちがうものに、テーマはときどき変える
  const randomStep = (space, styleHost, templates, onChange) => {
    const template = pickOther(templates, space.dataset.template);
    const style = Math.random() < 0.45 ? pickOther(STYLES, styleHost.dataset.style) : null;
    customize(space, styleHost, template, style, onChange);
  };

  /* ---------- 一覧: F Launcher の世界に入る・出る ---------- */
  const card = document.getElementById('fLauncherCard');
  const world = document.getElementById('flWorld');
  if (card && world) {
    const space = world.querySelector('.fl-space');
    const LIST_TEMPLATES = ['custom', 'clock', 'stripe', 'deck'];
    // 書体が変わる文字（その場で重ねて入れかえる）
    const TEXTS = '.toolbar .clock, .apps-hero .eyebrow, .page-title, .page-lead, .page-actions .btn, .card-title, .card-sub, .app-name, .app-desc, .app-chip, .app-go, .app-icon-soon, .app-card-soon strong, .app-card-soon .app-copy > span, .page-footer > *';
    let desired = false;
    let running = null;
    let origin = null;
    let pointer = null;
    let intentTimer = 0;
    let cycleTimer = 0;
    const isActive = () => root.dataset.world === 'f';
    // F Launcher の書体を先に読み込んでおく（初めてカーソルを乗せたときに、文字が2回変わらないように）
    addEventListener('load', () => {
      const sample = document.querySelector('main')?.textContent.replace(/\s+/g, '') || '';
      ['400', '500'].forEach((weight) => {
        document.fonts?.load(`${weight} 16px "Google Sans Flex"`, sample).catch(() => {});
        document.fonts?.load(`${weight} 16px "Noto Sans JP"`, sample).catch(() => {});
      });
    }, {once: true});
    const center = () => {
      const rect = card.getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    const placeOrigin = ([x, y]) => {
      world.style.setProperty('--x', `${Math.round(x)}px`);
      world.style.setProperty('--y', `${Math.round(y)}px`);
      world.style.setProperty('--r', `${Math.round(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 24)}px`);
    };
    const stopCycle = () => clearInterval(cycleTimer);
    const startCycle = () => {
      stopCycle();
      space.dataset.template = 'custom';
      world.dataset.style = 'material';
      cycleTimer = setInterval(() => randomStep(space, world, LIST_TEMPLATES), 2600);
    };
    const apply = (on) => {
      if (on) { root.dataset.world = 'f'; startCycle(); }
      else { root.removeAttribute('data-world'); stopCycle(); space.classList.remove('is-editing'); }
    };
    // 今の状態を、なってほしい状態に合わせる（切り替えの途中なら、終わってから合わせる）
    const sync = () => {
      if (running || desired === isActive()) return;
      const on = desired;
      placeOrigin(origin || center());
      if (!document.startViewTransition || reducedMotion.matches || document.hidden) { apply(on); return; }
      // 文字にだけ名前を付けて、ほかは CSS でなめらかに変える
      const texts = [...document.querySelectorAll(TEXTS)].filter((element) => element.getClientRects().length);
      texts.forEach((element, index) => { element.style.viewTransitionName = `fl-text-${index}`; });
      root.classList.add('fl-morph');
      const transition = document.startViewTransition(() => apply(on));
      running = transition;
      // ページを移るときなどに途中で止めた場合は、知らせなくてよい
      transition.ready.catch(() => {});
      transition.finished.catch(() => {}).finally(() => {
        texts.forEach((element) => { element.style.viewTransitionName = ''; });
        root.classList.remove('fl-morph');
        running = null;
        // 切り替えのあいだは、カーソルがカードから出たように見えることがあるので、終わってから本当の位置で決め直す
        if (pointer && !card.matches(':focus-visible')) {
          const over = card.contains(document.elementFromPoint(pointer[0], pointer[1]));
          if (over !== desired) { clearTimeout(intentTimer); desired = over; origin = pointer; }
        }
        sync();
      });
    };
    // カードの上を通り過ぎただけでは切り替えない（少し待つ）
    const want = (on, delay) => {
      clearTimeout(intentTimer);
      intentTimer = setTimeout(() => { desired = on; sync(); }, delay);
    };
    const isMouse = (event) => event.pointerType === 'mouse' || event.pointerType === 'pen';
    addEventListener('pointermove', (event) => {
      if (isMouse(event)) pointer = [event.clientX, event.clientY];
    }, {passive: true});
    card.addEventListener('pointerenter', (event) => {
      if (!isMouse(event) || running) return;
      origin = pointer = [event.clientX, event.clientY];
      want(true, 70);
    });
    card.addEventListener('pointermove', (event) => {
      if (isMouse(event)) origin = [event.clientX, event.clientY];
    });
    card.addEventListener('pointerleave', (event) => {
      if (!isMouse(event) || running) return;
      origin = pointer = [event.clientX, event.clientY];
      if (card.matches(':focus-visible')) return;
      want(false, 120);
    });
    // キーボードで選んだときも、同じように世界に入る（カードの真ん中から）
    card.addEventListener('focus', () => {
      if (!card.matches(':focus-visible')) return;
      origin = null;
      want(true, 0);
    });
    card.addEventListener('blur', () => {
      if (card.matches(':hover')) return;
      origin = null;
      want(false, 0);
    });
    // 押した場所を覚えておき、アイコンと名前を配布ページへつなぐ
    card.addEventListener('click', (event) => {
      const [cx, cy] = center();
      const x = event.detail ? event.clientX : cx;
      const y = event.detail ? event.clientY : cy;
      try { sessionStorage.setItem('fl-enter', JSON.stringify({x: Math.round(x), y: Math.round(y), t: Date.now(), world: isActive()})); } catch {}
      running?.skipTransition();
      root.classList.add('fl-linking');
    });
    // 戻るボタンで戻ってきたときは、世界を閉じた状態から
    addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      clearTimeout(intentTimer);
      desired = false;
      apply(false);
      root.classList.remove('fl-morph', 'fl-linking');
    });
  }

  /* ---------- 配布ページ: ホーム画面の見本が自動でランダムに入れかわる（止められる） ---------- */
  const phone = document.getElementById('flPhone');
  const toggle = document.getElementById('flAutoplay');
  if (phone && toggle) {
    const phoneSpace = phone.querySelector('.fl-space');
    const now = document.getElementById('flNow');
    const label = toggle.querySelector('span');
    const icon = toggle.querySelector('path');
    const ICON_PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';
    const ICON_PLAY = 'M8 5.5v13a.8.8 0 0 0 1.2.7l10.3-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z';
    let paused = reducedMotion.matches; // 「動きを減らす」設定のときは、止めた状態から
    let visible = true;
    let timer = 0;
    const describe = () => {
      if (now) now.innerHTML = `テンプレート: <b>${TEMPLATE_NAMES[phoneSpace.dataset.template]}</b>・テーマ: <b>${STYLE_NAMES[phone.dataset.style]}</b>`;
    };
    const schedule = () => {
      clearInterval(timer);
      if (paused || !visible || document.hidden) return;
      timer = setInterval(() => randomStep(phoneSpace, phone, Object.keys(TEMPLATE_NAMES), describe), 3200);
    };
    const render = () => {
      // ボタンの文字で「一時停止」「再生」を表す（aria-pressed は付けない）
      label.textContent = paused ? '再生' : '一時停止';
      icon.setAttribute('d', paused ? ICON_PLAY : ICON_PAUSE);
      schedule();
    };
    toggle.addEventListener('click', () => { paused = !paused; render(); });
    document.addEventListener('visibilitychange', schedule);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }).observe(phone);
    }
    describe();
    render();
  }

  /* ---------- 配布ページ: 上のバー（見出しが隠れたら、色を付けて名前を出す） ---------- */
  const appBar = document.getElementById('flAppBar');
  const title = document.getElementById('flTitle');
  if (appBar && title && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => appBar.classList.toggle('is-scrolled', !entry.isIntersecting), {rootMargin: '-64px 0px 0px 0px'}).observe(title);
  }
})();
