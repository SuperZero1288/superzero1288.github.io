# ぜろくんでんせつ Portfolio

GitHub Pagesで公開しているポートフォリオです。トップページ下段に、note記事と将来用ボタンを表示します。

## note記事・YouTube更新情報の同期

GitHub Actionsの `note記事を同期` が6時間ごとに公開情報を確認し、変更がある場合だけサイトを更新します。手動で更新したい場合は、GitHubの `Actions` から同じワークフローを実行します。

## 自動同期の内容

- `https://note.com/zerrrrro_1288/rss` から公開記事を検出
- 各公開記事の本文を取得
- 記事内画像と見出し画像を `blog/assets/` へ保存
- `blog/記事ID.html` にサイト内記事ページを生成
- トップページのnote欄を最新3件に更新
- リンク集ページのnote・YouTube・GitHub最新欄を更新
- X・YouTube・BOOTH・VRChat・GitHubの公開プロフィール画像を更新

無料版noteの公開画面を読み取る非公式方式です。note側のHTML構造が変わった場合は、`sync-note.mjs` の調整が必要になることがあります。

有料記事や限定公開部分は取得対象にしないでください。

## アセット配布ライブラリ

`/vrchat-assets/` は `SuperZero1288/Zeroichiba-Workshop` の公開ツリーを読み込み、`.cat` をカテゴリ、`.ast` をアセットとして表示します。`info.txt` が説明と導入条件、`Distribution/` 内のファイルが配布ファイルです。配布物そのものはこのサイトへコピーせず、GitHub上の原本へリンクします。

- `?category=…` / `?asset=…` でカテゴリ・アセットへの直接リンクが可能
- ブラウザの戻る／進むに対応し、一覧へ戻ると選択していたカードにフォーカスを復帰
- GitHub APIに接続できないときは、取得済みのツリーを利用できる場合に限り前回のカタログを表示（画像・説明・ダウンロードまでオフライン対応するものではありません）
- 説明の読み込みに失敗しても配布ファイルへのリンクは維持

### 軽量プレビューの更新

GitHubの原画像から、一覧用640px・詳細用1440pxのWebPを生成します。画像のGit blob SHAと一致するプレビューだけを使用し、原画像が更新された場合やプレビューがない場合は原画像へフォールバックします。原画像を開くリンクは維持しています。

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/preview-requirements.txt
.venv/bin/python scripts/sync-catalog-previews.py
```

生成される `vrchat-assets/previews/manifest.json` とWebPを確認して、サイトの変更と一緒にGitへ追加してください。同じSHAの画像は再生成しません。配布リポジトリのファイルは変更しません。初回の3画像は、原PNG合計約27.5MBに対し、大小6枚のWebP合計約246KBになっています。

## ローカル確認と自動テスト

サイト自体にはビルド処理は不要です。プレビューには次を使用できます。

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

テスト用にNode.js 22とPython 3を用意し、別のターミナルで実行します。起動中の8000番サーバーがない場合は、Playwrightが自動で起動します。

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:syntax
npm test
```

PR・mainへの変更では `サイトの表示とアクセシビリティを確認` が同じチェックを実行します。Playwright/axeで、配布ページの320px～デスクトップ幅、横向き、全対応テーマ、直接リンク・履歴、通信失敗・キャッシュ・再試行、キーボード操作、ダイアログのフォーカス復帰、ウィンドウの最小化・復帰、`prefers-reduced-motion` を確認します。自動検査はアクセシビリティの完全な適合を保証するものではありません。

テストではGitHub APIと外部画像・音声等を差し替え、外部サービスの可用性・読み込み速度には依存しません。`tests/fixtures/` は公開配布リポジトリから取得したテスト用データです。原画像を変更してプレビューを更新した場合は、ツリーのfixtureも更新します。配布リポジトリの構成・説明を変更した場合は、fixtureと該当するテストケースもあわせて更新してください。

```sh
gh api 'repos/SuperZero1288/Zeroichiba-Workshop/git/trees/main?recursive=1' > tests/fixtures/catalog-tree.json
```

CIで失敗した場合は、Actionsの `site-test-results` にスクリーンショットとトレースが7日間保存されます。

## キーボード・動きを減らす設定

- `Tab` / `Shift+Tab`：リンク・ボタン・入力欄を移動。写真が主役の初画面でも、キーボードで左右のタブを選ぶと表示されます。
- `Enter` / `Space`：ボタンを実行。ダイアログ内ではフォーカスが背景へ移動しません。
- `Esc`：プロフィール・検索・左右のカードを閉じて、開いた操作元へ復帰。検索のブックマーク編集では、まず編集を閉じます。
- 時計の `↓`：カレンダーを開く。日付を矢印キーで選び、`Enter` でコピー、`Esc` で時計へ戻ります。
- OS／ブラウザの「動きを減らす」設定：背景写真の自動切り替え・カードの傾き・スクロールや画面切り替えの動きを抑制。通常の初画面にCTAは追加せず、ロード画面の構成・待機仕様も維持しています。
