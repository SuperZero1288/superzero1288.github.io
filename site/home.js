// ZERO — トップページだけの動き（ヒーロー、左右のシート、端末情報、プロフィール、更新情報）
// ツールバー・時計・テーマなどの共通部分は common.js にあります。
(() => {
  'use strict';
  const site = window.zeroSite;
  if (!site) return;
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const {reducedMotion, finePointer} = site;

  /* ---------- スクロール連動（背景のぼかし、タブ、案内） ---------- */
  const toolbar = $('toolbar');
  const stageBlur = $('stageBlur');
  const leftTab = $('leftTab');
  const rightTab = $('rightTab');
  const indicator = $('scrollIndicator');
  const atHero = () => scrollY < 120;
  const onScroll = () => {
    const ratio = Math.min(scrollY / innerHeight, 1);
    stageBlur.style.setProperty('--blur', `${(ratio * 18).toFixed(1)}px`);
    stageBlur.style.setProperty('--veil', `${Math.round(ratio * 35)}%`);
    const away = !atHero();
    [leftTab, rightTab].forEach((tab) => tab.classList.toggle('is-away', away));
    indicator.classList.toggle('is-hidden', away);
  };
  addEventListener('scroll', onScroll, {passive: true});
  onScroll();

  /* ---------- ひまなの？（ヒーローで何度もスクロールしようとしたとき） ---------- */
  let attempts = 0;
  let attemptsStartedAt = 0;
  const recordAttempt = () => {
    if (!atHero() || indicator.classList.contains('is-bored')) return;
    const now = performance.now();
    if (now - attemptsStartedAt > 8000) { attemptsStartedAt = now; attempts = 0; }
    attempts += 1;
    if (attempts >= 10) indicator.classList.add('is-bored');
  };
  let lastWheel = 0;
  addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) < 8 || performance.now() - lastWheel < 220) return;
    lastWheel = performance.now();
    recordAttempt();
  }, {passive: true});

  /* ---------- 隠し要素: 「でんせつ」を押すたびに言葉が変わる ---------- */
  // 文字化け（UTF-8をShift_JISで読んだもの）と16進数（UTF-8のバイト列）は出にくくしています。
  const LEGENDS = [
    {text: 'でんせつ', weight: 6},
    {text: '伝説', weight: 6},
    {text: 'Legend', weight: 6, lang: 'en'},
    {text: '传说', weight: 6, lang: 'zh-CN'},
    {text: '전설', weight: 6, lang: 'ko'},
    {text: '縺ｧ繧薙○縺､', weight: 1, kind: 'mojibake'},
    {text: 'e4bc9de8aaac', weight: 1, kind: 'hex', lang: 'en'},
  ];
  const legend = $('heroLegend');
  const legendText = legend?.querySelector('.hero-legend-text');
  const pickLegend = (current) => {
    const pool = LEGENDS.filter((item) => item.text !== current);
    let ticket = Math.random() * pool.reduce((sum, item) => sum + item.weight, 0);
    for (const item of pool) {
      ticket -= item.weight;
      if (ticket < 0) return item;
    }
    return pool[pool.length - 1];
  };
  // 長い言葉でも1行に収まるよう、はみ出す分だけ文字を小さくします（枠の高さは変えません）。
  const fitLegend = () => {
    if (!legend) return;
    legend.style.setProperty('--fit', '1');
    const available = legend.parentElement.clientWidth;
    const natural = legend.offsetWidth;
    const style = getComputedStyle(legend);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    if (natural <= available || natural <= padding) return;
    legend.style.setProperty('--fit', String(Math.max(0.2, ((available - padding) / (natural - padding)) * 0.98).toFixed(3)));
  };
  const showLegend = (item) => {
    legendText.textContent = item.text;
    if (item.lang) legendText.lang = item.lang; else legendText.removeAttribute('lang');
    legend.dataset.kind = item.kind || 'word';
    fitLegend();
    legend.classList.remove('is-changing');
    if (!reducedMotion.matches) {
      void legend.offsetWidth;
      legend.classList.add('is-changing');
    }
  };
  if (legend && legendText) {
    legend.addEventListener('click', () => showLegend(pickLegend(legendText.textContent)));
    legend.addEventListener('animationend', () => legend.classList.remove('is-changing'));
    let fitFrame = 0;
    addEventListener('resize', () => {
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(fitLegend);
    }, {passive: true});
    document.fonts?.ready.then(fitLegend);
  }

  /* ---------- ヒーローの写真（形が変わりながら切り替わる） ---------- */
  const PHOTO_COUNT = 13;
  const SHAPES = ['cookie12', 'clover8', 'flower', 'cookie9', 'burst', 'gem', 'clover4', 'pentagon', 'cookie6', 'square'];
  const frame = $('photoFrame');
  const counter = $('photoCounter');
  const layers = [...frame.querySelectorAll('.photo-layer')];
  let photoIndex = 0;
  let shapeIndex = 0;
  let switching = false;
  let slideTimer = 0;
  const photoUrl = (index) => `/assets/hero/${String(index + 1).padStart(2, '0')}-tall.webp`;
  const showPhoto = async (index) => {
    if (switching) return;
    switching = true;
    const current = layers.find((layer) => layer.classList.contains('is-current'));
    const next = layers.find((layer) => layer !== current);
    next.src = photoUrl(index);
    await next.decode().catch(() => {});
    shapeIndex = (shapeIndex + 1) % SHAPES.length;
    frame.style.clipPath = `var(--shape-${SHAPES[shapeIndex]})`;
    frame.style.rotate = `${(shapeIndex % 2 ? 1 : -1) * (8 + (shapeIndex * 7) % 18)}deg`;
    next.classList.add('is-current');
    current.classList.remove('is-current');
    photoIndex = index;
    counter.textContent = `PHOTO ${String(index + 1).padStart(2, '0')} / ${PHOTO_COUNT}`;
    switching = false;
  };
  const scheduleSlide = () => {
    clearTimeout(slideTimer);
    if (reducedMotion.matches) return;
    slideTimer = setTimeout(async () => {
      if (!document.hidden) await showPhoto((photoIndex + 1) % PHOTO_COUNT);
      scheduleSlide();
    }, 5500);
  };
  frame.addEventListener('click', async () => {
    await showPhoto((photoIndex + 1) % PHOTO_COUNT);
    scheduleSlide();
  });
  reducedMotion.addEventListener('change', scheduleSlide);
  scheduleSlide();

  /* ---------- 左右のシート ---------- */
  const sheets = {left: $('leftSheet'), right: $('rightSheet')};
  const tabs = {left: leftTab, right: rightTab};
  const scrim = $('scrim');
  const background = () => [$('main'), toolbar, leftTab, rightTab, $('desktopLayer')].filter(Boolean);
  let openSide = null;
  const setSheet = (side, {returnFocus = true} = {}) => {
    const previous = openSide;
    openSide = side;
    Object.entries(sheets).forEach(([key, sheet]) => {
      const open = key === side;
      sheet.classList.toggle('is-open', open);
      sheet.inert = !open;
      sheet.setAttribute('aria-hidden', String(!open));
      tabs[key].setAttribute('aria-expanded', String(open));
    });
    background().forEach((element) => { element.inert = Boolean(side); });
    root.style.overflow = side ? 'hidden' : '';
    if (side) {
      scrim.hidden = false;
      requestAnimationFrame(() => scrim.classList.add('is-visible'));
      sheets[side].querySelector('[data-close-sheet]').focus();
    } else {
      scrim.classList.remove('is-visible');
      setTimeout(() => { if (!openSide) scrim.hidden = true; }, 300);
      if (previous && returnFocus) tabs[previous].focus();
    }
  };
  leftTab.addEventListener('click', () => setSheet(openSide === 'left' ? null : 'left'));
  rightTab.addEventListener('click', () => setSheet(openSide === 'right' ? null : 'right'));
  scrim.addEventListener('click', () => setSheet(null));
  document.querySelectorAll('[data-close-sheet]').forEach((button) => button.addEventListener('click', () => setSheet(null)));
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openSide) { event.preventDefault(); setSheet(null); }
  });
  let touchX = 0;
  let touchY = 0;
  addEventListener('touchstart', (event) => {
    touchX = event.changedTouches[0].clientX;
    touchY = event.changedTouches[0].clientY;
  }, {passive: true});
  addEventListener('touchend', (event) => {
    const dx = event.changedTouches[0].clientX - touchX;
    const dy = event.changedTouches[0].clientY - touchY;
    if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx)) recordAttempt();
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    if (openSide === 'left' && dx < 0) setSheet(null);
    else if (openSide === 'right' && dx > 0) setSheet(null);
    else if (!openSide && atHero() && !$('profileDialog').open) setSheet(dx > 0 ? 'left' : 'right');
  }, {passive: true});

  /* 端末情報 */
  const browserName = () => {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'Microsoft Edge';
    if (/Firefox\//.test(ua)) return 'Mozilla Firefox';
    if (/Chrome\//.test(ua)) return 'Google Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return '不明なブラウザ';
  };
  const osName = () => {
    const ua = navigator.userAgent;
    if (/Windows NT/.test(ua)) return 'Windows';
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS / iPadOS';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    return '不明';
  };
  const HACK_KEY = 'zero-site-device-hack';
  const HACK_OS = {windows: 'Windows', macos: 'macOS', linux: 'Linux'};
  const readHack = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(HACK_KEY) || '{}');
      return Object.hasOwn(HACK_OS, saved.os) ? saved.os : 'auto';
    } catch { return 'auto'; }
  };
  const getDeviceState = () => {
    const hack = readHack();
    const effectiveOs = hack === 'auto' ? osName() : HACK_OS[hack];
    return {actualOs: osName(), effectiveOs, osHack: hack, hacked: hack !== 'auto', windowSystem: effectiveOs === 'macOS' ? 'macos' : 'windows', browser: browserName()};
  };
  const renderDevice = () => {
    const connection = navigator.connection;
    const device = getDeviceState();
    const rows = [
      ['OS', device.effectiveOs, device.hacked],
      ['ブラウザ', browserName()],
      ['画面', `${screen.width} × ${screen.height}`],
      ['表示領域', `${innerWidth} × ${innerHeight}`],
      ['言語', navigator.language || '不明'],
      ['タッチ', navigator.maxTouchPoints > 0 ? `${navigator.maxTouchPoints}点対応` : '非対応'],
      ['通信', connection?.effectiveType ? connection.effectiveType.toUpperCase() : (navigator.onLine ? 'オンライン' : 'オフライン')],
      ['時刻帯', Intl.DateTimeFormat().resolvedOptions().timeZone || '不明'],
      ['テーマ', site.isDark() ? 'ダーク' : 'ライト'],
    ];
    $('deviceList').replaceChildren(...rows.map(([label, value, hacked]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      if (hacked) {
        const badge = document.createElement('span');
        badge.className = 'hacked-badge';
        badge.textContent = 'ハック済み';
        description.append(badge);
      }
      row.append(term, description);
      return row;
    }));
  };
  const setDeviceOsHack = (os) => {
    const value = String(os || '').toLowerCase();
    if (value !== 'auto' && !Object.hasOwn(HACK_OS, value)) return false;
    try {
      if (value === 'auto') localStorage.removeItem(HACK_KEY);
      else localStorage.setItem(HACK_KEY, JSON.stringify({os: value}));
    } catch {}
    root.dataset.windowSystem = getDeviceState().windowSystem;
    renderDevice();
    dispatchEvent(new CustomEvent('zero:devicehackchange', {detail: getDeviceState()}));
    return true;
  };
  root.dataset.windowSystem = getDeviceState().windowSystem;
  renderDevice();
  addEventListener('zero:appearancechange', renderDevice);
  addEventListener('resize', renderDevice, {passive: true});
  addEventListener('online', renderDevice);
  addEventListener('offline', renderDevice);

  /* ---------- プロフィールのダイアログ ---------- */
  const dialog = $('profileDialog');
  const openProfile = () => { if (!dialog.open) dialog.showModal(); };
  $('profileButton').addEventListener('click', openProfile);
  $('dialogClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  /* ---------- 更新情報のタブ ---------- */
  const tabButtons = [...document.querySelectorAll('.segmented [role="tab"]')];
  const selectTab = (button, focus) => {
    tabButtons.forEach((tab) => {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) button.focus();
  };
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectTab(button, false));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      selectTab(tabButtons[(index + step + tabButtons.length) % tabButtons.length], true);
    });
  });

  /* ---------- カードの傾き（いつものサイトと同じ3Dホバー） ---------- */
  document.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('pointermove', (event) => {
      if (!finePointer.matches || reducedMotion.matches) return;
      const rect = tile.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      tile.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
      tile.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
    });
    tile.addEventListener('pointerleave', () => {
      tile.style.setProperty('--rx', '0deg');
      tile.style.setProperty('--ry', '0deg');
    });
  });

  /* ---------- note記事とGitHubの更新情報 ---------- */
  const {element, safeUrl, formatDate, loadJson} = site;
  site.loadJson('/blog/articles.json').then((articles) => {
    if (!articles.length) return;
    $('noteList').replaceChildren(...articles.slice(0, 3).map(site.noteCard));
    const latest = $('latestArticleLink');
    if (latest && articles[0].generated) latest.href = `/blog/${articles[0].id}.html`;
  }).catch((error) => console.warn('note記事はページ内の表示を使います', error));
  loadJson('/blog/latest-links.json').then((latest) => {
    const repositories = latest.githubRepositories?.slice(0, 3) || [];
    if (!repositories.length) return;
    $('repoList').replaceChildren(...repositories.map((repository) => {
      const item = element('li');
      const link = element('a');
      link.href = safeUrl(repository.html_url, 'https://github.com/SuperZero1288');
      link.target = '_blank';
      link.rel = 'noopener';
      link.append(element('strong', '', repository.name), element('small', '', [formatDate(repository.pushed_at), repository.language].filter(Boolean).join(' / ')));
      item.append(link);
      return item;
    }));
  }).catch((error) => console.warn('GitHubの更新情報はページ内の表示を使います', error));

  /* ---------- アプリ（desktop.js）から使う窓口 ---------- */
  Object.assign(site, {
    getDeviceState,
    setDeviceOsHack,
    closeSheets: () => setSheet(null, {returnFocus: false}),
    openProfile,
    latestNoteUrl: () => document.querySelector('#noteList a.note-card')?.href || new URL('/blog/n8d41d4a76214.html', location.href).href,
  });
})();
