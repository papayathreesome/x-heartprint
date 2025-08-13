x-heartprint (v0.2.8)

install:
1) clone the folder somewhere on your PC.
2) in chrome: open chrome://extensions
3) enable developer mode (top right)
4) click "load unpacked" and select the unzipped x-heartprint folder
5) click the toolbar icon to open the popup (export/clear). extension runs automatically when enabled.

behavior:
- listens for like (heart) clicks on x.com only
- 300ms after the click (post-animation), captures the visible tab as PNG
- saves to Downloads/x-heartprint/ with unique filenames
- stores entries in chrome.storage.local: { tweet_id, timestamp_iso, filename, download_id, source }
- popup lets you export log JSON and clear the log

notes:
- only captures when the x.com tab is active + window is focused (chrome limitation)
- mv3, offline only, no telemetry

file list:
- manifest.json
- background.js
- content.js
- injected.js
- popup.html, popup.js