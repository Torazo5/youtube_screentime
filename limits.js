const DAY_LIMIT_SECS = 20 * 60; // 8am to 10pm
const NIGHT_LIMIT_SECS = 30 * 60; // 10pm to 8am
const OVERRIDE_DAYS = [4, 5, 6, 0]; // Thu, Fri, Sat, Sun
const RULE_ID = 1;

export const isYouTube = (host) => /(^|\.)youtube\.com$/.test(host);

export const canOverride = (now = new Date()) => OVERRIDE_DAYS.includes(now.getDay());

export function currentWindow(now = new Date()) {
  const hour = now.getHours();
  const night = hour >= 22 || hour < 8;
  // After midnight is still the night that started the evening before.
  const start = new Date(now);
  if (hour < 8) start.setDate(start.getDate() - 1);
  return {
    id: `${start.toLocaleDateString('en-CA')}-${night ? 'night' : 'day'}`,
    limit: night ? NIGHT_LIMIT_SECS : DAY_LIMIT_SECS,
    endsAt: night ? '8am' : '10pm',
  };
}

export async function youTubeStatus(now = new Date()) {
  const win = currentWindow(now);
  const { ytUsed, ytOverride } = await chrome.storage.local.get(['ytUsed', 'ytOverride']);
  const used = ytUsed?.window === win.id ? ytUsed.secs : 0;
  const overridden = ytOverride === win.id;
  return { ...win, used, overridden, blocked: used >= win.limit && !overridden };
}

export async function addYouTubeTime(secs) {
  const status = await youTubeStatus();
  if (!status.blocked) {
    await chrome.storage.local.set({ ytUsed: { window: status.id, secs: status.used + secs } });
  }
}

// Session rules stay out of the popup's manual block list, so this one has no Unblock button.
// The browser clears them on restart, and the background script adds them back on startup.
export async function syncYouTubeBlock() {
  const { blocked } = await youTubeStatus();
  const wasBlocked = (await chrome.declarativeNetRequest.getSessionRules()).length > 0;
  if (blocked === wasBlocked) return;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_ID],
    addRules: blocked
      ? [{
          id: RULE_ID,
          action: { type: 'block' },
          condition: { requestDomains: ['youtube.com'], resourceTypes: ['main_frame'] },
        }]
      : [],
  });
  // Moves open tabs onto the block page, or back to the video when it lifts.
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  await Promise.all(tabs.map((tab) => chrome.tabs.reload(tab.id)));
}
