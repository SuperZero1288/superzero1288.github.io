// デスクトップアプリ風UI（ウィンドウ、タスクバー、6つのアプリ）
// 前のデザイン（/legacy/site-desktop.js）の機能を、今のデザイン用に作り直したものです。
// 仮想ファイルシステム（/zero-filesystem.js）と保存データは、前のデザインと共有します。
(() => {
  'use strict';
  const site = window.zeroSite;
  const vfs = window.zeroVfs;
  if (!site || !vfs) return;

  const MAX_WINDOWS = 10;
  const windows = new Map();
  let nextWindowId = 1;
  let topZ = 10;
  let cascadeIndex = 0;
  const isCompact = () => matchMedia('(max-width: 640px)').matches;
  const windowSystem = () => site.getDeviceState().windowSystem;

  const SVG = {
    terminal: '<svg viewBox="0 0 24 24"><path d="M4 6l6 6-6 6M12 18h8"/></svg>',
    calculator: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 11h1m3 0h1m3 0h1M8 15h1m3 0h1m3 0h1M8 18h5m3 0h1"/></svg>',
    paint: '<svg viewBox="0 0 24 24"><path d="m14.5 5.5 4 4M4 20c2.8.1 4.5-.5 5.2-1.9.6-1.2-.1-2.4 1.1-3.6L17.8 7a2.1 2.1 0 0 0-3-3l-7.5 7.5c-1.2 1.2-2.4.5-3.6 1.1C2.3 13.3 1.8 15 2 17.8c.1 1.2.8 2 2 2.2Z"/></svg>',
    notepad: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></svg>',
    browser: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z"/></svg>',
    explorer: '<svg viewBox="0 0 24 24"><path d="M3 7h7l2 2h9v10H3z"/><path d="M3 7V5h7l2 2"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/></svg>',
    minimize: '<svg viewBox="0 0 24 24"><path d="M6 13h12"/></svg>',
    maximize: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><rect x="5" y="9" width="10" height="10" rx="2.5"/><path d="M9 9V7.5A2.5 2.5 0 0 1 11.5 5H16.5A2.5 2.5 0 0 1 19 7.5v5a2.5 2.5 0 0 1-2.5 2.5H15"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  };
  const APPS = {
    terminal: {title: 'ターミナル', tone: '--pop-mint', shape: 'cookie9', width: 780, height: 500},
    calculator: {title: '電卓', tone: '--pop-yellow', shape: 'clover4', width: 380, height: 580},
    paint: {title: 'ペイント', tone: '--pop-pink', shape: 'flower', width: 900, height: 610},
    notepad: {title: 'メモ帳', tone: '--pop-violet', shape: 'gem', width: 720, height: 520},
    browser: {title: 'ウェブ ブラウザ', tone: '--pop-blue', shape: 'cookie12', width: 820, height: 540},
    explorer: {title: 'ファイル エクスプローラー', tone: '--pop-orange', shape: 'pentagon', width: 880, height: 570},
    file: {title: 'ファイル', tone: '--pop-blue', shape: 'square', width: 620, height: 420},
  };
  const SEARCH_ENGINES = {
    google: {label: 'Google', action: 'https://www.google.com/search', parameter: 'q', icon: '/assets/search-engines/official/google.svg'},
    duckduckgo: {label: 'DuckDuckGo', action: 'https://duckduckgo.com/', parameter: 'q', icon: '/assets/search-engines/official/duckduckgo.svg'},
    brave: {label: 'Brave', action: 'https://search.brave.com/search', parameter: 'q', icon: '/assets/search-engines/official/brave.svg'},
    bing: {label: 'Bing', action: 'https://www.bing.com/search', parameter: 'q', icon: '/assets/search-engines/official/bing.svg'},
    mojeek: {label: 'Mojeek', action: 'https://www.mojeek.com/search', parameter: 'q', icon: '/assets/search-engines/official/mojeek.svg'},
  };
  const storage = {
    get: (key, fallback) => { try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch { return fallback; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch {} },
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const focusables = 'button:not([disabled]),input:not([disabled]),select,textarea,canvas[tabindex],[tabindex]:not([tabindex="-1"]),a[href]';
  const focusInside = (element, target) => {
    const node = target && element.contains(target) ? target : element.querySelector(focusables);
    node?.focus({preventScroll: true});
  };

  /* ===== デスクトップのレイヤーとタスクバー ===== */
  const layer = el('div', 'desktop-layer');
  layer.id = 'desktopLayer';
  const taskbar = el('nav', 'taskbar');
  taskbar.setAttribute('aria-label', '開いているアプリ');
  taskbar.innerHTML = '<button class="task-home" type="button" aria-label="デスクトップを表示" title="デスクトップを表示"><span aria-hidden="true">Z</span></button><div class="task-items" role="toolbar" aria-label="ウィンドウ一覧"></div><span class="task-count" aria-label="開いているウィンドウ: 0">0</span>';
  layer.append(taskbar);
  document.body.append(layer);
  const taskItems = taskbar.querySelector('.task-items');
  const taskHome = taskbar.querySelector('.task-home');
  const taskCount = taskbar.querySelector('.task-count');
  let desktopRestoreIds = [];

  const updateDesktopState = () => {
    const count = windows.size;
    document.body.classList.toggle('has-windows', count > 0);
    taskCount.textContent = String(count);
    taskCount.setAttribute('aria-label', `開いているウィンドウ: ${count}`);
    if (!count) { desktopRestoreIds = []; taskHome.classList.remove('is-active'); }
  };

  const focusWindow = (record) => {
    if (!record || record.minimized) return;
    topZ += 1;
    record.lastFocusedAt = performance.now();
    record.element.style.zIndex = String(topZ);
    desktopRestoreIds = [];
    taskHome.classList.remove('is-active');
    windows.forEach((item) => {
      const focused = item === record;
      item.element.classList.toggle('is-focused', focused);
      item.taskButton.classList.toggle('is-active', focused);
      item.taskButton.setAttribute('aria-pressed', String(focused));
    });
  };

  const syncTaskButton = (record) => {
    record.taskButton.classList.toggle('is-minimized', record.minimized);
    record.taskButton.setAttribute('aria-label', `${record.title} ${record.id}${record.minimized ? 'を復元' : 'へ切り替え'}`);
  };

  const mostRecent = (except) => [...windows.values()].filter((item) => item !== except && !item.minimized).sort((a, b) => b.lastFocusedAt - a.lastFocusedAt)[0];

  const setMinimized = (record, minimized) => {
    if (!record || record.minimized === minimized) return;
    if (minimized && record.element.contains(document.activeElement)) record.taskButton.focus();
    record.minimized = minimized;
    record.element.inert = minimized;
    record.element.classList.toggle('is-minimized', minimized);
    record.element.setAttribute('aria-hidden', String(minimized));
    syncTaskButton(record);
    if (!minimized) {
      focusWindow(record);
      focusInside(record.element, record.focusTarget);
    } else {
      record.element.classList.remove('is-focused');
      record.taskButton.classList.remove('is-active');
      record.taskButton.setAttribute('aria-pressed', 'false');
      const next = mostRecent(record);
      if (next) focusWindow(next);
    }
  };

  const setMaximized = (record, maximized) => {
    if (!record || isCompact() || record.maximized === maximized) return;
    if (maximized) {
      record.restoreRect = {left: record.element.style.left, top: record.element.style.top, width: record.element.style.width, height: record.element.style.height};
    } else if (record.restoreRect) {
      Object.assign(record.element.style, record.restoreRect);
    }
    record.maximized = maximized;
    record.element.classList.toggle('is-maximized', maximized);
    record.maximizeButton.innerHTML = maximized ? SVG.restore : SVG.maximize;
    record.maximizeButton.setAttribute('aria-label', maximized ? '元のサイズに戻す' : '最大化');
    focusWindow(record);
  };

  const closeWindow = (record) => {
    if (!record || !windows.has(record.id)) return;
    record.dispose?.();
    windows.delete(record.id);
    record.taskButton.remove();
    record.element.inert = true;
    record.element.setAttribute('aria-hidden', 'true');
    record.element.classList.add('is-closing');
    setTimeout(() => record.element.remove(), 260);
    updateDesktopState();
    const next = mostRecent();
    if (next) { focusWindow(next); focusInside(next.element, next.focusTarget); }
    else if (windows.size) [...windows.values()].at(-1).taskButton.focus();
    else if (record.returnFocus?.isConnected && !record.returnFocus.closest('[inert]')) record.returnFocus.focus();
  };

  const createTaskButton = (record) => {
    const button = el('button', 'task-item');
    button.type = 'button';
    button.style.setProperty('--tone', `var(${record.tone})`);
    button.style.setProperty('--shape', `var(--shape-${record.shape})`);
    button.innerHTML = `<span class="task-icon" aria-hidden="true">${SVG[record.appId] || SVG.file}</span><b></b>`;
    button.querySelector('b').textContent = record.title;
    button.addEventListener('click', () => {
      if (record.minimized) setMinimized(record, false);
      else if (record.element.classList.contains('is-focused')) setMinimized(record, true);
      else { focusWindow(record); focusInside(record.element, record.focusTarget); }
    });
    taskItems.append(button);
    record.taskButton = button;
    syncTaskButton(record);
  };

  taskHome.addEventListener('click', () => {
    const visible = [...windows.values()].filter((item) => !item.minimized);
    if (visible.length) {
      const restoreIds = visible.map((item) => item.id);
      visible.forEach((item) => setMinimized(item, true));
      desktopRestoreIds = restoreIds;
      taskHome.classList.add('is-active');
      return;
    }
    const restore = desktopRestoreIds.length ? [...desktopRestoreIds] : [[...windows.values()].sort((a, b) => b.lastFocusedAt - a.lastFocusedAt)[0]?.id];
    restore.forEach((id) => setMinimized(windows.get(id), false));
    desktopRestoreIds = [];
    taskHome.classList.remove('is-active');
  });

  const clampWindow = (record) => {
    if (isCompact() || record.maximized) return;
    const rect = record.element.getBoundingClientRect();
    const width = Math.min(rect.width, innerWidth - 16);
    const height = Math.min(rect.height, innerHeight - 160);
    record.element.style.width = `${width}px`;
    record.element.style.height = `${height}px`;
    record.element.style.left = `${Math.min(Math.max(8, rect.left), Math.max(8, innerWidth - width - 8))}px`;
    record.element.style.top = `${Math.min(Math.max(72, rect.top), Math.max(72, innerHeight - height - 88))}px`;
  };

  const installDrag = (record, bar) => {
    let drag = null;
    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button') || record.maximized || isCompact()) return;
      const rect = record.element.getBoundingClientRect();
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top};
      bar.setPointerCapture(event.pointerId);
      record.element.classList.add('is-dragging');
      focusWindow(record);
      event.preventDefault();
    });
    bar.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      record.element.style.left = `${Math.min(Math.max(8, drag.left + event.clientX - drag.x), Math.max(8, innerWidth - record.element.offsetWidth - 8))}px`;
      record.element.style.top = `${Math.min(Math.max(8, drag.top + event.clientY - drag.y), Math.max(8, innerHeight - 140))}px`;
    });
    const finish = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      record.element.classList.remove('is-dragging');
      if (event.clientY <= 6) setMaximized(record, true);
      drag = null;
    };
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
    bar.addEventListener('dblclick', (event) => { if (!event.target.closest('button')) setMaximized(record, !record.maximized); });
  };

  const createWindow = ({appId, title, build}) => {
    if (windows.size >= MAX_WINDOWS) { site.notify(`同時に開けるウィンドウは${MAX_WINDOWS}個までです`); return null; }
    const meta = APPS[appId] || APPS.file;
    const opener = document.activeElement;
    const sheet = opener?.closest('.side-sheet');
    const returnFocus = sheet ? document.querySelector(`[aria-controls="${sheet.id}"]`) : opener;
    site.closeSheets();

    const id = nextWindowId++;
    const name = title || meta.title;
    const element = el('section', 'app-window');
    element.dataset.app = appId;
    element.dataset.windowId = String(id);
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', name);
    element.style.setProperty('--tone', `var(${meta.tone})`);
    element.style.setProperty('--shape', `var(--shape-${meta.shape})`);
    const width = Math.min(meta.width, innerWidth - 32);
    const height = Math.min(meta.height, innerHeight - 170);
    const offset = (cascadeIndex++ % 6) * 26;
    Object.assign(element.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${Math.max(12, (innerWidth - width) / 2 + offset - 60)}px`,
      top: `${Math.max(76, (innerHeight - height) / 2 + offset - 40)}px`,
    });
    const bar = el('header', 'window-bar');
    bar.innerHTML = `<div class="window-identity"><span class="window-icon" aria-hidden="true">${SVG[appId] || SVG.file}</span><strong></strong></div>
<div class="window-controls">
<button type="button" class="window-btn" data-window-action="minimize" aria-label="最小化">${SVG.minimize}</button>
<button type="button" class="window-btn" data-window-action="maximize" aria-label="最大化">${SVG.maximize}</button>
<button type="button" class="window-btn window-btn-close" data-window-action="close" aria-label="閉じる">${SVG.close}</button>
</div>`;
    bar.querySelector('strong').textContent = name;
    const content = el('div', 'window-content');
    element.append(bar, content);
    layer.insertBefore(element, taskbar);

    const record = {id, title: name, appId, tone: meta.tone, shape: meta.shape, element, content, minimized: false, maximized: false, restoreRect: null, focusTarget: null, dispose: null, lastFocusedAt: performance.now(), returnFocus, maximizeButton: bar.querySelector('[data-window-action="maximize"]')};
    windows.set(id, record);
    createTaskButton(record);
    installDrag(record, bar);
    bar.querySelector('[data-window-action="minimize"]').addEventListener('click', () => setMinimized(record, true));
    record.maximizeButton.addEventListener('click', () => setMaximized(record, !record.maximized));
    bar.querySelector('[data-window-action="close"]').addEventListener('click', () => closeWindow(record));
    element.addEventListener('pointerdown', () => focusWindow(record));
    element.addEventListener('focusin', () => focusWindow(record));

    const api = {record, close: () => closeWindow(record), minimize: () => setMinimized(record, true), maximize: () => setMaximized(record, true)};
    const result = build?.(content, api) || {};
    record.focusTarget = result.focusTarget || null;
    record.dispose = result.dispose || null;
    // 開くアニメーション: 縮んだ状態を一度描いてから元に戻す（描画が止まっているタブでも確実に終わるように）
    element.classList.add('is-opening');
    element.getBoundingClientRect();
    element.classList.remove('is-opening');
    focusWindow(record);
    updateDesktopState();
    focusInside(element, record.focusTarget);
    return record;
  };

  /* ===== 共通の処理 ===== */
  const navigateSite = (url) => {
    const target = new URL(url, location.href);
    if (target.origin !== location.origin) window.open(target.href, '_blank', 'noopener');
    else location.assign(target.href);
  };
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const anchor = el('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const dateStamp = (withTime = false) => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return withTime ? `${date}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` : date;
  };
  const typeLabel = (entry) => {
    if (entry.type === 'directory') return 'フォルダー';
    if (entry.type === 'app') return 'アプリ';
    if (entry.type === 'page') return entry.planned ? '未作成のページ' : 'サイト内ページ';
    if (entry.type === 'external') return '外部リンク';
    return 'テキスト ファイル';
  };
  const dynamicFileContent = (entry) => {
    const device = site.getDeviceState();
    if (entry.dynamic === 'device') {
      return [`OS: ${device.effectiveOs}${device.hacked ? ' [ハック済み]' : ''}`, `実際のOS: ${device.actualOs}`, `ブラウザ: ${device.browser}`, `ウィンドウUI: ${device.windowSystem === 'macos' ? 'macOS' : 'Windows'}`, `画面: ${screen.width} x ${screen.height}`, `表示領域: ${innerWidth} x ${innerHeight}`, `言語: ${navigator.language || '不明'}`].join('\n');
    }
    if (entry.dynamic === 'settings') {
      const appearance = site.getAppearance();
      return [`design=m3`, `mode=${appearance.mode}`, `color=${appearance.name.toLowerCase()}`, `os=${device.osHack}`, `window=${device.windowSystem}`, `clock=${site.getClockMode()}`].join('\n');
    }
    return '';
  };

  const openTextFile = (entry) => createWindow({appId: 'file', title: entry.label, build: (content) => {
    content.classList.add('file-viewer');
    content.tabIndex = -1;
    const pre = el('pre', '', entry.type === 'dynamic' ? dynamicFileContent(entry) : entry.content || '');
    content.append(pre);
    return {focusTarget: content};
  }});

  const launchEntry = (entry, {newTab = false} = {}) => {
    if (!entry) return false;
    if (entry.type === 'directory') { openExplorer(entry.path); return true; }
    if (entry.type === 'file' || entry.type === 'dynamic') { openTextFile(entry); return true; }
    if (entry.type === 'external') { window.open(entry.url, '_blank', 'noopener'); return true; }
    if (entry.type === 'page') {
      const url = entry.action === 'latest-note' ? site.latestNoteUrl() : entry.url;
      if (newTab) window.open(new URL(url, location.href).href, '_blank', 'noopener'); else navigateSite(url);
      return true;
    }
    if (entry.type === 'app') {
      const launcher = {...launchers, explorer: () => openExplorer('/home'), profile: site.openProfile}[entry.app];
      launcher?.();
      return Boolean(launcher);
    }
    return false;
  };

  /* ===== ファイル エクスプローラー ===== */
  const openExplorer = (startPath = '/home') => createWindow({appId: 'explorer', build: (content) => {
    content.classList.add('explorer-app');
    content.innerHTML = `
<header class="explorer-toolbar">
<div class="explorer-nav">
<button type="button" class="round-btn" data-explorer="back" aria-label="戻る">←</button>
<button type="button" class="round-btn" data-explorer="forward" aria-label="進む">→</button>
<button type="button" class="round-btn" data-explorer="up" aria-label="ひとつ上へ">↑</button>
</div>
<form class="explorer-path"><input aria-label="場所" autocomplete="off" spellcheck="false"><button type="submit" class="pill-btn">移動</button></form>
<button type="button" class="pill-btn pill-btn-outline explorer-hidden" aria-pressed="false">隠し項目</button>
</header>
<div class="explorer-body">
<nav class="explorer-sidebar" aria-label="よく使う場所"></nav>
<section class="explorer-view">
<header><div><small>LOCATION</small><h2></h2></div><span class="explorer-kind"></span></header>
<div class="explorer-grid" aria-live="polite"></div>
<footer><span class="explorer-count"></span><span>Ctrl + クリックでページを新しいタブに開く</span></footer>
</section>
</div>`;
    const pathInput = content.querySelector('.explorer-path input');
    const grid = content.querySelector('.explorer-grid');
    const heading = content.querySelector('.explorer-view h2');
    const kind = content.querySelector('.explorer-kind');
    const count = content.querySelector('.explorer-count');
    const hiddenToggle = content.querySelector('.explorer-hidden');
    const back = content.querySelector('[data-explorer="back"]');
    const forward = content.querySelector('[data-explorer="forward"]');
    let showHidden = false;
    let history = [vfs.normalize(startPath, '/home')];
    let historyIndex = 0;
    let currentPath = history[0];
    const syncHistory = () => { back.disabled = historyIndex <= 0; forward.disabled = historyIndex >= history.length - 1; };
    const renderMissing = (path) => {
      currentPath = path;
      pathInput.value = vfs.toDisplayPath(path, windowSystem());
      heading.textContent = '場所が見つかりません';
      kind.textContent = '404';
      count.textContent = '0 項目';
      const empty = el('div', 'explorer-empty');
      empty.innerHTML = '<span aria-hidden="true">?</span><strong>このパスは存在しません</strong><p>404ページで、この場所を確認できます。</p><button type="button" class="pill-btn">404ページを開く</button>';
      empty.querySelector('button').addEventListener('click', () => navigateSite(path));
      grid.replaceChildren(empty);
    };
    const render = (path, {push = true} = {}) => {
      const normalized = vfs.normalize(path, currentPath);
      const directory = vfs.get(normalized, '/');
      if (!directory || directory.type !== 'directory') { renderMissing(normalized); syncHistory(); return; }
      currentPath = normalized;
      if (push && history[historyIndex] !== normalized) { history = history.slice(0, historyIndex + 1); history.push(normalized); historyIndex = history.length - 1; }
      pathInput.value = vfs.toDisplayPath(normalized, windowSystem());
      heading.textContent = directory.label;
      kind.textContent = normalized;
      const children = vfs.list(normalized, {hidden: showHidden});
      count.textContent = `${children.length} 項目`;
      if (!children.length) { grid.replaceChildren(el('p', 'explorer-folder-empty', 'このフォルダーは空です')); syncHistory(); return; }
      grid.replaceChildren(...children.map((entry) => {
        const button = el('button', `explorer-item is-${entry.type}${entry.hidden ? ' is-hidden' : ''}`);
        button.type = 'button';
        button.innerHTML = '<span class="explorer-item-icon" aria-hidden="true"></span><span class="explorer-item-copy"><strong></strong><small></small></span>';
        button.querySelector('.explorer-item-icon').textContent = entry.icon || '◇';
        button.querySelector('strong').textContent = vfs.name(entry.path);
        button.querySelector('small').textContent = typeLabel(entry);
        button.addEventListener('click', (event) => {
          if (entry.type === 'directory') render(entry.path);
          else launchEntry(entry, {newTab: event.ctrlKey || event.metaKey});
        });
        return button;
      }));
      syncHistory();
    };
    const sidebar = content.querySelector('.explorer-sidebar');
    [['/home', 'ホーム', '⌂'], ['/home/blog', 'ブログ', '▤'], ['/home/apps', 'アプリ', '▦'], ['/network', 'ネットワーク', '◎'], ['/system', 'システム', '⚙']].forEach(([path, label, icon]) => {
      const button = el('button');
      button.type = 'button';
      button.innerHTML = `<span aria-hidden="true">${icon}</span><b>${label}</b>`;
      button.addEventListener('click', () => render(path));
      sidebar.append(button);
    });
    content.querySelector('.explorer-path').addEventListener('submit', (event) => { event.preventDefault(); render(pathInput.value); });
    back.addEventListener('click', () => { if (historyIndex > 0) { historyIndex -= 1; render(history[historyIndex], {push: false}); } });
    forward.addEventListener('click', () => { if (historyIndex < history.length - 1) { historyIndex += 1; render(history[historyIndex], {push: false}); } });
    content.querySelector('[data-explorer="up"]').addEventListener('click', () => render(vfs.parent(currentPath)));
    hiddenToggle.addEventListener('click', () => {
      showHidden = !showHidden;
      hiddenToggle.setAttribute('aria-pressed', String(showHidden));
      render(currentPath, {push: false});
    });
    const onHack = () => render(currentPath, {push: false});
    addEventListener('zero:devicehackchange', onHack);
    render(currentPath, {push: false});
    return {focusTarget: pathInput, dispose: () => removeEventListener('zero:devicehackchange', onHack)};
  }});

  /* ===== 電卓 ===== */
  const calculateExpression = (raw) => {
    const source = String(raw).replace(/[×＊]/g, '*').replace(/[÷／]/g, '/').replace(/[−ー]/g, '-').replace(/％/g, '%').replace(/\s+/g, '');
    let index = 0;
    const peek = () => source[index];
    const consume = (value) => (source.startsWith(value, index) ? ((index += value.length), true) : false);
    const number = () => {
      const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
      if (!match) throw new Error('数式を確認してください');
      index += match[0].length;
      return Number(match[0]);
    };
    const primary = () => {
      if (consume('√')) { const value = primary(); if (value < 0) throw new Error('負の数の平方根は計算できません'); return Math.sqrt(value); }
      if (consume('(')) { const value = expression(); if (!consume(')')) throw new Error('かっこが閉じられていません'); return value; }
      return number();
    };
    const postfix = () => { let value = primary(); while (consume('%')) value /= 100; return value; };
    const unary = () => (consume('+') ? unary() : consume('-') ? -unary() : postfix());
    const power = () => { const left = unary(); return consume('^') ? left ** power() : left; };
    const product = () => {
      let value = power();
      while (peek() === '*' || peek() === '/') {
        const operator = source[index++];
        const right = power();
        if (operator === '/' && right === 0) throw new Error('0では割れません');
        value = operator === '*' ? value * right : value / right;
      }
      return value;
    };
    const expression = () => {
      let value = product();
      while (peek() === '+' || peek() === '-') { const operator = source[index++]; const right = product(); value = operator === '+' ? value + right : value - right; }
      return value;
    };
    if (!source) throw new Error('数式を入力してください');
    const result = expression();
    if (index !== source.length || !Number.isFinite(result)) throw new Error('数式を確認してください');
    return result;
  };
  const formatNumber = (value) => (Number.isInteger(value) ? String(value) : Number(value.toPrecision(12)).toString());

  const openCalculator = () => createWindow({appId: 'calculator', build: (content) => {
    content.classList.add('calculator-app');
    const keys = [
      ['C', 'clear', 'is-utility'], ['⌫', 'backspace', 'is-utility', '一文字削除'], ['(', '(', 'is-utility'], [')', ')', 'is-utility'],
      ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷', 'is-operator'],
      ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×', 'is-operator'],
      ['1', '1'], ['2', '2'], ['3', '3'], ['−', '−', 'is-operator'],
      ['±', 'sign'], ['0', '0'], ['.', '.'], ['＋', '+', 'is-operator'],
      ['√', 'sqrt'], ['%', '%'], ['xʸ', '^'], ['＝', 'equals', 'is-equals'],
    ];
    content.innerHTML = `<div class="calc-display"><output class="calc-history" aria-live="polite">&nbsp;</output><input type="text" inputmode="decimal" value="0" autocomplete="off" spellcheck="false" aria-label="計算式"></div><div class="calc-keys" role="group" aria-label="電卓のキー"></div>`;
    const input = content.querySelector('input');
    const history = content.querySelector('output');
    const keypad = content.querySelector('.calc-keys');
    keys.forEach(([label, value, className, aria]) => {
      const button = el('button', `calc-key ${className || ''}`.trim(), label);
      button.type = 'button';
      button.dataset.value = value;
      if (aria) button.setAttribute('aria-label', aria);
      keypad.append(button);
    });
    let justCalculated = false;
    const clear = () => { input.value = '0'; history.innerHTML = '&nbsp;'; history.classList.remove('is-error'); justCalculated = false; };
    const calculate = () => {
      try {
        const expression = input.value;
        input.value = formatNumber(calculateExpression(expression));
        history.textContent = `${expression} =`;
        history.classList.remove('is-error');
        justCalculated = true;
      } catch (error) { history.textContent = error.message; history.classList.add('is-error'); }
    };
    const append = (value) => {
      history.classList.remove('is-error');
      const operator = /^[+×÷−%^)]$/.test(value);
      if ((input.value === '0' || justCalculated) && !operator) input.value = '';
      if (justCalculated && !operator) history.innerHTML = '&nbsp;';
      input.value += value;
      justCalculated = false;
    };
    keypad.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const value = button.dataset.value;
      if (value === 'clear') clear();
      else if (value === 'backspace') { input.value = input.value.length > 1 ? input.value.slice(0, -1) : '0'; justCalculated = false; }
      else if (value === 'equals') calculate();
      else if (value === 'sign') { if (/^[-+]?\d*\.?\d+$/.test(input.value)) input.value = String(-Number(input.value)); else append('−'); }
      else if (value === 'sqrt') { input.value = input.value === '0' ? '√(' : `√(${input.value})`; justCalculated = false; }
      else append(value);
    });
    input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9eE.+\-−×*÷/%％^()√\s]/g, ''); justCalculated = false; });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); calculate(); }
      if (event.key === 'Escape' && input.value !== '0') { event.preventDefault(); event.stopPropagation(); clear(); }
    });
    return {focusTarget: input};
  }});

  /* ===== ペイント ===== */
  const openPaint = () => createWindow({appId: 'paint', build: (content) => {
    content.classList.add('paint-app');
    const swatches = ['#211a1e', '#ff6f91', '#ffb347', '#ffe066', '#5ee6a8', '#5b8cff', '#b69cff', '#ffffff'];
    content.innerHTML = `
<div class="paint-toolbar">
<div class="paint-swatches" role="group" aria-label="色を選ぶ">${swatches.map((color, index) => `<button type="button" class="swatch${index === 0 ? ' is-selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="色 ${color}" aria-pressed="${index === 0}"></button>`).join('')}</div>
<label class="paint-field">色<input type="color" value="#211a1e" aria-label="描画色"></label>
<label class="paint-field">太さ<input type="range" min="1" max="60" value="8" aria-label="線の太さ"><output>8</output></label>
<button type="button" class="pill-btn pill-btn-outline" data-paint="eraser" aria-pressed="false">消しゴム</button>
<button type="button" class="pill-btn pill-btn-outline" data-paint="undo" disabled>元に戻す</button>
<button type="button" class="pill-btn pill-btn-outline" data-paint="clear">新規</button>
<button type="button" class="pill-btn" data-paint="download">PNGで保存</button>
</div>
<div class="paint-stage"><canvas width="1600" height="900" tabindex="0" aria-label="描画キャンバス"></canvas></div>`;
    const canvas = content.querySelector('canvas');
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const color = content.querySelector('input[type="color"]');
    const size = content.querySelector('input[type="range"]');
    const sizeOutput = content.querySelector('.paint-field output');
    const eraser = content.querySelector('[data-paint="eraser"]');
    const undo = content.querySelector('[data-paint="undo"]');
    const undoStack = [];
    let drawing = false;
    let erasing = false;
    let lastPoint = null;
    const paintWhite = () => { context.save(); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.restore(); };
    const snapshot = () => { try { undoStack.push(context.getImageData(0, 0, canvas.width, canvas.height)); if (undoStack.length > 10) undoStack.shift(); undo.disabled = false; } catch {} };
    const point = (event) => { const rect = canvas.getBoundingClientRect(); return {x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height}; };
    const draw = (event) => {
      if (!drawing) return;
      const next = point(event);
      context.save();
      context.strokeStyle = erasing ? '#ffffff' : color.value;
      context.lineWidth = Number(size.value);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.lineTo(next.x, next.y);
      context.stroke();
      context.restore();
      lastPoint = next;
      event.preventDefault();
    };
    paintWhite();
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      snapshot();
      drawing = true;
      lastPoint = point(event);
      canvas.setPointerCapture(event.pointerId);
      draw(event);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', (event) => { if (drawing) { draw(event); drawing = false; lastPoint = null; } });
    canvas.addEventListener('pointercancel', () => { drawing = false; lastPoint = null; });
    const selectColor = (value) => {
      color.value = value;
      content.querySelectorAll('.swatch').forEach((swatch) => {
        const selected = swatch.dataset.color === value;
        swatch.classList.toggle('is-selected', selected);
        swatch.setAttribute('aria-pressed', String(selected));
      });
      if (erasing) eraser.click();
    };
    content.querySelector('.paint-swatches').addEventListener('click', (event) => { const swatch = event.target.closest('.swatch'); if (swatch) selectColor(swatch.dataset.color); });
    color.addEventListener('input', () => selectColor(color.value));
    size.addEventListener('input', () => { sizeOutput.textContent = size.value; });
    eraser.addEventListener('click', () => { erasing = !erasing; eraser.setAttribute('aria-pressed', String(erasing)); canvas.classList.toggle('is-erasing', erasing); });
    undo.addEventListener('click', () => { const state = undoStack.pop(); if (state) context.putImageData(state, 0, 0); undo.disabled = !undoStack.length; });
    content.querySelector('[data-paint="clear"]').addEventListener('click', () => { snapshot(); paintWhite(); });
    content.querySelector('[data-paint="download"]').addEventListener('click', () => {
      canvas.toBlob((blob) => {
        if (!blob) { site.notify('PNGを作成できませんでした'); return; }
        downloadBlob(blob, `zero-paint-${dateStamp(true)}.png`);
        site.notify('PNGを保存しました');
      }, 'image/png');
    });
    return {focusTarget: canvas};
  }});

  /* ===== メモ帳（前のデザインと同じ保存場所に自動保存） ===== */
  const NOTE_KEY = 'zero-notepad-document';
  const openNotepad = () => createWindow({appId: 'notepad', build: (content) => {
    content.classList.add('notepad-app');
    content.innerHTML = `
<div class="notepad-toolbar"><label class="paint-field">ファイル名<input type="text" aria-label="ファイル名"></label><button type="button" class="pill-btn">TXTで保存</button></div>
<textarea aria-label="メモ本文" placeholder="ここにメモを書けます。内容はこのブラウザに自動保存されます。" spellcheck="true"></textarea>
<div class="notepad-status"><span>自動保存</span><output>0文字 / 1行</output></div>`;
    const filename = content.querySelector('input');
    const textarea = content.querySelector('textarea');
    const status = content.querySelector('output');
    filename.value = `memo-${dateStamp()}.txt`;
    textarea.value = storage.get(NOTE_KEY, '');
    let saveTimer = 0;
    const updateStatus = () => { status.textContent = `${textarea.value.length}文字 / ${textarea.value ? textarea.value.split(/\r?\n/).length : 1}行`; };
    const persist = () => storage.set(NOTE_KEY, textarea.value);
    const download = () => {
      let name = filename.value.trim().replace(/[\\/:*?"<>|]/g, '_') || `memo-${dateStamp()}.txt`;
      if (!name.toLowerCase().endsWith('.txt')) name += '.txt';
      downloadBlob(new Blob([textarea.value], {type: 'text/plain;charset=utf-8'}), name);
      persist();
      site.notify('テキストを保存しました');
    };
    textarea.addEventListener('input', () => { updateStatus(); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350); });
    textarea.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); download(); } });
    content.querySelector('.notepad-toolbar button').addEventListener('click', download);
    updateStatus();
    return {focusTarget: textarea, dispose: () => { clearTimeout(saveTimer); persist(); }};
  }});

  /* ===== ウェブ ブラウザ（検索ランチャー） ===== */
  const openBrowser = () => createWindow({appId: 'browser', build: (content) => {
    content.classList.add('browser-app');
    content.innerHTML = `
<form class="browser-toolbar" role="search">
<div class="browser-options">
<label class="paint-field">検索エンジン<select name="engine">${Object.entries(SEARCH_ENGINES).map(([key, engine]) => `<option value="${key}">${engine.label}</option>`).join('')}</select></label>
<label class="paint-field">開き方<select name="openMode"><option value="new">新しいタブ</option><option value="current">このタブを上書き</option></select></label>
</div>
<div class="browser-search"><input type="search" name="q" autocomplete="off"><button type="submit" class="pill-btn">検索</button></div>
</form>
<div class="browser-start">
<div class="browser-mark" aria-hidden="true"><img alt=""></div>
<h2>ウェブを検索</h2>
<p class="browser-note"></p>
<section class="browser-recent" aria-label="最近の検索"><h3>最近の検索</h3><div></div></section>
</div>`;
    const input = content.querySelector('input[type="search"]');
    const engineSelect = content.querySelector('[name="engine"]');
    const modeSelect = content.querySelector('[name="openMode"]');
    const mark = content.querySelector('.browser-mark img');
    const note = content.querySelector('.browser-note');
    const recentList = content.querySelector('.browser-recent div');
    const readRecent = () => { try { const saved = JSON.parse(storage.get('zero-browser-recent', '[]')); return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string').slice(0, 6) : []; } catch { return []; } };
    const readSettings = () => {
      try {
        const settings = JSON.parse(storage.get('zero-browser-settings', '{}'));
        engineSelect.value = SEARCH_ENGINES[settings.engine] ? settings.engine : 'google';
        modeSelect.value = settings.openMode === 'current' ? 'current' : 'new';
      } catch { engineSelect.value = 'google'; modeSelect.value = 'new'; }
    };
    let recent = readRecent();
    const engine = () => SEARCH_ENGINES[engineSelect.value] || SEARCH_ENGINES.google;
    const updateUi = (save = true) => {
      mark.src = engine().icon;
      input.placeholder = `${engine().label}で検索`;
      input.setAttribute('aria-label', `${engine().label}で検索`);
      note.textContent = modeSelect.value === 'current' ? `${engine().label}の検索結果でこのタブを上書きします。` : `${engine().label}の検索結果を新しいタブで開きます。`;
      if (save) storage.set('zero-browser-settings', JSON.stringify({engine: engineSelect.value, openMode: modeSelect.value}));
    };
    const search = (query) => {
      const form = el('form');
      form.action = engine().action;
      form.method = 'get';
      form.target = modeSelect.value === 'current' ? '_self' : '_blank';
      form.rel = 'noopener noreferrer';
      form.hidden = true;
      const field = el('input');
      field.name = engine().parameter;
      field.value = query;
      form.append(field);
      document.body.append(form);
      form.submit();
      form.remove();
    };
    const renderRecent = () => {
      if (!recent.length) { recentList.replaceChildren(el('p', '', 'まだ検索履歴はありません')); return; }
      recentList.replaceChildren(...recent.map((query) => {
        const chip = el('button', 'chip-btn', query);
        chip.type = 'button';
        chip.addEventListener('click', () => { input.value = query; search(query); });
        return chip;
      }));
    };
    content.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) return;
      recent = [query, ...recent.filter((item) => item !== query)].slice(0, 6);
      storage.set('zero-browser-recent', JSON.stringify(recent));
      renderRecent();
      search(query);
    });
    engineSelect.addEventListener('change', () => updateUi());
    modeSelect.addEventListener('change', () => updateUi());
    const onStorage = (event) => {
      if (event.key !== 'zero-browser-settings' && event.key !== 'zero-browser-recent') return;
      readSettings(); recent = readRecent(); updateUi(false); renderRecent();
    };
    addEventListener('storage', onStorage);
    // ツールバーの検索（search.js）で検索エンジンや最近の検索が変わったときも合わせる
    addEventListener('zero:browserdatachange', (event) => { if (event.detail?.type !== 'bookmarks') onStorage({key: 'zero-browser-settings'}); });
    readSettings();
    updateUi(false);
    renderRecent();
    return {focusTarget: input, dispose: () => removeEventListener('storage', onStorage)};
  }});

  /* ===== ターミナル ===== */
  const bootSystems = {visible: [], hidden: []};
  // 一覧に出さないOS。コードネームを入力すれば起動できます（前のデザインの一覧はそのまま）。
  const UNLISTED_BOOT_SYSTEMS = new Set(['vastique']);
  const registerBootSystem = (definition, {hidden = false} = {}) => {
    const source = typeof definition === 'string' ? {codename: definition, label: definition} : definition || {};
    const codename = String(source.codename || '').trim();
    if (!codename) return null;
    const entry = {...source, codename, label: String(source.label || codename)};
    const target = hidden || UNLISTED_BOOT_SYSTEMS.has(codename.toLowerCase()) ? bootSystems.hidden : bootSystems.visible;
    const existing = target.findIndex((item) => item.codename.toLowerCase() === codename.toLowerCase());
    if (existing >= 0) target[existing] = entry; else target.push(entry);
    return entry;
  };
  const destinations = {
    home: {label: 'トップページ', url: '/'},
    links: {label: 'リンク一覧', url: '/links.html'}, article: {label: 'note記事', url: '/blog/n8d41d4a76214.html'},
    assets: {label: 'VRChatアセット', url: '/vrchat-assets/'}, note: {label: 'note', url: 'https://note.com/zerrrrro_1288'},
    x: {label: 'X', url: 'https://x.com/ZErrrrrO_VRC'}, youtube: {label: 'YouTube', url: 'https://www.youtube.com/@ZErrrrrO_VRC'},
    booth: {label: 'BOOTH', url: 'https://zerrrrro.booth.pm/'}, github: {label: 'GitHub', url: 'https://github.com/SuperZero1288'},
  };
  const tokenize = (command) => {
    const tokens = [];
    command.replace(/"([^"]*)"|'([^']*)'|([^\s]+)/g, (_, double, single, bare) => { tokens.push(double ?? single ?? bare); return ''; });
    return tokens;
  };
  const promptFor = (path) => (windowSystem() === 'macos' ? `zero@portfolio ${vfs.toDisplayPath(path, 'macos')} %` : `${vfs.toDisplayPath(path, 'windows')}>`);

  const openTerminal = () => createWindow({appId: 'terminal', build: (content, app) => {
    content.classList.add('terminal-app');
    const output = el('div', 'terminal-output');
    output.setAttribute('role', 'log');
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-label', 'ターミナルの出力');
    output.tabIndex = 0;
    const form = el('form', 'terminal-line-input');
    form.innerHTML = '<label class="terminal-prompt"></label><input type="text" aria-label="コマンド" autocomplete="off" autocapitalize="none" spellcheck="false">';
    const prompt = form.querySelector('.terminal-prompt');
    const input = form.querySelector('input');
    prompt.htmlFor = input.id = `terminalInput${app.record.id}`;
    content.append(output, form);

    let history = [];
    let currentPath = '/home';
    let disposed = false;
    let bootState = null;
    try {
      history = JSON.parse(storage.get('zero-terminal-history', '[]')).filter((item) => typeof item === 'string').slice(-100);
      const savedPath = storage.get('zero-terminal-cwd', '');
      if (savedPath && vfs.isDirectory(savedPath, '/')) currentPath = vfs.normalize(savedPath, '/');
    } catch {}
    let historyIndex = history.length;
    const persistHistory = () => storage.set('zero-terminal-history', JSON.stringify(history.slice(-100)));
    const persistPath = () => storage.set('zero-terminal-cwd', currentPath);
    const updatePrompt = () => { prompt.textContent = bootState ? 'bootmgr>' : promptFor(currentPath); };
    const write = (text = '', kind = 'normal') => {
      output.append(el('div', `terminal-text is-${kind}`, String(text)));
      output.scrollTop = output.scrollHeight;
    };
    const writeEntered = (command) => {
      const line = el('div', 'terminal-text is-entered');
      line.append(el('span', '', `${bootState ? 'bootmgr>' : promptFor(currentPath)} `), el('b', '', command));
      output.append(line);
    };
    const writeDevice = () => {
      const device = site.getDeviceState();
      const appearance = site.getAppearance();
      write(`OS              ${device.effectiveOs}${device.hacked ? '  [ハック済み]' : ''}`, 'accent');
      write(`実際のOS        ${device.actualOs}`);
      write(`ブラウザ        ${device.browser}`);
      write(`ウィンドウUI    ${device.windowSystem === 'macos' ? 'macOS' : 'Windows'}`);
      write(`テーマ          ${appearance.name} / ${appearance.mode === 'dark' ? 'Dark' : 'Light'}`);
      write(`画面            ${screen.width} x ${screen.height}`);
      write(`表示領域        ${innerWidth} x ${innerHeight}`);
      write(`CPU             ${navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} 論理コア` : '取得できません'}`);
      write(`言語            ${navigator.language || '不明'}`);
    };
    const resolveEntry = (raw) => {
      const destination = destinations[String(raw || '').toLowerCase()];
      if (destination) return {type: new URL(destination.url, location.href).origin === location.origin ? 'page' : 'external', label: destination.label, url: destination.url, path: raw};
      return vfs.get(raw, currentPath);
    };
    const listDirectory = (raw, hidden) => {
      const path = vfs.normalize(raw || currentPath, currentPath);
      const directory = vfs.get(path, '/');
      if (!directory) { write(`パスが見つかりません: ${path}`, 'error'); return; }
      if (directory.type !== 'directory') { write(`${vfs.name(path)}  ${typeLabel(directory)}`); return; }
      const items = vfs.list(path, {hidden});
      if (!items.length) { write('(空のフォルダー)', 'muted'); return; }
      items.forEach((entry) => write(`${entry.type === 'directory' ? '[DIR] ' : '      '}${vfs.name(entry.path)}${entry.type === 'directory' ? '/' : ''}${entry.hidden ? '  [hidden]' : ''}`, entry.hidden ? 'muted' : 'normal'));
    };
    const accessPath = (raw) => {
      const entry = resolveEntry(raw);
      if (entry) {
        if (entry.type === 'directory') { currentPath = entry.path; persistPath(); updatePrompt(); openExplorer(entry.path); write(`${entry.label}をエクスプローラーで開きました`, 'success'); }
        else { launchEntry(entry); write(`${entry.label}を開いています`, 'success'); }
        return;
      }
      const path = vfs.normalize(raw, currentPath);
      write(`存在しないパスです。404へ移動します: ${path}`, 'error');
      setTimeout(() => navigateSite(path), 240);
    };
    const showHelp = (all) => {
      write('利用できるコマンド', 'accent');
      ['  pwd / cd PATH                 現在地の表示・移動', '  ls [-a] [PATH] / dir [/a]     ファイル一覧', '  tree [-a] [PATH]              ディレクトリ構造', '  cat PATH / type PATH          ファイルを読む', '  access PATH                   ページ・アプリへ移動', '  explorer [PATH]               ファイルを表示', '  note latest                   最新note記事を開く', '  theme [list|next|NAME]        テーマカラー', '  mode dark|light|toggle / clock 12|24', '  hack os [macos|windows|linux|auto]', '  profile / device              プロフィール・端末情報', '  calc / paint / notepad / browser  アプリを開く', '  windows / window ACTION ID    ウィンドウ管理', '  bootmgr                       PC用 Boot Manager', '  history / clear / date / echo 基本コマンド'].forEach((line) => write(line));
      write('Tab: 補完  ↑↓: 履歴  Ctrl+L: 画面消去  Ctrl+Alt+T: 新しいターミナル', 'muted');
      if (all) { write(''); write('隠しコマンド', 'accent'); write('  matrix / fortune / sudo / boot / bootmgr'); write('隠しファイルは ls -a または dir /a で表示できます', 'muted'); }
    };

    /* Boot Manager（前のデザインと同じ流れで AetherOS / Vastique を起動） */
    const showBootMenu = () => { bootState = {screen: 'menu'}; updatePrompt(); write('ZERO SITE BOOT MANAGER', 'accent'); write('[1.Select from list]'); write('[2.Type to select]'); write('[3.Quit]'); write('Select an option (1/2/3):', 'muted'); };
    const showBootList = () => { bootState = {screen: 'list'}; write('Bootable operating systems', 'accent'); if (!bootSystems.visible.length) write('No bootable OS is installed.', 'muted'); bootSystems.visible.forEach((entry, index) => write(`${index + 1}. ${entry.label} (${entry.codename})`)); write(`${bootSystems.visible.length + 1}. Quit`); write('Select an OS number (or Q to return):', 'muted'); };
    const showBootType = () => { bootState = {screen: 'type'}; write('Type an OS codename (Q or Quit to return):', 'muted'); };
    const confirmBoot = (entry) => { bootState = {screen: 'confirm', entry}; write(`Are you sure you want to boot ${entry.codename}?`, 'accent'); write('Y/N:', 'muted'); };
    const exitBoot = (message = 'Boot Manager exited.') => { write(message, 'success'); bootState = null; updatePrompt(); };
    const bootInput = (raw) => {
      const value = String(raw || '').trim();
      const lower = value.toLowerCase();
      const quit = lower === 'q' || lower === 'quit';
      if (bootState.screen === 'menu') {
        if (value === '1') showBootList(); else if (value === '2') showBootType(); else if (value === '3' || quit) exitBoot();
        else { write('Please select 1, 2, or 3.', 'error'); write('Select an option (1/2/3):', 'muted'); }
      } else if (bootState.screen === 'list') {
        if (quit) { showBootMenu(); return; }
        const selected = Number(value);
        const quitIndex = bootSystems.visible.length + 1;
        if (selected === quitIndex) { exitBoot(); return; }
        const entry = Number.isInteger(selected) && selected >= 1 ? bootSystems.visible[selected - 1] : null;
        if (entry) confirmBoot(entry); else { write('Invalid OS selection.', 'error'); write(`Select an OS number (1-${quitIndex}) or Q to return:`, 'muted'); }
      } else if (bootState.screen === 'type') {
        if (quit) { showBootMenu(); return; }
        const entry = [...bootSystems.visible, ...bootSystems.hidden].find((item) => item.codename.toLowerCase() === lower);
        if (entry) confirmBoot(entry); else { bootState = {screen: 'not-found'}; write('No bootable OS with that codename was found.', 'error'); write('Q) Quit    R) Retry', 'muted'); }
      } else if (bootState.screen === 'not-found') {
        if (quit) showBootMenu(); else if (lower === 'r' || lower === 'retry') showBootType(); else write('Enter Q to quit or R to retry.', 'muted');
      } else if (bootState.screen === 'confirm') {
        if (lower === 'y' || lower === 'yes') {
          const entry = bootState.entry;
          write(`Booting ${entry.codename}...`, 'accent');
          bootState = null;
          updatePrompt();
          if (typeof entry.boot === 'function') { try { entry.boot(entry); } catch (error) { write(`Boot failed: ${error?.message || 'unknown error'}`, 'error'); } }
          else write('No bootable OS image is installed yet.', 'muted');
        } else if (lower === 'n' || lower === 'no') showBootMenu(); else write('Please answer Y or N.', 'muted');
      }
    };

    const execute = (raw) => {
      if (bootState) { bootInput(raw); return; }
      const tokens = tokenize(raw.trim());
      if (!tokens.length) return;
      const command = tokens.shift().toLowerCase();
      const sub = String(tokens[0] || '').toLowerCase();
      const flags = ['-a', '--all', '/a'];
      switch (command) {
        case 'help': case '?': showHelp(tokens.includes('--all') || tokens.includes('-a')); break;
        case 'clear': case 'cls': output.replaceChildren(); break;
        case 'ver': write('ZERO SITE TERMINAL 2.0.0 / NEXT DESIGN / VFS ready', 'accent'); break;
        case 'pwd': write(vfs.toDisplayPath(currentPath, windowSystem()), 'accent'); break;
        case 'cd': {
          const path = vfs.normalize(tokens[0] || '/home', currentPath);
          if (!vfs.isDirectory(path, '/')) { write(`ディレクトリが見つかりません: ${path}`, 'error'); break; }
          currentPath = path; persistPath(); updatePrompt(); break;
        }
        case 'ls': case 'dir': listDirectory(tokens.find((token) => !flags.includes(token)), tokens.some((token) => flags.includes(token))); break;
        case 'tree': {
          const path = vfs.normalize(tokens.find((token) => !flags.includes(token)) || currentPath, currentPath);
          if (!vfs.isDirectory(path, '/')) { write(`ディレクトリが見つかりません: ${path}`, 'error'); break; }
          write(vfs.toDisplayPath(path, windowSystem()), 'accent');
          vfs.walk(path, {hidden: tokens.some((token) => flags.includes(token))}).forEach((line) => write(line));
          break;
        }
        case 'cat': case 'type': {
          const entry = vfs.get(tokens[0], currentPath);
          if (!entry || !['file', 'dynamic'].includes(entry.type)) { write('読み取れるファイルを指定してください', 'error'); break; }
          write(entry.type === 'dynamic' ? dynamicFileContent(entry) : entry.content || ''); break;
        }
        case 'access': case 'goto': if (!tokens[0]) write('使い方: access PATH', 'error'); else accessPath(tokens[0]); break;
        case 'explorer': case 'files': openExplorer(tokens[0] ? vfs.normalize(tokens[0], currentPath) : currentPath); write('ファイル エクスプローラーを開きました', 'success'); break;
        case 'note':
          if (!sub || sub === 'latest') { navigateSite(site.latestNoteUrl()); write('最新のnote記事を開いています', 'success'); }
          else if (sub === 'profile' || sub === 'list') { window.open('https://note.com/zerrrrro_1288', '_blank', 'noopener'); write('noteを新しいタブで開きました', 'success'); }
          else write('使い方: note latest | note profile', 'error');
          break;
        case 'whoami': write('ぜろくんでんせつ / ZErrrrrO', 'accent'); write('趣味でUnityをしている一般高校生'); write('profile で詳しいプロフィールを表示できます', 'muted'); break;
        case 'date': write(new Intl.DateTimeFormat('ja-JP', {dateStyle: 'full', timeStyle: 'medium'}).format(new Date())); break;
        case 'echo': write(tokens.join(' ')); break;
        case 'device': case 'system': case 'info': case 'neofetch': writeDevice(); break;
        case 'theme': {
          if (!sub) { const appearance = site.getAppearance(); write(`${appearance.name} / ${appearance.mode === 'dark' ? 'Dark' : 'Light'}`, 'accent'); break; }
          if (sub === 'list') { site.hues.forEach((hue) => write(hue.name.toLowerCase())); break; }
          if (sub === 'next') { const names = site.hues.map((hue) => hue.name); const next = names[(names.indexOf(site.getAppearance().name) + 1) % names.length]; site.setHue(next); write(`テーマカラーを ${next} に変更しました`, 'success'); break; }
          const requested = sub === 'set' ? tokens[1] : tokens[0];
          const result = site.setHue(requested || '');
          if (result) write(`テーマカラーを ${result.name} に変更しました`, 'success'); else write(`テーマカラーが見つかりません: ${requested || ''}（theme list で一覧）`, 'error');
          break;
        }
        case 'mode':
          if (!sub) { write(site.getAppearance().mode, 'accent'); break; }
          if (site.setMode(sub)) write(`${site.getAppearance().mode === 'dark' ? 'ダーク' : 'ライト'}モードに変更しました`, 'success'); else write('使い方: mode dark | light | toggle', 'error');
          break;
        case 'clock':
          if (!sub) { write(`${site.getClockMode()}時間表示`, 'accent'); break; }
          if (site.setClockMode(sub)) write(`時計を${sub}時間表示に変更しました`, 'success'); else write('使い方: clock 12 | 24', 'error');
          break;
        case 'settings': {
          const appearance = site.getAppearance();
          const device = site.getDeviceState();
          write(`テーマカラー ${appearance.name}`, 'accent'); write(`モード       ${appearance.mode === 'dark' ? 'Dark' : 'Light'}`); write(`時計         ${site.getClockMode()}時間表示`);
          write(`OS表示       ${device.effectiveOs}${device.hacked ? ' [ハック済み]' : ' [自動]'}`); write(`ウィンドウUI ${device.windowSystem === 'macos' ? 'macOS' : 'Windows'}`); break;
        }
        case 'hack': {
          if (!sub || sub === 'status') { const device = site.getDeviceState(); write(`実際のOS: ${device.actualOs}`); write(`表示中: ${device.effectiveOs}${device.hacked ? ' [ハック済み]' : ' [自動]'}`, 'accent'); break; }
          if (sub === 'reset') { site.setDeviceOsHack('auto'); write('OS表示を自動判定に戻しました', 'success'); break; }
          if (sub !== 'os') { write('使い方: hack os macos | windows | linux | auto', 'error'); break; }
          const value = String(tokens[1] || '').toLowerCase();
          const os = {mac: 'macos', osx: 'macos', win: 'windows', ubuntu: 'linux', reset: 'auto'}[value] || value;
          if (!site.setDeviceOsHack(os)) { write('指定できるOS: macos, windows, linux, auto', 'error'); break; }
          const device = site.getDeviceState();
          write(os === 'auto' ? `自動判定に戻しました: ${device.effectiveOs}` : `OS表示を ${device.effectiveOs} に上書きしました [ハック済み]`, 'success');
          break;
        }
        case 'open': {
          if (!sub || sub === 'list') { write('パスまたは名前を指定できます', 'accent'); vfs.list('/home').forEach((entry) => write(`${vfs.name(entry.path).padEnd(14)} ${entry.label}`)); write('terminal / explorer / calculator / paint / notepad / browser / profile'); break; }
          const apps = {terminal: openTerminal, explorer: () => openExplorer(currentPath), calculator: openCalculator, calc: openCalculator, paint: openPaint, notepad: openNotepad, memo: openNotepad, browser: openBrowser, web: openBrowser, profile: site.openProfile, about: site.openProfile};
          if (apps[sub]) { apps[sub](); write(`${sub} を開きました`, 'success'); } else accessPath(tokens[0]);
          break;
        }
        case 'new': case 'terminal': openTerminal(); write('新しいターミナルを開きました', 'success'); break;
        case 'calc': case 'calculator': openCalculator(); write('電卓を開きました', 'success'); break;
        case 'paint': openPaint(); write('ペイントを開きました', 'success'); break;
        case 'memo': case 'notepad': openNotepad(); write('メモ帳を開きました', 'success'); break;
        case 'web': case 'browser': openBrowser(); write('ウェブ ブラウザを開きました', 'success'); break;
        case 'profile': case 'about': site.openProfile(); write('詳しいプロフィールを開きました', 'success'); break;
        case 'windows':
          if (!windows.size) write('開いているウィンドウはありません', 'muted');
          windows.forEach((item) => write(`${String(item.id).padStart(2, '0')}  ${item.title.padEnd(14)} ${item.minimized ? '[最小化]' : item.maximized ? '[最大化]' : '[表示中]'}`, item === app.record ? 'accent' : 'normal'));
          break;
        case 'window': {
          const target = windows.get(Number(tokens[1]));
          if (!['focus', 'close', 'minimize', 'maximize', 'restore'].includes(sub) || !target) { write('使い方: window focus | close | minimize | maximize | restore ID', 'error'); break; }
          if (sub === 'focus' || sub === 'restore') { setMinimized(target, false); if (sub === 'restore') setMaximized(target, false); focusWindow(target); }
          if (sub === 'close') closeWindow(target);
          if (sub === 'minimize') setMinimized(target, true);
          if (sub === 'maximize') { setMinimized(target, false); setMaximized(target, true); }
          write(`ウィンドウ ${target.id} を操作しました`, 'success');
          break;
        }
        case 'minimize': app.minimize(); break;
        case 'maximize': app.maximize(); break;
        case 'close': case 'exit': app.close(); break;
        case 'history':
          if (sub === 'clear') { history = []; historyIndex = 0; persistHistory(); write('コマンド履歴を消去しました', 'success'); }
          else history.forEach((item, index) => write(`${String(index + 1).padStart(3, ' ')}  ${item}`));
          break;
        case 'matrix':
          content.classList.add('is-matrix');
          ['01011010 01000101 01010010 01001111', 'wake / explore / create', '00000000 → ぜろ', 'signal locked.'].forEach((line, index) => setTimeout(() => { if (!disposed) write(line, index === 3 ? 'success' : 'accent'); }, index * 110));
          setTimeout(() => content.classList.remove('is-matrix'), 1600);
          break;
        case 'fortune': {
          const fortunes = ['作りかけの場所には、未来が置いてある。', '404は行き止まりではなく、まだ名前のない部屋。', '一番面白いコマンドは、まだhelpに載っていない。', '今日のセーブポイントはここです。'];
          write(fortunes[Math.floor(Math.random() * fortunes.length)], 'accent'); break;
        }
        case 'sudo': write('権限はすでにあります。この世界では、あなたが管理者です。', 'success'); break;
        case 'bootmgr':
          if (isCompact()) write('bootmgr is available on PC only. Mobile devices are not supported.', 'error');
          else if (site.getDeviceState().hacked) write('bootmgr is disabled while an OS hack is active. Run "hack reset" first.', 'error');
          else showBootMenu();
          break;
        case 'boot': write('ZERO SITE OS // all virtual systems operational', 'accent'); write(`mounted: ${vfs.entries.length} entries`); write(`windows: ${windows.size} active`); write('hint: ls -a /', 'muted'); break;
        default: write(`'${command}' はサイトコマンドとして認識されていません。help で一覧を表示できます。`, 'error');
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const command = input.value.trim();
      if (!command) return;
      writeEntered(command);
      history.push(command);
      history = history.slice(-100);
      historyIndex = history.length;
      persistHistory();
      input.value = '';
      execute(command);
      output.scrollTop = output.scrollHeight;
    });
    const baseCommands = ['help', 'pwd', 'cd', 'ls', 'dir', 'tree', 'cat', 'type', 'access', 'explorer', 'note', 'device', 'theme', 'mode', 'clock', 'settings', 'hack', 'open', 'new', 'profile', 'calculator', 'paint', 'notepad', 'browser', 'windows', 'window', 'bootmgr', 'minimize', 'maximize', 'close', 'date', 'whoami', 'ver', 'history', 'clear'];
    const options = {theme: ['list', 'next', 'set', ...site.hues.map((hue) => hue.name.toLowerCase())], mode: ['dark', 'light', 'toggle'], clock: ['12', '24'], hack: ['os', 'status', 'reset'], note: ['latest', 'profile'], window: ['focus', 'close', 'minimize', 'maximize', 'restore'], history: ['clear']};
    const complete = () => {
      const source = input.value;
      const parts = source.trimStart().split(/\s+/);
      const fragment = parts.at(-1) || '';
      let matches;
      if (!/\s/.test(source.trimStart())) matches = baseCommands.filter((item) => item.startsWith(fragment.toLowerCase()));
      else {
        const command = parts[0].toLowerCase();
        if (['cd', 'ls', 'dir', 'tree', 'cat', 'type', 'access', 'explorer', 'open'].includes(command)) {
          matches = vfs.complete(fragment, currentPath, {hidden: fragment.startsWith('.') || parts.includes('-a') || parts.includes('/a')});
          if (command === 'open' && !/[\\/]/.test(fragment)) matches.push(...['terminal', 'explorer', 'calculator', 'paint', 'notepad', 'browser', 'profile'].filter((item) => item.startsWith(fragment.toLowerCase())));
        } else matches = (options[command] || []).filter((item) => item.startsWith(fragment.toLowerCase()));
      }
      matches = [...new Set(matches)];
      if (matches.length === 1) input.value = `${source.slice(0, source.length - fragment.length)}${matches[0]}${matches[0].endsWith('/') ? '' : ' '}`;
      else if (matches.length > 1) write(matches.join('  '));
    };
    input.addEventListener('keydown', (event) => {
      const recall = () => requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
      if (event.key === 'ArrowUp' && history.length) { event.preventDefault(); historyIndex = Math.max(0, historyIndex - 1); input.value = history[historyIndex] || ''; recall(); }
      else if (event.key === 'ArrowDown' && history.length) { event.preventDefault(); historyIndex = Math.min(history.length, historyIndex + 1); input.value = history[historyIndex] || ''; recall(); }
      else if (event.key === 'l' && event.ctrlKey) { event.preventDefault(); output.replaceChildren(); }
      else if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); complete(); }
    });
    content.addEventListener('pointerup', () => { if (!getSelection()?.toString()) input.focus({preventScroll: true}); });
    const onHack = () => {
      if (bootState && site.getDeviceState().hacked) { write('Boot Manager terminated: an OS hack is active.', 'error'); bootState = null; }
      updatePrompt();
    };
    addEventListener('zero:devicehackchange', onHack);
    updatePrompt();
    write('ZERO SITE TERMINAL [Version 2.0.0]', 'accent');
    write('Virtual filesystem mounted.  help でコマンドを表示します。', 'muted');
    write('');
    return {focusTarget: input, dispose: () => { disposed = true; removeEventListener('zero:devicehackchange', onHack); }};
  }});

  /* ===== 起動ボタンとキーボード操作 ===== */
  const launchers = {terminal: openTerminal, calculator: openCalculator, paint: openPaint, notepad: openNotepad, browser: openBrowser, explorer: () => openExplorer('/home')};
  document.querySelectorAll('[data-launch-app]').forEach((button) => {
    const launch = launchers[button.dataset.launchApp];
    if (launch) button.addEventListener('click', () => launch());
  });
  addEventListener('resize', () => windows.forEach(clampWindow), {passive: true});
  addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return;
    const windowElement = event.target.closest?.('.app-window');
    if ((event.key === 'Escape' || (event.altKey && event.key === 'F4')) && windowElement && !event.target.matches('select')) {
      const record = windows.get(Number(windowElement.dataset.windowId));
      if (record) { event.preventDefault(); closeWindow(record); }
      return;
    }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 't') { event.preventDefault(); openTerminal(); return; }
    if (event.altKey && event.key === 'Tab' && windows.size) {
      event.preventDefault();
      const ordered = [...windows.values()].sort((a, b) => b.lastFocusedAt - a.lastFocusedAt);
      const current = ordered.findIndex((item) => item.element.classList.contains('is-focused') && !item.minimized);
      const next = ordered[(current + 1) % ordered.length];
      setMinimized(next, false);
      focusWindow(next);
      focusInside(next.element, next.focusTarget);
    }
  });

  window.zeroSiteDesktop = {
    openTerminal, openCalculator, openPaint, openNotepad, openBrowser, openExplorer,
    openProfile: site.openProfile, registerBootSystem, bootSystems,
    getWindows: () => [...windows.values()].map(({id, title, appId, minimized, maximized}) => ({id, title, appId, minimized, maximized})),
  };
})();
