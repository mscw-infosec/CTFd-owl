#!/bin/bash

echo "${FLAG}" > /flag.txt

rm -rf /tmp/build

exec /usr/sbin/sshd -D