#!/usr/bin/env ash

# This script provides helper functions for blue-merle


UNICAST_MAC_GEN () {
    loc_mac_numgen=`python3 -c "import random; print(f'{random.randint(0,2**48) & 0b111111101111111111111111111111111111111111111111:0x}'.zfill(12))"`
    loc_mac_formatted=$(echo "$loc_mac_numgen" | sed 's/^\(..\)\(..\)\(..\)\(..\)\(..\)\(..\).*$/\1:\2:\3:\4:\5:\6/')
    echo "$loc_mac_formatted"
}

# randomize BSSID
RESET_BSSIDS () {
    uci set wireless.@wifi-iface[1].macaddr=`UNICAST_MAC_GEN`
    uci set wireless.@wifi-iface[0].macaddr=`UNICAST_MAC_GEN`
    uci commit wireless
    # you need to reset wifi for changes to apply, i.e. executing "wifi"
}

# succeeds if wifi-device $1 is a 2.4 GHz radio
RADIO_2G () {
    case "$(uci -q get wireless.$1.band)" in 2g) return 0;; 5g|6g) return 1;; esac
    case "$(uci -q get wireless.$1.hwmode)" in *a) return 1;; esac
    return 0
}

AP_IFACES () {
    for s in $(uci -q show wireless | sed -n 's/^wireless\.\([^.=]*\)=wifi-iface$/\1/p'); do
        [ "$(uci -q get wireless.$s.mode)" = "ap" ] && echo $s
    done
}

# on IMEI change, store only whether the SIM ($1: IMSI) is European (MCC 2xx)
IPHONE_REGION () {
    [ "$(uci -q get blue-merle.wifi.ssid)" = "iphone" ] || return 0
    case "$1" in
        2[0-9][0-9]*) uci set blue-merle.wifi.region=europe;;
        *) uci -q delete blue-merle.wifi.region;;
    esac
    uci commit blue-merle
}

# use one band like an iPhone hotspot: 2.4 GHz channel 6 with WPA2, or with a European
# SIM in 37 % of boots, the share on WiGLE, 5 GHz channel 44 with WPA2/WPA3
IPHONE_RADIO () {
    on=0
    guest_on=0
    has2=0
    has5=0
    for s in $(AP_IFACES); do
        dev=$(uci -q get wireless.$s.device)
        [ "$(uci -q get wireless.$s.guest)" = "1" ] || { RADIO_2G $dev && has2=1 || has5=1; }
        [ "$(uci -q get wireless.$s.disabled)" = "1" ] && continue
        [ "$(uci -q get wireless.$dev.disabled)" = "1" ] && continue
        on=1
        [ "$(uci -q get wireless.$s.guest)" = "1" ] && guest_on=1
    done
    [ $on = 1 ] || return 0
    five=0
    if [ "$(uci -q get blue-merle.wifi.region)" = "europe" ] && [ $has5 = 1 ]; then
        [ $(( $(hexdump -n2 -e '/2 "%u"' /dev/urandom) % 100 )) -lt 37 ] && five=1
    fi
    [ $has2 = 1 ] || [ $five = 1 ] || return 0
    for s in $(AP_IFACES); do
        dev=$(uci -q get wireless.$s.device)
        band5=1
        RADIO_2G $dev && band5=0
        if [ $band5 != $five ]; then
            uci set wireless.$s.disabled=1
            continue
        fi
        if [ "$(uci -q get wireless.$s.guest)" = "1" ]; then
            uci set wireless.$s.disabled=$((1 - guest_on))
        else
            uci set wireless.$s.disabled=0
        fi
        uci set wireless.$dev.disabled=0
        if [ $five = 1 ]; then
            uci set wireless.$dev.channel=44
            uci set wireless.$s.encryption=sae-mixed
            uci set wireless.$s.ieee80211w=1
        else
            uci set wireless.$dev.channel=6
            uci set wireless.$s.encryption=psk2
            uci -q delete wireless.$s.ieee80211w
        fi
    done
}

# with blue-merle.wifi.ssid=iphone, give the Wi-Fi networks the most common iPhone
# hotspot name; guest networks get the name iOS gives a second iPhone
RESET_SSIDS () {
    [ "$(uci -q get blue-merle.wifi.ssid)" = "iphone" ] || return 0
    for s in $(AP_IFACES); do
        if [ "$(uci -q get wireless.$s.guest)" = "1" ]; then
            uci set wireless.$s.ssid="iPhone (2)"
        else
            uci set wireless.$s.ssid="iPhone"
        fi
    done
    IPHONE_RADIO
    uci commit wireless
}


RANDOMIZE_MACADDR () {
    # This changes the MAC address clients see when connecting to the WiFi spawned by the device.
    # You can check with "arp -a" that your endpoint, e.g. your laptop, sees a different MAC after a reboot of the Mudi.
    uci set network.@device[1].macaddr=`UNICAST_MAC_GEN`
    # Here we change the MAC address the upstream wifi sees
    uci set glconfig.general.macclone_addr=`UNICAST_MAC_GEN`
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
