(() => {
  const noteFeed = document.getElementById('latestNoteFeed');
  const youtubeFeed = document.getElementById('latestYoutubeFeed');
  const githubFeed = document.getElementById('latestGithubFeed');

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date).replaceAll('/', '.');
  };

  const appendText = (parent, tagName, text, className = '') => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  };

  const externalLink = (url, className) => {
    const link = document.createElement('a');
    link.className = className;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  };

  const renderNote = (article) => {
    const link = document.createElement('a');
    link.className = 'note-article';
    link.href = article.generated ? `/blog/${article.id}.html` : article.sourceUrl;
    if (!article.generated) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
    const thumbnail = article.coverPath ? `/blog/${article.coverPath}` : article.thumbnail;
    if (thumbnail) {
      const image = document.createElement('img');
      image.className = 'note-article-thumb';
      image.src = thumbnail;
      image.alt = '';
      image.loading = 'lazy';
      link.appendChild(image);
    }
    const copy = document.createElement('span');
    copy.className = 'note-article-copy';
    const time = appendText(copy, 'time', formatDate(article.publishedAt));
    time.dateTime = article.publishedAt;
    appendText(copy, 'strong', article.title);
    appendText(copy, 'span', article.generated ? 'サイト内で読む →' : 'noteで読む →');
    link.appendChild(copy);
    return link;
  };

  const renderYoutube = (video) => {
    const link = externalLink(video.sourceUrl, 'youtube-video');
    if (video.thumbnail) {
      const image = document.createElement('img');
      image.src = video.thumbnail;
      image.alt = '';
      image.loading = 'lazy';
      link.appendChild(image);
    }
    const copy = document.createElement('span');
    copy.className = 'youtube-video-copy';
    const time = appendText(copy, 'time', formatDate(video.publishedAt));
    time.dateTime = video.publishedAt;
    appendText(copy, 'strong', video.title);
    appendText(copy, 'span', 'YouTubeで見る →');
    link.appendChild(copy);
    return link;
  };

  const renderRepository = (repository) => {
    const link = externalLink(repository.html_url, 'github-repository');
    const meta = document.createElement('span');
    meta.className = 'github-repository-meta';
    const time = appendText(meta, 'time', formatDate(repository.pushed_at));
    time.dateTime = repository.pushed_at;
    if (repository.language) appendText(meta, 'span', repository.language);
    link.appendChild(meta);
    appendText(link, 'strong', repository.name);
    appendText(link, 'span', repository.description || '公開リポジトリをGitHubで見る');
    return link;
  };

  Promise.all([
    fetch('/blog/articles.json').then((response) => {
      if (!response.ok) throw new Error(`note: ${response.status}`);
      return response.json();
    }),
    fetch('/blog/latest-links.json').then((response) => {
      if (!response.ok) throw new Error(`links: ${response.status}`);
      return response.json();
    }),
  ]).then(([articles, latest]) => {
    if (noteFeed && articles.length) noteFeed.replaceChildren(...articles.slice(0, 3).map(renderNote));
    if (youtubeFeed && latest.youtubeVideos?.length) youtubeFeed.replaceChildren(...latest.youtubeVideos.slice(0, 3).map(renderYoutube));
    if (githubFeed && latest.githubRepositories?.length) githubFeed.replaceChildren(...latest.githubRepositories.slice(0, 3).map(renderRepository));
  }).catch((error) => {
    console.warn('最新情報はページ内の保存済み表示を使用します', error);
  });
})();
