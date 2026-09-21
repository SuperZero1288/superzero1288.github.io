(() => {
  const ticketKey = 'aether-boot-ticket';
  const boot = document.getElementById('aether-boot');
  const osBoot = document.getElementById('aether-os-boot');
  const desktop = document.getElementById('aether-desktop');
  const log = document.getElementById('aetherBootLog');
  const progress = document.getElementById('aetherBootProgress');
  const status = document.getElementById('aetherBootStatus');
  const osBootProgress = document.getElementById('aetherOsBootProgress');
  const osBootStatus = document.getElementById('aetherOsBootStatus');
  const osBootBlocks = Array.from({ length: 20 }, (_, index) => {
    const block = document.createElement('i');
    block.className = 'aether-os-progress-block';
    block.setAttribute('aria-hidden', 'true');
    block.dataset.index = String(index);
    return block;
  });
  osBootProgress.replaceChildren(...osBootBlocks);
  let visibleOsBootBlocks = 0;

  const deny = () => {
    document.documentElement.classList.add('aether-denied');
    location.replace(new URL('../../', location.href).href);
  };

  let ticket;
  try { ticket = JSON.parse(sessionStorage.getItem(ticketKey) || 'null'); } catch { ticket = null; }
  sessionStorage.removeItem(ticketKey);
  if (!ticket || !ticket.expiresAt || ticket.expiresAt < Date.now()) { deny(); return; }
  document.body.classList.add('aether-authorized');

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const iconBase = '../../assets/aether/icons/';
  const iconMarkup = (icon, className = 'aether-file-icon') => {
    if (icon === 'terminal-glyph') {
      return `<span class="${className}-terminal" aria-hidden="true">&gt;_</span>`;
    }
    if (typeof icon === 'string' && /^[a-z0-9_-]+\.(?:png|svg)$/i.test(icon)) {
      const legacyClass = icon.endsWith('.png') ? ' aether-legacy-blue-icon' : '';
      return `<img class="${className}${legacyClass}" src="${iconBase}${icon}" alt="">`;
    }
    return `<span class="${className}-text" aria-hidden="true">${icon || ''}</span>`;
  };
  const appendBootLine = (text, ok = false) => {
    log.querySelector('.aether-boot-cursor')?.remove();
    const line = document.createElement('div');
    line.textContent = text;
    if (ok) line.className = 'is-ok';
    log.append(line);
    const cursor = document.createElement('span');
    cursor.className = 'aether-boot-cursor';
    log.append(cursor);
  };
  const setBootProgress = (value, text) => {
    progress.style.width = `${value}%`;
    status.textContent = text;
  };
  const revealOsBootProgress = async value => {
    const target = Math.min(osBootBlocks.length, Math.ceil(value / 5));
    while (visibleOsBootBlocks < target) {
      osBootBlocks[visibleOsBootBlocks].classList.add('is-active');
      visibleOsBootBlocks += 1;
      await wait(48);
    }
  };

  const windows = new Map();
  let nextWindowId = 1;
  let nextZ = 10;
  let activeId = null;
  const windowsRoot = document.getElementById('aetherWindows');
  const taskButtons = document.getElementById('aetherTaskButtons');
  const startMenu = document.getElementById('aetherStartMenu');
  const startButton = document.getElementById('aetherStartButton');
  const clock = document.getElementById('aetherClock');
  const networkStatus = document.getElementById('aetherNetworkStatus');
  const volumeButton = document.getElementById('aetherVolumeButton');
  const volumeIcon = document.getElementById('aetherVolumeIcon');
  const setTrayStatus = text => {
    const node = document.getElementById('aetherStatusText');
    if (node) node.textContent = text;
  };

  const focusWindow = record => {
    if (!record || record.minimized) return;
    activeId = record.id;
    record.element.style.zIndex = String(++nextZ);
    windows.forEach(item => {
      item.element.classList.toggle('is-active', item.id === record.id);
      item.taskButton?.classList.toggle('is-active', item.id === record.id);
    });
  };

  const syncTaskButton = record => {
    record.taskButton?.classList.toggle('is-active', activeId === record.id && !record.minimized);
  };

  const closeWindow = record => {
    if (!record || !windows.has(record.id)) return;
    record.element.remove();
    record.taskButton?.remove();
    windows.delete(record.id);
    if (activeId === record.id) {
      activeId = null;
      const next = [...windows.values()].reverse().find(item => !item.minimized);
      if (next) focusWindow(next);
    }
  };

  const minimizeWindow = record => {
    record.minimized = true;
    record.element.classList.add('is-minimized');
    record.taskButton?.classList.remove('is-active');
    if (activeId === record.id) {
      activeId = null;
      const next = [...windows.values()].reverse().find(item => !item.minimized);
      if (next) focusWindow(next);
    }
  };

  const restoreWindow = record => {
    record.minimized = false;
    record.element.classList.remove('is-minimized');
    focusWindow(record);
  };

  const maximizeWindow = record => {
    record.maximized = !record.maximized;
    record.element.classList.toggle('is-maximized', record.maximized);
    record.maximizeButton.textContent = record.maximized ? '❐' : '□';
    record.maximizeButton.setAttribute('aria-label', record.maximized ? '元のサイズに戻す' : '最大化');
    focusWindow(record);
  };

  const enableDragging = (record, titlebar) => {
    let drag = null;
    titlebar.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || record.maximized) return;
      focusWindow(record);
      const rect = record.element.getBoundingClientRect();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      titlebar.setPointerCapture(event.pointerId);
    });
    titlebar.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const parent = windowsRoot.getBoundingClientRect();
      const left = Math.max(0, Math.min(parent.width - 100, drag.left - parent.left + event.clientX - drag.x));
      const top = Math.max(0, Math.min(parent.height - 54, drag.top - parent.top + event.clientY - drag.y));
      record.element.style.left = `${left}px`;
      record.element.style.top = `${top}px`;
    });
    const finish = event => { if (drag?.pointerId === event.pointerId) drag = null; };
    titlebar.addEventListener('pointerup', finish);
    titlebar.addEventListener('pointercancel', finish);
  };

  const createWindow = ({ title, icon = 'folder.svg', body, width = 540, height = 360 }) => {
    const id = nextWindowId++;
    const element = document.createElement('section');
    element.className = 'aether-window';
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.left = `${Math.max(110, 120 + (id - 1) * 24)}px`;
    element.style.top = `${Math.max(20, 50 + (id - 1) * 24)}px`;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', title);
    element.innerHTML = `
      <header class="aether-titlebar">
        <strong>${iconMarkup(icon, 'aether-window-icon')} ${title}</strong>
        <div class="aether-title-controls">
          <button type="button" data-window-action="minimize" aria-label="最小化">_</button>
          <button type="button" data-window-action="maximize" aria-label="最大化">□</button>
          <button type="button" data-window-action="close" aria-label="閉じる">×</button>
        </div>
      </header>
      <div class="aether-window-body"></div>`;
    const titlebar = element.querySelector('.aether-titlebar');
    const bodyRoot = element.querySelector('.aether-window-body');
    bodyRoot.append(body);
    if (body.classList?.contains('aether-explorer')) element.classList.add('has-explorer');
    const record = { id, title, element, bodyRoot, minimized: false, maximized: false };
    record.maximizeButton = element.querySelector('[data-window-action="maximize"]');
    element.querySelector('[data-window-action="minimize"]').addEventListener('click', () => minimizeWindow(record));
    record.maximizeButton.addEventListener('click', () => maximizeWindow(record));
    element.querySelector('[data-window-action="close"]').addEventListener('click', () => closeWindow(record));
    const taskButton = document.createElement('button');
    taskButton.type = 'button';
    taskButton.className = 'aether-task-button';
    taskButton.innerHTML = `${iconMarkup(icon, 'aether-task-icon')} <span>${title}</span>`;
    taskButton.addEventListener('click', () => record.minimized ? restoreWindow(record) : (activeId === record.id ? minimizeWindow(record) : focusWindow(record)));
    record.taskButton = taskButton;
    windowsRoot.append(element);
    taskButtons.append(taskButton);
    windows.set(id, record);
    element.addEventListener('pointerdown', () => focusWindow(record));
    enableDragging(record, titlebar);
    focusWindow(record);
    return record;
  };

  const makePanel = (heading, inner = '') => {
    const panel = document.createElement('div');
    panel.className = 'aether-panel';
    panel.innerHTML = `<div class="aether-panel-heading">${heading}</div>${inner}`;
    return panel;
  };

  const createClassicMenu = (body, menus) => {
    const bar = document.createElement('div');
    bar.className = 'aether-app-menu';
    const closeMenus = () => bar.querySelectorAll('.aether-app-menu-popup').forEach(menu => { menu.hidden = true; });
    Object.entries(menus).forEach(([label, actions]) => {
      const group = document.createElement('div');
      group.className = 'aether-app-menu-group';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'aether-app-menu-trigger';
      trigger.textContent = label;
      const popup = document.createElement('div');
      popup.className = 'aether-app-menu-popup';
      popup.hidden = true;
      actions.forEach(action => {
        if (action === null) {
          const separator = document.createElement('div');
          separator.className = 'aether-app-menu-separator';
          popup.append(separator);
          return;
        }
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = action.label;
        item.disabled = Boolean(action.disabled);
        item.addEventListener('click', () => { closeMenus(); action.onClick?.(); });
        popup.append(item);
      });
      trigger.addEventListener('click', event => {
        event.stopPropagation();
        const wasHidden = popup.hidden;
        closeMenus();
        popup.hidden = !wasHidden;
      });
      group.append(trigger, popup);
      bar.append(group);
    });
    body.prepend(bar);
    body.addEventListener('pointerdown', event => { if (!bar.contains(event.target)) closeMenus(); });
    return { bar, closeMenus };
  };

  const openAbout = () => {
    const body = document.createElement('div');
    body.className = 'aether-about';
    body.innerHTML = `<div class="aether-os-logo aether-about-logo" aria-label="AetherOS 1.0"><span class="aether-os-logo-symbol" aria-hidden="true"><i></i></span><strong>AetherOS</strong><sup>1.0</sup></div><h2>About AetherOS 1.0</h2><p>AetherOSは、Omnivast Corporationが設計・開発した実機向けオペレーティングシステムです。</p><div class="aether-inset"><strong>AetherOS 1.0</strong><br>Build 9501<br>Manufacturer: Omnivast Corporation<br>Hardware status: Operational</div><p>日々の作業と静かな探索を支える、堅牢で親しみやすいデスクトップを目指しています。</p>`;
    createWindow({ title: 'About AetherOS', icon: 'about.svg', body, width: 430, height: 290 });
  };

  const openNotepad = (initialText = null, fileName = '') => {
    const body = document.createElement('div');
    body.className = 'aether-notepad';
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-label', 'Aether Notes');
    textarea.value = initialText ?? localStorage.getItem('aether-notes') ?? 'Welcome to AetherOS 1.0.\n';
    const toolbar = document.createElement('div');
    toolbar.className = 'aether-app-toolbar';
    const toolbarButton = (label, onClick) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.addEventListener('click', onClick); toolbar.append(button); return button;
    };
    const save = () => { localStorage.setItem('aether-notes', textarea.value); setTrayStatus('Note saved'); };
    const download = () => {
      const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName || 'AetherNote.txt';
      link.click();
      URL.revokeObjectURL(link.href);
      setTrayStatus('AetherNote.txt saved');
    };
    const clear = () => { textarea.value = ''; textarea.focus(); };
    toolbarButton('Save', save);
    toolbarButton('Save .TXT', download);
    toolbarButton('Clear', clear);
    toolbarButton('Word Wrap', () => { textarea.classList.toggle('is-no-wrap'); });
    let record;
    createClassicMenu(body, {
      File: [{ label: 'Save', onClick: save }, { label: 'Save As .TXT', onClick: download }, null, { label: 'Close', onClick: () => record?.element.querySelector('[data-window-action="close"]')?.click() }],
      Edit: [{ label: 'Clear', onClick: clear }, { label: 'Select All', onClick: () => { textarea.focus(); textarea.select(); } }],
      View: [{ label: 'Word Wrap', onClick: () => textarea.classList.toggle('is-no-wrap') }],
      Help: [{ label: 'About Notepad', onClick: () => setTrayStatus('Notepad — AetherOS text editor') }]
    });
    body.append(toolbar, textarea);
    record = createWindow({ title: fileName ? `${fileName} - Notepad` : 'Notepad.exe', icon: 'notepad.svg', body, width: 520, height: 350 });
  };

  const openPaint = () => {
    const body = document.createElement('div');
    body.className = 'aether-paint';
    const toolbar = document.createElement('div');
    toolbar.className = 'aether-app-toolbar aether-paint-toolbar';
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color ';
    const color = document.createElement('input');
    color.type = 'color'; color.value = '#000000'; color.setAttribute('aria-label', 'Paint color');
    colorLabel.append(color);
    toolbar.append(colorLabel);
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'aether-paint-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'aether-paint-canvas';
    canvas.width = 640;
    canvas.height = 390;
    canvas.setAttribute('aria-label', 'Paint canvas');
    canvasWrap.append(canvas);
    const save = document.createElement('button');
    save.type = 'button';
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 4;
    context.lineCap = 'round';
    let drawing = false;
    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
    };
    canvas.addEventListener('pointerdown', event => { drawing = true; canvas.setPointerCapture(event.pointerId); const p = point(event); context.beginPath(); context.moveTo(p.x, p.y); });
    canvas.addEventListener('pointermove', event => { if (!drawing) return; const p = point(event); context.strokeStyle = color.value; context.lineTo(p.x, p.y); context.stroke(); });
    canvas.addEventListener('pointerup', event => { drawing = false; canvas.releasePointerCapture?.(event.pointerId); });
    canvas.addEventListener('pointercancel', () => { drawing = false; });
    const clear = () => { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); };
    const savePng = () => {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = 'AetherPaint.png';
      link.click();
    };
    const clearButton = document.createElement('button');
    clearButton.type = 'button'; clearButton.textContent = 'Clear'; clearButton.addEventListener('click', clear);
    save.textContent = 'Save .PNG'; save.addEventListener('click', savePng);
    toolbar.append(save, clearButton);
    let record;
    createClassicMenu(body, {
      File: [{ label: 'New', onClick: clear }, { label: 'Save As .PNG', onClick: savePng }, null, { label: 'Close', onClick: () => record?.element.querySelector('[data-window-action="close"]')?.click() }],
      Edit: [{ label: 'Clear Canvas', onClick: clear }],
      View: [{ label: 'Reset Canvas', onClick: clear }],
      Help: [{ label: 'About Paint', onClick: () => setTrayStatus('Paint — AetherOS bitmap editor') }]
    });
    body.append(toolbar, canvasWrap);
    record = createWindow({ title: 'Paint.exe', icon: 'mspaint.svg', body, width: 700, height: 510 });
  };

  const resizeMediaWindow = (record, ratio, extraHeight = 112) => {
    if (!record || !Number.isFinite(ratio) || ratio <= 0) return;
    const width = Math.max(420, Math.min(860, Math.round(Math.min(window.innerWidth * .72, 760))));
    const height = Math.max(260, Math.min(650, Math.round(width / ratio + extraHeight)));
    record.element.style.width = `${width}px`;
    record.element.style.height = `${height}px`;
  };

  const createMediaTransport = (media, label = 'Media', variant = 'default') => {
    const transport = document.createElement('div');
    transport.className = 'aether-media-transport';
    if (variant !== 'default') transport.classList.add(`is-${variant}`);
    if (variant === 'audio') {
      const seek = document.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.value = '0'; seek.setAttribute('aria-label', `${label} position`);
      const controls = document.createElement('div'); controls.className = 'aether-audio-controls';
      const makeControl = (text, ariaLabel, onClick) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', ariaLabel); button.addEventListener('click', onClick); return button;
      };
      const rewind = makeControl('◀◀', 'Rewind 5 seconds', () => { if (Number.isFinite(media.currentTime)) media.currentTime = Math.max(0, media.currentTime - 5); });
      const forward = makeControl('▶▶', 'Forward 5 seconds', () => { if (Number.isFinite(media.duration)) media.currentTime = Math.min(media.duration, media.currentTime + 5); });
      const play = makeControl('▶', 'Play or pause', async () => {
        if (media.paused) {
          try { await media.play(); } catch { setTrayStatus(`${label} could not be played`); }
        } else media.pause();
      });
      const stop = makeControl('■', 'Stop', () => { media.pause(); if (Number.isFinite(media.duration)) media.currentTime = 0; });
      const update = () => {
        play.textContent = media.paused ? '▶' : '❚❚';
        seek.value = Number.isFinite(media.duration) && media.duration > 0 ? String(Math.round((Number.isFinite(media.currentTime) ? media.currentTime : 0) / media.duration * 1000)) : '0';
      };
      seek.addEventListener('input', () => { if (Number.isFinite(media.duration) && media.duration > 0) media.currentTime = (Number(seek.value) / 1000) * media.duration; });
      ['timeupdate', 'loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'play', 'pause', 'ended'].forEach(eventName => media.addEventListener(eventName, update));
      controls.append(rewind, play, stop, forward);
      transport.append(seek, controls);
      return transport;
    }
    const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Play';
    const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop';
    const seek = document.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.value = '0'; seek.setAttribute('aria-label', `${label} position`);
    const time = document.createElement('span'); time.textContent = '00:00 / 00:00';
    play.addEventListener('click', async () => {
      if (media.paused) {
        try { await media.play(); } catch { setTrayStatus(`${label} could not be played`); }
      } else media.pause();
    });
    stop.addEventListener('click', () => { media.pause(); if (Number.isFinite(media.duration)) media.currentTime = 0; });
    seek.addEventListener('input', () => { if (Number.isFinite(media.duration) && media.duration > 0) media.currentTime = (Number(seek.value) / 1000) * media.duration; });
    const formatTime = value => { if (!Number.isFinite(value) || value < 0) return '00:00'; const seconds = Math.floor(value); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };
    const update = () => {
      const duration = Number(media.duration);
      const current = Number(media.currentTime);
      play.textContent = media.paused ? 'Play' : 'Pause';
      seek.value = Number.isFinite(duration) && duration > 0 ? String(Math.round((Number.isFinite(current) ? current : 0) / duration * 1000)) : '0';
      time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    };
    ['timeupdate', 'loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'play', 'pause', 'ended'].forEach(eventName => media.addEventListener(eventName, update));
    transport.append(play, stop, seek, time);
    return transport;
  };

  const openVideoPlayer = (entry = null) => {
    const body = document.createElement('div'); body.className = 'aether-video-player';
    const stage = document.createElement('div'); stage.className = 'aether-media-stage is-fit';
    const video = document.createElement('video'); video.preload = 'metadata'; video.setAttribute('aria-label', 'Aether Video Player');
    const empty = document.createElement('span'); empty.textContent = 'File > Open から動画を選択してください';
    stage.append(video, empty);
    const info = document.createElement('div'); info.className = 'aether-media-info'; info.textContent = entry?.name || 'No video loaded';
    let record;
    const load = selected => {
      if (!selected?.source) { video.removeAttribute('src'); video.load(); empty.hidden = false; info.textContent = 'No video loaded'; return; }
      video.src = new URL(toRepositoryPath(selected.source), repositoryRootUrl).href; video.load(); empty.hidden = true; info.textContent = selected.name;
    };
    const transport = createMediaTransport(video, 'Video');
    createClassicMenu(body, {
      File: [{ label: 'Open Video Folder', onClick: () => openExplorer('C:\\Users\\Unknown\\Videos\\') }, null, { label: 'Close', onClick: () => record?.element.querySelector('[data-window-action="close"]')?.click() }],
      Edit: [{ label: 'Stop', onClick: () => { video.pause(); video.currentTime = 0; } }],
      View: [{ label: 'Fit to Window', onClick: () => stage.classList.add('is-fit') }, { label: 'Actual Size', onClick: () => stage.classList.remove('is-fit') }],
      Help: [{ label: 'About Video Player', onClick: () => setTrayStatus('Aether Video Player — offline media') }]
    });
    body.append(info, stage, transport);
    record = createWindow({ title: entry?.name || 'Aether Video Player', icon: 'media-video.svg', body, width: 680, height: 460 });
    video.addEventListener('loadedmetadata', () => resizeMediaWindow(record, video.videoWidth / video.videoHeight, 140));
    video.addEventListener('error', () => { empty.hidden = false; empty.textContent = 'この動画を読み込めませんでした'; });
    load(entry);
  };

  const openImageViewer = (entry = null) => {
    const body = document.createElement('div'); body.className = 'aether-image-viewer';
    const stage = document.createElement('div'); stage.className = 'aether-media-stage is-fit';
    const image = document.createElement('img'); image.alt = entry?.name || 'Aether Image Viewer';
    const empty = document.createElement('span'); empty.textContent = 'File > Open から画像を選択してください';
    stage.append(image, empty);
    const info = document.createElement('div'); info.className = 'aether-media-info'; info.textContent = entry?.name || 'No image loaded';
    let record;
    const load = selected => {
      if (!selected?.source) { image.removeAttribute('src'); empty.hidden = false; info.textContent = 'No image loaded'; return; }
      image.src = new URL(toRepositoryPath(selected.source), repositoryRootUrl).href; empty.hidden = true; info.textContent = selected.name;
    };
    createClassicMenu(body, {
      File: [{ label: 'Open Pictures Folder', onClick: () => openExplorer('C:\\Users\\Unknown\\Pictures\\') }, null, { label: 'Close', onClick: () => record?.element.querySelector('[data-window-action="close"]')?.click() }],
      Edit: [{ label: 'Copy Image Address', onClick: () => setTrayStatus('Image address is local to AetherOS') }],
      View: [{ label: 'Fit to Window', onClick: () => stage.classList.add('is-fit') }, { label: 'Actual Size', onClick: () => stage.classList.remove('is-fit') }],
      Help: [{ label: 'About Image Viewer', onClick: () => setTrayStatus('Aether Image Viewer — offline media') }]
    });
    body.append(info, stage);
    record = createWindow({ title: entry?.name || 'Aether Image Viewer', icon: 'wangimg128.svg', body, width: 620, height: 440 });
    image.addEventListener('load', () => resizeMediaWindow(record, image.naturalWidth / image.naturalHeight, 100));
    image.addEventListener('error', () => { empty.hidden = false; empty.textContent = 'この画像を読み込めませんでした'; });
    load(entry);
  };

  const openAudioPlayer = (entry = null) => {
    const body = document.createElement('div'); body.className = 'aether-audio-player';
    const stage = document.createElement('div'); stage.className = 'aether-audio-stage';
    const readout = document.createElement('div'); readout.className = 'aether-audio-readout';
    const positionLabel = document.createElement('label'); positionLabel.textContent = 'Position:';
    const position = document.createElement('output'); position.textContent = '0.00 sec.'; positionLabel.append(position);
    const lengthLabel = document.createElement('label'); lengthLabel.textContent = 'Length:';
    const length = document.createElement('output'); length.textContent = '0.00 sec.'; lengthLabel.append(length);
    const spectrum = document.createElement('canvas'); spectrum.className = 'aether-audio-spectrum'; spectrum.width = 420; spectrum.height = 104; spectrum.setAttribute('aria-label', 'Audio spectrum');
    const info = document.createElement('strong'); info.className = 'aether-audio-name'; info.textContent = entry?.name || 'No audio loaded';
    const artist = document.createElement('span'); artist.className = 'aether-audio-artist';
    const album = document.createElement('span'); album.className = 'aether-audio-album';
    const metadata = document.createElement('div'); metadata.className = 'aether-audio-metadata'; metadata.append(info, artist, album);
    readout.append(positionLabel, spectrum, lengthLabel);
    stage.append(readout, metadata);
    const audio = document.createElement('audio'); audio.className = 'aether-audio-element'; audio.preload = 'auto'; audio.setAttribute('aria-label', 'Aether Audio Player');
    const spectrumContext = spectrum.getContext('2d');
    let analyser = null;
    let audioContext = null;
    let spectrumFrame = 0;
    const ensureAudioGraph = () => {
      if (analyser) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        analyser = audioContext.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = .72;
        source.connect(analyser); analyser.connect(audioContext.destination);
      } catch { analyser = null; audioContext = null; }
    };
    const drawSpectrum = () => {
      if (!spectrumContext) return;
      const width = spectrum.width; const height = spectrum.height;
      spectrumContext.fillStyle = '#000'; spectrumContext.fillRect(0, 0, width, height);
      spectrumContext.strokeStyle = '#073'; spectrumContext.lineWidth = 1;
      spectrumContext.beginPath(); spectrumContext.moveTo(0, height - 16); spectrumContext.lineTo(width, height - 16); spectrumContext.stroke();
      const rawBars = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(32);
      if (analyser) analyser.getByteFrequencyData(rawBars);
      const sourceBars = Array.from(rawBars.slice(0, 32));
      const bars = sourceBars.length ? [...sourceBars, ...sourceBars.slice().reverse()] : [0];
      const barWidth = Math.max(3, Math.floor(width / bars.length) - 2);
      bars.forEach((value, index) => {
        const amount = analyser ? Math.min(1, Math.pow(value / 255, .62) * 1.35) : (index % 5 === 0 ? .18 : .05);
        const barHeight = Math.max(2, Math.round(amount * (height - 24)));
        const x = index * (width / bars.length);
        spectrumContext.fillStyle = '#00a64f'; spectrumContext.fillRect(x, height - 17 - barHeight, barWidth, barHeight);
      });
      spectrumFrame = !audio.paused ? requestAnimationFrame(drawSpectrum) : 0;
    };
    const formatSeconds = value => Number.isFinite(value) && value >= 0 ? `${value.toFixed(2)} sec.` : '0.00 sec.';
    const updateReadout = () => { position.textContent = formatSeconds(Number(audio.currentTime)); length.textContent = formatSeconds(Number(audio.duration)); };
    let record;
    const load = selected => {
      if (!selected?.source) {
        audio.removeAttribute('src'); audio.load(); info.textContent = 'No audio loaded'; artist.textContent = 'Artist: Unknown'; album.textContent = 'Album: Unknown';
        updateReadout(); drawSpectrum();
        return;
      }
      audio.src = new URL(toRepositoryPath(selected.source), repositoryRootUrl).href;
      audio.load();
      info.textContent = selected.name || 'Unknown';
      artist.textContent = `Artist: ${selected.artist || 'Unknown'}`;
      album.textContent = `Album: ${selected.album || 'Unknown'}`;
      updateReadout(); drawSpectrum();
    };
    createClassicMenu(body, {
      File: [{ label: 'Open Music Folder', onClick: () => openExplorer('C:\\Users\\Unknown\\Music\\') }, null, { label: 'Close', onClick: () => record?.element.querySelector('[data-window-action="close"]')?.click() }],
      Edit: [{ label: 'Stop', onClick: () => { audio.pause(); audio.currentTime = 0; } }],
      View: [{ label: 'Reset', onClick: () => { audio.pause(); audio.currentTime = 0; } }],
      Help: [{ label: 'About Audio Player', onClick: () => setTrayStatus('Aether Audio Player — offline media') }]
    });
    stage.append(audio);
    body.append(stage, createMediaTransport(audio, 'Audio', 'audio'));
    record = createWindow({ title: entry?.name ? `${entry.name} - Sound Recorder` : 'Sound - Sound Recorder', icon: 'media-audio.svg', body, width: 560, height: 330 });
    record.element.classList.add('is-fixed-size');
    ['timeupdate', 'loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'pause', 'ended'].forEach(eventName => audio.addEventListener(eventName, updateReadout));
    audio.addEventListener('play', () => { ensureAudioGraph(); audioContext?.resume?.(); drawSpectrum(); });
    audio.addEventListener('error', () => setTrayStatus('Audio file could not be loaded'));
    load(entry);
  };

  const openBrowser = () => {
    const body = document.createElement('div');
    body.className = 'aether-browser';
    body.innerHTML = '<div class="aether-ie-menu"><button type="button">File</button><button type="button">Edit</button><button type="button">View</button><button type="button">Favorites</button><button type="button">Tools</button><button type="button">Help</button></div><div class="aether-ie-nav"><button type="button" data-ie-action="back" disabled aria-label="Back">◀</button><button type="button" data-ie-action="forward" disabled aria-label="Forward">▶</button><button type="button" data-ie-action="stop" aria-label="Stop">■</button><button type="button" data-ie-action="refresh" aria-label="Refresh">↻</button><button type="button" data-ie-action="home" aria-label="Home">⌂</button></div><form class="aether-ie-address"><label for="aether-ie-location">Address</label><input id="aether-ie-location" aria-label="AetherExplorer address" value="aether://home" autocomplete="off"><button type="submit">Go</button></form><div class="aether-ie-links"><span>Links</span>&nbsp;&nbsp; AetherOS Local Pages &nbsp; | &nbsp; Favorites</div><div class="aether-browser-view"><h2>AetherExplorer</h2><p>AetherExplorer.exe is ready.</p><div class="aether-browser-offline">Network adapter: disabled<br>Internet access: unavailable<br><br>This browser can open AetherOS local pages only.</div></div><div class="aether-ie-status">Done &nbsp; | &nbsp; Internet access disabled</div>';
    const form = body.querySelector('form');
    const input = body.querySelector('input');
    const view = body.querySelector('.aether-browser-view');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const target = input.value.trim().toLowerCase();
      if (target === 'aether://home' || target === 'aether://start') {
        view.innerHTML = '<h2>AetherExplorer</h2><p>Welcome to the AetherOS local browser.</p><div class="aether-browser-offline">Network adapter: disabled<br>Internet access: unavailable<br><br>External websites cannot be opened from this environment.</div>';
        return;
      }
      view.innerHTML = '<h2>Cannot open this address</h2><div class="aether-browser-offline">AetherOS is offline. Only aether://home is available.</div>';
    });
    body.querySelectorAll('[data-ie-action]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.ieAction === 'home') {
        input.value = 'aether://home';
        form.requestSubmit();
      } else if (button.dataset.ieAction === 'refresh') {
        form.requestSubmit();
      } else {
        view.innerHTML = '<h2>AetherExplorer</h2><div class="aether-browser-offline">This command is unavailable while the AetherOS network adapter is disabled.</div>';
      }
    }));
    body.querySelectorAll('.aether-ie-menu button').forEach(button => button.addEventListener('click', () => {
      const action = button.textContent.trim();
      if (action === 'File') view.innerHTML = '<h2>AetherExplorer</h2><p>File menu</p><div class="aether-browser-offline">Use the address bar to open an AetherOS local page.</div>';
      if (action === 'Edit') { input.focus(); input.select(); }
      if (action === 'View') view.classList.toggle('is-compact');
      if (action === 'Favorites') view.innerHTML = '<h2>Favorites</h2><p>AetherOS Local Pages</p>';
      if (action === 'Tools') setTrayStatus('AetherExplorer tools: network adapter disabled');
      if (action === 'Help') view.innerHTML = '<h2>About AetherExplorer</h2><p>Offline local browser for AetherOS.</p>';
    }));
    createWindow({ title: 'AetherExplorer.exe', icon: 'browser-globe.svg', body, width: 650, height: 430 });
  };

  let explorerEntries = {
    'C:\\': [
      { icon: 'folder.svg', name: 'AETHER', type: 'File folder', size: '', path: 'C:\\AETHER\\' },
      { icon: 'folder.svg', name: 'Users', type: 'File folder', size: '', path: 'C:\\Users\\' },
      { icon: 'folder.svg', name: 'Program Files', type: 'File folder', size: '', path: 'C:\\Program Files\\' },
      { icon: 'trash.svg', name: 'Recycle Bin', type: 'System folder', size: '', path: 'C:\\Recycle Bin\\' },
      { icon: 'file-text.svg', name: 'AETHER.SYS', type: 'System File', size: '4 KB' }
    ],
    'C:\\AETHER\\': [
      { icon: 'file-text.svg', name: 'WELCOME.TXT', type: 'Text Document', size: '1 KB' },
      { icon: 'folder.svg', name: 'SYSTEM', type: 'File folder', size: '', path: 'C:\\AETHER\\SYSTEM\\' }
    ],
    'C:\\Program Files\\': [
      { icon: 'notepad.svg', name: 'Notepad.exe', type: 'Application', size: '42 KB', app: 'notepad' },
      { icon: 'computer.svg', name: 'Explorer.exe', type: 'Application', size: '58 KB', app: 'explorer' },
      { icon: 'mspaint.svg', name: 'Paint.exe', type: 'Application', size: '76 KB', app: 'paint' },
      { icon: 'browser-globe.svg', name: 'AetherExplorer.exe', type: 'Application', size: '64 KB', app: 'browser' },
      { icon: 'media-video.svg', name: 'Aether Video Player.exe', type: 'Application', size: '72 KB', app: 'video' },
      { icon: 'wangimg128.svg', name: 'Aether Image Viewer.exe', type: 'Application', size: '68 KB', app: 'image' },
      { icon: 'media-audio.svg', name: 'Aether Audio Player.exe', type: 'Application', size: '61 KB', app: 'audio' }
    ],
    'C:\\Users\\': [
      { icon: 'folder.svg', name: 'Unknown', type: 'File folder', size: '', path: 'C:\\Users\\Unknown\\' }
    ],
    'C:\\Users\\Unknown\\': [
      { icon: 'desktop.svg', name: 'Desktop', type: 'File folder', size: '', path: 'C:\\Users\\Unknown\\Desktop\\' },
      { icon: 'downloads.svg', name: 'Downloads', type: 'File folder', size: '', path: 'C:\\Users\\Unknown\\Downloads\\' },
      { icon: 'folder-file.svg', name: 'Documents', type: 'File folder', size: '', path: 'C:\\Users\\Unknown\\Documents\\' },
      { icon: 'pictures.svg', name: 'Pictures', type: 'File folder', size: '', path: 'C:\\Users\\Unknown\\Pictures\\' },
      { icon: 'music.svg', name: 'Music', type: 'File folder', size: '', path: 'C:\\Users\\Unknown\\Music\\' },
      { icon: 'videos.svg', name: 'Videos', type: 'File folder', size: '', path: 'C:\\Users\\Unknown\\Videos\\' }
    ],
    'C:\\Users\\Unknown\\Desktop\\': [
      { icon: 'notepad.svg', name: 'Notepad', type: 'Shortcut', size: '', app: 'notepad' },
      { icon: 'mspaint.svg', name: 'Paint', type: 'Shortcut', size: '', app: 'paint' },
      { icon: 'browser-globe.svg', name: 'AetherExplorer', type: 'Shortcut', size: '', app: 'browser' },
      { icon: 'terminal-glyph', name: 'Aether Console', type: 'Shortcut', size: '', app: 'terminal' }
    ],
    'C:\\Users\\Unknown\\Downloads\\': [],
    'C:\\Users\\Unknown\\Documents\\': [],
    'C:\\Users\\Unknown\\Pictures\\': [],
    'C:\\Users\\Unknown\\Music\\': [],
    'C:\\Users\\Unknown\\Videos\\': [],
    'C:\\Recycle Bin\\': []
  };

  let repositoryManifest = null;
  const repositoryRootUrl = new URL('C/', document.baseURI);
  const toRepositoryPath = source => String(source || '').replace(/^[/\\]+/, '').split('\\').join('/');
  const githubTreeUrl = 'https://api.github.com/repos/SuperZero1288/superzero1288.github.io/git/trees/main?recursive=1';
  const windowsDirectory = parts => parts.length ? `C:\\${parts.join('\\')}\\` : 'C:\\';
  const repositoryIcon = (name, isDirectory = false) => {
    if (isDirectory) return 'folder.svg';
    if (/\.(mp4|webm|mov)$/i.test(name)) return 'media-video.svg';
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return 'wangimg128.svg';
    if (/\.(txt|md|log|json|csv)$/i.test(name)) return 'file-text.svg';
    if (/\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(name)) return 'media-audio.svg';
    return 'file-text.svg';
  };
  const repositoryFileKind = name => {
    if (/\.(mp4|webm|mov)$/i.test(name)) return 'video';
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return 'image';
    if (/\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(name)) return 'audio';
    return 'text';
  };
  const addRepositoryEntry = (directory, entry) => {
    const entries = explorerEntries[directory] || (explorerEntries[directory] = []);
    const existingIndex = entries.findIndex(item => String(item.name).toLowerCase() === String(entry.name).toLowerCase());
    if (existingIndex >= 0) entries[existingIndex] = { ...entries[existingIndex], ...entry };
    else entries.push(entry);
  };
  const syncGitHubTree = async () => {
    try {
      const response = await fetch(githubTreeUrl, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const prefix = 'os/aether/C/';
      const nodes = Array.isArray(payload.tree) ? payload.tree.filter(node => node.path?.startsWith(prefix)) : [];
      nodes.sort((a, b) => a.path.length - b.path.length);
      nodes.forEach(node => {
        const relative = node.path.slice(prefix.length);
        if (!relative || relative === 'manifest.json' || relative.endsWith('/.keep') || relative.includes('/.git/')) return;
        const parts = relative.split('/');
        const name = parts[parts.length - 1];
        const parent = windowsDirectory(parts.slice(0, -1));
        if (node.type === 'tree') {
          const path = windowsDirectory(parts);
          if (!explorerEntries[path]) explorerEntries[path] = [];
          addRepositoryEntry(parent, { icon: repositoryIcon(name, true), name, type: 'File folder', size: '', path });
          return;
        }
        const size = Number(node.size || 0);
        const displaySize = size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : size >= 1024 ? `${Math.ceil(size / 1024)} KB` : `${size} B`;
        addRepositoryEntry(parent, {
          icon: repositoryIcon(name),
          name,
          type: repositoryFileKind(name) === 'video' ? 'Video' : repositoryFileKind(name) === 'image' ? 'Image' : repositoryFileKind(name) === 'audio' ? 'Audio' : 'File',
          size: displaySize,
          source: relative,
          kind: repositoryFileKind(name)
        });
      });
      return nodes.length > 0;
    } catch (error) {
      return false;
    }
  };
  const loadRepositoryFilesystem = async () => {
    const manifestUrl = new URL('manifest.json?v=1.0.21', repositoryRootUrl);
    try {
      const response = await fetch(manifestUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      if (!manifest || typeof manifest.directories !== 'object') throw new Error('Invalid filesystem manifest');
      const imported = {};
      Object.entries(manifest.directories).forEach(([path, entries]) => {
        imported[path] = Array.isArray(entries) ? entries.map(entry => ({ ...entry })) : [];
      });
      explorerEntries = { ...explorerEntries, ...imported };
      repositoryManifest = manifest;
      await syncGitHubTree();
      renderRepositoryDesktopItems();
      setTrayStatus('C: synchronized');
      return true;
    } catch (error) {
      repositoryManifest = null;
      setTrayStatus('C: built-in filesystem');
      return false;
    }
  };

  const openRepositoryFile = async entry => {
    const source = toRepositoryPath(entry.source || entry.path);
    if (!source) return;
    const url = new URL(source, repositoryRootUrl);
    const kind = String(entry.kind || '').toLowerCase();
    if (kind === 'video' || /\.(mp4|webm|mov)$/i.test(source)) {
      openVideoPlayer(entry);
      return;
    }
    if (kind === 'image' || /\.(png|jpe?g|gif|webp|svg)$/i.test(source)) {
      openImageViewer(entry);
      return;
    }
    if (kind === 'audio' || /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(source)) {
      openAudioPlayer(entry);
      return;
    }
    try {
      const response = await fetch(url.href, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      openNotepad(text, entry.name || 'Aether file');
    } catch (error) {
      setTrayStatus(`${entry.name || 'File'} could not be opened`);
    }
  };

  const renderRepositoryDesktopItems = () => {
    const iconRoot = desktop.querySelector('.aether-icons');
    if (!iconRoot) return;
    iconRoot.querySelectorAll('.aether-repository-icon').forEach(item => item.remove());
    const entries = explorerEntries['C:\\Users\\Unknown\\Desktop\\'] || [];
    entries.filter(entry => entry.source || entry.path).forEach(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'aether-icon aether-repository-icon';
      button.title = entry.name;
      const art = document.createElement('span');
      art.className = 'aether-icon-art';
      art.innerHTML = iconMarkup(entry.icon, 'aether-file-icon');
      const label = document.createElement('span');
      label.textContent = entry.name;
      button.append(art, label);
      const activate = () => entry.path ? openExplorer(entry.path) : openRepositoryFile(entry);
      button.addEventListener('dblclick', activate);
      button.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      });
      iconRoot.append(button);
    });
  };

  const openRecycleBin = () => openExplorer('C:\\Recycle Bin\\');

  const openExplorer = (initialPath = 'C:\\') => {
    const root = document.createElement('div');
    root.className = 'aether-explorer';
    root.innerHTML = `
      <div class="aether-explorer-menu"><button type="button">File</button><button type="button">Edit</button><button type="button">View</button><button type="button">Help</button></div>
      <div class="aether-explorer-toolbar"><button type="button" data-explorer-action="back">◀ Back</button><button type="button" data-explorer-action="up">↑ Up</button><button type="button" data-explorer-action="refresh">↻ Refresh</button></div>
      <div class="aether-explorer-address"><strong>Address</strong><span data-explorer-address></span></div>
      <div class="aether-explorer-main"><aside class="aether-explorer-sidebar"><strong>Quick Access</strong><div class="aether-quick-access"><button type="button" data-explorer-path="C:\\Users\\Unknown\\Desktop\\"><img class="aether-quick-icon" src="${iconBase}desktop.svg" alt="">Desktop</button><button type="button" data-explorer-path="C:\\Users\\Unknown\\Downloads\\"><img class="aether-quick-icon" src="${iconBase}downloads.svg" alt="">Downloads</button><button type="button" data-explorer-path="C:\\Users\\Unknown\\Documents\\"><img class="aether-quick-icon" src="${iconBase}folder-file.svg" alt="">Documents</button><button type="button" data-explorer-path="C:\\Users\\Unknown\\Pictures\\"><img class="aether-quick-icon" src="${iconBase}wangimg128.svg" alt="">Pictures</button><button type="button" data-explorer-path="C:\\Users\\Unknown\\Music\\"><img class="aether-quick-icon" src="${iconBase}media-audio.svg" alt="">Music</button><button type="button" data-explorer-path="C:\\Users\\Unknown\\Videos\\"><img class="aether-quick-icon" src="${iconBase}media-video.svg" alt="">Videos</button></div><strong>Other Places</strong><button class="aether-other-place" type="button" data-explorer-path="C:\\"><img class="aether-quick-icon" src="${iconBase}computer.svg" alt="">My Computer</button><button class="aether-other-place" type="button" data-explorer-action="network"><img class="aether-quick-icon" src="${iconBase}network.svg" alt="">Aether Network</button></aside><div class="aether-explorer-content"><table class="aether-explorer-table"><thead><tr><th>Name</th><th>Type</th><th>Size</th></tr></thead><tbody data-explorer-list></tbody></table></div></div>
      <div class="aether-explorer-status" data-explorer-status></div>`;
    const address = root.querySelector('[data-explorer-address]');
    const list = root.querySelector('[data-explorer-list]');
    const statusLine = root.querySelector('[data-explorer-status]');
    const history = [];
    let currentPath = explorerEntries[initialPath] ? initialPath : 'C:\\';

    const openFile = entry => {
      if (entry.source) { openRepositoryFile(entry); return; }
      if (entry.app === 'notepad') openNotepad();
      else if (entry.app === 'explorer') openExplorer();
      else if (entry.app === 'paint') openPaint();
      else if (entry.app === 'browser') openBrowser();
      else if (entry.app === 'video') openVideoPlayer();
      else if (entry.app === 'image') openImageViewer();
      else if (entry.app === 'audio') openAudioPlayer();
      else if (entry.app === 'terminal') openTerminal();
      else if (entry.name === 'WELCOME.TXT') openNotepad();
    };
    const render = () => {
      const entries = explorerEntries[currentPath] || [];
      address.textContent = currentPath;
      statusLine.textContent = `${entries.length} object(s)`;
      list.replaceChildren();
      entries.forEach(entry => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'aether-explorer-entry';
        button.innerHTML = `${iconMarkup(entry.icon)}<strong>${entry.name}</strong>`;
        const activate = () => entry.path ? navigate(entry.path) : openFile(entry);
        button.addEventListener('dblclick', activate);
        button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
        nameCell.append(button);
        const typeCell = document.createElement('td'); typeCell.textContent = entry.type;
        const sizeCell = document.createElement('td'); sizeCell.textContent = entry.size;
        row.append(nameCell, typeCell, sizeCell);
        list.append(row);
      });
    };
    const navigate = path => { history.push(currentPath); currentPath = path; render(); };
    root.querySelectorAll('[data-explorer-path]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.explorerPath)));
    root.querySelector('[data-explorer-action="network"]').addEventListener('click', () => { statusLine.textContent = 'Aether Network is not connected.'; });
    root.querySelector('[data-explorer-action="back"]').addEventListener('click', () => { const previous = history.pop(); if (previous) { currentPath = previous; render(); } });
    root.querySelector('[data-explorer-action="up"]').addEventListener('click', () => { if (currentPath === 'C:\\') return; const parts = currentPath.split('\\').filter(Boolean); parts.pop(); currentPath = parts.length ? `${parts.join('\\')}\\` : 'C:\\'; render(); });
    root.querySelector('[data-explorer-action="refresh"]').addEventListener('click', render);
    root.querySelectorAll('.aether-explorer-menu button').forEach(button => button.addEventListener('click', () => {
      const action = button.textContent.trim();
      if (action === 'File') statusLine.textContent = 'File menu: double-click an item to open it.';
      if (action === 'Edit') list.querySelectorAll('.aether-explorer-entry').forEach(item => item.classList.add('is-selected'));
      if (action === 'View') render();
      if (action === 'Help') statusLine.textContent = 'Aether Explorer — double-click folders and files.';
    }));
    render();
    const title = initialPath === 'C:\\Recycle Bin\\' ? 'Recycle Bin' : 'Explorer.exe';
    createWindow({ title, icon: initialPath === 'C:\\Recycle Bin\\' ? 'trash.svg' : 'computer.svg', body: root, width: 680, height: 430 });
  };

  const openTerminal = () => {
    const consoleRoot = document.createElement('div');
    consoleRoot.className = 'aether-console';
    const output = document.createElement('div');
    output.className = 'aether-console-output';
    const form = document.createElement('form');
    form.className = 'aether-console-form';
    form.innerHTML = '<span>C:\\&gt;</span><input aria-label="Aether Console command" autocomplete="off">';
    const input = form.querySelector('input');
    const write = text => { const line = document.createElement('div'); line.textContent = text; output.append(line); output.scrollTop = output.scrollHeight; };
    write('Microsoft(R) AetherOS Console Version 1.0');
    write('(C) 1997 Omnivast Corporation. All rights reserved.');
    write('Type HELP for help.');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const command = input.value.trim().toLowerCase();
      if (!command) return;
      write(`C:\\>${input.value.trim()}`);
      input.value = '';
      if (command === 'help') write('HELP  VER  DIR  CLS  ABOUT  EXIT');
      else if (command === 'ver') write('AetherOS 1.0 / build 9501');
      else if (command === 'dir') write(' Volume in drive C is AETHER\n Directory of C:\\\n\nAETHER       <DIR>\nUSERS        <DIR>\nPROGRAM FILES <DIR>\nRECYCLE BIN  <DIR>\nAETHER   SYS    4,096  bytes');
      else if (command === 'cls') output.replaceChildren();
      else if (command === 'about') openAbout();
      else if (command === 'exit') closeWindow(record);
      else write(`Bad command or file name: ${command}`);
    });
    consoleRoot.append(output, form);
    const record = createWindow({ title: 'Aether Console', icon: 'terminal-glyph', body: consoleRoot, width: 570, height: 340 });
    requestAnimationFrame(() => input.focus());
  };

  const apps = { explorer: openExplorer, notepad: openNotepad, paint: openPaint, browser: openBrowser, video: openVideoPlayer, image: openImageViewer, audio: openAudioPlayer, about: openAbout, terminal: openTerminal, recycle: openRecycleBin };
  document.querySelectorAll('[data-aether-app]').forEach(button => {
    const launch = () => { startMenu.hidden = true; startButton.setAttribute('aria-expanded', 'false'); apps[button.dataset.aetherApp]?.(); };
    if (button.closest('.aether-start-items')) button.addEventListener('click', launch);
    else button.addEventListener('dblclick', launch);
    button.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      launch();
    });
  });

  startButton.addEventListener('click', () => {
    startMenu.hidden = !startMenu.hidden;
    startButton.setAttribute('aria-expanded', String(!startMenu.hidden));
  });
  let shutdownStarted = false;
  const runShutdown = restart => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    startMenu.hidden = true;
    startButton.setAttribute('aria-expanded', 'false');
    const screen = document.createElement('div');
    screen.className = 'aether-shutdown-screen';
    screen.innerHTML = `<div class="aether-shutdown-panel"><strong>Shutting down AetherOS...</strong><span>${restart ? 'Preparing to restart...' : 'It is now safe to return.'}</span></div>`;
    document.body.append(screen);
    if (restart) sessionStorage.setItem(ticketKey, JSON.stringify({ id: 'restart', expiresAt: Date.now() + 120000 }));
    else sessionStorage.removeItem(ticketKey);
    window.setTimeout(() => { screen.replaceChildren(); screen.classList.add('is-black'); }, 850);
    window.setTimeout(() => restart ? location.reload() : location.replace(new URL('../../', location.href).href), 1250);
  };
  document.getElementById('aetherShutdownButton').addEventListener('click', () => runShutdown(false));
  document.getElementById('aetherRestartButton').addEventListener('click', () => runShutdown(true));
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#aetherStartMenu, #aetherStartButton')) {
      startMenu.hidden = true;
      startButton.setAttribute('aria-expanded', 'false');
    }
  });

  let muted = false;
  const updateClock = () => {
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(now);
  };
  networkStatus.addEventListener('click', () => {
    networkStatus.title = 'LAN: オフライン（接続できません）';
    networkStatus.setAttribute('aria-label', 'LAN: オフライン（接続できません）');
  });
  volumeButton.addEventListener('click', () => {
    muted = !muted;
    volumeButton.setAttribute('aria-pressed', String(muted));
    volumeButton.setAttribute('aria-label', `音量: ${muted ? 'ミュート' : '100パーセント'}`);
    volumeButton.title = `音量: ${muted ? 'ミュート' : '100パーセント'}`;
    volumeIcon.src = `../../assets/aether/icons/${muted ? 'volume-off-tray' : 'volume-on-tray'}.svg`;
    setTrayStatus(muted ? 'Sound muted' : 'Sound 100%');
  });
  updateClock();
  window.setInterval(updateClock, 1000);

  const bootSequence = async () => {
    await loadRepositoryFilesystem();
    const steps = [
      [5, 'Award Modular BIOS v4.51PG', 'AETHER BIOS 1.0', 600],
      [11, 'P5I430TX Aether VXPro BIOS v1.2B    11/04/97', 'System BIOS detected', 520],
      [19, 'Aether Plug and Play BIOS Extension v1.0A', 'Plug and Play services', 500],
      [29, 'PENTIUM-MMX CPU at 200MHz', 'CPU ........ OK', 650],
      [42, 'Memory Test : 65536K OK', 'MEMORY ...... OK', 680],
      [55, 'Detecting IDE Primary Master ... AETHER HDD 2.1GB', 'IDE ........ OK', 720],
      [68, 'Detecting IDE Secondary Master ... None', 'SECONDARY ... NONE', 620],
      [79, 'Aether File Allocation Table ........ OK', 'FAT16 ....... OK', 700],
      [89, 'Loading AetherOS 1.0 kernel ..........', 'KERNEL ...... OK', 760],
      [96, 'Starting Aether desktop services ......', 'SERVICES ..... OK', 720],
      [100, 'Press DEL to enter SETUP', 'SYSTEM READY', 520]
    ];
    for (const [value, message, line, delay] of steps) {
      appendBootLine(message, false);
      appendBootLine(line, value === 100);
      setBootProgress(value, value === 100 ? '起動シーケンスが完了しました' : 'システムを確認しています...');
      await wait(delay);
    }
    log.querySelector('.aether-boot-cursor')?.remove();
    await wait(520);
    boot.hidden = true;
    osBoot.hidden = false;
    requestAnimationFrame(() => osBoot.classList.add('is-visible'));
    const osSteps = [
      [8, 'Loading AetherOS kernel...'],
      [18, 'Checking system hardware...'],
      [31, 'Loading USER.DAT...'],
      [44, 'Starting Aether Explorer...'],
      [57, 'Loading desktop icons...'],
      [69, 'Starting taskbar services...'],
      [82, 'Applying system colors...'],
      [94, 'Preparing your desktop...'],
      [100, 'Welcome to AetherOS 1.0']
    ];
    for (const [value, message] of osSteps) {
      await revealOsBootProgress(value);
      osBootStatus.textContent = message;
      await wait(value === 100 ? 520 : 1120);
    }
    await wait(450);
    osBoot.hidden = true;
    osBoot.classList.remove('is-visible');
    desktop.classList.remove('is-taskbar-visible', 'is-icons-visible');
    desktop.hidden = false;
    await wait(420);
    desktop.classList.add('is-taskbar-visible');
    await wait(360);
    desktop.classList.add('is-icons-visible');
    await wait(260);
    openAbout();
  };

  bootSequence();
})();
