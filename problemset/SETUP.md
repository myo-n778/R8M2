# セットアップ手順

## GitHub Pagesでの公開

GitHub Pagesで公開する場合、以下のURLでアクセスできます：

- メインページ: https://myo-n778.github.io/R8M2/
- 直接アクセス: https://myo-n778.github.io/R8M2/science2.0.html

GitHub Pagesは既に有効になっています。変更をプッシュすると、数分で反映されます。

## 必要な設定

### 1. Google Apps Script (GAS) のデプロイ

1. [Google Apps Script](https://script.google.com/) にアクセス
2. 新しいプロジェクトを作成
3. `GAS.txt` の内容をコピーして貼り付け
4. 「デプロイ」→「新しいデプロイ」を選択
5. 種類として「ウェブアプリ」を選択
6. 以下の設定でデプロイ：
   - 説明: 任意
   - 次のユーザーとして実行: 自分
   - アクセスできるユーザー: 全員
7. デプロイURLをコピーして、`science2.0.html` の `FIXED_GAS_URL` に設定

### 2. スプレッドシートの設定

スプレッドシートID: `1LCGCVjeiTicyclXFTP0EaxxB_RluZJrveWPo1FdLzsk`

#### 必要なシート

以下のシートが自動生成されます（初回実行時）：
- **履歴ログ**: 全ユーザーの演習履歴
- **詳細履歴ログ**: 問題ごとの詳細履歴
- **問題別統計DB**: 各問題の統計情報
- **成績一覧**: 全ユーザーの成績一覧（関数で自動更新）

#### 手動作成が必要なシート

1. **メンバー一覧** シートを作成
   - 列構成：
     - A列: 組（菊/桜）
     - B列: 番号（1~40）
     - C列: 名前
   - ヘッダー行を追加：
     ```
     組    番号  名前
     菊    1    サンプル
     ```

2. **各分野のシート** を作成
   - シート名がそのまま分野名になります
   - 例: 「力学」「電磁気学」など
   - データ形式：
     - **TSV形式（推奨）**: タブ区切りで、列構成は「問題、選択肢1、選択肢2、選択肢3、選択肢4、...、正解番号、解説」
     - **CSV形式**: カンマ区切りで、「問題、答え」の2列

3. **設定** シートは任意
   - 列構成：
     - A列: キー
     - B列: 値
   - 現在使える主なキー：
     - `appUrl`
     - `disableExpCaps`
     - `perSetPerfectCap`
     - `dailyGrantLimit`
     - `duplicateLogWindowSec`
   - 例：
     ```
     appUrl    https://myo-n778.github.io/R8M2/problemset/science2.0.html
     disableExpCaps    true
     perSetPerfectCap    5
     dailyGrantLimit    2
     duplicateLogWindowSec    60
     ```

### 3. HTMLファイルの設定確認

`science2.0.html` の以下の設定を確認：

```javascript
const FIXED_GAS_URL = "https://script.google.com/macros/s/AKfycbzsheqTjtvzClj2RoRhlOln1hIbVNdncqnFjPaBPUOqBwyTPM7ZuFM8yINAFL5G2VlKrg/exec";
const FIXED_SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1LCGCVjeiTicyclXFTP0EaxxB_RluZJrveWPo1FdLzsk/edit";
```

### 4. 動作確認

1. HTMLファイルをブラウザで開く
2. 登録モーダルが表示されることを確認
3. クラス、番号、名前を入力して登録
4. 「Sync」ボタンをクリックしてデータを取得
5. 問題が表示されることを確認

## トラブルシューティング

### ページが読めない場合

1. **GAS URLが正しいか確認**
   - ブラウザの開発者ツール（F12）のConsoleタブでエラーを確認
   - ネットワークタブでGASへのリクエストが失敗していないか確認

2. **スプレッドシートの権限確認**
   - スプレッドシートが「リンクを知っている全員」に共有されているか確認
   - GASスクリプトがスプレッドシートにアクセスできる権限があるか確認

3. **GASスクリプトの権限確認**
   - GASスクリプトを初回実行時に、権限の承認が必要です
   - 「承認が必要です」という画面が表示されたら、承認してください

4. **メンバー一覧シートの確認**
   - 「メンバー一覧」シートが存在するか確認
   - ヘッダー行（組、番号、名前）が正しく設定されているか確認

5. **問題データシートの確認**
   - 少なくとも1つの分野シート（例：「力学」）が存在するか確認
   - データが正しい形式で入力されているか確認

### よくあるエラー

- **"Invalid argument: id"**: スプレッドシートIDが正しく設定されていません
- **"スプレッドシートが見つかりません"**: スプレッドシートIDが間違っているか、権限がありません
- **"データの取得に失敗しました"**: GAS URLが間違っているか、GASスクリプトがデプロイされていません
