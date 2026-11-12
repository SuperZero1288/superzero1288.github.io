// C51015D — noteの記事を同期して、このサイトの中で読めるページを作ります。
//
//   node C51015D/scripts/sync-note.mjs            noteから取得して更新
//   node C51015D/scripts/sync-note.mjs --rebuild  通信せず、保存済みの本文からページだけ作り直す（デザインを変えたとき）
//
// 設定は C51015D/config.json の note.user（noteのID。https://note.com/ここ の部分）。空のあいだは何もしません。
// 作るもの:
//   blog/記事ID.html            記事ページ
//   blog/assets/記事ID/         記事の画像
//   blog/articles.json          記事の一覧データ
//   blog/index.html             記事一覧（<!-- ARTICLE_LIST_START/END --> の間）
//   index.html                  トップページのnote欄（<!-- NOTE_LIST_START/END --> の間）
//   assets/avatar.*             noteのアイコン（トップページの <!-- AVATAR_START/END --> の間に入ります）
// ページ同士のリンクや画像はすべて相対パスなので、このフォルダごと別の場所へ移しても動きます。
// 有料記事や限定公開の部分は取得しないでください（公開されているページだけを読みます）。

import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const siteRoot = process.env.C51015D_SITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(siteRoot, 'config.json'), 'utf8'));
const siteName = config.siteName || 'C51015D';
// 環境変数 C51015D_NOTE_USER があればそちらを使う（空なら「設定なし」。テストで使います）
const noteUser = String(process.env.C51015D_NOTE_USER ?? config.note?.user ?? '').trim().replace(/^@/, '');
const homeCount = Number(config.note?.homeCount) || 3;
const noindex = config.noindex !== false;
const userAgent = 'c51015d-note-sync/1.0 (+GitHub Actions)';

/* ---------- 文字の処理 ---------- */
const decodeEntities = (value = '') => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
const escapeHtml = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const textFromHtml = (value = '') => decodeEntities(value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const readTag = (block, tag) => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
};
const getAttribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : '';
};
const setAttribute = (tag, name, value) => tag
  .replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'i'), '')
  .replace(/\s*\/?\s*>$/, ` ${name}="${escapeHtml(value)}">`);
const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date).replaceAll('/', '.');
};
const isoDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

/* ---------- 取得 ---------- */
async function fetchText(url) {
  const response = await fetch(url, {headers: {'User-Agent': userAgent, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8'}});
  if (!response.ok) throw new Error(`${url} の取得に失敗しました (${response.status})`);
  return response.text();
}

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const link = readTag(item, 'link');
    return {
      id: link.match(/\/n\/([^/?#]+)/)?.[1] || createHash('sha1').update(link).digest('hex').slice(0, 16),
      title: textFromHtml(readTag(item, 'title')),
      description: textFromHtml(readTag(item, 'description')).replace(/続きをみる$/, '').trim(),
      thumbnail: readTag(item, 'media:thumbnail'),
      publishedAt: readTag(item, 'pubDate'),
      sourceUrl: link,
    };
  }).filter((article) => article.title && /^https:\/\/note\.com\//.test(article.sourceUrl));
}

function extractArticleBody(html) {
  const opening = /<div\b(?=[^>]*\bdata-name=(?:"body"|'body'))[^>]*>/i.exec(html);
  if (!opening) throw new Error('本文の開始位置を見つけられませんでした');
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = opening.index;
  let depth = 0;
  let start = -1;
  let match;
  while ((match = tags.exec(html))) {
    if (!/^<\/div/i.test(match[0])) {
      depth += 1;
      if (start < 0) start = tags.lastIndex;
    } else if (--depth === 0) {
      return html.slice(start, match.index);
    }
  }
  throw new Error('本文の終了位置を見つけられませんでした');
}

function extractBlogPosting(html) {
  for (const match of html.matchAll(/<script[^>]+type=(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      const posting = (Array.isArray(data?.['@graph']) ? data['@graph'] : [data]).find((entry) => entry?.['@type'] === 'BlogPosting');
      if (posting) return posting;
    } catch { /* 壊れたJSON-LDは飛ばす */ }
  }
  return {};
}

/* ---------- 画像を保存（記事ページからの相対パスを返す） ---------- */
function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return /^\.(?:avif|gif|jpe?g|png|webp)$/.test(ext) ? ext : '.jpg';
  } catch { return '.jpg'; }
}
async function downloadImage(url, articleId, label) {
  const absoluteUrl = new URL(url, 'https://note.com').href;
  const fileName = `${label}-${createHash('sha256').update(absoluteUrl).digest('hex').slice(0, 14)}${extensionFromUrl(absoluteUrl)}`;
  const response = await fetch(absoluteUrl, {headers: {'User-Agent': userAgent}});
  if (!response.ok) throw new Error(`画像の取得に失敗しました (${response.status}): ${absoluteUrl}`);
  const destination = path.join(siteRoot, 'blog', 'assets', articleId, fileName);
  await mkdir(path.dirname(destination), {recursive: true});
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return `assets/${articleId}/${fileName}`;
}
async function localizeImages(bodyHtml, articleId, articleUrl) {
  const tags = [...bodyHtml.matchAll(/<img\b[^>]*>/gi)];
  let result = bodyHtml;
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    const original = tags[index][0];
    const source = getAttribute(original, 'data-src') || getAttribute(original, 'src');
    if (!source || source.startsWith('data:')) continue;
    try {
      const local = await downloadImage(new URL(source, articleUrl).href, articleId, `image-${index + 1}`);
      const replacement = setAttribute(setAttribute(original, 'src', local)
        .replace(/\s(?:data-src|data-original|srcset|data-srcset|loading)\s*=\s*(?:"[^"]*"|'[^']*')/gi, ''), 'loading', 'lazy');
      result = result.slice(0, tags[index].index) + replacement + result.slice(tags[index].index + original.length);
    } catch (error) {
      console.warn(`画像を保存できなかったため元のURLを使います: ${error.message}`);
    }
  }
  return result;
}

/* ---------- noteのアイコン ---------- */
// 1. noteのAPI  2. プロフィールページに埋め込まれたデータ  3. RSSの画像 の順に探す
const AVATAR_TYPES = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif'};
const isNoteImage = (url) => { try { return /(^|\.)st-note\.com$/.test(new URL(url).hostname); } catch { return false; } };
async function findAvatarUrl(user, rss) {
  try {
    const response = await fetch(`https://note.com/api/v2/creators/${encodeURIComponent(user)}`, {headers: {'User-Agent': userAgent, Accept: 'application/json'}});
    if (response.ok) {
      const url = (await response.json())?.data?.profileImageUrl;
      if (isNoteImage(url)) return url;
    }
  } catch { /* 次の方法で探す */ }
  try {
    const html = await fetchText(`https://note.com/${encodeURIComponent(user)}`);
    const raw = html.match(/"profileImageUrl"\s*:\s*"([^"]+)"/)?.[1];
    const url = raw && JSON.parse(`"${raw}"`);
    if (isNoteImage(url)) return url;
  } catch { /* 次の方法で探す */ }
  const channelImage = readTag(readTag(rss.split(/<item>/i)[0], 'image'), 'url');
  return isNoteImage(channelImage) ? channelImage : '';
}
async function syncAvatar(user, rss) {
  const found = await findAvatarUrl(user, rss);
  if (!found) { console.warn('noteのアイコンが見つからなかったため、今のアイコンのままにしました。'); return; }
  const url = new URL(found);
  url.searchParams.set('width', '240'); // 表示は72px。高解像度の画面でもきれいに見える大きさで受け取る
  const response = await fetch(url.href, {headers: {'User-Agent': userAgent}});
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!response.ok || !AVATAR_TYPES[type]) { console.warn(`noteのアイコンを取得できませんでした (${response.status} ${type})`); return; }
  const data = Buffer.from(await response.arrayBuffer());
  const fileName = `avatar${AVATAR_TYPES[type]}`;
  const assets = path.join(siteRoot, 'assets');
  for (const name of await readdir(assets)) if (/^avatar\./.test(name) && name !== fileName) await rm(path.join(assets, name));
  await writeFile(path.join(assets, fileName), data);
  const version = createHash('sha256').update(data).digest('hex').slice(0, 10);
  await replaceBetweenMarkers('index.html', '<!-- AVATAR_START -->', '<!-- AVATAR_END -->',
    `<div class="avatar" aria-hidden="true"><img src="assets/${fileName}?v=${version}" alt="" width="72" height="72"></div>`);
  console.log('noteのアイコンを反映しました。');
}

/* ---------- 本文を安全な形に ---------- */
function sanitizeArticleHtml(html, sourceUrl) {
  let result = html.replace(/<figure\b([^>]*\bembedded-service[^>]*)>[\s\S]*?<\/figure>/gi, (figure, attributes) => {
    const raw = getAttribute(`<figure ${attributes}>`, 'data-src');
    if (!raw) return figure;
    const url = new URL(decodeEntities(raw), sourceUrl);
    const titleMatch = figure.match(/class=(?:"external-article-widget-title"|'external-article-widget-title')[^>]*>([\s\S]*?)<\/strong>/i);
    const label = titleMatch ? textFromHtml(titleMatch[1]) : (url.pathname.split('/').filter(Boolean).slice(0, 2).join(' / ') || url.hostname);
    return `<a class="article-embed-card" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(url.hostname)} ↗</span></a>`;
  });
  result = result
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s(?:on\w+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\sdata-v-[\w-]+(?:=(?:"[^"]*"|'[^']*'))?/gi, '')
    .replace(/\s(?:name|id)=(?:"[^"]*"|'[^']*')/gi, '');
  return result.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = getAttribute(tag, 'href');
    if (!href || href.startsWith('#')) return tag;
    let absolute;
    try { absolute = new URL(href, sourceUrl); } catch { return setAttribute(tag, 'href', '#'); }
    if (!['http:', 'https:'].includes(absolute.protocol)) return setAttribute(tag, 'href', '#');
    let next = setAttribute(tag, 'href', absolute.href);
    if (absolute.origin !== new URL(sourceUrl).origin) next = setAttribute(setAttribute(next, 'target', '_blank'), 'rel', 'noopener noreferrer');
    return next;
  });
}

// noteの目次は見出しのidへのリンクなので、目次と同じ文字の見出しにidを付け直す
function restoreTocAnchors(html) {
  const toc = html.match(/<div\b[^>]*data-table-of-contents[^>]*>[\s\S]*?<\/nav>\s*<\/div>/i);
  if (!toc) return html;
  const end = toc.index + toc[0].length;
  let rest = html.slice(end);
  for (const [, id, label] of toc[0].matchAll(/<a\b[^>]*href="#([\w-]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = textFromHtml(label);
    let done = false;
    rest = rest.replace(/<(h[2-4])\b([^>]*)>([\s\S]*?)<\/\1>/gi, (heading, tag, attributes, inner) => {
      if (done || /\sid=/i.test(attributes) || textFromHtml(inner) !== text) return heading;
      done = true;
      return `<${tag} id="${escapeHtml(id)}"${attributes}>${inner}</${tag}>`;
    });
  }
  return html.slice(0, end) + rest;
}

/* ---------- ページのひな形 ---------- */
const BODY_START = '<!-- ARTICLE_BODY_START -->';
const BODY_END = '<!-- ARTICLE_BODY_END -->';
const appearanceControl = `<fieldset class="appearance">
<legend>表示</legend>
<div class="segmented">
<label><input type="radio" name="appearance" value="auto" checked><span>自動</span></label>
<label><input type="radio" name="appearance" value="light"><span>ライト</span></label>
<label><input type="radio" name="appearance" value="dark"><span>ダーク</span></label>
</div>
</fieldset>`;

function articleDocument(article, bodyHtml) {
  const title = escapeHtml(article.title);
  const source = escapeHtml(article.sourceUrl);
  const cover = article.coverPath ? `<figure class="doc-cover"><img src="${escapeHtml(article.coverPath)}" alt="" fetchpriority="high"></figure>\n` : '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title} | ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(article.description.slice(0, 160))}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${source}">
<meta name="theme-color" content="#f7f6f3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121211" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../assets/style.css?v=3">
<script src="../assets/theme.js?v=3"></script>
<script src="../assets/site.js?v=3" defer></script>
</head>
<body data-page="article">
<a class="skip" href="#main">本文へ移動</a>
<header class="appbar">
<a class="appbar-back" href="./">← 記事一覧</a>
<span class="appbar-title" aria-hidden="true">${title}</span>
<a class="appbar-action" href="${source}" target="_blank" rel="noopener">noteで開く ↗</a>
</header>
<main id="main" class="doc">
<article aria-labelledby="articleTitle">
<div class="doc-head">
<h1 id="articleTitle">${title}</h1>
<p class="doc-meta"><time class="num" datetime="${escapeHtml(isoDate(article.publishedAt))}">${formatDate(article.publishedAt)}</time><span>noteから同期</span></p>
${cover}</div>
<div class="article-body">
${BODY_START}${bodyHtml}${BODY_END}
</div>
<footer class="article-end"><a href="./">← 記事一覧</a><a href="${source}" target="_blank" rel="noopener">元の記事をnoteで読む ↗</a></footer>
</article>
<footer class="footer">
<a href="../">${escapeHtml(siteName)}</a>
${appearanceControl}
</footer>
</main>
</body>
</html>
`;
}

// 記事の行（prefix はページから blog/ フォルダまでの相対パス）。日付・タイトルと説明・サムネイルの3列
function postRow(article, prefix, {description = false} = {}) {
  const href = article.generated ? `${prefix}${article.id}.html` : article.sourceUrl;
  const image = article.coverPath ? `${prefix}${article.coverPath}` : article.thumbnail;
  const external = article.generated ? '' : ' target="_blank" rel="noopener"';
  const text = (article.description || '').replace(/\s+/g, ' ').trim();
  const excerpt = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  const sub = description && excerpt ? `<span class="row-sub">${escapeHtml(excerpt)}</span>` : '';
  const mark = article.generated ? '' : ' <span class="external">note ↗</span>';
  const thumb = image ? `<span class="row-thumb"><img src="${escapeHtml(image)}" alt="" loading="lazy"></span>` : '';
  return `<li><a class="row" href="${escapeHtml(href)}"${external}><time class="num" datetime="${escapeHtml(isoDate(article.publishedAt))}">${formatDate(article.publishedAt)}</time><span class="row-main"><span class="row-title">${escapeHtml(article.title)}${mark}</span>${sub}</span>${thumb}</a></li>`;
}

async function replaceBetweenMarkers(relativePath, startMarker, endMarker, content) {
  const file = path.join(siteRoot, relativePath);
  const current = await readFile(file, 'utf8');
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error(`${relativePath} に更新する場所（${startMarker}）が見つかりません`);
  await writeFile(file, `${current.slice(0, start)}${startMarker}\n${content}\n${endMarker}${current.slice(end + endMarker.length)}`);
}

async function updateLists(articles) {
  const empty = '<li class="empty">まだ記事はありません。</li>';
  await replaceBetweenMarkers('index.html', '<!-- NOTE_LIST_START -->', '<!-- NOTE_LIST_END -->',
    articles.length ? articles.slice(0, homeCount).map((article) => postRow(article, 'blog/', {description: true})).join('\n') : empty);
  await replaceBetweenMarkers(path.join('blog', 'index.html'), '<!-- ARTICLE_LIST_START -->', '<!-- ARTICLE_LIST_END -->',
    articles.length ? articles.map((article) => postRow(article, '', {description: true})).join('\n') : empty);
}

async function writeArticlePage(article, body) {
  await mkdir(path.join(siteRoot, 'blog'), {recursive: true});
  await writeFile(path.join(siteRoot, 'blog', `${article.id}.html`), articleDocument(article, restoreTocAnchors(body)));
}

/* ---------- 同期 ---------- */
async function syncArticle(article) {
  try {
    const html = await fetchText(article.sourceUrl);
    const metadata = extractBlogPosting(html);
    const body = await localizeImages(sanitizeArticleHtml(extractArticleBody(html), article.sourceUrl), article.id, article.sourceUrl);
    const coverUrl = article.thumbnail || metadata?.image?.url || metadata?.image;
    let coverPath = '';
    if (coverUrl) {
      try { coverPath = await downloadImage(coverUrl, article.id, 'cover'); } catch (error) { console.warn(error.message); }
    }
    const enriched = {...article, title: metadata.headline || article.title, description: metadata.description || article.description, coverPath, generated: true};
    await writeArticlePage(enriched, body);
    console.log(`同期しました: ${enriched.title}`);
    return enriched;
  } catch (error) {
    console.warn(`記事を同期できませんでした: ${article.sourceUrl}\n${error.message}`);
    return {...article, coverPath: '', generated: false};
  }
}

async function sync() {
  if (!noteUser) {
    console.log('config.json に noteのアカウント（note.user）が書かれていないため、同期しませんでした。');
    return;
  }
  if (!/^[\w-]+$/.test(noteUser)) throw new Error(`noteのアカウント名が正しくありません: ${noteUser}`);
  const rss = await fetchText(`https://note.com/${noteUser}/rss`);
  try { await syncAvatar(noteUser, rss); } catch (error) { console.warn(`noteのアイコンを反映できませんでした: ${error.message}`); }
  const articles = parseRss(rss);
  const synced = [];
  for (const article of articles) synced.push(await syncArticle(article));
  await writeFile(path.join(siteRoot, 'blog', 'articles.json'), `${JSON.stringify(synced, null, 2)}\n`);
  await updateLists(synced);
  console.log(`全${synced.length}件を確認しました。`);
}

async function rebuild() {
  let articles = [];
  try { articles = JSON.parse(await readFile(path.join(siteRoot, 'blog', 'articles.json'), 'utf8')); } catch { /* まだ記事がない */ }
  for (const article of articles.filter((entry) => entry.generated)) {
    const html = await readFile(path.join(siteRoot, 'blog', `${article.id}.html`), 'utf8').catch(() => '');
    const start = html.indexOf(BODY_START);
    const end = html.indexOf(BODY_END);
    if (start < 0 || end < start) { console.warn(`保存済みの本文が見つからないため飛ばしました: ${article.id}`); continue; }
    await writeArticlePage(article, html.slice(start + BODY_START.length, end));
    console.log(`作り直しました: ${article.title}`);
  }
  await updateLists(articles);
}

(process.argv.includes('--rebuild') ? rebuild() : sync()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
