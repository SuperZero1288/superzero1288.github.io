(() => {
  'use strict';

  const OWNER = 'SuperZero1288';
  const REPOSITORY = 'Zeroichiba-Workshop';
  const BRANCH = 'main';
  const API_TREE = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`;
  const RAW_ROOT = `https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}/${BRANCH}`;
  const REPOSITORY_URL = `https://github.com/${OWNER}/${REPOSITORY}`;
  const collator = new Intl.Collator('ja', {numeric:true, sensitivity:'base'});
  const elements = {
    back: document.getElementById('catalogBack'),
    backLabel: document.getElementById('catalogBackLabel'),
    refresh: document.getElementById('catalogRefresh'),
    meta: document.getElementById('catalogContentMeta'),
    files: document.getElementById('catalogFileList'),
    status: document.getElementById('catalogStatus')
  };

  let entries = [];
  let entriesByPath = new Map();
  let currentPath = '';
  let currentAssetPath = '';
  let history = [];
  let treeLoadGeneration = 0;
  let assetLoadGeneration = 0;

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[character]);
  const entryName = (entry) => entry.path.split('/').pop() || '';
  const displayName = (entry) => entryName(entry).replace(/\.(?:cat|ast)$/i, '');
  const parentPath = (path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const encodedPath = (path) => path.split('/').map((part) => encodeURIComponent(part)).join('/');
  const rawURL = (path) => `${RAW_ROOT}/${encodedPath(path)}`;
  const formatSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
  };
  const isCategory = (entry) => entry.type === 'tree' && entryName(entry).toLowerCase().endsWith('.cat');
  const isAsset = (entry) => entry.type === 'tree' && entryName(entry).toLowerCase().endsWith('.ast');
  const directChildren = (path) => {
    const prefix = path ? `${path}/` : '';
    return entries.filter((entry) => {
      if (!entry.path.startsWith(prefix)) return false;
      return !entry.path.slice(prefix.length).includes('/');
    });
  };
  const directCategories = (path) => directChildren(path).filter(isCategory).sort((a,b) => collator.compare(displayName(a), displayName(b)));
  const directAssets = (path) => directChildren(path).filter(isAsset).sort((a,b) => collator.compare(displayName(a), displayName(b)));
  const assetPictures = (path) => entries.filter((entry) => {
    if (entry.type !== 'blob' || parentPath(entry.path) !== path) return false;
    return /\.(?:png|jpe?g|webp|gif|avif)$/i.test(entryName(entry));
  }).sort((a,b) => collator.compare(entryName(a), entryName(b)));
  const assetDownloads = (path) => entries.filter((entry) => entry.type === 'blob' && entry.path.startsWith(`${path}/Distribution/`))
    .sort((a,b) => collator.compare(entryName(a), entryName(b)));

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('catalog-error', isError);
  }

  function animateView() {
    elements.files.classList.remove('is-entering');
    void elements.files.offsetWidth;
    elements.files.classList.add('is-entering');
  }

  function categoryArtwork(category) {
    const name = displayName(category).toLowerCase();
    const rootCategory = (category.path.split('/')[0] || '').toLowerCase();
    if (rootCategory.includes('world') || name.includes('world')) {
      return '<svg viewBox="0 0 120 120" focusable="false" aria-hidden="true"><circle cx="60" cy="60" r="38"/><path d="M22 60h76M60 22c14 13 21 26 21 38s-7 25-21 38M60 22C46 35 39 48 39 60s7 25 21 38M29 39h62M29 81h62"/></svg>';
    }
    return '<svg viewBox="0 0 120 120" focusable="false" aria-hidden="true"><circle cx="60" cy="42" r="17"/><path d="M25 99c3-21 16-32 35-32s32 11 35 32"/><circle class="catalog-art-spark" cx="93" cy="27" r="5"/></svg>';
  }

  function makeCategoryCard(category) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'catalog-category-card card-hover-target';
    card.dataset.openCategory = category.path;
    card.dataset.kind = displayName(category).toLowerCase().includes('world') ? 'world' : 'avatar';
    const artwork = document.createElement('span');
    artwork.className = 'catalog-category-artwork';
    artwork.innerHTML = categoryArtwork(category);
    const copy = document.createElement('span');
    copy.className = 'catalog-category-copy';
    const title = document.createElement('strong');
    title.textContent = displayName(category);
    const affordance = document.createElement('span');
    affordance.className = 'catalog-card-arrow';
    affordance.setAttribute('aria-hidden', 'true');
    affordance.textContent = '↗';
    copy.append(title);
    card.append(artwork, copy, affordance);
    return card;
  }

  function makeAssetCard(entry, type) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `catalog-item-card is-${type} card-hover-target`;
    if (type === 'category') card.dataset.openCategory = entry.path;
    else card.dataset.openAsset = entry.path;
    const picture = type === 'asset' ? assetPictures(entry.path)[0] : null;
    const art = document.createElement('span');
    art.className = 'catalog-item-art';
    if (picture) {
      const image = document.createElement('img');
      image.src = rawURL(picture.path);
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      art.append(image);
    } else if (type === 'category') {
      art.classList.add('has-category-art');
      art.innerHTML = categoryArtwork(entry);
    } else {
      art.textContent = '◇';
      art.setAttribute('aria-hidden', 'true');
    }
    const copy = document.createElement('span');
    copy.className = 'catalog-item-copy';
    const title = document.createElement('strong');
    title.textContent = displayName(entry);
    const note = document.createElement('small');
    note.textContent = type === 'category'
      ? `${directCategories(entry.path).length + directAssets(entry.path).length} items`
      : `${assetDownloads(entry.path).length} download${assetDownloads(entry.path).length === 1 ? '' : 's'}`;
    copy.append(title, note);
    card.append(art, copy);
    return card;
  }

  function renderDirectory() {
    const categories = directCategories(currentPath);
    const assets = directAssets(currentPath);
    elements.files.replaceChildren();

    if (!currentPath) {
      elements.meta.textContent = '';
      const landing = document.createElement('div');
      landing.className = 'catalog-landing';
      const grid = document.createElement('div');
      grid.className = 'catalog-category-grid';
      if (categories.length === 2) grid.classList.add('has-divider');
      categories.forEach((category) => grid.append(makeCategoryCard(category)));
      landing.append(grid);
      elements.files.append(landing);
    } else {
      const titleRow = document.createElement('header');
      titleRow.className = 'catalog-section-title';
      const title = document.createElement('h3');
      title.textContent = displayName(entriesByPath.get(currentPath) || {path:currentPath});
      const count = document.createElement('span');
      count.textContent = `${categories.length + assets.length} items`;
      titleRow.append(title, count);
      elements.meta.textContent = '';
      elements.files.append(titleRow);
      const grid = document.createElement('div');
      grid.className = 'catalog-item-grid';
      categories.forEach((entry) => grid.append(makeAssetCard(entry, 'category')));
      assets.forEach((entry) => grid.append(makeAssetCard(entry, 'asset')));
      if (categories.length || assets.length) elements.files.append(grid);
      else {
        const empty = document.createElement('div');
        empty.className = 'catalog-empty-state';
        empty.innerHTML = '<strong>このコレクションには、まだアイテムがありません</strong><p>新しいアセットが追加されると、ここに表示されます。</p>';
        elements.files.append(empty);
      }
    }
    animateView();
  }

  function renderInline(markdown) {
    const links = [];
    let source = String(markdown).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, href) => {
      try {
        const url = new URL(href);
        if (!['http:', 'https:'].includes(url.protocol)) return match;
        const token = `@@CATALOG_LINK_${links.length}@@`;
        links.push(`<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}</a>`);
        return token;
      } catch { return match; }
    });
    source = escapeHTML(source)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    links.forEach((link, index) => { source = source.replace(`@@CATALOG_LINK_${index}@@`, link); });
    return source;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown ?? '').replace(/\r/g, '').split('\n');
    const output = [];
    let paragraph = [];
    let listType = '';
    const flushParagraph = () => {
      if (!paragraph.length) return;
      output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (listType) output.push(`</${listType}>`);
      listType = '';
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flushParagraph(); closeList(); continue; }
      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      const list = trimmed.match(/^([-*+]\s+|\d+\.\s+)(.+)$/);
      if (heading) {
        flushParagraph(); closeList();
        const level = Math.min(heading[1].length + 1, 4);
        output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      } else if (/^---+$/.test(trimmed)) {
        flushParagraph(); closeList(); output.push('<hr>');
      } else if (list) {
        flushParagraph();
        const nextType = /^\d/.test(list[1]) ? 'ol' : 'ul';
        if (listType !== nextType) { closeList(); listType = nextType; output.push(`<${listType}>`); }
        output.push(`<li>${renderInline(list[2])}</li>`);
      } else if (trimmed.startsWith('> ')) {
        flushParagraph(); closeList(); output.push(`<blockquote>${renderInline(trimmed.slice(2))}</blockquote>`);
      } else {
        closeList(); paragraph.push(trimmed);
      }
    }
    flushParagraph(); closeList();
    return output.join('');
  }

  function parseInfo(text, fallbackName) {
    const sections = String(text ?? '').replace(/\r/g, '').split(/^\s*-{2,}\s*$/m);
    const overview = (sections[0] || '').trim();
    const titleMatch = overview.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : fallbackName;
    const description = titleMatch ? overview.replace(titleMatch[0], '').trim() : overview;
    const dependencyLines = (sections[1] || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const dependencies = dependencyLines.map((line) => {
      const normalized = line.replace(/^[-*+]\s+/, '');
      const match = normalized.match(/^(.+?)\s*:\s*([yYnN])\s*$/);
      if (!match) return null;
      return {name:match[1].trim(), enabled:match[2].toLowerCase() === 'y'};
    }).filter(Boolean);
    return {title, description, dependencies, related:(sections.slice(2).join('\n\n').trim())};
  }

  function renderAssetDetail(asset) {
    const assetPath = asset.path;
    const generation = ++assetLoadGeneration;
    elements.files.innerHTML = '<div class="catalog-empty-state"><span class="catalog-spinner" aria-hidden="true"></span><strong>アセット情報を読み込んでいます</strong><p>info.txtと画像を確認しています。</p></div>';
    elements.meta.textContent = '';
    setStatus('アセットの説明とダウンロード項目を読み込んでいます。');

    const infoFile = directChildren(assetPath).find((entry) => entry.type === 'blob' && entryName(entry).toLowerCase() === 'info.txt');
    const pictures = assetPictures(assetPath);
    const downloads = assetDownloads(assetPath);
    const infoPromise = infoFile ? fetch(rawURL(infoFile.path), {cache:'no-store'}).then((response) => {
      if (!response.ok) throw new Error(`info.txt を取得できませんでした (${response.status})`);
      return response.text();
    }) : Promise.resolve('');

    infoPromise.then((rawInfo) => {
      if (generation !== assetLoadGeneration || currentAssetPath !== assetPath) return;
      const info = parseInfo(rawInfo, displayName(asset));
      const detail = document.createElement('article');
      detail.className = 'catalog-detail';

      const heading = document.createElement('header');
      heading.className = 'catalog-detail-heading';
      const titleGroup = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = info.title;
      const pathLabel = document.createElement('p');
      pathLabel.textContent = `${REPOSITORY}/${assetPath}`;
      titleGroup.append(title, pathLabel);
      heading.append(titleGroup);
      detail.append(heading);

      if (pictures.length) {
        const gallery = document.createElement('div');
        gallery.className = 'catalog-picture-grid';
        pictures.forEach((picture) => {
          const link = document.createElement('a');
          link.className = 'catalog-picture';
          link.href = rawURL(picture.path);
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.setAttribute('aria-label', `${entryName(picture)}を別タブで表示`);
          const image = document.createElement('img');
          image.src = rawURL(picture.path);
          image.alt = entryName(picture);
          image.loading = 'lazy';
          image.referrerPolicy = 'no-referrer';
          link.append(image);
          gallery.append(link);
        });
        detail.append(gallery);
      }

      if (info.description) {
        const section = document.createElement('section');
        section.className = 'catalog-detail-section';
        section.innerHTML = `<h4>説明</h4><div class="catalog-markdown">${renderMarkdown(info.description)}</div>`;
        detail.append(section);
      }

      if (info.dependencies.length) {
        const section = document.createElement('section');
        section.className = 'catalog-detail-section';
        const titleEl = document.createElement('h4');
        titleEl.textContent = '必須パッケージ・仕様';
        const list = document.createElement('ul');
        list.className = 'catalog-dependency-list';
        info.dependencies.forEach((dependency) => {
          const item = document.createElement('li');
          item.className = 'catalog-dependency';
          const label = document.createElement('span');
          label.textContent = dependency.name;
          const status = document.createElement('span');
          status.className = `catalog-dependency-status${dependency.enabled ? '' : ' is-no'}`;
          const isIncluded = /include|included|format|同梱|含む/i.test(dependency.name);
          status.textContent = dependency.enabled ? (isIncluded ? 'あり' : '必要') : (isIncluded ? 'なし' : '不要');
          item.append(label, status);
          list.append(item);
        });
        section.append(titleEl, list);
        detail.append(section);
      }

      if (info.related) {
        const section = document.createElement('section');
        section.className = 'catalog-detail-section';
        section.innerHTML = `<h4>関連リンク</h4><div class="catalog-markdown catalog-related">${renderMarkdown(info.related)}</div>`;
        detail.append(section);
      }

      const distribution = document.createElement('section');
      distribution.className = 'catalog-detail-section';
      const distributionHeading = document.createElement('h4');
      distributionHeading.textContent = 'ダウンロード';
      distribution.append(distributionHeading);
      if (downloads.length) {
        const list = document.createElement('ul');
        list.className = 'catalog-download-list';
        downloads.forEach((file) => {
          const item = document.createElement('li');
          item.className = 'catalog-download';
          const fileName = document.createElement('span');
          fileName.className = 'catalog-download-name';
          fileName.textContent = entryName(file);
          const meta = document.createElement('span');
          meta.className = 'catalog-row-size';
          meta.textContent = formatSize(file.size);
          const link = document.createElement('a');
          link.className = 'catalog-download-link';
          link.href = `${REPOSITORY_URL}/raw/refs/heads/${encodeURIComponent(BRANCH)}/${encodedPath(file.path)}?download=1`;
          link.textContent = 'ダウンロード';
          link.setAttribute('aria-label', `${entryName(file)}をダウンロード`);
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.append(fileName, meta, link);
          list.append(item);
        });
        distribution.append(list);
      } else {
        const empty = document.createElement('p');
        empty.className = 'catalog-license-note';
        empty.textContent = 'Distributionフォルダに配布ファイルはありません。';
        distribution.append(empty);
      }
      if (!rawInfo) {
        const note = document.createElement('p');
        note.className = 'catalog-license-note';
        note.textContent = 'info.txt がまだありません。アセットの説明・条件は準備中です。';
        distribution.append(note);
      }
      detail.append(distribution);

      elements.files.replaceChildren(detail);
      animateView();
      setStatus(`${pictures.length} 枚の画像、${downloads.length} 件の配布ファイルを確認しました。`);
    }).catch((error) => {
      if (generation !== assetLoadGeneration || currentAssetPath !== assetPath) return;
      elements.files.innerHTML = '<div class="catalog-empty-state"><strong>アセット情報を読み込めませんでした</strong><p>GitHubへの接続を確認して、再読み込みしてください。</p></div>';
      setStatus(error.message || 'アセット情報の取得に失敗しました。', true);
    });
  }

  function renderCurrent() {
    elements.back.disabled = history.length === 0;
    elements.backLabel.textContent = currentAssetPath ? 'カテゴリに戻る' : (currentPath ? '前の画面へ' : 'カテゴリ一覧');
    if (currentAssetPath) {
      const asset = entriesByPath.get(currentAssetPath);
      if (asset) renderAssetDetail(asset);
      else { currentAssetPath = ''; renderDirectory(); }
    } else {
      renderDirectory();
    }
  }

  function navigateTo(path, assetPath) {
    if (path === currentPath && (assetPath || '') === currentAssetPath) return;
    history.push({path:currentPath, asset:currentAssetPath});
    currentPath = path;
    currentAssetPath = assetPath || '';
    renderCurrent();
  }

  async function loadCatalog() {
    const generation = ++treeLoadGeneration;
    elements.refresh.disabled = true;
    setStatus('GitHubからカテゴリとアセットの一覧を取得しています。');
    elements.files.innerHTML = '<div class="catalog-empty-state"><span class="catalog-spinner" aria-hidden="true"></span><strong>カタログを読み込んでいます</strong><p>GitHubの配布リポジトリを確認しています。</p></div>';
    try {
      const response = await fetch(API_TREE, {headers:{Accept:'application/vnd.github+json'}, cache:'no-store'});
      if (!response.ok) {
        if (response.status === 403) throw new Error('GitHub APIのアクセス上限に達したようです。しばらく待ってから再読み込みしてください。');
        if (response.status === 404) throw new Error('リポジトリまたは main ブランチが見つかりません。公開設定とブランチ名を確認してください。');
        throw new Error(`GitHubから一覧を取得できませんでした (HTTP ${response.status})`);
      }
      const data = await response.json();
      if (generation !== treeLoadGeneration) return;
      if (!Array.isArray(data.tree)) throw new Error('GitHubから想定外の形式の一覧が返されました。');
      entries = data.tree;
      entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
      history = [];
      if (data.truncated) setStatus('一覧の一部がGitHub APIの上限により省略されています。');
      else setStatus(`${directCategories('').length} 個のカテゴリを読み込みました。`);
      if (currentAssetPath && !entriesByPath.has(currentAssetPath)) currentAssetPath = '';
      if (currentPath && !entriesByPath.has(currentPath)) currentPath = '';
      renderCurrent();
    } catch (error) {
      if (generation !== treeLoadGeneration) return;
      entries = [];
      entriesByPath = new Map();
      elements.files.innerHTML = `<div class="catalog-empty-state"><strong>カタログに接続できませんでした</strong><p>${escapeHTML(error.message || 'ネットワーク接続を確認してください。')}</p><a class="catalog-download-link" href="${REPOSITORY_URL}" target="_blank" rel="noopener noreferrer">GitHubでリポジトリを開く ↗</a></div>`;
      elements.meta.textContent = '';
      setStatus('リポジトリが公開されているか、ネットワーク接続を確認してください。', true);
    } finally {
      if (generation === treeLoadGeneration) elements.refresh.disabled = false;
    }
  }

  elements.back.addEventListener('click', () => {
    const previous = history.pop();
    if (!previous) return;
    currentPath = previous.path;
    currentAssetPath = previous.asset;
    renderCurrent();
  });
  elements.refresh.addEventListener('click', loadCatalog);
  elements.files.addEventListener('click', (event) => {
    const category = event.target.closest('[data-open-category]');
    const asset = event.target.closest('[data-open-asset]');
    if (category) navigateTo(category.dataset.openCategory, '');
    else if (asset) navigateTo(parentPath(asset.dataset.openAsset), asset.dataset.openAsset);
  });

  loadCatalog();
})();

