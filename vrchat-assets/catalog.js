(() => {
  'use strict';

  const OWNER = 'SuperZero1288';
  const REPOSITORY = 'Zeroichiba-Workshop';
  const BRANCH = 'main';
  const API_TREE = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/git/trees/${BRANCH}?recursive=1`;
  const RAW_ROOT = `https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}/${BRANCH}`;
  const REPOSITORY_URL = `https://github.com/${OWNER}/${REPOSITORY}`;
  const CACHE_KEY = 'zero-workshop-catalog-v1';
  const collator = new Intl.Collator('ja', {numeric: true, sensitivity: 'base'});
  const elements = {
    back: document.getElementById('catalogBack'),
    backLabel: document.getElementById('catalogBackLabel'),
    refresh: document.getElementById('catalogRefresh'),
    breadcrumbs: document.getElementById('catalogBreadcrumbs'),
    summary: document.getElementById('catalogSummary'),
    files: document.getElementById('catalogFileList'),
    status: document.getElementById('catalogStatus')
  };

  let entries = [];
  let entriesByPath = new Map();
  let previews = {};
  let currentPath = '';
  let currentAssetPath = '';
  let treeLoadGeneration = 0;
  let assetLoadGeneration = 0;
  const infoCache = new Map();

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const entryName = (entry) => entry.path.split('/').pop() || '';
  const displayName = (entry) => entryName(entry).replace(/\.(?:cat|ast)$/i, '');
  const parentPath = (path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');
  const rawURL = (path) => `${RAW_ROOT}/${encodedPath(path)}`;
  const isCategory = (entry) => entry?.type === 'tree' && entryName(entry).toLowerCase().endsWith('.cat');
  const isAsset = (entry) => entry?.type === 'tree' && entryName(entry).toLowerCase().endsWith('.ast');
  const sortByName = (a, b) => collator.compare(displayName(a), displayName(b));
  const allAssets = () => entries.filter(isAsset).sort(sortByName);
  const directChildren = (path) => {
    const prefix = path ? `${path}/` : '';
    return entries.filter((entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes('/'));
  };
  const directCategories = (path) => directChildren(path).filter(isCategory).sort(sortByName);
  const directAssets = (path) => directChildren(path).filter(isAsset).sort(sortByName);
  const descendantAssets = (path) => entries.filter((entry) => isAsset(entry) && entry.path.startsWith(`${path}/`));
  const assetPictures = (path) => directChildren(path)
    .filter((entry) => entry.type === 'blob' && /\.(?:png|jpe?g|webp|gif|avif)$/i.test(entryName(entry)))
    .sort((a, b) => collator.compare(entryName(a), entryName(b)));
  const assetDownloads = (path) => entries
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(`${path}/Distribution/`))
    .sort((a, b) => collator.compare(entryName(a), entryName(b)));
  const pathLabel = (path) => path.split('/').map((part) => displayName({path: part})).join(' / ');

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'サイズ不明';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
  }

  function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function externalLink(url, text, className) {
    const link = textElement('a', text, className);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('catalog-error', isError);
  }

  function setBusy(busy) {
    elements.files.setAttribute('aria-busy', String(busy));
  }

  function animateView() {
    elements.files.classList.remove('is-entering');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void elements.files.offsetWidth;
    elements.files.classList.add('is-entering');
  }

  function focusView(focusKey) {
    let target;
    if (focusKey) target = [...elements.files.querySelectorAll('[data-open-category], [data-open-asset]')]
      .find((element) => (element.dataset.openCategory || element.dataset.openAsset) === focusKey);
    target ||= elements.files.querySelector('[data-catalog-focus]');
    if (!target) return;
    window.zeroA11y?.focus(target);
    target.scrollIntoView({block: 'nearest', behavior: 'instant'});
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      return await fetch(url, {...options, signal: controller.signal});
    } finally {
      clearTimeout(timeout);
    }
  }

  function categoryArtwork(category) {
    const name = displayName(category).toLowerCase();
    const root = (category.path.split('/')[0] || '').toLowerCase();
    if (root.includes('world') || name.includes('world')) {
      return '<svg viewBox="0 0 120 120" focusable="false" aria-hidden="true"><circle cx="60" cy="60" r="38"/><path d="M22 60h76M60 22c14 13 21 26 21 38s-7 25-21 38M60 22C46 35 39 48 39 60s7 25 21 38M29 39h62M29 81h62"/></svg>';
    }
    if (category.path.includes('/')) {
      return '<svg viewBox="0 0 120 120" focusable="false" aria-hidden="true"><path d="M20 39V29h30l12 12h38v48H20z"/><path d="M20 41h80"/></svg>';
    }
    return '<svg viewBox="0 0 120 120" focusable="false" aria-hidden="true"><circle cx="60" cy="42" r="17"/><path d="M25 99c3-21 16-32 35-32s32 11 35 32"/><circle class="catalog-art-spark" cx="93" cy="27" r="5"/></svg>';
  }

  function categoryDescription(category) {
    const descriptions = {
      avatar: 'アバター向けのオーラ・モーション',
      world: 'ワールド制作向けのアセット',
      aura: 'アバターを彩るオーラ表現',
      motion: 'AFKや動きの表現を追加',
      udon: 'ワールドの仕組みをつくる'
    };
    return descriptions[displayName(category).toLowerCase()] || 'このカテゴリのアセットを探す';
  }

  function makeCategoryCard(category) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'catalog-category-card';
    card.dataset.openCategory = category.path;
    card.dataset.kind = category.path.toLowerCase().includes('world') ? 'world' : 'avatar';
    const artwork = document.createElement('span');
    artwork.className = 'catalog-category-artwork';
    artwork.setAttribute('aria-hidden', 'true');
    artwork.innerHTML = categoryArtwork(category);
    const copy = document.createElement('span');
    copy.className = 'catalog-category-copy';
    const count = descendantAssets(category.path).length;
    copy.append(textElement('strong', displayName(category)), textElement('span', categoryDescription(category)),
      textElement('small', count ? `${count} アセット` : '配布準備中'));
    const arrow = textElement('span', '→', 'catalog-card-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    card.append(artwork, copy, arrow);
    return card;
  }

  function appendPicture(container, picture, {detail = false, title = ''} = {}) {
    const preview = previews[picture.path];
    const isLocal = preview?.sha === picture.sha && preview.small?.startsWith('/vrchat-assets/previews/')
      && preview.large?.startsWith('/vrchat-assets/previews/');
    const image = document.createElement('img');
    image.alt = detail ? `${title}のプレビュー` : '';
    image.loading = detail ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    if (isLocal) {
      image.src = detail ? preview.large : preview.small;
      image.srcset = `${preview.small} ${preview.smallWidth}w, ${preview.large} ${preview.largeWidth}w`;
      image.sizes = detail ? '(max-width: 760px) calc(100vw - 80px), 640px'
        : '(max-width: 560px) calc(100vw - 80px), (max-width: 1000px) 40vw, 360px';
      image.width = preview.largeWidth;
      image.height = preview.largeHeight;
    } else {
      image.src = rawURL(picture.path);
    }
    let retried = false;
    image.addEventListener('error', () => {
      if (isLocal && !retried) {
        retried = true;
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
        image.src = rawURL(picture.path);
        return;
      }
      image.remove();
      container.append(textElement('span', 'プレビューを表示できません', 'catalog-preview-placeholder'));
    });
    container.append(image);
  }

  function makeAssetCard(asset) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'catalog-item-card';
    card.dataset.openAsset = asset.path;
    card.setAttribute('aria-label', `${displayName(asset)}の詳細を開く`);
    const art = document.createElement('span');
    art.className = 'catalog-item-art';
    const picture = assetPictures(asset.path)[0];
    if (picture) appendPicture(art, picture);
    else art.append(textElement('span', 'プレビュー準備中', 'catalog-preview-placeholder'));
    const copy = document.createElement('span');
    copy.className = 'catalog-item-copy';
    copy.append(textElement('strong', displayName(asset)));
    const meta = document.createElement('span');
    meta.className = 'catalog-item-meta';
    meta.append(textElement('span', pathLabel(parentPath(asset.path))),
      textElement('span', `${assetDownloads(asset.path).length} 配布ファイル`));
    const affordance = textElement('span', '詳細を見る', 'catalog-item-affordance');
    const arrow = textElement('span', '→');
    arrow.setAttribute('aria-hidden', 'true');
    affordance.append(arrow);
    copy.append(meta, affordance);
    card.append(art, copy);
    return card;
  }

  function sectionHeading(title, count, {focus = false} = {}) {
    const header = document.createElement('header');
    header.className = 'catalog-section-title';
    const heading = textElement('h3', title);
    if (focus) { heading.tabIndex = -1; heading.dataset.catalogFocus = ''; }
    header.append(heading, textElement('span', count));
    return header;
  }

  function emptyState(title, message) {
    const state = document.createElement('div');
    state.className = 'catalog-empty-state';
    const heading = textElement('h3', title);
    heading.tabIndex = -1;
    heading.dataset.catalogFocus = '';
    state.append(heading, textElement('p', message));
    return state;
  }

  function renderDirectory() {
    const categories = directCategories(currentPath);
    const assets = currentPath ? directAssets(currentPath) : allAssets();
    const fragment = document.createDocumentFragment();
    if (!currentPath) {
      fragment.append(sectionHeading('カテゴリから探す', `${categories.length} カテゴリ`, {focus: true}));
    } else {
      fragment.append(sectionHeading(displayName({path: currentPath}),
        `${descendantAssets(currentPath).length} アセット`, {focus: true}));
    }
    if (categories.length) {
      const grid = document.createElement('div');
      grid.className = 'catalog-category-grid';
      categories.forEach((category) => grid.append(makeCategoryCard(category)));
      fragment.append(grid);
    }
    if (assets.length) {
      if (!currentPath || categories.length) fragment.append(sectionHeading(currentPath ? 'このカテゴリのアセット' : 'すべてのアセット', `${assets.length} 件`));
      const grid = document.createElement('div');
      grid.className = 'catalog-item-grid';
      assets.forEach((asset) => grid.append(makeAssetCard(asset)));
      fragment.append(grid);
    }
    if (!categories.length && !assets.length) {
      fragment.append(emptyState('アセットは準備中です', '新しいアセットが公開されると、このカテゴリに表示されます。'));
    }
    elements.files.replaceChildren(fragment);
    setBusy(false);
    animateView();
  }

  // Public info.txt supports a small, escaped Markdown subset. Never insert raw repository HTML.
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
    const dependencyLines = (sections[1] || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const dependencies = dependencyLines.map((line) => {
      const match = line.replace(/^[-*+]\s+/, '').match(/^(.+?)\s*:\s*([yYnN])\s*$/);
      return match ? {name: match[1].trim(), enabled: match[2].toLowerCase() === 'y'} : null;
    }).filter(Boolean);
    return {
      title: titleMatch ? titleMatch[1].trim() : fallbackName,
      description: titleMatch ? overview.replace(titleMatch[0], '').trim() : overview,
      dependencies, related: sections.slice(2).join('\n\n').trim()
    };
  }

  function markdownSection(title, markdown) {
    const section = document.createElement('section');
    section.className = 'catalog-detail-section';
    section.append(textElement('h4', title));
    const body = document.createElement('div');
    body.className = 'catalog-markdown';
    body.innerHTML = renderMarkdown(markdown);
    section.append(body);
    return section;
  }

  function dependencySection(dependencies) {
    const section = document.createElement('section');
    section.className = 'catalog-detail-section';
    section.append(textElement('h4', '必須パッケージ・仕様'));
    const list = document.createElement('ul');
    list.className = 'catalog-dependency-list';
    dependencies.forEach((dependency) => {
      const item = document.createElement('li');
      item.className = 'catalog-dependency';
      const included = /include|included|format|同梱|含む/i.test(dependency.name);
      const label = dependency.enabled ? (included ? 'あり' : '必要') : (included ? 'なし' : '不要');
      item.append(textElement('span', dependency.name),
        textElement('span', label, `catalog-dependency-status${dependency.enabled ? '' : ' is-no'}`));
      list.append(item);
    });
    section.append(list);
    return section;
  }

  function distributionSection(asset) {
    const files = assetDownloads(asset.path);
    const section = document.createElement('section');
    section.id = 'catalogDownloads';
    section.className = 'catalog-detail-section catalog-distribution';
    section.tabIndex = -1;
    section.setAttribute('aria-labelledby', 'catalogDownloadsHeading');
    const title = textElement('h4', 'ダウンロード');
    title.id = 'catalogDownloadsHeading';
    section.append(title, textElement('p', `${files.length} 件の配布ファイル。GitHubからダウンロードします。`));
    const list = document.createElement('ul');
    list.className = 'catalog-download-list';
    files.forEach((file) => {
      const item = document.createElement('li');
      item.className = 'catalog-download';
      const meta = document.createElement('div');
      meta.className = 'catalog-download-meta';
      const extension = entryName(file).split('.').at(-1).toUpperCase();
      meta.append(textElement('span', extension, 'catalog-file-format'), textElement('span', formatSize(file.size), 'catalog-row-size'));
      const link = externalLink(`${REPOSITORY_URL}/raw/refs/heads/${BRANCH}/${encodedPath(file.path)}?download=1`,
        'ダウンロード ↗', 'catalog-download-link');
      link.setAttribute('aria-label', `${entryName(file)}をダウンロード（新しいタブ）`);
      item.append(textElement('span', entryName(file), 'catalog-download-name'), meta, link);
      list.append(item);
    });
    section.append(list);
    if (!files.length) section.append(textElement('p', '配布ファイルはまだありません。', 'catalog-license-note'));
    section.append(textElement('p', '導入前に、アセットの説明と必須パッケージを確認してください。', 'catalog-license-note'),
      externalLink(`${REPOSITORY_URL}/tree/${BRANCH}/${encodedPath(asset.path)}`, '配布元のフォルダを見る ↗', 'catalog-source-link'));
    return section;
  }

  function renderAssetDetail(asset) {
    const generation = ++assetLoadGeneration;
    const detail = document.createElement('article');
    detail.className = 'catalog-detail';
    const heading = document.createElement('header');
    heading.className = 'catalog-detail-heading';
    const titleGroup = document.createElement('div');
    const title = textElement('h3', displayName(asset));
    title.tabIndex = -1;
    title.dataset.catalogFocus = '';
    titleGroup.append(title, textElement('p', pathLabel(parentPath(asset.path))));
    heading.append(titleGroup);
    const jump = textElement('button', 'ダウンロードへ ↓', 'catalog-primary-link');
    jump.type = 'button';
    heading.append(jump);
    const grid = document.createElement('div');
    grid.className = 'catalog-detail-grid';
    const main = document.createElement('div');
    main.className = 'catalog-detail-main';
    const pictures = assetPictures(asset.path);
    if (pictures.length) {
      const gallery = document.createElement('div');
      gallery.className = 'catalog-picture-grid';
      pictures.forEach((picture, index) => {
        const link = externalLink(rawURL(picture.path), '', 'catalog-picture');
        link.setAttribute('aria-label', `${displayName(asset)}のプレビュー ${index + 1} を原寸で表示（新しいタブ）`);
        appendPicture(link, picture, {detail: true, title: displayName(asset)});
        gallery.append(link);
      });
      main.append(gallery);
    }
    const infoSections = document.createElement('div');
    infoSections.className = 'catalog-info-sections';
    infoSections.setAttribute('aria-busy', 'true');
    const loading = textElement('div', '説明と必須パッケージを読み込んでいます', 'catalog-info-loading');
    const spinner = document.createElement('span');
    spinner.className = 'catalog-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    loading.prepend(spinner);
    infoSections.append(loading);
    main.append(infoSections);
    const distribution = distributionSection(asset);
    grid.append(main, distribution);
    detail.append(heading, grid);
    elements.files.replaceChildren(detail);
    setBusy(false);
    animateView();
    jump.addEventListener('click', () => {
      const target = distribution.querySelector('.catalog-download-link') || distribution;
      window.zeroA11y?.focus(target);
      target.scrollIntoView({block: 'nearest', behavior: window.zeroA11y?.reducedMotion ? 'instant' : 'smooth'});
    });

    const infoFile = directChildren(asset.path).find((entry) => entry.type === 'blob' && entryName(entry).toLowerCase() === 'info.txt');
    const readInfo = async () => {
      if (!infoFile) return '';
      if (infoCache.has(infoFile.sha)) return infoCache.get(infoFile.sha);
      const response = await fetchWithTimeout(`${rawURL(infoFile.path)}?v=${infoFile.sha}`);
      if (!response.ok) throw new Error(`説明を取得できませんでした (HTTP ${response.status})`);
      const text = await response.text();
      infoCache.set(infoFile.sha, text);
      return text;
    };
    readInfo().then((rawInfo) => {
      if (generation !== assetLoadGeneration || currentAssetPath !== asset.path) return;
      const info = parseInfo(rawInfo, displayName(asset));
      title.textContent = info.title;
      const fragment = document.createDocumentFragment();
      if (info.description) fragment.append(markdownSection('このアセットについて', info.description));
      if (info.dependencies.length) fragment.append(dependencySection(info.dependencies));
      if (info.related) fragment.append(markdownSection('関連リンク', info.related));
      if (!rawInfo) fragment.append(markdownSection('説明は準備中です', '導入方法・利用条件は、配布元のフォルダをご確認ください。'));
      infoSections.replaceChildren(fragment);
      infoSections.setAttribute('aria-busy', 'false');
      setStatus(`${info.title} — ${assetDownloads(asset.path).length} 件の配布ファイル`);
    }).catch(() => {
      if (generation !== assetLoadGeneration || currentAssetPath !== asset.path) return;
      const note = markdownSection('説明を読み込めませんでした', '説明の取得に失敗しました。配布ファイルと配布元のリンクは引き続き利用できます。');
      const retry = textElement('button', '説明を再読み込み', 'catalog-retry-button');
      retry.type = 'button';
      retry.addEventListener('click', () => { renderAssetDetail(asset); focusView(); });
      note.append(retry);
      infoSections.replaceChildren(note);
      infoSections.setAttribute('aria-busy', 'false');
      setStatus('説明の取得に失敗しました。再読み込みするか、配布元をご確認ください。', true);
    });
  }

  function stateFromURL() {
    const params = new URLSearchParams(location.search);
    const asset = params.get('asset') || '';
    const category = params.get('category') || '';
    if (isAsset(entriesByPath.get(asset))) return {path: parentPath(asset), asset};
    if (isCategory(entriesByPath.get(category))) return {path: category, asset: ''};
    return {path: '', asset: ''};
  }

  function updateURL({replace = false, depth, focusKey = ''} = {}) {
    const url = new URL(location.href);
    url.searchParams.delete('category');
    url.searchParams.delete('asset');
    if (currentAssetPath) url.searchParams.set('asset', currentAssetPath);
    else if (currentPath) url.searchParams.set('category', currentPath);
    const previousState = window.history.state || {};
    const state = {...previousState, zeroCatalog: {depth: depth ?? previousState.zeroCatalog?.depth ?? 0, focusKey}};
    window.history[replace ? 'replaceState' : 'pushState'](state, '', url);
  }

  function renderBreadcrumbs() {
    const fragment = document.createDocumentFragment();
    const add = (label, path, current) => {
      if (fragment.childNodes.length) {
        const separator = textElement('span', '/', 'catalog-breadcrumb-separator');
        separator.setAttribute('aria-hidden', 'true');
        fragment.append(separator);
      }
      if (current) {
        const item = textElement('span', label);
        item.setAttribute('aria-current', 'page');
        fragment.append(item);
      } else {
        const button = textElement('button', label);
        button.type = 'button';
        button.dataset.catalogPath = path;
        fragment.append(button);
      }
    };
    add('ライブラリ', '', !currentPath && !currentAssetPath);
    const parts = currentPath.split('/').filter(Boolean);
    parts.forEach((part, index) => add(displayName({path: part}), parts.slice(0, index + 1).join('/'),
      index === parts.length - 1 && !currentAssetPath));
    if (currentAssetPath) add(displayName({path: currentAssetPath}), '', true);
    elements.breadcrumbs.replaceChildren(fragment);
    elements.breadcrumbs.scrollLeft = elements.breadcrumbs.scrollWidth;
    elements.back.disabled = !currentPath && !currentAssetPath && !(window.history.state?.zeroCatalog?.depth > 0);
    elements.backLabel.textContent = currentAssetPath ? 'カテゴリへ' : '戻る';
    elements.back.setAttribute('aria-label', currentAssetPath ? 'アセットを選んだ画面へ戻る' : '前のカテゴリへ戻る');
  }

  function renderCurrent({focus = false, focusKey = ''} = {}) {
    ++assetLoadGeneration;
    elements.files.scrollTop = 0;
    renderBreadcrumbs();
    if (currentAssetPath) renderAssetDetail(entriesByPath.get(currentAssetPath));
    else {
      renderDirectory();
      setStatus(currentPath ? `${pathLabel(currentPath)} — ${descendantAssets(currentPath).length} アセット`
        : '公開リポジトリの配布情報を表示しています。');
    }
    if (focus) focusView(focusKey);
  }

  function navigateTo(path, asset = '', {returnTarget = ''} = {}) {
    if (path === currentPath && asset === currentAssetPath) return;
    if (path && !isCategory(entriesByPath.get(path))) return;
    if (asset && !isAsset(entriesByPath.get(asset))) return;
    const depth = window.history.state?.zeroCatalog?.depth || 0;
    updateURL({replace: true, depth, focusKey: returnTarget});
    currentPath = path;
    currentAssetPath = asset;
    updateURL({depth: depth + 1});
    renderCurrent({focus: true});
  }

  function applyTree(tree) {
    entries = tree.filter((entry) => typeof entry?.path === 'string' && ['tree', 'blob'].includes(entry.type));
    entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
    const state = stateFromURL();
    currentPath = state.path;
    currentAssetPath = state.asset;
    elements.summary.textContent = `${allAssets().length} アセット · ${directCategories('').length} カテゴリ`;
    updateURL({replace: true});
  }

  function showCatalogError(message) {
    const state = emptyState('カタログに接続できませんでした', message);
    const actions = document.createElement('div');
    actions.className = 'catalog-empty-actions';
    const retry = textElement('button', 'もう一度読み込む', 'catalog-retry-button');
    retry.type = 'button';
    retry.addEventListener('click', () => loadCatalog({focus: true}));
    actions.append(retry, externalLink(REPOSITORY_URL, 'GitHubで配布元を見る ↗', 'catalog-repo-link'));
    state.append(actions);
    elements.files.replaceChildren(state);
    elements.summary.textContent = '公開情報を取得できませんでした';
    setBusy(false);
  }

  async function loadCatalog({focus = false} = {}) {
    const generation = ++treeLoadGeneration;
    ++assetLoadGeneration;
    elements.refresh.disabled = true;
    setStatus('GitHubからカタログを更新しています。');
    setBusy(true);
    if (!entries.length) elements.files.replaceChildren(emptyState('カタログを読み込んでいます', 'GitHubの配布リポジトリを確認しています。'));
    try {
      const [response, previewData] = await Promise.all([
        fetchWithTimeout(API_TREE, {headers: {Accept: 'application/vnd.github+json'}, cache: 'no-store'}),
        fetch('/vrchat-assets/previews/manifest.json').then((result) => result.ok ? result.json() : {}).catch(() => ({}))
      ]);
      previews = previewData && typeof previewData === 'object' ? previewData : {};
      if (!response.ok) {
        if ([403, 429].includes(response.status)) throw new Error('GitHub APIのアクセス上限に達したようです。少し時間をおいて再読み込みしてください。');
        if (response.status === 404) throw new Error('配布リポジトリが見つかりません。公開設定を確認してください。');
        throw new Error(`GitHubへの接続に失敗しました (HTTP ${response.status})`);
      }
      const data = await response.json();
      if (generation !== treeLoadGeneration) return;
      if (!Array.isArray(data.tree)) throw new Error('配布情報の形式を確認できませんでした。');
      previews = previewData && typeof previewData === 'object' ? previewData : {};
      applyTree(data.tree);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({tree: data.tree})); } catch { /* Storage is optional. */ }
      renderCurrent({focus});
      if (data.truncated) setStatus('カタログの一部がGitHub APIの上限により省略されています。', true);
    } catch (error) {
      if (generation !== treeLoadGeneration) return;
      let cached;
      if (!entries.length) {
        try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { /* No saved catalogue. */ }
        if (Array.isArray(cached?.tree)) applyTree(cached.tree);
      }
      if (entries.length) {
        renderCurrent({focus});
        setStatus('最新情報に接続できないため、前回取得したカタログを表示しています。再読み込みで更新できます。', true);
      } else {
        const message = error.name === 'AbortError' ? '接続に時間がかかっています。通信状態を確認して再読み込みしてください。' : error.message;
        showCatalogError(message || '通信状態を確認して再読み込みしてください。');
        setStatus('カタログの取得に失敗しました。再読み込みか配布元のリンクをご利用ください。', true);
        if (focus) focusView();
      }
    } finally {
      if (generation === treeLoadGeneration) { elements.refresh.disabled = false; setBusy(false); }
    }
  }

  elements.back.addEventListener('click', () => {
    if (window.history.state?.zeroCatalog?.depth > 0) window.history.back();
    else {
      currentPath = currentAssetPath ? currentPath : parentPath(currentPath);
      currentAssetPath = '';
      updateURL({replace: true, depth: 0});
      renderCurrent({focus: true});
    }
  });
  elements.refresh.addEventListener('click', () => loadCatalog({focus: true}));
  elements.breadcrumbs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-catalog-path]');
    if (button) navigateTo(button.dataset.catalogPath);
  });
  elements.files.addEventListener('click', (event) => {
    const category = event.target.closest('[data-open-category]');
    const asset = event.target.closest('[data-open-asset]');
    if (category) navigateTo(category.dataset.openCategory, '', {returnTarget: category.dataset.openCategory});
    else if (asset) navigateTo(parentPath(asset.dataset.openAsset), asset.dataset.openAsset, {returnTarget: asset.dataset.openAsset});
  });
  window.addEventListener('popstate', () => {
    if (!entries.length) return;
    const state = stateFromURL();
    currentPath = state.path;
    currentAssetPath = state.asset;
    renderCurrent({focus: true, focusKey: window.history.state?.zeroCatalog?.focusKey});
  });

  loadCatalog();
})();
