/* i18n — un solo lugar que decide el idioma y entrega los textos.
 *
 *  - Idioma: ?lang=en|es  >  ruta que empieza por /en  >  español.
 *  - Los textos viven en i18n/es.js y i18n/en.js (mismas claves).
 *  - tr('clave', {param: valor})  → texto del idioma activo; {param} se reemplaza.
 *    Si falta la clave en inglés se usa el español; si falta en ambos, la clave.
 *  - Atributos en el HTML:
 *      data-i18n="clave"              → reemplaza el contenido (admite HTML simple)
 *      data-i18n-title / -placeholder / -aria-label / -alt="clave" → atributo
 *  Para añadir un idioma: crear i18n/xx.js con las mismas claves y agregarlo a SUPPORTED.
 */
(function () {
    'use strict';
    var SUPPORTED = ['es', 'en'];
    var DEFAULT = 'es';

    function detect() {
        try {
            var q = new URLSearchParams(location.search).get('lang');
            if (q && SUPPORTED.indexOf(q.toLowerCase()) !== -1) return q.toLowerCase();
        } catch (_e) { /* sin URLSearchParams: seguimos con la ruta */ }
        var seg = (location.pathname.split('/')[1] || '').toLowerCase();
        return SUPPORTED.indexOf(seg) !== -1 && seg !== DEFAULT ? seg : DEFAULT;
    }

    var lang = detect();
    var catalogs = window.I18N_CATALOGS || {};

    function tr(key, params) {
        var cat = catalogs[lang] || {};
        var s = cat[key];
        if (s === undefined) s = (catalogs[DEFAULT] || {})[key];
        if (s === undefined) return key;
        if (params) s = s.replace(/\{(\w+)\}/g, function (m, name) {
            return params[name] !== undefined && params[name] !== null ? String(params[name]) : m;
        });
        return s;
    }

    var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
    function apply(root) {
        root = root || document;
        root.querySelectorAll('[data-i18n]').forEach(function (el) { el.innerHTML = tr(el.getAttribute('data-i18n')); });
        ATTRS.forEach(function (a) {
            root.querySelectorAll('[data-i18n-' + a + ']').forEach(function (el) {
                el.setAttribute(a, tr(el.getAttribute('data-i18n-' + a)));
            });
        });
    }

    // Enlace del selector de idioma (si existe): lleva a la otra versión.
    function wireSwitcher() {
        var a = document.getElementById('langSwitch');
        if (!a) return;
        var other = lang === 'en' ? 'es' : 'en';
        a.textContent = other.toUpperCase();
        a.href = other === 'en' ? '/en/' : '/';
        a.title = other === 'en' ? 'English version' : 'Versión en español';
        a.setAttribute('hreflang', other);
    }

    document.documentElement.lang = lang;
    window.I18N = { lang: lang, supported: SUPPORTED, tr: tr, apply: apply };
    window.tr = tr;
    apply(document);
    wireSwitcher();
})();
