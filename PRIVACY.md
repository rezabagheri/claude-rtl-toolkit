# Privacy Policy — Claude RTL Toolkit

_Last updated: 2026-06-21_

**Claude RTL Toolkit does not collect, transmit, sell, or share any personal data. Full stop.**

## What the extension stores

The extension saves only your own preferences, locally, using the browser's
extension storage (`chrome.storage`):

- **Settings** (fonts, sizes, line-height, line-numbers, UI language, on/off state) — stored on your device.
- **Per-message direction choices** (which messages you flipped to RTL/LTR) — stored via `chrome.storage.sync`, which Google may sync across browsers signed in to *your own* account. This data never reaches the developer.

That's it. No accounts, no tracking, no analytics, no advertising identifiers.

## What it does NOT do

- ❌ No data is sent to the developer or any third-party server.
- ❌ No analytics, telemetry, or usage tracking.
- ❌ No reading or storing of your conversation content. The extension only changes how text is *displayed* (direction and fonts) in your browser.
- ❌ No external network requests — fonts are bundled inside the extension.

## Permissions

- **`storage`** — to save your settings and direction choices (described above).
- **`activeTab`** — so the popup can apply your choices to the Claude tab you're currently viewing.
- **Host access to `https://claude.ai/*`** — the extension runs only on Claude, to render its messages and input the way you configure.

## Contact

Questions or issues? Open an issue at
<https://github.com/rezabagheri/claude-rtl-toolkit/issues>.
