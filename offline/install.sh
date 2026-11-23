#!/bin/sh
# Installs blue-merle and the dependencies bundled next to this script
# without an Internet connection, then starts the IMEI change.
set -e
cd "$(dirname "$0")"

# Firmware 4.3.30 no longer has LuCI preinstalled but ships it in /etc/luci_ipks;
# install it from there, as the "Install LuCI" button in the GL web interface does.
if ! opkg list-installed | grep -q '^luci-base ' && [ -d /etc/luci_ipks ] && [ -f /usr/bin/init_luci.sh ]; then
	echo "Installing LuCI from the firmware"
	sh /usr/bin/init_luci.sh
fi

opkg install ./*.ipk

# Change the IMEI right away, so the Mudi doesn't go online with its original one.
blue-merle
