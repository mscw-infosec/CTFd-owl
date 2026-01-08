# CTFd-owl

Russian version of this README is available [here](./README-RU.md).

## Features

1. Multiple dynamic containers & ports per challenge.
2. The port is randomized on each container startup.
3. Adapted to "teams" and "users" modes. In "teams" mode, users of the same team will use the same container. # this is not tested or supported properly, open for PRs
4. Both static (plaintext or regex) and dynamic flags are supported.
5. FLAG variable exported from CTFd to environment when running `docker compose up` on challenge.
6. Everything about container (including frp) should be configured using labels in docker-compose.
7. Support for different types of messages (toasts, modals) about container statuses, support for both old core-based themes and new ones.

### Labels

Proxied containers should have at least first two of these labels:

-   `owl.proxy=true` - tells CTFd-Owl that container should be proxied
-   `owl.proxy.port=8080` - container port that will be connected to FRP (ex. 8080)
-   `owl.label.conntype=nc` - will be shown as `(nc)` before container's `ip:port` in challenge card.
-   `owl.label.comment=My comment.` - will be shown as `(My comment.)` next line after container's `ip:port` in challenge card.
-   `owl.label.ssh_username=ctf` - used only when `owl.label.conntype=ssh` (shown as `ssh ctf@ip -p port` in challenge card).

The connection data display has been changed for `nс` and `ssh`.

### Networks

In order for frp to work properly, proxied containers should have network `net`, where `net` is:

```
networks:
    net:
        external:
            name: ctfd_frp_containers
```

That said, if your challenge has containers `service1` and `service2`, and `service1` does HTTP request to `http://service2`, then if there will be more than 1 service with name `service2` in the network, Docker DNS will go crazy, which will cause undefined behaviour.

To prevent this, if you make a challenge with multiple services, connecting to each other using their names, consider to put services which don't need to be proxied inside `CTFD_PRIVATE_NETWORK` network, and don't put them in `net`. `CTFD_PRIVATE_NETWORK` will be replaced with `{prefix}_user{user_id}_{dirname}` while setting up containers.

## Installation

**REQUIRES: CTFd >= v3.7.7**

Install script:

```shell
# install docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# replace <workdir> to your workdir
cd <workdir>
git clone https://github.com/CTFd/CTFd.git
git clone https://github.com/Thorgathis/CTFd-owl.git
cp -r CTFd-owl/* CTFd
mkdir -p /home/docker
```

Please randomly generate sensitive information such as `SECRET_KEY`, `MYSQL_PASSWORD`, etc. in the `*.yml` you want to use.

To start CTFd use this command while in CTFd root:

```shell
docker compose up -d
```

## Configuration

### Docker Settings

![Docker Settings](./assets/ctfd-owl_admin_settings-docker.png)

|           Options            |                                                 Content                                                  |
| :--------------------------: | :------------------------------------------------------------------------------------------------------: |
|     **Competition Mode**     |                             Competition mode, setting up container delivery                              |
|    **Docker Flag Prefix**    |                                               Flag prefix                                                |
|     **Docker APIs URL**      |                           API url/path (default `unix:///var/run/docker.sock`)                           |
|   **Max Container Count**    |                           Maximum number of containers (unlimited by default)                            |
| **Docker Container Timeout** | The maximum running time of the container (it will be automatically destroyed after the time is reached) |
|     **Max Renewal Time**     |                Maximum container renewal times (cannot be renewed if the number exceeds)                 |

### FRP Settings

![FRP Settings](./assets/ctfd-owl_admin_settings-frp.png)

|           Options           |                                                            Content                                                             |
| :-------------------------: | :----------------------------------------------------------------------------------------------------------------------------: |
| **FRP Http Domain Suffix**  |                        FRP domain name prefix (required if dynamic domain name forwarding is enabled)）                        |
|      **FRPS Address**       |                                                         FRP server IP                                                          |
|      **FRPC address**       |                                                FRP client address, default frpc                                                |
|        **FRPC port**        |                                                 FRP client port, default 7440                                                  |
| **FRP Direct Minimum Port** |          Minimum port (keep the same as the minimum port segment mapped to the outside by `frps` in `docker-compose`)          |
| **FRP Direct Maximum Port** |          Maximum port (keep the same as the maximum port segment mapped to the outside by `frps` in `docker-compose`)          |
|  **FRPC config template**   | frpc hot reload configuration header template (if you don't know how to customize it, try to follow the default configuration) |

Below is an example of an FRP configuration template.
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

-   An example of a common task is given in the `CTFd/plugins/ctfd-owl/source/sanity-task`. You can create your own task based on it.
-   An example of a task with a dynamic flag is given in `CTFd/plugins/ctfd-owl/source/dynamic-task`. You can create your own task based on it.

### Demo

Theme used: pixo (originally by hmrserver, modified by michaelsantosti for v3.7.7 & JustMarfix for CTFd-Owl). It is available in `themes` folder of this repo.

![challenges.png](./assets/challenges.png)

![containers](./assets/ctfd-owl_admin_containers.png)
