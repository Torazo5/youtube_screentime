# Screen Time Tracker

A Brave/Chrome extension that tracks your laptop screen time and time per website, limits YouTube, and blocks sites you choose. All data stays in your browser.

## Install

1. Go to `brave://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Pin the extension and click its icon to see your stats.

After changing the code, click the extension's reload icon. Restarting the browser isn't enough.

## Features

- **Screen time:** active time today, split into Brave and other apps, plus a 7-day history.
- **Sites:** time on each website today.
- **YouTube limit:** 20 minutes from 8am to 10pm and 30 minutes from 10pm to 8am. Once used up, YouTube is blocked until the next period. An override is available Thu–Sun.
- **Blocked sites:** block or unblock any site from the popup.

## Limitations

- Time is sampled every 30 seconds, and only while the browser is running.
- Other apps count as one total, not per app.
- You count as away after 5 minutes without input, unless the tab in front is playing sound.
- Only the tab in front counts toward a site, so background audio doesn't use up the YouTube limit.

To change the limits, edit the constants at the top of `limits.js`.

## Test

```bash
node test.mjs
```
