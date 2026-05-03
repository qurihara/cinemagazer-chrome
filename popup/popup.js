const FIELDS = ['enabled', 'speechRate', 'silentRate', 'silentMinGap', 'subtitleOffset', 'overlayEnabled', 'showHud', 'enableNetflix', 'enablePrime'];

function $(id) { return document.getElementById(id); }

// i18n: data-i18n="messageKey" 属性を持つ要素のテキストを置換
function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  }
  // <html lang> もブラウザ言語に合わせる（Chromeのlocaleに従う）
  try {
    const ui = chrome.i18n.getUILanguage();
    if (ui) document.documentElement.lang = ui.split('-')[0];
  } catch (e) {}
}

async function load() {
  const s = await chrome.storage.sync.get(null);
  $('enabled').checked = !!s.enabled;
  $('speechRate').value = s.speechRate ?? 1.5;
  $('silentRate').value = s.silentRate ?? 4.0;
  $('silentMinGap').value = s.silentMinGap ?? 0.4;
  $('subtitleOffset').value = s.subtitleOffset ?? 0.0;
  $('overlayEnabled').checked = s.overlayEnabled !== false; // 既定 ON
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

// シェアURL コピー: アクティブタブの content script に問い合わせ → クリップボードへ
async function copyShareUrl() {
  const btn = $('copyShareUrl');
  if (!btn) return;
  const original = btn.textContent;
  const restore = () => setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('ok', 'ng');
  }, 2000);
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0] || !tabs[0].id) throw new Error('no active tab');
    const resp = await chrome.tabs.sendMessage(tabs[0].id, { type: 'CG_GET_SHARE_URL' });
    if (!resp || !resp.url) throw new Error('no url');
    await navigator.clipboard.writeText(resp.url);
    btn.textContent = chrome.i18n.getMessage('buttonShareUrlCopied') || '✓ クリップボードにコピーしました';
    btn.classList.add('ok');
    restore();
  } catch (e) {
    btn.textContent = chrome.i18n.getMessage('buttonShareUrlError') || '✗ コピーできません';
    btn.classList.add('ng');
    restore();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  load();
  for (const id of FIELDS) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('input', () => { refreshOutputs(); save(); });
    el.addEventListener('change', () => { refreshOutputs(); save(); });
  }
  const shareBtn = $('copyShareUrl');
  if (shareBtn) shareBtn.addEventListener('click', copyShareUrl);
});
