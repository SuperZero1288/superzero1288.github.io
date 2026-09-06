import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const noteProfileUrl = (process.env.NOTE_PROFILE_URL || 'https://note.com/zerrrrro_1288').replace(/\/$/, '');
const rssUrl = `${noteProfileUrl}/rss`;
const maxHomeArticles = 3;

const decodeEntities = (value = '') => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttribute = escapeHtml;

function textFromHtml(value = '') {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function readTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const link = readTag(item, 'link');
    const idMatch = link.match(/\/n\/([^/?#]+)/);
    return {
      id: idMatch?.[1] || createHash('sha1').update(link).digest('hex').slice(0, 16),
      title: textFromHtml(readTag(item, 'title')),
      description: textFromHtml(readTag(item, 'description')).replace(/続きをみる$/, '').trim(),
      thumbnail: readTag(item, 'media:thumbnail'),
      publishedAt: readTag(item, 'pubDate'),
      sourceUrl: link,
    };
  }).filter((article) => article.title && article.sourceUrl);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'zero-portfolio-note-sync/1.0 (+GitHub Actions)',
      Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`${url} の取得に失敗しました (${response.status})`);
  return response.text();
}

function extractArticleBody(html) {
  const opening = /<div\b(?=[^>]*\bdata-name=(?:"body"|'body'))[^>]*>/i.exec(html);
  if (!opening) throw new Error('本文の開始位置を見つけられませんでした');

  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = opening.index;
  let depth = 0;
  let openingEnd = -1;
  let match;

  while ((match = tagPattern.exec(html))) {
    const isClosing = /^<\/div/i.test(match[0]);
    if (!isClosing) {
      depth += 1;
      if (openingEnd < 0) openingEnd = tagPattern.lastIndex;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(openingEnd, match.index);
    }
  }
  throw new Error('本文の終了位置を見つけられませんでした');
}

function extractBlogPosting(html) {
  for (const match of html.matchAll(/<script[^>]+type=(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      const entries = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      const posting = entries.find((entry) => entry?.['@type'] === 'BlogPosting');
      if (posting) return posting;
    } catch {
      // 別のJSON-LDが壊れていても、次の候補を確認します。
    }
  }
  return {};
}

function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return /^\.(?:avif|gif|jpe?g|png|webp)$/.test(ext) ? ext : '.jpg';
  } catch {
    return '.jpg';
  }
}

async function downloadImage(url, articleId, label = '') {
  if (!url || url.startsWith('data:')) return url;
  const absoluteUrl = new URL(url, 'https://note.com').href;
  const digest = createHash('sha256').update(absoluteUrl).digest('hex').slice(0, 14);
  const fileName = `${label ? `${label}-` : ''}${digest}${extensionFromUrl(absoluteUrl)}`;
  const relativeFromArticle = `assets/${articleId}/${fileName}`;
  const destination = path.join(projectRoot, 'blog', 'assets', articleId, fileName);

  const response = await fetch(absoluteUrl, { headers: { 'User-Agent': 'zero-portfolio-note-sync/1.0' } });
  if (!response.ok) throw new Error(`画像の取得に失敗しました (${response.status}): ${absoluteUrl}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return relativeFromArticle;
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : '';
}

function setAttribute(tag, name, value) {
  const attrPattern = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'i');
  const cleaned = tag.replace(attrPattern, '');
  return cleaned.replace(/\s*\/?\s*>$/, ` ${name}="${escapeAttribute(value)}">`);
}

async function localizeImages(bodyHtml, articleId, articleUrl) {
  const imageTags = [...bodyHtml.matchAll(/<img\b[^>]*>/gi)];
  let result = bodyHtml;

  for (let index = imageTags.length - 1; index >= 0; index -= 1) {
    const match = imageTags[index];
    const originalTag = match[0];
    const source = getAttribute(originalTag, 'data-src') || getAttribute(originalTag, 'src');
    if (!source) continue;

    try {
      const absoluteSource = new URL(source, articleUrl).href;
      const localSource = await downloadImage(absoluteSource, articleId, `image-${index + 1}`);
      let replacement = setAttribute(originalTag, 'src', localSource)
        .replace(/\s(?:data-src|data-original|srcset|data-srcset)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
        .replace(/\sloading\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
      replacement = setAttribute(replacement, 'loading', 'lazy');
      result = result.slice(0, match.index) + replacement + result.slice(match.index + originalTag.length);
    } catch (error) {
      console.warn(`画像を保存できなかったため元URLを使用します: ${error.message}`);
    }
  }
  return result;
}

function sanitizeArticleHtml(html, sourceUrl) {
  let result = html.replace(/<figure\b([^>]*\bembedded-service[^>]*)>[\s\S]*?<\/figure>/gi, (figure, attributes) => {
    const rawUrl = getAttribute(`<figure ${attributes}>`, 'data-src');
    if (!rawUrl) return figure;
    const absoluteUrl = new URL(decodeEntities(rawUrl), sourceUrl).href;
    const titleMatch = figure.match(/class=(?:"external-article-widget-title"|'external-article-widget-title')[^>]*>([\s\S]*?)<\/strong>/i);
    const url = new URL(absoluteUrl);
    const pathLabel = url.pathname.split('/').filter(Boolean).slice(0, 2).join(' / ');
    const label = titleMatch ? textFromHtml(titleMatch[1]) : (pathLabel || url.hostname);
    return `<a class="article-embed-card" href="${escapeAttribute(absoluteUrl)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(url.hostname)} ↗</span></a>`;
  });

  result = result
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/\s(?:on\w+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\sdata-v-[\w-]+(?:=(?:"[^"]*"|'[^']*'))?/gi, '')
    .replace(/\s(?:name|id)=(?:"[^"]*"|'[^']*')/gi, '');

  result = result.replace(/<a\b([^>]*)>/gi, (tag, attrs) => {
    const href = getAttribute(tag, 'href');
    if (!href || href.startsWith('#')) return tag;
    const absolute = new URL(href, sourceUrl).href;
    let next = setAttribute(tag, 'href', absolute);
    if (new URL(absolute).origin !== new URL(sourceUrl).origin) {
      next = setAttribute(next, 'target', '_blank');
      next = setAttribute(next, 'rel', 'noopener noreferrer');
    }
    return next;
  });
  return result;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date).replaceAll('/', '.');
}

function articleDocument(article, bodyHtml, coverPath) {
  const title = escapeHtml(article.title);
  const description = escapeAttribute(article.description.slice(0, 160));
  const publishedLabel = formatDate(article.publishedAt);
  const coverMarkup = coverPath
    ? `<img class="article-cover" src="${escapeAttribute(coverPath)}" alt="" fetchpriority="high">`
    : '';
  const backdropStyle = coverPath ? ` style="background-image:url('${escapeAttribute(coverPath)}')"` : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | ぜろくんでんせつ</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${escapeAttribute(article.sourceUrl)}">
<link rel="stylesheet" href="../style.css">
</head>
<body class="style-default article-page">
<div class="article-backdrop"${backdropStyle}></div>
<main class="article-shell">
<article class="article-card">
<nav class="article-nav" aria-label="記事ナビゲーション">
<a href="../index.html#main-content">← portfolio</a>
<a href="${escapeAttribute(article.sourceUrl)}" target="_blank" rel="noopener">noteで見る ↗</a>
</nav>
${coverMarkup}
<h1 class="article-title">${title}</h1>
<div class="article-meta"><span>ぜろ</span><time datetime="${escapeAttribute(new Date(article.publishedAt).toISOString())}">${publishedLabel}</time><span>noteから自動同期</span></div>
<div class="article-body">${bodyHtml}</div>
<footer class="article-footer"><a href="${escapeAttribute(article.sourceUrl)}" target="_blank" rel="noopener">元の記事をnoteで読む ↗</a></footer>
</article>
</main>
</body>
</html>
`;
}

function homeArticleMarkup(article) {
  const localUrl = article.generated ? `blog/${article.id}.html` : article.sourceUrl;
  const thumbnail = article.coverPath
    ? `blog/${article.coverPath}`
    : article.thumbnail;
  const image = thumbnail
    ? `<img class="note-article-thumb" src="${escapeAttribute(thumbnail)}" alt="" loading="lazy">`
    : '';
  const target = article.generated ? '' : ' target="_blank" rel="noopener"';
  return `<a class="note-article" href="${escapeAttribute(localUrl)}"${target}>
${image}
<span class="note-article-copy">
<time datetime="${escapeAttribute(article.publishedAt)}">${formatDate(article.publishedAt)}</time>
<strong>${escapeHtml(article.title)}</strong>
<span>${article.generated ? 'サイト内で読む' : 'noteで読む'} →</span>
</span>
</a>`;
}

async function updateHomePage(articles) {
  const indexPath = path.join(projectRoot, 'index.html');
  const current = await readFile(indexPath, 'utf8');
  const startMarker = '<!-- NOTE_ARTICLES_START -->';
  const endMarker = '<!-- NOTE_ARTICLES_END -->';
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  if (start < 0 || end < 0 || end < start) throw new Error('index.htmlのnote更新位置が見つかりません');

  const cards = articles.slice(0, maxHomeArticles).map(homeArticleMarkup).join('\n');
  const replacement = `${startMarker}\n${cards}\n${endMarker}`;
  const next = current.slice(0, start) + replacement + current.slice(end + endMarker.length);
  await writeFile(indexPath, next);
}

async function syncArticle(article) {
  try {
    const html = await fetchText(article.sourceUrl);
    const metadata = extractBlogPosting(html);
    const rawBody = extractArticleBody(html);
    const sanitized = sanitizeArticleHtml(rawBody, article.sourceUrl);
    const body = await localizeImages(sanitized, article.id, article.sourceUrl);
    const coverUrl = article.thumbnail || metadata?.image?.url || metadata?.image;
    const coverPath = coverUrl ? await downloadImage(coverUrl, article.id, 'cover') : '';

    const enriched = {
      ...article,
      title: metadata.headline || article.title,
      description: metadata.description || article.description,
      coverPath,
      generated: true,
    };
    await mkdir(path.join(projectRoot, 'blog'), { recursive: true });
    await writeFile(path.join(projectRoot, 'blog', `${article.id}.html`), articleDocument(enriched, body, coverPath));
    console.log(`同期完了: ${enriched.title}`);
    return enriched;
  } catch (error) {
    console.warn(`記事を同期できませんでした: ${article.sourceUrl}\n${error.message}`);
    return { ...article, generated: false, coverPath: '' };
  }
}

async function main() {
  const rss = await fetchText(rssUrl);
  const articles = parseRss(rss);
  if (!articles.length) throw new Error('公開記事がRSSに見つかりませんでした');

  const synced = [];
  for (const article of articles) synced.push(await syncArticle(article));
  await updateHomePage(synced);
  await writeFile(
    path.join(projectRoot, 'blog', 'articles.json'),
    `${JSON.stringify(synced.map(({ coverPath, generated, ...article }) => ({ ...article, coverPath, generated })), null, 2)}\n`,
  );
  console.log(`全${synced.length}件を確認しました。`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
