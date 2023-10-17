#!/bin/sh

. /lib/functions/gl_util.sh

action=$1

logger -p notice -t blue-merle-toggle  "Called... ${action}"

if [ "$action" = "on" ];then
    mcu_send_message "Blue Merle ${action}"
    echo "on" > /tmp/sim_change_switch
    flock -n /tmp/blue-merle-switch.lock   /usr/bin/blue-merle-switch  ||  logger -p notice -t blue-merle-toggle  "Lockfile busy" &

elif [ "$action" = "off" ];then
    mcu_send_message "Blue Merle ${action}"
    echo "off" > /tmp/sim_change_switch

else
    echo "off" > /tmp/sim_change_switch
fi
sleep 1
