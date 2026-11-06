// ZERO — すべてのページで使う共通の動き
// ダーク/ライトとテーマカラー、スナックバー、ロード画面、時計とカレンダー、浮かぶツールバー、背景の図形。
// トップページ以外では、ツールバー・背景・スナックバーをここで差し込みます。
(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- 下のページ用に、ツールバー・背景・スナックバーを用意する ---------- */
  const ICON_HOME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>';
  const ICON_PALETTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01a1.5 1.5 0 0 1 1.13-2.49H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
  const insertAfterSkipLink = (html) => {
    const skip = document.querySelector('.skip-link');
    if (skip) skip.insertAdjacentHTML('afterend', html);
    else document.body.insertAdjacentHTML('afterbegin', html);
  };
  if (!document.querySelector('.stage')) {
    insertAfterSkipLink(`<div class="stage stage-page" aria-hidden="true"><div class="stage-shapes" id="stageShapes">
<span class="stage-shape s-cookie" style="--depth:-0.7"></span><span class="stage-shape s-clover" style="--depth:1.1"></span>
<span class="stage-shape s-burst" style="--depth:0.6"></span><span class="stage-shape s-flower" style="--depth:-1.2"></span>
<span class="stage-shape s-gem" style="--depth:-0.5"></span><span class="stage-dots" style="--depth:0.3"></span>
</div><div class="stage-blur" id="stageBlur"></div></div>`);
  }
  if (!$('toolbar')) {
    insertAfterSkipLink(`<header class="toolbar" id="toolbar" aria-label="ツールバー">
<div class="toolbar-group"><a class="icon-btn" href="/" aria-label="トップページへ戻る" title="トップページ">${ICON_HOME}</a></div>
<div class="clock-wrap" id="clockWrap">
<button class="clock" id="clock" type="button" aria-describedby="clockHint">--:--</button>
<span class="visually-hidden" id="clockHint">押すと12時間表示と24時間表示を切り替えます。下矢印キーでカレンダーを開きます。</span>
<div class="calendar" id="calendar" role="group" aria-label="カレンダー">
<p class="calendar-title" id="calendarTitle"></p>
<div class="calendar-weekdays" aria-hidden="true"><span class="sun">日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span class="sat">土</span></div>
<div class="calendar-grid" id="calendarGrid"></div>
</div>
</div>
<div class="toolbar-group">
<button class="icon-btn" id="hueButton" type="button" aria-label="テーマカラーを切り替える" title="テーマカラー">${ICON_PALETTE}</button>
<button class="icon-btn" id="themeButton" type="button" aria-label="ダークモードにする" title="ダーク/ライト"><svg viewBox="0 0 24 24" aria-hidden="true" id="themeIcon"></svg></button>
</div>
</header>`);
  }
  if (!$('snackbar')) document.body.insertAdjacentHTML('beforeend', '<div class="snackbar" id="snackbar" role="status" aria-live="polite"></div>');

  /* ---------- スナックバー ---------- */
  const snackbar = $('snackbar');
  let snackbarTimer = 0;
  const notify = (text) => {
    snackbar.textContent = text;
    snackbar.classList.add('is-visible');
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => snackbar.classList.remove('is-visible'), 2200);
  };

  /* ---------- 見た目（ダーク/ライトとテーマカラー） ---------- */
  const HUES = [
    {name: 'Pink', hue: 5},
    {name: 'Blue', hue: 255},
    {name: 'Mint', hue: 165},
    {name: 'Violet', hue: 300},
    {name: 'Orange', hue: 55},
  ];
  // 試作版（/next/）のころから同じ保存場所を使い、選んだ設定を引き継ぎます。
  const STORAGE_KEY = 'zero-next-appearance';
  const readAppearance = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  };
  const saveAppearance = (patch) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({...readAppearance(), ...patch})); } catch {}
  };
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : prefersDark.matches;
  const SUN = '<path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12ZM11 1h2v3h-2V1Zm0 19h2v3h-2v-3ZM3.51 4.93l1.42-1.42 2.12 2.13-1.41 1.41-2.13-2.12Zm13.44 13.43 1.41-1.41 2.13 2.12-1.42 1.42-2.12-2.13Zm2.12-14.85 1.42 1.42-2.13 2.12-1.41-1.41 2.12-2.13ZM5.64 16.95l1.41 1.41-2.12 2.13-1.42-1.42 2.13-2.12ZM23 11v2h-3v-2h3ZM4 11v2H1v-2h3Z"/>';
  const MOON = '<path d="M11.38 2.02C9.92 3.39 9 5.34 9 7.5 9 11.64 12.36 15 16.5 15c2.16 0 4.11-.92 5.48-2.38C21.66 17.85 17.31 22 12 22 6.48 22 2 17.52 2 12c0-5.31 4.15-9.66 9.38-9.98Z"/>';
  const themeButton = $('themeButton');
  const syncThemeUi = () => {
    const dark = isDark();
    $('themeIcon').innerHTML = dark ? SUN : MOON;
    themeButton.setAttribute('aria-label', dark ? 'ライトモードにする' : 'ダークモードにする');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  };
  const announceAppearance = () => dispatchEvent(new CustomEvent('zero:appearancechange', {detail: getAppearance()}));
  const setMode = (mode, {silent = false} = {}) => {
    const next = mode === 'toggle' ? (isDark() ? 'light' : 'dark') : mode;
    if (next !== 'dark' && next !== 'light') return false;
    root.dataset.theme = next;
    saveAppearance({mode: next});
    requestAnimationFrame(() => { syncThemeUi(); announceAppearance(); });
    if (!silent) notify(next === 'dark' ? 'ダークモード' : 'ライトモード');
    return true;
  };
  const currentHue = () => HUES.find((item) => item.hue === (Number(getComputedStyle(root).getPropertyValue('--h')) || HUES[0].hue)) || HUES[0];
  const getAppearance = () => ({mode: isDark() ? 'dark' : 'light', ...currentHue()});
  const setHue = (value, {silent = false} = {}) => {
    const next = typeof value === 'number' ? HUES.find((item) => item.hue === value) : HUES.find((item) => item.name.toLowerCase() === String(value).toLowerCase());
    if (!next) return null;
    root.style.setProperty('--h', next.hue);
    saveAppearance({hue: next.hue});
    requestAnimationFrame(() => { syncThemeUi(); announceAppearance(); });
    if (!silent) notify(`テーマカラー: ${next.name}`);
    return next;
  };
  themeButton.addEventListener('click', () => setMode('toggle'));
  prefersDark.addEventListener('change', () => { syncThemeUi(); announceAppearance(); });
  $('hueButton').addEventListener('click', () => setHue(HUES[(HUES.indexOf(currentHue()) + 1) % HUES.length].hue));
  // 別のタブで設定を変えたときも合わせる
  addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const saved = readAppearance();
    if (saved.mode === 'light' || saved.mode === 'dark') root.dataset.theme = saved.mode;
    if (typeof saved.hue === 'number') root.style.setProperty('--h', saved.hue);
    requestAnimationFrame(() => { syncThemeUi(); announceAppearance(); });
  });
  syncThemeUi();

  /* ---------- ロード画面（フォントと data-preload の画像を待つ） ---------- */
  const loader = $('siteLoader');
  if (loader) {
    const bar = loader.querySelector('.loader-bar');
    const setProgress = (value, text) => {
      bar?.style.setProperty('--progress', `${value}%`);
      bar?.setAttribute('aria-valuenow', String(value));
      const percent = loader.querySelector('.loader-percent');
      if (percent) percent.textContent = `${value}%`;
      const status = loader.querySelector('.loader-status');
      if (text && status) status.textContent = text;
    };
    const decode = (image) => (image.complete ? Promise.resolve() : image.decode()).catch(() => {});
    const startedAt = performance.now();
    const steps = [
      [document.fonts ? document.fonts.ready : Promise.resolve(), 'フォントを読み込んでいます'],
      ...[...document.querySelectorAll('img[data-preload]')].map((image) => [decode(image), image.dataset.preload || '画像を読み込んでいます']),
    ];
    let done = 0;
    setProgress(0, steps[0][1]);
    const allLoaded = Promise.all(steps.map(([promise], index) => Promise.resolve(promise).catch(() => {}).then(() => {
      done += 1;
      setProgress(Math.round((done / steps.length) * 100), steps[Math.min(index + 1, steps.length - 1)][1]);
    })));
    Promise.race([allLoaded, wait(2500)]).then(async () => {
      await wait(Math.max(0, 450 - (performance.now() - startedAt)));
      setProgress(100, 'ページを表示します');
      loader.classList.add('is-complete');
      await wait(460);
      loader.remove();
    });
  }

  /* ---------- 時計とカレンダー ---------- */
  const clock = $('clock');
  const clockWrap = $('clockWrap');
  let is24Hour = true;
  let thursdayMode = false;
  let renderedMonth = -1;
  const renderCalendar = (now) => {
    renderedMonth = now.getMonth();
    const year = now.getFullYear();
    const month = now.getMonth();
    $('calendarTitle').textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
    const grid = $('calendarGrid');
    grid.replaceChildren();
    for (let i = 0; i < new Date(year, month, 1).getDay(); i += 1) grid.append(document.createElement('span'));
    const days = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const button = document.createElement('button');
      const weekday = new Date(year, month, day).getDay();
      const label = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
      button.type = 'button';
      button.className = 'calendar-day';
      if (weekday === 0) button.classList.add('sun');
      if (weekday === 6) button.classList.add('sat');
      if (day === now.getDate()) { button.classList.add('is-today'); button.setAttribute('aria-current', 'date'); }
      button.textContent = String(day);
      button.setAttribute('aria-label', `${year}年${month + 1}月${day}日をコピー`);
      button.addEventListener('click', () => {
        navigator.clipboard?.writeText(label).then(() => notify(`コピーしました: ${label}`)).catch(() => notify(label));
      });
      grid.append(button);
    }
  };
  const renderClock = () => {
    const now = new Date();
    if (thursdayMode) {
      clock.textContent = now.getDay() === 4 ? 'はい' : 'いいえ';
    } else {
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const hours = now.getHours();
      clock.textContent = is24Hour ? `${String(hours).padStart(2, '0')}:${minutes}` : `${hours >= 12 ? 'PM' : 'AM'} ${hours % 12 || 12}:${minutes}`;
    }
    if (renderedMonth !== now.getMonth()) renderCalendar(now);
  };
  let clockClicks = 0;
  let clockClickTimer = 0;
  clock.addEventListener('click', () => {
    clockClicks += 1;
    clearTimeout(clockClickTimer);
    clockClickTimer = setTimeout(() => { clockClicks = 0; }, 800);
    if (clockClicks >= 5 && Math.random() < 0.3) {
      thursdayMode = !thursdayMode;
      clockClicks = 0;
      notify(thursdayMode ? 'Is it Thursday...?' : '時刻表示に戻りました');
    } else if (!thursdayMode) {
      is24Hour = !is24Hour;
      notify(is24Hour ? '24時間表示' : '12時間表示');
    }
    renderClock();
  });
  const calendarDays = () => [...$('calendarGrid').querySelectorAll('.calendar-day')];
  const closeCalendar = (focusClock) => {
    clockWrap.classList.remove('is-open');
    if (focusClock) clock.focus();
  };
  clock.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    clockWrap.classList.add('is-open');
    (calendarDays().find((day) => day.classList.contains('is-today')) || calendarDays()[0])?.focus();
  });
  $('calendarGrid').addEventListener('keydown', (event) => {
    const days = calendarDays();
    const index = days.indexOf(document.activeElement);
    const moves = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7};
    if (event.key === 'Escape') { event.preventDefault(); closeCalendar(true); return; }
    if (!(event.key in moves) || index < 0) return;
    event.preventDefault();
    days[Math.min(days.length - 1, Math.max(0, index + moves[event.key]))].focus();
  });
  clockWrap.addEventListener('focusout', (event) => {
    if (!clockWrap.contains(event.relatedTarget)) closeCalendar(false);
  });
  const setClockMode = (mode) => {
    if (mode !== '12' && mode !== '24') return false;
    is24Hour = mode === '24';
    thursdayMode = false;
    renderClock();
    notify(`${mode}時間表示`);
    return true;
  };
  renderClock();
  setInterval(renderClock, 1000);

  /* ---------- 下へスクロールするとツールバーを隠し、上へ戻すと出す ---------- */
  const toolbar = $('toolbar');
  let lastScrollY = scrollY;
  addEventListener('scroll', () => {
    const goingDown = scrollY > lastScrollY;
    const compact = matchMedia('(max-width: 560px)').matches;
    if (!compact && goingDown && scrollY > innerHeight * 0.5 && !toolbar.matches(':focus-within') && !clockWrap.classList.contains('is-open')) {
      toolbar.classList.add('is-hidden');
    } else if (!goingDown || scrollY < innerHeight * 0.5) {
      toolbar.classList.remove('is-hidden');
    }
    lastScrollY = scrollY;
  }, {passive: true});
  toolbar.addEventListener('focusin', () => toolbar.classList.remove('is-hidden'));
  addEventListener('pointermove', (event) => {
    if (event.clientY < 72) toolbar.classList.remove('is-hidden');
  }, {passive: true});

  /* 背景の図形をマウスに合わせてずらす */
  const stageShapes = $('stageShapes');
  let parallaxFrame = 0;
  addEventListener('pointermove', (event) => {
    if (!stageShapes || !finePointer.matches || reducedMotion.matches || parallaxFrame) return;
    parallaxFrame = requestAnimationFrame(() => {
      stageShapes.style.setProperty('--px', (event.clientX / innerWidth - 0.5).toFixed(3));
      stageShapes.style.setProperty('--py', (event.clientY / innerHeight - 0.5).toFixed(3));
      parallaxFrame = 0;
    });
  }, {passive: true});

  /* ---------- スクロールで登場 ---------- */
  const revealItems = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reducedMotion.matches) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }), {rootMargin: '0px 0px -6% 0px', threshold: 0.08});
    revealItems.forEach((item) => observer.observe(item));
  }

  /* ---------- データの読み込みと表示の小道具 ---------- */
  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date).replaceAll('/', '.');
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
    } catch { return fallback; }
  };
  const loadJson = (url) => fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  });
  // note記事のカード（トップページとリンク集で共通）
  const noteCard = (article) => {
    const link = element('a', 'note-card');
    link.href = article.generated ? `/blog/${article.id}.html` : safeUrl(article.sourceUrl, 'https://note.com/zerrrrro_1288');
    if (!article.generated) { link.target = '_blank'; link.rel = 'noopener'; }
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
    copy.append(time, element('strong', '', article.title), element('small', '', article.generated ? 'サイト内で読む →' : 'noteで読む ↗'));
    link.append(copy);
    return link;
  };

  /* ---------- フォーカスの補助（アセット配布ページの catalog.js が使います） ---------- */
  window.zeroA11y ||= {
    focus(target) {
      if (!(target instanceof HTMLElement) || !target.isConnected) return false;
      target.focus({preventScroll: true});
      return document.activeElement === target;
    },
    get reducedMotion() { return reducedMotion.matches; },
  };

  /* ---------- ほかのスクリプトから使う窓口 ---------- */
  window.zeroSite = {
    notify,
    hues: HUES.map((item) => ({...item})),
    isDark,
    getAppearance,
    setMode,
    setHue,
    getClockMode: () => (is24Hour ? '24' : '12'),
    setClockMode,
    reducedMotion,
    finePointer,
    formatDate,
    element,
    safeUrl,
    loadJson,
    noteCard,
  };
})();
