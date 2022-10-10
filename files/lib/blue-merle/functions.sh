#!/usr/bin/env ash

# This script provides helper functions for blue-merle

# check that MAC wiping/linking to dev/null is still in place
CHECKMACSYMLINK () {
	local loc_file="/etc/init.d/gl_tertf"
    if [ $(readlink -f "$loc_file") == "/dev/null" ]
    then 
        echo "TEST: EXISTS"
    else
        echo "TEST: DOES NOT EXIST"
        cp "$loc_file" "$loc_file.bak" # todo: consider if we need to move this backup elsewhere?
        ln -sf /dev/null "$loc_file"
    fi
}

# Restore gl_tertf from back-up
RESTORE_GL_TERTF () {
    local loc_file="/etc/init.d/gl_tertf"
    local loc_backup="/etc/init.d/gl_tertf.bak"
    #local loc_location="/etc/init.d"
    rm "$loc_file"
    mv "$loc_backup" "$loc_file"
}

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
    wifi # need to reset wifi for changes to apply
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

CHECK_ABORT () {
        sim_change_switch=`cat /tmp/sim_change_switch`
        if [[ "$sim_change_switch" = "off" ]]; then   
                e750-mcu "SIM change      aborted."   
                sleep 1                               
                exit 1                                
        fi
}
