#!/usr/bin/env ash

# This script wipes all MAC address data from the device and is called upon boot

/etc/init.d/gl-tertf stop
shred /etc/oui-tertf/client.db ||  rm -f /etc/oui-tertf/client.db
# We mount a tmpfs so that the client database will be stored in memory only
mount -t tmpfs / /etc/oui-tertf
/etc/init.d/gl-tertf start
