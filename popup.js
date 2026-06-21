// Claude RTL Toolkit - popup.js
// Depends on config.js: SETTINGS_KEY, ENABLED_KEY, UI_LANG_KEY, UI_LANGS, I18N,
// mergeSettings.

const $ = (id) => document.getElementById(id);
let dict = I18N.en;

// ── Localize the popup using the same UI language as the options page ──
function applyI18n(lang) {
  dict = I18N[lang] || I18N.en;
  const meta = UI_LANGS.find((l) => l.code === lang) || UI_LANGS[0];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.rtl ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const val = dict[el.dataset.i18n];
    if (val != null) el.textContent = val;
  });
}

function populateLangSelect() {
  const sel = $('lang-select');
  sel.replaceChildren();
  UI_LANGS.forEach((l) => sel.add(new Option(l.label, l.code)));
}

// ── Talk to the content script on the active tab ──
function withActiveTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => cb(tabs[0]));
}

function sendToTab(tabId, message, cb) {
  chrome.tabs.sendMessage(tabId, message, (resp) => {
    // lastError means no content script on this tab (not a claude.ai page).
    cb(chrome.runtime.lastError ? null : resp);
  });
}

function setActionsEnabled(on) {
  $('all-rtl').disabled = !on;
  $('all-ltr').disabled = !on;
}

// Remember the last status so we can re-render it (in the new language) when the
// language changes — the health text isn't a [data-i18n] node, so applyI18n alone
// wouldn't update it.
let lastCount;
function showHealth(count) {
  lastCount = count;
  const el = $('health');
  if (count == null) {
    el.textContent = dict.pNoPage;
    el.classList.add('warn');
    setActionsEnabled(false);
  } else {
    el.textContent = `${count} ${dict.pDetected}`;
    el.classList.toggle('warn', count === 0); // 0 detected → selectors may be broken
    setActionsEnabled(true);
  }
}

// ── Init ──
populateLangSelect();
chrome.storage.local.get([ENABLED_KEY, UI_LANG_KEY, SETTINGS_KEY], (data) => {
  const lang = data[UI_LANG_KEY] || 'en';
  $('lang-select').value = lang;
  applyI18n(lang);
  $('enabled').checked = data[ENABLED_KEY] !== false; // default ON
  $('line-numbers').checked = !!mergeSettings(data[SETTINGS_KEY]).code.lineNumbers;

  withActiveTab((tab) => {
    if (!tab) return showHealth(null);
    sendToTab(tab.id, { type: 'getStatus' }, (resp) => {
      showHealth(resp ? resp.count : null);
    });

    $('all-rtl').addEventListener('click', () => sendToTab(tab.id, { type: 'setAll', rtl: true }, () => {}));
    $('all-ltr').addEventListener('click', () => sendToTab(tab.id, { type: 'setAll', rtl: false }, () => {}));
  });
});

// Master on/off — content scripts react via chrome.storage.onChanged.
$('enabled').addEventListener('change', (e) => {
  chrome.storage.local.set({ [ENABLED_KEY]: e.target.checked });
});

// Language — write the same key the options page uses; content + options stay in sync.
$('lang-select').addEventListener('change', (e) => {
  applyI18n(e.target.value);
  if (lastCount !== undefined) showHealth(lastCount); // re-translate the status line
  chrome.storage.local.set({ [UI_LANG_KEY]: e.target.value });
});

// Line numbers — read-modify-write the settings object (merge keeps other keys intact).
$('line-numbers').addEventListener('change', (e) => {
  chrome.storage.local.get(SETTINGS_KEY, (data) => {
    const settings = mergeSettings(data[SETTINGS_KEY]);
    settings.code.lineNumbers = e.target.checked;
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  });
});

$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
