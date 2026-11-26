// ZERO — 自作アプリ（/apps/）と F Launcher の配布ページの動き
//  - ホーム画面の見本: 壁紙・テーマ（アイコンも）・セカンドスペースのテンプレートが、
//    それぞれ別々の間隔で、自動でランダムに入れかわる
//      壁紙: 図形が形・色・向きを変えながら次の壁紙になる（CSS）
//      テーマ: 面とアイコンの色・透け方・形が変わり、アイコンが順に小さく弾む
//      テンプレート: F Launcher の編集画面のように、ガラスの枠とマスの点を出してから入れかえる
//  - 一覧: F Launcher のカードにカーソルを乗せる（キーボードで選ぶ）と、後ろにホーム画面が円で広がり、
//          ページの部品は同じ位置のまま、色・角丸・面が Material 3 のものへなめらかに変わる（CSS）。
//          書体だけはなめらかに変えられないので、文字だけその場で重ねて入れかえる（View Transitions）
//  - 一覧: カードを押した場所を覚えておき、配布ページではそこから広がる（配布ページの head）
//  - 配布ページ: 見本を押すと、自動の入れかえが止まる・動く。上のバーは、下へスクロールすると名前が出る
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const STYLES = ['material', 'blur', 'glass'];
  const WALLS = ['puffy', 'dusk', 'mint', 'mono', 'sunrise'];
  const pickOther = (list, current) => {
    const options = list.filter((item) => item !== current);
    return options[Math.floor(Math.random() * options.length)];
  };
  const between = (min, max) => min + Math.random() * (max - min);

  /* ---------- ホーム画面の見本を、自動でランダムに入れかえる ---------- */
  const showcase = (host, templates) => {
    const space = host.querySelector('.fl-space');
    host.querySelectorAll('.fl-icon').forEach((icon, index) => icon.style.setProperty('--i', String(index % 14)));
    const timers = {};
    const later = (name, ms, fn) => { clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); };
    const steps = {
      // テンプレート: 編集画面のようにガラスの枠を出し、中身を入れかえ（フェードスルーは CSS）、枠を消す
      template: [2600, 4800, () => {
        space.classList.add('is-editing');
        later('swap', 220, () => { space.dataset.template = pickOther(templates, space.dataset.template); });
        later('edited', 1000, () => space.classList.remove('is-editing'));
      }],
      // テーマ: 面とアイコンが変わり、アイコンが順に弾む
      style: [3800, 7000, () => {
        host.dataset.style = pickOther(STYLES, host.dataset.style);
        host.classList.remove('is-restyling');
        void host.offsetWidth;
        host.classList.add('is-restyling');
        later('restyled', 900, () => host.classList.remove('is-restyling'));
      }],
      // 壁紙: 図形が形を変えながら次の壁紙になる
      wall: [5200, 9000, () => { host.dataset.wall = pickOther(WALLS, host.dataset.wall); }],
    };
    let running = false;
    const loop = (name) => {
      const [min, max, step] = steps[name];
      later(name, between(min, max), () => { step(); loop(name); });
    };
    return {
      start() { if (running) return; running = true; Object.keys(steps).forEach(loop); },
      stop() { running = false; Object.values(timers).forEach(clearTimeout); space.classList.remove('is-editing'); host.classList.remove('is-restyling'); },
      reset() { space.dataset.template = 'custom'; host.dataset.style = 'material'; host.dataset.wall = 'puffy'; },
    };
  };

  /* ---------- 一覧: F Launcher の世界に入る・出る ---------- */
  const card = document.getElementById('fLauncherCard');
  const world = document.getElementById('flWorld');
  if (card && world) {
    const home = showcase(world, ['custom', 'clock', 'stripe', 'deck']);
    // 書体が変わる文字（その場で重ねて入れかえる）
    const TEXTS = '.toolbar .clock, .apps-hero .eyebrow, .page-title, .page-lead, .page-actions .btn, .card-title, .card-sub, .app-name, .app-desc, .app-go, .app-icon-soon, .app-card-soon strong, .app-card-soon .app-copy > span, .page-footer > *';
    let desired = false;
    let running = null;
    let origin = null;
    let pointer = null;
    let intentTimer = 0;
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
    const apply = (on) => {
      if (on) { home.reset(); root.dataset.world = 'f'; home.start(); }
      else { root.removeAttribute('data-world'); home.stop(); }
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

  /* ---------- 配布ページ: ホーム画面の見本（押すと止まる・動く） ---------- */
  const phone = document.getElementById('flPhone');
  if (phone) {
    const home = showcase(phone, ['custom', 'blank', 'clock', 'stripe', 'deck']);
    let paused = reducedMotion.matches; // 「動きを減らす」設定のときは、止めた状態から
    let visible = true;
    const update = () => {
      if (paused || !visible || document.hidden) home.stop(); else home.start();
      phone.setAttribute('aria-label', `F Launcher のホーム画面の見本。壁紙・テーマ・テンプレートが自動で入れかわります。${paused ? '止めています。押すと動きます。' : '押すと止まります。'}`);
      phone.title = paused ? '押すと動きます' : '押すと止まります';
    };
    phone.addEventListener('click', () => { paused = !paused; update(); });
    document.addEventListener('visibilitychange', update);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(phone);
    }
    update();
  }

  /* ---------- 配布ページ: 上のバー（見出しが隠れたら、色を付けて名前を出す） ---------- */
  const appBar = document.getElementById('flAppBar');
  const title = document.getElementById('flTitle');
  if (appBar && title && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => appBar.classList.toggle('is-scrolled', !entry.isIntersecting), {rootMargin: '-64px 0px 0px 0px'}).observe(title);
  }
})();
