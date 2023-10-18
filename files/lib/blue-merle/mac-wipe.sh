#!/usr/bin/env ash

# This script ensures that MAC addresses are stored on volatile memory rather than flash

tmpdir="$(mktemp -d)"
# We mount a tmpfs so that the client database will be stored in memory only
mount -t tmpfs / "$tmpdir"
## Somehow, we cannot "stop" this service as it does not define such action. There is also no such process. Weird.
# /etc/init.d/gl-tertf stop
cp -a /etc/oui-tertf/client.db "$tmpdir"
shred /etc/oui-tertf/client.db ||  rm -f /etc/oui-tertf/client.db
# If this script runs multiple times, we accumulate mounts; we try to avoid having mounts over mounts, so we unmount any existing tmpfs
umount -t tmpfs -l /etc/oui-tertf

mount -t tmpfs / /etc/oui-tertf
cp -a "$tmpdir/client.db" /etc/oui-tertf/client.db
umount -t tmpfs -l "$tmpdir"


if [[ "$1" == "restart" ]]; then
    logger -p notice -t blue-merle-mac-wipe "Restarting tertf..."
    /etc/init.d/gl-tertf start
    logger -p notice -t blue-merle-mac-wipe "... Finished"
else
    echo You will need to restart the gl-tertf service, i.e. /etc/init.d/gl-tertf restart
fi
