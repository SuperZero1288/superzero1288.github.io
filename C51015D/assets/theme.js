// 描画の前に、保存したダーク/ライトを反映します（<head>で同期的に読み込みます）。
// 保存場所の名前は「c51015d:」で始め、同じドメインにある ぜろくんでんせつ のサイトの設定と混ざらないようにしています。
try {
  const saved = localStorage.getItem('c51015d:theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch {}
