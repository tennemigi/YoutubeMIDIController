const YOUTUBE_URL_PATTERN = "https://www.youtube.com/*";
const DEBUG = false;
const DEFAULT_CONTROLLER_SETTINGS = {
  extensionEnabled: true,
  windowDeckOverrides: {}
};

let recomputeTimer = null;
let lastDeckAssignments = new Map();

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

async function loadControllerSettings() {
  const data = await chrome.storage.local.get(["controllerSettings"]);
  return {
    ...DEFAULT_CONTROLLER_SETTINGS,
    ...(data.controllerSettings || {}),
    windowDeckOverrides: {
      ...DEFAULT_CONTROLLER_SETTINGS.windowDeckOverrides,
      ...((data.controllerSettings && data.controllerSettings.windowDeckOverrides) || {})
    }
  };
}

async function saveControllerSettings(settings) {
  await chrome.storage.local.set({ controllerSettings: settings });
}

function sendMessageToTab(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message, () => {
    if (chrome.runtime.lastError) {
      // ignore tabs that are not ready yet
    }
  });
}

async function getYoutubeTabs() {
  const tabs = await chrome.tabs.query({ url: YOUTUBE_URL_PATTERN });
  return tabs.filter((tab) => tab.id != null && tab.windowId != null);
}

function pickWindowTabs(tabs) {
  const bestTabPerWindow = new Map();

  for (const tab of tabs) {
    const existing = bestTabPerWindow.get(tab.windowId);
    if (!existing || tab.active) {
      bestTabPerWindow.set(tab.windowId, tab);
    }
  }

  return [...bestTabPerWindow.values()].sort((left, right) => left.windowId - right.windowId);
}

function computeDeckAssignments(windowTabs, settings) {
  if (!settings.extensionEnabled) {
    return new Map();
  }

  const assignments = new Map();
  const usedDecks = new Set();

  for (const tab of windowTabs) {
    const override = settings.windowDeckOverrides[String(tab.windowId)];
    if ((override === 1 || override === 2) && !usedDecks.has(override)) {
      assignments.set(tab.id, override);
      usedDecks.add(override);
    }
  }

  const availableDecks = [1, 2].filter((deck) => !usedDecks.has(deck));

  for (const tab of windowTabs) {
    if (assignments.has(tab.id)) continue;
    const override = settings.windowDeckOverrides[String(tab.windowId)];
    if (override && override !== "auto") continue;

    const nextDeck = availableDecks.shift();
    if (nextDeck == null) break;
    assignments.set(tab.id, nextDeck);
  }

  return assignments;
}

async function recomputeDeckAssignments() {
  const [tabs, settings] = await Promise.all([
    getYoutubeTabs(),
    loadControllerSettings()
  ]);
  const windowTabs = pickWindowTabs(tabs);
  const nextAssignments = computeDeckAssignments(windowTabs, settings);

  debugLog("Deck assignments recomputed", [...nextAssignments.entries()], settings);

  for (const tab of tabs) {
    const nextDeck = nextAssignments.get(tab.id) ?? null;
    const previousDeck = lastDeckAssignments.get(tab.id) ?? null;
    const override = settings.windowDeckOverrides[String(tab.windowId)] || "auto";

    if (nextDeck !== previousDeck || !lastDeckAssignments.has(tab.id)) {
      sendMessageToTab(tab.id, {
        cmd: "assignDeck",
        deck: nextDeck,
        enabled: settings.extensionEnabled,
        override
      });
    }
  }

  for (const [tabId] of lastDeckAssignments) {
    if (!nextAssignments.has(tabId)) {
      sendMessageToTab(tabId, {
        cmd: "assignDeck",
        deck: null,
        enabled: settings.extensionEnabled,
        override: "auto"
      });
    }
  }

  lastDeckAssignments = nextAssignments;
  return { assignments: nextAssignments, settings };
}

function scheduleRecompute() {
  if (recomputeTimer) {
    clearTimeout(recomputeTimer);
  }

  recomputeTimer = setTimeout(() => {
    recomputeTimer = null;
    recomputeDeckAssignments().catch((error) => {
      console.error("Failed to recompute deck assignments", error);
    });
  }, 100);
}

async function cleanupWindowOverride(windowId) {
  const settings = await loadControllerSettings();
  if (!(String(windowId) in settings.windowDeckOverrides)) return;

  delete settings.windowDeckOverrides[String(windowId)];
  await saveControllerSettings(settings);
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleRecompute();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleRecompute();
});

chrome.tabs.onActivated.addListener(() => {
  scheduleRecompute();
});

chrome.tabs.onUpdated.addListener(() => {
  scheduleRecompute();
});

chrome.tabs.onRemoved.addListener(() => {
  scheduleRecompute();
});

chrome.windows.onRemoved.addListener((windowId) => {
  cleanupWindowOverride(windowId)
    .catch((error) => console.error("Failed to clean up deck override", error))
    .finally(() => {
      scheduleRecompute();
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.cmd) return;

  if (message.cmd === "registerYoutubeWindow") {
    recomputeDeckAssignments()
      .then(({ assignments, settings }) => {
        const tabId = sender.tab?.id;
        const windowId = sender.tab?.windowId;
        sendResponse({
          deck: tabId != null ? assignments.get(tabId) ?? null : null,
          enabled: settings.extensionEnabled,
          override: windowId != null ? settings.windowDeckOverrides[String(windowId)] || "auto" : "auto"
        });
      })
      .catch((error) => {
        console.error("Failed to register YouTube window", error);
        sendResponse({ deck: null, enabled: true, override: "auto" });
      });

    return true;
  }

  if (message.cmd === "getControllerState") {
    loadControllerSettings()
      .then((settings) => {
        const windowId = sender.tab?.windowId;
        sendResponse({
          enabled: settings.extensionEnabled,
          override: windowId != null ? settings.windowDeckOverrides[String(windowId)] || "auto" : "auto"
        });
      })
      .catch((error) => {
        console.error("Failed to load controller state", error);
        sendResponse({ enabled: true, override: "auto" });
      });

    return true;
  }

  if (message.cmd === "updateControllerState") {
    loadControllerSettings()
      .then(async (settings) => {
        if (typeof message.enabled === "boolean") {
          settings.extensionEnabled = message.enabled;
        }

        const windowId = sender.tab?.windowId;
        if (windowId != null && typeof message.override === "string") {
          if (message.override === "auto") {
            delete settings.windowDeckOverrides[String(windowId)];
          } else if (message.override === "1" || message.override === "2") {
            settings.windowDeckOverrides[String(windowId)] = Number(message.override);
          }
        }

        await saveControllerSettings(settings);
        return recomputeDeckAssignments();
      })
      .then(({ assignments, settings }) => {
        const tabId = sender.tab?.id;
        const windowId = sender.tab?.windowId;
        sendResponse({
          deck: tabId != null ? assignments.get(tabId) ?? null : null,
          enabled: settings.extensionEnabled,
          override: windowId != null ? settings.windowDeckOverrides[String(windowId)] || "auto" : "auto"
        });
      })
      .catch((error) => {
        console.error("Failed to update controller state", error);
        sendResponse({ deck: null, enabled: true, override: "auto" });
      });

    return true;
  }
});
