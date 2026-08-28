/* ═══════════════════════════════════════════════════════════════════════════
   Fontmaster content.js — Injection & Runtime Engine
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

(function () {
  const STYLESHEET_ID = 'fontmaster-stylesheet';
  const CUSTOM_CSS_ID = 'fontmaster-custom-css';

  /**
   * Inject or update the dynamic CSS and font links in the page head.
   */
  async function applyFontOverride(data, settings) {
    if (!data || !data.family) return;

    // 1. Inject or update external stylesheet link (Google Fonts / Bunny Fonts)
    if (data.url && data.source !== 'local') {
      let link = document.getElementById(STYLESHEET_ID);
      if (!link) {
        link = document.createElement('link');
        link.id = STYLESHEET_ID;
        link.rel = 'stylesheet';
        (document.head || document.documentElement).appendChild(link);
      }
      if (link.href !== data.url) {
        link.href = data.url;
      }
    } else {
      // If local font or no URL, remove previous remote stylesheet
      removeStylesheetLink();
    }

    // 2. Build and inject main CSS rules override
    const cssContent = buildAppliedCSS(data.family, data.config || {}, settings || {});
    let style = document.getElementById(CUSTOM_CSS_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = CUSTOM_CSS_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = cssContent;

    // 3. Verify font loading status using Document.fonts API
    return verifyFontLoaded(data.family);
  }

  /**
   * Verify whether the browser has successfully parsed and rendered the target font.
   */
  async function verifyFontLoaded(family) {
    if (!('fonts' in document)) {
      return { success: true };
    }

    try {
      const cleanFamily = family.replace(/\+/g, ' ');
      // Attempt to load the font explicitly within a short timeframe
      const loadedFonts = await document.fonts.load(`16px "${cleanFamily}"`);

      if (loadedFonts.length === 0) {
        return {
          success: true,
          warning: `Font "${cleanFamily}" could not be confirmed by the browser. A fallback font may be active.`
        };
      }
      return { success: true };
    } catch (err) {
      return {
        success: true,
        warning: `Font "${family}" validation bypassed due to page security limits (CSP).`
      };
    }
  }

  /**
   * Remove external font stylesheet link element.
   */
  function removeStylesheetLink() {
    const link = document.getElementById(STYLESHEET_ID);
    if (link) link.remove();
  }

  /**
   * Remove injected CSS style override node.
   */
  function removeCustomCSS() {
    const style = document.getElementById(CUSTOM_CSS_ID);
    if (style) style.remove();
  }

  /**
   * Remove all extension styles from the target DOM.
   */
  function removeFontOverride() {
    removeStylesheetLink();
    removeCustomCSS();
  }

  /**
   * Initialize state from storage when content script loads.
   */
  async function init() {
    try {
      const currentDomain = normalizeDomain(window.location.href);
      if (!currentDomain) return;

      const res = await chrome.storage.sync.get(['fontmasterSettings', 'appliedFonts']);
      const settings = res.fontmasterSettings || DEFAULT_SETTINGS;
      const appliedFonts = res.appliedFonts || {};

      const fontData = appliedFonts[currentDomain];
      if (fontData && fontData.enabled !== false) {
        await applyFontOverride(fontData, settings);
      }
    } catch (e) {
      console.warn('[Fontmaster] Content script init failed:', e);
    }
  }

  /**
   * Message Listener for action requests from the popup.
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return false;

    switch (request.action) {
      case 'applyFont':
        applyFontOverride(request.data, request.settings)
          .then(result => sendResponse(result || { success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep message channel open for async response

      case 'removeFont':
        removeFontOverride();
        sendResponse({ success: true });
        break;

      case 'settingsUpdated':
        init();
        sendResponse({ success: true });
        break;

      default:
        break;
    }
    return false;
  });

  // Execute initialization when document structure is available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();