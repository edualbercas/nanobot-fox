# Skill: firefox-browser

Nanobot controls Firefox through the Nanobot Panel extension and a local HTTP bridge provided by the Native Messaging host.

## Requirements

- Firefox with the Nanobot Panel extension installed and running.
- Native Messaging host installed and configured.
- The host listens only on `127.0.0.1:8766` while Firefox is connected.

## Install

Set the absolute path to `native_host.py` in `nanobot.browser.json`, then install that manifest in `~/.mozilla/native-messaging-hosts/nanobot.browser.json`.

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
