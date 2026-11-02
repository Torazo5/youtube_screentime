// Run with: node test.mjs
import assert from 'node:assert';
import { canOverride, currentWindow, youTubeStatus } from './limits.js';

const store = {};
const fake = { state: 'active', focused: true, url: 'https://www.youtube.com/watch?v=1' };
let tick;
let sessionRules = [];
const reloaded = [];
globalThis.chrome = {
  alarms: { create() {}, onAlarm: { addListener: (fn) => (tick = fn) } },
  runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
  idle: { queryState: async () => fake.state },
  windows: { getLastFocused: async () => ({ id: 1, focused: fake.focused }) },
  tabs: {
    query: async () => [{ id: 7, url: fake.url, audible: fake.audible }],
    reload: async (id) => reloaded.push(id),
  },
  declarativeNetRequest: {
    getSessionRules: async () => sessionRules,
    updateSessionRules: async ({ addRules }) => (sessionRules = addRules),
  },
  storage: {
    local: {
      get: async (keys) => Object.fromEntries([keys].flat().filter((k) => k in store).map((k) => [k, store[k]])),
      set: async (obj) => Object.assign(store, obj),
    },
  },
};
await import('./background.js');
const today = () => store[new Date().toLocaleDateString('en-CA')];

await tick();
assert.deepEqual(today(), { total: 30, sites: { 'www.youtube.com': 30 } });
assert.equal((await youTubeStatus()).used, 30);

// Another app in front: laptop time counts, no site does.
fake.focused = false;
await tick();
assert.deepEqual(today(), { total: 60, sites: { 'www.youtube.com': 30 } });

// Idle and locked count for nothing.
fake.state = 'idle';
await tick();
fake.state = 'locked';
await tick();
assert.equal(today().total, 60);

// Idle with the focused tab playing sound counts, even when locked doesn't.
fake.focused = true;
fake.audible = true;
fake.state = 'idle';
await tick();
assert.equal(today().sites['www.youtube.com'], 60);
fake.state = 'locked';
await tick();
assert.equal(today().sites['www.youtube.com'], 60);

// Idle with sound in a background window doesn't count.
fake.focused = false;
fake.state = 'idle';
await tick();
assert.equal(today().total, 90);
fake.audible = false;

// A tab with no URL doesn't throw.
fake.state = 'active';
fake.focused = true;
const youtubeUrl = fake.url;
fake.url = undefined;
await tick();
assert.equal(today().sites.other, 30);
fake.url = youtubeUrl;

// Windows: 8am to 10pm is 20 minutes, 10pm to 8am is 30, and a night spans midnight.
const at = (day, h, m = 0) => new Date(2026, 10, day, h, m); // Nov 2026, the 1st is a Sunday
assert.deepEqual(currentWindow(at(2, 8)), { id: '2026-11-02-day', limit: 1200, endsAt: '10pm' });
assert.equal(currentWindow(at(2, 21, 59)).id, '2026-11-02-day');
assert.deepEqual(currentWindow(at(2, 22)), { id: '2026-11-02-night', limit: 1800, endsAt: '8am' });
assert.equal(currentWindow(at(3, 0, 30)).id, '2026-11-02-night');
assert.equal(currentWindow(at(3, 7, 59)).id, '2026-11-02-night');
assert.equal(currentWindow(at(1, 3)).id, '2026-10-31-night'); // across a month boundary

// Override days: Sun 1st, Mon 2nd, Tue 3rd, Wed 4th, Thu 5th, Fri 6th, Sat 7th.
assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((d) => canOverride(at(d, 12))), [true, false, false, false, true, true, true]);

// Using the last of the allowance blocks YouTube and reloads its open tabs.
const win = currentWindow();
store.ytUsed = { window: win.id, secs: win.limit - 30 };
await tick();
assert.equal(sessionRules.length, 1);
assert.deepEqual(sessionRules[0].condition.requestDomains, ['youtube.com']);
assert.deepEqual(reloaded, [7]);
assert.equal((await youTubeStatus()).blocked, true);

// While blocked, time isn't added and tabs aren't reloaded again.
await tick();
assert.equal(store.ytUsed.secs, win.limit);
assert.deepEqual(reloaded, [7]);

// Override lifts it for this window only.
store.ytOverride = win.id;
await tick();
assert.equal(sessionRules.length, 0);
assert.deepEqual(reloaded, [7, 7]);

// A new window starts with a clean allowance and no override.
store.ytUsed = { window: 'older', secs: 99999 };
store.ytOverride = 'older';
const fresh = await youTubeStatus();
assert.deepEqual([fresh.used, fresh.overridden, fresh.blocked], [0, false, false]);

console.log('ok');
