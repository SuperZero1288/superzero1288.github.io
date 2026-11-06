// ZERO — リンク集ページ: 同期済みのnote・YouTube・GitHubの更新情報を並べます。
(() => {
  'use strict';
  const site = window.zeroSite;
  if (!site) return;
  const {element, safeUrl, formatDate, loadJson, noteCard} = site;
  const $ = (id) => document.getElementById(id);

  const videoCard = (video) => {
    const link = element('a', 'video-card');
    link.href = safeUrl(video.sourceUrl, 'https://www.youtube.com/@ZErrrrrO_VRC');
    link.target = '_blank';
    link.rel = 'noopener';
    if (video.thumbnail) {
      const image = element('img');
      image.src = safeUrl(video.thumbnail, '');
      image.alt = '';
      image.loading = 'lazy';
      link.append(image);
    }
    const copy = element('span', 'note-copy');
    const time = element('time', '', formatDate(video.publishedAt));
    time.dateTime = video.publishedAt;
    copy.append(time, element('strong', '', video.title), element('small', '', 'YouTubeで見る ↗'));
    link.append(copy);
    return link;
  };
  const repositoryItem = (repository) => {
    const item = element('li');
    const link = element('a');
    link.href = safeUrl(repository.html_url, 'https://github.com/SuperZero1288');
    link.target = '_blank';
    link.rel = 'noopener';
    const meta = [formatDate(repository.pushed_at), repository.language].filter(Boolean).join(' / ');
    link.append(element('strong', '', repository.name), element('small', '', repository.description || meta || '公開リポジトリをGitHubで見る'));
    if (repository.description && meta) link.append(element('small', '', meta));
    item.append(link);
    return item;
  };

  loadJson('/blog/articles.json').then((articles) => {
    if (articles.length) $('latestNoteFeed').replaceChildren(...articles.slice(0, 3).map(noteCard));
  }).catch((error) => console.warn('note記事はページ内の表示を使います', error));
  loadJson('/blog/latest-links.json').then((latest) => {
    if (latest.youtubeVideos?.length) $('latestYoutubeFeed').replaceChildren(...latest.youtubeVideos.slice(0, 3).map(videoCard));
    if (latest.githubRepositories?.length) $('latestGithubFeed').replaceChildren(...latest.githubRepositories.slice(0, 3).map(repositoryItem));
  }).catch((error) => console.warn('YouTube・GitHubの更新情報はページ内の表示を使います', error));
})();
