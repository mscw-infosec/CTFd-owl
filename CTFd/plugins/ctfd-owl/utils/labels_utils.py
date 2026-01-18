from __future__ import annotations

import json
from typing import Any, Mapping


# Central place to extend supported owl.label.* keys.
# Add a new entry here and it will automatically be parsed into `labels.fields`.
OWL_LABEL_KEYS: dict[str, str] = {
    "conntype": "owl.label.conntype",
    "comment": "owl.label.comment",
    "ssh_username": "owl.label.ssh.username",
    "ssh_password": "owl.label.ssh.password",
}


class LabelsUtils:
    @staticmethod
    def iter_compose_labels(labels: Any) -> list[str]:
        # docker-compose supports labels both as a list and as a dict.
        # We normalize both into a list of "key=value" strings.
        if labels is None:
            return []
        if isinstance(labels, dict):
            return [f"{k}={v}" for k, v in labels.items()]
        if isinstance(labels, list):
            return [str(x) for x in labels]
        raise TypeError("compose labels must be a list[str] or a dict[str, str]")

    @staticmethod
    def split_label(label: str) -> tuple[str, str]:
        key, _, value = label.partition("=")
        return key.strip(), value

    @staticmethod
    def parse_kv(labels: Any) -> dict[str, str]:
        # Parse compose labels into a simple key -> value dict.
        result: dict[str, str] = {}
        for raw in LabelsUtils.iter_compose_labels(labels):
            key, value = LabelsUtils.split_label(raw)
            if not key:
                continue
            result[key] = value
        return result

    @staticmethod
    def parse_owl_metadata(labels: Any) -> dict[str, Any]:
        """Parse compose labels into a structured OWL metadata dict."""

        kv = LabelsUtils.parse_kv(labels)

        key_to_field_name: dict[str, str] = {key: name for name, key in OWL_LABEL_KEYS.items()}
        fields: dict[str, str] = {name: "" for name in OWL_LABEL_KEYS.keys()}

        proxy_enabled = False
        proxy_port: int | None = None

        for label_key, label_value in kv.items():
            if label_key == "owl.proxy":
                proxy_enabled = str(label_value).lower() == "true"
                continue

            if label_key == "owl.proxy.port":
                try:
                    proxy_port = int(label_value)
                except Exception:
                    proxy_port = None
                continue

            field_name = key_to_field_name.get(label_key)
            if field_name is not None:
                fields[field_name] = label_value
                continue

        # SSH fields are only meaningful for conntype=ssh.
        if fields.get("conntype", "") != "ssh":
            fields["ssh_username"] = ""
            fields["ssh_password"] = ""

        # This object is what we store in labels.
        return {
            "proxy": {"enabled": bool(proxy_enabled), "port": proxy_port},
            "fields": fields,
        }

    @staticmethod
    def dumps_labels(labels_obj: Mapping[str, Any] | None) -> str:
        # Store in DB as JSON string.
        if not labels_obj:
            return "{}"
        try:
            return json.dumps(dict(labels_obj), ensure_ascii=False, sort_keys=True)
        except Exception:
            return "{}"

    @staticmethod
    def loads_labels(labels_json: str | None) -> dict[str, Any]:
        # Load from DB JSON string.
        if not labels_json:
            return {}
        try:
            obj = json.loads(labels_json)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}
