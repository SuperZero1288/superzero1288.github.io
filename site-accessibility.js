(() => {
  'use strict';

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const focusableSelector = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable="true"]';
  const dialogs = [];
  const inertBackground = new Map();

  const isAvailable = (element) => element instanceof HTMLElement && element.isConnected
    && !element.closest('[inert], [hidden], [aria-hidden="true"]')
    && !element.matches(':disabled') && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden';

  const focusableElements = (root) => [...root.querySelectorAll(focusableSelector)]
    .filter((element) => element.tabIndex >= 0 && isAvailable(element));

  function focus(element) {
    if (!isAvailable(element)) return false;
    element.focus({preventScroll: true});
    return document.activeElement === element;
  }

  function focusFirst(root, preferred) {
    const target = typeof preferred === 'function' ? preferred() : preferred;
    if (target && root.contains(target) && focus(target)) return target;
    const first = focusableElements(root)[0];
    if (first && focus(first)) return first;
    if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
    focus(root);
    return root;
  }

  function restoreBackground() {
    inertBackground.forEach((wasInert, element) => { element.inert = wasInert; });
    inertBackground.clear();
  }

  function updateBackground() {
    restoreBackground();
    const active = dialogs.at(-1);
    if (!active) return;
    const allowed = [active.scope, ...active.allow].filter((element) => element?.isConnected);
    const visit = (parent) => {
      [...parent.children].forEach((child) => {
        if (!(child instanceof HTMLElement) || child.matches('script, style, link, .site-loader')) return;
        if (allowed.includes(child)) return;
        if (allowed.some((element) => child.contains(element))) visit(child);
        else {
          inertBackground.set(child, child.inert);
          child.inert = true;
        }
      });
    };
    visit(document.body);
  }

  function openDialog(root, {scope = root, allow = [], returnFocus = document.activeElement, initialFocus, onEscape, onClose} = {}) {
    const existing = dialogs.find((entry) => entry.root === root);
    if (existing) return existing;
    const entry = {
      root, scope, allow, returnFocus, onEscape, onClose,
      oldRole: root.getAttribute('role'), oldModal: root.getAttribute('aria-modal')
    };
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    dialogs.push(entry);
    updateBackground();
    const placeFocus = (attempt = 0) => {
      if (dialogs.at(-1) !== entry || !root.isConnected) return;
      // Visibility transitions can still be at their hidden first frame.
      if (!isAvailable(root) && attempt < 4) { requestAnimationFrame(() => placeFocus(attempt + 1)); return; }
      focusFirst(root, initialFocus);
    };
    requestAnimationFrame(() => placeFocus());
    return entry;
  }

  function closeDialog(root, {restoreFocus = true, fallback} = {}) {
    const index = dialogs.findIndex((entry) => entry.root === root);
    if (index < 0) return;
    const [entry] = dialogs.splice(index, 1);
    if (entry.oldRole === null) root.removeAttribute('role');
    else root.setAttribute('role', entry.oldRole);
    if (entry.oldModal === null) root.removeAttribute('aria-modal');
    else root.setAttribute('aria-modal', entry.oldModal);
    updateBackground();
    if (!restoreFocus) return;
    const active = dialogs.at(-1);
    if (active) {
      if (!active.root.contains(document.activeElement)) focusFirst(active.root);
    } else if (!focus(entry.returnFocus)) {
      const target = typeof fallback === 'function' ? fallback() : fallback;
      focus(target || document.querySelector('.floating-search-toggle, [data-open-profile]'));
    }
  }

  document.addEventListener('keydown', (event) => {
    const active = dialogs.at(-1);
    if (!active || event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape') {
      if (active.onEscape?.(event) === false) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!active.onEscape) active.onClose?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = focusableElements(active.root);
    const first = elements[0];
    const last = elements.at(-1);
    if (!first) {
      event.preventDefault();
      focusFirst(active.root);
    } else if (!active.root.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      focus(event.shiftKey ? last : first);
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      focus(first);
    }
  }, true);

  // Also contain focus moved by scripts or assistive technology, not just Tab.
  document.addEventListener('focusin', (event) => {
    const active = dialogs.at(-1);
    if (active && !active.root.contains(event.target)) focusFirst(active.root);
  });

  function enhanceClock(capsule) {
    const popup = capsule.querySelector('.calendar-popup');
    const time = capsule.querySelector('.status-time');
    if (!popup || !time || capsule.querySelector('.clock-button')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clock-button';
    const hint = document.createElement('span');
    hint.id = `${popup.id}-keyboard-hint`;
    hint.hidden = true;
    hint.textContent = '12時間・24時間表示を切り替え。下矢印キーでカレンダーを開く';
    button.setAttribute('aria-describedby', hint.id);
    capsule.insertBefore(hint, popup);
    button.setAttribute('aria-controls', popup.id);
    button.setAttribute('aria-expanded', 'false');
    capsule.insertBefore(button, time);
    button.append(time);
    popup.setAttribute('role', 'group');
    popup.setAttribute('aria-label', '日付を選択してコピー');

    const close = () => {
      capsule.classList.remove('calendar-keyboard-open');
      button.setAttribute('aria-expanded', 'false');
    };
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      capsule.classList.add('calendar-keyboard-open');
      button.setAttribute('aria-expanded', 'true');
      const target = popup.querySelector('button.is-today') || popup.querySelector('button');
      const placeFocus = (attempt = 0) => {
        if (!capsule.classList.contains('calendar-keyboard-open') || document.activeElement !== button) return;
        if (!focus(target) && attempt < 4) requestAnimationFrame(() => placeFocus(attempt + 1));
      };
      placeFocus();
    });
    popup.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        focus(button);
        return;
      }
      const days = [...popup.querySelectorAll('button.calendar-day-cell')];
      const index = days.indexOf(document.activeElement);
      const step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7}[event.key];
      if (index < 0 || step === undefined) return;
      event.preventDefault();
      focus(days[Math.max(0, Math.min(days.length - 1, index + step))]);
    });
    capsule.addEventListener('focusout', (event) => {
      if (!capsule.contains(event.relatedTarget)) close();
    });
    capsule.addEventListener('pointerenter', () => button.setAttribute('aria-expanded', 'true'));
    capsule.addEventListener('pointerleave', () => {
      if (!capsule.classList.contains('calendar-keyboard-open')) button.setAttribute('aria-expanded', 'false');
    });
  }

  const init = () => document.querySelectorAll('.time-capsule').forEach(enhanceClock);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();

  window.zeroA11y = {
    focus, focusFirst, focusableElements, isAvailable, openDialog, closeDialog, enhanceClocks: init,
    get activeDialog() { return dialogs.at(-1)?.root || null; },
    get reducedMotion() { return motionPreference.matches; }
  };
})();
