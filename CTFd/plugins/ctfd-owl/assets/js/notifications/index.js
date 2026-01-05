(function () {
    "use strict";

    window.owlToasts = window.owlToasts || {};

    const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
        notifications_mode: "toast",
        toast_strategy: "auto",
    });

    const ENTRYPOINT_SRC = (() => {
        try {
            const src = document.currentScript && document.currentScript.src;
            return src || "";
        } catch (_e) {
            return "";
        }
    })();

    function getBaseUrl() {
        // Preferred: resolve relative to the currently executing script.
        try {
            const src = document.currentScript && document.currentScript.src;
            if (src) {
                return new URL("./", src).toString().replace(/\/$/, "");
            }
        } catch (_e) {
            // ignore
        }

        // Fallback: derive from CTFd urlRoot
        const urlRoot =
            window.CTFd && window.CTFd.config && typeof window.CTFd.config.urlRoot === "string"
                ? window.CTFd.config.urlRoot
                : "";
        return `${urlRoot}/plugins/ctfd-owl/assets/js/notifications`;
    }

    function getNotificationSettingsUrl() {
        // Best-effort: compute from the entrypoint src so it works without CTFd.config.urlRoot.
        try {
            if (ENTRYPOINT_SRC) {
                // /plugins/ctfd-owl/assets/js/notifications/index.js -> ../../../notifications/settings
                return new URL("../../../notifications/settings", ENTRYPOINT_SRC).toString();
            }
        } catch (_e) {
            // ignore
        }

        // Fallback: use urlRoot (works in most frontend contexts)
        const urlRoot = getUrlRoot();
        return `${urlRoot}/plugins/ctfd-owl/notifications/settings`;
    }

    function loadScript(url) {
        return new Promise((resolve) => {
            try {
                // Avoid duplicate loads when multiple callers race.
                const existing = document.querySelector(`script[src="${url}"]`);
                if (existing) {
                    resolve(true);
                    return;
                }

                const script = document.createElement("script");
                script.src = url;
                script.defer = true;
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            } catch (_e) {
                resolve(false);
            }
        });
    }

    function getUrlRoot() {
        return window.CTFd && window.CTFd.config && typeof window.CTFd.config.urlRoot === "string"
            ? window.CTFd.config.urlRoot
            : "";
    }

    function ensureNotificationSettingsLoaded() {
        if (ensureNotificationSettingsLoaded._promise) {
            return ensureNotificationSettingsLoaded._promise;
        }

        // If settings are already injected/set, respect them.
        if (window.owlToasts && window.owlToasts.settings) {
            ensureNotificationSettingsLoaded._promise = Promise.resolve(window.owlToasts.settings);
            return ensureNotificationSettingsLoaded._promise;
        }

        const url = getNotificationSettingsUrl();

        ensureNotificationSettingsLoaded._promise = fetch(url, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
            },
        })
            .then((res) => (res && res.ok ? res.json() : null))
            .then((data) => {
                const notifications_mode =
                    data && typeof data.notifications_mode === "string"
                        ? data.notifications_mode
                        : DEFAULT_NOTIFICATION_SETTINGS.notifications_mode;
                const toast_strategy =
                    data && typeof data.toast_strategy === "string"
                        ? data.toast_strategy
                        : DEFAULT_NOTIFICATION_SETTINGS.toast_strategy;
                window.owlToasts.settings = { notifications_mode, toast_strategy };
                return window.owlToasts.settings;
            })
            .catch(() => {
                window.owlToasts.settings = { ...DEFAULT_NOTIFICATION_SETTINGS };
                return window.owlToasts.settings;
            });

        return ensureNotificationSettingsLoaded._promise;
    }

    function ensureDepsLoaded() {
        if (ensureDepsLoaded._promise) {
            return ensureDepsLoaded._promise;
        }

        const adapters = window.owlToasts.adapters || {};
        const ready =
            !!window.owlToasts.utils &&
            !!window.owlToasts.fallback &&
            !!adapters.bootstrapToasts &&
            !!adapters.basicToasts &&
            !!adapters.notifyToasts &&
            !!adapters.basicModals;

        if (ready) {
            ensureDepsLoaded._promise = Promise.resolve(true);
            return ensureDepsLoaded._promise;
        }

        const base = getBaseUrl();
        const utilsUrl = `${base}/utils.js`;
        const fallbackUrl = `${base}/fallback.js`;

        const remaining = [
            `${base}/bootstrapToasts.js`,
            `${base}/basicToasts.js`,
            `${base}/notifyToasts.js`,
            `${base}/basicModals.js`,
        ];

        ensureDepsLoaded._promise = loadScript(utilsUrl)
            .then(() => loadScript(fallbackUrl))
            .then(() => Promise.all(remaining.map((u) => loadScript(u))))
            .then(() => true)
            .catch(() => false);

        return ensureDepsLoaded._promise;
    }

    function prewarm() {
        try {
            ensureDepsLoaded();
            ensureNotificationSettingsLoaded();
        } catch (_e) {
            // ignore
        }
    }

    function getToastStrategy(options) {
        const explicit = options && typeof options.strategy === "string" ? options.strategy : null;
        if (explicit) return explicit;

        const s =
            window.owlToasts && window.owlToasts.settings && typeof window.owlToasts.settings.toast_strategy === "string"
                ? window.owlToasts.settings.toast_strategy
                : DEFAULT_NOTIFICATION_SETTINGS.toast_strategy;
        return s;
    }

    function showToastInternal({ title = "Info", body = "", variant, delay, strategy } = {}) {
        const utils = window.owlToasts.utils || {};
        const fallback = window.owlToasts.fallback || {};
        const adapters = window.owlToasts.adapters || {};

        const { toStringSafe, inferVariantFromTitle } = utils;
        const { showFallbackDomToast } = fallback;
        const { showToast } = adapters.basicToasts || {};
        const { showNotifyToast } = adapters.notifyToasts || {};
        const { showBootstrapToast } = adapters.bootstrapToasts || {};

        if (typeof toStringSafe !== "function" || typeof inferVariantFromTitle !== "function") {
            try {
                window.alert(`${String(title || "Info")}\n\n${String(body || "")}`);
            } catch (_e) {
                // ignore
            }
            return Promise.resolve();
        }

        const safeTitle = toStringSafe(title);
        const safeBody = toStringSafe(body);
        const resolvedVariant = variant || inferVariantFromTitle(safeTitle);

        const defaultDelay = resolvedVariant === "danger" ? 12000 : 8000;
        const resolvedDelay = typeof delay === "number" ? delay : defaultDelay;

        const resolvedStrategy = getToastStrategy({ strategy });

        const order =
            resolvedStrategy === "basicToasts"
                ? ["basicToasts"]
                : resolvedStrategy === "notifyToasts"
                ? ["notifyToasts"]
                : resolvedStrategy === "bootstrapToasts"
                ? ["bootstrapToasts"]
                : ["basicToasts", "notifyToasts", "bootstrapToasts"];

        for (const item of order) {
            if (item === "basicToasts") {
                try {
                    if (typeof showToast === "function") {
                        const themeResult = showToast({
                            title: safeTitle,
                            body: safeBody,
                            variant: resolvedVariant,
                            delayMs: resolvedDelay,
                        });
                        if (themeResult) return themeResult;
                    }
                } catch (_e) {
                    // fall through
                }
            }

            if (item === "notifyToasts") {
                try {
                    if (typeof showNotifyToast === "function") {
                        const notifyResult = showNotifyToast({
                            title: safeTitle,
                            body: safeBody,
                            variant: resolvedVariant,
                            delayMs: resolvedDelay,
                        });
                        if (notifyResult) return notifyResult;
                    }
                } catch (_e) {
                    // fall through
                }
            }

            if (item === "bootstrapToasts") {
                try {
                    if (typeof showBootstrapToast === "function") {
                        const bootstrapResult = showBootstrapToast({
                            title: safeTitle,
                            body: safeBody,
                            variant: resolvedVariant,
                            delayMs: resolvedDelay,
                        });
                        if (bootstrapResult) return bootstrapResult;
                    }
                } catch (_e) {
                    // fall through
                }
            }
        }

        // 4) DOM fallback
        if (typeof showFallbackDomToast === "function") {
            return showFallbackDomToast({
                title: safeTitle,
                body: safeBody,
                variant: resolvedVariant,
                delayMs: resolvedDelay,
            });
        }

        try {
            window.alert(`${safeTitle}\n\n${safeBody}`);
        } catch (_e) {
            // ignore
        }
        return Promise.resolve();
    }

    function showModalInternal({ title = "Info", body = "", variant, delay, buttonText } = {}) {
        const adapters = window.owlToasts.adapters || {};
        const { showModal } = adapters.basicModals || {};

        const delayMs = typeof delay === "number" ? delay : undefined;

        try {
            if (typeof showModal === "function") {
                const modalResult = showModal({
                    title,
                    body,
                    variant,
                    delayMs,
                    buttonText,
                });
                if (modalResult) return modalResult;
            }
        } catch (_e) {
            // fall back
        }

        return showToastInternal({ title, body, variant, delay });
    }

    window.owlShowToast = function owlShowToast(options = {}) {
        return Promise.all([ensureDepsLoaded(), ensureNotificationSettingsLoaded()]).then(() => showToastInternal(options));
    };

    window.owlShowModal = function owlShowModal({
        title = "Info",
        body = "",
        buttonText: _buttonText,
        buttonClass: _buttonClass,
        variant,
        delay,
    } = {}) {
        return Promise.all([ensureDepsLoaded(), ensureNotificationSettingsLoaded()]).then(() => {
            const notificationsMode =
                window.owlToasts &&
                window.owlToasts.settings &&
                typeof window.owlToasts.settings.notifications_mode === "string"
                    ? window.owlToasts.settings.notifications_mode
                    : DEFAULT_NOTIFICATION_SETTINGS.notifications_mode;

            if (notificationsMode === "modal") {
                return showModalInternal({ title, body, variant, delay, buttonText: _buttonText });
            }
            return showToastInternal({ title, body, variant, delay });
        });
    };

    prewarm();
})();
