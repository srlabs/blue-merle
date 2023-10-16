#!/bin/sh

action=$1

logger -p notice -t blue-merle-toggle  "Called... ${action}"

if [ "$action" = "on" ];then
    echo "on" > /tmp/sim_change_switch

elif [ "$action" = "off" ];then
    echo "off" > /tmp/sim_change_switch
else
    echo "off" > /tmp/sim_change_switch
fi
sleep 1

