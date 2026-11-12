# 🦊 NanoFox for Nanobot

> **Control your Firefox browser from Nanobot** — A powerful Firefox extension and Nanobot skill that bridges your AI assistant with your real browser session using WebExtensions and Native Messaging.

---

## ✨ Features

| Category | Capabilities |
|----------|--------------|
| **🗂️ Tabs & Windows** | List, inspect, create, navigate, reload, duplicate, move, pin, mute, zoom, activate, close |
| **🌐 Page Interaction** | Text/HTML extraction, links, CSS selectors, typing, select controls, key events, hover, scrolling, text search |
| **📊 Browser Data** | Cookies, history, bookmarks, downloads, recently closed sessions, top sites |
| **📸 Media & Notifications** | Screenshots, desktop notifications, extension storage, permission inspection |
| **🔌 Generic API Access** | Direct access to supported Firefox WebExtensions methods via `browser_api` |
| **🖥️ UI Integration** | Nanobot sidebar panel + local Native Messaging bridge |

> ⚠️ **Limitations**: NanoFox exposes WebExtensions APIs — not unrestricted Firefox internals. Browser chrome, protected pages (`about:*`, addons.mozilla.org), arbitrary local files, DRM content, and security boundaries remain inaccessible. API availability varies by Firefox version and granted permissions.

---

## 🏗️ Architecture

```text
Nanobot → HTTP 127.0.0.1:8766 → native_host.py → Firefox Native Messaging → Extension → WebExtensions APIs
```

- **HTTP Bridge**: Listens only on loopback (`127.0.0.1:8766`)
- **Authentication**: Bearer token at `~/.nanobot/browser-token` (auto-generated)
- **Security**: Never expose the port or token to another machine or network

---

## 📦 Installation

### Prerequisites
- **Firefox 142+** (required for sidebar API support)
- **Nanobot** running locally at `http://127.0.0.1:8765/`

### Step-by-Step

#### 1. Install the Firefox Extension
```bash
# Option A: Drag & drop
# Open about:addons → Gear menu → "Install Add-on From File" → select nanobot-fox.xpi

# Option B: Command line (Linux/macOS)
firefox --install-extension nanobot-fox.xpi
```

#### 2. Deploy Nanobot Skills
```bash
# Copy skills directory to Nanobot workspace
cp -r skills/ ~/.nanobot/workspace/skills/firefox-browser/
```

#### 3. Configure Native Messaging Host
Create `~/.mozilla/native-messaging-hosts/nanobot.browser.json`:

```json
{
  "name": "nanobot.browser",
  "description": "NanoFox Native Messaging bridge",
  "path": "/home/YOUR_USER/.nanobot/workspace/skills/firefox-browser/native_host.py",
  "type": "stdio",
  "allowed_extensions": ["nanobot-panel@localhost"]
}
```

> 💡 Replace `YOUR_USER` with your actual username. Use absolute path only.

#### 4. Make Host Executable & Restart Firefox
```bash
chmod 700 ~/.nanobot/workspace/skills/firefox-browser/native_host.py
# Restart Firefox completely
```

#### 5. Open the Sidebar Panel
- Press **`Ctrl+Shift+N`** (default shortcut)
- Or click the NanoFox icon in the toolbar → "Open NanoFox Panel"

---

## ✅ Verification

Test the bridge is working:

```bash
# 1. Check bridge status
curl -sS http://127.0.0.1:8766/status

# 2. Authenticate and get capabilities
TOKEN="$(cat ~/.nanobot/browser-token)"
curl -sS -X POST http://127.0.0.1:8766/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"get_capabilities"}'
```

**Expected response**: JSON with `actions` array and `namespaces` list.

---

## 📚 API Reference

### Core Actions
| Action | Description | Example |
|--------|-------------|---------|
| `get_tabs` | List all tabs | `{"action":"get_tabs"}` |
| `get_active_tab` | Get current tab | `{"action":"get_active_tab"}` |
| `navigate` | Navigate to URL | `{"action":"navigate","params":{"url":"https://example.com"}}` |
| `open_tab` | Open new tab | `{"action":"open_tab","params":{"url":"https://example.com"}}` |
| `close_tab` | Close tab by ID | `{"action":"close_tab","params":{"tabId":12}}` |
| `switch_tab` | Activate tab | `{"action":"switch_tab","params":{"tabId":12}}` |
| `get_windows` | List windows | `{"action":"get_windows","params":{"populate":true}}` |
| `read_page` | Extract page text | `{"action":"read_page"}` |
| `get_page_html` | Get page HTML | `{"action":"get_page_html","params":{"maxLength":100000}}` |
| `click` | Click element | `{"action":"click","params":{"selector":"button[type=submit]"}}` |
| `type` | Type into input | `{"action":"type","params":{"selector":"input[name=q]","text":"NanoFox","clear":true}}` |
| `select_option` | Select dropdown | `{"action":"select_option","params":{"selector":"select#country","value":"AR"}}` |
| `press_key` | Press key | `{"action":"press_key","params":{"selector":"input[name=q]","key":"Enter"}}` |
| `hover` | Hover element | `{"action":"hover","params":{"selector":"nav a"}}` |
| `scroll` | Scroll page | `{"action":"scroll","params":{"x":0,"y":900}}` |
| `extract_links` | Get all links | `{"action":"extract_links"}` |
| `find_text` | Find text | `{"action":"find_text","params":{"text":"Firefox"}}` |
| `screenshot` | Capture screenshot | `{"action":"screenshot"}` |
| `get_cookies` | Get cookies | `{"action":"get_cookies","params":{"url":"https://example.com"}}` |
| `get_history` | Search history | `{"action":"get_history","params":{"text":"example","maxResults":30}}` |
| `get_bookmarks` | List bookmarks | `{"action":"get_bookmarks"}` |
| `get_downloads` | List downloads | `{"action":"get_downloads"}` |
| `get_sessions` | Recent sessions | `{"action":"get_sessions"}` |
| `storage_get` | Extension storage | `{"action":"storage_get","params":{"area":"local","key":"setting"}}` |
| `get_permissions` | Check permissions | `{"action":"get_permissions"}` |
| `get_capabilities` | List all actions | `{"action":"get_capabilities"}` |

### Generic WebExtensions API
Use `browser_api` for methods without dedicated actions:

```json
{"action":"browser_api","params":{"path":"downloads.search","args":[{"state":"complete"}]}}
{"action":"browser_api","params":{"path":"tabs.query","args":[{"currentWindow":true}]}}
{"action":"browser_api","params":{"path":"sessions.getRecentlyClosed","args":[{"maxResults":10}]}}
{"action":"browser_api","params":{"path":"storage.local.get","args":[null]}}
```

> 📖 **Full reference**: See [`skills/SKILL.md`](skills/SKILL.md) for complete action reference, usage rules, and Nanobot operating guidelines.

---

## 🔒 Security & Limitations

- 🔐 **Loopback-only**: Bridge binds to `127.0.0.1:8766` — never exposed to LAN/Internet
- 🎫 **Bearer token**: Random token at `~/.nanobot/browser-token` required for all commands
- 🌐 **Same-origin enforced**: Page scripts respect browser security policies
- 🚫 **No access to**: Browser chrome UI, `about:*` pages, addons.mozilla.org, DRM content, arbitrary local files
- ⚠️ **Destructive actions**: History/bookmark deletion, data clearing, mass tab closure require explicit confirmation
- 🔑 **Permissions**: All WebExtensions APIs subject to Firefox permission model and version support

---

## 📁 Project Structure

```
nanobot-fox/
├── nanobot-fox.xpi              # Packaged Firefox extension
├── README.md                    # This file
├── CHANGELOG.md                 # Version history
├── AGENT_INSTRUCTIONS.md        # AI agent guidelines
├── extension/                   # Firefox extension source
│   ├── manifest.json            # Manifest V3
│   ├── background.js            # Service worker
│   ├── panel.html               # Sidebar panel UI
│   ├── panel.js                 # Panel logic
│   └── icon-*.png               # Extension icons
└── skills/                      # Nanobot skill package
    ├── SKILL.md                 # Complete API documentation
    ├── nanobot.browser.json     # Native Messaging manifest template
    └── native_host.py           # Python stdio bridge
```

---

## 🛠️ Development

### Building the XPI
```bash
cd extension
zip -r ../nanobot-fox.xpi . -x "*.DS_Store" "*.git*"
```

### Testing Native Host Locally
```bash
cd skills
echo '{"action":"get_capabilities"}' | python native_host.py
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a Pull Request

---

## 🔗 Links

- **Nanobot**: [github.com/edualbercas/nanobot](https://github.com/edualbercas/nanobot)
- **Firefox WebExtensions API**: [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- **Native Messaging**: [MDN Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)

---

<div align="center">

**Made with ❤️ for the Nanobot community**

</div>