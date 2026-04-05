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
    scratchSeekSeconds: 0.03,
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
  tempoValue: 8192,
  tempoRate: 1.0,
  jogOffset: 0,
  jogResetTimer: null
};

let mapping = DEFAULT_MAP;
let assignedDeck = null;
let midiAccess = null;
let midiOut = null;
let midiInitialized = false;
let currentPageKey = getPageKey();
let deckBadgeElement = null;

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
    jog: mergedJog,
    hotcue: Array.isArray(raw.hotcue) ? raw.hotcue : DEFAULT_MAP.hotcue
  };
}

function getVideo() {
  return document.querySelector("video");
}

function getPageKey() {
  const url = new URL(window.location.href);
  return [
    url.pathname,
    url.searchParams.get("v") || "",
    url.searchParams.get("list") || ""
  ].join("|");
}

function getDeckChannel(baseChannel, targetKind = "main") {
  if (baseChannel == null || assignedDeck == null) return baseChannel;
  if (assignedDeck === 1) return baseChannel;
  return baseChannel + (targetKind === "hotcue" ? 2 : 1);
}

function resolveDeckTarget(target, targetKind = "main") {
  if (!target) return null;
  return {
    ...target,
    channel: getDeckChannel(target.channel, targetKind)
  };
}

function getResolvedHotcue(index) {
  if (!Array.isArray(mapping.hotcue) || !mapping.hotcue[index]) return null;
  return resolveDeckTarget(mapping.hotcue[index], "hotcue");
}

function applyPlaybackRate() {
  const video = getVideo();
  if (!video) return;
  const minPlaybackRate = mapping.tempo?.minPlaybackRate ?? 0.25;
  const maxPlaybackRate = mapping.tempo?.maxPlaybackRate ?? 4.0;

  let rate = STATE.tempoRate + STATE.jogOffset;
  rate = Math.max(minPlaybackRate, Math.min(maxPlaybackRate, rate));
  video.playbackRate = rate;

  console.log(`Deck ${assignedDeck ?? "-"} Final Rate:`, rate);
}

function ensureDeckBadge() {
  if (deckBadgeElement?.isConnected) return deckBadgeElement;

  deckBadgeElement = document.createElement("div");
  deckBadgeElement.id = "yt-midi-deck-badge";
  deckBadgeElement.style.position = "fixed";
  deckBadgeElement.style.top = "15px";
  deckBadgeElement.style.left = "185px";
  deckBadgeElement.style.zIndex = "999999";
  deckBadgeElement.style.padding = "8px 12px";
  deckBadgeElement.style.borderRadius = "999px";
  deckBadgeElement.style.fontFamily = "\"Segoe UI\", sans-serif";
  deckBadgeElement.style.fontSize = "12px";
  deckBadgeElement.style.fontWeight = "700";
  deckBadgeElement.style.letterSpacing = "0.08em";
  deckBadgeElement.style.textTransform = "uppercase";
  deckBadgeElement.style.pointerEvents = "none";
  deckBadgeElement.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.25)";
  deckBadgeElement.style.backdropFilter = "blur(10px)";
  document.documentElement.appendChild(deckBadgeElement);

  return deckBadgeElement;
}

function updateDeckBadge() {
  const badge = ensureDeckBadge();

  if (assignedDeck === 1) {
    badge.textContent = "Deck 1";
    badge.style.color = "#f7f7f7";
    badge.style.background = "rgba(16, 97, 255, 0.82)";
  } else if (assignedDeck === 2) {
    badge.textContent = "Deck 2";
    badge.style.color = "#f7f7f7";
    badge.style.background = "rgba(230, 70, 70, 0.82)";
  } else {
    badge.textContent = "Unassigned";
    badge.style.color = "#111";
    badge.style.background = "rgba(255, 255, 255, 0.82)";
  }
}

function setPlayPause() {
  const video = getVideo();
  if (!video) return;
  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
}

function setCue() {
  const video = getVideo();
  if (!video) return;

  if (!video.paused && STATE.cueTime !== null) {
    video.currentTime = STATE.cueTime;
    console.log(`Deck ${assignedDeck} cue recalled`, STATE.cueTime);
    return;
  }

  STATE.cueTime = video.currentTime;
  console.log(`Deck ${assignedDeck} cue saved`, STATE.cueTime);
}

function clearHotcueLights() {
  if (!midiOut || !Array.isArray(mapping.hotcue) || assignedDeck == null) return;

  const hotcueTargets = mapping.hotcue
    .map((_, index) => getResolvedHotcue(index))
    .filter(Boolean);
  const channels = new Set();

  for (const target of hotcueTargets) {
    channels.add(target.channel);
    midiOut.send([0x90 | target.channel, target.note, 0]);
    midiOut.send([0x80 | target.channel, target.note, 0]);
  }

  channels.forEach((channel) => {
    midiOut.send([0xb0 | channel, 0x7b, 0x00]);
  });
}

function syncHotcueLights() {
  if (!midiOut || assignedDeck == null) return;

  STATE.hotcues.forEach((time, index) => {
    const target = getResolvedHotcue(index);
    if (!target) return;
    midiOut.send([0x90 | target.channel, target.note, time != null ? 127 : 0]);
  });
}

function setHotcue(index) {
  const video = getVideo();
  if (!video || index == null) return;

  if (STATE.hotcues[index] == null) {
    STATE.hotcues[index] = video.currentTime;
    console.log(`Deck ${assignedDeck} hotcue ${index} saved`, STATE.hotcues[index]);

    const target = getResolvedHotcue(index);
    if (midiOut && target) {
      midiOut.send([0x90 | target.channel, target.note, 127]);
    }
    return;
  }

  video.currentTime = STATE.hotcues[index];
  console.log(`Deck ${assignedDeck} hotcue ${index} recalled`, STATE.hotcues[index]);
}

function setTempo(rate) {
  STATE.tempoRate = rate;
  applyPlaybackRate();
}

function resetPlaybackState(reason = "manual") {
  STATE.cueTime = null;
  STATE.hotcues = Array(8).fill(null);
  STATE.tempoValue = 8192;
  STATE.tempoRate = 1.0;
  STATE.jogOffset = 0;

  if (STATE.jogResetTimer) {
    clearTimeout(STATE.jogResetTimer);
    STATE.jogResetTimer = null;
  }

  applyPlaybackRate();
  clearHotcueLights();
  syncHotcueLights();
  console.log(`Deck ${assignedDeck ?? "-"} state reset`, reason);
}

function decodeRelativeValue(raw, format = "binaryOffset") {
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
  const sensitivity = mapping.jog.sensitivity ?? 0.10;
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

function seekByJog(delta) {
  const video = getVideo();
  if (!video) return;

  const scratchSeekSeconds = mapping.jog.scratchSeekSeconds ?? 1.5;
  const duration = Number.isFinite(video.duration) ? video.duration : null;
  const maxTime = duration != null ? duration : Number.MAX_SAFE_INTEGER;
  const nextTime = Math.max(0, Math.min(maxTime, video.currentTime + delta * scratchSeekSeconds));

  if (STATE.jogResetTimer) {
    clearTimeout(STATE.jogResetTimer);
    STATE.jogResetTimer = null;
  }

  STATE.jogOffset = 0;
  applyPlaybackRate();
  video.currentTime = nextTime;
  console.log(`Deck ${assignedDeck} scratch seek`, { delta, nextTime });
}

function midiMatch(event, target) {
  if (!target || !event || assignedDeck == null) return false;

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
  if (assignedDeck == null) return;

  const playPauseTarget = resolveDeckTarget(mapping.playPause);
  if (playPauseTarget && midiMatch(event, playPauseTarget)) {
    setPlayPause();
    return;
  }

  const cueTarget = resolveDeckTarget(mapping.cue);
  if (cueTarget && midiMatch(event, cueTarget)) {
    setCue();
    return;
  }

  if (Array.isArray(mapping.hotcue)) {
    for (let index = 0; index < mapping.hotcue.length; index++) {
      if (midiMatch(event, getResolvedHotcue(index))) {
        setHotcue(index);
        return;
      }
    }
  }

  const status = event.data[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const tempoTarget = resolveDeckTarget(mapping.tempo);

  if (tempoTarget && midiMatch(event, tempoTarget)) {
    const cc = event.data[1];
    const value = event.data[2];

    if (cc === tempoTarget.cc) {
      STATE.tempoValue = (STATE.tempoValue & 0x7f) | (value << 7);
    } else if (cc === tempoTarget.cc + 32) {
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

  const jogTarget = resolveDeckTarget(mapping.jog);
  const jogCcs = Array.isArray(mapping.jog?.ccs)
    ? mapping.jog.ccs
    : (mapping.jog?.cc != null ? [mapping.jog.cc] : []);
  const scratchCcs = Array.isArray(mapping.jog?.scratchCcs) ? mapping.jog.scratchCcs : [];
  const allJogCcs = new Set([...jogCcs, ...scratchCcs]);

  if (jogTarget && type === 0xb0 && channel === jogTarget.channel && allJogCcs.has(event.data[1])) {
    const cc = event.data[1];
    const raw = event.data[2];
    const relativeFormat = mapping.jog.relativeFormat ?? "binaryOffset";
    const delta = mapping.jog.mode === "relative"
      ? decodeRelativeValue(raw, relativeFormat)
      : (raw - 64) / 64;
    const direction = mapping.jog.invert ? -1 : 1;
    const effectiveDelta = (scratchCcs.includes(cc) ? delta * 0.5 : delta) * direction;

    console.log(`Deck ${assignedDeck} jog`, { cc, raw, delta, effectiveDelta, relativeFormat });

    if (effectiveDelta !== 0) {
      if (scratchCcs.includes(cc)) {
        seekByJog(effectiveDelta);
      } else {
        jog(effectiveDelta);
      }
    }
  }
}

async function setupMidi() {
  if (midiInitialized || assignedDeck == null) return;

  if (typeof navigator.requestMIDIAccess !== "function") {
    console.warn("Web MIDI API is not available in this context.");
    return;
  }

  try {
    midiAccess = await navigator.requestMIDIAccess();

    function attachInput(input) {
      if (!input) return;
      input.onmidimessage = handleMidiEvent;
    }

    midiAccess.inputs.forEach(attachInput);
    midiAccess.onstatechange = (event) => {
      if (event.port.type === "input" && event.port.state === "connected") {
        event.port.onmidimessage = handleMidiEvent;
      }
    };

    midiAccess.outputs.forEach((output) => {
      midiOut = output;
    });

    midiInitialized = true;
    syncHotcueLights();
    console.log(`Deck ${assignedDeck} MIDI initialized`, Array.from(midiAccess.inputs.values()).map((port) => port.name));
  } catch (error) {
    console.error("MIDI access error", error);
  }
}

function loadMapping() {
  chrome.storage.sync.get(["midiMapping"], (data) => {
    mapping = normalizeMapping(data.midiMapping);
    updateDeckBadge();
    syncHotcueLights();
  });
}

function updateDeckAssignment(nextDeck) {
  if (assignedDeck === nextDeck) return;

  clearHotcueLights();
  assignedDeck = nextDeck;
  console.log("Assigned deck changed", assignedDeck);
  updateDeckBadge();
  resetPlaybackState("deck-assignment");

  if (assignedDeck != null) {
    setupMidi();
    syncHotcueLights();
  }
}

function registerYoutubeWindow() {
  chrome.runtime.sendMessage({ cmd: "registerYoutubeWindow" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Failed to register YouTube window", chrome.runtime.lastError.message);
      return;
    }

    updateDeckAssignment(response?.deck ?? null);
  });
}

loadMapping();
registerYoutubeWindow();
updateDeckBadge();

window.addEventListener("beforeunload", () => {
  clearHotcueLights();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    clearHotcueLights();
  } else {
    updateDeckBadge();
    registerYoutubeWindow();
  }
});

function handlePotentialNavigation(reason) {
  const nextPageKey = getPageKey();
  if (nextPageKey === currentPageKey) return;

  currentPageKey = nextPageKey;
  resetPlaybackState(reason);
  updateDeckBadge();
}

window.addEventListener("yt-navigate-finish", () => {
  handlePotentialNavigation("yt-navigate-finish");
});

window.addEventListener("popstate", () => {
  setTimeout(() => handlePotentialNavigation("popstate"), 0);
});

window.addEventListener("hashchange", () => {
  setTimeout(() => handlePotentialNavigation("hashchange"), 0);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.midiMapping) {
    mapping = normalizeMapping(changes.midiMapping.newValue);
    syncHotcueLights();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message.cmd) return;

  if (message.cmd === "assignDeck") {
    updateDeckAssignment(message.deck ?? null);
    return;
  }

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
