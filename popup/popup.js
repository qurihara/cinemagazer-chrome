const FIELDS = ['enabled', 'speechRate', 'silentRate', 'silentMinGap', 'subtitleOffset', 'overlayEnabled', 'showHud', 'enableNetflix', 'enablePrime'];

function $(id) { return document.getElementById(id); }

async function load() {
  const s = await chrome.storage.sync.get(null);
  $('enabled').checked = !!s.enabled;
  $('speechRate').value = s.speechRate ?? 1.5;
  $('silentRate').value = s.silentRate ?? 4.0;
  $('silentMinGap').value = s.silentMinGap ?? 0.4;
  $('subtitleOffset').value = s.subtitleOffset ?? 0.0;
  $('overlayEnabled').checked = !!s.overlayEnabled;
  $('showHud').checked = s.showHud !== false;
  $('enableNetflix').checked = s.enableNetflix !== false; // 既定 ON
  $('enablePrime').checked = s.enablePrime === true;       // 既定 OFF
  refreshOutputs();
}

function refreshOutputs() {
  $('speechRateOut').textContent = parseFloat($('speechRate').value).toFixed(1) + '×';
  $('silentRateOut').textContent = parseFloat($('silentRate').value).toFixed(1) + '×';
  $('silentMinGapOut').textContent = parseFloat($('silentMinGap').value).toFixed(1) + 's';
  const off = parseFloat($('subtitleOffset').value);
  $('subtitleOffsetOut').textContent = (off >= 0 ? '+' : '') + off.toFixed(1) + 's';
}

async function save() {
  const settings = {
    enabled: $('enabled').checked,
    speechRate: parseFloat($('speechRate').value),
    silentRate: parseFloat($('silentRate').value),
    silentMinGap: parseFloat($('silentMinGap').value),
    subtitleOffset: parseFloat($('subtitleOffset').value),
    overlayEnabled: $('overlayEnabled').checked,
    showHud: $('showHud').checked,
    enableNetflix: $('enableNetflix').checked,
    enablePrime: $('enablePrime').checked
  };
  await chrome.storage.sync.set(settings);
  // chrome.storage.onChanged が content script 側で発火するので ブロードキャストは任意
  chrome.runtime.sendMessage({ type: 'CG_SETTINGS_UPDATED', settings }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  for (const id of FIELDS) {
    const el = $(id);
    el.addEventListener('input', () => { refreshOutputs(); save(); });
    el.addEventListener('change', () => { refreshOutputs(); save(); });
  }
});
