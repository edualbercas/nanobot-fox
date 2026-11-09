# 🦊 Nanobot Fox

Firefox extension + skill for [**Nanobot AI**](https://github.com/HKUDS/nanobot) 🐈 — it lets Nanobot inspect and control the active Firefox session (list tabs, navigate, read pages, click, type, extract links, and take screenshots).

It also includes a sidebar panel (`Ctrl+Shift+N`) that opens the local Nanobot UI at `http://127.0.0.1:8765/`.

## 🏗️ Architecture

```
Nanobot ──HTTP──▶ 127.0.0.1:8766 (native_host.py) ──Native Messaging──▶ Nanobot Panel extension ──▶ Firefox
```

- The extension talks to the **Native Messaging host** (`skills/native_host.py`).
- The host exposes a local HTTP API on `127.0.0.1:8766` only, protected by a private bearer token stored in `~/.nanobot/browser-token` (mode 0600).
- Commands sent to that API are forwarded to the extension and the browser result is returned to Nanobot.
- **Never** expose port 8766 or the token outside the local machine.

## 📋 Requirements

- Firefox Developer Edition (or any Firefox ≥ 142) with the extension installed.
- Python 3 (stdlib only) for the native host.
- Nanobot running on the same machine.

## 🚀 Install (user)

1. **Install the extension**
   - Open `about:addons` in Firefox → gear menu → **Install Add-on From File** → pick `nanobot-fox.xpi`.
   - The Nanobot sidebar panel opens automatically on install.

2. **Install the native host**
   - Copy the `skills/` directory to a permanent location, for example:
     ```bash
     mkdir -p ~/.nanobot/workspace/skills/firefox-browser
     cp -r skills/* ~/.nanobot/workspace/skills/firefox-browser/
     chmod +x ~/.nanobot/workspace/skills/firefox-browser/native_host.py
     ```
   - Create the native messaging manifest `~/.mozilla/native-messaging-hosts/nanobot.browser.json` with the absolute path to your `native_host.py`:
     ```json
     {
       "name": "nanobot.browser",
       "description": "Local HTTP bridge for Nanobot Firefox extension",
       "path": "/home/YOUR_USER/.nanobot/workspace/skills/firefox-browser/native_host.py",
       "type": "stdio",
       "allowed_extensions": ["nanobot-panel@localhost"]
     }
     ```
     > ⚠️ `allowed_extensions` must contain exactly `nanobot-panel@localhost` (with the `@`). A typo here makes Firefox silently never spawn the host.

3. **Restart Firefox**
   - Close and reopen Firefox. The host starts automatically when the extension connects.
   - Keep Firefox running while Nanobot controls it.

## ✅ Quick check

```bash
# Is the extension connected?
curl -s http://127.0.0.1:8766/status
# Expected: {"success":true,"firefox_connected":true}

# List tabs
TOKEN="$(cat ~/.nanobot/browser-token)"
curl -sS -X POST http://127.0.0.1:8766/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"get_tabs"}'
```

## 🎬 Available actions

| Action | Params | Description |
|---|---|---|
| `get_tabs` | — | List all tabs |
| `get_active_tab` | — | Active tab (URL, title) |
| `navigate` | `params.url` | Navigate the active tab |
| `open_tab` | `params.url` | Open a new tab |
| `read_page` | — | Text of the active page |
| `click` | `params.selector` | Click the first matching element |
| `type` | `params.selector`, `params.text` | Type into the first matching element |
| `extract_links` | — | Links on the active page |
| `screenshot` | — | Screenshot of the active tab |

Command example:

```bash
curl -sS -X POST http://127.0.0.1:8766/command \
  -H "Authorization: Bearer $(cat ~/.nanobot/browser-token)" \
  -H 'Content-Type: application/json' \
  -d '{"action":"navigate","params":{"url":"https://github.com/HKUDS/nanobot"}}'
```

Commands wait for the extension response and time out after **45 seconds**. If the extension is not connected, the endpoint returns **503**.

## 🔧 Troubleshooting

- **`firefox_connected: false` or 503**: check that `allowed_extensions` in `~/.mozilla/native-messaging-hosts/nanobot.browser.json` is exactly `["nanobot-panel@localhost"]`, kill stale host processes, and restart Firefox.
- **`navigate` returns the previous URL with status `loading`**: confirm with `get_active_tab` before assuming the page changed.
- **`type` wrote on another page**: the selector targets the active tab; check `get_active_tab` first for page-specific actions.
- **Running `native_host.py` manually does NOT connect it to Firefox**: the host only works when Firefox spawns it via Native Messaging.

## 📁 Repo structure

```
nanobot-fox/
├── extension/            # Extension source (MV3)
│   ├── manifest.json     # id: nanobot-panel@localhost
│   ├── background.js
│   ├── panel.html / panel.js
│   └── icon-*.png
├── nanobot-fox.xpi     # Packaged extension, ready to install
├── AGENT_INSTRUCTIONS.md  # Instructions for the agent (GitHub install steps)
├── skills/
│   ├── SKILL.md          # Skill for Nanobot (see also AGENT_INSTRUCTIONS.md)
│   ├── native_host.py    # Native Messaging host + HTTP bridge on 127.0.0.1:8766
│   └── nanobot.browser.json  # Manifest template
└── README.md
```

## 🔒 Security

- The HTTP bridge listens on `127.0.0.1` only and requires a bearer token.
- The token is generated with `secrets.token_urlsafe(32)` and stored in `~/.nanobot/browser-token` with mode `0600`.
- Do not expose the token or the port to other machines.
