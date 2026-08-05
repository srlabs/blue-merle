#!/usr/bin/env ash

# This script provides helper functions for blue-merle

# Rotation control state lives in a root-only dir (0700), not world-writable /tmp
# (CWE-377 / CWE-379).
mkdir -p /run/blue-merle && chmod 0700 /run/blue-merle


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
        sim_change_switch=`cat /run/blue-merle/sim_change_switch`
        if [[ "$sim_change_switch" = "off" ]]; then
                echo '{ "msg": "SIM change      aborted." }' > /dev/ttyS0
                sleep 1
                exit 1
        fi

        # Generic, switch-independent abort request (F-BRICK / CWE-364/665).
        # The check above only fires while stage1 is running with the
        # physical switch already flipped back to "off" -- during stage2 the
        # switch is already "off" by definition (that is what started it), so
        # it can never signal an abort there. A caller (or a future UI) can
        # instead `touch /run/blue-merle/abort_requested` at any time; every
        # CHECK_ABORT call site in either stage will notice it at the next
        # safe checkpoint, restore the modem, and stop before the next
        # destructive step.
        if [ -f /run/blue-merle/abort_requested ]; then
                rm -f /run/blue-merle/abort_requested
                echo '{ "msg": "SIM change      aborted." }' > /dev/ttyS0
                logger -p notice -t blue-merle-toggle "abort_requested set; aborting swap cleanly"
                SAFE_RESTORE_MODEM
                sleep 1
                exit 1
        fi
}

# --- Recovery from an aborted or failed IMEI write (F-BRICK, CWE-364/665) ---
#
# Pulling the SIM/module, or an AT/EGMR write failing partway through,
# can otherwise leave the modem wedged: SIM power off, radio disabled
# (CFUN=4), and no confirmed IMEI. The two helpers below let a stage
# remember the last known-good, already-confirmed IMEI before it attempts
# to change it, and put the modem back into a known-good state (SIM
# powered, radio enabled, previous IMEI restored if the new write was
# never confirmed) whenever a stage aborts, fails, or exits unexpectedly.

# Record the last confirmed-good IMEI in a shell variable only (process
# memory) -- never write the identifier to the filesystem. /run/blue-merle is
# on the root overlay (UBIFS/flash) on this hardware, not tmpfs, and rm cannot
# securely erase there, so a file would leave a recoverable IMEI on flash.
# SAFE_RESTORE_MODEM always runs in the same shell (guard or EXIT trap), so an
# in-memory value is enough to roll back to.
SAVE_KNOWN_GOOD_IMEI () {
        BM_KNOWN_GOOD_IMEI="$1"
}

# Bring the modem back to a known-good state. Safe to call more than once
# and safe to call even if nothing was actually in progress.
SAFE_RESTORE_MODEM () {
        logger -p notice -t blue-merle-toggle "SAFE_RESTORE_MODEM: restoring modem state"

        # Make sure the SIM is powered regardless of where we got interrupted.
        sim_switch on >/dev/null 2>&1

        # If an EGMR write was started but never confirmed, restore the
        # last known-good IMEI (kept in memory, never on disk) instead of
        # leaving a half-written value.
        if [ -f /run/blue-merle/imei_write_pending ]; then
                if [ -n "$BM_KNOWN_GOOD_IMEI" ]; then
                        SET_IMEI "$BM_KNOWN_GOOD_IMEI" >/dev/null 2>&1
                fi
                rm -f /run/blue-merle/imei_write_pending
        fi

        # Re-enable full functionality so the modem attaches again instead
        # of being left disabled (CFUN=4).
        restore_tries=3
        while [ $restore_tries -gt 0 ]; do
                gl_modem AT AT+CFUN=1 | grep -q OK && break
                restore_tries=$((restore_tries-1))
                sleep 1
        done

        # Don't let a stray reboot believe an interrupted stage1 completed.
        rm -f /run/blue-merle/stage1

        logger -p notice -t blue-merle-toggle "SAFE_RESTORE_MODEM: done"
}
