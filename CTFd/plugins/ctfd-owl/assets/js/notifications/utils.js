(function () {
    "use strict";

    window.owlToasts = window.owlToasts || {};

    function toStringSafe(value) {
        if (value === null || value === undefined) return "";
        return String(value);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function inferVariantFromTitle(title) {
        const t = String(title || "").toLowerCase();
        if (t.includes("error") || t.includes("fail")) return "danger";
        if (t.includes("success")) return "success";
        if (t.includes("warn")) return "warning";
        return "info";
    }

    function applyBootstrapVariantClasses(el, variant) {
        // BS5: text-bg-*
        el.classList.add(`text-bg-${variant}`);
        // BS4 fallback: bg-* + text colors
        el.classList.add(`bg-${variant}`);
        if (variant === "warning" || variant === "info") {
            el.classList.add("text-dark");
        } else {
            el.classList.add("text-white");
        }
    }

    window.owlToasts.utils = {
        toStringSafe,
        escapeHtml,
        inferVariantFromTitle,
        applyBootstrapVariantClasses,
    };
})();
