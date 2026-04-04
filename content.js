const DEFAULT_MAP = {
  playPause: { type: "note", channel: 0, note: 11 },
  cue: { type: "note", channel: 0, note: 12 },
  tempo: { type: "cc14", channel: 0, cc: 0, minValue: 0, maxValue: 16383, minRate: 0.5, maxRate: 2.0 },
  jog: {
    type: "cc",
    channel: 0,
    ccs: [33, 35],
    scratchCcs: [34],
    mode: "relative",
    relativeFormat: "binaryOffset",
    invert: false,
    sensitivity: 0.10,
    negativeSensitivityMultiplier: 1.0,
    maxOffset: 1.5,
    resetDelayMs: 160
  },
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

const STATE = {
  cueTime: null,
  hotcues: Array(8).fill(null),
  jogAccumulator: 0,
  jogLastTime: null,
  tempoValue: 8192,  // 14-bit center

  tempoRate: 1.0,     // フェーダー基準
  jogOffset: 0,       // ピッチベンド
  jogResetTimer: null // ジョグオフセットリセット用タイマー
};

let mapping = DEFAULT_MAP;
let midiOut = null;

function normalizeMapping(raw) {
  if (!raw || typeof raw !== "object") return DEFAULT_MAP;

  const mergedJog = {
    ...DEFAULT_MAP.jog,
    ...(raw.jog || {})
  };

  if (
    mergedJog.relativeFormat === "signedBit" &&
    (mergedJog.cc === 34 || mergedJog.ccs?.includes(33) || mergedJog.ccs?.includes(35))
  ) {
    mergedJog.relativeFormat = DEFAULT_MAP.jog.relativeFormat;
    mergedJog.invert = DEFAULT_MAP.jog.invert;
    mergedJog.sensitivity = DEFAULT_MAP.jog.sensitivity;
    mergedJog.negativeSensitivityMultiplier = DEFAULT_MAP.jog.negativeSensitivityMultiplier;
    mergedJog.ccs = DEFAULT_MAP.jog.ccs;
    mergedJog.scratchCcs = DEFAULT_MAP.jog.scratchCcs;
  }

  return {
    ...DEFAULT_MAP,
    ...raw,
    tempo: {
      ...DEFAULT_MAP.tempo,
      ...(raw.tempo || {})
    },
    jog: {
      ...mergedJog
    },
    hotcue: Array.isArray(raw.hotcue) ? raw.hotcue : DEFAULT_MAP.hotcue
  };
}

// 速度適用
function applyPlaybackRate() {
  const video = getVideo();
  if (!video) return;
  const minPlaybackRate = mapping.tempo?.minPlaybackRate ?? 0.25;
  const maxPlaybackRate = mapping.tempo?.maxPlaybackRate ?? 4.0;

  let rate = STATE.tempoRate + STATE.jogOffset;

  rate = Math.max(minPlaybackRate, Math.min(maxPlaybackRate, rate));
  video.playbackRate = rate;

  console.log("Final Rate:", rate);
}

function getVideo() {
  return document.querySelector("video");
}

function setPlayPause() {
  const video = getVideo();
  if (!video) return;
  if (video.paused) {
    video.play().catch(() => { });
  } else {
    video.pause();
  }
}

function setCue() {
  const video = getVideo();
  if (!video) return;
  const playing = !video.paused;
  if (playing) {
    if (STATE.cueTime !== null) {
      video.currentTime = STATE.cueTime;
      console.log("Cue recalled", STATE.cueTime);
    } else {
      STATE.cueTime = video.currentTime;
      console.log("Cue saved", STATE.cueTime);
    }
  } else {
    // 停止中: 常に設定
    STATE.cueTime = video.currentTime;
    console.log("Cue saved", STATE.cueTime);
  }
}

function clearHotcueLights() {
  console.log("Clearing hotcue lights");
  if (!midiOut || !Array.isArray(mapping.hotcue)) return;
  const channels = new Set();
  mapping.hotcue.forEach((target) => {
    if (!target) return;
    const { channel, note } = target;
    channels.add(channel);
    // note off (velocity 0) for hotcue button
    midiOut.send([0x90 | channel, note, 0]);
    // and explicit note-off status
    midiOut.send([0x80 | channel, note, 0]);
  });
  // All Notes Off to ensure all lights are cleared for mapped channels
  channels.forEach((ch) => {
    midiOut.send([0xb0 | ch, 0x7b, 0x00]);
  });
}


function setHotcue(index) {
  const video = getVideo();
  if (!video || index == null) return;
  if (STATE.hotcues[index] == null) {
    STATE.hotcues[index] = video.currentTime;
    console.log(`Hotcue ${index} saved`, STATE.hotcues[index]);
    // ライトオン
    if (midiOut && mapping.hotcue[index]) {
      const { channel, note } = mapping.hotcue[index];
      midiOut.send([0x90 | channel, note, 127]);
    }
  } else {
    video.currentTime = STATE.hotcues[index];
    console.log(`Hotcue ${index} recalled`, STATE.hotcues[index]);
  }
}

function setTempo(rate) {
  STATE.tempoRate = rate;
  applyPlaybackRate();
}

function jog(offset) {
  const sensitivity = mapping.jog.sensitivity ?? 0.5;

  // 一時的なピッチ変化
  STATE.jogOffset = offset * sensitivity;

  applyPlaybackRate();

  // 入力止まったら戻す
  if (STATE.jogResetTimer) {
    clearTimeout(STATE.jogResetTimer);
  }

  STATE.jogResetTimer = setTimeout(() => {
    STATE.jogOffset = 0;
    applyPlaybackRate();
  }, 80);
}

function decodeRelativeValue(raw, format = "signedBit") {
  if (raw == null) return 0;
  if (raw === 0 || raw === 64) return 0;

  switch (format) {
    case "binaryOffset":
      return raw - 64;
    case "twosComplement":
      return raw < 64 ? raw : raw - 128;
    case "auto": {
      const signedBit = raw < 64 ? raw : -(raw - 64);
      const twosComplement = raw < 64 ? raw : raw - 128;
      const binaryOffset = raw - 64;
      const candidates = [signedBit, twosComplement, binaryOffset].filter((value) => value !== 0);
      return candidates.reduce((best, value) => (
        Math.abs(value) < Math.abs(best) ? value : best
      ));
    }
    case "signedBit":
    default:
      return raw < 64 ? raw : -(raw - 64);
  }
}

function jog(delta) {
  const sensitivity = mapping.jog.sensitivity ?? 0.03;
  const negativeSensitivityMultiplier = mapping.jog.negativeSensitivityMultiplier ?? 1.0;
  const maxOffset = mapping.jog.maxOffset ?? 1.5;
  const resetDelayMs = mapping.jog.resetDelayMs ?? 160;
  const scaledDelta = delta < 0 ? delta * negativeSensitivityMultiplier : delta;

  STATE.jogOffset = Math.max(-maxOffset, Math.min(maxOffset, scaledDelta * sensitivity));

  applyPlaybackRate();

  if (STATE.jogResetTimer) {
    clearTimeout(STATE.jogResetTimer);
  }

  STATE.jogResetTimer = setTimeout(() => {
    STATE.jogOffset = 0;
    applyPlaybackRate();
  }, resetDelayMs);
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

function handleMidiEvent(event) {
  console.log("MIDI event received:", Array.from(event.data));
  console.log("mapping", mapping);
  console.log("mapping.jog", mapping.jog);

  if (mapping.playPause && midiMatch(event, mapping.playPause)) {
    setPlayPause();
    return;
  }

  if (mapping.cue && midiMatch(event, mapping.cue)) {
    setCue();
    return;
  }

  if (Array.isArray(mapping.hotcue)) {
    for (let idx = 0; idx < mapping.hotcue.length; idx++) {
      if (midiMatch(event, mapping.hotcue[idx])) {
        setHotcue(idx);
        return;
      }
    }
  }

  const status = event.data[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;

  if (mapping.tempo && midiMatch(event, mapping.tempo)) {
    const cc = event.data[1];
    const value = event.data[2];
    if (cc === mapping.tempo.cc) {
      // MSB
      STATE.tempoValue = (STATE.tempoValue & 0x7f) | (value << 7);
    } else if (cc === mapping.tempo.cc + 32) {
      // LSB
      STATE.tempoValue = (STATE.tempoValue & 0x3f80) | value;
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
    setTempo(rate);
    return;
  }

  const jogCcs = Array.isArray(mapping.jog?.ccs)
    ? mapping.jog.ccs
    : (mapping.jog?.cc != null ? [mapping.jog.cc] : []);
  const scratchCcs = Array.isArray(mapping.jog?.scratchCcs) ? mapping.jog.scratchCcs : [];
  const allJogCcs = new Set([...jogCcs, ...scratchCcs]);

  if (mapping.jog && type === 0xb0 && channel === mapping.jog.channel && allJogCcs.has(event.data[1])) {
    const cc = event.data[1];
    const raw = event.data[2];
    const relativeFormat = mapping.jog.relativeFormat ?? "signedBit";
    const delta = mapping.jog.mode === "relative"
      ? decodeRelativeValue(raw, relativeFormat)
      : (raw - 64) / 64;
    const direction = mapping.jog.invert ? -1 : 1;
    const effectiveDelta = (scratchCcs.includes(cc) ? delta * 0.5 : delta) * direction;

    console.log("Jog detected", { cc, raw, delta, effectiveDelta, relativeFormat });

    if (effectiveDelta !== 0) jog(effectiveDelta);
    return;
  }
}

async function setupMidi() {
  if (typeof navigator.requestMIDIAccess !== "function") {
    console.warn("Web MIDI API is not available in this context. Chrome may not support MIDI in service workers.");
    return;
  }

  try {
    const access = await navigator.requestMIDIAccess();

    function attachInput(input) {
      if (!input) return;
      input.onmidimessage = handleMidiEvent;
    }

    access.inputs.forEach(attachInput);

    access.onstatechange = (ev) => {
      if (ev.port.type === "input" && ev.port.state === "connected") {
        ev.port.onmidimessage = handleMidiEvent;
      }
    };

    // MIDI OUT
    access.outputs.forEach(out => midiOut = out);

    // 読み込み時に HOTCUE ライトを一括消灯
    clearHotcueLights();

    console.log("MIDI initialized", Array.from(access.inputs.values()).map((p) => p.name), "OUT:", midiOut ? midiOut.name : "none");
  } catch (err) {
    console.error("MIDI access error", err);
  }
}

function loadMapping() {
  chrome.storage.sync.get(["midiMapping"], (data) => {
    mapping = normalizeMapping(data.midiMapping);
    // 既存HOTCUEのライトオン
    if (midiOut) {
      STATE.hotcues.forEach((time, idx) => {
        if (time !== null && mapping.hotcue[idx]) {
          const { channel, note } = mapping.hotcue[idx];
          midiOut.send([0x90 | channel, note, 127]);
        }
      });
    }
  });
}

loadMapping();
setupMidi();

window.addEventListener("beforeunload", () => {
  clearHotcueLights();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    clearHotcueLights();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.midiMapping) {
    mapping = normalizeMapping(changes.midiMapping.newValue);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.cmd) return;

  switch (message.cmd) {
    case "playPause":
      setPlayPause();
      break;
    case "cue":
      setCue();
      break;
    case "hotcue":
      setHotcue(message.index);
      break;
    case "tempo":
      setTempo(message.rate);
      break;
    case "jog":
      jog(message.offset);
      break;
  }
});
