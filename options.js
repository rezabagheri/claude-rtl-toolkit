// Claude RTL Toolkit - options.js
// Depends on config.js (loaded first): SETTINGS_KEY, UI_LANG_KEY, FONT_OPTIONS,
// DEFAULT_SETTINGS, mergeSettings, UI_LANGS, I18N.

const groups = [...document.querySelectorAll('.group')];

let currentLang = 'en';
let currentSettingsCache = null; // last rendered settings, for re-render on language change

// ── i18n ──
function detectLang() {
  const nav = (navigator.language || 'en').slice(0, 2);
  return UI_LANGS.some(l => l.code === nav) ? nav : 'en';
}

// Fill every [data-i18n] element and flip page direction for RTL languages.
function applyI18n(lang) {
  currentLang = I18N[lang] ? lang : 'en';
  const dict = I18N[currentLang];
  const meta = UI_LANGS.find(l => l.code === currentLang) || UI_LANGS[0];
  document.documentElement.lang = currentLang;
  document.documentElement.dir = meta.rtl ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = dict[el.dataset.i18n];
    if (val != null) el.textContent = val;
  });
  // Font labels are localized too — rebuild dropdowns, then restore selected values.
  populateSelects();
  if (currentSettingsCache) render(currentSettingsCache);
}

function populateLangSelect() {
  const sel = document.getElementById('lang-select');
  sel.innerHTML = UI_LANGS.map(l => `<option value="${l.code}">${l.label}</option>`).join('');
  sel.addEventListener('change', () => {
    applyI18n(sel.value);
    chrome.storage.local.set({ [UI_LANG_KEY]: currentLang });
  });
}

// Build a font option's human label: brand name (or translated name) + optional
// translated descriptor in parentheses.
function fontLabel(o, dict) {
  const base = o.nameKey ? dict[o.nameKey] : o.name;
  return o.descKey ? `${base} (${dict[o.descKey]})` : base;
}

// Populate each font <select> from the curated list for its kind (text vs code),
// localizing labels with the current dictionary.
function populateSelects() {
  const dict = I18N[currentLang] || I18N.en;
  document.querySelectorAll('select[data-field="fontFamily"]').forEach(sel => {
    const list = FONT_OPTIONS[sel.dataset.kind] || FONT_OPTIONS.text;
    sel.innerHTML = list
      .map(o => `<option value="${o.value}">${fontLabel(o, dict)}</option>`)
      .join('');
  });
}

// Reflect a settings object into the controls + previews.
function render(settings) {
  currentSettingsCache = settings;
  groups.forEach(group => {
    const scope = group.dataset.scope;
    const cfg = settings[scope];

    const select = group.querySelector('select[data-field="fontFamily"]');
    const range = group.querySelector('input[data-field="fontSize"]');
    const sizeVal = group.querySelector('.size-val');

    // If the stored family isn't in the list, add it so it shows as selected.
    // Use the Option constructor (text/value as data, never parsed as HTML).
    if (![...select.options].some(o => o.value === cfg.fontFamily)) {
      select.add(new Option(`${cfg.fontFamily} (سفارشی)`, cfg.fontFamily));
    }
    select.value = cfg.fontFamily;
    range.value = cfg.fontSize;
    sizeVal.textContent = cfg.fontSize;

    const lh = group.querySelector('input[data-field="lineHeight"]');
    const lhVal = group.querySelector('.lh-val');
    if (lh) { lh.value = cfg.lineHeight; lhVal.textContent = cfg.lineHeight; }

    const lineNo = group.querySelector('input[data-field="lineNumbers"]');
    if (lineNo) lineNo.checked = !!cfg.lineNumbers;

    applyPreview(group, cfg);
  });
}

function applyPreview(group, cfg) {
  const preview = group.querySelector('[data-preview]');
  preview.style.fontFamily = cfg.fontFamily;
  preview.style.fontSize = `${cfg.fontSize}px`;
  if (cfg.lineHeight) preview.style.lineHeight = cfg.lineHeight;

  // Code preview: show/hide a line-number gutter to mirror the real behavior.
  const gutter = preview.querySelector('.lineno-gutter');
  if (gutter) {
    const codeText = preview.querySelector('.code-text');
    if (cfg.lineNumbers) {
      const lines = codeText.textContent.replace(/\n$/, '').split('\n').length;
      gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
      gutter.hidden = false;
    } else {
      gutter.hidden = true;
    }
  }
}

// Read the current control values back into a settings object.
function collect() {
  const settings = {};
  groups.forEach(group => {
    const scope = group.dataset.scope;
    settings[scope] = {
      fontFamily: group.querySelector('select[data-field="fontFamily"]').value,
      fontSize: Number(group.querySelector('input[data-field="fontSize"]').value),
    };
    const lh = group.querySelector('input[data-field="lineHeight"]');
    if (lh) settings[scope].lineHeight = Number(lh.value);
    const lineNo = group.querySelector('input[data-field="lineNumbers"]');
    if (lineNo) settings[scope].lineNumbers = lineNo.checked;
  });
  return settings;
}

let statusTimer;
function flashStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove('show'), 1200);
}

function save() {
  const settings = collect();
  currentSettingsCache = settings; // keep cache fresh so a re-render (e.g. on language
                                   // switch) doesn't revert controls to stale values
  chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => flashStatus(I18N[currentLang].saved));
}

// Live update: on any control change, refresh that group's preview + persist.
function bindEvents() {
  groups.forEach(group => {
    const select = group.querySelector('select[data-field="fontFamily"]');
    const range = group.querySelector('input[data-field="fontSize"]');
    const sizeVal = group.querySelector('.size-val');

    select.addEventListener('change', () => {
      applyPreview(group, collect()[group.dataset.scope]);
      save();
    });
    range.addEventListener('input', () => {
      sizeVal.textContent = range.value;
      applyPreview(group, collect()[group.dataset.scope]);
    });
    range.addEventListener('change', save); // persist when the user releases the slider

    const lh = group.querySelector('input[data-field="lineHeight"]');
    const lhVal = group.querySelector('.lh-val');
    if (lh) {
      lh.addEventListener('input', () => {
        lhVal.textContent = lh.value;
        applyPreview(group, collect()[group.dataset.scope]);
      });
      lh.addEventListener('change', save);
    }

    const lineNo = group.querySelector('input[data-field="lineNumbers"]');
    if (lineNo) lineNo.addEventListener('change', save);
  });

  document.getElementById('reset').addEventListener('click', () => {
    chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS }, () => {
      render(mergeSettings(DEFAULT_SETTINGS));
      flashStatus(I18N[currentLang].resetDone);
    });
  });

  // Export: download the current settings as a JSON file.
  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'claude-rtl-toolkit-settings.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Import: read a JSON file, merge over defaults (so partial/old files still work),
  // persist, and re-render.
  const importFile = document.getElementById('import-file');
  document.getElementById('import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const settings = mergeSettings(JSON.parse(reader.result));
        chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
          render(settings);
          flashStatus(I18N[currentLang].saved);
        });
      } catch {
        flashStatus(I18N[currentLang].importError);
      }
      importFile.value = ''; // allow re-importing the same file
    };
    reader.readAsText(file);
  });
}

// Init (applyI18n populates the font selects once the language is known)
document.getElementById('version').textContent =
  `Claude RTL Toolkit v${chrome.runtime.getManifest().version}`;
populateLangSelect();
bindEvents();
chrome.storage.local.get([SETTINGS_KEY, UI_LANG_KEY], (data) => {
  const lang = data[UI_LANG_KEY] || detectLang();
  document.getElementById('lang-select').value = lang;
  applyI18n(lang);
  render(mergeSettings(data[SETTINGS_KEY]));
});
