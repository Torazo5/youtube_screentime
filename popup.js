import { canOverride, isYouTube, syncYouTubeBlock, youTubeStatus } from './limits.js';

const data = await chrome.storage.local.get(null);

const fmt = (secs) => {
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

function renderRows(parent, rows) {
  const max = Math.max(...rows.map(([, secs]) => secs), 1);
  for (const [label, secs] of rows) {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = label;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = fmt(secs);
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = `${(secs / max) * 100}%`;
    row.append(name, time, bar);
    parent.append(row);
  }
}

const today = data[new Date().toLocaleDateString('en-CA')] || { total: 0, sites: {} };
const siteName = (host) => {
  if (host === 'mail.google.com') return 'Gmail';
  if (isYouTube(host)) return 'YouTube';
  // Schools host Canvas on instructure.com or a canvas.* subdomain.
  if (/^canvas\.|\.instructure\.com$/.test(host)) return 'Canvas';
  return host.replace(/^www\./, '');
};
const bySite = new Map();
for (const [host, secs] of Object.entries(today.sites)) {
  bySite.set(siteName(host), (bySite.get(siteName(host)) || 0) + secs);
}
const sites = [...bySite].sort((a, b) => b[1] - a[1]);
const inBrave = sites.reduce((sum, [, secs]) => sum + secs, 0);

document.getElementById('total').textContent = fmt(today.total);
document.getElementById('summary').textContent =
  `active today · ${fmt(inBrave)} in Brave · ${fmt(today.total - inBrave)} in other apps`;

if (sites.length) renderRows(document.getElementById('sites'), sites);
else document.getElementById('sites').textContent = 'Nothing yet.';

const week = [];
for (let i = 0; i < 7; i++) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const label = i ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today';
  week.push([label, data[d.toLocaleDateString('en-CA')]?.total || 0]);
}
renderRows(document.getElementById('week'), week);

async function renderYouTube() {
  const status = await youTubeStatus();
  const usage = `${fmt(status.used)} of ${fmt(status.limit)} used this period`;
  const statusEl = document.getElementById('yt-status');
  if (status.overridden) statusEl.textContent = `${usage}. Limit overridden until ${status.endsAt}.`;
  else if (status.blocked) statusEl.textContent = `Limit reached. Blocked until ${status.endsAt}.${canOverride() ? '' : ' Override is only available Thu–Sun.'}`;
  else statusEl.textContent = `${usage}. Resets at ${status.endsAt}.`;

  const button = document.getElementById('yt-override');
  button.hidden = !(status.blocked && canOverride());
  button.textContent = `Override until ${status.endsAt}`;
  button.onclick = async () => {
    await chrome.storage.local.set({ ytOverride: status.id });
    await syncYouTubeBlock();
    renderYouTube();
  };
}
renderYouTube();

// The browser stores blocking rules itself and keeps them across restarts.
const rulesApi = chrome.declarativeNetRequest;

function parseDomain(input) {
  const text = input.trim();
  try {
    const host = new URL(text.includes('://') ? text : `https://${text}`).hostname.replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

async function renderBlocked() {
  const rules = await rulesApi.getDynamicRules();
  document.getElementById('blocked').replaceChildren(...rules.map((rule) => {
    const domain = rule.condition.requestDomains[0];
    const row = document.createElement('div');
    row.className = 'blocked-row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = domain;
    const button = document.createElement('button');
    button.textContent = 'Unblock';
    button.setAttribute('aria-label', `Unblock ${domain}`);
    button.onclick = async () => {
      await rulesApi.updateDynamicRules({ removeRuleIds: [rule.id] });
      renderBlocked();
    };
    row.append(name, button);
    return row;
  }));
}

document.getElementById('block-form').onsubmit = async (event) => {
  event.preventDefault();
  const input = document.getElementById('block-input');
  const error = document.getElementById('block-error');
  const domain = parseDomain(input.value);
  error.textContent = domain ? '' : 'Enter a site like youtube.com';
  if (!domain) return;

  const rules = await rulesApi.getDynamicRules();
  if (!rules.some((rule) => rule.condition.requestDomains[0] === domain)) {
    await rulesApi.updateDynamicRules({
      addRules: [{
        id: Math.max(0, ...rules.map((rule) => rule.id)) + 1,
        action: { type: 'block' },
        // Covers subdomains too. Page loads only, so videos embedded on other sites still work.
        condition: { requestDomains: [domain], resourceTypes: ['main_frame'] },
      }],
    });
    // Blocking only applies to new page loads, so reload tabs already on the site.
    const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });
    await Promise.all(tabs.map((tab) => chrome.tabs.reload(tab.id)));
  }
  input.value = '';
  renderBlocked();
};

renderBlocked();
