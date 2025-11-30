# Pulse Mini Arcade

Pulse Mini Arcade is a Chrome extension that packs a collection of quick, lightweight mini-games directly into the browser action popup. The first release ships with **Skyline Sprint**, a one-button endless runner built for instant play.

## Current mini-game: Skyline Sprint
- Auto-runner with a single tap/press jump mechanic
- Smooth difficulty curve where speed gradually increases as you survive
- Responsive canvas rendering tuned for popups (high-DPI aware)
- Real-time scoring plus a stored personal best so you can chase improvements

## Designed for more games
The popup features a card-based selector so new mini-games can be added without changing the layout. To add one:
1. Register it in `popup.js` inside the `games` array.
2. Provide a playable implementation (or mark it as coming soon) and wire its start logic to the menu.

## Load the extension in Chrome
1. Clone or download this repository so the files are available locally.
2. Open Chrome and visit `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the root of this repo (the folder containing `manifest.json`).

Chrome will load the extension immediately. Use the toolbar icon to open the popup and start running.

## Packaging for distribution
Create a `.zip` file from the repo root and upload it to the Chrome Web Store dashboard. Keep `manifest.json` in the top-level of the archive so Chrome can read it.
