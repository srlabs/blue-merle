#!/usr/bin/env ash

# This script provides helper functions for blue-merle

# ------------------------------------------------------------------------------
# GENERATE_BSSID_MIMIC
#   Produce a “real‐looking” router BSSID by picking a known vendor OUI:
#     - TP-Link:    50:3E:AA
#     - Cisco:      00:1A:2B
#     - Netgear:    44:94:FC
#     - Asus:       94:E0:4F
#     - Linksys:    00:03:47
#     - D-Link:     00:0D:FB
# ------------------------------------------------------------------------------

GENERATE_BSSID_MIMIC() {
  python3 - "$@" <<'PYCODE'
import random
# Six common router OUIs
ouis = [
  "50:3E:AA",  # TP-Link
  "00:1A:2B",  # Cisco
  "44:94:FC",  # Netgear
  "94:E0:4F",  # Asus
  "00:03:47",  # Linksys
  "00:0D:FB",  # D-Link
]
oui = random.choice(ouis)
# generate the remaining 3 bytes (24 bits)
tail = random.getrandbits(24)
print(f"{oui}:{tail:06X}")
PYCODE
}

# ------------------------------------------------------------------------------
# GENERATE_PHONE_MAC_MIMIC
#   Produce a “real‐looking” phone MAC by picking a popular smartphone OUI:
#     - Apple:      AC:37:43
#     - Samsung:    00:16:6C
#     - Xiaomi:     74:85:2A
#     - Huawei:     8C:6B:4B
#     - LG:         00:1E:65
#     - Sony:       00:22:75
#     - OnePlus:    74:D0:2B
#     - Google:     3C:5A:B4
#     - Motorola:   00:1B:32
#     - Oppo:       00:11:24
#     - Vivo:       84:7A:88
#     - Nokia:      84:2B:2B
# ------------------------------------------------------------------------------

GENERATE_PHONE_MAC_MIMIC() {
  python3 - "$@" <<'PYCODE'
import random
# Twelve common phone/vendor OUIs
ouis = [
  "AC:37:43",  # Apple
  "00:16:6C",  # Samsung
  "74:85:2A",  # Xiaomi
  "8C:6B:4B",  # Huawei
  "00:1E:65",  # LG
  "00:22:75",  # Sony
  "74:D0:2B",  # OnePlus
  "3C:5A:B4",  # Google
  "00:1B:32",  # Motorola
  "00:11:24",  # Oppo
  "84:7A:88",  # Vivo
  "84:2B:2B",  # Nokia
]
oui = random.choice(ouis)
tail = random.getrandbits(24)
print(f"{oui}:{tail:06X}")
PYCODE
}

# ------------------------------------------------------------------------------
# UNICAST_MAC_GEN
#   Default to a phone‐style MAC; if you ever need pure randomness, swap in the
#   original routine here instead.
# ------------------------------------------------------------------------------

UNICAST_MAC_GEN() {
  GENERATE_PHONE_MAC_MIMIC
}

# randomize BSSID
RESET_BSSIDS () {
    # use mimic router OUIs for BSSID
    uci set wireless.@wifi-iface[1].macaddr="$(GENERATE_BSSID_MIMIC)"
    uci set wireless.@wifi-iface[0].macaddr="$(GENERATE_BSSID_MIMIC)"
    uci commit wireless
    # you need to reset wifi for changes to apply, i.e. executing "wifi"
}

RANDOMIZE_MACADDR () {
    # This changes the MAC address clients see when connecting to the WiFi spawned by the device.
    # You can check with "arp -a" that your endpoint, e.g. your laptop, sees a different MAC after a reboot of the Mudi.
    uci set network.@device[1].macaddr="$(UNICAST_MAC_GEN)"
    # Here we change the MAC address the upstream wifi sees
    uci set glconfig.general.macclone_addr="$(UNICAST_MAC_GEN)"
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
            local imsi=$(gl_modem AT AT+CIMI | grep -w -E "[0-9]{6,15]")
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
