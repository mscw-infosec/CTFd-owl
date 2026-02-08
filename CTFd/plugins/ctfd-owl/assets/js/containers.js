const $ = CTFd.lib.$;

function htmlentities(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Copy a string to clipboard and show a temporary tooltip.
function copyToClipboard(event, str) {
    // Select element
    const el = document.createElement("textarea");
    el.value = str;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);

    $(event.target).tooltip({
        title: "Copied!",
        trigger: "manual",
    });
    $(event.target).tooltip("show");

    setTimeout(function () {
        $(event.target).tooltip("hide");
    }, 1500);
}

$(".click-copy").click(function (e) {
    copyToClipboard(e, $(this).data("copy"));
});

async function delete_container(user_id) {
    let response = await CTFd.fetch("/plugins/ctfd-owl/admin/containers?user_id=" + user_id, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    });
    response = await response.json();
    return response;
}

async function delete_container_by_id(container_id) {
    let response = await CTFd.fetch("/plugins/ctfd-owl/admin/containers?container_id=" + container_id, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    });
    response = await response.json();
    return response;
}

// Renew containers for a given user id.
async function renew_container(user_id) {
    let response = await CTFd.fetch("/plugins/ctfd-owl/admin/containers?user_id=" + user_id, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    });
    response = await response.json();
    return response;
}

async function renew_container_by_id(container_id) {
    let response = await CTFd.fetch("/plugins/ctfd-owl/admin/containers?container_id=" + container_id, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    });
    response = await response.json();
    return response;
}

$(".delete-container").click(function (e) {
    e.preventDefault();
    var container_id = $(this).attr("container-id");

    delete_container_by_id(container_id)
        .then(async (response) => {
            if (!response?.success) {
                await window.owlShowModal({
                    title: "Error",
                    body: response?.msg || response?.message || "Unknown Error!",
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
                return;
            }
            location.reload();
        })
        .catch(async (err) => {
            await window.owlShowModal({
                title: "Error",
                body: err?.message || String(err),
                buttonText: "OK",
                buttonClass: "btn-primary",
            });
        });
});

$(".renew-container").click(function (e) {
    e.preventDefault();
    var container_id = $(this).attr("container-id");

    renew_container_by_id(container_id)
        .then(async (response) => {
            if (!response?.success) {
                await window.owlShowModal({
                    title: "Error",
                    body: response?.msg || response?.message || "Unknown Error!",
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
                return;
            }
            location.reload();
        })
        .catch(async (err) => {
            await window.owlShowModal({
                title: "Error",
                body: err?.message || String(err),
                buttonText: "OK",
                buttonClass: "btn-primary",
            });
        });
});

$("#containers-renew-button").click(function (e) {
    let containers = $("input[data-container-id]:checked").map(function () {
        return $(this).data("container-id");
    });

    Promise.all(containers.toArray().map((container_id) => renew_container_by_id(container_id)))
        .then(async (results) => {
            const failed = results?.some((r) => !r?.success);
            if (failed) {
                await window.owlShowModal({
                    title: "Error",
                    body: "Some containers could not be renewed.",
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
                return;
            }
            location.reload();
        })
        .catch(async (err) => {
            await window.owlShowModal({
                title: "Error",
                body: err?.message || String(err),
                buttonText: "OK",
                buttonClass: "btn-primary",
            });
        });
});

$("#containers-delete-button").click(function (e) {
    let containers = $("input[data-container-id]:checked").map(function () {
        return $(this).data("container-id");
    });

    Promise.all(containers.toArray().map((container_id) => delete_container_by_id(container_id)))
        .then(async (results) => {
            const failed = results?.some((r) => !r?.success);
            if (failed) {
                await window.owlShowModal({
                    title: "Error",
                    body: "Some containers could not be deleted.",
                    buttonText: "OK",
                    buttonClass: "btn-primary",
                });
                return;
            }
            location.reload();
        })
        .catch(async (err) => {
            await window.owlShowModal({
                title: "Error",
                body: err?.message || String(err),
                buttonText: "OK",
                buttonClass: "btn-primary",
            });
        });
});
