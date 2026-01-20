# CTFd-owl

## Возможности

1. Несколько динамических контейнеров и портов на задание.
2. Порты рандомизированы для каждого запуска.
3. Поддерживаются режимы CTFd: индивидуальный (users) и командный (teams). В командном режиме есть два варианта (зависит от настройки Competition Mode): один инстанс на команду или по одному инстансу на каждого пользователя.
4. Флаг задания может быть как статическим (plaintext, или проверка regex), так и динамическим.
5. Переменная окружения `FLAG` всегда прокидывается в контейнеры при старте: в статике это заданный флаг, в динамике — уникальный флаг для инстанса.
6. Конфигурация контейнера, от комментариев до проксирования, происходит декларативно через лейблы Docker Compose.
7. Поддержка разных типов сообщений(toasts, modals) о статусах контейнеров, поддержка как старых тем, основанных на core, так и новых.

### Лейблы

Проксируемые контейнеры должны иметь как минимум первые два лейбла из следующих:

-   `owl.proxy=true` - показывает CTFd-Owl, что контейнер нужно проксировать
-   `owl.proxy.port=8080` - порт внутри контейнера, на который будет идти трафик (пр. 8080)
-   `owl.label.conntype=nc` - тип подключения (http/https/nc/ssh/telnet), показывается как `(nc)` перед `ip:port` в карточке задания
-   `owl.label.comment=My comment.` - показывается как `(My comment.)` на следующей строке после `ip:port` в карточке задания
-   `owl.ssh.username=ctf` - используется только когда `owl.label.conntype=ssh` (показывается как `ssh ctf@ip -p port` в карточке задания)
-   `owl.ssh.password=secret` - пароль для SSH (опционально; игнорируется в UI если указан `owl.ssh.key`)
-   `owl.ssh.key=id_rsa` - имя SSH-ключа (опционально; в UI имеет приоритет над паролем)

Отображение данных для подключения изменены для `nc`, `telnet` и `ssh`.

### Сети

Для того, чтобы FRP мог проксировать трафик в контейнер, он должен находиться в сети `net`, где `net`:

```
networks:
    net:
        external:
            name: ctfd_frp_containers
```

Тем не менее, в случае, когда в задании есть несколько контейнеров (пр. `service1` и `service2`), и `service1` делает HTTP запрос к `http://service2`, то в случае, когда задание запущено у нескольких участников, в одной сети будет несколько контейнеров с названием `service2`, что приведёт к тому, что Docker DNS будет отдавать несколько A-записей.

Чтобы предотвратить это, в случае, если в вашем задании несколько сервисов, хотя бы один из которых общается с другим, не помещайте сервис, которому не нужно проксирование в `net` - вместо этого создайте сеть с названием `CTFD_PRIVATE_NETWORK` и поместите его в неё. `CTFD_PRIVATE_NETWORK` будет заменено плагином на строку формата `{prefix}_user{user_id}_{dirname}` в процессе настройки контейнеров.

## Установка

**REQUIRES: CTFd >= v3.7.7**

Скрипт установки:

```shell
# install docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Замените <workdir> на нужную вам директорию
cd <workdir>
git clone https://github.com/CTFd/CTFd.git -b 3.7.7 # Рекомендованная версия, но вы можете обновиться.
git clone https://github.com/mscw-infosec/CTFd-owl.git
cp -r CTFd-owl/* CTFd
mkdir -p /home/docker
```

Не забудьте заменить переменные `SECRET_KEY`, `MYSQL_PASSWORD` и другие подобные в вашем `docker-compose.yml`.

Запустите эту команду в корне CTFd для развёртывания платформы:

```shell
docker compose up -d
```

## Конфигурация

### Настройки Docker

![Docker Settings](./assets/ctfd-owl_admin_settings-docker.png)

|           Options            |                                  Content                                  |
| :--------------------------: | :-----------------------------------------------------------------------: |
|     **Competition Mode**     |        Режим проведения соревнования, настройка выдачи контейнеров        |
|    **Docker Flag Prefix**    |                               Префикс флага                               |
|      **Docker API URL**      |        API url/path (по умолчанию - `unix:///var/run/docker.sock`)        |
|   **Max Container Count**    |       Максимальное количество контейнеров (unlimited по умолчанию)        |
| **Docker Container Timeout** | Максимальное время жизни контейнера (по истечении контейнер будет удалён) |
|    **Max Renewal Times**     |        Максимальное количество обновлений времени жизни контейнера        |

### FRP Settings

![FRP Settings](./assets/ctfd-owl_admin_settings-frp.png)

|           Options           |                                           Content                                           |
| :-------------------------: | :-----------------------------------------------------------------------------------------: |
| **Frp Http Domain Suffix**  |  Суффикс домена FRP (нужен для динамического DNS, используется редко, по умолчанию `None`)  |
|      **FRPS address**       |               Адрес сервера с FRP, показывается участникам в связке `ip:port`               |
|      **FRPC address**       |                              Адрес клиента с FRP, обычно frpc                               |
|        **FRPC port**        |                               Порт клиента с FRP, обычно 7440                               |
| **Frp Direct Minimum Port** |  Минимальный порт (должен быть идентичен минимальному порту `frps` в `docker-compose.yml`)  |
| **Frp Direct Maximum Port** | Максимальный порт (должен быть идентичен максимальному порту `frps` в `docker-compose.yml`) |
|  **Frpc config template**   |             Шаблон конфига с данными FRP, на основе его обновляется `frpc.toml`             |

Ниже приведён пример шаблона конфигурации FRP.
Пожалуйста, создайте случайную строку и замените ей значение `auth.token`. Не забудьте также обновить `auth.token` в `frp/conf/frps.toml` и `frp/conf/frpc.toml`.

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

### Добавление задач

-   Пример обычной задачи приведён в `CTFd/plugins/ctfd-owl/source/tasks/sanity-task`. 
-   Пример задачи с динамическим флагом приведён в `CTFd/plugins/ctfd-owl/source/tasks/dynamic-task`. 
-   Пример задачи с SSH приведён в `CTFd/plugins/ctfd-owl/source/tasks/ssh-task`.

Во всех случаях контейнер получает `FLAG` автоматически (смотрите `FLAG=${FLAG}` в compose-файлах примеров).

Вы можете создать свои задачи на их основе.

### Демо

На скриншотах использована тема pixo (автор - hmrserver, модифицирована michaelsantosti для v3.7.7 CTFd и JustMarfix для CTFd-Owl). Она доступна в папке `themes` этого репозитория.

![challenges.png](./assets/challenges.png)

![containers](./assets/ctfd-owl_admin_containers.png)
