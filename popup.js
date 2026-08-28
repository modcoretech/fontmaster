'use strict';

const State = {
  settings: { ...DEFAULT_SETTINGS },
  appliedFonts: {},
  family: 'Inter',
  weights: ['400', '700'],
  letterSpacing: 0,
  lineHeight: 1.5,
  fontSize: 16,
  fontWeight: 400,
  currentTab: null,
  isOnline: navigator.onLine,
  manifestVer: '3.1',
  localFonts: []
};

const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];

const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

function isRestrictedUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return RESTRICTED_SCHEMES.includes(u.protocol);
  } catch {
    return true;
  }
}

function showPopup(title, message, type = 'warning') {
  const overlay = $('modal-overlay');
  const titleEl = $('modal-title');
  const bodyEl = $('modal-body');

  titleEl.textContent = title;
  titleEl.className = `modal-title ${type}`;
  bodyEl.textContent = message;

  overlay.classList.remove('hidden');
}

function closePopup() {
  $('modal-overlay').classList.add('hidden');
}

const Storage = {
  async load() {
    try {
      const res = await chrome.storage.sync.get(['fontmasterSettings', 'appliedFonts']);
      if (res.fontmasterSettings) Object.assign(State.settings, res.fontmasterSettings);
      if (res.appliedFonts) State.appliedFonts = res.appliedFonts;

      const localRes = await chrome.storage.local.get([LOCAL_FONTS_CACHE_KEY]);
      if (localRes[LOCAL_FONTS_CACHE_KEY]) {
        State.localFonts = localRes[LOCAL_FONTS_CACHE_KEY];
      }
    } catch (e) {
      console.warn('[Fontmaster] Storage load:', e);
    }
  },
  async saveSettings() {
    await chrome.storage.sync.set({ fontmasterSettings: State.settings });
  },
  async saveFonts() {
    await chrome.storage.sync.set({ appliedFonts: State.appliedFonts });
  },
  async saveLocalFontsCache(fonts) {
    await chrome.storage.local.set({ [LOCAL_FONTS_CACHE_KEY]: fonts });
  }
};

const Network = {
  async check() {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      await fetch('https://fonts.googleapis.com/favicon.ico', { method: 'HEAD', signal: controller.signal, mode: 'no-cors' });
      clearTimeout(t);
      State.isOnline = true;
    } catch {
      State.isOnline = false;
      if (State.settings.fontSource !== 'local') {
        showPopup('Network Offline', 'Font catalog is currently unavailable online. System local fonts can still be loaded.', 'warning');
      }
    }
    return State.isOnline;
  }
};

async function loadLocalFonts() {
  if (State.localFonts.length > 0) return;

  if (!('queryLocalFonts' in window)) {
    showPopup('Feature Unavailable', 'Local font access is not supported by your browser.', 'warning');
    return;
  }

  try {
    const available = await window.queryLocalFonts();
    const uniqueFamilies = new Set();
    
    // Chunked array iteration using requestIdleCallback to avoid UI blocking
    let index = 0;
    const batchSize = 100;

    const processBatch = (deadline) => {
      while (index < available.length && deadline.timeRemaining() > 0) {
        uniqueFamilies.add(available[index].family);
        index++;
      }

      if (index < available.length) {
        requestIdleCallback(processBatch);
      } else {
        const sortedNames = [...uniqueFamilies].sort();
        State.localFonts = sortedNames.map(n => ({ name: n, cat: 'Local', weights: ALL_WEIGHTS }));
        Storage.saveLocalFontsCache(State.localFonts);
        buildSuggestions($('font-input').value.trim());
      }
    };

    requestIdleCallback(processBatch);
  } catch (e) {
    console.warn('[Fontmaster] Local fonts permission denied or failed', e);
    showPopup('Permission Required', 'Access to system local fonts was denied or blocked.', 'warning');
  }
}

function buildWeightChips() {
  const container = $('weight-chips');
  container.innerHTML = '';
  const catalog = State.settings.fontSource === 'local' ? State.localFonts : FONT_CATALOG;
  const font = catalog.find(f => f.name.toLowerCase() === State.family.toLowerCase());
  const supported = font ? font.weights : ALL_WEIGHTS;

  supported.forEach(w => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.weight = w;
    chip.textContent = w;
    chip.setAttribute('aria-pressed', String(State.weights.includes(w)));
    if (State.weights.includes(w)) chip.classList.add('active');
    chip.addEventListener('click', () => toggleWeight(w));
    container.appendChild(chip);
  });
  $('weights-count').textContent = State.weights.length;
}

function buildSuggestions(filterQuery = '') {
  const container = $('suggestions');
  container.innerHTML = '';
  const isLocal = State.settings.fontSource === 'local';
  const sourceCatalog = isLocal ? State.localFonts : FONT_CATALOG;

  if (isLocal && !sourceCatalog.length) {
    const info = document.createElement('div');
    info.className = 'no-results';
    info.textContent = 'Click "Local" to load system fonts';
    container.appendChild(info);
    return;
  }

  const q = filterQuery.toLowerCase();
  let filtered = sourceCatalog.filter(f => f.name.toLowerCase().includes(q));

  if (isLocal && !filterQuery) {
    filtered = filtered.slice(0, MAX_LOCAL_FONTS_INITIAL);
  }

  const grouped = {};
  filtered.forEach(f => {
    (grouped[f.cat] = grouped[f.cat] || []).push(f);
  });

  const order = isLocal ? ['Local'] : CAT_ORDER;
  order.forEach(cat => {
    const fonts = grouped[cat];
    if (!fonts || !fonts.length) return;
    const section = document.createElement('div');
    section.className = 'suggest-section';
    section.dataset.cat = cat;

    const heading = document.createElement('div');
    heading.className = 'suggest-category';
    heading.textContent = cat;
    section.appendChild(heading);

    fonts.forEach(font => {
      const item = document.createElement('div');
      item.className = 'suggest-item';
      item.role = 'option';
      item.tabIndex = -1;
      item.dataset.font = font.name;

      const name = document.createElement('span');
      name.className = 'suggest-name';
      name.textContent = font.name;

      const meta = document.createElement('span');
      meta.className = 'suggest-meta';
      meta.textContent = `${font.weights.length} weights`;

      item.appendChild(name);
      item.appendChild(meta);
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        selectFont(font.name, font.weights);
      });
      section.appendChild(item);
    });
    container.appendChild(section);
  });
}

function selectFont(name, weights) {
  $('font-input').value = name;
  State.family = name;
  State.weights = [...weights];
  buildWeightChips();
  closeSuggestions();
  $('clear-btn').classList.remove('hidden');
  previewFont(name);
}

function toggleWeight(w) {
  const idx = State.weights.indexOf(w);
  if (idx > -1) {
    if (State.weights.length <= 1) {
      showPopup('Weight Required', 'At least one weight must remain selected.', 'warning');
      return;
    }
    State.weights.splice(idx, 1);
  } else {
    State.weights.push(w);
    State.weights.sort((a, b) => +a - +b);
  }
  buildWeightChips();
  if (State.family) previewFont(State.family);
}

let previewLink = null;
const debouncedPreview = debounce((family) => {
  if (!family) return;
  const isLocal = State.settings.fontSource === 'local';

  if (!isLocal) {
    const url = buildFontURL(family, State.weights, State.settings.fontSource, State.settings.fastRendering);
    if (!previewLink) {
      previewLink = document.createElement('link');
      previewLink.rel = 'stylesheet';
      document.head.appendChild(previewLink);
    }
    previewLink.href = url;
  }

  const el = $('preview-text');
  el.style.fontFamily = `'${family}', system-ui, sans-serif`;
  el.style.fontWeight = State.fontWeight;
  $('preview-meta').textContent = `${family} · ${isLocal ? 'Local System' : State.settings.fontSource} Font`;
}, 100);

function previewFont(family) {
  debouncedPreview(family);
}

function updateStatusRow() {
  const domain = normalizeDomain(State.currentTab?.url);
  const active = State.appliedFonts[domain] || null;
  const dot = $('status-dot');
  const text = $('status-text');
  const toggleWrap = $('site-toggle-wrap');
  const siteToggle = $('site-toggle');

  if (active) {
    dot.classList.toggle('active', active.enabled !== false);
    text.textContent = active.family || 'Font active';
    toggleWrap.classList.remove('hidden');
    siteToggle.checked = active.enabled !== false;
    $('remove-btn').classList.remove('hidden');
    if (!$('font-input').value && active.family) {
      $('font-input').value = active.family;
      State.family = active.family;
      State.weights = active.weights || ['400', '700'];
      buildWeightChips();
      $('clear-btn').classList.remove('hidden');
      previewFont(active.family);
    }
  } else {
    dot.classList.remove('active');
    text.textContent = 'No font active on this site';
    toggleWrap.classList.add('hidden');
    $('remove-btn').classList.add('hidden');
  }
}

function applyTheme() {
  const theme = State.settings.theme;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function setupEvents() {
  $('modal-close-btn').addEventListener('click', closePopup);
  $('modal-ok-btn').addEventListener('click', closePopup);

  $$('.tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  window.addEventListener('online', () => { State.isOnline = true; });
  window.addEventListener('offline', () => {
    State.isOnline = false;
    if (State.settings.fontSource !== 'local') {
      showPopup('Network Offline', 'You have gone offline. Remote font catalogs are unavailable.', 'warning');
    }
  });

  $$('.pill[data-source]').forEach(pill => {
    pill.addEventListener('click', async () => {
      const src = pill.dataset.source;
      State.settings.fontSource = src;

      if (src === 'local') {
        await loadLocalFonts();
      }

      $$('.pill[data-source]').forEach(p => {
        const on = p.dataset.source === src;
        p.classList.toggle('active', on);
        p.setAttribute('aria-pressed', String(on));
      });

      buildSuggestions($('font-input').value.trim());
      buildWeightChips();
      if (State.family) previewFont(State.family);
      Storage.saveSettings();
    });
  });

  const inp = $('font-input');
  let suggestIndex = -1;

  inp.addEventListener('input', debounce(e => {
    const val = e.target.value.trim();
    State.family = val;
    $('clear-btn').classList.toggle('hidden', !val);
    filterSuggestions(val);
    if (val.length >= 2) previewFont(val);
  }, 100));

  inp.addEventListener('focus', () => filterSuggestions(inp.value.trim()));

  inp.addEventListener('keydown', e => {
    const items = $$('.suggest-item:not([hidden])');
    if ($('suggestions').classList.contains('hidden') || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
      highlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIndex = Math.max(suggestIndex - 1, -1);
      highlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestIndex >= 0) items[suggestIndex].click();
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }

    function highlight(items) {
      items.forEach((el, i) => el.classList.toggle('highlighted', i === suggestIndex));
      if (suggestIndex >= 0) items[suggestIndex].scrollIntoView({ block: 'nearest' });
    }
  });

  $('clear-btn').addEventListener('click', () => {
    inp.value = '';
    State.family = '';
    $('clear-btn').classList.add('hidden');
    closeSuggestions();
    inp.focus();
    $('preview-text').style.fontFamily = '';
    $('preview-meta').textContent = 'Select a font to preview';
  });

  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#font-input') && !e.target.closest('#suggestions')) {
      closeSuggestions();
    }
  });

  $('site-toggle').addEventListener('change', async e => {
    const domain = normalizeDomain(State.currentTab?.url);
    if (!domain || !State.appliedFonts[domain]) return;

    const enabled = e.target.checked;
    State.appliedFonts[domain].enabled = enabled;
    await Storage.saveFonts();

    chrome.tabs.sendMessage(State.currentTab.id, {
      action: enabled ? 'applyFont' : 'removeFont',
      data: State.appliedFonts[domain],
      settings: State.settings
    }).catch(() => {});

    updateStatusRow();
  });

  const debouncedSliderInput = debounce(() => {
    if (State.family) previewFont(State.family);
  }, 100);

  $('letter-spacing').addEventListener('input', e => {
    State.letterSpacing = parseFloat(e.target.value);
    $('ls-val').textContent = State.letterSpacing + 'px';
    debouncedSliderInput();
  });

  $('line-height').addEventListener('input', e => {
    State.lineHeight = parseFloat(e.target.value);
    $('lh-val').textContent = State.lineHeight;
    debouncedSliderInput();
  });

  $('font-size').addEventListener('input', e => {
    State.fontSize = parseInt(e.target.value, 10);
    $('fs-val').textContent = State.fontSize + 'px';
    $('preview-text').style.fontSize = State.fontSize + 'px';
  });

  $('font-weight-slider').addEventListener('input', e => {
    State.fontWeight = parseInt(e.target.value, 10);
    $('fw-val').textContent = State.fontWeight;
    debouncedSliderInput();
  });

  const typoToggle = $('typo-toggle');
  const typoBody = $('typo-body');
  if (typoToggle && typoBody) {
    typoToggle.addEventListener('click', () => {
      const isHidden = typoBody.classList.toggle('hidden');
      typoToggle.setAttribute('aria-expanded', String(!isHidden));
      typoToggle.textContent = isHidden ? '+' : '−';
    });
  }

  $('apply-btn').addEventListener('click', applyFont);
  $('remove-btn').addEventListener('click', removeFont);

  $('fast-rendering').addEventListener('change', () => {
    State.settings.fastRendering = $('fast-rendering').checked;
    saveAndNotify();
  });

  $('protect-monospace').addEventListener('change', () => {
    State.settings.protectMonospace = $('protect-monospace').checked;
    saveAndNotify();
  });

  $('theme-select').addEventListener('change', e => {
    State.settings.theme = e.target.value;
    applyTheme();
    saveAndNotify();
  });

  $('export-btn').addEventListener('click', exportData);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', importData);
  $('reset-btn').addEventListener('click', resetAll);
  $('github-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/modcoretech/fontmaster/issues' });
  });
}

function switchTab(name) {
  $$('.tab[data-tab]').forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $$('.panel').forEach(p => {
    const on = p.id === `panel-${name}`;
    p.classList.toggle('hidden', !on);
    p.classList.toggle('active', on);
  });
  if (name === 'font') updateStatusRow();
}

function filterSuggestions(query) {
  buildSuggestions(query);
  const sug = $('suggestions');
  const q = query.toLowerCase();
  const hasItems = sug.querySelectorAll('.suggest-item').length > 0;

  let noRes = sug.querySelector('.no-results');
  if (!hasItems && q.length >= 2) {
    if (!noRes) {
      noRes = document.createElement('div');
      noRes.className = 'no-results';
    }
    noRes.textContent = `No suggestions for "${query}"`;
    if (!noRes.parentNode) sug.appendChild(noRes);
  } else {
    noRes?.remove();
  }

  sug.classList.toggle('hidden', !hasItems && q.length < 2);
  $('font-input').setAttribute('aria-expanded', String(hasItems || q.length >= 2));
}

function closeSuggestions() {
  $('suggestions').classList.add('hidden');
  $('font-input').setAttribute('aria-expanded', 'false');
}

async function applyFont() {
  const family = State.family.trim();
  if (!family || family.length < 2) {
    showPopup('Invalid Input', 'Please enter a valid font name.', 'warning');
    return;
  }

  if (isRestrictedUrl(State.currentTab?.url)) {
    showPopup('Restricted Page', 'Cannot modify system or restricted browser pages.', 'error');
    return;
  }

  const domain = normalizeDomain(State.currentTab?.url);
  if (!domain) {
    showPopup('Domain Error', 'Could not determine the domain for the active tab.', 'error');
    return;
  }

  const btn = $('apply-btn');
  const spinner = btn.querySelector('.spinner');
  const label = btn.querySelector('.btn-label');
  spinner.classList.remove('hidden');
  label.textContent = 'Applying…';
  btn.disabled = true;

  try {
    const fontData = {
      url: buildFontURL(family, State.weights, State.settings.fontSource, State.settings.fastRendering),
      family,
      name: family,
      source: State.settings.fontSource,
      weights: [...State.weights],
      enabled: true,
      config: {
        typography: {
          letterSpacing: State.letterSpacing,
          lineHeight: State.lineHeight,
          fontSize: State.fontSize,
          weight: State.fontWeight
        }
      },
      timestamp: Date.now()
    };

    const response = await chrome.tabs.sendMessage(State.currentTab.id, {
      action: 'applyFont',
      data: fontData,
      settings: State.settings
    });

    if (response && response.warning) {
      showPopup('Font Warning', response.warning, 'warning');
    }

    // Unified domain mapping (single write)
    State.appliedFonts[domain] = fontData;

    await Storage.saveFonts();
    updateStatusRow();
  } catch (err) {
    console.error('[Fontmaster] apply error:', err);
    showPopup('Connection Error', 'Failed to communicate with the page script.', 'error');
  } finally {
    spinner.classList.add('hidden');
    label.textContent = 'Apply Font';
    btn.disabled = false;
  }
}

async function removeFont() {
  const domain = normalizeDomain(State.currentTab?.url);
  if (!domain || isRestrictedUrl(State.currentTab?.url)) return;

  try {
    await chrome.tabs.sendMessage(State.currentTab.id, { action: 'removeFont' });

    delete State.appliedFonts[domain];
    await Storage.saveFonts();

    $('font-input').value = '';
    State.family = '';
    $('clear-btn').classList.add('hidden');
    $('preview-text').style.fontFamily = '';
    $('preview-meta').textContent = 'Select a font to preview';
    buildWeightChips();
    updateStatusRow();
  } catch (err) {
    showPopup('Action Failed', 'Failed to remove font from current tab.', 'error');
  }
}

function saveAndNotify() {
  Storage.saveSettings();
  if (State.currentTab?.id && !isRestrictedUrl(State.currentTab.url)) {
    chrome.tabs.sendMessage(State.currentTab.id, {
      action: 'settingsUpdated',
      settings: State.settings
    }).catch(() => {});
  }
}

function exportData() {
  const data = {
    version: State.manifestVer,
    exportDate: new Date().toISOString(),
    settings: State.settings,
    appliedFonts: State.appliedFonts
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fontmaster-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.settings) {
      Object.assign(State.settings, data.settings);
      await Storage.saveSettings();
    }
    if (data.appliedFonts) {
      State.appliedFonts = data.appliedFonts;
      await Storage.saveFonts();
    }
    applyStateToUI();
  } catch (err) {
    showPopup('Import Error', 'Import failed: ' + err.message, 'error');
  }
  e.target.value = '';
}

async function resetAll() {
  if (!confirm('Reset all Fontmaster settings and fonts?')) return;
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  State.settings = { ...DEFAULT_SETTINGS };
  State.appliedFonts = {};
  State.localFonts = [];
  applyStateToUI();
}

function applyStateToUI() {
  applyTheme();

  $('fast-rendering').checked = State.settings.fastRendering;
  $('protect-monospace').checked = State.settings.protectMonospace !== false;
  $('theme-select').value = State.settings.theme;

  const src = State.settings.fontSource || 'google';
  $$('.pill[data-source]').forEach(p => {
    const on = p.dataset.source === src;
    p.classList.toggle('active', on);
    p.setAttribute('aria-pressed', String(on));
  });

  $('letter-spacing').value = State.letterSpacing;
  $('ls-val').textContent = State.letterSpacing + 'px';
  $('line-height').value = State.lineHeight;
  $('lh-val').textContent = String(State.lineHeight);
  $('font-size').value = State.fontSize;
  $('fs-val').textContent = State.fontSize + 'px';
  $('font-weight-slider').value = State.fontWeight;
  $('fw-val').textContent = State.fontWeight;

  buildWeightChips();
  updateStatusRow();
  $('about-ver').textContent = 'v' + State.manifestVer;
}

async function init() {
  await Storage.load();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  State.currentTab = tab || null;
  const manifest = chrome.runtime.getManifest();
  State.manifestVer = manifest.version;

  buildSuggestions();
  buildWeightChips();
  setupEvents();
  applyStateToUI();
  Network.check();
}

document.addEventListener('DOMContentLoaded', init);