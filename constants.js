/* ═══════════════════════════════════════════════════════════════════════════
   Fontmaster constants.js — Single Source of Truth
   ═══════════════════════════════════════════════════════════════════════════ */

const FONT_CATALOG = [
  { name: 'Inter',           cat: 'Sans',  weights: ['100','200','300','400','500','600','700','800','900'] },
  { name: 'Roboto',          cat: 'Sans',  weights: ['100','300','400','500','700','900'] },
  { name: 'Open Sans',       cat: 'Sans',  weights: ['300','400','500','600','700','800'] },
  { name: 'Poppins',         cat: 'Sans',  weights: ['100','200','300','400','500','600','700','800','900'] },
  { name: 'DM Sans',         cat: 'Sans',  weights: ['100','200','300','400','500','600','700','800','900'] },
  { name: 'Geist',           cat: 'Sans',  weights: ['100','200','300','400','500','600','700','800','900'] },
  { name: 'Lora',            cat: 'Serif', weights: ['400','500','600','700'] },
  { name: 'Merriweather',    cat: 'Serif', weights: ['300','400','700','900'] },
  { name: 'JetBrains Mono',  cat: 'Mono',  weights: ['100','200','300','400','500','600','700','800'] },
  { name: 'Fira Code',       cat: 'Mono',  weights: ['300','400','500','600','700'] }
];

const CAT_ORDER = ['Sans', 'Serif', 'Mono'];
const ALL_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
const MAX_LOCAL_FONTS_INITIAL = 50;
const LOCAL_FONTS_CACHE_KEY = 'fontmaster_local_fonts_cache';

const DEFAULT_SETTINGS = {
  fastRendering: false,
  protectMonospace: true,
  fontSource: 'google',
  theme: 'auto'
};

const RESTRICTED_SCHEMES = [
  'chrome:', 'edge:', 'about:', 'brave:', 'opera:', 'vivaldi:', 'firefox:', 'file:', 'chrome-extension:'
];

const MONO_SELECTORS = [
  'code', 'pre', 'kbd', 'samp', 'tt', 'var',
  '.blob-code', '.blob-code-inner', '.blob-code-content', '.blob-code-marker',
  '.file-code', '.highlight', '.react-code-view', '.react-blob-print-hide',
  '[data-testid="code-line"]', '[class*="Primer"]', '.LineContainer',
  '.monaco-editor', '.monaco-editor .view-line', '.monaco-editor .margin',
  '.monaco-editor .lines-content', '.monaco-editor .overflow-guard',
  '[class*="monaco"]', '[class*="codicon"]',
  '.cm-editor', '.cm-content', '.cm-line', '.cm-gutter', '.CodeMirror',
  '.CodeMirror-line', '.CodeMirror-linenumber',
  '.ace_editor', '.ace_line', '.ace_content', '.ace_gutter',
  '[class*="prism"]', '[class*="hljs"]', '[class*="syntax"]',
  '.diff-content', '.file-content', '.code-content', '.source',
  '.console-message-text', '.console-view', '.source-code',
  '.s-code-block', '.wmd-input',
  'input[type="email"]', 'input[type="password"]', 'input[type="url"]',
  'input[type="search"]', 'input[type="tel"]', 'input[type="number"]',
  'textarea',
  '[class*="code"]', '[class*="Code"]', '[class*="mono"]', '[class*="Mono"]',
  '[class*="editor"]', '[class*="Editor"]', '[class*="terminal"]', '[class*="Terminal"]',
  '[class*="console"]', '[class*="Console"]', '[class*="shell"]', '[class*="Shell"]',
  '[class*="bash"]', '[class*="Bash"]', '[class*="cmd"]', '[class*="prompt"]'
].join(',');

function normalizeDomain(url) {
  if (!url) return '';
  try {
    let hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function buildFontURL(family, weights, source, fastRendering = false) {
  if (source === 'local') return '';

  const encoded = encodeURIComponent(family).replace(/%20/g, '+');
  const display = fastRendering ? 'swap' : 'block';
  const sortedW = Array.isArray(weights) && weights.length ? [...new Set(weights)].sort((a, b) => +a - +b).join(';') : '400';

  if (source === 'bunny') {
    return `https://fonts.bunny.net/css?family=${encoded}:${sortedW}&display=${display}`;
  }
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${sortedW}&display=${display}`;
}

function buildAppliedCSS(family, config = {}, settings = {}) {
  const fontName = family.replace(/\+/g, ' ');
  const typo = config.typography || {};
  const protectMono = settings.protectMonospace !== false;

  let css = '';

  if (protectMono) {
    css += `${MONO_SELECTORS} {\n`;
    css += `  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, Courier New, monospace !important;\n`;
    css += `  letter-spacing: normal !important;\n`;
    css += `  word-spacing: normal !important;\n`;
    css += `  font-variant-ligatures: none !important;\n`;
    css += `}\n`;
  }

  const baseTarget = protectMono ? `*:not(${MONO_SELECTORS})` : `*`;
  
  css += `html, body {\n`;
  css += `  font-family: '${fontName}', system-ui, -apple-system, sans-serif !important;\n`;
  if (typo.weight) css += `  font-weight: ${typo.weight} !important;\n`;
  css += `}\n`;

  css += `${baseTarget} {\n`;
  css += `  font-family: inherit;\n`;
  if (typo.weight) css += `  font-weight: inherit;\n`;
  css += `}\n`;

  if (typo.letterSpacing !== undefined && typo.letterSpacing !== 0) {
    css += `html, body { letter-spacing: ${typo.letterSpacing}px !important; }\n`;
    if (protectMono) css += `${MONO_SELECTORS} { letter-spacing: normal !important; }\n`;
  }

  if (typo.lineHeight !== undefined && typo.lineHeight !== 1.5) {
    css += `html, body, ${baseTarget} { line-height: ${typo.lineHeight} !important; }\n`;
  }

  if (typo.fontSize !== undefined && typo.fontSize !== 16) {
    css += `html { font-size: ${typo.fontSize}px !important; }\n`;
  }

  css += `* { -webkit-font-smoothing: antialiased !important; -moz-osx-font-smoothing: grayscale !important; }\n`;
  return css;
}

if (typeof globalThis !== 'undefined') {
  globalThis.FONT_CATALOG = FONT_CATALOG;
  globalThis.CAT_ORDER = CAT_ORDER;
  globalThis.ALL_WEIGHTS = ALL_WEIGHTS;
  globalThis.MAX_LOCAL_FONTS_INITIAL = MAX_LOCAL_FONTS_INITIAL;
  globalThis.LOCAL_FONTS_CACHE_KEY = LOCAL_FONTS_CACHE_KEY;
  globalThis.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  globalThis.RESTRICTED_SCHEMES = RESTRICTED_SCHEMES;
  globalThis.MONO_SELECTORS = MONO_SELECTORS;
  globalThis.normalizeDomain = normalizeDomain;
  globalThis.buildFontURL = buildFontURL;
  globalThis.buildAppliedCSS = buildAppliedCSS;
}