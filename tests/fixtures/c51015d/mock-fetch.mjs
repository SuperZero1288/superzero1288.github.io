// テスト用: noteへの通信の代わりに、このフォルダのファイルを返します。
import {readFileSync} from 'node:fs';
const here = new URL('./', import.meta.url);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=', 'base64');
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://note.com/testuser/rss') return new Response(readFileSync(new URL('rss.xml', here)), {status: 200, headers: {'content-type': 'application/rss+xml'}});
  if (url === 'https://note.com/api/v2/creators/testuser') return new Response(JSON.stringify({data: {urlname: 'testuser', profileImageUrl: 'https://assets.st-note.com/production/uploads/images/9/profile_test.png?fit=bounds&width=120'}}), {status: 200, headers: {'content-type': 'application/json'}});
  if (url === 'https://note.com/testuser/n/ntest1') return new Response(readFileSync(new URL('article.html', here)), {status: 200, headers: {'content-type': 'text/html'}});
  if (url.startsWith('https://assets.st-note.com/')) return new Response(png, {status: 200, headers: {'content-type': 'image/png'}});
  return new Response('not found', {status: 500});
};
