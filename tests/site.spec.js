const {test, expect} = require('@playwright/test');
const {AxeBuilder} = require('@axe-core/playwright');
const fs = require('node:fs');
const path = require('node:path');
const tree = require('./fixtures/catalog-tree.json');
const infos = require('./fixtures/catalog-infos.json');
const transparentPNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=', 'base64');
const assetCount = tree.tree.filter((entry) => entry.type === 'tree' && entry.path.endsWith('.ast')).length;
const assetPath = 'Avatar.cat/Aura.cat/Illusionary.ast';
const rootPath = path.resolve(__dirname, '..');

const runtimeErrors = new WeakMap();
test.beforeEach(async ({page}) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({page}) => {
  if (test.info().status === test.info().expectedStatus) expect(runtimeErrors.get(page)).toEqual([]);
});

async function mockNetwork(page) {
  const state = {catalogStatus: 200, infoStatus: 200, delayedInfo: false, pending: [], infoBodies: {...infos}};
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    if (url.hostname === 'api.github.com' && url.pathname.includes('/Zeroichiba-Workshop/git/trees/')) {
      return route.fulfill({status: state.catalogStatus, contentType: 'application/json', body: JSON.stringify(tree)});
    }
    if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/Zeroichiba-Workshop/main/')) {
      const name = decodeURIComponent(url.pathname.split('/Zeroichiba-Workshop/main/')[1]);
      if (name.endsWith('/info.txt')) {
        if (state.delayedInfo) await new Promise((resolve) => state.pending.push(resolve));
        return route.fulfill({status: state.infoStatus, contentType: 'text/plain; charset=utf-8', body: state.infoBodies[name] || ''});
      }
    }
    if (route.request().resourceType() === 'image') return route.fulfill({status: 200, contentType: 'image/png', body: transparentPNG});
    // Tests do not depend on external services, feeds, sound servers or API quotas.
    return route.abort('blockedbyclient');
  });
  return state;
}

async function ready(page, url = '/vrchat-assets/') {
  await page.goto(url);
  await expect(page.locator('#siteLoader')).toHaveCount(0);
  if (url.includes('/vrchat-assets/')) await expect(page.locator('#catalogFileList')).toHaveAttribute('aria-busy', 'false');
}

async function audit(page) {
  // Give view-enter transitions time to finish before measuring color contrast.
  await page.waitForTimeout(250);
  const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.map((item) => ({id: item.id, targets: item.nodes.map((node) => node.target)}));
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('the photo-first hero, existing article link and loader remain in place', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  expect(await page.locator('.slides').count()).toBe(13);
  expect(await page.locator('#hero h1, #hero h2, #hero a, #hero button').count()).toBe(0);
  expect(await page.locator('#snapContainer').evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator('#noteArticles a').first()).toHaveAttribute('href', /^blog\/n[0-9a-f]+\.html$/);
  await expect(page.locator('script[src^="site-loader.js"]')).toHaveAttribute('src', /^site-loader\.js\?v=/);
});

test('catalogue can be opened with Enter and Back restores the selected card', async ({page}) => {
  await mockNetwork(page);
  await ready(page);
  const category = page.locator('[data-open-category="Avatar.cat"]');
  await category.focus();
  await category.press('Enter');
  await expect(page.locator('[data-catalog-focus]').first()).toHaveText('Avatar');
  await expect(page.locator('[data-catalog-focus]').first()).toBeFocused();
  await page.locator('[data-open-category="Avatar.cat/Aura.cat"]').press('Enter');
  await expect(page.locator('[data-catalog-focus]').first()).toHaveText('Aura');
  const asset = page.locator(`[data-open-asset="${assetPath}"]`);
  await asset.press('Enter');
  await expect(page).toHaveURL(/\?asset=Avatar.cat%2FAura.cat%2FIllusionary.ast$/);
  await expect(page.locator('.catalog-detail h3')).toBeFocused();
  await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.catalog-dependency')).toHaveCount(5);
  const download = page.locator('.catalog-download-link');
  await expect(download).toHaveAttribute('target', '_blank');
  await expect(download).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(download).toHaveAttribute('href', /Illusionary_VRC\.unitypackage\?download=1$/);
  await page.locator('#catalogBack').click();
  await expect(asset).toBeFocused();
  await expect(page).toHaveURL(/\?category=Avatar.cat%2FAura.cat$/);
  await page.goForward();
  await expect(page.locator('.catalog-detail h3')).toBeFocused();
});

test('direct asset links, parent navigation and invalid paths are handled', async ({page}) => {
  await mockNetwork(page);
  await ready(page, `/vrchat-assets/?asset=${encodeURIComponent(assetPath)}`);
  await expect(page.locator('.catalog-detail')).toHaveCount(1);
  await page.locator('#catalogBack').click();
  await expect(page).toHaveURL(/\?category=Avatar.cat%2FAura.cat$/);
  await page.locator('#catalogBack').click();
  await expect(page).toHaveURL(/\?category=Avatar.cat$/);
  await ready(page, '/vrchat-assets/?asset=missing.ast');
  await expect(page.locator('.catalog-item-card')).toHaveCount(assetCount);
  await expect(page).toHaveURL(/\/vrchat-assets\/$/);
});

test('the library shows a divider between sections and enlarges its leading cards', async ({page}) => {
  await mockNetwork(page);
  await ready(page);
  const order = await page.locator('#catalogFileList > *').evaluateAll((nodes) => nodes.map((node) => {
    if (node.matches('.catalog-section-divider')) return 'divider';
    if (node.matches('.catalog-category-grid')) return 'categories';
    if (node.matches('.catalog-item-grid')) return 'assets';
    return node.querySelector('h3').textContent;
  }));
  expect(order).toEqual(['カテゴリから探す', 'categories', 'divider', 'すべてのアセット', 'assets']);
  expect(await page.locator('.catalog-section-divider').evaluate((element) => element.getBoundingClientRect().width > 0)).toBe(true);
  const featured = page.locator('.catalog-category-card.is-featured');
  await expect(featured).toHaveCount(2);
  expect(await featured.evaluateAll((cards) => cards.every((card) => card.getBoundingClientRect().height >= 152))).toBe(true);
  // The category cards keep their name and count only; the explanatory line is gone.
  await expect(page.locator('.catalog-category-copy > span')).toHaveCount(0);
  await expect(page.locator('.catalog-brand')).toHaveText('VRChat向けアセット');
  await expect(page.locator('.catalog-kicker')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('いつもの空間に');
  await expectNoHorizontalOverflow(page);
  // Catalogue cards react through the shared home page tilt rather than a local lift.
  expect(await page.locator('.catalog-item-card').first()
    .evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  await page.locator('.catalog-item-card').first().hover();
  await expect.poll(() => page.locator('.catalog-item-card').first()
    .evaluate((element) => element.style.getPropertyValue('--card-scale'))).toBe('1.06');
});

test('download section has a keyboard-accessible jump target', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await mockNetwork(page);
  await ready(page, `/vrchat-assets/?asset=${encodeURIComponent(assetPath)}`);
  await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.catalog-primary-link').press('Enter');
  await expect(page.locator('.catalog-download-link')).toBeFocused();
  await expect(page.locator('.catalog-download-link')).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});

test('API failure offers retry; a failed refresh retains the previous catalogue', async ({page}) => {
  const network = await mockNetwork(page);
  network.catalogStatus = 403;
  await ready(page);
  await expect(page.locator('#catalogFileList')).toContainText('アクセス上限');
  await expect(page.locator('#catalogRefresh')).toBeEnabled();
  network.catalogStatus = 200;
  await page.getByRole('button', {name: 'もう一度読み込む'}).click();
  await expect(page.locator('.catalog-item-card')).toHaveCount(assetCount);
  network.catalogStatus = 429;
  await page.locator('#catalogRefresh').click();
  await expect(page.locator('#catalogStatus')).toContainText('前回取得したカタログ');
  await expect(page.locator('.catalog-item-card')).toHaveCount(assetCount);
  await expect(page.locator('#catalogRefresh')).toBeEnabled();
});

test('info.txt failure does not hide downloads or strand focus', async ({page}) => {
  const network = await mockNetwork(page);
  network.infoStatus = 500;
  await ready(page, `/vrchat-assets/?asset=${encodeURIComponent(assetPath)}`);
  await expect(page.locator('.catalog-info-sections')).toContainText('説明を読み込めませんでした');
  await expect(page.locator('.catalog-download-link')).toHaveCount(1);
  network.infoStatus = 200;
  await page.getByRole('button', {name: '説明を再読み込み'}).click();
  await expect(page.locator('.catalog-detail h3')).toBeFocused();
  await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.catalog-dependency')).toHaveCount(5);
});

test('late detail responses cannot replace a directory after navigating back', async ({page}) => {
  const network = await mockNetwork(page);
  network.delayedInfo = true;
  await ready(page);
  await page.locator(`[data-open-asset="${assetPath}"]`).click();
  await expect.poll(() => network.pending.length).toBe(1);
  await page.locator('#catalogBack').click();
  await expect(page.locator('.catalog-item-card')).toHaveCount(assetCount);
  network.delayedInfo = false;
  network.pending.forEach((resolve) => resolve());
  await page.waitForTimeout(150);
  await expect(page.locator('.catalog-detail')).toHaveCount(0);
  await expect(page.locator(`[data-open-asset="${assetPath}"]`)).toBeFocused();
});

test('local previews match source SHAs and stay small', async ({page}) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootPath, 'vrchat-assets/previews/manifest.json')));
  for (const [name, preview] of Object.entries(manifest)) {
    expect(tree.tree.find((entry) => entry.path === name)?.sha).toBe(preview.sha);
    for (const key of ['small', 'large']) {
      const file = path.join(rootPath, preview[key].replace(/^\//, ''));
      expect(fs.statSync(file).size).toBeLessThan(120000);
    }
  }
  await mockNetwork(page);
  await ready(page);
  await expect.poll(() => page.locator('.catalog-item-art img').evaluateAll((images) => images.every((image) => image.naturalWidth > 0))).toBe(true);
  expect(await page.locator('.catalog-item-art img').evaluateAll((images) => images.every((image) => image.src.includes('/vrchat-assets/previews/')))).toBe(true);
});

for (const viewport of [{width: 320, height: 640}, {width: 390, height: 844}, {width: 768, height: 1024}, {width: 844, height: 390}, {width: 1440, height: 900}]) {
  test(`catalogue layout and detail fit ${viewport.width}×${viewport.height}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await mockNetwork(page);
    await ready(page);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#catalogRefresh svg')).toBeVisible();
    if (viewport.width === 1440) await expect(page.locator('.catalog-item-copy strong').last()).toBeInViewport();
    await page.locator(`[data-open-asset="${assetPath}"]`).click();
    await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
    await expectNoHorizontalOverflow(page);
    await page.locator('.catalog-primary-link').click();
    await expect(page.locator('.catalog-download-link')).toBeInViewport();
  });
}

const appearances = [
  {style: 'style-default', light: false}, {style: 'style-default', light: true},
  {style: 'style-material', light: false}, {style: 'style-material', light: true},
  {style: 'style-liquidglass', light: false}, {style: 'style-liquidglass', light: true},
  {style: 'style-fluent', light: false}, {style: 'style-fluent', light: true},
  {style: 'style-vrchat', light: false}, {style: 'style-unity', light: false}
];
for (const appearance of appearances) {
  test(`catalogue contrast and semantics: ${appearance.style} ${appearance.light ? 'light' : 'dark'}`, async ({page}) => {
    await mockNetwork(page);
    await page.addInitScript((state) => localStorage.setItem('zero-site-appearance', JSON.stringify(state)), appearance);
    await ready(page);
    expect(await audit(page)).toEqual([]);
    await page.locator(`[data-open-asset="${assetPath}"]`).click();
    await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
    expect(await audit(page)).toEqual([]);
  });
}

test('mobile profile contains Tab/Shift+Tab, excludes background and restores its opener', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await mockNetwork(page);
  await ready(page, '/#main-content');
  const opener = page.locator('[data-open-profile]');
  await opener.press('Enter');
  const close = page.locator('[data-close-profile]');
  const scroll = page.locator('.profile-modal-body');
  await expect(close).toBeFocused();
  expect(await page.locator('#snapContainer').evaluate((element) => element.inert)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(scroll).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(scroll).toBeFocused();
  expect(await audit(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  expect(await page.locator('#snapContainer').evaluate((element) => element.inert)).toBe(false);
});

test('search modal traps focus, handles bookmark cancellation and restores its toggle', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/links.html');
  const toggle = page.locator('.floating-search-toggle');
  await toggle.press('Enter');
  const surface = page.locator('.floating-search-surface');
  const input = surface.locator('input[type="search"]');
  await expect(input).toBeFocused();
  const last = surface.locator('.floating-bookmark-add');
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(surface.locator('.floating-search-close')).toBeFocused();
  await surface.locator('.floating-bookmark-add').click();
  await expect(surface.locator('[name="bookmarkName"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(surface.locator('.floating-bookmark-add')).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.locator('.floating-search-panel').evaluate((element) => element.inert)).toBe(true);
});

for (const width of [390, 1440]) {
  test(`hero tabs can be reached with the keyboard and closed with Esc at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await mockNetwork(page);
    await ready(page, '/');
    const tab = page.locator('#navigationWingTab');
    await page.keyboard.press('Tab');
    await tab.focus();
    await expect.poll(() => tab.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    await tab.press('Enter');
    await expect(page.locator('#navigationCard')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#navigationCard [data-close-edge-card]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#navigationCard')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(tab).toBeFocused();
    await expect(page.locator('#navigationCard')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#navigationCard')).toHaveAttribute('inert', '');
    expect(await page.locator('#snapContainer').evaluate((element) => element.inert)).toBe(false);
  });
}

test('device panel uses valid definition lists and contains keyboard focus', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  await page.locator('#deviceWingTab').press('Enter');
  await expect(page.locator('#deviceCard')).toHaveAttribute('aria-hidden', 'false');
  expect(await audit(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#deviceWingTab')).toBeFocused();
});

for (const url of ['/', '/links.html']) {
  test(`clock and calendar work without a mouse on ${url}`, async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockNetwork(page);
    await ready(page, url);
    const clock = page.locator('.clock-button');
    await expect(clock).toHaveAccessibleName(/\d{1,2}:\d{2}/);
    await clock.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.calendar-day-cell.is-today')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => document.activeElement.matches('button.calendar-day-cell'))).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast-notification')).toContainText('コピーしました');
    await page.keyboard.press('Escape');
    await expect(clock).toBeFocused();
    await expect(clock).toHaveAttribute('aria-expanded', 'false');
  });
}

test('minimized and closed apps leave no hidden focused controls', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  await page.keyboard.press('Control+Alt+t');
  const command = page.getByRole('textbox', {name: 'コマンド'});
  await expect(command).toBeFocused();
  await command.fill('help');
  await command.press('Enter');
  await expect(page.locator('.terminal-output')).toContainText('利用できるコマンド');
  await page.locator('.app-window [data-window-action="minimize"]').click();
  await expect(page.locator('.desktop-task-item')).toBeFocused();
  await expect(page.locator('.app-window')).toHaveAttribute('inert', '');
  await page.locator('.desktop-task-item').press('Enter');
  await expect(command).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-window')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[inert]')))).toBe(false);
});

test('reduced motion retains a photo, stops idle animation and clears pointer tilts', async ({page}) => {
  await mockNetwork(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await ready(page, '/');
  const motion = () => page.evaluate(() => ({
    slides: [...document.querySelectorAll('.slides')].map((element) => ({animation: getComputedStyle(element).animationName, opacity: getComputedStyle(element).opacity})),
    guide: getComputedStyle(document.querySelector('#scrollIndicator')).animationName,
    arrow: getComputedStyle(document.querySelector('.scroll-arrow')).animationName,
    scroll: getComputedStyle(document.querySelector('#snapContainer')).scrollBehavior
  }));
  const reduced = await motion();
  expect(reduced.slides.every((slide) => slide.animation === 'none')).toBe(true);
  expect(reduced.slides[0].opacity).toBe('1');
  expect(reduced.slides.slice(1).every((slide) => slide.opacity === '0')).toBe(true);
  expect(reduced.guide).toBe('none');
  expect(reduced.arrow).toBe('none');
  expect(reduced.scroll).toBe('auto');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await expect.poll(async () => (await motion()).slides[0].animation).toBe('slideAnimation');
  await page.locator('#gallery-twitter').hover();
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect.poll(() => page.locator('#gallery-twitter').evaluate((element) => element.style.getPropertyValue('--card-scale'))).toBe('1');
});

test('reduced motion also disables catalogue entering animations', async ({page}) => {
  await mockNetwork(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await ready(page);
  await page.locator(`[data-open-asset="${assetPath}"]`).click();
  expect(await page.locator('#catalogFileList').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

for (const url of ['/links.html', '/blog/n8d41d4a76214.html', '/404.html']) {
  test(`shared page remains accessible: ${url}`, async ({page}) => {
    await mockNetwork(page);
    await ready(page, url);
    expect(await audit(page)).toEqual([]);
  });
}


test('AetherOS windows restore focus and respect reduced-motion screensaver settings', async ({page}) => {
  await mockNetwork(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.clock.install();
  await page.addInitScript(() => sessionStorage.setItem('aether-boot-ticket', JSON.stringify({expiresAt: Date.now() + 120000})));
  await page.goto('/os/aether/');
  await page.clock.runFor(25000);
  await expect(page.locator('#aether-desktop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.aether-window')).toHaveCount(0);
  const icon = page.locator('.aether-icon[data-aether-app="notepad"]');
  await icon.press('Enter');
  const editor = page.locator('.aether-window textarea');
  await expect(editor).toBeFocused();
  await page.locator('.aether-window [data-window-action="minimize"]').click();
  await expect(page.locator('.aether-task-button')).toBeFocused();
  await expect(page.locator('.aether-window')).toHaveAttribute('inert', '');
  await page.locator('.aether-task-button').press('Enter');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.aether-window')).toHaveCount(0);
  await expect(icon).toBeFocused();
  await page.clock.runFor(121000);
  await expect(page.locator('.aether-screensaver')).toBeHidden();
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.clock.runFor(121000);
  await expect(page.locator('.aether-screensaver')).toBeVisible();
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(page.locator('.aether-screensaver')).toBeHidden();
});

test('Vastique windows are keyboard-usable and the Dock restores minimized documents', async ({page}) => {
  await mockNetwork(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript(() => sessionStorage.setItem('vastique-boot-ticket', JSON.stringify({expiresAt: Date.now() + 120000})));
  await page.goto('/os/vastique/');
  await expect(page.locator('#vDesktop')).toBeVisible();
  const dock = page.locator('.v-dock [data-v-app="textedit"]');
  await dock.press('Enter');
  const editor = page.locator('textarea[aria-label="TextEdit document"]');
  await expect(editor).toBeFocused();
  await editor.fill('Keyboard document');
  const window = page.locator('.v-window').filter({has: editor});
  await window.locator('[data-v-window="min"]').click();
  await expect(dock).toBeFocused();
  await expect(window).toHaveAttribute('inert', '');
  await dock.press('Enter');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Keyboard document');
  await expect(page.locator('.v-window')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.v-window')).toHaveCount(1);
  expect(await page.evaluate(() => document.activeElement.closest('.v-window') !== null)).toBe(true);
});


test('an offline reload uses the previously cached tree', async ({page}) => {
  const network = await mockNetwork(page);
  await ready(page);
  network.catalogStatus = 503;
  await page.reload();
  await expect(page.locator('#siteLoader')).toHaveCount(0);
  await expect(page.locator('.catalog-item-card')).toHaveCount(assetCount);
  await expect(page.locator('#catalogStatus')).toContainText('前回取得したカタログ');
});

test('repository descriptions cannot inject HTML or javascript links', async ({page}) => {
  const network = await mockNetwork(page);
  network.infoBodies[`${assetPath}/info.txt`] = '# Safe title\n<script>window.catalogUnsafe = true</script>\n[unsafe](javascript:alert(1))\n[valid](https://example.com/)';
  await ready(page, `/vrchat-assets/?asset=${encodeURIComponent(assetPath)}`);
  await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.catalog-markdown')).toContainText('<script>');
  await expect(page.locator('.catalog-info-sections script, .catalog-info-sections a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.catalogUnsafe)).toBeUndefined();
  await expect(page.locator('.catalog-markdown a')).toHaveAttribute('href', 'https://example.com/');
});

test('closing an app while another is minimized returns to the remaining task button', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  await page.keyboard.press('Control+Alt+t');
  await page.locator('.app-window [data-window-action="minimize"]').click();
  await page.keyboard.press('Control+Alt+t');
  await expect(page.locator('.app-window')).toHaveCount(2);
  await expect(page.locator('.app-window:not([inert]) input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-window')).toHaveCount(1);
  await expect(page.locator('.desktop-task-item')).toBeFocused();
  await page.locator('.desktop-task-item').press('Enter');
  await expect(page.locator('.app-window input')).toBeFocused();
});


test('bookmark limit and deletion do not leave focus in hidden or removed controls', async ({page}) => {
  await mockNetwork(page);
  await page.addInitScript(() => localStorage.setItem('zero-browser-bookmarks', JSON.stringify(Array.from({length: 11}, (_, index) => ({name: `Site ${index}`, url: `https://example.com/?item=${index}`})))));
  await ready(page, '/links.html');
  await page.locator('.floating-search-toggle').press('Enter');
  await page.locator('.floating-bookmark-add').click();
  await page.locator('[name="bookmarkName"]').fill('Last site');
  await page.locator('[name="bookmarkUrl"]').fill('https://example.com/last');
  await page.locator('.floating-bookmark-editor button[type="submit"]').click();
  await expect(page.locator('.floating-bookmark-add')).toBeDisabled();
  await expect(page.locator('.floating-bookmark-item').last().locator('a')).toBeFocused();
  await page.locator('.floating-bookmark-item').last().locator('button').press('Enter');
  await expect(page.locator('.floating-bookmark-add')).toBeFocused();
  await expect(page.locator('.floating-bookmark-item')).toHaveCount(11);
  expect(await page.locator('.floating-bookmark-add').evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
});


test('search and calendar remain visible and usable while a modeless app is open', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  await page.keyboard.press('Control+Alt+t');
  await expect(page.getByRole('textbox', {name: 'コマンド'})).toBeFocused();
  await page.locator('.clock-button').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.calendar-day-cell.is-today')).toBeFocused();
  const date = page.locator('button.calendar-day-cell').last();
  await date.focus();
  expect(await date.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('.floating-search-toggle').press('Enter');
  const search = page.locator('.floating-search-surface input[type="search"]');
  await expect(search).toBeFocused();
  expect(await search.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
  })).toBe(true);
  await expect(page.locator('#desktopLayer')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.floating-search-toggle')).toBeFocused();
  expect(await page.locator('#desktopLayer').evaluate((element) => element.inert)).toBe(false);
  await expect(page.locator('.app-window')).toHaveCount(1);
});
