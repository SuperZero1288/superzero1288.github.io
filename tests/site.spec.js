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

test('the legacy photo-first hero, existing article link and loader remain in place', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/legacy/');
  expect(await page.locator('.slides').count()).toBe(13);
  expect(await page.locator('#hero h1, #hero h2, #hero a, #hero button').count()).toBe(0);
  expect(await page.locator('#snapContainer').evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator('#noteArticles a').first()).toHaveAttribute('href', /^\/legacy\/blog\/n[0-9a-f]+\.html$/);
  await expect(page.locator('script[src^="site-loader.js"]')).toHaveAttribute('src', /^site-loader\.js\?v=/);
});

function heroPhotoRequests(page) {
  const requested = [];
  page.on('request', (request) => {
    const {pathname} = new URL(request.url());
    if (pathname.startsWith('/assets/hero/')) requested.push(pathname.replace('/assets/hero/', ''));
  });
  return requested;
}

test('legacy hero photos are hosted here and load one at a time ahead of their turn', async ({page}) => {
  expect(fs.readFileSync(path.join(rootPath, 'legacy/style.css'), 'utf8')).not.toContain('i.ibb.co');
  const requested = heroPhotoRequests(page);
  await mockNetwork(page);
  await ready(page, '/legacy/');
  expect(requested[0]).toBe('01-wide.webp');
  expect(requested).not.toContain('05-wide.webp');
  const second = page.locator('.slides').nth(1);
  await expect.poll(() => second.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('/assets/hero/02-wide.webp');
  expect(await page.locator('.slides').first().evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('/assets/hero/01-wide.webp');
});

test('legacy portrait screens use the cropped hero photos', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  const requested = heroPhotoRequests(page);
  await mockNetwork(page);
  await ready(page, '/legacy/');
  await expect.poll(() => requested.includes('02-tall.webp')).toBe(true);
  expect(requested.filter((name) => name.endsWith('-wide.webp'))).toEqual([]);
});

test('legacy reduced motion only downloads the first hero photo', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const requested = heroPhotoRequests(page);
  await mockNetwork(page);
  await ready(page, '/legacy/');
  await page.waitForTimeout(1500);
  expect(requested).toEqual(['01-wide.webp']);
});

test('the homepage can be shared and crawled', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /ポートフォリオ/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://superzero1288.github.io/');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  const shareImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(shareImage).toBe('https://superzero1288.github.io/assets/og-image.jpg');
  for (const file of ['assets/og-image.jpg', 'favicon.ico', 'apple-touch-icon.png']) {
    expect(fs.existsSync(path.join(rootPath, file))).toBe(true);
  }
  const robots = await page.request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap: https://superzero1288.github.io/sitemap.xml');
  const sitemap = await page.request.get('/sitemap.xml');
  expect(await sitemap.text()).toContain('<loc>https://superzero1288.github.io/vrchat-assets/</loc>');
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

for (const base of ['', '/legacy']) {
  test(`the library shows a divider between sections and enlarges its leading cards${base ? ' (legacy)' : ''}`, async ({page}) => {
  await mockNetwork(page);
  await ready(page, `${base}/vrchat-assets/`);
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
  expect(await featured.evaluateAll((cards) => cards.every((card) => card.getBoundingClientRect().height >= 146))).toBe(true);
  // The category cards keep their name and count only; the explanatory line is gone.
  await expect(page.locator('.catalog-category-copy > span')).toHaveCount(0);
  await expect(page.locator('.catalog-brand')).toHaveText('VRChat向けアセット');
  await expect(page.locator('.catalog-kicker')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('いつもの空間に');
  await expectNoHorizontalOverflow(page);
  if (!base) return;
  // Catalogue cards react through the shared home page tilt rather than a local lift.
  expect(await page.locator('.catalog-item-card').first()
    .evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  await page.locator('.catalog-item-card').first().hover();
  await expect.poll(() => page.locator('.catalog-item-card').first()
    .evaluate((element) => element.style.getPropertyValue('--card-scale'))).toBe('1.06');
  });
}

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

for (const base of ['', '/legacy']) for (const viewport of [{width: 320, height: 640}, {width: 390, height: 844}, {width: 768, height: 1024}, {width: 844, height: 390}, {width: 1440, height: 900}]) {
  test(`catalogue layout and detail fit ${viewport.width}×${viewport.height}${base ? ' (legacy)' : ''}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await mockNetwork(page);
    await ready(page, `${base}/vrchat-assets/`);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#catalogRefresh svg')).toBeVisible();
    if (base && viewport.width === 1440) await expect(page.locator('.catalog-item-copy strong').last()).toBeInViewport();
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
  test(`legacy catalogue contrast and semantics: ${appearance.style} ${appearance.light ? 'light' : 'dark'}`, async ({page}) => {
    await mockNetwork(page);
    await page.addInitScript((state) => localStorage.setItem('zero-site-appearance', JSON.stringify(state)), appearance);
    await ready(page, '/legacy/vrchat-assets/');
    expect(await audit(page)).toEqual([]);
    await page.locator(`[data-open-asset="${assetPath}"]`).click();
    await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
    expect(await audit(page)).toEqual([]);
  });
}

const colourModes = ['light', 'dark'].flatMap((mode) => [5, 255, 165, 300, 55].map((hue) => ({mode, hue})));
for (const appearance of colourModes) {
  test(`catalogue contrast and semantics: ${appearance.mode} hue ${appearance.hue}`, async ({page}) => {
    await mockNetwork(page);
    await page.addInitScript((state) => localStorage.setItem('zero-next-appearance', JSON.stringify(state)), appearance);
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance.mode);
    expect(await audit(page)).toEqual([]);
    await page.locator(`[data-open-asset="${assetPath}"]`).click();
    await expect(page.locator('.catalog-info-sections')).toHaveAttribute('aria-busy', 'false');
    expect(await audit(page)).toEqual([]);
  });
}

test('mobile profile contains Tab/Shift+Tab, excludes background and restores its opener', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await mockNetwork(page);
  await ready(page, '/legacy/#main-content');
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
  await ready(page, '/legacy/links.html');
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
  test(`legacy hero tabs can be reached with the keyboard and closed with Esc at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await mockNetwork(page);
    await ready(page, '/legacy/');
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

test('legacy device panel uses valid definition lists and contains keyboard focus', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/legacy/');
  await page.locator('#deviceWingTab').press('Enter');
  await expect(page.locator('#deviceCard')).toHaveAttribute('aria-hidden', 'false');
  expect(await audit(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#deviceWingTab')).toBeFocused();
});

for (const url of ['/legacy/', '/legacy/links.html']) {
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

test('legacy minimized and closed apps leave no hidden focused controls', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/legacy/');
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

test('legacy reduced motion retains a photo, stops idle animation and clears pointer tilts', async ({page}) => {
  await mockNetwork(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await ready(page, '/legacy/');
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

for (const url of ['/links.html', '/blog/n8d41d4a76214.html', '/404.html', '/legacy/links.html', '/legacy/blog/n8d41d4a76214.html', '/legacy/404.html']) {
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
  // The MediaQueryList change event reaches the page as a separate task, so the idle timer can be
  // (re)scheduled after the clock has already moved. Advance once more before asserting.
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

test('legacy: closing an app while another is minimized returns to the remaining task button', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/legacy/');
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
  await ready(page, '/legacy/links.html');
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


test('legacy search and calendar remain visible and usable while a modeless app is open', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/legacy/');
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

test('the legacy second coming-next card opens the current design', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/legacy/');
  const card = page.locator('.future-action[href="/"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('02');
  await expect(card).toHaveAccessibleName(/新デザイン/);
});

for (const width of [320, 390, 1440]) {
  test(`the homepage is accessible without horizontal scroll at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await mockNetwork(page);
    await ready(page, '/');
    await expect(page.locator('h1')).toHaveAccessibleName('ぜろくんでんせつ');
    await expect(page.locator('#noteList .note-card').first()).toHaveAttribute('href', /^\/blog\/n[0-9a-f]+\.html$/);
    await expect(page.locator('#repoList a').first()).toHaveAttribute('href', /^https:\/\/github\.com\//);
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach((item) => item.classList.add('is-visible')));
    await page.waitForTimeout(800);
    expect(await audit(page)).toEqual([]);
    await page.locator('#content').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(await audit(page)).toEqual([]);
  });
}

test('the homepage keeps the familiar controls: side sheets, clock, profile and update tabs', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  const leftTab = page.locator('#leftTab');
  await leftTab.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#leftSheet')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#leftSheet [data-close-sheet]')).toBeFocused();
  await expect(page.locator('#deviceList dt').first()).toHaveText('OS');
  expect(await page.locator('#main').evaluate((element) => element.inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#leftSheet')).toHaveAttribute('aria-hidden', 'true');
  await expect(leftTab).toBeFocused();

  await page.locator('#rightTab').click();
  await expect(page.locator('#rightSheet a[href="/links.html"]')).toBeVisible();
  await expect(page.locator('#rightSheet a[href*="note.com"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const clock = page.locator('#clock');
  await clock.click();
  await expect(clock).toHaveText(/^(AM|PM) \d{1,2}:\d{2}$/);
  await clock.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.calendar-day[aria-current="date"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(clock).toBeFocused();

  const profileButton = page.locator('#profileButton');
  await profileButton.click();
  await expect(page.locator('#profileDialog')).toBeVisible();
  await expect(page.locator('#profileDialog')).toContainText('Ryzen 7 3700X');
  await page.keyboard.press('Escape');
  await expect(page.locator('#profileDialog')).toBeHidden();
  await expect(profileButton).toBeFocused();

  await page.locator('#repoTab').click();
  await expect(page.locator('#repoPanel')).toBeVisible();
  await expect(page.locator('#notePanel')).toBeHidden();
  await page.locator('#repoTab').press('ArrowLeft');
  await expect(page.locator('#noteTab')).toBeFocused();
  await expect(page.locator('#notePanel')).toBeVisible();
});

test('the site remembers dark mode and the theme colour', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await mockNetwork(page);
  await ready(page, '/');
  await page.locator('#themeButton').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#hueButton').click();
  // The colour switches inside an animated view transition, so wait for it to land.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim())).not.toBe('5');
  const hue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim());
  await ready(page, '/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim())).toBe(hue);
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((item) => item.classList.add('is-visible')));
  await page.waitForTimeout(800);
  expect(await audit(page)).toEqual([]);
});

test('the homepage stops its motion when reduced motion is requested', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await mockNetwork(page);
  await ready(page, '/');
  const state = await page.evaluate(() => ({
    shapes: [...document.querySelectorAll('.stage-shape, .stage-dots, .marquee-track, .hero-avatar, .footer-shape, .scroll-arrow')].map((element) => getComputedStyle(element).animationName),
    hidden: [...document.querySelectorAll('.reveal')].filter((element) => getComputedStyle(element).opacity !== '1').length
  }));
  expect(state.shapes.length).toBeGreaterThan(5);
  expect(state.shapes.every((name) => name === 'none')).toBe(true);
  expect(state.hidden).toBe(0);
});

test('homepage desktop apps open from the side sheet and can be driven with the keyboard', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  await page.locator('#leftTab').click();
  await page.locator('[data-launch-app="terminal"]').click();
  const terminal = page.locator('.app-window[data-app="terminal"]');
  await expect(terminal).toBeVisible();
  await expect(page.locator('#leftSheet')).toHaveAttribute('aria-hidden', 'true');
  const prompt = terminal.locator('input');
  await expect(prompt).toBeFocused();
  await prompt.fill('ls');
  await prompt.press('Enter');
  await expect(terminal.locator('.terminal-output')).toContainText('apps/');
  await prompt.fill('bootmgr');
  await prompt.press('Enter');
  await prompt.fill('1');
  await prompt.press('Enter');
  await expect(terminal.locator('.terminal-output')).toContainText('AetherOS 1.0 (aetheros)');
  // Vastique is no longer listed in the current design (it can still be booted by typing its codename).
  await expect(terminal.locator('.terminal-output')).not.toContainText('Vastique');
  await prompt.fill('2');
  await prompt.press('Enter');
  await expect(terminal.locator('.terminal-output')).toContainText('Boot Manager exited.');

  await prompt.fill('calc');
  await prompt.press('Enter');
  const calculator = page.locator('.app-window[data-app="calculator"]');
  const display = calculator.locator('.calc-display input');
  await expect(display).toBeFocused();
  await display.fill('1+2×3');
  await display.press('Enter');
  await expect(display).toHaveValue('7');
  await expect(page.locator('.task-item')).toHaveCount(2);

  await calculator.locator('[data-window-action="minimize"]').click();
  await expect(calculator).toBeHidden();
  const calculatorTask = page.locator('.task-item', {hasText: '電卓'});
  await expect(calculatorTask).toHaveAttribute('aria-label', /を復元$/);
  await calculatorTask.click();
  await expect(calculator).toBeVisible();
  await expect(display).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(display).toHaveValue('0');
  await page.keyboard.press('Escape');
  await expect(calculator).toHaveCount(0);
  await expect(prompt).toBeFocused();

  await page.keyboard.press('Control+Alt+T');
  await expect(page.locator('.app-window[data-app="terminal"]')).toHaveCount(2);
  await expect(page.locator('.task-count')).toHaveText('2');
  expect(await audit(page)).toEqual([]);
});

test('homepage apps share saved data with the legacy site and explore the virtual files', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  await page.locator('#leftTab').click();
  await page.locator('[data-launch-app="notepad"]').click();
  const notepad = page.locator('.app-window[data-app="notepad"]');
  await notepad.locator('textarea').fill('新デザインから書いたメモ');
  await notepad.locator('[data-window-action="close"]').click();
  expect(await page.evaluate(() => localStorage.getItem('zero-notepad-document'))).toBe('新デザインから書いたメモ');

  await page.locator('#leftTab').click();
  await page.locator('[data-launch-app="explorer"]').click();
  const explorer = page.locator('.app-window[data-app="explorer"]');
  await expect(explorer.locator('.explorer-item')).toContainText(['profile', 'links', 'blog']);
  await explorer.locator('.explorer-item', {hasText: 'apps'}).click();
  await expect(explorer.locator('.explorer-view h2')).toHaveText('アプリ');
  await explorer.locator('.explorer-item', {hasText: 'notepad'}).click();
  await expect(page.locator('.app-window[data-app="notepad"] textarea')).toHaveValue('新デザインから書いたメモ');
});

for (const viewport of [{width: 320, height: 640}, {width: 375, height: 667}, {width: 390, height: 844}]) {
  test(`homepage phone hero shows the name and photo without scrolling at ${viewport.width}x${viewport.height}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await mockNetwork(page);
    await ready(page, '/');
    const layout = await page.evaluate(() => ({
      title: document.querySelector('.hero-title').getBoundingClientRect().bottom,
      photo: document.querySelector('.photo-frame').getBoundingClientRect().bottom,
      lead: document.querySelector('.hero-lead').getBoundingClientRect().top,
      height: innerHeight
    }));
    expect(layout.title).toBeLessThanOrEqual(layout.height);
    expect(layout.photo).toBeLessThanOrEqual(layout.height);
    expect(layout.lead).toBeGreaterThan(layout.photo);
    expect(layout.lead).toBeLessThan(layout.height);
    await expect(page.locator('#hero .assist-chip')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}

/* ===== トップページの隠し要素: 「でんせつ」が押すたびに変わる ===== */
const LEGEND_WORDS = ['でんせつ', '伝説', 'Legend', '传说', '전설'];
const LEGEND_RARE = ['縺ｧ繧薙○縺､', 'e4bc9de8aaac'];

test('clicking でんせつ swaps it for another of the seven words, with the garbled ones rarer', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  const legend = page.locator('#heroLegend');
  await expect(legend).toHaveText('でんせつ');
  const seen = await legend.evaluate((element) => {
    const texts = [];
    for (let i = 0; i < 600; i += 1) {
      element.click();
      texts.push(element.textContent);
    }
    return texts;
  });
  const counts = Object.fromEntries([...LEGEND_WORDS, ...LEGEND_RARE].map((word) => [word, seen.filter((text) => text === word).length]));
  expect(seen.every((text) => text in counts)).toBe(true);
  expect(seen.every((text, index) => text !== (index ? seen[index - 1] : 'でんせつ'))).toBe(true);
  for (const word of [...LEGEND_WORDS, ...LEGEND_RARE]) expect(counts[word]).toBeGreaterThan(0);
  for (const rare of LEGEND_RARE) for (const word of LEGEND_WORDS) expect(counts[rare]).toBeLessThan(counts[word]);
  expect((counts[LEGEND_RARE[0]] + counts[LEGEND_RARE[1]]) / seen.length).toBeLessThan(0.15);
  // The heading itself keeps the real name for screen readers.
  await expect(page.locator('h1')).toHaveAccessibleName('ぜろくんでんせつ');
});

for (const width of [320, 1440]) {
  test(`the longest でんせつ variants stay on one line inside the hero at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: width === 320 ? 640 : 900});
    await mockNetwork(page);
    await ready(page, '/');
    const legend = page.locator('#heroLegend');
    const height = await legend.evaluate((element) => element.offsetHeight);
    // 0.999 picks the hex string from でんせつ, then 0.99 picks the garbled text from the hex string.
    for (const random of [0.999, 0.99]) {
      await page.evaluate((value) => {
        const original = Math.random;
        Math.random = () => value;
        document.getElementById('heroLegend').click();
        Math.random = original;
      }, random);
      await expect(legend).toHaveText(new RegExp(`^(${LEGEND_RARE.join('|')})$`));
      const box = await legend.evaluate((element) => ({
        width: element.offsetWidth,
        available: element.parentElement.clientWidth,
        height: element.offsetHeight,
        lines: Math.round(element.querySelector('.hero-legend-text').getClientRects().length),
      }));
      expect(box.width).toBeLessThanOrEqual(box.available + 1);
      expect(box.height).toBe(height);
      expect(box.lines).toBe(1);
      await expectNoHorizontalOverflow(page);
    }
  });
}

/* ===== 404の隠し扉と、前のデザイン（/legacy/） ===== */
test('pressing the 0 of the 404 five times reveals the door to the legacy site', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/404.html');
  const zero = page.getByRole('button', {name: '0', exact: true});
  const door = page.locator('#legacyDoor');
  await expect(door).toBeHidden();
  for (let i = 0; i < 4; i += 1) await zero.click();
  await expect(door).toBeHidden();
  await zero.press('Enter');
  await expect(door).toBeVisible();
  await expect(door).toBeFocused();
  await expect(door).toHaveAttribute('href', '/legacy/');
  expect(await audit(page)).toEqual([]);
  await door.click();
  await expect(page).toHaveURL(/\/legacy\/$/);
  await expect(page.locator('#siteLoader')).toHaveCount(0);
  await expect(page.locator('.slides')).toHaveCount(13);
});

for (const url of ['/legacy/', '/legacy/links.html', '/legacy/vrchat-assets/', '/legacy/blog/n8d41d4a76214.html', '/legacy/404.html']) {
  test(`the legacy page ${url} is hidden from search and stays inside /legacy/`, async ({page}) => {
    const missing = [];
    page.on('response', (response) => {
      const target = new URL(response.url());
      if (['127.0.0.1', 'localhost'].includes(target.hostname) && response.status() >= 400) missing.push(target.pathname);
    });
    await mockNetwork(page);
    await ready(page, url);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const internal = await page.locator('a[href]').evaluateAll((links) => links
      .map((link) => new URL(link.href))
      .filter((target) => target.origin === location.origin && target.pathname !== location.pathname)
      .map((target) => target.pathname));
    // "/" is the legacy home's link to the current design; /blog-list/ was already a placeholder in the legacy site.
    expect(internal.filter((pathname) => !pathname.startsWith('/legacy/') && !['/', '/blog-list/'].includes(pathname))).toEqual([]);
    expect(missing).toEqual([]);
  });
}

test('the old /next/ address forwards to the homepage', async ({page}) => {
  await mockNetwork(page);
  await page.goto('/next/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#heroLegend')).toBeVisible();
});

/* ===== 今のデザインのリンク集・記事・アセット配布 ===== */
for (const width of [320, 390, 1440]) {
  test(`the link directory fits ${width}px and shows the synced updates`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await mockNetwork(page);
    await ready(page, '/links.html');
    await expect(page.locator('#toolbar a[href="/"]')).toHaveAccessibleName('トップページへ戻る');
    await expect(page.locator('#latestNoteFeed .note-card').first()).toHaveAttribute('href', /^\/blog\/n[0-9a-f]+\.html$/);
    await expect(page.locator('#latestGithubFeed a')).toHaveCount(3);
    await expect(page.locator('#latestYoutubeFeed .video-card').first()).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\//);
    await expect(page.locator('.link-row[target="_blank"]')).toHaveCount(10);
    await expectNoHorizontalOverflow(page);
  });
}

for (const mode of ['light', 'dark']) {
  for (const url of ['/links.html', '/blog/n8d41d4a76214.html', '/404.html']) {
    test(`${url} passes the accessibility audit in ${mode} mode`, async ({page}) => {
      await page.emulateMedia({colorScheme: mode});
      await mockNetwork(page);
      await ready(page, url);
      await expect(page.locator('#themeButton')).toHaveAccessibleName(mode === 'dark' ? 'ライトモードにする' : 'ダークモードにする');
      expect(await audit(page)).toEqual([]);
    });
  }
}

test('the synced article uses the current design and its table of contents links work', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  await mockNetwork(page);
  await ready(page, '/blog/n8d41d4a76214.html');
  await expect(page.locator('link[rel="stylesheet"][href^="/site/pages.css"]')).toHaveCount(1);
  await expect(page.locator('h1')).toContainText('305SH');
  const targets = await page.locator('[data-table-of-contents] a[href^="#"]').evaluateAll((links) => links.map((link) => link.getAttribute('href').slice(1)));
  expect(targets.length).toBeGreaterThan(3);
  expect(await page.evaluate((ids) => ids.every((id) => document.getElementById(id)?.matches('.article-body h2, .article-body h3, .article-body h4')), targets)).toBe(true);
  expect(await page.locator('.article-body img').evaluateAll((images) => images.every((image) => new URL(image.src).pathname.startsWith('/blog/assets/')))).toBe(true);
  await expectNoHorizontalOverflow(page);
});

for (const url of ['/links.html', '/vrchat-assets/', '/blog/n8d41d4a76214.html', '/404.html']) {
  test(`the shared toolbar clock and calendar work on ${url}`, async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockNetwork(page);
    await ready(page, url);
    const clock = page.locator('#clock');
    await expect(clock).toHaveText(/^\d{2}:\d{2}$/);
    await clock.click();
    await expect(clock).toHaveText(/^(AM|PM) \d{1,2}:\d{2}$/);
    await clock.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.calendar-day[aria-current="date"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#snackbar')).toContainText('コピーしました');
    await page.keyboard.press('Escape');
    await expect(clock).toBeFocused();
  });
}

test('dark mode and the theme colour carry over to every page', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await mockNetwork(page);
  await ready(page, '/links.html');
  await page.locator('#themeButton').click();
  await page.locator('#hueButton').click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim())).not.toBe('5');
  const hue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim());
  for (const url of ['/', '/vrchat-assets/', '/blog/n8d41d4a76214.html', '/404.html']) {
    await ready(page, url);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim())).toBe(hue);
  }
});

test('the homepage passes the accessibility audit with the mint theme colour in light mode', async ({page}) => {
  await mockNetwork(page);
  await page.addInitScript(() => localStorage.setItem('zero-next-appearance', JSON.stringify({mode: 'light', hue: 165})));
  await ready(page, '/');
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((item) => item.classList.add('is-visible')));
  await page.locator('#content').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  expect(await audit(page)).toEqual([]);
});

/* ===== content/ のテキストファイル ===== */
const contentLines = (name) => fs.readFileSync(path.join(rootPath, 'content', name), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

test('the hero message comes from content/hero-messages.txt and changes on every reload', async ({page}) => {
  const messages = contentLines('hero-messages.txt');
  expect(messages.length).toBeGreaterThan(1);
  await mockNetwork(page);
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    await ready(page, '/');
    const text = await page.locator('.hero-message').textContent();
    expect(messages).toContain(text);
    await expect(page.locator('.footer-text')).toHaveText(text);
    seen.push(text);
  }
  expect(seen.every((text, index) => !index || text !== seen[index - 1])).toBe(true);
  expect(await page.locator('body').innerText()).not.toContain('つくって、あそぶ');
});

test('the profile lists are read from the content text files', async ({page}) => {
  await mockNetwork(page);
  await page.route('**/content/profile-phones.txt', (route) => route.fulfill({status: 200, contentType: 'text/plain; charset=utf-8', body: 'MAIN: テスト端末\n\nWATCH：Galaxy Watch\n'}));
  await ready(page, '/');
  await page.locator('#profileButton').click();
  const pc = contentLines('profile-pc.txt').map((line) => line.split(/\s*[:：]\s*/));
  await expect(page.locator('[data-spec-source$="profile-pc.txt"] dt')).toHaveText(pc.map(([label]) => label));
  await expect(page.locator('[data-spec-source$="profile-pc.txt"] dd')).toHaveText(pc.map(([, value]) => value));
  await expect(page.locator('[data-spec-source$="profile-phones.txt"] dt')).toHaveText(['MAIN', 'WATCH']);
  await expect(page.locator('[data-spec-source$="profile-phones.txt"] dd')).toHaveText(['テスト端末', 'Galaxy Watch']);
  expect(await audit(page)).toEqual([]);
});

/* ===== 隠し要素: 写真をリズムよく押すとBPM ===== */
test('tapping the photo at a steady beat shows the BPM, and it goes back after a pause', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await mockNetwork(page);
  await ready(page, '/');
  const counter = page.locator('#photoCounter');
  // Uneven taps do not count as a beat.
  await page.locator('#photoFrame').evaluate(async (element) => {
    for (const wait of [150, 900, 300, 1200]) { element.click(); await new Promise((resolve) => setTimeout(resolve, wait)); }
  });
  await expect(counter).toHaveText(/^PHOTO \d{2} \/ 13$/);
  await page.waitForTimeout(3000);
  await page.locator('#photoFrame').evaluate(async (element) => {
    for (let i = 0; i < 6; i += 1) { element.click(); await new Promise((resolve) => setTimeout(resolve, 500)); }
  });
  await expect(counter).toHaveText(/^♪ (11[0-9]|12[0-9]|130) BPM$/);
  await expect(counter).toHaveClass(/is-bpm/);
  await expect(page.locator('#photoBpm')).toHaveText(/^\d+ BPM$/);
  await expect(counter).toHaveText(/^PHOTO \d{2} \/ 13$/, {timeout: 6000});
});

/* ===== ホバー: 持ち上がらず、角丸も0にならない ===== */
async function hoverSample(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(700);
  const box = await locator.boundingBox();
  const sampling = locator.evaluate((element) => new Promise((resolve) => {
    const startedAt = performance.now();
    // Measure the centre so that rotating or scaling on hover does not count as lifting.
    const centre = () => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2; };
    const start = centre();
    let minRadius = Infinity;
    let lift = 0;
    const tick = () => {
      minRadius = Math.min(minRadius, parseFloat(getComputedStyle(element).borderTopLeftRadius));
      lift = Math.max(lift, start - centre());
      if (performance.now() - startedAt < 1000) requestAnimationFrame(tick); else resolve({minRadius, lift});
    };
    tick();
  }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  await page.mouse.move(1, 1);
  return sampling;
}

for (const {url, selectors} of [
  {url: '/', selectors: ['#noteList .note-card', '.slot-live', '.footer-links a', '.hero-actions .btn-filled', '#rightTab']},
  {url: '/links.html', selectors: ['.link-row', '#latestNoteFeed .note-card', '#latestGithubFeed a']},
  {url: '/vrchat-assets/', selectors: ['.catalog-category-card', '.catalog-item-card', '#catalogRefresh']},
  {url: `/vrchat-assets/?asset=${encodeURIComponent(assetPath)}`, selectors: ['.catalog-download-link', '.catalog-primary-link']},
]) {
  test(`hovering on ${url} neither lifts cards nor flattens their corners`, async ({page}) => {
    await mockNetwork(page);
    await ready(page, url);
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach((item) => item.classList.add('is-visible')));
    for (const selector of selectors) {
      const result = await hoverSample(page, page.locator(selector).first());
      expect(result.lift, `${selector} lift`).toBeLessThan(0.5);
      expect(result.minRadius, `${selector} radius`).toBeGreaterThan(4);
    }
  });
}

/* ===== テーマカラーの演出・スクロール・リンク集の並び ===== */
test('changing the theme colour plays the shape reveal, except with reduced motion', async ({page}) => {
  await mockNetwork(page);
  await page.addInitScript(() => {
    window.revealCount = 0;
    const original = document.startViewTransition?.bind(document);
    if (original) document.startViewTransition = (callback) => { window.revealCount += 1; return original(callback); };
  });
  await ready(page, '/links.html');
  await page.locator('#hueButton').click();
  await expect.poll(() => page.evaluate(() => window.revealCount)).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-hue-reveal'))).toBe(false);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim())).toBe('255');
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.locator('#hueButton').click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h').trim())).toBe('165');
  expect(await page.evaluate(() => window.revealCount)).toBe(1);
});

test('the homepage scrolls freely without snapping back to the top', async ({page}) => {
  await mockNetwork(page);
  await ready(page, '/');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe('none');
  await page.evaluate(() => scrollTo(0, 140));
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => scrollY)).toBe(140);
});

for (const width of [1440, 820]) {
  test(`the latest updates line up row by row at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await mockNetwork(page);
    await ready(page, '/links.html');
    await expect(page.locator('#latestYoutubeFeed .note-card')).toHaveCount(1);
    const rows = await page.evaluate(() => ['#latestNoteFeed', '#latestYoutubeFeed', '#latestGithubFeed'].map((id) => {
      const first = document.querySelector(`${id} > *`).getBoundingClientRect();
      const list = document.querySelector(id).getBoundingClientRect();
      const image = document.querySelector(`${id} img`)?.getBoundingClientRect();
      return {top: Math.round(first.top), height: Math.round(first.height), list: Math.round(list.height), image: image && Math.round(image.height)};
    }));
    const [note, youtube, github] = rows;
    const close = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    close(youtube.top, note.top);
    close(youtube.height, note.height);
    close(youtube.image, note.image);
    close(youtube.list, note.list);
    if (width === 1440) {
      close(github.top, note.top);
      close(github.height, note.height);
      // Three rows are reserved for note even while fewer articles exist.
      close(github.list, note.list);
    }
  });
}
