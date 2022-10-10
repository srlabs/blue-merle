# blue-merle

The *blue-merle* software package enhances anonymity and reduces forensic traceability of the **GL-E750 / Mudi 4G mobile wi-fi router ("Mudi router")**. The portable device is explicitly marketed to privacy-interested retail users.

*blue-merle* addresses the traceability drawbacks of the Mudi router by adding the following features to the Mudi router:

1.  Mobile Equipment Identity (IMEI) changer

2.  Media Access Control (MAC) address log wiper

3.  Basic Service Set Identifier (BSSID) randomization

## Installing prebuild package

Download the [prebuild package](https://github.com/srlabs/blue-merle/releases) and copy it onto your Mudi, preferably into the /tmp folder. Then install the package file:

```
opkg update
opkg install blue-merle*.ipk
```

Now you may initiate an IMEI update on the command line by running `blue-merle`  or by using Mudi's toggle button. Both the command line and hardware button version of *blue-merle* will guide you through the IMEI update process in order to minimize the risk of IMEI leaks.

The *blue-merle* package has been verified to work with GL-E750 Mudi version 3.215. A MCU version >= 1.0.7 is required. The MCU may be updated through the *blue-merle* package installer or [manually](https://github.com/gl-inet/GL-E750-MCU-instruction). SRLabs cannot guarantee that the project assets within this Git repository will be compatible with future firmware updates.

## Build package
```
git clone https://github.com/openwrt/openwrt
cd openwrt
git clone https://github.com/srlabs/blue-merle package/blue-merle
./scripts/feeds update -a && ./scripts/feeds install -a
make distclean && make clean
make menuconfig
	# Target System: Atheros ATH79
	# Subtarget Generic Device with NAND flash
	# Target Profile: GL.iNet GL-E750
	# In Utilities, select <M> for blue-merle package
	# Save new configuration
make
make package/blue-merle/compile
```
You will find the package in `./bin/packages/mips_24kc/base/`

## Implementation details

### IMEI randomization

The Mudi router's baseband unit is a Quectel EP06-E/A Series LTE Cat 6 Mini PCIe [module](https://www.quectel.com/wp-content/uploads/pdfupload/Quectel_EP06_Series_LTE-A_Specification_V1.7.pdf>).

The Mudi router's IMEI can be changed by issuing Quectel LTE series-standard AT commands. The AT command to write a new IMEI to a Quectel EP06-E/A-based device is `AT+EGMR`.

Our IMEI randomization functionality is built around this command and implements two approaches to IMEI generation. The first deterministic method seeds the new value with the user's ISMI, while the second generates a random IMEI.

To change the IMEI on the command-line, run `blue-merle` and follow the instructions. Alternatively, you can use the hardware switch button to set a random IMEI.

SRLabs researchers verified that the Mudi router's IMEI can be changed persistently by connecting the device to a custom telco base station set-up. The changed IMEI is recorded within the new base station database entry, confirming that the IMEI change is observed both on the device- and ISP-level.

Furthermore, to ensure that there is no leakage of the old IMEI after changing the SIM card and setting a new IMEI, the Mudi router's radio is turned off in advance. Both the command-line and hardware switch version of *blue-merle* will guide you through the IMEI update process in order to minimize the risk of IMEI leaks.

Running *blue-merle* will disrupt the device's connection with the ISP during the time the IMEI is changed, and by default the connection is only reestablished once the device is rebooted. 

This process can be observed in Figure 1, where there is a large break in connectivity between entries 70 and 80. This break is the result of turning the radio off.

![Figure 1. The router's radio is turned off and the IMEI is randomized between entries 70 and 80. The ISP cannot connect to it.](https://github.com/srlabs/blue-merle/blob/main/IMEI%20randomization.png)

[Figure 1](https://github.com/srlabs/blue-merle/blob/main/IMEI%20randomization.png) The router's radio is turned off and the IMEI is randomized between entries 70 and 80. The ISP cannot connect to it.

### Basic Service Set Identifier (BSSID) randomization

The Mudi router BSSID is set by the hostapd process using the `mac80211_prepare_vif()` function in `/rom/lib/netifd/wireless/mac80211.sh`. The resulting BSSID is stored in `/etc/config/wireless`.

The implemented BSSID randomization function generates a valid unicast address value and overrides the current MAC values set within the `wlan0` and `wlan1` interfaces. This is done by issuing OpenWrt uci set commands targeting the macaddr fields of `wireless.@wifi-iface[0]` and `wireless.@wifi-iface[1]`. The Mudi router's wifi is then reset to implement the changes.

The BSSID randomization feature is run on boot, ensuring that a new BSSID is generated each time the device is started.

### MAC address log wiping

Connecting devices' MAC addresses are stored within the Mudi router at `/tmp/tertf(_bak)` and `/etc/tertf(_bak)`. The MAC address log wiper first symbolically links the gl_tertf file responsible for the gltertf process, which reads and writes MAC addresses to the above-mentioned directories. It then kills the gltertf process if active, checks if either directory contains any data, and uses shred to delete any data if found.

The MAC address log wiper is run on boot, ensuring that the Mudi device's initial MAC read/write functionality is disrupted each time the device is started.
   
## Acknowledgement: blue merle

The Mudi device shares a name with a Hungarian dog breed typically used to guard and herd flocks of livestock. Mudi dogs are agile, fast-learners and extremely friendly.

"Blue merle" is one of the five coat colours recognized for the Mudi dog breed by the Federation Cynologique Internationale and is characterized by its mottled or patched appearance. The black splashes on the blueish-gray coat of the blue merle Mudi inspired the name of this project because of its obscuring appearance and camouflaging symbolism.
