#!/usr/bin/env ash

# This script wipes all MAC address data from the device and is called upon boot

tmpdir="$(mktemp -d)"
# We mount a tmpfs so that the client database will be stored in memory only
mount -t tmpfs / "$tmpdir"
/etc/init.d/gl-tertf stop
cp -a /etc/oui-tertf/client.db "$tmpdir"
shred /etc/oui-tertf/client.db ||  rm -f /etc/oui-tertf/client.db

mount -t tmpfs / /etc/oui-tertf
cp -a "$tmpdir/client.db" /etc/oui-tertf/client.db
umount -t tmpfs -l "$tmpdir"

logger -p notice -t blue-merle-mac-wipe "Restarting tertf..."
/etc/init.d/gl-tertf start
logger -p notice -t blue-merle-mac-wipe "... Finished"
