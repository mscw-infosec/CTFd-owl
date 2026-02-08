(function () {
    "use strict";

    function shouldShowOnThisPage() {
        try {
            const p = String(window.location && window.location.pathname ? window.location.pathname : "");
            return p.includes("/challenges");
        } catch (_e) {
            return false;
        }
    }

    function getUrlRoot() {
        try {
            if (window.CTFd && CTFd.config && typeof CTFd.config.urlRoot === "string") return CTFd.config.urlRoot;
        } catch (_e) {
            // ignore
        }
        return "";
    }

    function getCsrfNonce() {
        try {
            if (window.CTFd && CTFd.config && CTFd.config.csrfNonce) return CTFd.config.csrfNonce;
        } catch (_e) {
            // ignore
        }
        try {
            if (window.init && window.init.csrfNonce) return window.init.csrfNonce;
        } catch (_e) {
            // ignore
        }
        return null;
    }

    async function ctfdFetch(url, options) {
        try {
            if (window.CTFd && typeof CTFd.fetch === "function") {
                return await CTFd.fetch(url, options);
            }
        } catch (_e) {
            // ignore
        }

        const headers = Object.assign({}, (options && options.headers) || {});
        const nonce = getCsrfNonce();
        if (nonce) {
            headers["CSRF-Token"] = nonce;
            headers["X-CSRFToken"] = nonce;
            headers["X-CSRF-Token"] = nonce;
        }
        return await fetch(url, Object.assign({}, options || {}, { headers, credentials: "same-origin" }));
    }

    async function fetchUiSettings() {
        try {
            const res = await ctfdFetch("/plugins/ctfd-owl/ui/settings", {
                method: "GET",
                credentials: "same-origin",
                headers: { Accept: "application/json" },
            });
            return await res.json();
        } catch (_e) {
            return null;
        }
    }

    let uiSettingsPromise = null;
    function getUiSettings() {
        if (!uiSettingsPromise) {
            uiSettingsPromise = fetchUiSettings();
        }
        return uiSettingsPromise;
    }

    async function fetchInstances() {
        const res = await ctfdFetch("/plugins/ctfd-owl/instances", {
            method: "GET",
            credentials: "same-origin",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
        });
        return await res.json();
    }

    async function renewInstance(challenge_id, owner_user_id) {
        const target = `/plugins/ctfd-owl/container?challenge_id=${encodeURIComponent(challenge_id)}&owner_user_id=${encodeURIComponent(owner_user_id)}`;
        const res = await ctfdFetch(target, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        return await res.json();
    }

    async function destroyInstance(challenge_id, owner_user_id) {
        const target = `/plugins/ctfd-owl/container?challenge_id=${encodeURIComponent(challenge_id)}&owner_user_id=${encodeURIComponent(owner_user_id)}`;
        const res = await ctfdFetch(target, {
            method: "DELETE",
            credentials: "same-origin",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        return await res.json();
    }

    // Deduplicate /instances calls (click handler + modal fallbacks can otherwise overlap).
    let instancesInFlight = null;
    let lastInstancesData = null;
    let lastInstancesAtMs = 0;
    const INSTANCES_CACHE_MS = 1500;

    async function getInstances(options) {
        const force = options && options.force === true;
        const now = Date.now();

        if (!force && lastInstancesData && now - lastInstancesAtMs < INSTANCES_CACHE_MS) {
            return lastInstancesData;
        }
        if (instancesInFlight) {
            return instancesInFlight;
        }

        instancesInFlight = (async () => {
            const data = await fetchInstances();
            lastInstancesData = data;
            lastInstancesAtMs = Date.now();
            return data;
        })().finally(() => {
            instancesInFlight = null;
        });

        return instancesInFlight;
    }

    function showModalById(id) {
        const el = document.getElementById(id);
        if (!el) return false;

        // Bootstrap 5 (no jQuery plugin)
        try {
            if (window.bootstrap && window.bootstrap.Modal) {
                const inst = window.bootstrap.Modal.getOrCreateInstance(el);
                inst.show();
                return true;
            }
        } catch (_e) {
            // ignore
        }

        // Bootstrap 4 (jQuery plugin)
        try {
            if (window.CTFd && CTFd.lib && typeof CTFd.lib.$ === "function") {
                const $ = CTFd.lib.$;
                if ($.fn && typeof $.fn.modal === "function") {
                    $(el).modal("show");
                    return true;
                }
            }
        } catch (_e) {
            // ignore
        }

        // Fallback (core-beta sometimes ships Bootstrap without exposing `window.bootstrap` and without jQuery plugin).
        try {
            manualShowModal(el);
            return true;
        } catch (_e) {
            // ignore
        }

        return false;
    }

    function canProgrammaticallyShowBootstrapModal() {
        try {
            if (window.bootstrap && window.bootstrap.Modal) return true;
        } catch (_e) {
            // ignore
        }
        try {
            if (window.CTFd && CTFd.lib && typeof CTFd.lib.$ === "function") {
                const $ = CTFd.lib.$;
                if ($.fn && typeof $.fn.modal === "function") return true;
            }
        } catch (_e) {
            // ignore
        }
        return false;
    }

    function hideModalById(id) {
        const el = document.getElementById(id);
        if (!el) return false;

        // Bootstrap 5 (no jQuery plugin)
        try {
            if (window.bootstrap && window.bootstrap.Modal) {
                const inst = window.bootstrap.Modal.getOrCreateInstance(el);
                inst.hide();
                return true;
            }
        } catch (_e) {
            // ignore
        }

        // Bootstrap 4 (jQuery plugin)
        try {
            if (window.CTFd && CTFd.lib && typeof CTFd.lib.$ === "function") {
                const $ = CTFd.lib.$;
                if ($.fn && typeof $.fn.modal === "function") {
                    $(el).modal("hide");
                    return true;
                }
            }
        } catch (_e) {
            // ignore
        }

        try {
            const dismiss = el.querySelector('[data-bs-dismiss="modal"], [data-dismiss="modal"]');
            if (dismiss && typeof dismiss.click === "function") {
                dismiss.click();
                return true;
            }
        } catch (_e) {
            // ignore
        }

        // Fallback
        try {
            manualHideModal(el);
            return true;
        } catch (_e) {
            // ignore
        }

        return false;
    }

    function ensureManualModalHandlers(modalEl) {
        if (!modalEl || modalEl.__owlManualModalBound) return;
        modalEl.__owlManualModalBound = true;

        modalEl.addEventListener("click", (e) => {
            const t = e.target;
            if (!t) return;
            // Backdrop click
            if (t === modalEl) {
                manualHideModal(modalEl);
                return;
            }
            // Close buttons
            const closeBtn = t.closest && t.closest('[data-dismiss="modal"], [data-bs-dismiss="modal"], .btn-close, .close');
            if (closeBtn) {
                manualHideModal(modalEl);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                if (modalEl.classList.contains("show")) {
                    manualHideModal(modalEl);
                }
            }
        });
    }

    function getBackdropEl(modalEl) {
        if (!modalEl) return null;
        const id = `${modalEl.id}-backdrop`;
        return document.getElementById(id);
    }

    function manualShowModal(modalEl) {
        ensureManualModalHandlers(modalEl);

        // Backdrop
        let backdrop = getBackdropEl(modalEl);
        if (!backdrop) {
            backdrop = document.createElement("div");
            backdrop.id = `${modalEl.id}-backdrop`;
            backdrop.className = "modal-backdrop fade show";
            document.body.appendChild(backdrop);
        }

        document.body.classList.add("modal-open");
        modalEl.style.display = "block";
        modalEl.removeAttribute("aria-hidden");
        modalEl.setAttribute("aria-modal", "true");
        modalEl.setAttribute("role", modalEl.getAttribute("role") || "dialog");
        modalEl.classList.add("show");

        // Best-effort focus
        try {
            const focusable = modalEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable && typeof focusable.focus === "function") focusable.focus();
        } catch (_e) {
            // ignore
        }
    }

    function manualHideModal(modalEl) {
        const backdrop = getBackdropEl(modalEl);
        if (backdrop && backdrop.parentNode) {
            backdrop.parentNode.removeChild(backdrop);
        }

        modalEl.classList.remove("show");
        modalEl.style.display = "none";
        modalEl.setAttribute("aria-hidden", "true");
        modalEl.removeAttribute("aria-modal");
        document.body.classList.remove("modal-open");
    }

    function ensureCssLoaded() {
        const id = "owl-instances-css";
        if (document.getElementById(id)) return;

        const urlRoot = getUrlRoot();
        const href = `${urlRoot}/plugins/ctfd-owl/assets/css/instances.css`;

        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
    }

    async function ensureDomLoaded() {
        if (document.getElementById("owl-instances-fab") && document.getElementById("owl-instances-modal")) {
            return;
        }

        ensureCssLoaded();

        // Load UI skeleton from static HTML asset.
        const urlRoot = getUrlRoot();
        const url = `${urlRoot}/plugins/ctfd-owl/assets/html/instances.html`;

        let text = null;
        try {
            const res = await ctfdFetch(url, { method: "GET", credentials: "same-origin" });
            if (res && res.ok) {
                text = await res.text();
            }
        } catch (_e) {
            text = null;
        }

        if (!text) {
            // Minimal fallback (no big HTML strings).
            const btn = document.createElement("button");
            btn.id = "owl-instances-fab";
            btn.type = "button";
            btn.title = "Instances";
            btn.setAttribute("aria-label", "Instances");
            btn.setAttribute("data-bs-toggle", "modal");
            btn.setAttribute("data-bs-target", "#owl-instances-modal");
            btn.setAttribute("data-toggle", "modal");
            btn.setAttribute("data-target", "#owl-instances-modal");
            btn.style.display = "none";
            const span = document.createElement("span");
            span.setAttribute("aria-hidden", "true");
            span.textContent = "≡";
            btn.appendChild(span);
            document.body.appendChild(btn);

            const modal = document.createElement("div");
            modal.id = "owl-instances-modal";
            modal.className = "modal fade";
            modal.tabIndex = -1;
            modal.setAttribute("role", "dialog");

            const dialog = document.createElement("div");
            dialog.className = "modal-dialog modal-lg";
            dialog.setAttribute("role", "document");
            modal.appendChild(dialog);

            const content = document.createElement("div");
            content.className = "modal-content";
            dialog.appendChild(content);

            const header = document.createElement("div");
            header.className = "modal-header";
            content.appendChild(header);

            const title = document.createElement("h5");
            title.className = "modal-title";
            title.textContent = "Instances";
            header.appendChild(title);

            const close5 = document.createElement("button");
            close5.type = "button";
            close5.className = "btn-close";
            close5.setAttribute("data-bs-dismiss", "modal");
            close5.setAttribute("aria-label", "Close");
            header.appendChild(close5);

            const close4 = document.createElement("button");
            close4.type = "button";
            close4.className = "close";
            close4.setAttribute("data-dismiss", "modal");
            close4.setAttribute("aria-label", "Close");
            close4.style.display = "none";
            const close4Span = document.createElement("span");
            close4Span.setAttribute("aria-hidden", "true");
            close4Span.textContent = "×";
            close4.appendChild(close4Span);
            header.appendChild(close4);

            const bodyWrap = document.createElement("div");
            bodyWrap.className = "modal-body";
            content.appendChild(bodyWrap);

            const body = document.createElement("div");
            body.id = "owl-instances-modal-body";
            body.className = "text-muted";
            body.textContent = "Loading...";
            bodyWrap.appendChild(body);

            document.body.appendChild(modal);
            return;
        }

        try {
            const doc = new DOMParser().parseFromString(text, "text/html");
            const btn = doc.getElementById("owl-instances-fab");
            const modal = doc.getElementById("owl-instances-modal");
            if (btn && !document.getElementById("owl-instances-fab")) {
                document.body.appendChild(btn);
            }
            if (modal && !document.getElementById("owl-instances-modal")) {
                document.body.appendChild(modal);
            }
        } catch (_e) {
            // ignore
        }
    }

    function ensureFabModalToggles(btnEl, modalId) {
        if (!btnEl) return;
        const id = String(modalId || "");
        if (!id) return;

        try {
            btnEl.setAttribute("data-bs-toggle", btnEl.getAttribute("data-bs-toggle") || "modal");
            btnEl.setAttribute("data-bs-target", btnEl.getAttribute("data-bs-target") || `#${id}`);
            btnEl.setAttribute("data-toggle", btnEl.getAttribute("data-toggle") || "modal");
            btnEl.setAttribute("data-target", btnEl.getAttribute("data-target") || `#${id}`);
        } catch (_e) {
            // ignore
        }
    }

    function ensureSingleVisibleCloseButton(modalEl) {
        if (!modalEl) return;

        const btnClose = modalEl.querySelector(".modal-header .btn-close");
        const btnLegacy = modalEl.querySelector(".modal-header .close");
        if (!btnClose && !btnLegacy) return;

        // Decide based on whether `.btn-close` is actually styled (BS5).
        let btnCloseLooksStyled = false;
        try {
            if (btnClose) {
                const s = window.getComputedStyle(btnClose);
                const bg = String(s.backgroundImage || "");
                btnCloseLooksStyled = bg !== "none" && bg !== "";
            }
        } catch (_e) {
            btnCloseLooksStyled = false;
        }

        if (btnClose && btnLegacy) {
            if (btnCloseLooksStyled) {
                btnClose.style.removeProperty("display");
                btnLegacy.style.display = "none";
            } else {
                btnClose.style.display = "none";
                btnLegacy.style.removeProperty("display");
            }
        }
    }

    function computeServiceCommand(ip, fields, port) {
        const connType = fields.conntype || "";

        if (connType === "nc") {
            return { kind: "text", text: `nc ${ip} ${port}` };
        }
        if (connType === "telnet") {
            return { kind: "text", text: `telnet ${ip} ${port}` };
        }
        if (connType === "ssh") {
            const sshUser = fields.ssh_username && fields.ssh_username !== "" ? fields.ssh_username : "USERNAME";
            if (fields.ssh_key && fields.ssh_key !== "") {
                return { kind: "text", text: `ssh -i ${fields.ssh_key} ${sshUser}@${ip} -p ${port}` };
            }
            return { kind: "text", text: `ssh ${sshUser}@${ip} -p ${port}` };
        }

        const proto = connType === "https" ? "https" : "http";
        return { kind: "link", text: `${ip}:${port}`, href: `${proto}://${ip}:${port}` };
    }

    function renderServiceLineDom(ip, svc, index) {
        const labels = svc.labels || {};
        const fields = labels.fields || {};
        const connComment = fields.comment || "";
        const sshPassword = fields.ssh_password || "";
        const port = svc.port;
        const n = (typeof index === "number" ? index : 0) + 1;

        const wrap = document.createElement("div");
        wrap.className = "owl-service";

        const prefix = document.createElement("span");
        prefix.textContent = `${n}. `;
        wrap.appendChild(prefix);

        const connType = fields.conntype || "";
        if (connType) {
            const typeSpan = document.createElement("span");
            typeSpan.className = "text-muted";
            typeSpan.textContent = `(${connType}) `;
            wrap.appendChild(typeSpan);
        }

        const cmd = computeServiceCommand(ip, fields, port);
        if (cmd.kind === "link") {
            const a = document.createElement("a");
            a.href = cmd.href;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = cmd.text;
            wrap.appendChild(a);
        } else {
            const a = document.createElement("a");
            a.setAttribute("target", "_blank");
            a.setAttribute("whited", "");
            a.textContent = cmd.text;
            wrap.appendChild(a);
        }

        if (connComment) {
            const c = document.createElement("div");
            c.className = "text-muted";
            c.textContent = `(${connComment})`;
            wrap.appendChild(c);
        }

        if ((fields.conntype || "") === "ssh" && sshPassword) {
            const pass = document.createElement("div");
            pass.className = "text-muted";
            pass.appendChild(document.createTextNode("Password: "));
            const code = document.createElement("code");
            code.textContent = sshPassword;
            pass.appendChild(code);
            wrap.appendChild(pass);
        }

        return wrap;
    }

    function openChallengeFromMenu(challengeId, challengeName) {
        try {
            hideModalById("owl-instances-modal");
        } catch (_e) {
            // ignore
        }

        // First, best-effort open without navigation (works in core/pixo).
        try {
            const selectors = [
                `button.challenge-button[value="${challengeId}"]`,
                `button[value="${challengeId}"]`,
                `[data-challenge-id="${challengeId}"]`,
                `button[data-challenge-id="${challengeId}"]`,
            ];
            for (const sel of selectors) {
                const btn = document.querySelector(sel);
                if (btn && typeof btn.click === "function") {
                    btn.click();
                    return;
                }
            }
        } catch (_e) {
            // ignore
        }

        // Fallback: navigate to challenges with hash that CTFd uses to auto-open.
        const urlRoot = getUrlRoot();
        const safeName = String(challengeName || "");
        const hash = `${encodeURIComponent(safeName)}-${encodeURIComponent(String(challengeId))}`;
        window.location.href = `${urlRoot}/challenges#${hash}`;
    }

    function createInstanceCardDom(inst, ip) {
        const col = document.createElement("div");
        col.className = "col-12 col-lg-6 owl-instance-col";

        const card = document.createElement("div");
        card.className = "card h-100";
        col.appendChild(card);

        const body = document.createElement("div");
        body.className = "card-body d-flex flex-column";
        card.appendChild(body);

        const header = document.createElement("div");
        header.className = "d-flex justify-content-between align-items-start";
        body.appendChild(header);

        const left = document.createElement("div");
        header.appendChild(left);

        const titleLine = document.createElement("div");
        left.appendChild(titleLine);

        const chalLink = document.createElement("a");
        chalLink.href = "#";
        chalLink.className = "owl-open-challenge";
        chalLink.dataset.challengeId = String(inst.challenge_id);
        chalLink.dataset.challengeName = String(inst.challenge_name || "");
        const strong = document.createElement("strong");
        strong.textContent = String(inst.challenge_name || "");
        chalLink.appendChild(strong);
        titleLine.appendChild(chalLink);

        const ownerLine = document.createElement("div");
        ownerLine.className = "text-muted";
        ownerLine.appendChild(document.createTextNode("Launched by: "));
        const ownerA = document.createElement("a");
        ownerA.href = String(inst.owner_url || "#");
        ownerA.target = "_blank";
        ownerA.rel = "noopener noreferrer";
        ownerA.textContent = String(inst.owner_name || "");
        ownerLine.appendChild(ownerA);
        left.appendChild(ownerLine);

        const right = document.createElement("div");
        right.className = "text-muted";
        const remaining = parseInt(inst.remaining_time);
        const remainingText = isNaN(remaining) ? "?" : `${Math.max(0, remaining)}s`;
        right.appendChild(document.createTextNode("Remaining: "));
        const remSpan = document.createElement("span");
        remSpan.className = "owl-remaining";
        if (!isNaN(remaining)) remSpan.setAttribute("data-remaining", String(remaining));
        remSpan.textContent = remainingText;
        right.appendChild(remSpan);
        header.appendChild(right);

        body.appendChild(document.createElement("hr"));

        const servicesP = document.createElement("p");
        servicesP.className = "card-text";
        body.appendChild(servicesP);

        const svcs = Array.isArray(inst.services) ? inst.services : [];
        svcs.forEach((svc, idx) => {
            servicesP.appendChild(renderServiceLineDom(ip, svc, idx));
        });

        const actionsWrap = document.createElement("div");
        actionsWrap.className = "mt-auto d-flex justify-content-end owl-actions";
        body.appendChild(actionsWrap);

        const destroyBtn = document.createElement("button");
        destroyBtn.className = "btn btn-sm btn-danger";
        destroyBtn.textContent = "Destroy";
        destroyBtn.dataset.owlAction = "destroy";
        destroyBtn.dataset.challengeId = String(inst.challenge_id);
        destroyBtn.dataset.ownerUserId = String(inst.owner_user_id);
        actionsWrap.appendChild(destroyBtn);

        const renewBtn = document.createElement("button");
        renewBtn.className = "btn btn-sm btn-success";
        renewBtn.textContent = "Renew";
        renewBtn.dataset.owlAction = "renew";
        renewBtn.dataset.challengeId = String(inst.challenge_id);
        renewBtn.dataset.ownerUserId = String(inst.owner_user_id);
        actionsWrap.appendChild(renewBtn);

        return col;
    }

    function getModalBodyEl() {
        return document.getElementById("owl-instances-modal-body");
    }

    function setModalBodyContent(node) {
        const body = getModalBodyEl();
        if (!body) return;
        body.replaceChildren(node);
    }

    function setModalBodyText(text, className) {
        const div = document.createElement("div");
        if (className) div.className = className;
        div.textContent = text;
        setModalBodyContent(div);
    }

    let remainingIntervalId = null;
    function stopRemainingTicker() {
        if (remainingIntervalId !== null) {
            try {
                clearInterval(remainingIntervalId);
            } catch (_e) {
                // ignore
            }
            remainingIntervalId = null;
        }
    }

    async function refreshModal(options) {
        const force = options && options.force === true;
        setModalBodyText("Loading...", "text-muted");

        let data;
        try {
            data = await getInstances({ force });
        } catch (e) {
            setModalBodyText(`Failed to load instances: ${String(e)}`, "text-danger");
            return;
        }

        if (!data || data.success !== true) {
            setModalBodyText("Failed to load instances.", "text-danger");
            return;
        }

        const instances = Array.isArray(data.instances) ? data.instances : [];
        if (instances.length === 0) {
            setModalBodyText("No running instances.", "text-muted");
            return;
        }

        const frpIp = String(data.ip || "");
        const ip = frpIp || "<FRP_IP>";

        const grid = document.createElement("div");
        grid.className = "owl-instances-grid";

        const row = document.createElement("div");
        row.className = "row g-4";
        grid.appendChild(row);

        instances.forEach((inst) => {
            row.appendChild(createInstanceCardDom(inst, ip));
        });

        setModalBodyContent(grid);
        startRemainingTicker();
    }

    function startRemainingTicker() {
        stopRemainingTicker();
        let refreshed = false;

        const modal = document.getElementById("owl-instances-modal");
        if (!modal) return;

        remainingIntervalId = setInterval(async () => {
            try {
                const nodes = modal.querySelectorAll(".owl-remaining[data-remaining]");
                let shouldRefresh = false;
                nodes.forEach((n) => {
                    const raw = n.getAttribute("data-remaining");
                    const curr = parseInt(raw);
                    if (isNaN(curr)) return;
                    const next = curr - 1;
                    n.setAttribute("data-remaining", String(next));
                    n.textContent = `${Math.max(0, next)}s`;
                    if (next < 0) shouldRefresh = true;
                });

                if (shouldRefresh && !refreshed) {
                    refreshed = true;
                    stopRemainingTicker();
                    await refreshModal({ force: true });
                }
            } catch (_e) {
                // ignore
            }
        }, 1000);
    }

    function bindDelegatedHandlers() {
        const modal = document.getElementById("owl-instances-modal");
        if (!modal || modal.__owlBound) return;
        modal.__owlBound = true;

        ensureSingleVisibleCloseButton(modal);

        // Stop ticking when modal closes (Bootstrap 4/5 event name is the same).
        try {
            modal.addEventListener("hidden.bs.modal", stopRemainingTicker);
        } catch (_e) {
            // ignore
        }

        modal.addEventListener("click", async (evt) => {
            const target = evt.target;
            if (!(target instanceof Element)) return;

            const open = target.closest("a.owl-open-challenge");
            if (open) {
                evt.preventDefault();
                const cid = open.getAttribute("data-challenge-id") || open.dataset.challengeId;
                const name = open.getAttribute("data-challenge-name") || open.dataset.challengeName;
                openChallengeFromMenu(cid, name);
                return;
            }

            const btn = target.closest("button[data-owl-action]");
            if (btn) {
                const action = btn.getAttribute("data-owl-action") || btn.dataset.owlAction;
                const challengeId = btn.getAttribute("data-challenge-id") || btn.dataset.challengeId;
                const ownerUserId = btn.getAttribute("data-owner-user-id") || btn.dataset.ownerUserId;

                const originalText = btn.textContent;
                btn.setAttribute("disabled", "disabled");
                btn.textContent = "Working...";
                try {
                    const resp = action === "renew" ? await renewInstance(challengeId, ownerUserId) : await destroyInstance(challengeId, ownerUserId);
                    if (!resp || resp.success !== true) {
                        try {
                            console.warn("ctfd-owl: instance action failed", resp);
                        } catch (_e) {
                            // ignore
                        }
                    }
                } finally {
                    btn.removeAttribute("disabled");
                    btn.textContent = originalText;
                    await refreshModal({ force: true });
                }
            }
        });
    }

    async function ensureInstancesMenuDom() {
        await ensureDomLoaded();
        bindDelegatedHandlers();

        const btn = document.getElementById("owl-instances-fab");
        if (btn && !btn.__owlBound) {
            btn.__owlBound = true;
            ensureFabModalToggles(btn, "owl-instances-modal");

            // Let Bootstrap data-api handle showing the modal (smooth in BS5/core-beta).
            // We only refresh content on click.
            btn.addEventListener("click", function () {
                refreshModal();

                // If data-api didn't open the modal (some bundles disable it), fallback to programmatic show.
                try {
                    window.setTimeout(() => {
                        const modalEl = document.getElementById("owl-instances-modal");
                        if (!modalEl) return;
                        if (!modalEl.classList.contains("show") && canProgrammaticallyShowBootstrapModal()) {
                            showModalById("owl-instances-modal");
                        }
                    }, 120);
                } catch (_e) {
                    // ignore
                }
            });
        }

        // Expose for other scripts to reuse.
        window.owlEnsureInstancesMenu = async function () {
            const btn2 = document.getElementById("owl-instances-fab");
            const modal2 = document.getElementById("owl-instances-modal");
            if (btn2) btn2.style.display = "flex";

            ensureFabModalToggles(btn2, "owl-instances-modal");
            ensureSingleVisibleCloseButton(modal2);

            // Apply admin toggle asynchronously; hide only if explicitly disabled.
            try {
                const cfg = await getUiSettings();
                const raw = cfg ? cfg.instances_menu_enabled : undefined;
                const disabled = raw === false || raw === "false" || raw === 0 || raw === "0";
                if (disabled) {
                    if (btn2 && btn2.parentNode) btn2.parentNode.removeChild(btn2);
                    if (modal2 && modal2.parentNode) modal2.parentNode.removeChild(modal2);
                }
            } catch (_e) {
                // default enabled
            }
        };
    }

    async function init() {
        if (!shouldShowOnThisPage()) {
            return;
        }
        await ensureInstancesMenuDom();
        if (typeof window.owlEnsureInstancesMenu === "function") {
            await window.owlEnsureInstancesMenu();
        }
    }

    // Init for traditional and SPA-ish flows.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Re-run on client-side navigation (core-beta / SPA-like).
    try {
        window.addEventListener("popstate", init);
        const origPushState = history.pushState;
        history.pushState = function () {
            const ret = origPushState.apply(this, arguments);
            try {
                init();
            } catch (_e) {
                // ignore
            }
            return ret;
        };
    } catch (_e) {
        // ignore
    }
})();
