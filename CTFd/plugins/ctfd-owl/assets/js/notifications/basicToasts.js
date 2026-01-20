(function () {
    "use strict";

    window.owlToasts = window.owlToasts || {};

    const { escapeHtml } = window.owlToasts.utils || {};

    function showToast({ title, body, variant, delayMs }) {
        const eventToast = window.CTFd?._functions?.events?.eventToast;
        const themeToastEl = document.querySelector("[x-ref='toast']");
        if (typeof eventToast !== "function" || !themeToastEl) {
            return null;
        }
        if (typeof escapeHtml !== "function") {
            return null;
        }

        // Configure theme toast element before showing
        themeToastEl.setAttribute("data-bs-delay", String(delayMs));
        themeToastEl.setAttribute("data-bs-autohide", "true");
        themeToastEl.classList.remove(
            "text-bg-success",
            "text-bg-danger",
            "text-bg-info",
            "text-bg-warning",
            "border-0",
            "shadow"
        );
        themeToastEl.classList.add(`text-bg-${variant}`, "border-0", "shadow");

        const themeHeaderEl = themeToastEl.querySelector(".toast-header");
        if (themeHeaderEl) {
            themeHeaderEl.classList.remove(
                "text-bg-success",
                "text-bg-danger",
                "text-bg-info",
                "text-bg-warning",
                "border-0"
            );
            themeHeaderEl.classList.add(`text-bg-${variant}`, "border-0");
        }

        eventToast({
            id: Date.now(),
            type: "toast",
            title,
            html: escapeHtml(body).replace(/\n/g, "<br>"),
        });
        return Promise.resolve();
    }

    window.owlToasts.adapters = window.owlToasts.adapters || {};
    window.owlToasts.adapters.basicToasts = {
        showToast,
    };
})();
