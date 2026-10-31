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

# iPhone hotspots use one band, 5 GHz by default, with WPA2/WPA3 mixed and optional
# management frame protection; turn off 2.4 GHz access points if a 5 GHz one is
# enabled, a guest network on 2.4 GHz moves to 5 GHz
IPHONE_RADIO () {
    five=0
    guest_on=0
    for s in $(uci -q show wireless | sed -n 's/^wireless\.\([^.=]*\)=wifi-iface$/\1/p'); do
        [ "$(uci -q get wireless.$s.mode)" = "ap" ] || continue
        dev=$(uci -q get wireless.$s.device)
        case "$(uci -q get wireless.$dev.band)$(uci -q get wireless.$dev.hwmode)" in
            *5g*|*11a*)
                uci set wireless.$s.encryption=sae-mixed
                uci set wireless.$s.ieee80211w=1
                [ "$(uci -q get wireless.$s.disabled)" = "1" ] || [ "$(uci -q get wireless.$dev.disabled)" = "1" ] || five=1;;
        esac
    done
    [ $five = 1 ] || return 0
    for s in $(uci -q show wireless | sed -n 's/^wireless\.\([^.=]*\)=wifi-iface$/\1/p'); do
        [ "$(uci -q get wireless.$s.mode)" = "ap" ] || continue
        dev=$(uci -q get wireless.$s.device)
        case "$(uci -q get wireless.$dev.band)$(uci -q get wireless.$dev.hwmode)" in
            *5g*|*11a*) ;;
            *)
                [ "$(uci -q get wireless.$s.guest)" = "1" ] && [ "$(uci -q get wireless.$s.disabled)" != "1" ] && guest_on=1
                uci set wireless.$s.disabled=1;;
        esac
    done
    [ $guest_on = 1 ] || return 0
    for s in $(uci -q show wireless | sed -n 's/^wireless\.\([^.=]*\)=wifi-iface$/\1/p'); do
        [ "$(uci -q get wireless.$s.guest)" = "1" ] || continue
        dev=$(uci -q get wireless.$s.device)
        case "$(uci -q get wireless.$dev.band)$(uci -q get wireless.$dev.hwmode)" in
            *5g*|*11a*) uci set wireless.$s.disabled=0;;
        esac
    done
}

# with a German SIM (MCC 262), use channel 44 on 5 GHz like iPhone hotspots there;
# used on IMEI change, $1 is the IMSI of the SIM, only its country code is used
IPHONE_CHANNEL () {
    [ "$(uci -q get blue-merle.wifi.ssid)" = "iphone" ] || return 0
    case "$1" in 262*) ;; *) return 0;; esac
    for dev in $(uci -q show wireless | sed -n 's/^wireless\.\([^.=]*\)=wifi-device$/\1/p'); do
        case "$(uci -q get wireless.$dev.band)$(uci -q get wireless.$dev.hwmode)" in
            *5g*|*11a*) uci set wireless.$dev.channel=44;;
        esac
    done
    uci commit wireless
}

# with blue-merle.wifi.ssid=iphone, give the Wi-Fi networks the most common iPhone
# hotspot name; guest networks get the name iOS gives a second iPhone
RESET_SSIDS () {
    [ "$(uci -q get blue-merle.wifi.ssid)" = "iphone" ] || return 0
    for s in $(uci -q show wireless | sed -n 's/^wireless\.\([^.=]*\)=wifi-iface$/\1/p'); do
        [ "$(uci -q get wireless.$s.mode)" = "ap" ] || continue
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
