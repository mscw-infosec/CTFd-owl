import requests

from .db_utils import DBUtils
from .labels_utils import LabelsUtils
from ..extensions import log
from ..models import DynamicCheckChallenge, OwlContainers


class FrpUtils:
    @staticmethod
    def update_frp_redirect():
        configs = DBUtils.get_all_configs()

        containers: list[OwlContainers] = DBUtils.get_all_alive_container()
        output = configs.get("frpc_config_template")

        direct_template = "\n\n[[proxies]]\n" + \
                          "name = \"direct_%s_tcp\"\n" + \
                          "type = \"tcp\"\n" + \
                          "localIP = \"%s\"\n" + \
                          "localPort = %s\n" + \
                          "remotePort = %s" + \
                          "\n\n[[proxies]]\n" + \
                          "name = \"direct_%s_udp\"\n" + \
                          "type = \"udp\"\n" + \
                          "localIP = \"%s\"\n" + \
                          "localPort = %s\n" + \
                          "remotePort = %s"

        for c in containers:
            dynamic_docker_challenge = DynamicCheckChallenge.query \
                .filter(DynamicCheckChallenge.id == c.challenge_id) \
                .first_or_404()
            labels_obj = LabelsUtils.loads_labels(getattr(c, "labels", "{}") or "{}")
            proxy_port: int | None = None
            proxy = labels_obj.get("proxy")
            if isinstance(proxy, dict):
                port = proxy.get("port")
                try:
                    proxy_port = int(port) if port is not None else None
                except Exception:
                    proxy_port = None
            redirect_port = dynamic_docker_challenge.redirect_port if (proxy_port or 0) == 0 else int(proxy_port)
            container_service_local_ip = c.name
            output += direct_template % (
                container_service_local_ip,
                container_service_local_ip,
                redirect_port,
                c.port,
                container_service_local_ip,
                container_service_local_ip,
                redirect_port,
                c.port
            )

        frp_api_ip = configs.get("frpc_direct_ip_address", "frpc")
        frp_api_port = configs.get("frpc_port", "7400")
        try:
            if configs.get("frpc_config_template") is not None:
                assert requests.put("http://" + frp_api_ip + ":" + frp_api_port + "/api/config", output,
                                    timeout=5, headers={'Authorization': 'Basic YWRtaW46YWRtaW4='}).status_code == 200
                assert requests.get("http://" + frp_api_ip + ":" + frp_api_port + "/api/reload",
                                    timeout=5, headers={'Authorization': 'Basic YWRtaW46YWRtaW4='}).status_code == 200
            else:
                pass
        except Exception as e:
            import traceback
            log("owl",
                '[ERROR] frp reload: {err}',
                err=traceback.format_exc()
                )
            pass
