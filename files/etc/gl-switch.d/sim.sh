#!/bin/sh
action=$1
logger -p notice -t blue-merle-toggle  "Called... ${action}"


. /lib/functions/gl_util.sh



if [ "$action" = "on" ];then
    mcu_send_message "Blue Merle ${action}"
    echo "on" > /tmp/sim_change_switch
    flock -n /tmp/blue-merle-switch.lock logger -p notice -t blue-merle-toggle "Running Stage 1" ||  logger -p notice -t blue-merle-toggle  "Lockfile busy"
    flock -n /tmp/blue-merle-switch.lock  timeout 90  /usr/bin/blue-merle-switch-stage1

elif [ "$action" = "off" ];then
    # We check for any previous run and eventually execute the second stage. We could check for the age of this marker and only activate the second stage is the marker is young enough.
    if [ -f /tmp/blue-merle-stage1 ]; then
        flock -n /tmp/blue-merle-switch.lock  ||  logger -p notice -t blue-merle-toggle  "Lockfile busy" &
        flock -n /tmp/blue-merle-switch.lock  timeout 90  /usr/bin/blue-merle-switch-stage2
    else
        logger -p notice -t blue-merle-toggle  "No Stage 1; Toggling Off"
    fi
    echo "off" > /tmp/sim_change_switch

else
    echo "off" > /tmp/sim_change_switch
fi
logger -p notice -t blue-merle-toggle  "Finished Switch $action"
sleep 1
