const $ = CTFd.lib.$;

function update_configs(event) {
    event.preventDefault();
    const obj = $(this).serializeJSON();
    const target = "/plugins/ctfd-owl/admin/settings";

    var params = {};

    Object.keys(obj).forEach(function (x) {
        let v = obj[x];

        // When multiple inputs share the same name (e.g. hidden=false + checkbox=true),
        if (Array.isArray(v)) {
            // If any value is "true", treat as true; else if any is "false", treat as false; else take last.
            if (v.includes("true")) {
                v = "true";
            } else if (v.includes("false")) {
                v = "false";
            } else {
                v = v.length ? v[v.length - 1] : "";
            }
        }

        if (v === "true") {
            params[x] = true;
        } else if (v === "false") {
            params[x] = false;
        } else {
            params[x] = v;
        }
    });

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
            return response.json();
        })
        .then(function (data) {
            window.location.reload();
        });
    /*CTFd.api.patch_ctfd_owl_config({}, params).then(_response => {
      window.location.reload();
    });*/
}

$(() => {
    $(".config-section > form:not(.form-upload)").submit(update_configs);
});
