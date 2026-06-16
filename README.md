# Sticky Sidebar Notes

A rendered markdown notepad sidebar for VS Code and Cursor. Notes live in a plain text file in your workspace, persist across restarts, render as formatted markdown, and update live when Claude (or any other tool) writes to the file.

> Forked from [DeviationLabs/homely-vibes](https://github.com/DeviationLabs/homely-vibes.git).

## Installation

**VS Code Marketplace:**

```bash
code --install-extension deviationlabs.vscode-sidebar-notes
```

**Cursor Marketplace (Open VSX):**

Search **Sticky Sidebar Notes** by `deviationlabs` in the Cursor Extensions panel, or install the `.vsix` directly:

```bash
cursor --install-extension vscode-sidebar-notes-0.1.0.vsix
```

## Features

- **Rendered markdown**: the sidebar shows your notes as formatted markdown (headings, lists, code, tables, links), not raw text.
- **Read-only view**: the sidebar is for viewing; edit the underlying file in a normal editor tab.
- **Live reload**: external edits (from Claude, `git pull`, another editor) refresh the sidebar immediately.
- **Clickable links**: markdown links open in VS Code — relative paths resolve against the notes file, `/path` is workspace-root-relative, and `http(s)`/`mailto` open externally.
- **Customizable styles**: a user CSS file (in your profile's global storage) controls the rendered look and live-reloads when edited.
- **Workspace-aware**: each workspace gets its own notes file. Falls back to a configurable global file when no workspace is open.
- **Published to both marketplaces**: available on VS Code Marketplace and Cursor (Open VSX).

## Usage

1. Click the **Sticky Sidebar Notes** icon in the activity bar.
2. The sidebar renders `sidebar-notes.md` from your workspace root — created automatically on first open.
3. Click the 📝 toolbar button to open the notes file in a regular editor tab and edit it.
4. Click the 🎨 toolbar button to open and customize the rendering CSS; the view live-reloads on save.
5. Have Claude write to the file and watch the sidebar update live:
   ```
   Append a one-paragraph summary of this session to sidebar-notes.md.
   ```

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sidebarNotes.fileName` | `sidebar-notes.md` | Workspace-relative path of the notes file. |
| `sidebarNotes.globalFile` | _(empty)_ | Absolute path used when no workspace is open. |

## Development

```bash
cd VSCodeSidebarNotes
npm install
npm run compile        # one-shot bundle → dist/extension.js
npm run watch          # rebuild on save
```

Press `F5` from this folder to launch an Extension Development Host.

### Packaging

```bash
npm run package          # production bundle
npm run package-vsix     # produces vscode-sidebar-notes-<version>.vsix
```

### Installing a local build

```bash
code --install-extension vscode-sidebar-notes-<version>.vsix --force
```

> **Heads up (Windows):** if `code` resolves to `Code.exe` (the GUI) instead of
> the CLI wrapper, `--install-extension` is ignored and a new window just opens
> with nothing installed. Check with `Get-Command code -All`; if the first match
> is `Code.exe`, call the CLI wrapper directly, e.g.
> `& "F:\Microsoft VS Code\bin\code.cmd" --install-extension <vsix> --force`.
> Also bump the `version` in `package.json` so VS Code replaces the cached copy
> rather than skipping the reinstall.

### Publishing

PATs are stored in `config/local.yaml` (gitignored) under `vscode_marketplace.pat` and `open_vsx.pat`.

**VS Code Marketplace:**

```bash
VSCE_PAT=$(python3 -c "from omegaconf import OmegaConf; c=OmegaConf.load('../config/local.yaml'); print(c.vscode_marketplace.pat)") npm run publish
```

**Cursor / Open VSX:**

```bash
OVSX_PAT=$(python3 -c "from omegaconf import OmegaConf; c=OmegaConf.load('../config/local.yaml'); print(c.open_vsx.pat)") npm run publish-cursor
```

To get new tokens: VS Code PAT from [dev.azure.com](https://dev.azure.com) (scope: Marketplace → Manage); Open VSX PAT from [open-vsx.org](https://open-vsx.org) (scope: publish).

## License

MIT — see [LICENSE](LICENSE).
