#!/usr/bin/env ash

# This script provides helper functions for blue-merle


BM_OUI_TABLE=/etc/blue-merle/oui-vendors

UNICAST_MAC_GEN () {
    loc_mac_numgen=`python3 -c "import random; print(f'{random.randint(0,2**48) & 0b111111101111111111111111111111111111111111111111:0x}'.zfill(12))"`
    loc_mac_formatted=$(echo "$loc_mac_numgen" | sed 's/^\(..\)\(..\)\(..\)\(..\)\(..\)\(..\).*$/\1:\2:\3:\4:\5:\6/')
    echo "$loc_mac_formatted"
}

# True when the GL firmware ships its own MAC randomization and the user asked
# us to defer to it (mac.auto_disable_native). The exact uci key differs between
# GL firmware versions, so we probe a few and can be extended as new ones appear.
# 4.3.26 has none of these, so this returns false there.
GL_NATIVE_MAC_RANDOM_ACTIVE () {
    [ "$(uci -q get blue-merle.mac.auto_disable_native)" = "1" ] || return 1
    for key in glconfig.general.mac_random glconfig.general.macrandom \
               glconfig.general.random_mac network.@device[1].random_mac; do
        v=$(uci -q get "$key")
        [ -n "$v" ] && [ "$v" != "0" ] && [ "$v" != "off" ] && return 0
    done
    return 1
}

# Master toggle: vendor mimicry on AND not deferring to a native feature.
MAC_MIMIC_ENABLED () {
    [ "$(uci -q get blue-merle.mac.mimic)" = "1" ] || return 1
    GL_NATIVE_MAC_RANDOM_ACTIVE && return 1
    return 0
}

# coherent (default): every interface derives from one base MAC with a
# sequential last octet, the way real single-vendor hardware lays out its
# interfaces (eth0 ..:63, wlan0 ..:64, wlan1 ..:65). split: router and client
# roles get independent vendor OUIs. BM_MAC_BASE holds the shared base for the
# current apply run.
BM_MAC_BASE=""

MAC_MODE () {
    [ "$(uci -q get blue-merle.mac.mode)" = "split" ] && echo split || echo coherent
}

# Generate the shared base once per apply (router-vendor OUI + random NIC).
# Empty in split mode / when disabled, so GEN_MAC falls back to per-role OUIs.
MAC_BASE_INIT () {
    if MAC_MIMIC_ENABLED && [ "$(MAC_MODE)" = "coherent" ]; then
        BM_MAC_BASE=$(python3 /lib/blue-merle/mac_mimic.py ap "$(uci -q get blue-merle.mac.ap_vendors)" "$BM_OUI_TABLE")
    else
        BM_MAC_BASE=""
    fi
}

# GEN_MAC <role> <offset>
# coherent -> base + offset (one OUI, sequential); split -> per-role vendor OUI;
# disabled -> the original random unicast address.
GEN_MAC () {
    local role="$1" offset="${2:-0}" vendors=""
    if MAC_MIMIC_ENABLED; then
        if [ -n "$BM_MAC_BASE" ]; then
            python3 /lib/blue-merle/mac_mimic.py derive "$BM_MAC_BASE" "$offset" && return 0
        else
            case "$role" in
                ap)     vendors=$(uci -q get blue-merle.mac.ap_vendors) ;;
                client) vendors=$(uci -q get blue-merle.mac.client_vendors) ;;
            esac
            python3 /lib/blue-merle/mac_mimic.py "$role" "$vendors" "$BM_OUI_TABLE" && return 0
        fi
    fi
    UNICAST_MAC_GEN
}

# List the distinct vendors available for a role ("ap"|"client"), comma-joined.
# Pure awk (no sort/paste) so it works on busybox.
MAC_LIST_VENDORS () {
    awk -v kind="$1" '
        /^[ \t]*#/ { next }
        NF>=3 && $3==kind && !seen[$1]++ { out = out sep $1; sep="," }
        END { print out }
    ' "$BM_OUI_TABLE"
}

# randomize BSSID
RESET_BSSIDS () {
    MAC_BASE_INIT
    uci set wireless.@wifi-iface[0].macaddr=`GEN_MAC ap 0`
    uci set wireless.@wifi-iface[1].macaddr=`GEN_MAC ap 1`
    uci commit wireless
    # you need to reset wifi for changes to apply, i.e. executing "wifi"
}


RANDOMIZE_MACADDR () {
    # This changes the MAC address clients see when connecting to the WiFi spawned by the device.
    # You can check with "arp -a" that your endpoint, e.g. your laptop, sees a different MAC after a reboot of the Mudi.
    # In coherent mode this shares the base set up by RESET_BSSIDS in the same
    # run; if we're called standalone, seed one first.
    [ -z "$BM_MAC_BASE" ] && MAC_BASE_INIT
    uci set network.@device[1].macaddr=`GEN_MAC client 2`
    # Here we change the MAC address the upstream wifi sees
    uci set glconfig.general.macclone_addr=`GEN_MAC client 3`
    uci commit network
    # You need to restart the network, i.e. /etc/init.d/network restart
}

READ_ICCID() {
    gl_modem AT AT+CCID
}


READ_IMEI () {
	local answer=1
	while [[ "$answer" -eq 1 ]]; do
	        local imei=$(gl_modem AT AT+GSN | grep -w -E "[0-9]{14,15}")
	        if [[ $? -eq 1 ]]; then
                	echo -n "Failed to read IMEI. Try again? (Y/n): "
	                read answer
	                case $answer in
	                        n*) answer=0;;
	                        N*) answer=0;;
	                        *) answer=1;;
	                esac
	                if [[ $answer -eq 0 ]]; then
	                        exit 1
	                fi
	        else
	                answer=0
	        fi
	done
	echo $imei
}

READ_IMSI () {
	local answer=1
	while [[ "$answer" -eq 1 ]]; do
	        local imsi=$(gl_modem AT AT+CIMI | grep -w -E "[0-9]{6,15}")
	        if [[ $? -eq 1 ]]; then
                	echo -n "Failed to read IMSI. Try again? (Y/n): "
	                read answer
	                case $answer in
	                        n*) answer=0;;
	                        N*) answer=0;;
	                        *) answer=1;;
	                esac
	                if [[ $answer -eq 0 ]]; then
	                        exit 1
	                fi
	        else
	                answer=0
	        fi
	done
	echo $imsi
}


GENERATE_IMEI() {
    local seed=$(head -100 /dev/urandom | tr -dc "0123456789" | head -c10)
    local imei=$(lua /lib/blue-merle/luhn.lua $seed)
    echo -n $imei
}

SET_IMEI() {
    local imei="$1"

    if [[ ${#imei} -eq 14 ]]; then
        gl_modem AT AT+EGMR=1,7,${imei}
    else
        echo "IMEI is ${#imei} not 14 characters long"
    fi
}

CHECK_ABORT () {
        sim_change_switch=`cat /tmp/sim_change_switch`
        if [[ "$sim_change_switch" = "off" ]]; then
                echo '{ "msg": "SIM change      aborted." }' > /dev/ttyS0
                sleep 1
                exit 1
        fi
}
