FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    openssh-server \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tmp/build
WORKDIR /tmp/build

RUN useradd -m -d /home/ctf -s /bin/bash ctf && echo "ctf:secret" | chpasswd

COPY . .
RUN chmod +x docker-entrypoint.sh

RUN mkdir /var/run/sshd
EXPOSE 22

ENTRYPOINT ["./docker-entrypoint.sh"]