#!/bin/sh
# Builds the offline install bundle: a release ipk plus the dependencies listed in
# packages.txt, downloaded from GL's package feed and checked against its index.
#
# Usage: offline/build.sh <blue-merle_*.ipk> [output directory]
set -eu

FEED=${FEED:-https://fw.gl-inet.com/releases/v22.03.4/packages-4.2/ath79/packages}
[ $# -ge 1 ] || { echo "Usage: $0 <blue-merle_*.ipk> [output directory]" >&2; exit 1; }
dir=$(cd "$(dirname "$0")" && pwd)
ipk=$1
out=$(cd "${2:-.}" && pwd)
version=$(tar -xzOf "$ipk" ./control.tar.gz | tar -xzO ./control | sed -n 's/^Version: //p')

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/blue_merle_install"
curl -fsS "$FEED/Packages" -o "$tmp/Packages"

for file in $(grep -v '^#' "$dir/packages.txt"); do
	sha=$(awk -v f="$file" '/^Filename: / { n = $2 } /^SHA256sum: / && n == f { print $2 }' "$tmp/Packages")
	[ -n "$sha" ] || { echo "$file is not in $FEED" >&2; exit 1; }
	curl -fsS "$FEED/$file" -o "$tmp/blue_merle_install/$file"
	echo "$sha  $tmp/blue_merle_install/$file" | sha256sum -c --quiet -
done

cp "$ipk" "$dir/install.sh" "$tmp/blue_merle_install/"
(cd "$tmp" && zip -qr "$out/blue-merle_${version}_offline_install.zip" blue_merle_install)
echo "$out/blue-merle_${version}_offline_install.zip"
