// ZERO — ツールバーの検索ボタン（前のデザインの「新しいタブ」と同じ機能）
// 検索エンジンの切り替え、最近の検索、ブックマーク（12件まで）。保存データは前のデザインやブラウザアプリと共有します。
(() => {
  'use strict';
  const site = window.zeroSite;
  const group = document.querySelector('#toolbar .toolbar-group');
  if (!site || !group || document.getElementById('searchButton')) return;

  const SETTINGS_KEY = 'zero-browser-settings';
  const RECENT_KEY = 'zero-browser-recent';
  const BOOKMARKS_KEY = 'zero-browser-bookmarks';
  const MAX_BOOKMARKS = 12;
  const ENGINES = {
    google: {label: 'Google', action: 'https://www.google.com/search', parameter: 'q', icon: '/assets/search-engines/official/google.svg'},
    duckduckgo: {label: 'DuckDuckGo', action: 'https://duckduckgo.com/', parameter: 'q', icon: '/assets/search-engines/official/duckduckgo.svg'},
    brave: {label: 'Brave', action: 'https://search.brave.com/search', parameter: 'q', icon: '/assets/search-engines/official/brave.svg'},
    bing: {label: 'Bing', action: 'https://www.bing.com/search', parameter: 'q', icon: '/assets/search-engines/official/bing.svg'},
    mojeek: {label: 'Mojeek', action: 'https://www.mojeek.com/search', parameter: 'q', icon: '/assets/search-engines/official/mojeek.svg'},
  };
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  /* ---------- ツールバーのボタン ---------- */
  const button = document.createElement('button');
  button.className = 'icon-btn';
  button.id = 'searchButton';
  button.type = 'button';
  button.title = '新しいタブ';
  button.setAttribute('aria-label', '新しいタブを開く');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z"/></svg>';
  group.append(button);

  /* ---------- 検索ダイアログ ---------- */
  const dialog = document.createElement('dialog');
  dialog.className = 'search-dialog';
  dialog.id = 'searchDialog';
  dialog.setAttribute('aria-labelledby', 'searchTitle');
  dialog.innerHTML = `
<div class="search-head">
<div><p class="eyebrow">NEW TAB</p><h2 id="searchTitle">Googleで検索</h2></div>
<button class="icon-btn icon-btn-tonal" type="button" data-close-search aria-label="新しいタブを閉じる">${CLOSE_ICON}</button>
</div>
<form class="search-form" role="search">
<div class="search-box">
<span class="search-engine-mark" aria-hidden="true"><img class="search-engine-icon" src="${ENGINES.google.icon}" alt=""></span>
<input type="search" name="q" placeholder="Googleで検索" aria-label="Googleで検索" autocomplete="off" enterkeyhint="search">
<button class="search-submit" type="submit" aria-label="検索を実行"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></button>
</div>
<div class="search-options">
<label class="search-engine"><span>検索エンジン</span>
<select name="engine">${Object.entries(ENGINES).map(([key, engine]) => `<option value="${key}">${engine.label}</option>`).join('')}</select>
</label>
<span class="search-open-mode"></span>
</div>
<div class="search-recent" aria-label="最近の検索"></div>
</form>
<section class="search-bookmarks" aria-labelledby="bookmarksTitle">
<div class="search-bookmarks-head">
<div><p class="eyebrow">SHORTCUTS</p><h3 id="bookmarksTitle">ブックマーク</h3></div>
<button class="search-bookmark-add" type="button" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>追加</button>
</div>
<form class="search-bookmark-editor" hidden>
<label><span>名前</span><input name="bookmarkName" maxlength="40" autocomplete="off" placeholder="サイト名" required></label>
<label><span>URL</span><input name="bookmarkUrl" inputmode="url" autocomplete="url" placeholder="https://example.com" required></label>
<div class="search-bookmark-actions"><button class="btn btn-tonal" type="button" data-bookmark-cancel>キャンセル</button><button class="btn btn-filled" type="submit">保存</button></div>
<p class="search-bookmark-error" role="alert"></p>
</form>
<div class="search-bookmark-grid"></div>
<p class="search-bookmark-empty">よく見るページをここへ保存できます。</p>
</section>`;
  document.body.append(dialog);

  const $ = (selector) => dialog.querySelector(selector);
  const searchForm = $('.search-form');
  const heading = $('#searchTitle');
  const input = searchForm.elements.q;
  const engineSelect = searchForm.elements.engine;
  const engineIcon = $('.search-engine-icon');
  const openModeText = $('.search-open-mode');
  const recentList = $('.search-recent');
  const bookmarkGrid = $('.search-bookmark-grid');
  const bookmarkEmpty = $('.search-bookmark-empty');
  const bookmarkAdd = $('.search-bookmark-add');
  const bookmarkEditor = $('.search-bookmark-editor');
  const bookmarkName = bookmarkEditor.elements.bookmarkName;
  const bookmarkUrl = bookmarkEditor.elements.bookmarkUrl;
  const bookmarkError = $('.search-bookmark-error');

  /* ---------- 保存データ ---------- */
  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || fallback); } catch { return JSON.parse(fallback); }
  };
  const readSettings = () => {
    const saved = readJson(SETTINGS_KEY, '{}') || {};
    return {engine: ENGINES[saved.engine] ? saved.engine : 'google', openMode: saved.openMode === 'current' ? 'current' : 'new'};
  };
  const readRecent = () => {
    const saved = readJson(RECENT_KEY, '[]');
    return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string').slice(0, 6) : [];
  };
  const readBookmarks = () => {
    const saved = readJson(BOOKMARKS_KEY, '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.name === 'string' && typeof item.url === 'string').slice(0, MAX_BOOKMARKS) : [];
  };
  const announce = (type) => dispatchEvent(new CustomEvent('zero:browserdatachange', {detail: {type, source: 'toolbar-search'}}));
  const save = (key, value, type) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    announce(type);
  };

  /* ---------- 表示 ---------- */
  const renderSettings = () => {
    const settings = readSettings();
    const engine = ENGINES[settings.engine];
    engineSelect.value = settings.engine;
    engineIcon.src = engine.icon;
    heading.textContent = `${engine.label}で検索`;
    input.placeholder = `${engine.label}で検索`;
    input.setAttribute('aria-label', `${engine.label}で検索`);
    openModeText.textContent = settings.openMode === 'current' ? 'このタブで開く' : '新しいタブで開く';
  };
  const runSearch = (query) => {
    const settings = readSettings();
    const engine = ENGINES[settings.engine] || ENGINES.google;
    const url = new URL(engine.action);
    url.searchParams.set(engine.parameter, query);
    if (settings.openMode === 'current') location.assign(url.href);
    else window.open(url.href, '_blank', 'noopener,noreferrer');
  };
  const submitQuery = (query) => {
    const normalized = query.trim();
    if (!normalized) return;
    save(RECENT_KEY, [normalized, ...readRecent().filter((item) => item !== normalized)].slice(0, 6), 'recent');
    renderRecent();
    runSearch(normalized);
  };
  function renderRecent() {
    const recent = readRecent();
    if (recentList.contains(document.activeElement)) input.focus();
    recentList.replaceChildren();
    recentList.hidden = !recent.length;
    if (!recent.length) return;
    recentList.append(site.element('span', 'search-recent-label', '最近'));
    recent.forEach((query) => {
      const chip = site.element('button', 'search-recent-chip', query);
      chip.type = 'button';
      chip.title = `${query} を検索`;
      chip.addEventListener('click', () => { input.value = query; submitQuery(query); });
      recentList.append(chip);
    });
  }
  const normalizeUrl = (value) => {
    const trimmed = value.trim();
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  };
  const closeEditor = () => {
    bookmarkEditor.hidden = true;
    bookmarkAdd.setAttribute('aria-expanded', 'false');
    bookmarkError.textContent = '';
    bookmarkEditor.reset();
  };
  const openEditor = () => {
    bookmarkEditor.hidden = false;
    bookmarkAdd.setAttribute('aria-expanded', 'true');
    bookmarkError.textContent = readBookmarks().length >= MAX_BOOKMARKS ? `ブックマークは${MAX_BOOKMARKS}件まで保存できます。` : '';
    requestAnimationFrame(() => bookmarkName.focus({preventScroll: true}));
  };
  const TONES = ['--pop-pink', '--pop-blue', '--pop-mint', '--pop-yellow', '--pop-violet', '--pop-orange'];
  function renderBookmarks() {
    const restoreFocus = bookmarkGrid.contains(document.activeElement);
    const bookmarks = readBookmarks();
    bookmarkGrid.replaceChildren();
    bookmarkEmpty.hidden = bookmarks.length > 0;
    bookmarkAdd.disabled = bookmarks.length >= MAX_BOOKMARKS;
    bookmarks.forEach((bookmark, index) => {
      const item = site.element('div', 'search-bookmark');
      item.style.setProperty('--tone', `var(${TONES[index % TONES.length]})`);
      const link = site.element('a');
      link.href = site.safeUrl(bookmark.url, '#');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = bookmark.url;
      const icon = site.element('span', 'search-bookmark-icon', bookmark.name.trim().charAt(0).toUpperCase() || '↗');
      icon.setAttribute('aria-hidden', 'true');
      let domain = bookmark.url;
      try { domain = new URL(bookmark.url).hostname.replace(/^www\./, ''); } catch {}
      link.append(icon, site.element('strong', '', bookmark.name), site.element('small', '', domain));
      const remove = site.element('button', 'search-bookmark-remove', '×');
      remove.type = 'button';
      remove.title = 'ブックマークを削除';
      remove.setAttribute('aria-label', `${bookmark.name}を削除`);
      remove.addEventListener('click', () => {
        const next = readBookmarks();
        next.splice(index, 1);
        save(BOOKMARKS_KEY, next, 'bookmarks');
        renderBookmarks();
      });
      item.append(link, remove);
      bookmarkGrid.append(item);
    });
    if (restoreFocus) (bookmarkAdd.disabled ? (bookmarkGrid.querySelector('a') || input) : bookmarkAdd).focus();
  }

  /* ---------- 開く・閉じる ---------- */
  const setOpen = (open) => {
    if (open && !dialog.open) {
      renderSettings();
      renderRecent();
      renderBookmarks();
      dialog.showModal();
      input.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  };
  dialog.addEventListener('close', () => {
    closeEditor();
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', '新しいタブを開く');
    button.focus();
  });
  dialog.addEventListener('cancel', (event) => {
    // Esc: ブックマークの編集中は、まず編集だけを閉じる
    if (bookmarkEditor.hidden) return;
    event.preventDefault();
    closeEditor();
    bookmarkAdd.focus();
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) setOpen(false); });
  button.addEventListener('click', () => {
    setOpen(!dialog.open);
    if (dialog.open) {
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', '新しいタブを閉じる');
    }
  });
  $('[data-close-search]').addEventListener('click', () => setOpen(false));
  searchForm.addEventListener('submit', (event) => { event.preventDefault(); submitQuery(input.value); });
  engineSelect.addEventListener('change', () => {
    save(SETTINGS_KEY, {...readSettings(), engine: engineSelect.value}, 'settings');
    renderSettings();
  });
  bookmarkAdd.addEventListener('click', () => (bookmarkEditor.hidden ? openEditor() : closeEditor()));
  $('[data-bookmark-cancel]').addEventListener('click', () => { closeEditor(); bookmarkAdd.focus(); });
  bookmarkEditor.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = bookmarkName.value.trim();
    const url = normalizeUrl(bookmarkUrl.value);
    if (!name || !url) { bookmarkError.textContent = '名前と有効なウェブURLを入力してください。'; return; }
    const bookmarks = readBookmarks();
    if (bookmarks.length >= MAX_BOOKMARKS) return;
    save(BOOKMARKS_KEY, [...bookmarks.filter((item) => item.url !== url), {name, url}], 'bookmarks');
    closeEditor();
    renderBookmarks();
    (bookmarkAdd.disabled ? (bookmarkGrid.querySelector('.search-bookmark:last-child a') || input) : bookmarkAdd).focus();
  });
  addEventListener('zero:browserdatachange', (event) => {
    if (event.detail?.source === 'toolbar-search' || !dialog.open) return;
    renderSettings();
    renderRecent();
    renderBookmarks();
  });
  addEventListener('storage', (event) => {
    if (!dialog.open) return;
    if (event.key === SETTINGS_KEY) renderSettings();
    if (event.key === RECENT_KEY) renderRecent();
    if (event.key === BOOKMARKS_KEY) renderBookmarks();
  });
  site.openSearch = () => setOpen(true);
})();
