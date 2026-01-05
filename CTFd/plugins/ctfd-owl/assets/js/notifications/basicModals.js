(function () {
    "use strict";

    window.owlToasts = window.owlToasts || {};

    function getTransitionMs(el) {
        try {
            const style = window.getComputedStyle(el);
            const durations = (style.transitionDuration || "").split(",");
            const delays = (style.transitionDelay || "").split(",");
            const toMs = (s) => {
                const v = String(s || "").trim();
                if (!v) return 0;
                if (v.endsWith("ms")) return parseFloat(v);
                if (v.endsWith("s")) return parseFloat(v) * 1000;
                const n = parseFloat(v);
                return Number.isFinite(n) ? n : 0;
            };
            const maxDur = Math.max(...durations.map(toMs), 0);
            const maxDelay = Math.max(...delays.map(toMs), 0);
            return maxDur + maxDelay;
        } catch (_e) {
            return 0;
        }
    }

    function showModal({ title, body, variant, delayMs, buttonText } = {}) {
        const utils = window.owlToasts.utils || {};
        const toStringSafe = typeof utils.toStringSafe === "function" ? utils.toStringSafe : (v) => String(v ?? "");
        const applyBootstrapVariantClasses =
            typeof utils.applyBootstrapVariantClasses === "function" ? utils.applyBootstrapVariantClasses : null;

        if (!document || !document.body) {
            try {
                window.alert(`${toStringSafe(title || "Info")}\n\n${toStringSafe(body || "")}`);
            } catch (_e) {
                // ignore
            }
            return Promise.resolve();
        }

        // Backdrop
        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop fade";

        // Modal
        const modalEl = document.createElement("div");
        modalEl.className = "modal fade";
        modalEl.style.display = "block";
        modalEl.setAttribute("role", "dialog");
        modalEl.setAttribute("aria-modal", "true");

        const dialog = document.createElement("div");
        // Top-positioned modal (not vertically centered)
        dialog.className = "modal-dialog mt-3";

        const content = document.createElement("div");
        content.className = "modal-content";

        const header = document.createElement("div");
        header.className = "modal-header";

        const titleEl = document.createElement("h5");
        titleEl.className = "modal-title";
        titleEl.textContent = toStringSafe(title || "Info");

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Close");

        // Avoid duplicated close icons across Bootstrap versions:
        // - BS5: .btn-close is rendered via CSS background-image, so innerHTML would show a second (big) ×.
        // - BS4: .close expects an inner × element.
        let isBootstrap5 = false;
        try {
            isBootstrap5 = !!String(
                window.getComputedStyle(document.documentElement).getPropertyValue("--bs-body-color")
            ).trim();
        } catch (_e) {
            isBootstrap5 = false;
        }

        if (isBootstrap5) {
            closeBtn.className = "btn-close";
        } else {
            closeBtn.className = "close";
            closeBtn.innerHTML = '<span aria-hidden="true">&times;</span>';
        }

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        if (applyBootstrapVariantClasses && variant) {
            try {
                applyBootstrapVariantClasses(header, variant);
            } catch (_e) {
                // ignore
            }
        }

        const bodyEl = document.createElement("div");
        bodyEl.className = "modal-body";
        bodyEl.style.whiteSpace = "pre-wrap";
        bodyEl.textContent = toStringSafe(body || "");

        const footer = document.createElement("div");
        footer.className = "modal-footer";

        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.className = "btn btn-primary";
        okBtn.textContent = toStringSafe(buttonText || "OK");

        footer.appendChild(okBtn);

        content.appendChild(header);
        content.appendChild(bodyEl);
        content.appendChild(footer);
        dialog.appendChild(content);
        modalEl.appendChild(dialog);

        document.body.appendChild(backdrop);
        document.body.appendChild(modalEl);
        document.body.classList.add("modal-open");

        // Trigger Bootstrap-like fade-in
        try {
            // Force a reflow then add "show" on next frame.
            // eslint-disable-next-line no-unused-expressions
            modalEl.offsetHeight;
            requestAnimationFrame(() => {
                backdrop.classList.add("show");
                modalEl.classList.add("show");
            });
        } catch (_e) {
            backdrop.classList.add("show");
            modalEl.classList.add("show");
        }

        return new Promise((resolve) => {
            let done = false;
            let timeoutId = null;

            const onOverlayClick = (e) => {
                // Close when clicking outside the dialog/content area.
                if (e && e.target === modalEl) {
                    cleanup();
                }
            };

            const onKeyDown = (e) => {
                if (e.key === "Escape") {
                    cleanup();
                }
            };

            const cleanup = () => {
                if (done) return;
                done = true;

                if (timeoutId !== null) {
                    window.clearTimeout(timeoutId);
                    timeoutId = null;
                }

                try {
                    document.removeEventListener("keydown", onKeyDown);
                } catch (_e) {
                    // ignore
                }

                // Animate hide
                try {
                    modalEl.classList.remove("show");
                    backdrop.classList.remove("show");
                } catch (_e) {
                    // ignore
                }

                const modalMs = getTransitionMs(modalEl);
                const backdropMs = getTransitionMs(backdrop);
                const waitMs = Math.max(modalMs, backdropMs, 0);

                const finish = () => {
                    document.body.classList.remove("modal-open");
                    modalEl.remove();
                    backdrop.remove();
                    resolve();
                };

                if (waitMs > 0) {
                    window.setTimeout(finish, waitMs);
                } else {
                    finish();
                }
            };

            okBtn.addEventListener("click", cleanup);
            closeBtn.addEventListener("click", cleanup);
            backdrop.addEventListener("click", cleanup);
            modalEl.addEventListener("click", onOverlayClick);
            document.addEventListener("keydown", onKeyDown);

            if (typeof delayMs === "number" && Number.isFinite(delayMs) && delayMs > 0) {
                timeoutId = window.setTimeout(cleanup, delayMs);
            }
        });
    }

    window.owlToasts.adapters = window.owlToasts.adapters || {};
    window.owlToasts.adapters.basicModals = {
        showModal,
    };
})();
