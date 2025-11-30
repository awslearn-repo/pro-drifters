# Pro Drifters 3D

This repo contains a self-contained Chrome extension that embeds the Pro Drifters 3D experience in the browser action popup.

## Load the extension in Chrome

1. Clone or download this repository so that you have the files locally.
2. Open Chrome and visit `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the root of this repo (the folder containing `manifest.json`).

Chrome should now load the extension without the “Manifest file is missing or unreadable” error because the manifest lives at the top level of the directory that you select.

## Packaging

If you want to distribute the extension, create an archive (.zip) from the repo root so the manifest remains in the top-level of the package before uploading it to the Chrome Web Store dashboard.
