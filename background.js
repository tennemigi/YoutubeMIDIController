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

let mapping = null;

const STATE = {
  tempoValue: 8192  // 14-bit center
};

function normalizeMapping(raw) {
  if (!raw || typeof raw !== "object") return DEFAULT_MAP;
  const out = { ...DEFAULT_MAP, ...raw };
  if (!Array.isArray(out.hotcue)) out.hotcue = DEFAULT_MAP.hotcue;
  return out;
}

async function loadMapping() {
  const data = await chrome.storage.sync.get(["midiMapping"]);
  mapping = normalizeMapping(data.midiMapping);
}

function midiMatch(event, target) {
  if (!target || !event) return false;
  const status = event.data[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (target.channel != null && channel !== target.channel) return false;

  if (target.type === "note") {
    return type === 0x90 && event.data[1] === target.note && event.data[2] > 0;
  }
  if (target.type === "cc") {
    return type === 0xb0 && event.data[1] === target.cc;
  }
  if (target.type === "cc14") {
    return type === 0xb0 && (event.data[1] === target.cc || event.data[1] === target.cc + 32);
  }
  return false;
}

function sendToYoutubeTabs(message) {
  chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message, () => {
        if (chrome.runtime.lastError) {
          // ignore errors when tab isn't ready or content script not loaded
        }
      });
    }
  });
}

function handleMidiEvent(event) {
  if (!mapping) return;
  const status = event.data[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;

  if (mapping.playPause && midiMatch(event, mapping.playPause)) {
    sendToYoutubeTabs({ cmd: "playPause" });
    return;
  }

  if (mapping.cue && midiMatch(event, mapping.cue)) {
    sendToYoutubeTabs({ cmd: "cue" });
    return;
  }

  if (Array.isArray(mapping.hotcue)) {
    for (let idx = 0; idx < mapping.hotcue.length; idx++) {
      if (midiMatch(event, mapping.hotcue[idx])) {
        sendToYoutubeTabs({ cmd: "hotcue", index: idx });
        return;
      }
    }
  }

  if (mapping.tempo && midiMatch(event, mapping.tempo)) {
    const cc = event.data[1];
    const value = event.data[2];
    if (cc === mapping.tempo.cc) {
      // LSB
      STATE.tempoValue = (STATE.tempoValue & 0x3f80) | value;
    } else if (cc === mapping.tempo.cc + 32) {
      // MSB
      STATE.tempoValue = (STATE.tempoValue & 0x7f) | (value << 7);
    }
    const centerValue = 8192;
    const centerRate = 1.0;
    const minValue = mapping.tempo.minValue ?? 0;
    const maxValue = mapping.tempo.maxValue ?? 16383;
    const minRate = mapping.tempo.minRate ?? 0.5;
    const maxRate = mapping.tempo.maxRate ?? 2.0;
    const clamped = Math.max(minValue, Math.min(maxValue, STATE.tempoValue));
    let rate;
    if (clamped >= centerValue) {
      rate = centerRate + (clamped - centerValue) / (maxValue - centerValue) * (maxRate - centerRate);
    } else {
      rate = centerRate + (clamped - centerValue) / (centerValue - minValue) * (centerRate - minRate);
    }
    sendToYoutubeTabs({ cmd: "tempo", rate });
    return;
  }

  if (mapping.jog && type === 0xb0 && channel === mapping.jog.channel && event.data[1] === mapping.jog.cc) {
    const raw = event.data[2];
    let delta = 0;
    if (mapping.jog.mode === "relative") {
      if (raw === 0) delta = 0;
      else if (raw < 65) delta = raw - 64;
      else delta = raw - 64;
    } else {
      // absolute: map 0-127 to -1.0..+1.0 around center
      delta = (raw - 64) / 64;
    }
    const sensitivity = mapping.jog.sensitivity ?? 0.5;
    const offset = delta * sensitivity;
    if (offset !== 0) sendToYoutubeTabs({ cmd: "jog", offset });
    return;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  loadMapping();
});

chrome.runtime.onStartup.addListener(() => {
  loadMapping();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.midiMapping) {
    mapping = normalizeMapping(changes.midiMapping.newValue);
  }
});
