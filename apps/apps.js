// ZERO — 自作アプリ（/apps/）と、F Launcher（/f-launcher/）・DroidHub（/droidhub/）のページの動き
//  - ホーム画面の見本: 壁紙・テーマ（アイコンも）・セカンドスペースのテンプレート・アイコンの並びが、
//    それぞれ別々の間隔で、自動でランダムに入れかわる
//      壁紙: 図形が形・色・向きを変えながら次の壁紙になる（CSS）
//      テーマ: 面とアイコンの色・透け方・形が変わり、アイコンが順に小さく弾む
//      テンプレート: F Launcher の編集画面のように、ガラスの枠とマスの点を出してから入れかえる
//      アイコンの並び: 下半分（アイコンとウィジェット）とドックが、それぞれの場所の中だけで並びかわる（FLIP）
//  - 一覧: アプリの行を押す（タップする）と選んだ状態になり、行が下へのびて、くわしい情報が出る。
//          F Launcher を選ぶと、後ろに F Launcher の世界（落ち着いた黒い背景に、アイコンやウィジェットの形が浮かぶ）が
//          押した場所から円で広がり、ページの部品は同じ位置のまま、色・角丸・面が F Launcher のものへなめらかに変わる（CSS）。
//          浮かぶアイコンは、ときどき M3E の別の形へ変わり、輪の量も変わる
//          書体だけはなめらかに変えられないので、文字だけその場で重ねて入れかえる（View Transitions）
//  - 一覧: F Launcher のページへ移るときは、アイコンと名前がつながって動く（F Launcher のページの head）
//  - DroidHub の画面の見本: ダウンロードが進み（波の形のプログレスバー）、端末が起動すると右に画面が出て、
//    ナビゲーションがドロワーとレールで開け閉めされる
//  - 一覧: DroidHub を選ぶと、DroidHub の世界（深い緑の黒に、端末のアイコンや進み具合の形が浮かぶ）に入る。開くのは1つだけ
//  - 見本を押すと、自動の入れかえが止まる・動く。アプリのページの上のバーは、下へスクロールすると色が付く
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const STYLES = ['material', 'blur', 'glass'];
  const WALLS = ['puffy', 'dusk', 'mint', 'mono', 'sunrise'];
  const TEMPLATES = ['deck', 'blank', 'clock', 'stripe', 'bedside', 'three', 'radial', 'dot'];
  const random = (count) => Math.floor(Math.random() * count);
  const pickOther = (list, current) => {
    const options = list.filter((item) => item !== current);
    return options[random(options.length)];
  };
  const between = (min, max) => min + Math.random() * (max - min);
  const shuffled = (list) => {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = random(index + 1);
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  };

  /* ---------- アイコンの並びを入れかえる（それぞれの場所の中だけで動く） ---------- */
  // 下半分: 横4・縦3のマスに、2x2・2x1・1x1 を、すき間なくランダムに置く
  const sizeOf = (element) => (element.classList.contains('is-big') ? [2, 2] : element.classList.contains('is-wide') ? [2, 1] : [1, 1]);
  const randomLayout = (items) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const free = Array.from({length: 3}, () => Array(4).fill(true));
      const fits = (row, col, width, height) => {
        for (let y = row; y < row + height; y += 1) for (let x = col; x < col + width; x += 1) if (y > 2 || x > 3 || !free[y][x]) return false;
        return true;
      };
      // 大きいものから置く（同じ大きさの中では、順番もランダム）
      const order = shuffled(items).sort((a, b) => sizeOf(b)[0] * sizeOf(b)[1] - sizeOf(a)[0] * sizeOf(a)[1]);
      const areas = new Map();
      const placed = order.every((element) => {
        const [width, height] = sizeOf(element);
        const spots = [];
        for (let row = 0; row < 3; row += 1) for (let col = 0; col < 4; col += 1) if (fits(row, col, width, height)) spots.push([row, col]);
        if (!spots.length) return false;
        const [row, col] = spots[random(spots.length)];
        for (let y = row; y < row + height; y += 1) for (let x = col; x < col + width; x += 1) free[y][x] = false;
        areas.set(element, `${row + 1} / ${col + 1} / span ${height} / span ${width}`);
        return true;
      });
      if (placed) return areas;
    }
    return null;
  };
  // FLIP: 動かす前の場所を覚え、並びを変えてから、前の場所から新しい場所へ動かす
  const flip = (elements, change) => {
    const before = new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
    elements.forEach((element) => element.flAnimation?.cancel());
    change();
    if (reducedMotion.matches) return;
    elements.forEach((element) => {
      const from = before.get(element);
      const to = element.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      element.flAnimation = element.animate([{translate: `${dx}px ${dy}px`}, {translate: '0 0'}],
        {duration: 380, easing: 'cubic-bezier(.2,0,0,1)'});
    });
  };

  /* ---------- ホーム画面の見本を、自動でランダムに入れかえる ---------- */
  const showcase = (host) => {
    const space = host.querySelector('.fl-space');
    const lower = host.querySelector('.fl-lower-grid');
    const dock = host.querySelector('.fl-dock');
    const lowerItems = lower ? [...lower.children] : [];
    const dockItems = dock ? [...dock.children] : [];
    host.querySelectorAll('.fl-icon').forEach((icon, index) => icon.style.setProperty('--i', String(index % 14)));
    const timers = {};
    const later = (name, ms, fn) => { clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); };
    const steps = {
      // テンプレート: 編集画面のようにガラスの枠を出し、中身を入れかえ（フェードスルーは CSS）、枠を消す
      template: [2200, 4000, () => {
        space.classList.add('is-editing');
        later('swap', 140, () => { space.dataset.template = pickOther(TEMPLATES, space.dataset.template); });
        later('edited', 620, () => space.classList.remove('is-editing'));
      }],
      // テーマ: 面とアイコンが変わり、アイコンが順に弾む
      style: [3000, 5400, () => {
        host.dataset.style = pickOther(STYLES, host.dataset.style);
        host.classList.remove('is-restyling');
        void host.offsetWidth;
        host.classList.add('is-restyling');
        later('restyled', 600, () => host.classList.remove('is-restyling'));
      }],
      // 壁紙: 図形が形を変えながら次の壁紙になる
      wall: [3800, 6600, () => { host.dataset.wall = pickOther(WALLS, host.dataset.wall); }],
    };
    // 下半分: アイコンとウィジェットの並びを、下半分の中だけで入れかえる
    if (lowerItems.length) {
      steps.arrange = [2600, 4600, () => {
        const current = lowerItems.map((element) => element.style.gridArea).join();
        let areas = randomLayout(lowerItems);
        for (let retry = 0; areas && retry < 6 && lowerItems.map((element) => areas.get(element)).join() === current; retry += 1) areas = randomLayout(lowerItems);
        if (areas) flip(lowerItems, () => lowerItems.forEach((element) => { element.style.gridArea = areas.get(element); }));
      }];
    }
    // ドック: ドックの中だけで、アイコンの順番を入れかえる
    if (dockItems.length > 1) {
      steps.dock = [4200, 7600, () => {
        const current = dockItems.map((element, index) => element.style.gridColumn || String(index + 1)).join();
        let order;
        do { order = shuffled(dockItems.map((_, index) => String(index + 1))); } while (order.join() === current);
        flip(dockItems, () => dockItems.forEach((element, index) => { element.style.gridColumn = order[index]; }));
      }];
    }
    let running = false;
    const loop = (name) => {
      const [min, max, step] = steps[name];
      later(name, between(min, max), () => { step(); loop(name); });
    };
    return {
      start() { if (running) return; running = true; Object.keys(steps).forEach(loop); },
      stop() { running = false; Object.values(timers).forEach(clearTimeout); space.classList.remove('is-editing'); host.classList.remove('is-restyling'); },
      reset() {
        space.dataset.template = 'deck';
        host.dataset.style = 'material';
        host.dataset.wall = 'puffy';
        [...lowerItems, ...dockItems].forEach((element) => { element.flAnimation?.cancel(); element.style.gridArea = ''; element.style.gridColumn = ''; });
      },
    };
  };

  /* ---------- 一覧の後ろの F Launcher の世界: 浮かぶアイコンの形が、ときどき M3E の別の形へ変わる ---------- */
  const SHAPES = ['circle', 'square', 'clover4', 'clover8', 'cookie4', 'cookie6', 'cookie9', 'cookie12', 'flower', 'gem', 'pentagon'];
  const floaters = (host) => {
    const icons = [...host.querySelectorAll('.fl-float-icon')];
    const rings = [...host.querySelectorAll('.fl-float-ring')];
    const initial = new Map([...icons, ...rings].map((element) => [element, element.getAttribute('style')]));
    let timer = 0;
    let running = false;
    const step = () => {
      const icon = icons[random(icons.length)];
      if (icon) {
        const current = icon.style.getPropertyValue('--shape').replace(/^var\(--shape-|\)$/g, '');
        icon.style.setProperty('--shape', `var(--shape-${pickOther(SHAPES, current)})`);
      }
      const ring = rings[random(rings.length)];
      if (ring && Math.random() < 0.5) ring.style.setProperty('--p', String(Math.round(between(18, 96))));
      timer = setTimeout(step, between(1400, 2800));
    };
    return {
      start() { if (running) return; running = true; host.classList.remove('is-paused'); timer = setTimeout(step, between(900, 1600)); },
      stop() { running = false; clearTimeout(timer); host.classList.add('is-paused'); },
      reset() { initial.forEach((style, element) => element.setAttribute('style', style)); },
    };
  };

  /* ---------- DroidHub の画面の見本: ダウンロードが進み、端末が起動すると画面が出て、ナビゲーションが開け閉めされる ---------- */
  const dhShowcase = (host) => {
    const devices = [...host.querySelectorAll('.dh-card.is-device')];
    const timers = {};
    const later = (name, ms, fn) => { clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); };
    let progress = Number(host.style.getPropertyValue('--dl')) || 0;
    const setProgress = (value) => { progress = value; host.style.setProperty('--dl', String(Math.round(value))); };
    const steps = {
      // ダウンロード → 検証 → インストール。終わったら、次のイメージのダウンロードを始める
      download: [650, 1100, () => {
        const stage = Number(host.dataset.stage);
        if (stage === 0) {
          setProgress(Math.min(100, progress + between(9, 24)));
          if (progress >= 100) later('verify', 700, () => { host.dataset.stage = '1'; });
        } else if (stage === 1) host.dataset.stage = '2';
        else { host.dataset.stage = '0'; setProgress(between(2, 8)); }
      }],
      // 端末の起動と停止: 起動すると右に画面のパネルが開き、少しして端末の画面が映る
      run: [2600, 4600, () => {
        const running = devices.find((device) => device.dataset.run === '1');
        devices.forEach((device) => { device.dataset.run = '0'; });
        if (running && Math.random() < 0.6) {
          host.dataset.mirror = '0';
          later('close', 260, () => { host.dataset.screen = '0'; });
          return;
        }
        devices[random(Math.min(devices.length, 2))].dataset.run = '1';
        host.dataset.screen = '1';
        later('mirror', 900, () => { host.dataset.mirror = '1'; });
      }],
      // ナビゲーション: ドロワー ⇄ レール
      rail: [5200, 8400, () => { host.dataset.rail = host.dataset.rail === '1' ? '0' : '1'; }],
    };
    let running = false;
    const loop = (name) => {
      const [min, max, step] = steps[name];
      later(name, between(min, max), () => { step(); loop(name); });
    };
    return {
      start() { if (running) return; running = true; host.classList.remove('is-paused'); Object.keys(steps).forEach(loop); },
      stop() { running = false; Object.values(timers).forEach(clearTimeout); host.classList.add('is-paused'); },
      reset() {
        Object.assign(host.dataset, {stage: '0', rail: '0', screen: '0', mirror: '0'});
        devices.forEach((device) => { device.dataset.run = '0'; });
        setProgress(24);
      },
    };
  };

  // 見本を押すと、自動の入れかえが止まる・動く（「動きを減らす」設定のときは、止めた状態から）
  const LABELS = {
    phone: 'F Launcher のホーム画面の見本。壁紙・テーマ・テンプレート・アイコンの並びが自動で入れかわります。',
    window: 'DroidHub の画面の見本。ダウンロードの進み具合・端末の起動と画面の表示・ナビゲーションの開け閉めが自動で動きます。',
  };
  const player = (button, homes, isActive = () => true) => {
    let paused = reducedMotion.matches;
    let visible = true;
    const label = button?.classList.contains('dh-window') ? LABELS.window : LABELS.phone;
    const update = () => {
      const play = isActive() && !paused && visible && !document.hidden;
      homes.forEach((home) => (play ? home.start() : home.stop()));
      if (!button) return;
      button.setAttribute('aria-label', `${label}${paused ? '止めています。押すと動きます。' : '押すと止まります。'}`);
      button.title = paused ? '押すと動きます' : '押すと止まります';
    };
    button?.addEventListener('click', () => { paused = !paused; update(); });
    document.addEventListener('visibilitychange', update);
    return {update, watch(target) {
      if (!('IntersectionObserver' in window)) return;
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(target);
    }};
  };

  /* ---------- 一覧: アプリの行を押して選ぶ（選ぶと、そのアプリの世界に入る。開くのは1つだけ） ---------- */
  const APPS = [
    {id: 'f', key: 'fl', item: 'fLauncherItem', card: 'fLauncherCard', world: 'flWorld', preview: 'appPreview', make: showcase},
    {id: 'dh', key: 'dh', item: 'droidHubItem', card: 'droidHubCard', world: 'dhWorld', preview: 'dhPreview', make: dhShowcase},
  ].map((app) => ({...app, item: document.getElementById(app.item), card: document.getElementById(app.card), world: document.getElementById(app.world), preview: document.getElementById(app.preview)}))
    .filter((app) => app.item && app.card && app.world);
  if (APPS.length) {
    const current = () => root.dataset.world || null;
    APPS.forEach((app) => {
      app.homes = [floaters(app.world)];
      if (app.preview) app.homes.push(app.make(app.preview));
      app.playback = player(app.preview, app.homes, () => current() === app.id);
    });
    const byId = (id) => APPS.find((app) => app.id === id);
    const items = [...document.querySelectorAll('#appList > .app-item')];
    // 書体が変わる文字（その場で重ねて入れかえる）。行がのびると下の部品は動くので、選んだ行より上の文字だけ
    const TEXTS = '.toolbar .clock, .apps-hero .eyebrow, .page-title, .page-lead, .page-actions .btn, .card-title, .card-sub';
    let desired = null;
    let running = null;
    let origin = null;
    // アプリの書体を先に読み込んでおく（初めて選んだときに、文字が2回変わらないように）
    addEventListener('load', () => {
      const sample = document.querySelector('main')?.textContent.replace(/\s+/g, '') || '';
      ['400', '500'].forEach((weight) => {
        document.fonts?.load(`${weight} 16px "Google Sans Flex"`, sample).catch(() => {});
        document.fonts?.load(`${weight} 16px "Noto Sans JP"`, sample).catch(() => {});
      });
    }, {once: true});
    const center = (app) => {
      const rect = app.card.getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    const placeOrigin = (world, [x, y]) => {
      world.style.setProperty('--x', `${Math.round(x)}px`);
      world.style.setProperty('--y', `${Math.round(y)}px`);
      world.style.setProperty('--r', `${Math.round(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 24)}px`);
    };
    const apply = (id) => {
      const before = current();
      APPS.forEach((app) => {
        const on = app.id === id;
        app.item.classList.toggle('is-open', on);
        app.card.setAttribute('aria-expanded', String(on));
        app.world.classList.toggle('is-on', on);
        if (on && before !== id) app.homes.forEach((home) => home.reset());
      });
      if (id) root.dataset.world = id; else root.removeAttribute('data-world');
      APPS.forEach((app) => app.playback.update());
    };
    // 今の状態を、なってほしい状態に合わせる（切り替えの途中なら、終わってから合わせる）
    const sync = () => {
      const before = current();
      if (running || desired === before) return;
      const next = desired;
      [before, next].filter(Boolean).forEach((id) => { const app = byId(id); placeOrigin(app.world, origin || center(byId(next || before))); });
      // アプリからアプリへ移るときは、書体が同じなので CSS だけで変える
      if (before && next) { apply(next); return; }
      if (!document.startViewTransition || reducedMotion.matches || document.hidden) { apply(next); return; }
      // 文字にだけ名前を付けて、ほかは CSS でなめらかに変える（選んだ行とそれより上の行の名前も、その場にとどまるので重ねて入れかえる）
      const index = items.indexOf(byId(next || before).item);
      const rows = items.slice(0, index + 1).map((item) => item.querySelector('.app-row .app-name')).filter(Boolean);
      const texts = [...document.querySelectorAll(TEXTS), ...rows].filter((element) => element.getClientRects().length);
      texts.forEach((element, number) => { element.style.viewTransitionName = `fl-text-${number}`; });
      root.classList.add('fl-morph');
      const transition = document.startViewTransition(() => apply(next));
      running = transition;
      // ページを移るときなどに途中で止めた場合は、知らせなくてよい
      transition.ready.catch(() => {});
      transition.finished.catch(() => {}).finally(() => {
        texts.forEach((element) => { element.style.viewTransitionName = ''; });
        root.classList.remove('fl-morph');
        running = null;
        sync();
      });
    };
    APPS.forEach((app) => {
      // 押した（タップした）場所から広がる。キーボードで押したときは、行の真ん中から
      app.card.addEventListener('click', (event) => {
        origin = event.detail ? [event.clientX, event.clientY] : null;
        desired = desired === app.id ? null : app.id;
        sync();
      });
      // 開いているときは、Esc で閉じる
      app.item.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || desired !== app.id) return;
        origin = null;
        desired = null;
        app.card.focus();
        sync();
      });
      // アプリのページへ: 押した場所を覚えておき、アイコンと名前をつなぐ
      app.item.querySelector('.app-link')?.addEventListener('click', (event) => {
        const [cx, cy] = center(app);
        const x = event.detail ? event.clientX : cx;
        const y = event.detail ? event.clientY : cy;
        try { sessionStorage.setItem(`${app.key}-enter`, JSON.stringify({x: Math.round(x), y: Math.round(y), t: Date.now(), world: current() === app.id})); } catch {}
        running?.skipTransition();
        app.homes.forEach((home) => home.stop());
        root.classList.add(`${app.key}-linking`);
      });
    });
    // 戻るボタンで戻ってきたときは、閉じた状態から
    addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      desired = null;
      apply(null);
      root.classList.remove('fl-morph', 'fl-linking', 'dh-linking');
    });
    APPS.forEach((app) => app.playback.update());
  }

  /* ---------- アプリのページ: 見本（押すと止まる・動く。画面に見えていないときも止まる） ---------- */
  [['flPhone', showcase], ['dhDemo', dhShowcase]].forEach(([id, make]) => {
    const host = document.getElementById(id);
    if (!host) return;
    const playback = player(host, [make(host)]);
    playback.watch(host);
    playback.update();
  });

  /* ---------- アプリのページ: 上のバー（下へスクロールしたら、面の色を付ける） ---------- */
  const appBar = document.getElementById('flAppBar');
  const title = document.getElementById('flTitle');
  if (appBar && title && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => appBar.classList.toggle('is-scrolled', !entry.isIntersecting), {rootMargin: '-64px 0px 0px 0px'}).observe(title);
  }
})();
