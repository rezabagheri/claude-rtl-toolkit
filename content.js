// Claude RTL Toolkit - content.js

const STATES_KEY = 'claude-rtl-states';

// UI language for the toggle-button tooltip (kept in sync with the options page).
let uiDict = I18N.en;
function detectUiLang() {
  const nav = (navigator.language || 'en').slice(0, 2);
  return UI_LANGS.some((l) => l.code === nav) ? nav : 'en';
}
function setUiLang(lang) {
  uiDict = I18N[lang] || I18N.en;
  // Refresh tooltips on any buttons already on the page.
  document.querySelectorAll('.rtl-btn').forEach((btn) => {
    btn.title = `${uiDict.switchTo} ${btn.dataset.rtl === 'true' ? 'LTR' : 'RTL'}`;
  });
}

// Inject Vazirmatn @font-face. Page CSP blocks external font URLs, but extension
// resources (chrome-extension://) are exempt — hence we bundle the woff2 files and
// resolve their absolute URL with chrome.runtime.getURL (a relative url() in injected
// CSS would resolve against the page, not the extension).
function injectFont() {
  const url = (file) => chrome.runtime.getURL(`fonts/${file}.woff2`);
  const face = (family, weight, file, range) => `
    @font-face {
      font-family: '${family}';
      font-weight: ${weight};
      font-display: swap;
      src: url('${url(file)}') format('woff2');${range ? `\n      unicode-range: ${range};` : ''}
    }`;
  // Rubik ships separate Hebrew/Latin subsets — declare both so a Hebrew user also
  // gets consistent Latin glyphs (the browser picks the file per character range).
  const HEBREW = 'U+0590-05FF, U+FB1D-FB4F';
  const LATIN = 'U+0000-024F, U+2000-206F';
  const style = document.createElement('style');
  style.textContent =
    face('Vazirmatn', 400, 'Vazirmatn-Regular') +
    face('Vazirmatn', 700, 'Vazirmatn-Bold') +
    face('Estedad', 400, 'Estedad-Regular') +
    face('Estedad', 700, 'Estedad-Bold') +
    face('Rubik', 400, 'Rubik-Regular', HEBREW) +
    face('Rubik', 700, 'Rubik-Bold', HEBREW) +
    face('Rubik', 400, 'Rubik-Latin-Regular', LATIN) +
    face('Rubik', 700, 'Rubik-Latin-Bold', LATIN) +
    face('JetBrains Mono', 400, 'JetBrainsMono-Regular') +
    face('JetBrains Mono', 700, 'JetBrainsMono-Bold');
  document.head.appendChild(style);
}
injectFont();

// ── Per-role font settings (from chrome.storage, configured in the options page) ──
// We translate the settings object into one <style> element. Changing settings just
// rewrites this element's text — no per-node JS mutation needed. Messages are tagged
// with data-rtl-role="user|claude" so CSS can target each independently.
const TEXT_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, summary, dd, dt';
const BODY_BLOCKS = 'p, li, blockquote, td, th, dd'; // size applies here (not headings)
const CODE_BLOCKS = 'pre, code, kbd, samp';

function buildSettingsCss(s) {
  // Target [data-rtl-role] directly (it sits on the message element). Using a
  // descendant .message-content-wrapper would miss user messages, where the role
  // element and the content wrapper are the same node.
  const textRule = (role, cfg) => `
    /* Baseline family on the message itself, so even non-standard text containers
       inherit it. The toggle chip declares its own font-family, so it is unaffected. */
    [data-rtl-role="${role}"] {
      font-family: ${cfg.fontFamily} !important;
    }
    [data-rtl-role="${role}"] :is(${TEXT_BLOCKS}) {
      font-family: ${cfg.fontFamily} !important;
    }
    [data-rtl-role="${role}"] :is(${BODY_BLOCKS}) {
      font-size: ${cfg.fontSize}px !important;
      line-height: ${cfg.lineHeight} !important;
    }`;
  return `
    ${textRule('user', s.user)}
    ${textRule('claude', s.claude)}
    /* Composer (message input) font — the contenteditable editor and its paragraphs. */
    div[contenteditable="true"],
    div[contenteditable="true"] p {
      font-family: ${s.composer.fontFamily} !important;
      font-size: ${s.composer.fontSize}px !important;
      line-height: ${s.composer.lineHeight} !important;
    }
    /* Code is independent of role: applies in any message, and wins over text rules.
       Ligatures (calt/liga) turn -> ≠ => into single glyphs in fonts like JetBrains Mono. */
    [data-rtl-role] :is(${CODE_BLOCKS}),
    [data-rtl-role] :is(pre, code) * {
      font-family: ${s.code.fontFamily} !important;
      font-size: ${s.code.fontSize}px !important;
      font-variant-ligatures: contextual common-ligatures !important;
      font-feature-settings: 'calt' 1, 'liga' 1 !important;
    }`;
}

let settingsStyleEl = null;
let currentSettings = DEFAULT_SETTINGS;
let enabled = true; // master on/off (popup); gates all of the extension's effects
function applySettings(settings) {
  currentSettings = settings;
  if (!enabled) return; // disabled → no font/line-number styling
  if (!settingsStyleEl) {
    settingsStyleEl = document.createElement('style');
    settingsStyleEl.id = 'rtl-settings-style';
    document.head.appendChild(settingsStyleEl);
  }
  settingsStyleEl.textContent = buildSettingsCss(settings);
  applyLineNumbers(settings.code.lineNumbers);
}

// ── Optional code line numbers ──
// Lines aren't separate elements (one <code> with \n), so CSS counters can't help.
// We render a gutter <span> of numbers as the pre's first child. Self-healing: it
// re-checks on every pass and updates when the line count changes (e.g. after stream).
function applyLineNumbers(enabled) {
  if (!enabled) {
    document.querySelectorAll('.rtl-lineno-gutter').forEach((g) => g.remove());
    document.querySelectorAll('pre.rtl-has-lineno').forEach((p) => p.classList.remove('rtl-has-lineno'));
    return;
  }
  document.querySelectorAll('[data-rtl-role] pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;

    const count = code.textContent.replace(/\n$/, '').split('\n').length;
    let gutter = pre.querySelector(':scope > .rtl-lineno-gutter');
    if (gutter && Number(gutter.dataset.count) === count) return; // already correct

    if (!gutter) {
      gutter = document.createElement('span');
      gutter.className = 'rtl-lineno-gutter';
      gutter.setAttribute('aria-hidden', 'true');
      pre.classList.add('rtl-has-lineno');
      pre.insertBefore(gutter, pre.firstChild);
    }
    gutter.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
    gutter.dataset.count = count;
  });
}

// ── Master on/off ──
// Static CSS (composer/code) is gated by the html.rtl-ext-enabled class; the dynamic
// bits (chips, line numbers, inline direction) are removed by teardown().
function teardown() {
  if (settingsStyleEl) settingsStyleEl.textContent = '';
  applyLineNumbers(false);
  document.querySelectorAll('.rtl-header-bar').forEach((el) => el.remove());
  document.querySelectorAll('[data-rtl-processed]').forEach((msg) => {
    const wrapper = msg.querySelector('.message-content-wrapper') || msg;
    applyDirection(wrapper, false); // reset inline direction
    delete msg.dataset.rtlProcessed;
    delete msg.dataset.rtlRole;
    delete msg.dataset.messageId;
  });
}

function setEnabled(on) {
  enabled = on;
  document.documentElement.classList.toggle('rtl-ext-enabled', on);
  if (on) {
    applySettings(currentSettings);
    processAllMessages();
    applyStoredDirections();
  } else {
    teardown();
  }
}

// Quick action from the popup: set direction for every message on the page.
function setAllDirections(isRTL) {
  document.querySelectorAll('[data-message-id]').forEach((m) => setDirection(m.dataset.messageId, isRTL));
}

// Popup ↔ content messaging.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getStatus') {
    // Count via the layered detector — a 0 here signals the page DOM changed and
    // our selectors need updating (the popup shows this as a warning).
    sendResponse({ enabled, count: findMessages().length });
  } else if (msg.type === 'setAll' && enabled) {
    setAllDirections(msg.rtl);
  }
  return true;
});

// Initial settings load + live updates when the options page saves.
chrome.storage.local.get(SETTINGS_KEY, (data) => applySettings(mergeSettings(data[SETTINGS_KEY])));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS_KEY]) {
    applySettings(mergeSettings(changes[SETTINGS_KEY].newValue));
  }
  if (area === 'local' && changes[ENABLED_KEY]) {
    setEnabled(changes[ENABLED_KEY].newValue !== false);
  }
  // UI language changed in the options page → re-localize button tooltips.
  if (area === 'local' && changes[UI_LANG_KEY]) {
    setUiLang(changes[UI_LANG_KEY].newValue || detectUiLang());
  }
  // Direction choices synced from another tab/device — refresh cache and replay.
  if (area === 'sync' && changes[STATES_KEY]) {
    directionStates = changes[STATES_KEY].newValue || {};
    applyStoredDirections();
  }
});

// Centralized selectors — Claude changes its DOM markup often, so keeping every
// brittle selector in one place means there is a single spot to update when it breaks.
const SELECTORS = {
  // Assistant turns. NOTE: do not list nested content classes (e.g.
  // .font-claude-response) here — they sit INSIDE the message and would be processed
  // as a second "message", producing duplicate buttons. The content-anchored fallback
  // in findMessages() handles recovery if these break.
  assistant: [
    '[data-is-streaming]',
    '[data-testid="assistant-message"]',
  ],
  user: [
    '[data-testid="user-message"]',
    '[class*="user-message"]',
  ],
  // The rendered markdown lives in .standard-markdown; .font-claude-response is its
  // outer ancestor used as a fallback.
  content: '.standard-markdown, .font-claude-response, [class*="standard-markdown"]',
  // Precise content classes used by the fallback detector (avoid loose [class*=...]
  // which would also match Tailwind arbitrary-value class strings).
  contentAnchor: '.standard-markdown, .progressive-markdown',
  textBlocks: 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote',
};

// ── Layered, self-healing message detection ──
// 1) primary selectors; 2) if those find nothing, anchor on markdown content and
// climb to a container. Returns [{ el, role }], de-duplicated.
function findMessages() {
  const seen = new Set();
  const out = [];
  const add = (el, role) => {
    if (el && !seen.has(el)) { seen.add(el); out.push({ el, role }); }
  };

  document.querySelectorAll(SELECTORS.assistant.join(', ')).forEach((el) => add(el, 'claude'));
  document.querySelectorAll(SELECTORS.user.join(', ')).forEach((el) => add(el, 'user'));

  if (out.length === 0) {
    // Recovery: every markdown block belongs to an assistant turn; climb to a
    // reasonable container so the chip/role attach to a stable wrapper.
    document.querySelectorAll(SELECTORS.contentAnchor).forEach((md) => {
      const container =
        md.closest('[class*="message"], article, [class*="response"], [class*="turn"]') ||
        md.parentElement;
      add(container, 'claude');
    });
  }
  return out;
}

// ── Direction persistence (chrome.storage.sync — survives reloads, syncs devices) ──
// In-memory cache so processMessage can read synchronously. We persist ONLY genuine
// overrides (where the user disagreed with auto-detect), keeping well under sync's
// 8KB-per-item quota; auto-detect reproduces everything else deterministically.
let directionStates = {};        // messageId -> bool (overrides only)
const autoDetected = {};         // messageId -> bool (what auto-detect yields)

function loadDirectionStates(cb) {
  chrome.storage.sync.get(STATES_KEY, (data) => {
    directionStates = data[STATES_KEY] || {};
    cb && cb();
  });
}

let saveTimer;
function saveState(messageId, isRTL) {
  if (autoDetected[messageId] === isRTL) {
    delete directionStates[messageId]; // matches auto-detect → no need to store
  } else {
    directionStates[messageId] = isRTL;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set({ [STATES_KEY]: directionStates }, () => {
      if (chrome.runtime.lastError) {
        // Quota/transient error — the choice is still applied in-memory this session.
        console.warn('[RTL Toolkit] could not persist direction:', chrome.runtime.lastError.message);
      }
    });
  }, 400);
}

// ── RTL detection — covers all major RTL scripts, not just Persian ──
// Hebrew (+presentation), Arabic (+supplement/extended/presentation forms),
// Syriac, Thaana, NKo. Built from \u escapes for clarity over pasted glyphs.
const RTL_RANGES = new RegExp(
  '[' +
  '֐-׿' + // Hebrew
  '؀-ۿ' + // Arabic
  '܀-ݏ' + // Syriac
  'ݐ-ݿ' + // Arabic Supplement
  'ހ-޿' + // Thaana
  '߀-߿' + // NKo
  'ࡠ-ࣿ' + // Syriac Supplement + Arabic Extended-A/B
  'יִ-ﭏ' + // Hebrew presentation forms
  'ﭐ-﷿' + // Arabic presentation forms-A
  'ﹰ-﻿' + // Arabic presentation forms-B
  ']'
);
function hasRTLText(text) {
  return RTL_RANGES.test(text);
}

// ──────────────────────────────────────────────────────────────────────────────
// TODO(you): implement getStableMessageId(msgEl, contentText)
//
// We need a string ID that identifies a message so its RTL/LTR choice survives a
// page refresh. The OLD code fell back to Math.random(), which produced a NEW id
// on every load — so saved states never matched after reload.
//
// Trade-offs to weigh:
//   • Claude's own attributes (data-index / data-testid) are stable but not always
//     present, and data-index can shift when messages are inserted above.
//   • A hash of the message TEXT is stable across reloads and order changes, but two
//     identical messages would collide (share one toggle state).
//
// Return a string. Prefer Claude's stable attribute when available, otherwise derive
// something deterministic from contentText (NOT random).
function getStableMessageId(msgEl, contentText) {
  // 1) Prefer Claude's own stable attribute when present.
  if (msgEl.dataset.index) return `idx-${msgEl.dataset.index}`;
  if (msgEl.dataset.testid) return `tid-${msgEl.dataset.testid}`;

  // 2) Otherwise derive a deterministic id from the message text (djb2 hash),
  //    so the saved RTL/LTR choice survives a page refresh.
  let hash = 5381;
  for (let i = 0; i < contentText.length; i++) {
    hash = (hash * 33) ^ contentText.charCodeAt(i);
  }
  return `txt-${(hash >>> 0).toString(36)}`;
}
// ──────────────────────────────────────────────────────────────────────────────

// ── Direction application ──
function applyDirection(container, isRTL) {
  container.querySelectorAll(SELECTORS.textBlocks).forEach(el => {
    // Never touch code blocks
    if (el.closest('pre') || el.closest('code') || el.tagName === 'CODE') return;

    el.style.direction = isRTL ? 'rtl' : '';
    el.style.textAlign = isRTL ? 'right' : '';
  });

  container.style.direction = isRTL ? 'rtl' : '';

  // Blockquotes use a physical left border/padding which doesn't follow `direction`.
  // In RTL, move the accent bar to the reading-start (right) side so it matches the text.
  container.querySelectorAll('blockquote').forEach(bq => {
    if (isRTL) {
      const cs = getComputedStyle(bq);
      if (cs.borderLeftWidth !== '0px') { // not yet flipped
        bq.style.borderRight = `${cs.borderLeftWidth} ${cs.borderLeftStyle} ${cs.borderLeftColor}`;
        bq.style.borderLeftWidth = '0px';
        bq.style.paddingRight = cs.paddingLeft;
        bq.style.paddingLeft = '0px';
      }
    } else {
      bq.style.borderRight = '';
      bq.style.borderLeftWidth = '';
      bq.style.paddingRight = '';
      bq.style.paddingLeft = '';
    }
  });

  // Always keep code blocks LTR. Math (KaTeX) is also forced LTR via styles.css —
  // math notation reads left-to-right even inside RTL text.
  container.querySelectorAll('pre, code, .code-block').forEach(el => {
    el.style.direction = 'ltr';
    el.style.textAlign = 'left';
    el.style.unicodeBidi = 'plaintext';
  });
}

// Render direction onto a message + sync all its buttons. Does NOT persist — used
// both by user actions and when replaying stored/synced choices.
function renderDirection(messageId, isRTL) {
  // The wrapper may be a descendant of the message, OR the message box itself
  // (user messages), so match self-or-descendant rather than descendant-only.
  const msg = document.querySelector(`[data-message-id="${messageId}"]`);
  const wrapper = msg && (msg.querySelector('.message-content-wrapper') || msg);
  if (wrapper) applyDirection(wrapper, isRTL);

  document.querySelectorAll(`.rtl-btn[data-message-id="${messageId}"]`).forEach(btn => {
    renderButton(btn, isRTL);
  });
}

// User action (button click): render + persist. Single source of truth, so toggling
// either button keeps the other in sync.
function setDirection(messageId, isRTL) {
  renderDirection(messageId, isRTL);
  saveState(messageId, isRTL);
}

// Replay every stored override onto the page (after load, or when another tab/device
// changes a choice).
function applyStoredDirections() {
  Object.keys(directionStates).forEach((id) => renderDirection(id, directionStates[id]));
}

// ── Toggle button (single labelled chip, lives in a header bar above the message) ──
function renderButton(btn, isRTL) {
  btn.dataset.rtl = isRTL ? 'true' : 'false';
  btn.classList.toggle('active', isRTL);
  btn.innerHTML = isRTL
    ? `<span class="rtl-icon">⇐</span><span class="rtl-label">LTR</span>`
    : `<span class="rtl-icon">⇒</span><span class="rtl-label">RTL</span>`;
  btn.title = `${uiDict.switchTo} ${isRTL ? 'LTR' : 'RTL'}`;
}

function createButton(messageId, isRTL) {
  const btn = document.createElement('button');
  btn.className = 'rtl-toggle-btn rtl-btn';
  btn.dataset.messageId = messageId;
  renderButton(btn, isRTL);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setDirection(messageId, btn.dataset.rtl !== 'true');
  });

  return btn;
}

// ── Process a single message element ──
// role is supplied by findMessages (so detection, not DOM-matching, decides it).
function processMessage(msgEl, role) {
  if (msgEl.dataset.rtlProcessed) return;

  // Prefer the tight markdown container; querySelector returns tree-order, so a
  // combined selector would yield the outer ancestor — query the precise one first.
  // User messages have no .standard-markdown, so fall back to the message box itself.
  const contentWrapper =
    msgEl.querySelector('.standard-markdown') ||
    msgEl.querySelector(SELECTORS.content) ||
    msgEl;

  msgEl.dataset.rtlProcessed = 'true';
  // Tag the role so the settings CSS can style user vs Claude text independently.
  msgEl.dataset.rtlRole = role || (msgEl.matches(SELECTORS.user.join(', ')) ? 'user' : 'claude');
  contentWrapper.classList.add('message-content-wrapper');

  const textContent = contentWrapper.innerText || '';
  const messageId = getStableMessageId(msgEl, textContent);
  msgEl.dataset.messageId = messageId;

  // Saved override wins; otherwise auto-detect. Remember auto-detect so saveState can
  // drop redundant entries (choice == auto-detect) and keep storage minimal.
  const autoRTL = hasRTLText(textContent);
  autoDetected[messageId] = autoRTL;
  const isRTL = messageId in directionStates ? directionStates[messageId] : autoRTL;

  if (isRTL) applyDirection(contentWrapper, true);

  // Single toggle chip in a header bar above the message content. Placing it in the
  // normal flow (not absolute) means it never overlaps the text, regardless of
  // message length — which was the problem with the old top-right corner button.
  const headerBar = document.createElement('div');
  headerBar.className = 'rtl-header-bar';
  headerBar.appendChild(createButton(messageId, isRTL));
  msgEl.insertBefore(headerBar, msgEl.firstChild);
}

// ── Find and process all messages ──
function processAllMessages() {
  if (!enabled) return;
  findMessages().forEach(({ el, role }) => processMessage(el, role));
  // Re-apply line numbers for any code blocks that just rendered/streamed in.
  applyLineNumbers(currentSettings.code.lineNumbers);
}

// ── Health check: warn (with retries) if a chat page yields zero messages, which
// means Claude's DOM changed and the selectors need updating. ──
function looksLikeChatPage() {
  return !!document.querySelector('[contenteditable="true"], main');
}
function scheduleHealthCheck(attempt = 0) {
  setTimeout(() => {
    if (!enabled || findMessages().length > 0 || !looksLikeChatPage()) return; // healthy / N/A
    if (attempt < 4) {
      processAllMessages();
      scheduleHealthCheck(attempt + 1);
    } else {
      console.warn(
        '[RTL Toolkit] 0 messages detected on what looks like a chat page — ' +
        "Claude's DOM may have changed and the selectors need updating."
      );
    }
  }, 2000);
}

// ── Watch for streamed-in messages ──
const observer = new MutationObserver((mutations) => {
  if (!mutations.some(m => m.addedNodes.length > 0)) return;
  clearTimeout(window._rtlTimer);
  window._rtlTimer = setTimeout(processAllMessages, 600);
});

observer.observe(document.body, { childList: true, subtree: true });

// Keyboard shortcut: Alt+Shift+R toggles the direction of the last message.
// e.code (physical key) is layout-independent, unlike e.key.
document.addEventListener('keydown', (e) => {
  if (!enabled || !e.altKey || !e.shiftKey || e.code !== 'KeyR') return;
  const msgs = document.querySelectorAll('[data-message-id]');
  const last = msgs[msgs.length - 1];
  if (!last) return;
  e.preventDefault();
  const btn = last.querySelector('.rtl-btn');
  const currentlyRTL = btn ? btn.dataset.rtl === 'true' : false;
  setDirection(last.dataset.messageId, !currentlyRTL);
});

// Initial run — load the enabled flag + saved directions first, then process.
// applyStoredDirections also fixes any messages the observer processed before load.
chrome.storage.local.get([ENABLED_KEY, UI_LANG_KEY], (data) => {
  enabled = data[ENABLED_KEY] !== false; // default ON
  uiDict = I18N[data[UI_LANG_KEY] || detectUiLang()] || I18N.en;
  document.documentElement.classList.toggle('rtl-ext-enabled', enabled);
  if (!enabled) {
    teardown(); // undo anything the settings-load may have applied before this ran
    return;
  }
  loadDirectionStates(() => {
    processAllMessages();
    applyStoredDirections();
    setTimeout(() => {
      processAllMessages();
      applyStoredDirections();
    }, 1000);
    scheduleHealthCheck();
  });
});
