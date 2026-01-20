(function () {
    "use strict";

    window.owlToasts = window.owlToasts || {};

    const { applyBootstrapVariantClasses } = window.owlToasts.utils || {};

    function showNotifyToast({ title, body, variant, delayMs }) {
        const $ = window.$;
        if (typeof $ !== "function" || typeof $.fn?.toast !== "function") {
            return null;
        }
        if (typeof applyBootstrapVariantClasses !== "function") {
            return null;
        }

        const containerId = "ezq--notifications-toast-container";
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement("div");
            container.id = containerId;
            container.style.position = "fixed";
            container.style.bottom = "0";
            container.style.right = "0";
            container.style.minWidth = "20%";
            container.style.zIndex = "1090";
            document.body.appendChild(container);
        }

        const toastEl = document.createElement("div");
        toastEl.className = "toast m-3 fade";
        toastEl.setAttribute("role", "alert");
        toastEl.setAttribute("aria-live", "assertive");
        toastEl.setAttribute("aria-atomic", "true");

        toastEl.classList.add("border-0");
        applyBootstrapVariantClasses(toastEl, variant);

        const header = document.createElement("div");
        header.className = "toast-header";
        header.classList.add("border-0");
        applyBootstrapVariantClasses(header, variant);

        const strong = document.createElement("strong");
        strong.className = "mr-auto";
        strong.textContent = title;

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "ml-2 mb-1 close";
        closeBtn.setAttribute("data-dismiss", "toast");
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.innerHTML = '<span aria-hidden="true">&times;</span>';

        header.appendChild(strong);
        header.appendChild(closeBtn);

        const bodyEl = document.createElement("div");
        bodyEl.className = "toast-body";
        bodyEl.style.whiteSpace = "pre-wrap";
        bodyEl.textContent = body;

        toastEl.appendChild(header);
        toastEl.appendChild(bodyEl);

        // Newest first (matches core/ezq ordering)
        container.prepend(toastEl);

        return new Promise((resolve) => {
            const $toast = $(toastEl);
            $toast.on("hidden.bs.toast", function () {
                $toast.off("hidden.bs.toast");
                toastEl.remove();
                resolve();
            });

            $toast.toast({
                autohide: true,
                delay: delayMs,
                animation: true,
            });
            $toast.toast("show");
        });
    }

    window.owlToasts.adapters = window.owlToasts.adapters || {};
    window.owlToasts.adapters.notifyToasts = {
        showNotifyToast,
    };
})();
