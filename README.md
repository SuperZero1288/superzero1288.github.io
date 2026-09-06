# ぜろくんでんせつ Portfolio

GitHub Pagesで公開しているポートフォリオです。トップページ下段に、note記事と将来用ボタンを表示します。

## note記事の更新

GitHub Actionsの `note記事を同期` が6時間ごとに公開記事を確認し、変更がある場合だけサイトを更新します。手動で更新したい場合は、GitHubの `Actions` から同じワークフローを実行します。

## 自動同期の内容

- `https://note.com/zerrrrro_1288/rss` から公開記事を検出
- 各公開記事の本文を取得
- 記事内画像と見出し画像を `blog/assets/` へ保存
- `blog/記事ID.html` にサイト内記事ページを生成
- トップページのnote欄を最新3件に更新
- X・BOOTH・VRChat・GitHubの公開プロフィール画像を更新

無料版noteの公開画面を読み取る非公式方式です。note側のHTML構造が変わった場合は、`sync-note.mjs` の調整が必要になることがあります。

有料記事や限定公開部分は取得対象にしないでください。
