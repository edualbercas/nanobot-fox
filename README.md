# Nanobot Firefox Browser Bridge

Firefox extension and Nanobot skill that let Nanobot inspect and control the active Firefox session.

## How it works

The Firefox extension connects to the Native Messaging host. The host then exposes a local HTTP API on `127.0.0.1:8766` for Nanobot. Commands sent to that API are forwarded to the extension and the browser result is returned to Nanobot.

The HTTP API is available only on the local machine and requires a private bearer token stored in `~/.nanobot/browser-token`.

## Install

1. Install `nanobot-panel.xpi` in Firefox from `about:addons` → gear menu → Install Add-on From File.
2. Copy the `skills` directory to a permanent location, for example `~/.nanobot/workspace/skills/firefox-browser`.
3. Set the absolute path to `native_host.py` in `~/.mozilla/native-messaging-hosts/nanobot.browser.json`:

```json
{
  "name": "nanobot.browser",
  "description": "Local HTTP bridge for Nanobot Firefox extension",
  "path": "/home/USER/.nanobot/workspace/skills/firefox-browser/native_host.py",
  "type": "stdio",
  "allowed_extensions": ["nanobot-panel@localhost"]
}
```

4. Make the host executable:

```bash
chmod +x ~/.nanobot/workspace/skills/firefox-browser/native_host.py
```

5. Restart Firefox. Keep Firefox running while Nanobot controls it.

## Test

Check whether the extension is connected:

```bash
curl -s http://127.0.0.1:8766/status
```

Expected response:

```json
{"success":true,"firefox_connected":true}
```

List tabs:

```bash
TOKEN="$(cat ~/.nanobot/browser-token)"
curl -sS -X POST http://127.0.0.1:8766/command -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"action":"get_tabs"}'
```

## Supported actions

- `get_tabs`
- `get_active_tab`
- `navigate` with `params.url` and optional `params.tabId`
- `open_tab` with `params.url`
- `close_tab` with `params.tabId`
- `switch_tab` with `params.tabId`
- `read_page` with optional `params.tabId`
- `get_page_html` with optional `params.tabId`
- `screenshot`
- `click` with `params.selector` and optional `params.tabId`
- `type` with `params.selector`, `params.text` and optional `params.tabId`
- `submit_form` with `params.selector` and optional `params.tabId`
- `extract_links` with optional `params.tabId`
- `search_page` with `params.query` and optional `params.tabId`

The complete Nanobot instructions and command examples are in `skills/SKILL.md`.
