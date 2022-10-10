#!/usr/bin/env ash

# This script wipes all MAC address data from the device and is called upon boot

tmp_dir="/tmp/tertf"
tmp_file="/tmp/tertf/tertfinfo_bak"

etc_dir="/etc/tertf"
etc_file="/etc/tertf/tertfinfo_bak"

# Check for directories
CHECKDIR_TMP () {
	if [ -d "$tmp_dir" ]; then
		echo "The /tmp/ directory exists."
	else 
		echo "The /tmp/ directory does not exist. This should be fine..."
	fi
}

CHECKDIR_ETC () {
	if [ -d "$etc_dir" ]; then
		echo "The /etc/ directory exists."
	else 
		echo "The /etc/ directory does not exist. Exiting..."
		exit 1
	fi
}

# trick the gl_tertf file into moving stuff to the void
GASLIGHT () { # good job lil dude you're doing so well 
	local file="/etc/init.d/gl_tertf"
	ln -sf /dev/null "$file"
}

CHECKDIR_TMP
CHECKDIR_ETC
GASLIGHT

# Kills process responsible for manipulating (and protecting) the /tmp/ file instance
killall -9 gltertf

# shredding /tmp/tertf
if [ -f "$tmp_file" ];then
	echo "Files found within /tmp/. Let's get to it."
	shred -v -u "$tmp_file"
else
	echo "No file found within /tmp/tertf. No shredding to be done there."
fi

# shredding /etc/tertf
if [ -f "$etc_file" ]; then
	echo "Files found in /etc/. Let's get to it."
	shred -v -u "$etc_file" #-v provides verbose output to ease my anxious mind and -u deletes files after they are overwritten
else
	echo "No file found within /etc/tertf. No shredding to be done there."
fi

# check if the files have been removed
if [ ! -f "$tmp_file" ]; then
		echo "Looks like /tmp/ is clean!"
	else 
		echo "Something went wrong in /tmp/."
fi

if [ ! -f "$etc_file" ]; then
		echo "Looks like /etc/ is clean!"
	else 
		echo "Something went wrong in /etc/."
fi

exit 0
