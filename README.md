# Atelier

Desktop viewer for Claude artifacts. Open JSX, TSX, HTML, SVG, Markdown, and Mermaid files in a sandboxed environment with live rendering.

## Download

Go to [Releases](../../releases) and download the installer for your platform:

- **Windows:** `.msi` or `-setup.exe`
- **macOS:** `.dmg`
- **Linux:** `.deb` or `.AppImage`

## Features

- **Sandboxed rendering** — artifacts run in an isolated iframe with no access to your system
- **15 vendor libraries** built in — React, Recharts, D3, Three.js, Chart.js, Plotly, Mermaid, and more
- **File associations** — right-click `.jsx`/`.tsx` files and open directly in Atelier
- **Single instance** — opening a file while the app is running loads it in the existing window
- **SQLite persistence** — your artifact library persists across sessions
- **Export to HTML** — export any artifact as a standalone HTML file
- **Drag and drop** — drop files onto the window to import

## Build from source

```bash
git clone https://github.com/Trevo88423/Atelier.git
cd Atelier
pnpm install
cd vendor-src && pnpm install && cd ..
pnpm prebuild:vendor
pnpm tauri build
```

Requires: Node.js 22+, pnpm 10+, Rust toolchain, and platform-specific Tauri dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/)).

## Development

```bash
pnpm tauri dev
```

## Tech stack

- **Frontend:** React 19, TypeScript, Vite
- **Backend:** Tauri 2, Rust, SQLite
- **Sandbox:** esbuild-wasm for JSX/TSX compilation, vendor UMD bundles
