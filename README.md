# Cursor Pixel Agents

A VS Code / Cursor extension that brings your AI agents to life as animated pixel-art characters working in a customizable office.

When you chat with Cursor's AI agents, they appear in a tiny isometric office — reading files, writing code, running commands, and even calling sub-agents — all visualized with retro pixel-art animations.

## Features

- **Live agent visualization** — each active Cursor agent spawns as an animated pixel character that walks to a desk and performs actions in real time.
- **Tool-aware animations** — the character's activity reflects the tool being used: reading files, editing code, running shell commands, searching, and more.
- **Sub-agent support** — when an agent delegates work via the Task tool, a second character appears and sits down at a nearby desk.
- **Customizable office** — enter Edit Mode to rearrange furniture, paint floors and walls, and design your dream pixel office. Layouts are saved and persist across sessions.
- **Two detection modes** — works out-of-the-box by watching agent transcript files, or optionally via Cursor hooks for more precise event detection.
- **Status bar integration** — a status bar item shows the current agent state (Working, Done, etc.) and opens the office panel on click.
- **Zoom & pan** — scroll to zoom and drag to pan around your office.
- **Sound effects** — optional audio feedback for agent actions.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Cursor](https://cursor.com/) or VS Code 1.85+

### Install Dependencies

```bash
npm install
cd webview-ui && npm install
```

### Build

```bash
npm run build
```

This runs type checking, bundles the extension with esbuild, and builds the webview UI with Vite.

### Run in Development

1. Open the project in Cursor (or VS Code).
2. Press **F5** to launch the Extension Development Host.
3. In the new window, open the **Pixel Office** panel from the bottom panel area, or press `Cmd+Shift+.` (`Ctrl+Shift+.` on Windows/Linux).

To watch for extension changes during development:

```bash
npm run watch
```

Rebuild the webview separately when its source changes:

```bash
cd webview-ui && npm run build
```

### Package for Distribution

```bash
npm run package
```

Produces a `.vsix` file you can install in Cursor or VS Code.

## How It Works

### Agent Detection

The extension supports two detection modes:

**Transcript mode (default)** — watches `~/.cursor/projects/<workspace>/agent-transcripts/` for JSONL files and parses agent activity from the transcript stream. No configuration needed.

**Hooks mode (optional)** — installs a bash hook into Cursor's `~/.cursor/hooks.json` that fires on events like `preToolUse`, `stop`, `subagentStart`, and `subagentStop`. Enable via the command palette:

- `Cursor Pixel Agents: Enable Hooks (Precise Agent Detection)`
- `Cursor Pixel Agents: Disable Hooks`

### Activity Mapping

Agent tool calls are mapped to character animations:

| Activity | Triggered by |
|---|---|
| Reading | Read, Glob, Grep, SemanticSearch |
| Editing | Write, StrReplace, EditNotebook, Delete |
| Running | Shell |
| Phoning | Task (sub-agent delegation) |
| Celebrating | Agent completes successfully |

### Office Editor

Toggle Edit Mode from the bottom toolbar to customize your office:

- **Floor & Wall painting** — choose tile styles and colors
- **Furniture placement** — desks, chairs, bookshelves, plants, paintings, whiteboards, and more
- **Rotate & reposition** — drag furniture around, press `R` to rotate
- **Undo / Redo** — `Ctrl+Z` / `Ctrl+Y`
- **Save & Reset** — persist your layout or revert to the last saved state
- **Import / Export** — share layouts as JSON files

Layouts are stored in `~/.cursor-pixel-agents/layout.json`.

## Project Structure

```
cursor-pixel-agents/
├── src/                        # Extension backend (TypeScript)
│   ├── extension.ts            # Entry point — activation, status bar, commands
│   ├── panelProvider.ts        # Webview panel provider & message relay
│   ├── cursorWatcher.ts        # Watches transcripts or hooks for agent activity
│   ├── transcriptParser.ts     # Parses JSONL transcript lines into status events
│   ├── assetLoader.ts          # Loads PNG sprites, furniture manifests, layouts
│   ├── layoutPersistence.ts    # Reads/writes/watches the user layout file
│   ├── hooksInstaller.ts       # Installs/uninstalls Cursor hooks
│   └── constants.ts            # Shared constants (timing, dimensions, IDs)
├── hooks/
│   └── cursor-pixel-agents-hook.sh  # Bash hook script for Cursor events
├── webview-ui/                 # React webview (Vite + React 19)
│   ├── src/
│   │   ├── App.tsx             # Main app shell
│   │   ├── components/         # BottomToolbar, DebugView, ZoomControls
│   │   ├── hooks/              # useExtensionMessages, useEditorActions, etc.
│   │   └── office/             # Office simulation core
│   │       ├── engine/         # OfficeState, renderer, game loop, character AI
│   │       ├── editor/         # EditorState, EditorToolbar, edit actions
│   │       ├── layout/         # Tile map, layout serializer, furniture catalog
│   │       ├── components/     # OfficeCanvas, ToolOverlay
│   │       └── sprites/        # Sprite data and cache
│   └── public/
│       └── assets/             # Furniture, floors, walls, characters, default layout
├── dist/                       # Build output
├── package.json                # Extension manifest, scripts, commands
├── esbuild.js                  # Extension bundler config
└── tsconfig.json               # TypeScript config
```

## Commands

| Command | Keybinding | Description |
|---|---|---|
| `Cursor Pixel Agents: Show` | `Cmd+Shift+.` | Open the Pixel Office panel |
| `Cursor Pixel Agents: Enable Hooks` | — | Install hooks for precise agent detection |
| `Cursor Pixel Agents: Disable Hooks` | — | Remove hooks and revert to transcript mode |

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | TypeScript, VS Code Extension API, esbuild |
| Webview UI | React 19, Vite 7, TypeScript, Canvas 2D |
| Assets | PNG sprites, JSON manifests |
| Build | esbuild (extension), Vite (webview) |

## License

MIT
