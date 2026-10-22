# Installing Knot Lab

Knot Lab is a desktop app built with [Tauri](https://tauri.app). The install script
builds it from source and installs it for your user only, on Linux.

## Requirements

- Node.js 22.12+ (or 20.19+) and [pnpm](https://pnpm.io)
- Rust 1.90 or newer
- The system libraries Tauri needs on Linux, WebKitGTK 4.1 among them; see
  [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

Optional:

- `kdialog` for the KDE file dialog. Without it, Knot Lab uses the file dialog of your
  desktop portal.
- `cloudflared` for phone photos sent over mobile data (see
  [tracing a picture](guide.md#tracing-a-picture)). Photos over the same Wi-Fi work
  without it.

## Install

```sh
git clone https://github.com/ZChenW/knot-lab.git
cd knot-lab
pnpm install
./install.sh
```

`install.sh` runs `pnpm tauri build --no-bundle` and installs:

| Path | What it is |
| --- | --- |
| `~/.local/bin/knot-lab` | The program |
| `~/.local/share/applications/knot-lab.desktop` | The application menu entry |
| `~/.local/share/icons/hicolor/*/apps/knot-lab.*` | The icon, at three sizes |

The `share` paths follow `$XDG_DATA_HOME` when it is set. To start Knot Lab from a terminal, make sure `~/.local/bin` is on
your `PATH`.

`./install.sh --no-build` installs the binary that is already built in
`src-tauri/target/release/` without building again.

## Updating

```sh
git pull
pnpm install
./install.sh
```

## Uninstalling

```sh
./install.sh --uninstall
```

This removes the program, the menu entry and the icons. It preserves your last diagram
and settings, which the app keeps in the webview's local storage.

## The web version

The same app also builds into one self-contained HTML file that runs in a browser,
with no installation and no network access:

```sh
pnpm install
pnpm build:web    # writes dist-web/index.html
```

Open `dist-web/index.html` in a browser. The File menu uses the browser's upload and
download instead of file dialogs, so there is no Save As, and phone photos need the
desktop app.
