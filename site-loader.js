(() => {
  const loader = document.getElementById('siteLoader');
  if (!loader) return;

  const progress = loader.querySelector('.site-loader-progress');
  const status = loader.querySelector('.site-loader-status');
  const startedAt = performance.now();
  const minimumVisibleMs = 500;
  const maximumWaitMs = 15000;

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
  const updateProgress = () => {
    const total = imageUrls.length;
    const percent = total ? Math.round((completed / total) * 100) : 100;
    if (progress) progress.style.setProperty('--loader-progress', `${percent}%`);
    if (status) status.textContent = total ? `LOADING ASSETS ${completed} / ${total}` : 'READY';
  };

  const loadImage = (url) => new Promise((resolve) => {
    const image = new Image();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
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
      if (status) status.textContent = 'READY';
      loader.classList.add('is-complete');
      document.documentElement.classList.remove('site-is-loading');
      setTimeout(() => loader.remove(), 650);
    }, remaining);
  });
})();
