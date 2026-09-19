(() => {
  const toggle = document.querySelector('.floating-search-toggle');
  const statusBar = document.querySelector('.floating-status-bar');
  if (!toggle || !statusBar || document.querySelector('.floating-search-panel')) return;

  const OPEN_KEY = 'zero-floating-search-open';
  const SETTINGS_KEY = 'zero-browser-settings';
  const RECENT_KEY = 'zero-browser-recent';
  const BOOKMARKS_KEY = 'zero-browser-bookmarks';
  const MAX_BOOKMARKS = 12;
  const ENGINES = {
    google: { label: 'Google', action: 'https://www.google.com/search', parameter: 'q', icon: '/assets/search-engines/google.svg' },
    duckduckgo: { label: 'DuckDuckGo', action: 'https://duckduckgo.com/', parameter: 'q', icon: '/assets/search-engines/duckduckgo.svg' },
    brave: { label: 'Brave', action: 'https://search.brave.com/search', parameter: 'q', icon: '/assets/search-engines/brave.svg' },
    bing: { label: 'Bing', action: 'https://www.bing.com/search', parameter: 'q', icon: '/assets/search-engines/bing.svg' },
    mojeek: { label: 'Mojeek', action: 'https://www.mojeek.com/search', parameter: 'q', icon: '/assets/search-engines/mojeek.svg' }
  };

  const panel = document.createElement('section');
  panel.className = 'floating-search-panel';
  panel.setAttribute('aria-label', '新しいタブ');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="floating-search-surface">
      <header class="floating-search-heading">
        <span>NEW TAB</span>
        <h2>Googleで検索</h2>
      </header>
      <form class="floating-search-form" role="search">
        <div class="floating-search-box">
          <img class="floating-search-engine-icon" src="${ENGINES.google.icon}" alt="">
          <input type="search" name="q" placeholder="Googleで検索" aria-label="Googleで検索" autocomplete="off">
          <button type="submit" aria-label="検索を実行">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 14 0M14 7l5 5-5 5"></path></svg>
          </button>
        </div>
        <div class="floating-search-options">
          <label>
            <span>検索エンジン</span>
            <select name="engine" aria-label="検索エンジン">
              <option value="google">Google</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="brave">Brave</option>
              <option value="bing">Bing</option>
              <option value="mojeek">Mojeek</option>
            </select>
          </label>
          <span class="floating-search-open-mode"></span>
        </div>
        <div class="floating-search-recent" aria-label="最近の検索"></div>
      </form>
      <section class="floating-bookmarks" aria-labelledby="floating-bookmarks-title">
        <div class="floating-bookmarks-heading">
          <div>
            <span>SHORTCUTS</span>
            <h3 id="floating-bookmarks-title">ブックマーク</h3>
          </div>
          <button class="floating-bookmark-add" type="button" aria-expanded="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
            追加
          </button>
        </div>
        <form class="floating-bookmark-editor" hidden>
          <label><span>名前</span><input name="bookmarkName" maxlength="40" autocomplete="off" placeholder="サイト名" required></label>
          <label><span>URL</span><input name="bookmarkUrl" inputmode="url" autocomplete="url" placeholder="https://example.com" required></label>
          <div class="floating-bookmark-editor-actions">
            <button type="button" data-bookmark-cancel>キャンセル</button>
            <button type="submit">保存</button>
          </div>
          <p class="floating-bookmark-error" role="alert"></p>
        </form>
        <div class="floating-bookmark-grid"></div>
        <p class="floating-bookmark-empty">よく見るページをここへ保存できます。</p>
      </section>
    </div>`;
  statusBar.insertAdjacentElement('afterend', panel);

  const searchForm = panel.querySelector('.floating-search-form');
  const searchHeading = panel.querySelector('.floating-search-heading h2');
  const input = searchForm.querySelector('input[type="search"]');
  const engineSelect = searchForm.querySelector('[name="engine"]');
  const engineIcon = panel.querySelector('.floating-search-engine-icon');
  const openModeText = panel.querySelector('.floating-search-open-mode');
  const recentList = panel.querySelector('.floating-search-recent');
  const bookmarkGrid = panel.querySelector('.floating-bookmark-grid');
  const bookmarkEmpty = panel.querySelector('.floating-bookmark-empty');
  const bookmarkAdd = panel.querySelector('.floating-bookmark-add');
  const bookmarkEditor = panel.querySelector('.floating-bookmark-editor');
  const bookmarkName = bookmarkEditor.elements.bookmarkName;
  const bookmarkUrl = bookmarkEditor.elements.bookmarkUrl;
  const bookmarkError = panel.querySelector('.floating-bookmark-error');
  const bookmarkCancel = panel.querySelector('[data-bookmark-cancel]');
  let isOpen = false;

  const readSettings = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        engine: ENGINES[saved.engine] ? saved.engine : 'google',
        openMode: saved.openMode === 'current' ? 'current' : 'new'
      };
    } catch {
      return { engine: 'google', openMode: 'new' };
    }
  };

  const readRecent = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(item => typeof item === 'string').slice(0, 6) : [];
    } catch {
      return [];
    }
  };

  const readBookmarks = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(item => item && typeof item.name === 'string' && typeof item.url === 'string').slice(0, MAX_BOOKMARKS);
    } catch {
      return [];
    }
  };

  const announceChange = type => {
    window.dispatchEvent(new CustomEvent('zero:browserdatachange', { detail: { type, source: 'floating-search' } }));
  };

  const saveSettings = () => {
    const current = readSettings();
    const next = { ...current, engine: engineSelect.value };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    announceChange('settings');
  };

  const saveRecent = recent => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
    announceChange('recent');
  };

  const saveBookmarks = bookmarks => {
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks.slice(0, MAX_BOOKMARKS))); } catch {}
    announceChange('bookmarks');
  };

  const renderSettings = () => {
    const settings = readSettings();
    const engine = ENGINES[settings.engine];
    engineSelect.value = settings.engine;
    engineIcon.src = engine.icon;
    searchHeading.textContent = `${engine.label}で検索`;
    input.placeholder = `${engine.label}で検索`;
    input.setAttribute('aria-label', `${engine.label}で検索`);
    openModeText.textContent = settings.openMode === 'current' ? 'このタブで開く' : '新しいタブで開く';
  };

  const runSearch = query => {
    const settings = readSettings();
    const engine = ENGINES[settings.engine] || ENGINES.google;
    const form = document.createElement('form');
    const queryInput = document.createElement('input');
    form.action = engine.action;
    form.method = 'get';
    form.target = settings.openMode === 'current' ? '_self' : '_blank';
    form.rel = 'noopener noreferrer';
    form.hidden = true;
    queryInput.name = engine.parameter;
    queryInput.value = query;
    form.appendChild(queryInput);
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const submitQuery = query => {
    const normalized = query.trim();
    if (!normalized) return;
    const recent = [normalized, ...readRecent().filter(item => item !== normalized)].slice(0, 6);
    saveRecent(recent);
    renderRecent();
    runSearch(normalized);
  };

  function renderRecent() {
    const recent = readRecent();
    recentList.replaceChildren();
    recentList.classList.toggle('is-empty', recent.length === 0);
    if (!recent.length) return;
    const label = document.createElement('span');
    label.className = 'floating-search-recent-label';
    label.textContent = '最近';
    recentList.appendChild(label);
    recent.forEach(query => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = query;
      button.title = `${query} を検索`;
      button.addEventListener('click', () => {
        input.value = query;
        submitQuery(query);
      });
      recentList.appendChild(button);
    });
  }

  const normalizeBookmarkUrl = value => {
    const trimmed = value.trim();
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch {
      return '';
    }
  };

  const closeBookmarkEditor = () => {
    bookmarkEditor.hidden = true;
    bookmarkAdd.setAttribute('aria-expanded', 'false');
    bookmarkError.textContent = '';
    bookmarkEditor.reset();
  };

  const openBookmarkEditor = () => {
    bookmarkEditor.hidden = false;
    bookmarkAdd.setAttribute('aria-expanded', 'true');
    bookmarkError.textContent = readBookmarks().length >= MAX_BOOKMARKS ? `ブックマークは${MAX_BOOKMARKS}件まで保存できます。` : '';
    requestAnimationFrame(() => bookmarkName.focus({ preventScroll: true }));
  };

  function renderBookmarks() {
    const bookmarks = readBookmarks();
    bookmarkGrid.replaceChildren();
    bookmarkEmpty.hidden = bookmarks.length > 0;
    bookmarkAdd.disabled = bookmarks.length >= MAX_BOOKMARKS;
    bookmarks.forEach((bookmark, index) => {
      const item = document.createElement('div');
      item.className = 'floating-bookmark-item';
      const link = document.createElement('a');
      link.href = bookmark.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = bookmark.url;
      const icon = document.createElement('span');
      icon.className = 'floating-bookmark-icon';
      icon.textContent = bookmark.name.trim().charAt(0).toUpperCase() || '↗';
      const name = document.createElement('strong');
      name.textContent = bookmark.name;
      const domain = document.createElement('small');
      try { domain.textContent = new URL(bookmark.url).hostname.replace(/^www\./, ''); } catch { domain.textContent = bookmark.url; }
      link.append(icon, name, domain);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'floating-bookmark-remove';
      remove.setAttribute('aria-label', `${bookmark.name}を削除`);
      remove.title = 'ブックマークを削除';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        const next = readBookmarks();
        next.splice(index, 1);
        saveBookmarks(next);
        renderBookmarks();
      });
      item.append(link, remove);
      bookmarkGrid.appendChild(item);
    });
  }

  const setOpen = (open, { persist = true, focus = false } = {}) => {
    isOpen = Boolean(open);
    panel.classList.toggle('is-open', isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));
    toggle.classList.toggle('is-active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? '新しいタブを閉じる' : '新しいタブを開く');
    document.body.classList.toggle('floating-search-open', isOpen);
    if (persist) {
      try { localStorage.setItem(OPEN_KEY, String(isOpen)); } catch {}
    }
    window.dispatchEvent(new CustomEvent('zero:floatingsearchchange', { detail: { open: isOpen } }));
    if (isOpen) {
      renderSettings();
      renderRecent();
      renderBookmarks();
      if (focus) requestAnimationFrame(() => input.focus({ preventScroll: true }));
    } else closeBookmarkEditor();
  };

  toggle.title = '新しいタブ';
  toggle.setAttribute('aria-label', '新しいタブを開く');
  toggle.addEventListener('click', () => setOpen(!isOpen, { focus: !isOpen }));
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    submitQuery(input.value);
  });
  engineSelect.addEventListener('change', () => {
    saveSettings();
    renderSettings();
  });
  bookmarkAdd.addEventListener('click', () => {
    if (bookmarkEditor.hidden) openBookmarkEditor();
    else closeBookmarkEditor();
  });
  bookmarkCancel.addEventListener('click', closeBookmarkEditor);
  bookmarkEditor.addEventListener('submit', event => {
    event.preventDefault();
    const name = bookmarkName.value.trim();
    const url = normalizeBookmarkUrl(bookmarkUrl.value);
    if (!name || !url) {
      bookmarkError.textContent = '名前と有効なウェブURLを入力してください。';
      return;
    }
    const bookmarks = readBookmarks();
    if (bookmarks.length >= MAX_BOOKMARKS) return;
    saveBookmarks([...bookmarks.filter(item => item.url !== url), { name, url }]);
    closeBookmarkEditor();
    renderBookmarks();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen) return;
    if (!bookmarkEditor.hidden) closeBookmarkEditor();
    else setOpen(false);
  });
  window.addEventListener('zero:browserdatachange', event => {
    if (event.detail?.source === 'floating-search') return;
    renderSettings();
    renderRecent();
    if (event.detail?.type === 'bookmarks') renderBookmarks();
  });
  window.addEventListener('storage', event => {
    if (event.key === SETTINGS_KEY) renderSettings();
    if (event.key === RECENT_KEY) renderRecent();
    if (event.key === BOOKMARKS_KEY) renderBookmarks();
    if (event.key === OPEN_KEY) setOpen(event.newValue === 'true', { persist: false });
  });

  let restoredOpen = false;
  try { restoredOpen = localStorage.getItem(OPEN_KEY) === 'true'; } catch {}
  renderSettings();
  renderRecent();
  renderBookmarks();
  setOpen(restoredOpen, { persist: false });
})();
