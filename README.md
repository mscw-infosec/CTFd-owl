# CTFd-owl

Forked from [CTFd-Owl](https://github.com/BIT-NSC/ctfd-owl.git) by BIT-NSC.
Added english documentaion & some new features.

## Features

1. The port is randomized on each container startup.
2. Adapted to "teams" and "users" modes. In "teams" mode, users of the same team will use the same container. # this is not tested or supported properly, open for PRs
3. Both static (plaintext or regex) and dynamic flags are supported.
4. Multiple containers + ports per challenge.
5. FLAG variable exported from CTFd to environment when running `docker compose up` on challenge.
6. Everything about container (including frp) should be configured using labels in docker-compose.

### Labels
Proxied containers should have at least first two of these labels:
- `owl.proxy=true` - tells CTFd-Owl that container should be proxied
- `owl.proxy.port=5656` - container port that will be connected to FRP (ex. 5656)
- `owl.label.conntype=nc` - will be shown as `(nc)` before container's `ip:port` in challenge card.
- `owl.label.comment=My comment.` - will be shown as `(My comment.)` next line after container's `ip:port` in challenge card.

### Networks
In order for frp to work properly, proxied containers should have network `net`, where `net` is:
```
networks:
    net:
        external:
            name: bitnsc_frp_containers
```

That said, if your challenge has containers `service1` and `service2`, and `service1` does HTTP request to `http://service2`, then
if there will be more than 1 service with name `service2` in the network, Docker DNS will go crazy, which will cause undefined behaviour.

To prevent this, if you make a challenge with multiple services, connecting to each other using their names, consider to
put services which don't need to be proxied inside `CTFD_PRIVATE_NETWORK` network, and don't put them in `net`.
`CTFD_PRIVATE_NETWORK` will be replaced with `{prefix}_user{user_id}_{dirname}` while setting up containers.

## Installation

**REQUIRES: CTFd == v3.4.0**

Install script:

```shell
# install docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# replace <workdir> to your workdir
cd <workdir>
git clone https://github.com/CTFd/CTFd.git -b 3.4.0
git clone https://github.com/mscw-infosec/CTFd-owl.git
cp -r CTFd-owl/* CTFd
mkdir -p /home/docker

# make sure you have pip3 installed on your server
pip3 install docker-compose
```

The above command will try to install `docker-ce`, `python3-pip` and `docker-compose`. Before executing them, make sure
the following requirements are met:

* You have `curl`、`git`、`python3` and `pip` installed
* GitHub is accessible
* Docker Registry is accessible

Please randomly generate sensitive information such as `SECRET_KEY`, `MYSQL_PASSWORD`, etc. in the `*.yml` you want to
use.

```shell
docker-compose -f CTFd/single.yml up -d
```

You're all set! The next step is configuration.

## How to Use

### Configuration

#### Docker Settings

![Docker Settings](./assets/ctfd-owl_admin_settings-docker.png)

|           Options            |                                                 Content                                                  |
|:----------------------------:|:--------------------------------------------------------------------------------------------------------:|
|    **Docker Flag Prefix**    |                                               Flag prefix                                                |
|     **Docker APIs URL**      |                            API url/path (default `unix://var/run/docker.sock)                            |
|   **Max Container Count**    |                           Maximum number of containers (unlimited by default)                            |
| **Docker Container Timeout** | The maximum running time of the container (it will be automatically destroyed after the time is reached) |
|     **Max Renewal Time**     |                Maximum container renewal times (cannot be renewed if the number exceeds）                 |

#### FRP Settings

![FRP Settings](./assets/ctfd-owl_admin_settings-frp.png)

|           Options           |                                                            Content                                                             |
|:---------------------------:|:------------------------------------------------------------------------------------------------------------------------------:|
| **FRP Http Domain Suffix**  |                        FRP domain name prefix (required if dynamic domain name forwarding is enabled)）                         |
|  **FRP Direct IP Address**  |                                                         FRP server IP                                                          |
| **FRP Direct Minimum Port** |          Minimum port (keep the same as the minimum port segment mapped to the outside by `frps` in `docker-compose`)          |
| **FRP Direct Maximum Port** |                                                  Maximum port (same as above)                                                  |
|   **FRP config template**   | frpc hot reload configuration header template (if you don't know how to customize it, try to follow the default configuration) |

Please generate a random token and replace `auth.token` with it. Then modify the token in `frp/conf/frps.toml` and `frp/conf/frpc.toml` to match it.
```ini
serverAddr = "frps"
serverPort = 80

auth.method = "token" 
auth.token = "CHANGE_THIS_TOKEN_TO_RANDOM_VALUE"

webServer.addr = "10.1.0.4"
webServer.port = 7400
webServer.user = "admin"
webServer.password = "admin"

transport.tcpMux = false
transport.poolCount = 1
```

### Add Challenge

Just add the task, that's all.

### Demo

![challenges.png](./assets/challenges.png)

![containers](./assets/ctfd-owl_admin_containers.png)

