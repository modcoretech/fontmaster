'use strict';

try {
  importScripts('constants.js');
} catch (e) {
  console.warn('[Fontmaster Background] Could not import constants.js:', e);
}

const DEFAULT_SETTINGS_LOCAL = typeof DEFAULT_SETTINGS !== 'undefined' ? DEFAULT_SETTINGS : {
  fastRendering: false,
  protectMonospace: true,
  fontSource: 'google',
  theme: 'auto'
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      fontmasterSettings: DEFAULT_SETTINGS_LOCAL,
      appliedFonts: {}
    });
  } else if (details.reason === 'update') {
    const data = await chrome.storage.sync.get(['fontmasterSettings']);
    const settings = { ...DEFAULT_SETTINGS_LOCAL, ...data.fontmasterSettings };
    delete settings.reducedMotion;
    delete settings.fontSmoothing;
    await chrome.storage.sync.set({ fontmasterSettings: settings });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'getCurrentTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => respond(tabs[0] || null));
    return true;
  }
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    updateBadge(tabId, tab.url).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) await updateBadge(tabId, tab.url);
  } catch (_) {}
});

async function updateBadge(tabId, url) {
  try {
    const { appliedFonts } = await chrome.storage.sync.get('appliedFonts');
    const domain = normalizeDomain(url);
    if (!domain) return;
    const active = appliedFonts?.[domain] || appliedFonts?.[domain.replace(/^www\./, '')] || null;
    if (active) {
      await chrome.action.setBadgeText({ text: 'Aa', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#A8C7FA', tabId });
      await chrome.action.setBadgeTextColor({ color: '#062e6f', tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (_) {}
}

function normalizeDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}