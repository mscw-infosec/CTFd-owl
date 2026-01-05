(function () {
    "use strict";

    window.owlToasts = window.owlToasts || {};

    const { applyBootstrapVariantClasses } = window.owlToasts.utils || {};
    const { getOrCreateFallbackContainer } = window.owlToasts.fallback || {};

    function showBootstrapToast({ title, body, variant, delayMs }) {
        if (typeof window.bootstrap?.Toast !== "function") {
            return null;
        }
        if (typeof getOrCreateFallbackContainer !== "function") {
            return null;
        }
        if (typeof applyBootstrapVariantClasses !== "function") {
            return null;
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
        closeBtn.setAttribute("data-bs-dismiss", "toast");
        closeBtn.setAttribute("data-dismiss", "toast");
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

        const toast = new window.bootstrap.Toast(toastEl, {
            autohide: true,
            delay: delayMs,
        });

        return new Promise((resolve) => {
            toastEl.addEventListener(
                "hidden.bs.toast",
                () => {
                    try {
                        toast.dispose();
                    } catch (_e) {
                        // ignore
                    }
                    toastEl.remove();
                    resolve();
                },
                { once: true }
            );
            toast.show();
        });
    }

    window.owlToasts.adapters = window.owlToasts.adapters || {};
    window.owlToasts.adapters.bootstrapToasts = {
        showBootstrapToast,
    };
})();
