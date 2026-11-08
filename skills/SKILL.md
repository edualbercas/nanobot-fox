# Skill: firefox-browser

Nanobot controls Firefox through the Nanobot Panel extension and a local HTTP bridge provided by the Native Messaging host.

## Requirements

- Firefox with the Nanobot Panel extension installed and running.
- Native Messaging host installed and configured.
- The host listens only on `127.0.0.1:8766` while Firefox is connected.

## Install

Set the absolute path to `native_host.py` in `nanobot.browser.json`, then install that manifest in `~/.mozilla/native-messaging-hosts/nanobot.browser.json`. The manifest's `allowed_extensions` must contain the exact extension id `nanobot-panel@localhost` (with the `@`); a typo here makes Firefox silently never spawn the host. `native_host.py` must be executable (chmod +x). After fixing the manifest, restart Firefox so it spawns a fresh host process.

The host creates a private bearer token at `~/.nanobot/browser-token`. Nanobot reads this token when making requests. Do not expose it or the local bridge to other machines.

## API

Check the connection:

```bash
TOKEN="$(cat ~/.nanobot/browser-token)"
curl -s http://127.0.0.1:8766/status
```

Send a command:

```bash
TOKEN="$(cat ~/.nanobot/browser-token)"
curl -sS -X POST http://127.0.0.1:8766/command -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"action":"get_tabs"}'
```

Every command is sent to the Firefox extension and the HTTP request waits for its response. Commands time out after 45 seconds.

## Actions

### List tabs

```bash
curl -sS -X POST http://127.0.0.1:8766/command -H "Authorization: Bearer $(cat ~/.nanobot/browser-token)" -H 'Content-Type: application/json' -d '{"action":"get_tabs"}'
```

### Get active tab

```bash
-d '{"action":"get_active_tab"}'
```

### Navigate active tab

```bash
-d '{"action":"navigate","params":{"url":"https://example.com"}}'
```

### Open a tab

```bash
-d '{"action":"open_tab","params":{"url":"https://example.com"}}'
```

### Read page text

```bash
-d '{"action":"read_page"}'
```

### Click an element

```bash
-d '{"action":"click","params":{"selector":"button[type=submit]"}}'
```

### Type into an element

```bash
-d '{"action":"type","params":{"selector":"input[name=q]","text":"Nanobot Firefox"}}'
```

### Extract links

```bash
-d '{"action":"extract_links"}'
```

### Capture screenshot

```bash
-d '{"action":"screenshot"}'
```

Use the same URL, headers and `curl` options shown in the send-command example for these `-d` bodies.

## Important

The extension must remain active in Firefox. Native Messaging starts the host; the host exposes the local HTTP endpoint for Nanobot. Running `native_host.py` manually does not connect it to Firefox.

## Troubleshooting

- `GET /status` returns `firefox_connected: false` or the command returns 503: the extension is not connected. Check `allowed_extensions` in `~/.mozilla/native-messaging-hosts/nanobot.browser.json` matches the extension id exactly (`nanobot-panel@localhost`), then restart Firefox. Kill stale host processes before restarting.
- `navigate` may return the previous URL with status `loading`; confirm completion with `get_active_tab` before assuming the page changed.
- `type` targets the first matching selector on the active tab; if the tab drifted to another page, the text lands there. Always check `get_active_tab` first when a page-specific action matters.
