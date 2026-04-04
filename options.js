const DEFAULT_MAP = {
  playPause: { type: "note", channel: 0, note: 11 },
  cue: { type: "note", channel: 0, note: 12 },
  tempo: { type: "cc14", channel: 0, cc: 0, minValue: 0, maxValue: 16383, minRate: 0.5, maxRate: 2.0 },
  jog: { type: "cc", channel: 0, cc: 34, mode: "relative", sensitivity: 0.0333 },
  hotcue: [
    { type: "note", channel: 7, note: 0 },
    { type: "note", channel: 7, note: 1 },
    { type: "note", channel: 7, note: 2 },
    { type: "note", channel: 7, note: 3 },
    { type: "note", channel: 7, note: 4 },
    { type: "note", channel: 7, note: 5 },
    { type: "note", channel: 7, note: 6 },
    { type: "note", channel: 7, note: 7 }
  ]
};

const textarea = document.getElementById("mapJson");
const saveBtn = document.getElementById("saveBtn");
const restoreBtn = document.getElementById("restoreBtn");
const hint = document.getElementById("hint");

function showMessage(text, isError = false) {
  hint.textContent = text;
  hint.className = isError ? "error" : "message";
}

function loadMapping() {
  chrome.storage.sync.get(["midiMapping"], (result) => {
    const mapping = result.midiMapping || DEFAULT_MAP;
    textarea.value = JSON.stringify(mapping, null, 2);
    showMessage("設定を読み込みました。保存後、拡張機能を再読み込みしてください。");
  });
}

saveBtn.addEventListener("click", () => {
  try {
    const parsed = JSON.parse(textarea.value);
    chrome.storage.sync.set({ midiMapping: parsed }, () => {
      showMessage("保存しました。YouTubeタブをリロードしてください。");
    });
  } catch (err) {
    showMessage("JSON構文エラー: " + err.message, true);
  }
});

restoreBtn.addEventListener("click", () => {
  textarea.value = JSON.stringify(DEFAULT_MAP, null, 2);
  chrome.storage.sync.remove(["midiMapping"], () => {
    showMessage("デフォルトに戻しました。保存不要です。拡張を再読み込みしてください。");
  });
});

loadMapping();
