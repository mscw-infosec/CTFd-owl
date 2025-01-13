#/bin/sh
nohup /app/frps -c /conf/frps.toml 1> /conf/server.log 2>&1 &
nohup /app/frpc -c /conf/frpc.toml 1> /conf/client.log 2>&1 &
/bin/sh
