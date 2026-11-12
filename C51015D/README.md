# C51015D

`https://superzero1288.github.io/C51015D/` で公開している、独立したサイトです。
ぜろくんでんせつ のリポジトリに置いていますが、あちらのサイトからはリンクしておらず、サイトマップにも載せていません。
デザインは、ぜろくんでんせつ のサイトの前のデザインにあった「LiquidGlass」（すりガラス）をもとに、レイアウトを独自にしたものです。

今は中身が決まっていないので、テンプレート（仮の文章）になっています。

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | トップページ（プロフィール・About・Works・note記事・Links） |
| `blog/index.html` | note記事の一覧 |
| `blog/記事ID.html` | noteから同期した記事（自動で作られます） |
| `404.html` | このサイトの中で存在しないページを開いたときの画面 |
| `config.json` | サイト名と、noteの同期の設定 |
| `assets/style.css` | 見た目（色は先頭の `:root`、ガラスは `.glass`） |
| `assets/site.js` | 背景・メニュー（ドック）・ダーク/ライト切り替え |
| `assets/theme.js` | 保存したダーク/ライトを最初に反映 |
| `assets/icon.svg` | タブのアイコン |
| `scripts/sync-note.mjs` | noteの記事を同期するスクリプト |

ページ同士のリンクや画像は、すべて相対パス（`./` や `../` から始まる、または何も付けない書き方）にしています。
`/` から始まる書き方にすると ぜろくんでんせつ のサイトを指してしまうので、使わないでください。
こうしておくと、あとでこのフォルダごと別のリポジトリや独自ドメインに移しても、そのまま動きます。

## 中身を書きかえる

- `index.html` を開き、`<!-- ===== プロフィール ===== -->` などの見出しの下にある仮の文章（灰色で表示される部分、`class="placeholder"`）を書きかえます。
- アイコン画像は `assets/` に置き、`<div class="hero-avatar">C5</div>` の中を `<img src="assets/avatar.jpg" alt="">` にします。
- リンクは、`<li class="link-row">…</li>` を `<li><a class="link-row" href="https://..." target="_blank" rel="noopener">…</a></li>` の形にします。
- メニューの左上の「C5」は `assets/site.js` の `BRAND` で変えられます。

## noteの記事を同期する

1. `config.json` の `note.user` に noteのID（`https://note.com/〇〇` の 〇〇 の部分）を書きます。
2. GitHub の Actions にある「C51015D: note記事を同期」が、6時間ごとに記事を確認して、新しい記事をサイトに追加します（すぐ試すときは Actions から手動で実行できます）。

- トップページには新しい順に `note.homeCount` 件（はじめは3件）、記事一覧には全件が並びます。
- `note.user` が空のあいだは、同期は何もしません。
- 有料記事や限定公開の部分は取得しません。
- デザインを変えたときは `node C51015D/scripts/sync-note.mjs --rebuild` で、通信せずに記事ページを作り直せます。

## 公開するとき

今は検索結果に出ない設定（`noindex`）にしています。中身ができたら、

- `index.html` と `blog/index.html` の `<meta name="robots" content="noindex">` の行を消す
- `config.json` の `noindex` を `false` にする（同期で作る記事ページに反映されます）

## 注意

- ぜろくんでんせつ のサイトと同じドメインなので、ブラウザの保存データ（localStorage）は、お互いのページから読み書きできる状態です。このサイトの保存データの名前は `c51015d:` で始めて、混ざらないようにしています。
- `/C51015D/` の中で存在しないページを開くと、サイト全体の404ページ（ルートの `404.html`）が、このサイトの `404.html` へ移動させます。
