#!/usr/bin/env python3
"""Generate a vendor-mimicking MAC address for blue-merle.

Reads the OUI table (default /etc/blue-merle/oui-vendors), picks a real vendor
OUI of the requested type, and appends three random bytes. The vendor OUI is
kept as-is (globally-administered), so the result looks like ordinary consumer
hardware instead of an obviously locally-administered random address.

Usage:
    mac_mimic.py <ap|client> [vendor_csv] [oui_file]

If no OUI matches the request, it falls back to a locally-administered random
MAC so callers always get a usable address.
"""
import random
import sys


def load_ouis(path, kind, want):
    wanted = {v.strip().lower() for v in want.split(",") if v.strip()} if want else None
    ouis = []
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                if len(parts) < 3:
                    continue
                vendor, oui, typ = parts[0].lower(), parts[1], parts[2].lower()
                if typ != kind:
                    continue
                if wanted is not None and vendor not in wanted:
                    continue
                ouis.append(oui)
    except OSError:
        pass
    return ouis


def random_laa():
    # Locally-administered, unicast: set bit 1, clear bit 0 of the first octet.
    first = (random.randint(0, 255) & 0b11111100) | 0b00000010
    rest = [random.randint(0, 255) for _ in range(5)]
    return ":".join("%02x" % b for b in [first] + rest)


def derive(base, offset):
    # Return base with its last octet shifted by offset (mod 256), keeping the
    # OUI intact — the way real hardware numbers its interfaces (..63/..64/..65).
    parts = base.split(":")
    if len(parts) != 6:
        return base
    parts[-1] = "%02x" % ((int(parts[-1], 16) + offset) & 0xFF)
    return ":".join(p.lower() for p in parts)


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "derive":
        if len(sys.argv) < 4:
            sys.stderr.write("usage: mac_mimic.py derive <base_mac> <offset>\n")
            return 2
        print(derive(sys.argv[2], int(sys.argv[3])))
        return 0
    if len(sys.argv) < 2 or sys.argv[1] not in ("ap", "client"):
        sys.stderr.write("usage: mac_mimic.py <ap|client> [vendor_csv] [oui_file] | derive <base> <offset>\n")
        return 2
    kind = sys.argv[1]
    want = sys.argv[2] if len(sys.argv) > 2 else ""
    path = sys.argv[3] if len(sys.argv) > 3 else "/etc/blue-merle/oui-vendors"

    ouis = load_ouis(path, kind, want)
    if not ouis:
        # No matching vendor OUI -> fall back to a random locally-administered MAC.
        print(random_laa())
        return 0

    oui = random.choice(ouis).lower()
    tail = ":".join("%02x" % random.randint(0, 255) for _ in range(3))
    print("%s:%s" % (oui, tail))
    return 0


if __name__ == "__main__":
    sys.exit(main())
