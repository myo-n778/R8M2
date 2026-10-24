# 依存更新の記録（2026-10-24）

KaTeXのJS・CSS・拡張を0.18.2へ統一し、実配布バイトからSHA-384のSRIを再計算しました。CSSの相対フォント参照も同じ版を使用します。

公式最新版0.19.1も確認しましたが、今回の修正下限0.18.2を固定し、strict関連の追加仕様変更を避けました。

## 検証

HTML内のJavaScript構文、SRIとnpm配布バイトの一致、分数・根号・添字・単位・化学式など7種類、Chrome headlessでの実際のCDN/SRI読込と数式描画を確認しました。バージョンとintegrity指定以外の教材・アプリコードは変更前と一致します。 保存済みfixtureから2問を解き、解説・100点判定・再読込後の復習履歴保持を確認しました。

## 未確認と反映境界

Chrome検証では外部データを模擬化し、本番GASへの通信を遮断しました。Tailwind Play CDNがHTTP403だったため、試験中だけ既存HTMLから生成したTailwind3 CSSを使用し、外部装飾フォント・アイコンは遮断しました。このため公開CDN込みの見た目一致、Safari/iPad実機、全教材の数式表示は未確認です。

本記録はブランチ上の変更です。main merge、GitHub Pages本番deploy、nativeリリースは実施していません。

根拠: https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7
