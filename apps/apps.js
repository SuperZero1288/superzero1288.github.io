// ZERO — 自作アプリ（/apps/）と F Launcher の配布ページの動き
//  - 一覧: F Launcher のカードにカーソルを乗せる（キーボードで選ぶ）と、カーソルの場所から円が広がり、
//          ページが F Launcher のホーム画面になる（View Transitions）。離れると、その場所へ円がしぼんで戻る。
//          そのあいだ、セカンドスペースの中身がテンプレートごとに入れかわる
//  - 一覧: カードを押した場所を覚えておき、配布ページではそこから広がる（配布ページの head）
//  - 配布ページ: ホーム画面の見本のテンプレートとテーマを切り替える。上のバーは、下へスクロールすると名前が出る
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const EMPHASIZED_DECELERATE = 'cubic-bezier(.05,.7,.1,1)';
  const EMPHASIZED_ACCELERATE = 'cubic-bezier(.3,0,.8,.15)';
  const CYCLE = ['custom', 'clock', 'stripe', 'deck'];

  /* ---------- セカンドスペースを入れかえる ----------
     F Launcher の編集画面のように、ガラスの枠とマスの点を出してから、中身を入れかえる（フェードスルーは CSS） */
  const editTimers = new WeakMap();
  const switchTemplate = (space, template) => {
    if (!space || space.dataset.template === template) return;
    (editTimers.get(space) || []).forEach(clearTimeout);
    space.classList.add('is-editing');
    editTimers.set(space, [
      setTimeout(() => { space.dataset.template = template; }, 220),
      setTimeout(() => space.classList.remove('is-editing'), 1000),
    ]);
  };

  /* ---------- 一覧: F Launcher の世界に入る・出る ---------- */
  const card = document.getElementById('fLauncherCard');
  const world = document.getElementById('flWorld');
  if (card && world) {
    const space = world.querySelector('.fl-space');
    let desired = false;
    let running = null;
    let origin = null;
    let pointer = null; // ページの上の、いちばん新しいカーソルの位置
    let intentTimer = 0;
    let cycleTimer = 0;
    const isActive = () => root.dataset.world === 'f';
    const center = () => {
      const rect = card.getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    const stopCycle = () => clearInterval(cycleTimer);
    const startCycle = () => {
      stopCycle();
      space.dataset.template = CYCLE[0];
      cycleTimer = setInterval(() => switchTemplate(space, CYCLE[(CYCLE.indexOf(space.dataset.template) + 1) % CYCLE.length]), 2600);
    };
    const apply = (on) => {
      if (on) { root.dataset.world = 'f'; startCycle(); }
      else { root.removeAttribute('data-world'); stopCycle(); space.classList.remove('is-editing'); }
    };
    // 今の状態を、なってほしい状態に合わせる（切り替えの途中なら、終わってから合わせる）
    const sync = () => {
      if (running || desired === isActive()) return;
      const on = desired;
      const [x, y] = origin || center();
      if (!document.startViewTransition || reducedMotion.matches || document.hidden) { apply(on); return; }
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add(on ? 'fl-reveal' : 'fl-conceal');
      const transition = document.startViewTransition(() => apply(on));
      running = transition;
      transition.ready.then(() => {
        const small = `circle(0px at ${Math.round(x)}px ${Math.round(y)}px)`;
        const large = `circle(${Math.round(radius)}px at ${Math.round(x)}px ${Math.round(y)}px)`;
        // 入るときは新しい画面が広がり、出るときは今の画面がしぼむ（Material 3 の強調した減速・加速）
        root.animate({clipPath: on ? [small, large] : [large, small]}, {
          duration: on ? 550 : 350,
          easing: on ? EMPHASIZED_DECELERATE : EMPHASIZED_ACCELERATE,
          pseudoElement: on ? '::view-transition-new(root)' : '::view-transition-old(root)',
        });
      }).catch(() => {});
      transition.finished.finally(() => {
        root.classList.remove('fl-reveal', 'fl-conceal');
        running = null;
        // 切り替えのあいだは画面の上に切り替え用の層がかぶり、カーソルがカードから出たように見えるので、
        // 終わってから、カーソルの本当の位置で決め直す
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
      root.classList.add('fl-linking');
    });
    // 戻るボタンで戻ってきたときは、世界を閉じた状態から
    addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      clearTimeout(intentTimer);
      desired = false;
      apply(false);
      root.classList.remove('fl-reveal', 'fl-conceal');
    });
  }

  /* ---------- 配布ページ: ホーム画面の見本を切り替える ---------- */
  const phone = document.getElementById('flPhone');
  if (phone) {
    const phoneSpace = phone.querySelector('.fl-space');
    const label = (name) => document.querySelector(`input[name="${name}"]:checked`)?.closest('label')?.textContent.trim() || '';
    const describe = () => phone.setAttribute('aria-label', `F Launcher のホーム画面の見本（テンプレート: ${label('flTemplate')}、テーマ: ${label('flStyle')}）`);
    document.querySelectorAll('input[name="flTemplate"]').forEach((input) => input.addEventListener('change', () => {
      if (!input.checked) return;
      switchTemplate(phoneSpace, input.value);
      describe();
    }));
    document.querySelectorAll('input[name="flStyle"]').forEach((input) => input.addEventListener('change', () => {
      if (!input.checked) return;
      phone.dataset.style = input.value;
      describe();
    }));
  }

  /* ---------- 配布ページ: 上のバー（見出しが隠れたら、色を付けて名前を出す） ---------- */
  const appBar = document.getElementById('flAppBar');
  const title = document.getElementById('flTitle');
  if (appBar && title && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => appBar.classList.toggle('is-scrolled', !entry.isIntersecting), {rootMargin: '-64px 0px 0px 0px'}).observe(title);
  }
})();
