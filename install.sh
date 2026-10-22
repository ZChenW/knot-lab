#!/bin/sh
# Builds Knot Lab and installs it for the current user: the program in
# ~/.local/bin, a launcher entry, and the icon. Nothing is written outside $HOME.
#
#   ./install.sh              build, then install
#   ./install.sh --no-build   install the binary that is already built
#   ./install.sh --uninstall  remove everything this script installed
set -eu

here=$(cd "$(dirname "$0")" && pwd)
data="${XDG_DATA_HOME:-$HOME/.local/share}"
bin="$HOME/.local/bin"
entry="$data/applications/knot-lab.desktop"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$bin/knot-lab" "$entry" \
    "$data/icons/hicolor/128x128/apps/knot-lab.png" \
    "$data/icons/hicolor/256x256/apps/knot-lab.png" \
    "$data/icons/hicolor/scalable/apps/knot-lab.svg"
  update-desktop-database "$data/applications" 2>/dev/null || true
  echo "Knot Lab removed."
  exit 0
fi

if [ "${1:-}" != "--no-build" ]; then
  (cd "$here" && pnpm tauri build --no-bundle)
fi

install -Dm755 "$here/src-tauri/target/release/knot-lab" "$bin/knot-lab"
install -Dm644 "$here/src-tauri/icons/128x128.png" "$data/icons/hicolor/128x128/apps/knot-lab.png"
install -Dm644 "$here/src-tauri/icons/128x128@2x.png" "$data/icons/hicolor/256x256/apps/knot-lab.png"
install -Dm644 "$here/assets/icon.svg" "$data/icons/hicolor/scalable/apps/knot-lab.svg"
mkdir -p "$data/applications"
cat > "$entry" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Knot Lab
Comment=Draw a knot diagram and read off its invariants
Exec=$bin/knot-lab
Icon=knot-lab
Terminal=false
Categories=Education;Math;Science;
StartupWMClass=knot-lab
DESKTOP
update-desktop-database "$data/applications" 2>/dev/null || true
gtk-update-icon-cache -q "$data/icons/hicolor" 2>/dev/null || true
echo "Knot Lab installed: $bin/knot-lab"
