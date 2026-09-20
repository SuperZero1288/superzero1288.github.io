(() => {
  const selector = [
    '.grid-item',
    '.note-article[href]',
    '.note-profile-link[href]',
    '.profile-more-button',
    '.app-launcher-item:not(:disabled)',
    '.directory-link[href]',
    '.latest-feed .youtube-video[href]',
    '.github-repository[href]',
    '.feed-empty-card[href]',
    '.edge-link-list > a',
    '.floating-bookmark-item > a',
    '.explorer-item'
  ].join(',');

  const reset = (card) => {
    card.style.setProperty('--card-rotate-x', '0deg');
    card.style.setProperty('--card-rotate-y', '0deg');
    card.style.setProperty('--card-scale', '1');
  };

  const updateTilt = (card, event) => {
    if (!document.body.classList.contains('style-default') || event.pointerType === 'touch') return;
    const rect = card.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    card.style.setProperty('--card-rotate-x', `${((0.5 - y) * 14).toFixed(2)}deg`);
    card.style.setProperty('--card-rotate-y', `${((x - 0.5) * 14).toFixed(2)}deg`);
    card.style.setProperty('--card-scale', '1.06');
  };

  const init = () => {
    document.querySelectorAll(selector).forEach((card) => {
      if (card.dataset.cardHoverReady === 'true') return;
      card.dataset.cardHoverReady = 'true';
      card.classList.add('card-hover-target');
      card.addEventListener('pointerenter', (event) => updateTilt(card, event), {passive: true});
      card.addEventListener('pointermove', (event) => updateTilt(card, event), {passive: true});
      card.addEventListener('mouseenter', (event) => updateTilt(card, event), {passive: true});
      card.addEventListener('mousemove', (event) => updateTilt(card, event), {passive: true});
      card.addEventListener('pointerleave', () => reset(card));
      card.addEventListener('pointercancel', () => reset(card));
      card.addEventListener('mouseleave', () => reset(card));
      reset(card);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();

  const observer = new MutationObserver(init);
  observer.observe(document.documentElement, {childList: true, subtree: true});
})();
