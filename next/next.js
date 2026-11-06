(() => {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  themeButton.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    saveAppearance({mode: next});
    requestAnimationFrame(syncThemeUi);
    notify(next === 'dark' ? 'ダークモード' : 'ライトモード');
  });
  prefersDark.addEventListener('change', syncThemeUi);
  $('hueButton').addEventListener('click', () => {
    const current = Number(getComputedStyle(root).getPropertyValue('--h')) || HUES[0].hue;
    const index = HUES.findIndex((item) => item.hue === current);
    const next = HUES[(index + 1) % HUES.length];
    root.style.setProperty('--h', next.hue);
    saveAppearance({hue: next.hue});
    requestAnimationFrame(syncThemeUi);
    notify(`テーマカラー: ${next.name}`);
  });
  syncThemeUi();

  /* ---------- ロード画面 ---------- */
  const loader = $('siteLoader');
  const setProgress = (value, text) => {
    loader.querySelector('.loader-bar').style.setProperty('--progress', `${value}%`);
    loader.querySelector('.loader-bar').setAttribute('aria-valuenow', String(value));
    loader.querySelector('.loader-percent').textContent = `${value}%`;
    if (text) loader.querySelector('.loader-status').textContent = text;
  };
  const decode = (image) => (image.complete ? Promise.resolve() : image.decode()).catch(() => {});
  const startedAt = performance.now();
  const steps = [
    [document.fonts ? document.fonts.ready : Promise.resolve(), 'フォントを読み込んでいます'],
    [decode(document.querySelector('.photo-layer.is-current')), '写真を読み込んでいます'],
    [decode(document.querySelector('.avatar-shape img')), 'プロフィール画像を読み込んでいます'],
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

  /* ---------- 時計とカレンダー ---------- */
  const clock = $('clock');
  const clockWrap = $('clockWrap');
  let is24Hour = true;
  let thursdayMode = false;
  let renderedMonth = -1;
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
  renderClock();
  setInterval(renderClock, 1000);

  /* ---------- スクロール連動（ツールバー、背景のぼかし、タブ） ---------- */
  const toolbar = $('toolbar');
  const stageBlur = $('stageBlur');
  const leftTab = $('leftTab');
  const rightTab = $('rightTab');
  const indicator = $('scrollIndicator');
  let lastScrollY = scrollY;
  const atHero = () => scrollY < 120;
  const onScroll = () => {
    const ratio = Math.min(scrollY / innerHeight, 1);
    stageBlur.style.setProperty('--blur', `${(ratio * 18).toFixed(1)}px`);
    stageBlur.style.setProperty('--veil', `${Math.round(ratio * 35)}%`);
    const away = !atHero();
    [leftTab, rightTab].forEach((tab) => tab.classList.toggle('is-away', away));
    indicator.classList.toggle('is-hidden', away);
    const goingDown = scrollY > lastScrollY;
    const compact = matchMedia('(max-width: 560px)').matches;
    if (!compact && goingDown && scrollY > innerHeight * 0.5 && !toolbar.matches(':focus-within') && !clockWrap.classList.contains('is-open')) {
      toolbar.classList.add('is-hidden');
    } else if (!goingDown || scrollY < innerHeight * 0.5) {
      toolbar.classList.remove('is-hidden');
    }
    lastScrollY = scrollY;
  };
  addEventListener('scroll', onScroll, {passive: true});
  toolbar.addEventListener('focusin', () => toolbar.classList.remove('is-hidden'));
  addEventListener('pointermove', (event) => {
    if (event.clientY < 72) toolbar.classList.remove('is-hidden');
  }, {passive: true});
  onScroll();

  /* 背景の図形をマウスに合わせてずらす */
  const stageShapes = $('stageShapes');
  let parallaxFrame = 0;
  addEventListener('pointermove', (event) => {
    if (!finePointer.matches || reducedMotion.matches || parallaxFrame) return;
    parallaxFrame = requestAnimationFrame(() => {
      stageShapes.style.setProperty('--px', (event.clientX / innerWidth - 0.5).toFixed(3));
      stageShapes.style.setProperty('--py', (event.clientY / innerHeight - 0.5).toFixed(3));
      parallaxFrame = 0;
    });
  }, {passive: true});

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
  const background = [$('main'), toolbar, leftTab, rightTab];
  let openSide = null;
  const setSheet = (side) => {
    const previous = openSide;
    openSide = side;
    Object.entries(sheets).forEach(([key, sheet]) => {
      const open = key === side;
      sheet.classList.toggle('is-open', open);
      sheet.inert = !open;
      sheet.setAttribute('aria-hidden', String(!open));
      tabs[key].setAttribute('aria-expanded', String(open));
    });
    background.forEach((element) => { element.inert = Boolean(side); });
    root.style.overflow = side ? 'hidden' : '';
    if (side) {
      scrim.hidden = false;
      requestAnimationFrame(() => scrim.classList.add('is-visible'));
      sheets[side].querySelector('[data-close-sheet]').focus();
    } else {
      scrim.classList.remove('is-visible');
      setTimeout(() => { if (!openSide) scrim.hidden = true; }, 300);
      if (previous) tabs[previous].focus();
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
  const renderDevice = () => {
    const connection = navigator.connection;
    const rows = [
      ['OS', osName()],
      ['ブラウザ', browserName()],
      ['画面', `${screen.width} × ${screen.height}`],
      ['表示領域', `${innerWidth} × ${innerHeight}`],
      ['言語', navigator.language || '不明'],
      ['タッチ', navigator.maxTouchPoints > 0 ? `${navigator.maxTouchPoints}点対応` : '非対応'],
      ['通信', connection?.effectiveType ? connection.effectiveType.toUpperCase() : (navigator.onLine ? 'オンライン' : 'オフライン')],
      ['時刻帯', Intl.DateTimeFormat().resolvedOptions().timeZone || '不明'],
      ['テーマ', isDark() ? 'ダーク' : 'ライト'],
    ];
    $('deviceList').replaceChildren(...rows.map(([label, value]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      return row;
    }));
  };
  renderDevice();
  addEventListener('resize', renderDevice, {passive: true});
  addEventListener('online', renderDevice);
  addEventListener('offline', renderDevice);
  themeButton.addEventListener('click', () => requestAnimationFrame(renderDevice));

  /* ---------- プロフィールのダイアログ ---------- */
  const dialog = $('profileDialog');
  $('profileButton').addEventListener('click', () => dialog.showModal());
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

  /* ---------- note記事とGitHubの更新情報 ---------- */
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
  loadJson('/blog/articles.json').then((articles) => {
    if (!articles.length) return;
    $('noteList').replaceChildren(...articles.slice(0, 3).map((article) => {
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
    }));
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
})();
