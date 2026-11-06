// 描画の前に、保存したダーク/ライトとテーマカラーを反映します（<head>で同期的に読み込みます）。
document.documentElement.classList.add('js');
try {
  const saved = JSON.parse(localStorage.getItem('zero-next-appearance') || '{}');
  if (saved.mode === 'light' || saved.mode === 'dark') document.documentElement.dataset.theme = saved.mode;
  if (typeof saved.hue === 'number') document.documentElement.style.setProperty('--h', saved.hue);
} catch {}
