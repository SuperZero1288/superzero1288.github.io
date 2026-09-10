(() => {
  const loader = document.getElementById('siteLoader');
  if (!loader) return;

  const progress = loader.querySelector('.site-loader-progress');
  const status = loader.querySelector('.site-loader-status');
  const percentLabel = loader.querySelector('.site-loader-percent');
  const startedAt = performance.now();
  const minimumVisibleMs = 320;
  const maximumWaitMs = 15000;

  const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

  const createTransitionLoader = () => {
    const transitionLoader = document.createElement('div');
    transitionLoader.className = 'site-loader';
    transitionLoader.setAttribute('role', 'status');
    transitionLoader.setAttribute('aria-live', 'polite');
    transitionLoader.setAttribute('aria-label', '設定を適用しています');
    transitionLoader.innerHTML = `
      <div class="site-loader-content">
        <div class="site-loader-meta"><p class="site-loader-status">設定を準備中</p><span class="site-loader-percent">0%</span></div>
        <div class="site-loader-progress" role="progressbar" aria-label="設定変更の進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
      </div>`;
    return transitionLoader;
  };

  let transitionQueue = Promise.resolve();
  const playTransition = (label = '設定を適用しています', action = () => {}) => {
    const run = async () => {
      const transitionLoader = createTransitionLoader();
      const transitionProgress = transitionLoader.querySelector('.site-loader-progress');
      const transitionStatus = transitionLoader.querySelector('.site-loader-status');
      const transitionPercent = transitionLoader.querySelector('.site-loader-percent');
      const setProgress = (value, text) => {
        transitionProgress.style.setProperty('--loader-progress', `${value}%`);
        transitionProgress.setAttribute('aria-valuenow', String(value));
        transitionPercent.textContent = `${value}%`;
        if (text) transitionStatus.textContent = text;
      };

      document.documentElement.classList.add('site-is-loading');
      document.body.appendChild(transitionLoader);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      setProgress(22, '設定を読み込んでいます');
      await wait(140);
      setProgress(58, label);

      let result;
      let actionError;
      try {
        result = await action();
      } catch (error) {
        actionError = error;
      }

      setProgress(86, '表示を更新しています');
      await wait(180);
      setProgress(100, '変更を適用しました');
      await wait(180);
      transitionLoader.classList.add('is-complete');
      document.documentElement.classList.remove('site-is-loading');
      await wait(400);
      transitionLoader.remove();
      if (actionError) throw actionError;
      return result;
    };

    transitionQueue = transitionQueue.then(run, run);
    return transitionQueue;
  };

  let navigating = false;
  const navigate = (url, label = 'ページを読み込んでいます') => {
    if (navigating) return Promise.resolve(false);
    const target = new URL(url, location.href);
    if (target.origin !== location.origin) {
      window.open(target.href, '_blank', 'noopener');
      return Promise.resolve(true);
    }
    navigating = true;
    const navigationLoader = createTransitionLoader();
    const navigationProgress = navigationLoader.querySelector('.site-loader-progress');
    const navigationStatus = navigationLoader.querySelector('.site-loader-status');
    const navigationPercent = navigationLoader.querySelector('.site-loader-percent');
    const setProgress = (value, text) => {
      navigationProgress.style.setProperty('--loader-progress', `${value}%`);
      navigationProgress.setAttribute('aria-valuenow', String(value));
      navigationPercent.textContent = `${value}%`;
      navigationStatus.textContent = text;
    };
    document.documentElement.classList.add('site-is-loading');
    document.body.appendChild(navigationLoader);
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      .then(() => { setProgress(18, '移動先を確認しています'); return wait(90); })
      .then(() => { setProgress(54, label); return wait(120); })
      .then(() => {
        setProgress(82, 'ページを切り替えています');
        location.assign(target.href);
        setTimeout(() => {
          navigating = false;
          document.documentElement.classList.remove('site-is-loading');
          navigationLoader.remove();
        }, 1800);
        return true;
      });
  };

  window.zeroSiteLoader = { playTransition, navigate };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download') || anchor.dataset.noPageTransition !== undefined) return;
    if (anchor.target && anchor.target.toLowerCase() !== '_self') return;
    const target = new URL(anchor.href, location.href);
    if (!['http:', 'https:'].includes(target.protocol) || target.origin !== location.origin) return;
    if (target.pathname === location.pathname && target.search === location.search && target.hash) return;
    event.preventDefault();
    navigate(target.href, anchor.dataset.loadingLabel || 'ページを読み込んでいます');
  });

  document.documentElement.classList.add('site-is-loading');

  const inlineImageUrls = [...document.images].map((image) => image.currentSrc || image.src);
  const backgroundImageUrls = [...document.querySelectorAll('body *')].flatMap((element) => {
    const value = getComputedStyle(element).backgroundImage;
    return [...value.matchAll(/url\(["']?(.+?)["']?\)/g)].map((match) => new URL(match[1], location.href).href);
  });
  const imageUrls = [...inlineImageUrls, ...backgroundImageUrls]
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index);

  let completed = 0;
  const pendingUrls = new Set(imageUrls);

  const getAssetLabel = (url) => {
    const value = url.toLowerCase();
    if (value.includes('i.ibb.co')) return '背景画像';
    if (value.includes('/blog/') || value.includes('/cover-')) return '記事画像';
    if (value.includes('avatar') || value.includes('profile')) return 'プロフィール画像';
    if (/\.(svg|ico)(?:[?#]|$)/.test(value)) return 'サービスアイコン';
    return '画像';
  };

  const updateProgress = () => {
    const total = imageUrls.length;
    const percent = total ? Math.round((completed / total) * 100) : 100;
    if (progress) progress.style.setProperty('--loader-progress', `${percent}%`);
    if (progress) progress.setAttribute('aria-valuenow', String(percent));
    if (percentLabel) percentLabel.textContent = `${percent}%`;
    if (status) {
      const nextUrl = pendingUrls.values().next().value;
      status.textContent = completed < total && nextUrl
        ? `${getAssetLabel(nextUrl)}を読み込んでいます`
        : 'ページを表示します';
    }
  };

  const loadImage = (url) => new Promise((resolve) => {
    const image = new Image();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      pendingUrls.delete(url);
      completed += 1;
      updateProgress();
      resolve();
    };
    image.onload = finish;
    image.onerror = finish;
    image.src = url;
    if (image.complete) finish();
  });

  const waitForAssets = Promise.all(imageUrls.map(loadImage));
  const safetyTimeout = new Promise((resolve) => setTimeout(resolve, maximumWaitMs));

  updateProgress();
  Promise.race([waitForAssets, safetyTimeout]).then(() => {
    const remaining = Math.max(0, minimumVisibleMs - (performance.now() - startedAt));
    setTimeout(() => {
      if (status) status.textContent = 'ページを表示します';
      if (percentLabel) percentLabel.textContent = '100%';
      if (progress) progress.setAttribute('aria-valuenow', '100');
      loader.classList.add('is-complete');
      document.documentElement.classList.remove('site-is-loading');
      setTimeout(() => loader.remove(), 450);
    }, remaining);
  });
})();
