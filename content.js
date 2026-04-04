const DEFAULT_MAP = {
  playPause: { type: "note", channel: 0, note: 11 },
  cue: { type: "note", channel: 0, note: 12 },
  tempo: { type: "cc14", channel: 0, cc: 0, minValue: 0, maxValue: 16383, minRate: 0.5, maxRate: 2.0 },
  jog: { type: "cc", channel: 0, cc: 34, mode: "relative", sensitivity: 0.5 },
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

// 速度適用
function applyPlaybackRate() {
  const video = getVideo();
  if (!video) return;

  let rate = STATE.tempoRate + STATE.jogOffset;

  rate = Math.max(0.1, Math.min(4.0, rate));
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

  if (mapping.jog && type === 0xb0 && channel === mapping.jog.channel && event.data[1] === mapping.jog.cc) {
    const raw = event.data[2];
    let delta = 0;
    if (mapping.jog.mode === "relative") {
      if (raw === 0) delta = 0;
      else if (raw < 65) delta = raw - 64;
      else delta = raw - 64;
    } else {
      delta = (raw - 64) / 64;
    }
    const sensitivity = mapping.jog.sensitivity ?? 0.5;
    const offset = delta * sensitivity;
    console.log("Jog detected", raw, delta, offset);
    if (offset !== 0) jog(offset);
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
    mapping = data.midiMapping ? { ...DEFAULT_MAP, ...data.midiMapping } : DEFAULT_MAP;
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
    mapping = changes.midiMapping.newValue ? { ...DEFAULT_MAP, ...changes.midiMapping.newValue } : DEFAULT_MAP;
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
