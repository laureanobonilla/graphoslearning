/* Google Ads: etiqueta + conversión «primer mapa generado».
   1) Pega tu ID de etiqueta de Google (AW-XXXXXXXXXX) en GOOGLE_TAG_ID. Con el campo vacío esto no hace NADA (no carga nada de Google).
   2) Si Google te dio también una etiqueta de evento de conversión (AW-XXXXXXXXXX/abcDEF...), pégala en CONVERSION_SEND_TO (opcional).
   3) La conversión por página usa /gracias-mapa/: se carga una sola vez por dispositivo, en segundo plano, cuando se genera el primer mapa. */
(function () {
  'use strict';
  var GOOGLE_TAG_ID = '';        // ej. 'AW-1234567890'
  var CONVERSION_SEND_TO = '';   // ej. 'AW-1234567890/AbC-dEfGhIjK' (opcional)
  var KEY = 'gk_ads_conv1';
  function load() {
    if (!GOOGLE_TAG_ID || window.__gkAdsLoaded) return;
    window.__gkAdsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GOOGLE_TAG_ID);
    document.head.appendChild(s);
    window.gtag('js', new Date()); window.gtag('config', GOOGLE_TAG_ID);
  }
  load();
  window.GK_ADS = {
    // Llamar cuando la persona ve su primer mapa. Una sola vez por dispositivo.
    firstMap: function () {
      try {
        if (!GOOGLE_TAG_ID) return;
        if (localStorage.getItem(KEY)) return;
        localStorage.setItem(KEY, String(Date.now()));
        if (CONVERSION_SEND_TO && window.gtag) window.gtag('event', 'conversion', { send_to: CONVERSION_SEND_TO });
        var f = document.createElement('iframe'); f.src = '/gracias-mapa/'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
        f.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:0;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(f);
        setTimeout(function () { try { f.remove(); } catch (e) { /* nada */ } }, 15000);
      } catch (e) { /* nada */ }
    }
  };
})();
