# DESIGN.md — Acoru FinApp

このファイルは、Acoru FinApp の画面デザインとレイアウトをAIエージェントが再現・拡張するための仕様です。
参照デザインは `awesome-design-md-jp/design-md/paypay/DESIGN.md` の方向性を採用し、Acoru FinApp向けに調整しています。

## 1. Visual Theme

- 方針: フィンテックらしい明るさ、太い見出し、明確なCTA、白基調の管理画面。
- 雰囲気: Friendly / Bold / Campaign-driven / Business dashboard。
- 重要: 機能・API・DB仕様は変更せず、画面レイアウトとスタイルだけを刷新する。

## 2. Color Tokens

| Role | Hex | 用途 |
| --- | --- | --- |
| Brand Blue | `#3895FF` | Primary CTA、リンク、現在状態 |
| Blue Dark | `#214DD2` | 強いリンク、ブランド補助 |
| Brand Red | `#F24F4F` | KPI数値、警告、強調 |
| Red Tag | `#FD5C5C` | タグ、主催ラベル |
| Text Primary | `#242323` | 本文・見出し |
| Text Sub | `#606060` | メタ情報、補足文 |
| Surface Blue | `#EEF6FF` | Active nav、テーブルヘッダー、アップロード面 |
| Surface Red | `#FFF2F2` | サイドバー補助カード |

## 3. Typography

- Body: `Hiragino Kaku Gothic ProN`, `ヒラギノ角ゴ ProN W3`, `Noto Sans JP`, `Meiryo`, sans-serif。
- Heading: `Noto Sans JP` を優先する。
- 見出しは原則 `font-weight: 700`、`line-height: 1.6`。
- `letter-spacing` は変更しない。

## 4. Layout

- Desktop: 左サイドバー + 右メインコンテンツ。
- Header: Blue面の大型ヒーロー。白文字で大見出しを配置。
- Mobile: サイドバーを非表示にし、ハンバーガードロワーでナビゲーションする。
- 角丸は原則 `6px`。大きなシャドウや強いグラデーションは避ける。

## 5. Components

### Buttons

- Primary: `#3895FF` background、白文字、`6px` radius、太字。
- Secondary: 白背景、薄いborder。
- Ghost: 白背景、Blue文字、Blue系border。

### Tags

- Campaign: `#BBCFF2` background + `#002970` text。
- Organizer: 白背景 + `#FD5C5C` text。

### Tables

- Headerは淡いBlue背景。
- Active sortや重要状態はRedで示す。
- 横スクロールは許容し、既存の編集機能を妨げない。

### Upload

- Drop areaは淡いBlue面、破線border、中央に大きな行動文を置く。
- アップロード操作は下部固定またはデスクトップでは横並びにする。

## 6. Do / Don't

### Do

- CTAはBlue、強調値はRedを使う。
- 見出しは大きく太くする。
- 白基調で余白を広めに取る。
- 既存のクラス名と画面ロジックを優先して壊さない。

### Don't

- DB、API、バリデーション、アップロード処理に触れない。
- 9999pxの過度なpill角丸や強いshadowを多用しない。
- 文字間隔を広げない。
- UI刷新と無関係なリファクタを混ぜない。
