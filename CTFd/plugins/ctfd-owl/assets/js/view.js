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

    var params = {};

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
                CTFd.lib
                    .$("#owl-panel")
                    .html(
                        '<h5 class="card-title">Error</h5>' +
                            '<h6 class="card-subtitle mb-2 text-muted" id="owl-challenge-count-down">' +
                            response.msg +
                            "</h6>"
                    );
            } else if (response.containers_data === undefined || response.containers_data[0].remaining_time === undefined) {
                CTFd.lib
                    .$("#owl-panel")
                    .html(
                        '<h5 class="card-title">Instance Info</h5><hr>' +
                            '<button type="button" class="btn btn-primary card-link" id="owl-button-boot" onclick="CTFd._internal.challenge.boot()">Launch</button>'
                    );
            } else {
                var panel_html =
                    '<h5 class="card-title">Instance Info</h5><hr>' +
                    '<h6 class="card-subtitle mb-2 text-muted" id="owl-challenge-count-down">Remaining Time: ' +
                    response.containers_data[0].remaining_time +
                    "s</h6>";
                panel_html += '<p class="card-text">Services: <br/>';
                response.containers_data.forEach((container, i) => {
                    let comment = "";
                    let conntype = "";
                    let proto = "";
                    if (container.comment !== "") {
                        comment = "<br/><a>(" + container.comment + ")</a>";
                    }
                    if (container.conntype !== "") {
                        conntype = "(" + container.conntype + ") ";
                    }
                    if (container.conntype === "http") {
                        proto = "http:";
                    }
                    if (container.conntype === "https") {
                        proto = "https:";
                    }
                    if (container.conntype === "nc") {
                        panel_html += i + 1 + ". " + conntype + '<a target="_blank" whited>nc ' + response.ip + " " + container.port + "</a>" + comment + "<br/>";
                    } else if (container.conntype === "ssh") {
                        panel_html += i + 1 + ". " + conntype + '<a target="_blank" whited>ssh USERNAME@' + response.ip + " -p " + container.port + "</a>" + comment + "<br/>";
                    } else {
                        panel_html += i + 1 + ". " + conntype + '<a href="' + proto + "//" + response.ip + ":" + container.port + '" target="_blank">' + response.ip + ":" + container.port + "</a>" + comment + "<br/>";
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

                function showAuto() {
                    const origin = CTFd.lib.$("#owl-challenge-count-down")[0].innerHTML;
                    const second = parseInt(origin.split(": ")[1].split("s")[0]) - 1;
                    CTFd.lib.$("#owl-challenge-count-down")[0].innerHTML = "Remaining Time: " + second + "s";
                    if (second < 0) {
                        loadInfo();
                    }
                }

                window.t = setInterval(showAuto, 1000);
            }
        });
}

function stopShowAuto() {
    // 窗口关闭时停止循环
    CTFd.lib.$("#challenge-window").on("hide.bs.modal", function (event) {
        clearInterval(window.t);
        window.t = undefined;
    });
}

CTFd._internal.challenge.destroy = function () {
    var challenge_id = getOwlChallengeId();
    var target = "/plugins/ctfd-owl/container?challenge_id={challenge_id}";
    target = target.replace("{challenge_id}", challenge_id);
    var body = {};
    var params = {};

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
    var body = {};
    var params = {};

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
