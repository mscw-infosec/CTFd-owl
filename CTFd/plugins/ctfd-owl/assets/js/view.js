CTFd._internal.challenge.data = undefined;

// Resolve the current challenge id across CTFd themes.
function getOwlChallengeId() {
    try {
        const internalId =
            CTFd &&
            CTFd._internal &&
            CTFd._internal.challenge &&
            CTFd._internal.challenge.data &&
            CTFd._internal.challenge.data.id;
        if (typeof internalId === "number" && !isNaN(internalId)) return internalId;
        if (typeof internalId === "string" && internalId && !isNaN(parseInt(internalId))) return parseInt(internalId);
    } catch (_e) {
        // ignore
    }

    try {
        const v1 = CTFd.lib.$("#challenge-id").val();
        if (v1 !== undefined && v1 !== null && String(v1).length && !isNaN(parseInt(v1))) return parseInt(v1);
    } catch (_e) {
        // ignore
    }

    try {
        const v2 = CTFd.lib.$("input[name='challenge_id']").val();
        if (v2 !== undefined && v2 !== null && String(v2).length && !isNaN(parseInt(v2))) return parseInt(v2);
    } catch (_e) {
        // ignore
    }

    try {
        const el = document && document.querySelector && document.querySelector("[data-challenge-id]");
        if (el) {
            const v3 = el.getAttribute("data-challenge-id");
            if (v3 && !isNaN(parseInt(v3))) return parseInt(v3);
        }
    } catch (_e) {
        // ignore
    }

    try {
        const h = window.location && typeof window.location.hash === "string" ? window.location.hash : "";
        if (h && h.length > 1) {
            const decoded = decodeURIComponent(h.slice(1));
            const m = decoded.match(/-(\d+)$/);
            if (m && m[1] && !isNaN(parseInt(m[1]))) {
                return parseInt(m[1]);
            }
        }
    } catch (_e) {
        // ignore
    }

    return NaN;
}

// Clears the instance countdown interval (if any).
function resetOwlTimer() {
    if (window.t !== undefined) {
        try {
            clearInterval(window.t);
        } catch (_e) {
            // ignore
        }
        window.t = undefined;
    }
}

// Ensure notification API is available (owlShowModal/owlShowToast).
function ensureOwlModalLoaded() {
    if (typeof window.owlShowModal === "function") {
        return Promise.resolve(true);
    }
    if (ensureOwlModalLoaded._promise) {
        return ensureOwlModalLoaded._promise;
    }

    const urlRoot = CTFd.config && typeof CTFd.config.urlRoot === "string" ? CTFd.config.urlRoot : "";
    const base = `${urlRoot}/plugins/ctfd-owl/assets/js/notifications`;
    const url = `${base}/index.js`;

    ensureOwlModalLoaded._promise = new Promise((resolve) => {
        try {
            const script = document.createElement("script");
            script.src = url;
            script.defer = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        } catch (_e) {
            resolve(false);
        }
    }).then(() => typeof window.owlShowModal === "function");
    return ensureOwlModalLoaded._promise;
}

// Show a message via configured notifications mode (modal/toast) with an alert() fallback.
function owlShowModalSafe({ title, body, buttonText, buttonClass, variant, delay } = {}) {
    return ensureOwlModalLoaded().then(() => {
        if (typeof window.owlShowModal === "function") {
            return window.owlShowModal({ title, body, buttonText, buttonClass, variant, delay });
        }
        window.alert(`${String(title || "Info")}\n\n${String(body || "")}`);
        return Promise.resolve();
    });
}

CTFd._internal.challenge.renderer = null;
CTFd._internal.challenge.preRender = function () {};
CTFd._internal.challenge.render = null;

CTFd._internal.challenge.postRender = function () {
    resetOwlTimer();
    loadInfo();
    // Preload notification scripts/settings to avoid delay on first user action.
    try {
        ensureOwlModalLoaded();
    } catch (_e) {
        // ignore
    }
};

CTFd._internal.challenge.submit = function (preview) {
    var challenge_id = parseInt(CTFd.lib.$("#challenge-id").val());
    var submission = CTFd.lib.$("#challenge-input").val();

    var body = {
        challenge_id: challenge_id,
        submission: submission,
    };
    var params = {};
    if (preview) {
        params["preview"] = true;
    }

    return CTFd.api.post_challenge_attempt(params, body).then(function (response) {
        if (response.status === 429) {
            // User was ratelimited but process response
            return response;
        }
        if (response.status === 403) {
            // User is not logged in or CTF is paused.
            return response;
        }
        return response;
    });
};

function loadInfo() {
    // Load container info for the current challenge.
    var challenge_id = getOwlChallengeId();
    if (isNaN(challenge_id)) {
        setTimeout(function () {
            loadInfo();
        }, 100);
        return;
    }

    const requested_challenge_id = challenge_id;

    if (window.owl_last_challenge_id !== challenge_id) {
        window.owl_last_challenge_id = challenge_id;
        resetOwlTimer();
    }
    var target = "/plugins/ctfd-owl/container?challenge_id={challenge_id}";
    target = target.replace("{challenge_id}", challenge_id);

    CTFd.fetch(target, {
        method: "GET",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    })
        .then(function (response) {
            if (response.status === 429) {
                // User was ratelimited but process response
                return response.json();
            }
            if (response.status === 403) {
                // User is not logged in or CTF is paused.
                return response.json();
            }
            return response.json();
        })
        .then(function (response) {
            // If the user switched challenges while this request was in-flight, ignore the result.
            if (window.owl_last_challenge_id !== requested_challenge_id) {
                return;
            }
            console.log(response);
            if (response.success === false) {
                resetOwlTimer();
                CTFd.lib
                    .$("#owl-panel")
                    .html(
                        '<h5 class="card-title">Error</h5>' +
                            '<h6 class="card-subtitle mb-2 text-muted" id="owl-challenge-count-down">' +
                            response.msg +
                            "</h6>"
                    );
            } else if (response.containers_data === undefined || response.containers_data[0].remaining_time === undefined) {
                resetOwlTimer();
                CTFd.lib
                    .$("#owl-panel")
                    .html(
                        '<h5 class="card-title">Instance Info</h5><hr>' +
                            '<button type="button" class="btn btn-primary card-link" id="owl-button-boot" onclick="CTFd._internal.challenge.boot()">Launch</button>'
                    );
            } else {
                if (response.ip) {
                    window.owl_last_frp_ip = response.ip;
                }
                const countdownClass = response.effective_mode === "teams" ? "card-subtitle mb-0 text-muted" : "card-subtitle mb-2 text-muted";
                var panel_html =
                    '<h5 class="card-title">Instance Info</h5><hr>' +
                    '<h6 class="' +
                    countdownClass +
                    '" id="owl-challenge-count-down">Remaining Time: ' +
                    response.containers_data[0].remaining_time +
                    "s</h6>";

                // Shared instances metadata.
                window.owl_manage_owner_user_id = response.manage_owner_user_id;

                // Show who launched only in team visibility (All team members).
                try {
                    if (response.effective_mode === "teams") {
                        let ownerHtml = "";
                        if (response.owner && response.owner.url && response.owner.name) {
                            ownerHtml = '<a class="text-muted" href="' + response.owner.url + '" target="_blank">' + response.owner.name + "</a>";
                        } else if (Array.isArray(response.owners) && response.owners.length > 0) {
                            ownerHtml = response.owners
                                .map((o) => '<a class="text-muted" href="' + o.url + '" target="_blank">' + o.name + "</a>")
                                .join(", ");
                        }
                        if (ownerHtml) {
                            panel_html += '<div class="mb-2 text-muted">Launched by: ' + ownerHtml + "</div>";
                        }
                    }
                } catch (_e) {
                    // ignore
                }
                panel_html += '<p class="card-text">Services: <br/>';
                response.containers_data.forEach((container, i) => {
                    let comment = "";
                    let conntype = "";
                    let proto = "";
                    const labels = container.labels || {};
                    const fields = labels.fields || {};
                    const connType = fields.conntype || "";
                    const connComment = fields.comment || "";
                    const sshUsername = fields.ssh_username || "";
                    const sshPassword = fields.ssh_password || "";
                    const sshKey = fields.ssh_key || "";

                    if (connComment !== "") {
                        comment = "<br/><a>(" + connComment + ")</a>";
                    }

                    if (connType !== "") {
                        conntype = "(" + connType + ") ";
                    }
                    if (connType === "http") {
                        proto = "http:";
                    }
                    if (connType === "https") {
                        proto = "https:";
                    }

                    if (connType === "nc") {
                        panel_html += i + 1 + ". " + conntype + '<a target="_blank" whited>nc ' + response.ip + " " + container.port + "</a>" + comment + "<br/>";
                    } else if (connType === "telnet") {
                        panel_html += i + 1 + ". " + conntype + '<a target="_blank" whited>telnet ' + response.ip + " " + container.port + "</a>" + comment + "<br/>";
                    } else if (connType === "ssh") {
                        const sshUser = sshUsername && sshUsername !== "" ? sshUsername : "USERNAME";
                        if (sshKey && sshKey !== "") {
                            panel_html +=
                                i + 1 + ". " + conntype + '<a target="_blank" whited>ssh -i ' + sshKey + " " + sshUser + "@" + response.ip + " -p " + container.port + "</a>";
                        } else {
                            panel_html += i + 1 + ". " + conntype + '<a target="_blank" whited>ssh ' + sshUser + "@" + response.ip + " -p " + container.port + "</a>";
                            if (sshPassword && sshPassword !== "") {
                                panel_html += "<br/>Password: <code>" + sshPassword + "</code>";
                            }
                        }
                        panel_html += comment + "<br/>";
                    } else {
                        panel_html +=
                            i + 1 + ". " + conntype + '<a href="' + proto + "//" + response.ip + ":" + container.port + '" target="_blank">' + response.ip + ":" + container.port + "</a>" + comment + "<br/>";
                    }
                });
                panel_html += "</p>";

                panel_html +=
                    '<button type="button" class="btn btn-danger card-link" id="owl-button-destroy" onclick="CTFd._internal.challenge.destroy()">Destroy</button>' +
                    '<button type="button" class="btn btn-success card-link" id="owl-button-renew" onclick="CTFd._internal.challenge.renew()">Renew</button>';
                CTFd.lib.$("#owl-panel").html(panel_html);

                if (window.t !== undefined) {
                    clearInterval(window.t);
                    window.t = undefined;
                }

                let remainingSeconds = parseInt(response.containers_data[0].remaining_time);
                if (isNaN(remainingSeconds)) {
                    remainingSeconds = 0;
                }

                let syncTicks = 0;

                function showAuto() {
                    const el = CTFd.lib.$("#owl-challenge-count-down")[0];
                    if (!el) {
                        // DOM changed (e.g. challenge modal closed, or panel rerendered). Stop ticking.
                        resetOwlTimer();
                        return;
                    }

                    remainingSeconds -= 1;
                    el.innerHTML = "Remaining Time: " + remainingSeconds + "s";

                    syncTicks += 1;
                    if (syncTicks >= 60) {
                        // Resync with server once per minute to avoid client drift.
                        resetOwlTimer();
                        loadInfo();
                        return;
                    }

                    if (remainingSeconds < 0) {
                        resetOwlTimer();
                        loadInfo();
                    }
                }

                window.t = setInterval(showAuto, 1000);
            }
        });
}

function stopShowAuto() {
    // Stop ticking when challenge modal closes.
    CTFd.lib.$("#challenge-window").on("hide.bs.modal", function () {
        clearInterval(window.t);
        window.t = undefined;
    });
}

CTFd._internal.challenge.destroy = function () {
    var challenge_id = getOwlChallengeId();
    var target = "/plugins/ctfd-owl/container?challenge_id={challenge_id}";
    target = target.replace("{challenge_id}", challenge_id);
    var params = {};

    if (window.owl_manage_owner_user_id !== undefined && window.owl_manage_owner_user_id !== null) {
        target += "&owner_user_id=" + encodeURIComponent(window.owl_manage_owner_user_id);
    }

    CTFd.lib.$("#owl-button-destroy")[0].innerHTML = "Waiting...";
    CTFd.lib.$("#owl-button-destroy")[0].disabled = true;

    CTFd.fetch(target, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    })
        .then(function (response) {
            if (response.status === 429) {
                // User was ratelimited but process response
                return response.json();
            }
            if (response.status === 403) {
                // User is not logged in or CTF is paused.
                return response.json();
            }
            return response.json();
        })
        .then(function (response) {
            if (response.success) {
                loadInfo();
                owlShowModalSafe({
                    title: "Success",
                    body: "Your instance has been destroyed!",
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
                stopShowAuto();
            } else {
                CTFd.lib.$("#owl-button-destroy")[0].innerHTML = "Destroy";
                CTFd.lib.$("#owl-button-destroy")[0].disabled = false;
                owlShowModalSafe({
                    title: "Fail",
                    body: response.msg,
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
            }
        });
};

CTFd._internal.challenge.renew = function () {
    var challenge_id = getOwlChallengeId();
    var target = "/plugins/ctfd-owl/container?challenge_id={challenge_id}";
    target = target.replace("{challenge_id}", challenge_id);
    var params = {};

    if (window.owl_manage_owner_user_id !== undefined && window.owl_manage_owner_user_id !== null) {
        target += "&owner_user_id=" + encodeURIComponent(window.owl_manage_owner_user_id);
    }

    CTFd.lib.$("#owl-button-renew")[0].innerHTML = "Waiting...";
    CTFd.lib.$("#owl-button-renew")[0].disabled = true;

    CTFd.fetch(target, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    })
        .then(function (response) {
            if (response.status === 429) {
                // User was ratelimited but process response
                return response.json();
            }
            if (response.status === 403) {
                // User is not logged in or CTF is paused.
                return response.json();
            }
            return response.json();
        })
        .then(function (response) {
            if (response.success) {
                loadInfo();
                owlShowModalSafe({
                    title: "Success",
                    body: "Your instance has been renewed!",
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
            } else {
                CTFd.lib.$("#owl-button-renew")[0].innerHTML = "Renew";
                CTFd.lib.$("#owl-button-renew")[0].disabled = false;
                owlShowModalSafe({
                    title: "Fail",
                    body: response.msg,
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
            }
        });
};

CTFd._internal.challenge.boot = function () {
    var challenge_id = getOwlChallengeId();
    var target = "/plugins/ctfd-owl/container?challenge_id={challenge_id}";
    target = target.replace("{challenge_id}", challenge_id);

    var params = {};

    CTFd.lib.$("#owl-button-boot")[0].innerHTML = "Waiting...";
    CTFd.lib.$("#owl-button-boot")[0].disabled = true;

    CTFd.fetch(target, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    })
        .then(function (response) {
            if (response.status === 429) {
                // User was ratelimited but process response
                return response.json();
            }
            if (response.status === 403) {
                // User is not logged in or CTF is paused.
                return response.json();
            }
            return response.json();
        })
        .then(function (response) {
            if (response.success) {
                loadInfo();
                owlShowModalSafe({
                    title: "Success",
                    body: "Your instance has been deployed!",
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
            } else {
                CTFd.lib.$("#owl-button-boot")[0].innerHTML = "Launch";
                CTFd.lib.$("#owl-button-boot")[0].disabled = false;
                owlShowModalSafe({
                    title: "Fail",
                    body: response.msg,
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
            }
        });
};
