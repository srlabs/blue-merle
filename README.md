# blue-merle

The *blue-merle* software package enhances anonymity and reduces forensic traceability of the **GL-E750 / Mudi 4G mobile wi-fi router ("Mudi router")**. The portable device is explicitly marketed to privacy-interested retail users.

*blue-merle* addresses the traceability drawbacks of the Mudi router by adding the following features to the Mudi router:

1.  Mobile Equipment Identity (IMEI) changer
2.  Media Access Control (MAC) address log wiper
3.  Basic Service Set Identifier (BSSID) randomization
4.  MAC Address randomization

## Compatibility

**This README covers the v2.0 release**, which has been verified to work with GL-E750 Mudi version 4.3.8 - 4.3.12 .
Refer back to the [v1.0 README file](https://github.com/srlabs/blue-merle/tree/cb4d73731fe432e0f101284307101c250ca4b845) for information about the first release, which works on older firmware releases.

A MCU version >= 1.0.7 is required. The MCU may be updated through the *blue-merle* package installer or [manually](https://github.com/gl-inet/GL-E750-MCU-instruction). SRLabs cannot guarantee that the project assets within this Git repository will be compatible with future firmware updates.

## Installation

### Online install & upgrade

The online install method requires an **active Internet connection** on your Mudi device to **download up-to-date dependencies**.

Download the [prebuilt v2.0 release package](https://github.com/srlabs/blue-merle/releases/download/v2.0/blue-merle_2.0.0-0_mips_24kc.ipk) and copy it onto your Mudi (e.g. via `scp`), preferably into the `/tmp` folder. Then install the package file:

```sh
opkg update
opkg install blue-merle*.ipk
```
To uprade blue-merle, download the newest blue-merle*.ipk, copy it to your Mudi and reinstall with:
```sh
opkg install --force-reinstall blue-merle*.ipk
```

### Offline install

The offline install method does **not need an active Internet connection** on your Mudi device.

Download the [prebuilt v2.0 offline release package](https://github.com/srlabs/blue-merle/releases/download/v2.0/blue-merle_2.0.0-0_offline_install.zip), then execute the following commands:

```sh
## Execute the following commands on the computer connected to the Mudi via WiFi / LAN

unzip /path/to/downloaded.zip

# Copy the offline release package to your Mudi
# -O might be needed due to SSH daemon used by Mudi
scp -O -r blue_merle_install root@192.168.8.1:/tmp

# Connect to Mudi via SSH
ssh root@192.168.8.1

## Execute the following commands inside the SSH tunnel
# Install dependencies and blue-merle
cd /tmp/blue_merle_install
./install.sh
```

**Note**: The offline install package bundles dependencies collected in October 2023. These dependencies could be outdated at the time of installation and might not be compatible with future Mudi firmware versions.

## Usage

You may initiate an IMEI update in three different ways:

1. **CLI**: via SSH on the command line,
2. **Toggle**: using the Mudi's physical toggle switch, or
3. **Web**: via the LuCI web interface.

You can set a deterministic or randomized IMEI on the command line. *Blue-merle*'s web and toggle interfaces always set a randomized IMEI.

### CLI

Connect to the device via SSH, then execute the `blue-merle` command. The command guides you through the process of **changing your SIM card**. We advise you to **reboot the device** after changing the IMEI.

### Toggle

This is a two-stage process.

Flip the Mudi's hardware switch to initiate the first stage of changing your device's IMEI. Follow the instructions on the display, which will ask you to **replace the SIM card** at the end.

After replacing the SIM card, flip the switch again. The second stage **changes the IMEI** and then **powers off** the device. You should **change location** before booting again.

**Note**: Occasionally, commands may take longer than expected to execute on the device. This can result in the display switching off (standby) for a few seconds before displaying the expected final message (e.g. instructions to replace the SIM card). Wait for the final message to appear before pulling the switch again. If no message is displayed after a minute, the script might have exited or you might have missed the message. In this case, pull the switch to continue / restart the process.

### Web

Open LuCI from `System` > `Advanced Settings` in Mudi's web interface. Find the `Blue Merle` settings under the `Network` tab. The web interface displays the current IMEI and IMSI and provides a button (`"SIM Swap..."`) to set a new randomized IMEI.

**Shutdown the device** once the process is complete. Then **swap your SIM card** and **change location** before booting again.

## Building

This repository contains a CI script to auto-build the project using GitHub actions. Simply fork the repository or replicate the workflow on your local machine to build packages.

You can also setup a full OpenWRT development environment and build the *blue-merle* package using:

```sh
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

The Mudi router's baseband unit is a Quectel EP06-E/A Series LTE Cat 6 Mini PCIe [module](https://www.quectel.com/wp-content/uploads/pdfupload/Quectel_EP06_Series_LTE-A_Specification_V1.7.pdf).

The Mudi router's IMEI can be changed by issuing Quectel LTE series-standard AT commands. The AT command to write a new IMEI to a Quectel EP06-E/A-based device is `AT+EGMR`.

Our IMEI randomization functionality is built around this command and implements two approaches to IMEI generation. The deterministic IMEI generation method generates a pseudo-random IMEI based on the inserted SIM's IMSI. This method will generate the same IMEI for the same IMSI, regardless of which particular *blue-merle*-enabled Mudi device is used. The second approach generates a random IMEI.

SRLabs researchers verified that the Mudi router's IMEI can be changed persistently by connecting the device to a custom telco base station set-up. The changed IMEI is recorded within the new base station database entry, confirming that the IMEI change is observed both on the device- and ISP-level.

Furthermore, to ensure that there is no leakage of the old IMEI after changing the SIM card and setting a new IMEI, the Mudi router's radio is turned off in advance and an interim randomized IMEI is set. Both the command-line and hardware switch version of *blue-merle* will guide you through the IMEI update process in order to minimize the risk of IMEI leaks.

Running *blue-merle* will disrupt the device's connection with the ISP during the time the IMEI is changed, and by default the connection is only reestablished once the device is rebooted.

This process can be observed in Figure 1, where there is a large break in connectivity between entries 70 and 80. This break is the result of turning the radio off.

![Figure 1. The router's radio is turned off and the IMEI is randomized between entries 70 and 80. The ISP cannot connect to it.](./IMEI%20randomization.png)

[Figure 1](./IMEI%20randomization.png) The router's radio is turned off and the IMEI is randomized between entries 70 and 80. The ISP cannot connect to it.

### Basic Service Set Identifier (BSSID) randomization

The Mudi router BSSID is set by the hostapd process using the `mac80211_prepare_vif()` function in `/rom/lib/netifd/wireless/mac80211.sh`. The resulting BSSID is stored in `/etc/config/wireless`.

The implemented BSSID randomization function generates a valid unicast address value and overrides the current MAC values set within the `wlan0` and `wlan1` interfaces. This is done by issuing OpenWrt uci set commands targeting the macaddr fields of `wireless.@wifi-iface[0]` and `wireless.@wifi-iface[1]`. The Mudi router's wifi is then reset to implement the changes.

The BSSID randomization feature is run on boot, ensuring that a new BSSID is generated each time the device is started.

### MAC address log wiping

Connecting devices' MAC addresses are stored persistently within the Mudi router at `/etc/oui-tertf`. On boot, *blue-merle* deletes (using `shred`) the client database, then mounts a `tmpfs` filesystem at this location and restarts the services that manage the client database. This ensures the client database is only retained in RAM and not on disk while retaining the web UI functionality.

### MAC Address Randomization

*Blue-merle* sets a randomized MAC address for the WAN interface. If you use the device in repeater mode to connect to another WiFI AP, the Mudi's MAC address will change after every boot. This might interfere with MAC filtering if enabled on the upstream WiFi AP.

## Acknowledgement: blue merle

The Mudi device shares a name with a Hungarian dog breed typically used to guard and herd flocks of livestock. Mudi dogs are agile, fast-learners and extremely friendly.

"Blue merle" is one of the five coat colours recognized for the Mudi dog breed by the Federation Cynologique Internationale and is characterized by its mottled or patched appearance. The black splashes on the blueish-gray coat of the blue merle Mudi inspired the name of this project because of its obscuring appearance and camouflaging symbolism.
