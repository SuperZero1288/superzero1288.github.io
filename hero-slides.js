// 背景スライドショーの2枚目以降を、出番の少し前に1枚ずつ読み込みます。
// 1枚目は style.css で指定しているので、ロード画面が待つのは1枚目だけです。
(() => {
  const slides = document.querySelectorAll('#heroSlider .slides');
  const slideIntervalMs = 4000; // style.css の animation-delay の間隔
  const loadAheadMs = 8000;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const portrait = matchMedia('(orientation: portrait)');

  const photoPath = (index, shape) => `assets/hero/${String(index + 1).padStart(2, '0')}-${shape}.webp`;

  const loadPhoto = async (index) => {
    const image = new Image();
    image.src = photoPath(index, portrait.matches ? 'tall' : 'wide');
    // 失敗しても止めません。写真が出ない間は、前の写真がそのまま見えます。
    await image.decode().catch(() => {});
    slides[index].style.setProperty('--slide-wide', `url('${photoPath(index, 'wide')}')`);
    slides[index].style.setProperty('--slide-tall', `url('${photoPath(index, 'tall')}')`);
  };

  let nextIndex = 1;
  let loading = false;
  const loadUpcomingPhotos = async () => {
    if (loading) return;
    loading = true;
    const startedAt = performance.now();
    // 動きを減らす設定では1枚目だけを表示するので、残りは読み込みません。
    while (nextIndex < slides.length && !reducedMotion.matches) {
      const waitMs = startedAt + nextIndex * slideIntervalMs - loadAheadMs - performance.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (reducedMotion.matches) break;
      await loadPhoto(nextIndex);
      nextIndex += 1;
    }
    loading = false;
  };

  addEventListener('load', loadUpcomingPhotos, {once: true});
  reducedMotion.addEventListener('change', loadUpcomingPhotos);
})();
