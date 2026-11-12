// C51015D（同じリポジトリに置いている独立したサイト）のテスト
const {test, expect} = require('@playwright/test');
const {AxeBuilder} = require('@axe-core/playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const rootPath = path.resolve(__dirname, '..');
const siteDir = path.join(rootPath, 'C51015D');
const fixtures = path.join(__dirname, 'fixtures', 'c51015d');
const transparentPNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=', 'base64');

const runtimeErrors = new WeakMap();
test.beforeEach(async ({page}) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    if (route.request().resourceType() === 'image') return route.fulfill({status: 200, contentType: 'image/png', body: transparentPNG});
    return route.abort('blockedbyclient');
  });
});
test.afterEach(async ({page}) => {
  if (test.info().status === test.info().expectedStatus) expect(runtimeErrors.get(page)).toEqual([]);
});

async function audit(page) {
  await page.waitForTimeout(250);
  const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.map((item) => ({id: item.id, targets: item.nodes.map((node) => node.target)}));
}
const noHorizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// 同期スクリプトを、作業用にコピーしたサイトで動かす（リポジトリのファイルは変えない）
function runSync(args = [], env = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'c51015d-'));
  fs.cpSync(siteDir, work, {recursive: true});
  const output = execFileSync(process.execPath, ['--import', path.join(fixtures, 'mock-fetch.mjs'), path.join(work, 'scripts', 'sync-note.mjs'), ...args], {
    env: {...process.env, C51015D_SITE_ROOT: work, ...env}, encoding: 'utf8',
  });
  return {work, output};
}
// 作業用のサイトを、ブラウザからは /c51015d-work/ として見せる
async function serveWork(page, work) {
  await page.route('**/c51015d-work/**', (route) => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/c51015d-work\//, '')) || 'index.html';
    const file = path.join(work, relative.endsWith('/') ? `${relative}index.html` : relative);
    if (!file.startsWith(work) || !fs.existsSync(file)) return route.fulfill({status: 404, body: 'not found'});
    const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'};
    return route.fulfill({status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
  });
}

// なめらかなスクロールが止まるまで待つ（止まる前に次の操作をすると、Playwright が要素を見える位置へ動かして割り込んでしまう）
async function scrollSettled(page) {
  await page.waitForFunction(() => new Promise((resolve) => {
    let last = scrollY;
    let still = 0;
    const step = () => {
      still = scrollY === last ? still + 1 : 0;
      last = scrollY;
      if (still >= 6) resolve(true); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));
}

for (const width of [320, 390, 1440]) {
  test(`C51015D: the template home page fits ${width}px with its section navigation`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/C51015D/');
    await expect(page.locator('h1')).toHaveText('C51015D');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    // PCは左の目次、スマホは上に貼りつくタブ
    const nav = page.getByRole('navigation', {name: width < 900 ? 'ページ内の移動（タブ）' : 'ページ内の移動', exact: true});
    await expect(nav.getByRole('link')).toHaveText(['About', 'Works', 'note記事', 'Links']);
    await expect(page.locator('#noteList .empty')).toHaveText('まだ記事はありません。');
    expect(await noHorizontalOverflow(page)).toBe(true);
    // 目次で選んだ場所が「今いる場所」になる（短くて画面の上まで来られないセクションでも）
    for (const name of ['Links', 'note記事']) {
      await nav.getByRole('link', {name}).click();
      await expect(nav.getByRole('link', {name})).toHaveAttribute('aria-current', 'true');
      await expect(nav.locator('[aria-current]')).toHaveCount(1);
      await scrollSettled(page);
    }
    await expect(page.locator('#note')).toBeInViewport();
    // スマホのタブは、上から少し離れたところに浮かんで貼りつく
    if (width < 900) expect((await nav.boundingBox()).y).toBeCloseTo(8, 0);
    // 自分でスクロールしたら、位置で決める（いちばん下なら最後、いちばん上なら最初）
    await page.mouse.move(width / 2, 450);
    await page.mouse.wheel(0, 20000);
    await scrollSettled(page);
    await expect(nav.getByRole('link', {name: 'Links'})).toHaveAttribute('aria-current', 'true');
    await page.mouse.wheel(0, -20000);
    await scrollSettled(page);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(nav.getByRole('link', {name: 'About'})).toHaveAttribute('aria-current', 'true');
  });
}

test('C51015D: the panels are LiquidGlass on the wallpaper, and the profile sits centered', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/C51015D/');
  // 背景の写真は画面に固定
  const wallpaper = await page.evaluate(() => { const style = getComputedStyle(document.body, '::before'); return {image: style.backgroundImage, position: style.position}; });
  expect(wallpaper.image).toContain('wallpaper.webp');
  expect(wallpaper.position).toBe('fixed');
  // ガラスの板: ぼかし + 半透明の色
  const panels = await page.evaluate(() => [...document.querySelectorAll('.profile, .section, body > .layout .footer')].map((element) => {
    const style = getComputedStyle(element);
    return {blur: /blur\(/.test(style.backdropFilter), alpha: Number((style.backgroundColor.match(/[\d.]+(?=\))/) || ['1'])[0])};
  }));
  expect(panels).toHaveLength(6);
  for (const panel of panels) { expect(panel.blur).toBe(true); expect(panel.alpha).toBeLessThan(1); }
  // プロフィールは画面の上下の真ん中で、中身は中央揃え
  const profile = await page.locator('.profile').boundingBox();
  expect(Math.abs(profile.y + profile.height / 2 - 450)).toBeLessThan(2);
  for (const selector of ['.avatar', '.name', '.handle', '.bio', '.toc a >> nth=0']) {
    const box = await page.locator(`.profile ${selector}`).first().boundingBox();
    expect(Math.abs(box.x + box.width / 2 - (profile.x + profile.width / 2)), selector).toBeLessThan(2);
  }
  expect(await page.locator('.profile').evaluate((element) => getComputedStyle(element).textAlign)).toBe('center');
  // 本文をスクロールしても、プロフィールは真ん中のまま
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, 400);
  await scrollSettled(page);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  const after = await page.locator('.profile').boundingBox();
  expect(Math.abs(after.y - profile.y)).toBeLessThan(1);
});

test('C51015D: on phones the tab bar floats as glass, and the top edge blurs only while content passes under it', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/C51015D/');
  const tabbar = page.locator('.tabbar');
  expect(await tabbar.evaluate((element) => /blur\(/.test(getComputedStyle(element).backdropFilter))).toBe(true);
  expect(await page.locator('.profile').evaluate((element) => getComputedStyle(element).textAlign)).toBe('center');
  await expect(page.locator('body')).not.toHaveClass(/has-edge/);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 900); });
  await expect(page.locator('body')).toHaveClass(/has-edge/);
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('body')).not.toHaveClass(/has-edge/);
});

test('C51015D: text keeps its contrast on the glass over the wallpaper', async ({page}) => {
  // axe は背景が写真のときコントラストを測れないので、文字を消した画面から実際の背景の色を測る
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    for (const scheme of ['light', 'dark']) {
      await page.setViewportSize({width, height});
      await page.emulateMedia({colorScheme: scheme});
      await page.goto('/C51015D/');
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (const y of [0, Math.round(max / 2), max]) {
        await page.evaluate((top) => scrollTo(0, top), y);
        await page.waitForTimeout(300);
        const texts = await page.evaluate(() => {
          const found = [];
          const walker = document.createTreeWalker(document.querySelector('.layout'), NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.textContent.trim()) continue;
            const element = node.parentElement;
            const style = getComputedStyle(element);
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.width < 2 || rect.top < 0 || rect.bottom > innerHeight) continue;
              const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
              if (!hit || !(element.contains(hit) || hit.contains(element))) continue;
              found.push({text: node.textContent.trim().slice(0, 20), color: style.color, large: parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700), rect: {x: rect.left, y: rect.top, width: rect.width, height: rect.height}});
            }
          }
          return found;
        });
        const hide = await page.addStyleTag({content: '*{transition:none!important;color:transparent!important;text-decoration-color:transparent!important}'});
        const shot = (await page.screenshot()).toString('base64');
        await hide.evaluate((element) => element.remove());
        const low = await page.evaluate(async ({shot, texts}) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0);
          const channel = (value) => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          const luminance = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
          const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          return texts.map((text) => {
            const [r, g, b] = text.color.match(/[\d.]+/g).map(Number);
            const color = luminance(r, g, b);
            const {data} = context.getImageData(Math.floor(text.rect.x), Math.floor(text.rect.y), Math.max(1, Math.ceil(text.rect.width)), Math.max(1, Math.ceil(text.rect.height)));
            const background = [];
            for (let index = 0; index < data.length; index += 4) background.push(luminance(data[index], data[index + 1], data[index + 2]));
            background.sort((a, b) => a - b);
            const worst = Math.min(ratio(color, background[Math.floor(background.length * 0.03)]), ratio(color, background[Math.floor(background.length * 0.97)]));
            return {text: text.text, worst: Math.round(worst * 100) / 100, need: text.large ? 3 : 4.5};
          }).filter((item) => item.worst < item.need);
        }, {shot, texts});
        expect(low, `${width}px ${scheme} y=${y}`).toEqual([]);
      }
    }
  }
});

for (const mode of ['light', 'dark']) {
  for (const url of ['/C51015D/', '/C51015D/blog/', '/C51015D/404.html']) {
    test(`C51015D: ${url} passes the accessibility audit in ${mode} mode`, async ({page}) => {
      await page.emulateMedia({colorScheme: mode});
      await page.goto(url);
      expect(await audit(page)).toEqual([]);
    });
  }
}

test('C51015D: the appearance setting keeps its own storage, apart from the other site', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto('/C51015D/');
  await expect(page.getByRole('radio', {name: '自動'})).toBeChecked();
  await page.getByRole('radio', {name: 'ダーク'}).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['c51015d:theme']);
  await page.goto('/C51015D/blog/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', {name: 'ダーク'})).toBeChecked();
  // 「自動」に戻すと保存を消して、OSの設定に従う
  await page.getByRole('radio', {name: '自動'}).check();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('C51015D: the site and the other site do not link to each other', async () => {
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, {withFileTypes: true}).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (['.git', 'node_modules', 'tests', 'test-results'].includes(entry.name)) return;
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:html|js|mjs|css|xml|json)$/.test(entry.name)) files.push(file);
  });
  walk(rootPath);
  const inside = (file) => file.startsWith(siteDir + path.sep);
  for (const file of files.filter((item) => !inside(item))) {
    const text = fs.readFileSync(file, 'utf8');
    // 404.html だけは、このサイトの404ページへ移動させるために名前を使う
    if (file === path.join(rootPath, '404.html')) continue;
    expect(text.includes('C51015D'), path.relative(rootPath, file)).toBe(false);
  }
  for (const file of files.filter(inside)) {
    const text = fs.readFileSync(file, 'utf8');
    // ページのリンク・画像・CSSは相対パスだけ（/ から始めると、もう一方のサイトを指してしまう）
    expect(text.match(/(?:href|src)="\/(?!\/)[^"]*"/g), path.relative(rootPath, file)).toBeNull();
  }
});

test('C51015D: an unknown address inside the site shows its own 404 page', async ({page}) => {
  const notFound = fs.readFileSync(path.join(rootPath, '404.html'), 'utf8');
  // GitHub Pages は知らないアドレスにサイト全体の 404.html を返す（テスト用サーバーでは再現する）
  await page.route('**/C51015D/no-such-page', (route) => route.fulfill({status: 404, contentType: 'text/html; charset=utf-8', body: notFound}));
  await page.goto('/C51015D/no-such-page');
  await expect(page).toHaveURL(/\/C51015D\/404\.html\?path=%2FC51015D%2Fno-such-page$/);
  await expect(page.locator('h1')).toHaveText('ページが見つかりません');
  await expect(page.locator('#notfoundPath')).toHaveText('/C51015D/no-such-page');
  await expect(page.locator('#legacyDoor')).toHaveCount(0);
});

test('C51015D: the note sync does nothing until an account is set', async () => {
  const {work, output} = runSync([], {C51015D_NOTE_USER: ''});
  expect(output).toContain('同期しませんでした');
  expect(fs.readFileSync(path.join(work, 'index.html'), 'utf8')).toBe(fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8'));
  expect(fs.existsSync(path.join(work, 'blog', 'articles.json'))).toBe(false);
});

test('C51015D: the note sync builds safe article pages, the list and the home cards', async ({page}) => {
  const {work, output} = runSync([], {C51015D_NOTE_USER: 'testuser'});
  expect(output).toContain('同期しました: はじめての記事 & テスト');
  const articles = JSON.parse(fs.readFileSync(path.join(work, 'blog', 'articles.json'), 'utf8'));
  expect(articles.map((article) => [article.id, article.generated])).toEqual([['ntest1', true], ['nbroken', false]]);
  const articleHtml = fs.readFileSync(path.join(work, 'blog', 'ntest1.html'), 'utf8');
  expect(articleHtml).not.toContain('window.injected');
  expect(articleHtml).not.toContain('onclick');
  expect(articleHtml).not.toContain('javascript:');
  expect(articleHtml).not.toContain('本文の外');
  expect(articleHtml).toContain('入れ子の本文');
  expect(articleHtml).toMatch(/<h2 id="abc-123">はじめに<\/h2>/);
  expect(fs.readdirSync(path.join(work, 'blog', 'assets', 'ntest1')).sort()).toEqual(expect.arrayContaining([expect.stringMatching(/^cover-/), expect.stringMatching(/^image-1-/)]));
  // noteのアイコンを保存して、トップページのアイコンにする
  expect(output).toContain('noteのアイコンを反映しました');
  expect(fs.existsSync(path.join(work, 'assets', 'avatar.png'))).toBe(true);
  expect(fs.readFileSync(path.join(work, 'index.html'), 'utf8')).toMatch(/<!-- AVATAR_START -->\n<div class="avatar" aria-hidden="true"><img src="assets\/avatar\.png\?v=[0-9a-f]{10}" alt="" width="72" height="72"><\/div>\n<!-- AVATAR_END -->/);

  // --rebuild で作り直しても同じになる
  const before = articleHtml;
  execFileSync(process.execPath, [path.join(work, 'scripts', 'sync-note.mjs'), '--rebuild'], {env: {...process.env, C51015D_SITE_ROOT: work}});
  expect(fs.readFileSync(path.join(work, 'blog', 'ntest1.html'), 'utf8')).toBe(before);

  await serveWork(page, work);
  await page.goto('/c51015d-work/');
  await expect.poll(() => page.locator('.avatar img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  const homeCards = page.locator('#noteList a.row');
  await expect(homeCards).toHaveCount(2);
  await expect(homeCards.first()).toHaveAttribute('href', 'blog/ntest1.html');
  await expect(homeCards.nth(1)).toHaveAttribute('href', 'https://note.com/testuser/n/nbroken');
  await homeCards.first().click();
  await expect(page).toHaveURL(/\/c51015d-work\/blog\/ntest1\.html$/);
  await expect(page.locator('h1')).toHaveText('はじめての記事 & テスト');
  await expect.poll(() => page.locator('.article-body img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.getElementById('abc-123')?.textContent)).toBe('はじめに');
  expect(await audit(page)).toEqual([]);
  await expect(page.locator('.appbar-action')).toHaveAttribute('href', 'https://note.com/testuser/n/ntest1');
  await page.locator('.article-end a', {hasText: '記事一覧'}).click();
  await expect(page).toHaveURL(/\/c51015d-work\/blog\/$/);
  await expect(page.locator('#articleList a.row')).toHaveCount(2);
  await expect(page.locator('#articleList .row-sub').first()).toContainText('テスト用の記事');
  await expect(page.locator('#articleList a.row').nth(1)).toContainText('note ↗');
  expect(await noHorizontalOverflow(page)).toBe(true);
});
