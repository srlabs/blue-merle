include $(TOPDIR)/rules.mk

PKG_NAME:=blue-merle
PKG_VERSION:=1.0.0
PKG_RELEASE:=$(AUTORELEASE)

PKG_MAINTAINER:=Matthias <matthias@srlabs.de>
PKG_LICENSE:=BSD-3-Clause

include $(INCLUDE_DIR)/package.mk

define Package/blue-merle
	SECTION:=utils
	CATEGORY:=Utilities
	DEPENDS:=+bash +coreutils-shred +python3 +python3-pyserial +patch
	TITLE:=Anonymity Enhancements for GL-E750 Mudi
endef

define Package/blue-merle/description
	The blue-merle package enhances anonymity and reduces forensic traceability of the GL-E750 Mudi 4G mobile wi-fi router
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/blue-merle/install
	$(CP) ./files/* $(1)/
	$(INSTALL_BIN) ./files/etc/init.d/* $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/lib/blue-merle/mac-wipe.sh $(1)/lib/blue-merle/mac-wipe.sh
	$(INSTALL_BIN) ./files/usr/bin/blue-merle $(1)/usr/bin/blue-merle
endef

define Package/blue-merle/preinst
	#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] && exit 0	# if run within buildroot exit
	
	ABORT_GLVERSION () {
		echo
		if [ -f "/tmp/sysinfo/model" ] && [ -f "/etc/glversion" ]; then
			echo "You have a `cat /tmp/sysinfo/model`, running firmware version `cat /etc/glversion`."
		fi
		echo "blue-merle has only been tested with GL-E750 Mudi Version 3.215."
		echo "The device or firmware version you are using have not been verified to work with blue-merle."
		echo -n "Would you like to continue on your own risk? (y/N): "
		read answer
		case $$answer in
				y*) answer=0;;
				y*) answer=0;;
				*) answer=1;;
		esac
		if [[ "$$answer" -eq 0 ]]; then
			exit 0
		else
			exit 1
		fi
	}

	UPDATE_MCU() {
		echo "6e6b86e3ad7fec0d5e426eb9a41c51c6f0d6b68a4d341ec553edeeade3e4b470  /tmp/e750-mcu-V1.0.7.bin" > /tmp/e750-mcu.bin.sha256
		wget -O /tmp/e750-mcu-V1.0.7.bin https://github.com/gl-inet/GL-E750-MCU-instruction/blob/master/e750-mcu-V1.0.7-56a1cad7f0eb8318ebe3c3c46a4cf3ff.bin?raw=true
		if sha256sum -cs /tmp/e750-mcu.bin.sha256; then
			ubus call service delete '{"name":"e750_mcu"}'
			mcu_update /tmp/e750-mcu-V1.0.7.bin
		else
			echo "Failed to update MCU, verification of the binary failed."
			echo "Your device needs to be connected to the Internet in order to download the MCU binary."
			exit 1
		fi
	}

	CHECK_MCUVERSION() {
		function version { echo "$$@" | cut -d' ' -f2 | awk -F. '{ printf("%d%03d%03d%03d\n", $$1,$$2,$$3,$$4); }'; }
		mcu_version=`echo \{\"version\": \"1\"} > /dev/ttyS0; sleep 0.1; cat /dev/ttyS0|tr -d '\n'`
		if [ $$(version "$$mcu_version") -ge $$(version "V 1.0.7") ]; then
			return 0
		else
			echo
			echo "Your MCU version has not been verified to work with blue-merle."
						echo "Automatic shutdown may not work."
						echo "The install script can initiate an update of the MCU."
						echo "The device will reboot and, after reboot, you need to run opkg install blue-merle again."
						echo -n "Would you like to update your MCU? (y/N): "
						read answer
						case $$answer in
								Y*) answer=0;;
								y*) answer=0;;
								*) answer=1;;
						esac
						if [[ "$$answer" -eq 0 ]]; then
								UPDATE_MCU
						fi
				fi
		}

	if grep -q "GL.iNet GL-E750" /proc/cpuinfo; then
		if grep -q -w "3.215" /etc/glversion; then
			CHECK_MCUVERSION
			echo "Device is supported, installing blue-merle."
			exit 0
		else
			ABORT_GLVERSION
		fi
	else
		ABORT_GLVERSION
	fi
endef

define Package/blue-merle/postinst
	#!/bin/sh

	patch -b /www/src/temple/settings/index.js /lib/blue-merle/patches/index.js.patch
	patch -b /www/src/temple/settings/index.html /lib/blue-merle/patches/index.html.patch
	patch -b /usr/bin/switchaction /lib/blue-merle/patches/switchaction.patch
	patch -b /usr/bin/switch_queue /lib/blue-merle/patches/switch_queue.patch

	uci set glconfig.switch_button='service'
	uci set glconfig.switch_button.enable='1'
	uci set glconfig.switch_button.function='sim'
	uci commit glconfig
endef

define Package/blue-merle/postrm
	#!/bin/sh

	mv /www/src/temple/settings/index.js.orig /www/src/temple/settings/index.js
	mv /www/src/temple/settings/index.html.orig /www/src/temple/settings/index.html
	mv /usr/bin/switchaction.orig /usr/bin/switchaction
	mv /usr/bin/switch_queue.orig /usr/bin/switch_queue

	rm /tmp/sim_change_start
	rm /tmp/sim_change_switch
endef
$(eval $(call BuildPackage,$(PKG_NAME)))

