const YOUTUBE_URL_PATTERN = "https://www.youtube.com/*";

let recomputeTimer = null;
let lastDeckAssignments = new Map();

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

function pickDeckTabs(tabs) {
  const bestTabPerWindow = new Map();

  for (const tab of tabs) {
    const existing = bestTabPerWindow.get(tab.windowId);
    if (!existing || tab.active) {
      bestTabPerWindow.set(tab.windowId, tab);
    }
  }

  return [...bestTabPerWindow.values()]
    .sort((left, right) => left.windowId - right.windowId)
    .slice(0, 2);
}

async function recomputeDeckAssignments() {
  const tabs = await getYoutubeTabs();
  const deckTabs = pickDeckTabs(tabs);
  const nextAssignments = new Map(deckTabs.map((tab, index) => [tab.id, index + 1]));

  for (const tab of tabs) {
    const nextDeck = nextAssignments.get(tab.id) ?? null;
    const previousDeck = lastDeckAssignments.get(tab.id) ?? null;
    if (nextDeck !== previousDeck) {
      sendMessageToTab(tab.id, { cmd: "assignDeck", deck: nextDeck });
    }
  }

  for (const [tabId] of lastDeckAssignments) {
    if (!nextAssignments.has(tabId)) {
      sendMessageToTab(tabId, { cmd: "assignDeck", deck: null });
    }
  }

  lastDeckAssignments = nextAssignments;
  return nextAssignments;
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

chrome.windows.onRemoved.addListener(() => {
  scheduleRecompute();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.cmd !== "registerYoutubeWindow") return;

  recomputeDeckAssignments()
    .then((assignments) => {
      const tabId = sender.tab?.id;
      sendResponse({ deck: tabId != null ? assignments.get(tabId) ?? null : null });
    })
    .catch((error) => {
      console.error("Failed to register YouTube window", error);
      sendResponse({ deck: null });
    });

  return true;
});
