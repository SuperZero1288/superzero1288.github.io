(() => {
  'use strict';
  const ticketKey = 'vastique-boot-ticket';
  let ticket = null;
  try { ticket = JSON.parse(sessionStorage.getItem(ticketKey) || 'null'); } catch { ticket = null; }
  sessionStorage.removeItem(ticketKey);
  if (!ticket?.expiresAt || ticket.expiresAt < Date.now()) {
    location.replace(new URL('../../', location.href).href);
    return;
  }
  const boot = document.getElementById('vBoot');
  const desktop = document.getElementById('vDesktop');
  const bootProgress = document.getElementById('vBootProgress');
  const bootStatus = document.getElementById('vBootStatus');
  const windowsRoot = document.getElementById('vWindows');
  const iconBase = '../../assets/aether/icons/';
  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { nextId: 1, active: 0, windows: new Map(), entries: null, currentPath: 'C:\\', repositoryReady: false };
  const iconFor = entry => entry?.type === 'File folder' || entry?.path ? 'folder' : entry?.kind === 'image' ? '▧' : entry?.kind === 'video' ? '▶' : entry?.kind === 'audio' ? '♫' : '▤';

  const bootSequence = async () => {
    const stages = [['Checking Vectoraise firmware…', 18], ['Mounting Vastique Drive…', 42], ['Restoring your workspace…', 67], ['Starting desktop services…', 88], ['Ready.', 100]];
    for (const [text, value] of stages) {
      bootStatus.textContent = text;
      bootProgress.style.width = `${value}%`;
      await wait(value === 100 ? 380 : 430);
    }
    await wait(180);
    boot.hidden = true;
    desktop.hidden = false;
    updateClock();
    window.setInterval(updateClock, 1000);
    openFinder('C:\\');
    void syncFilesystem();
  };

  const focusWindow = record => {
    state.active = record.id;
    state.windows.forEach(item => item.element.classList.toggle('is-active', item.id === record.id));
    record.element.style.zIndex = String(10 + record.id);
  };
  const closeWindow = record => {
    record.element.remove();
    record.task?.remove();
    state.windows.delete(record.id);
  };
  const createWindow = ({ title, glyph = 'V', body, width = 620, height = 430, fixed = false }) => {
    const id = state.nextId++;
    const element = document.createElement('section');
    element.className = 'v-window';
    if (fixed) element.style.resize = 'none';
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.left = `${Math.max(24, 130 + (id - 1) * 22)}px`;
    element.style.top = `${Math.max(54, 74 + (id - 1) * 20)}px`;
    element.innerHTML = `<header class="v-titlebar"><strong><span class="v-title-icon">${escapeHtml(glyph)}</span>${escapeHtml(title)}</strong><div class="v-title-controls"><button type="button" data-v-window="min" aria-label="Minimize">−</button><button type="button" data-v-window="max" aria-label="Maximize">□</button><button type="button" data-v-window="close" aria-label="Close">×</button></div></header><div class="v-body"></div>`;
    const record = { id, title, element, bodyRoot: element.querySelector('.v-body'), minimized: false, maximized: false };
    record.bodyRoot.append(body);
    const titlebar = element.querySelector('.v-titlebar');
    element.querySelector('[data-v-window="close"]').addEventListener('click', () => closeWindow(record));
    element.querySelector('[data-v-window="min"]').addEventListener('click', () => { record.minimized = true; element.classList.add('is-minimized'); });
    element.querySelector('[data-v-window="max"]').addEventListener('click', () => { record.maximized = !record.maximized; element.classList.toggle('is-maximized', record.maximized); focusWindow(record); });
    let drag = null;
    titlebar.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || record.maximized) return;
      const rect = element.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      titlebar.setPointerCapture(event.pointerId);
      focusWindow(record);
    });
    titlebar.addEventListener('pointermove', event => {
      if (!drag) return;
      element.style.left = `${Math.max(6, drag.left + event.clientX - drag.x)}px`;
      element.style.top = `${Math.max(42, drag.top + event.clientY - drag.y)}px`;
    });
    titlebar.addEventListener('pointerup', () => { drag = null; });
    element.addEventListener('pointerdown', () => focusWindow(record));
    const task = document.createElement('button');
    task.type = 'button'; task.className = 'v-task'; task.textContent = title;
    task.addEventListener('click', () => { record.minimized = false; element.classList.remove('is-minimized'); focusWindow(record); });
    record.task = task;
    windowsRoot.append(element);
    state.windows.set(id, record);
    focusWindow(record);
    return record;
  };

  const fallbackEntries = {
    'C:\\': [{ name: 'Users', type: 'File folder', path: 'C:\\Users\\' }, { name: 'Applications', type: 'File folder', path: 'C:\\Applications\\' }, { name: 'System', type: 'File folder', path: 'C:\\System\\' }],
    'C:\\Users\\': [{ name: 'Vectoraise', type: 'File folder', path: 'C:\\Users\\Vectoraise\\' }],
    'C:\\Users\\Vectoraise\\': [{ name: 'Desktop', type: 'File folder', path: 'C:\\Users\\Vectoraise\\Desktop\\' }, { name: 'Documents', type: 'File folder', path: 'C:\\Users\\Vectoraise\\Documents\\' }, { name: 'Downloads', type: 'File folder', path: 'C:\\Users\\Vectoraise\\Downloads\\' }, { name: 'Pictures', type: 'File folder', path: 'C:\\Users\\Vectoraise\\Pictures\\' }],
    'C:\\Users\\Vectoraise\\Desktop\\': [{ name: 'Welcome.txt', type: 'Text Document', kind: 'text', source: 'Users/Vectoraise/Desktop/Welcome.txt' }],
    'C:\\Applications\\': [{ name: 'Finder.app', type: 'Application', app: 'finder' }, { name: 'TextEdit.app', type: 'Application', app: 'textedit' }, { name: 'Vastique Web.app', type: 'Application', app: 'browser' }, { name: 'Terminal.app', type: 'Application', app: 'terminal' }],
    'C:\\System\\': []
  };
  const cloneEntries = source => Object.fromEntries(Object.entries(source).map(([path, values]) => [path, values.map(value => ({ ...value }))]));
  state.entries = cloneEntries(fallbackEntries);
  const pathName = path => String(path).replace(/[\\/]+$/, '').split('\\').pop() || 'Vastique Drive';
  const normalizePath = value => {
    const parts = String(value || 'C:\\').replaceAll('/', '\\').split('\\').filter(Boolean);
    const result = ['C:'];
    parts.slice(parts[0]?.toUpperCase() === 'C:' ? 1 : 0).forEach(part => { if (part === '..') result.pop(); else if (part !== '.') result.push(part); });
    return `${result.join('\\')}\\`;
  };
  const parentPath = path => { const parts = normalizePath(path).split('\\').filter(Boolean); parts.pop(); return `${parts.join('\\') || 'C:'}\\`; };
  const sourceUrl = source => source ? new URL(`C/${source}`, location.href).href : '';
  const kindFor = name => /\.(png|jpe?g|gif|webp)$/i.test(name) ? 'image' : /\.(mp4|webm|mov)$/i.test(name) ? 'video' : /\.(mp3|wav|ogg|flac)$/i.test(name) ? 'audio' : 'text';
  const syncFilesystem = async () => {
    try {
      const response = await fetch('https://api.github.com/repos/SuperZero1288/superzero1288.github.io/git/trees/main?recursive=1', { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const prefix = 'os/vastique/C/';
      const nodes = (payload.tree || []).filter(node => node.path?.startsWith(prefix) && node.path !== `${prefix}manifest.json` && !node.path.endsWith('/.keep')).sort((a, b) => a.path.length - b.path.length);
      const next = cloneEntries(fallbackEntries);
      nodes.forEach(node => {
        const relative = node.path.slice(prefix.length);
        const parts = relative.split('/');
        const name = parts.at(-1);
        const parent = `C:\\${parts.slice(0, -1).join('\\')}${parts.length > 1 ? '\\' : ''}`;
        if (node.type === 'tree') {
          if (!next[parent]) next[parent] = [];
          next[parent].push({ name, type: 'File folder', path: `${parent}${name}\\` });
        } else {
          if (!next[parent]) next[parent] = [];
          next[parent].push({ name, type: kindFor(name) === 'text' ? 'Text Document' : kindFor(name)[0].toUpperCase() + kindFor(name).slice(1), kind: kindFor(name), source: relative });
        }
      });
      Object.values(next).forEach(values => values.sort((a, b) => Number(Boolean(b.path)) - Number(Boolean(a.path)) || a.name.localeCompare(b.name)));
      state.entries = next;
      state.repositoryReady = true;
      document.querySelectorAll('.v-finder').forEach(root => renderFinder(root, root.dataset.path || state.currentPath));
    } catch (error) {
      console.warn('Vastique filesystem sync unavailable', error);
    }
  };
  const entriesFor = path => state.entries[normalizePath(path)] || [];
  const openEntry = entry => {
    if (entry.path) { openFinder(entry.path); return; }
    if (entry.app) { apps[entry.app]?.(); return; }
    if (entry.kind === 'text') openTextEdit(entry);
    else if (entry.kind === 'image') openPreview(entry, 'image');
    else if (entry.kind === 'video') openPreview(entry, 'video');
    else if (entry.kind === 'audio') openPreview(entry, 'audio');
  };
  const renderFinder = (root, path) => {
    path = normalizePath(path); root.dataset.path = path; state.currentPath = path;
    const list = root.querySelector('.v-file-grid');
    const pathLabel = root.querySelector('.v-path');
    pathLabel.textContent = path.replaceAll('\\', ' / ').replace(/\s+\/$/, '');
    list.replaceChildren();
    const values = entriesFor(path);
    if (!values.length) { list.innerHTML = '<div class="v-empty">This folder is empty.</div>'; return; }
    values.forEach(entry => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'v-file';
      const glyph = entry.path ? '⌂' : iconFor(entry);
      button.innerHTML = `<span class="v-file-glyph ${entry.path ? 'folder' : entry.kind === 'text' ? 'text' : ''}">${glyph}</span><span>${escapeHtml(entry.name)}</span>`;
      button.addEventListener('dblclick', () => openEntry(entry));
      button.addEventListener('click', () => root.querySelector('.v-selected')?.classList.remove('v-selected'));
      list.append(button);
    });
  };
  const openFinder = (path = 'C:\\') => {
    const body = document.createElement('div'); body.className = 'v-finder';
    body.innerHTML = '<div class="v-toolbar"><button type="button" data-finder="back">‹</button><button type="button" data-finder="up">↑</button><button type="button" data-finder="refresh">↻</button><span class="v-path"></span></div><div class="v-finder-main"><aside class="v-sidebar"><h3>Favorites</h3><button type="button" data-path="C:\\"><span>◈</span> Vastique Drive</button><button type="button" data-path="C:\\Users\\Vectoraise\\Desktop\\"><span>⌂</span> Desktop</button><button type="button" data-path="C:\\Users\\Vectoraise\\Documents\\"><span>▤</span> Documents</button><button type="button" data-path="C:\\Users\\Vectoraise\\Downloads\\"><span>↓</span> Downloads</button><h3>Locations</h3><button type="button" data-path="C:\\Applications\\"><span>▦</span> Applications</button></aside><div class="v-file-area"><div class="v-file-grid"></div></div></div>';
    const record = createWindow({ title: 'Vastique Drive', glyph: '⌂', body, width: 700, height: 470 });
    let history = [normalizePath(path)];
    const navigate = next => { history.push(normalizePath(next)); renderFinder(body, next); };
    body.querySelectorAll('[data-path]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.path)));
    body.querySelector('[data-finder="back"]').addEventListener('click', () => { if (history.length > 1) { history.pop(); renderFinder(body, history.at(-1)); } });
    body.querySelector('[data-finder="up"]').addEventListener('click', () => navigate(parentPath(history.at(-1))));
    body.querySelector('[data-finder="refresh"]').addEventListener('click', () => void syncFilesystem());
    renderFinder(body, path);
    return record;
  };
  const openTextEdit = async entry => {
    const body = document.createElement('div'); body.className = 'v-editor';
    body.innerHTML = '<div class="v-toolbar"><button type="button" data-edit="save">Save</button><button type="button" data-edit="new">New</button><span class="v-path"></span></div><textarea spellcheck="false" aria-label="TextEdit document"></textarea>';
    const record = createWindow({ title: entry?.name || 'TextEdit', glyph: '▤', body, width: 640, height: 430 });
    const textarea = body.querySelector('textarea'); body.querySelector('.v-path').textContent = entry?.name || 'Untitled';
    if (entry?.source) { try { textarea.value = await (await fetch(sourceUrl(entry.source), { cache: 'no-store' })).text(); } catch { textarea.value = 'Unable to read this document.'; } }
    body.querySelector('[data-edit="new"]').addEventListener('click', () => { textarea.value = ''; textarea.focus(); });
    body.querySelector('[data-edit="save"]').addEventListener('click', () => { body.querySelector('.v-path').textContent = 'Saved locally'; localStorage.setItem(`vastique-text:${entry?.name || 'Untitled'}`, textarea.value); });
    return record;
  };
  const openPreview = (entry, type) => {
    const body = document.createElement('div'); body.className = 'v-browser-home';
    const label = type === 'image' ? 'Image Preview' : type === 'video' ? 'Video Player' : 'Audio Player';
    const media = type === 'image' ? `<img src="${escapeHtml(sourceUrl(entry.source))}" alt="" style="max-width:100%;max-height:250px">` : type === 'video' ? `<video src="${escapeHtml(sourceUrl(entry.source))}" controls style="max-width:100%;max-height:250px"></video>` : `<audio src="${escapeHtml(sourceUrl(entry.source))}" controls></audio>`;
    body.innerHTML = `<div><h2>${label}</h2>${media}<p>${escapeHtml(entry.name)}</p></div>`;
    return createWindow({ title: entry.name, glyph: type === 'image' ? '▧' : type === 'video' ? '▶' : '♫', body, width: 520, height: 350 });
  };
  const openBrowser = () => {
    const body = document.createElement('div'); body.className = 'v-browser';
    body.innerHTML = '<div class="v-toolbar"><button type="button" data-web="back">‹</button><button type="button" data-web="forward">›</button><input class="v-address" value="vastique://start" aria-label="Address"><button type="button" data-web="go">Go</button></div><div class="v-browser-home"><div><span class="v-mark v-mark-large"></span><h2>Vastique Web</h2><p>A quiet, private place for local documents and trusted destinations. Network access is disabled on this machine.</p><button class="v-plain-button" type="button" data-web="offline">View offline information</button></div></div>';
    const record = createWindow({ title: 'Vastique Web', glyph: '◎', body, width: 700, height: 440 });
    body.querySelector('[data-web="go"]').addEventListener('click', () => { body.querySelector('.v-address').value = 'vastique://offline'; });
    body.querySelector('[data-web="offline"]').addEventListener('click', () => { body.querySelector('.v-address').value = 'vastique://offline'; });
    return record;
  };
  const openTerminal = () => {
    const body = document.createElement('div'); body.className = 'v-terminal'; body.innerHTML = '<div class="v-terminal-output"></div><form class="v-terminal-form"><span>vastique %</span><input autocomplete="off" aria-label="Vastique Terminal command"></form>';
    const record = createWindow({ title: 'Terminal', glyph: '›_', body, width: 570, height: 350 });
    const output = body.querySelector('.v-terminal-output'); const form = body.querySelector('form'); const input = form.querySelector('input');
    const write = text => { const line = document.createElement('div'); line.textContent = text; output.append(line); output.scrollTop = output.scrollHeight; };
    write('Vastique Terminal 1.0'); write('Vectoraise Corporation. Local session ready.'); write('Type help for available commands.');
    form.addEventListener('submit', event => { event.preventDefault(); const command = input.value.trim(); input.value = ''; if (!command) return; write(`vastique % ${command}`); const [name, ...args] = command.split(/\s+/); switch (name.toLowerCase()) { case 'help': write('ls  open  about  clear  date  exit'); break; case 'ls': write((entriesFor(state.currentPath).map(entry => `${entry.path ? '  ' : '    '}${entry.name}`).join('\n')) || '(empty)'); break; case 'open': args[0] ? openFinder(normalizePath(args.join(' '))) : openFinder(state.currentPath); break; case 'about': openAbout(); break; case 'clear': output.replaceChildren(); break; case 'date': write(new Date().toString()); break; case 'exit': closeWindow(record); break; default: write(`command not found: ${name}`); } });
    requestAnimationFrame(() => input.focus()); return record;
  };
  const openAbout = () => {
    const body = document.createElement('div'); body.className = 'v-about'; body.innerHTML = '<span class="v-mark v-mark-large"></span><h2>Vastique 1.0</h2><p>A calm, expressive desktop operating system<br>for the next generation of physical computers.</p><hr><p><strong>Vectoraise Corporation</strong><br>Build 2409 · Local Edition</p><small>Copyright © 2026 Vectoraise Corporation.</small>';
    return createWindow({ title: 'About Vastique', glyph: 'V', body, width: 380, height: 350, fixed: true });
  };
  const apps = { finder: () => openFinder('C:\\'), textedit: () => openTextEdit(null), browser: openBrowser, terminal: openTerminal, about: openAbout };
  document.querySelectorAll('[data-v-app]').forEach(button => button.addEventListener('dblclick', () => apps[button.dataset.vApp]?.()));
  document.querySelectorAll('.v-dock [data-v-app], .v-menubar [data-v-app]').forEach(button => button.addEventListener('click', () => apps[button.dataset.vApp]?.()));
  document.querySelectorAll('[data-v-menu]').forEach(button => button.addEventListener('click', () => { if (button.dataset.vMenu === 'help') openAbout(); }));
  const shutdown = () => { const screen = document.createElement('div'); screen.className = 'v-shutdown'; screen.innerHTML = '<div><strong>Vastique is shutting down</strong><p>Your workspace has been closed safely.</p></div>'; document.body.append(screen); window.setTimeout(() => location.replace(new URL('../../', location.href).href), 1050); };
  document.querySelector('[data-v-action="shutdown"]').addEventListener('click', shutdown);
  const updateClock = () => { document.getElementById('vClock').textContent = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()); };
  bootSequence();
})();
