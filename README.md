# YouTube MIDI Controller

DDJ-FLX4 を使って YouTube を操作する非公式の Chrome 拡張です。  
YouTube を 2 つのウィンドウで開くと、それぞれを Deck 1 / Deck 2 に割り当てて操作できます。

## 概要

この拡張では、DDJ-FLX4 の MIDI 入力を使って YouTube の再生をコントロールできます。

現在の主な機能:

- `PLAY/PAUSE` で再生 / 一時停止
- `CUE` でキューポイントの保存 / 呼び出し
- `CH CUE` でミュート切り替えとミュート状態の LED 表示
- `IN / OUT / EXIT` でループの設定 / 開始 / 解除
- `HOT CUE 1-8` でホットキューの保存 / 呼び出し
- `TEMPO` フェーダーで再生速度変更
- `JOG 外周` で一時的な加速 / 減速
- `JOG 天面` でシーク
- 2 デッキで 2 つの YouTube ウィンドウを別々に操作

## 免責

このプロジェクトは非公式の個人開発プロジェクトです。

- Google、YouTube、AlphaTheta、Pioneer DJ とは一切関係ありません
- `YouTube`、`Chrome`、`DDJ-FLX4`、`AlphaTheta`、`Pioneer DJ` は各権利者の商標または登録商標です
- YouTube、Chrome、コントローラ側の仕様変更により動作しなくなる可能性があります

## 使い方

### 1. GitHub からダウンロードする

1. この GitHub リポジトリのページを開きます
2. `Code` ボタンを押します
3. `Download ZIP` を選びます
4. ダウンロードした ZIP ファイルを任意の場所に展開します

### 2. Chrome に拡張機能を読み込む

1. Chrome で `chrome://extensions/` を開きます
2. 右上の `デベロッパー モード` を有効にします
3. `パッケージ化されていない拡張機能を読み込む` を押します
4. 展開したフォルダを選択します

### 3. YouTube を開く

- 1 デッキで使う場合
  - YouTube を 1 つのウィンドウで開きます
- 2 デッキで使う場合
  - YouTube を 2 つの別ウィンドウで開きます

拡張機能を読み込んだあとに YouTube ページを再読み込みしてください。

### 4. DDJ-FLX4 を接続する

1. DDJ-FLX4 を PC に接続します
2. Chrome が MIDI 利用の許可を求めたら許可します
3. YouTube 側に `Deck 1` または `Deck 2` のバッジが表示されることを確認します

### 5. 操作する

- `Play/Pause` で再生 / 一時停止
- `Cue` でキューポイント保存 / 呼び出し
- `CH CUE` でミュート切り替え
- `IN` でループ開始位置を指定
- `OUT` でループ終了位置を指定してループ開始
- `EXIT` でループ解除
- `Hot Cue 1-8` でホットキュー保存 / 呼び出し
- `Tempo` フェーダーで再生速度変更
- `JOG 外周` で一時的な加速 / 減速
- `JOG 天面` でシーク

## 操作内容

- `Play/Pause`
  - 再生と一時停止を切り替えます
- `Cue`
  - CUE 未保存時は現在位置を保存します
  - CUE 保存済み時は保存位置へ戻ります
- `CH CUE`
  - YouTube のミュート状態を切り替えます
  - ミュートではないときはボタン LED が点灯します
- `IN`
  - 現在位置をループ開始位置として保存します
  - ボタン LED が点灯します
- `OUT`
  - 現在位置をループ終了位置として保存します
  - `IN` から `OUT` までをループ再生します
- `EXIT`
  - 現在のループを解除します
- `Hot Cue 1-8`
  - 未保存時は現在位置を保存します
  - 保存済み時はその位置へ移動します
- `Tempo フェーダー`
  - YouTube の再生速度を変更します
- `JOG 外周`
  - 一時的に加速 / 減速します
- `JOG 天面`
  - 前後にシークします

## 2 デッキ動作

- 1 つ目の YouTube ウィンドウが Deck 1 になります
- 2 つ目の YouTube ウィンドウが Deck 2 になります
- 各ウィンドウには現在のデッキ番号を示すバッジが表示されます
- 3 つ以上 YouTube ウィンドウを開いた場合、割り当て対象は 2 つまでです

## 設定

オプション画面で `midiMapping` JSON を直接編集できます。

主な設定項目:

- `tempo.minRate`
- `tempo.maxRate`
- `tempo.minPlaybackRate`
- `tempo.maxPlaybackRate`
- `jog.sensitivity`
- `jog.scratchSeekSeconds`
- `jog.resetDelayMs`
- `jog.negativeSensitivityMultiplier`

## デフォルトマッピング

- `Play/Pause`
  - `note`, channel `0`, note `11`
- `Cue`
  - `note`, channel `0`, note `12`
- `CH CUE`
  - `note`, channel `0`, note `84`
- `Loop In`
  - `note`, channel `0`, note `16`
- `Loop Out`
  - `note`, channel `0`, note `17`
- `Loop Exit`
  - `note`, channel `0`, note `77`
- `Tempo`
  - `cc14`, channel `0`, cc `0`
- `JOG 外周`
  - `cc`, channel `0`, `33` と `35`
- `JOG 天面`
  - `cc`, channel `0`, `34`
- `Hot Cue 1-8`
  - `note`, channel `7`, note `0-7`

Deck 2 は Deck 1 のベースチャンネルから内部的にチャンネルをずらして処理しています。

## 注意点

- 対応サイトは `https://www.youtube.com/*` のみです
- CUE / HOT CUE は動画ごとに永続保存していません
- ループ位置も動画ごとに永続保存していません
- YouTube は SPA のため、ページ遷移時に内部状態をリセットしています
- 公開版では通常動作時の詳細ログを抑えています

## AI 生成について

このリポジトリに含まれるコードやドキュメントの一部は、AI 支援を利用して生成・編集されています。  
最終的な確認、調整、採用判断は作者が行っています。

## ファイル構成

- `content.js`
  - YouTube ページ上で動画操作と MIDI 処理を担当します
- `background.js`
  - YouTube ウィンドウの Deck 1 / Deck 2 割り当てを担当します
- `options.html`
  - 設定画面です
- `options.js`
  - 設定 JSON の読み書きを担当します
- `manifest.json`
  - 拡張機能の定義です

## ライセンス

MIT License  
詳細は [LICENSE](./LICENSE) を参照してください。
