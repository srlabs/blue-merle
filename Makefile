include $(TOPDIR)/rules.mk

PKG_NAME:=blue-merle
PKG_VERSION:=2.0.4
PKG_RELEASE:=$(AUTORELEASE)

PKG_MAINTAINER:=Matthias <matthias@srlabs.de>
PKG_LICENSE:=BSD-3-Clause

include $(INCLUDE_DIR)/package.mk

define Package/blue-merle
	SECTION:=utils
	CATEGORY:=Utilities
	EXTRA_DEPENDS:=luci-base, gl-sdk4-mcu, coreutils-shred, python3-pyserial
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
	$(INSTALL_BIN) ./files/etc/gl-switch.d/* $(1)/etc/gl-switch.d/
	$(INSTALL_BIN) ./files/usr/bin/* $(1)/usr/bin/
	$(INSTALL_BIN) ./files/usr/libexec/blue-merle $(1)/usr/libexec/blue-merle
	$(INSTALL_BIN) ./files/lib/blue-merle/imei_generate.py  $(1)/lib/blue-merle/imei_generate.py
endef

define Package/blue-merle/preinst
	#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] && exit 0	# if run within buildroot exit
	
	ABORT_GLVERSION () {
		echo
		if [ -f "/tmp/sysinfo/model" ] && [ -f "/etc/glversion" ]; then
			echo "You have a `cat /tmp/sysinfo/model`, running firmware version `cat /etc/glversion`."
		fi
		echo "blue-merle has only been tested with GL-E750 Mudi Versions up to 4.3.19"
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

	if grep -q "GL.iNet GL-E750" /proc/cpuinfo; then
	    GL_VERSION=$$(cat /etc/glversion)
	    case $$GL_VERSION in
		4.3.19)
		    echo Version $$GL_VERSION is supported
		    exit 0
		    ;;
		4.*)
	            echo Version $$GL_VERSION is *probably* supported
	            ABORT_GLVERSION
	            ;;
	        *)
	            echo Unknown version $$GL_VERSION
	            ABORT_GLVERSION
	            ;;
        esac
        CHECK_MCUVERSION
	else
		ABORT_GLVERSION
	fi

    # Our volatile-mac service gets started during the installation
    # but it modifies the client database held by the gl_clients process.
    # So we stop that process now, have the database put onto volatile storage
    # and start the service after installation
    /etc/init.d/gl_clients stop
endef

define Package/blue-merle/postinst
	#!/bin/sh
	uci set switch-button.@main[0].func='sim'
	uci commit switch-button

	/etc/init.d/gl_clients start

	echo {\"msg\": \"Successfully installed Blue Merle\"} > /dev/ttyS0
endef

define Package/blue-merle/postrm
	#!/bin/sh
	uci set switch-button.@main[0].func='tor'
endef
$(eval $(call BuildPackage,$(PKG_NAME)))
