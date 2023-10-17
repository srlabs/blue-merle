#!/bin/sh
action=$1
logger -p notice -t blue-merle-toggle  "Called... ${action}"


. /lib/functions/gl_util.sh



if [ "$action" = "on" ];then
    mcu_send_message "Blue Merle ${action}"
    echo "on" > /tmp/sim_change_switch
    flock -n /tmp/blue-merle-switch.lock  timeout 90  /usr/bin/blue-merle-switch  ||  logger -p notice -t blue-merle-toggle  "Lockfile busy" &
    logger -p notice -t blue-merle-toggle  "Finished Switch"

elif [ "$action" = "off" ];then
    mcu_send_message "Blue Merle ${action}"
    echo "off" > /tmp/sim_change_switch

else
    echo "off" > /tmp/sim_change_switch
fi
sleep 1
