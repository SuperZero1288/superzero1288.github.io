// 描画の前に、保存した表示（ライト/ダーク）を反映します（<head>で同期的に読み込みます）。「自動」のときは何も保存しません。
// 保存場所の名前は「c51015d:」で始め、同じドメインにある ぜろくんでんせつ のサイトの設定と混ざらないようにしています。
try {
  const saved = localStorage.getItem('c51015d:theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch {}
