# YouTube MIDI Controller

DDJ-FLX4 を使って YouTube を操作する Chrome 拡張です。  
現在は 2 デッキ対応で、YouTube を 2 つのウィンドウで開くと、Deck 1 / Deck 2 をそれぞれ別ウィンドウに割り当てて操作できます。

## できること

- `PLAY/PAUSE` で YouTube の再生・一時停止
- `CUE` でキューポイントの保存 / 呼び出し
- `HOT CUE 1-8` でホットキューの保存 / 呼び出し
- `TEMPO` フェーダーで YouTube の再生速度変更
- `JOG 外周` で一時的な加速 / 減速
- `JOG 天面` でシーク
- 2 つの YouTube ウィンドウを Deck 1 / Deck 2 に自動割り当て
- 画面上に現在のデッキ番号を表示
- YouTube のページ遷移時に CUE / HOTCUE / テンポ補正状態をリセット
- HOT CUE の状態を FLX4 側のランプへ反映

## 動作の考え方

- Deck 1 は 1 つ目の YouTube ウィンドウを操作します
- Deck 2 は 2 つ目の YouTube ウィンドウを操作します
- 各ウィンドウには `Deck 1` または `Deck 2` のバッジが表示されます
- 3 つ以上 YouTube ウィンドウを開いた場合、先頭 2 ウィンドウだけが割り当て対象です

## 使い方

1. Chrome の拡張機能管理画面 `chrome://extensions/` を開きます
2. `デベロッパー モード` を有効にします
3. `パッケージ化されていない拡張機能を読み込む` からこのフォルダを選びます
4. YouTube を 1 つまたは 2 つのウィンドウで開きます
5. 各ウィンドウを再読み込みします
6. DDJ-FLX4 を接続し、MIDI 利用の許可が求められたら許可します

## デフォルト操作

- `Play/Pause`
  - 再生と一時停止を切り替えます
- `Cue`
  - 再生中に押すと保存済み CUE へ戻ります
  - CUE が未保存なら現在位置を保存します
  - 停止中に押すと現在位置を保存します
- `Hot Cue 1-8`
  - 未保存なら現在位置を保存します
  - 保存済みならその位置へジャンプします
- `Tempo フェーダー`
  - 再生速度を変更します
  - デフォルト範囲は `0.5x - 2.0x` です
- `JOG 外周`
  - 一時的に加速 / 減速します
- `JOG 天面`
  - 前後にシークします

## 2 デッキ運用

- YouTube ウィンドウを 2 つ開くと、自動で Deck 1 と Deck 2 が割り当てられます
- Deck 2 は Deck 1 と別チャンネルとして扱われます
- どのウィンドウがどのデッキかは、画面左上付近のバッジで確認できます
- ウィンドウの開き直しやアクティブ切り替えで再割り当てされることがあります

## 設定変更

拡張機能のオプション画面で `midiMapping` JSON を編集できます。

主な設定項目:

- `tempo.minRate`
  - 最小再生速度
- `tempo.maxRate`
  - 最大再生速度
- `tempo.minPlaybackRate`
  - 実際に動画へ適用する最低速度
- `tempo.maxPlaybackRate`
  - 実際に動画へ適用する最高速度
- `jog.sensitivity`
  - JOG 外周の効き
- `jog.scratchSeekSeconds`
  - JOG 天面 1 ステップあたりのシーク量
- `jog.resetDelayMs`
  - 外周操作後に速度補正を戻すまでの時間
- `jog.negativeSensitivityMultiplier`
  - 減速側だけ強さを変えたいときの倍率

## 現在のデフォルトマッピング

- `Play/Pause`
  - `note`, channel `0`, note `11`
- `Cue`
  - `note`, channel `0`, note `12`
- `Tempo`
  - `cc14`, channel `0`, cc `0`
- `JOG 外周`
  - `cc`, channel `0`, `33` と `35`
- `JOG 天面`
  - `cc`, channel `0`, `34`
- `Hot Cue 1-8`
  - `note`, channel `7`, note `0-7`

Deck 2 は内部で Deck 1 からチャンネルをずらして処理しています。

## 注意点

- 対応サイトは `https://www.youtube.com/*` のみです
- YouTube は SPA なので、動画ページ遷移時に状態を明示的にリセットしています
- CUE / HOTCUE は YouTube の動画ごとに永続保存していません
- 2 デッキで使うときは、必ず YouTube を別ウィンドウで開いてください
- JOG 天面のシーク量は現在かなり小さめです。必要に応じて `jog.scratchSeekSeconds` を調整してください

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

## 今後の改善候補

- 動画ごとの CUE / HOTCUE 永続保存
- Deck 割り当てルールの固定化
- シークバー表示の改善
- UI からの設定変更
