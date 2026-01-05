(function () {
    "use strict";

    window.owlToasts = window.owlToasts || {};

    const { applyBootstrapVariantClasses } = window.owlToasts.utils || {};

    function getOrCreateFallbackContainer() {
        let container = document.getElementById("owl-toast-container");
        if (container) return container;

        container = document.createElement("div");
        container.id = "owl-toast-container";

        container.className = "toast-container";
        container.style.position = "fixed";
        container.style.right = "1rem";
        container.style.bottom = "1rem";
        container.style.zIndex = "1090";
        document.body.appendChild(container);
        return container;
    }

    function showFallbackDomToast({ title, body, variant, delayMs }) {
        if (!document || !document.body || typeof applyBootstrapVariantClasses !== "function") {
            try {
                window.alert(`${String(title || "Info")}\n\n${String(body || "")}`);
            } catch (_e) {
                // ignore
            }
            return Promise.resolve();
        }

        const container = getOrCreateFallbackContainer();
        const toastEl = document.createElement("div");
        toastEl.className = "toast border-0 shadow rounded mb-2";
        applyBootstrapVariantClasses(toastEl, variant);
        toastEl.setAttribute("role", "alert");
        toastEl.setAttribute("aria-live", "assertive");
        toastEl.setAttribute("aria-atomic", "true");

        const header = document.createElement("div");
        header.className = "toast-header border-0";
        applyBootstrapVariantClasses(header, variant);

        const strong = document.createElement("strong");
        strong.className = "me-auto";
        strong.textContent = title;

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Close");

        // Avoid duplicated close icons across Bootstrap versions:
        // - BS5: .btn-close is rendered via CSS background-image, so text content shows as a second ×.
        // - BS4: .close expects an inner ×.
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
            closeBtn.innerHTML = "&times;";
        }

        header.appendChild(strong);
        header.appendChild(closeBtn);

        const bodyEl = document.createElement("div");
        bodyEl.className = "toast-body";
        bodyEl.style.whiteSpace = "pre-wrap";
        bodyEl.textContent = body;

        toastEl.appendChild(header);
        toastEl.appendChild(bodyEl);
        container.appendChild(toastEl);

        // Bootstrap CSS expects .show to display; transitions are CSS-driven.
        toastEl.classList.add("show");

        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                toastEl.remove();
                resolve();
            };

            const hide = () => {
                toastEl.classList.remove("show");
                const timeout = setTimeout(finish, 200);
                toastEl.addEventListener(
                    "transitionend",
                    () => {
                        clearTimeout(timeout);
                        finish();
                    },
                    { once: true }
                );
            };

            closeBtn.addEventListener("click", hide);
            if (delayMs > 0) {
                setTimeout(hide, delayMs);
            }
        });
    }

    window.owlToasts.fallback = {
        getOrCreateFallbackContainer,
        showFallbackDomToast,
    };
})();
