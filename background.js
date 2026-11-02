import { addYouTubeTime, isYouTube, syncYouTubeBlock } from './limits.js';

const TICK_SECS = 30;
// No keyboard/mouse input for this long counts as away. Lower it if time away is
// overcounted; raise it if long videos get cut off.
const IDLE_AFTER_SECS = 300;

// ponytail: samples every 30s, so totals and limits are accurate to about one tick per session.
const start = () => {
  chrome.alarms.create('tick', { periodInMinutes: TICK_SECS / 60 });
  syncYouTubeBlock();
};
chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);

async function focusedTab() {
  const win = await chrome.windows.getLastFocused();
  if (!win.focused) return null; // another app is in front
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab || {};
}

async function recordTick() {
  // The idle state is system-wide, so this also counts time spent in other apps.
  const state = await chrome.idle.queryState(IDLE_AFTER_SECS);
  if (state === 'locked') return;
  const tab = await focusedTab();
  // Watching a video means no input, so a tab playing sound still counts as active.
  if (state === 'idle' && !tab?.audible) return;

  const day = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
  const { [day]: stats = { total: 0, sites: {} } } = await chrome.storage.local.get(day);
  stats.total += TICK_SECS;
  if (tab) {
    const host = (tab.url && new URL(tab.url).hostname) || 'other';
    stats.sites[host] = (stats.sites[host] || 0) + TICK_SECS;
    if (isYouTube(host)) await addYouTubeTime(TICK_SECS);
  }
  await chrome.storage.local.set({ [day]: stats });
}

chrome.alarms.onAlarm.addListener(async () => {
  await recordTick();
  await syncYouTubeBlock(); // also runs while idle, so the limit resets on time
});
