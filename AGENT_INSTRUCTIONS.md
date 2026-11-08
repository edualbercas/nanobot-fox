# AGENT.md — firefox-browser (Nanobot)

Instructions for the Nanobot agent when using this skill. The canonical copy lives in `~/.nanobot/workspace/skills/firefox-browser/`.

## When to use it

Use it when the user asks to navigate, read, click, type, extract links, or take a screenshot in Firefox, or when a task requires interacting with a web page open in the user's browser.

## Prerequisites (verify before acting)

1. Firefox running with the **Nanobot Panel** extension installed (id `nanobot-panel@localhost`).
2. Native host installed at `~/.mozilla/native-messaging-hosts/nanobot.browser.json` with `allowed_extensions` exactly `["nanobot-panel@localhost"]` (with `@`).
3. The host exposes HTTP on `127.0.0.1:8766`; the bearer token is in `~/.nanobot/browser-token` (0600).

## Usage pattern

```bash
TOKEN="$(cat ~/.nanobot/browser-token)"
BASE="http://127.0.0.1:8766"

# 1) Connection status
curl -s $BASE/status
# {"success":true,"firefox_connected":true} → OK
# firefox_connected:false or 503 → extension not connected; DO NOT proceed

# 2) Send a command
curl -sS -X POST $BASE/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"ACTION","params":{...}}'
```

## Actions

| action | params | use |
|---|---|---|
| `get_tabs` | — | list open tabs |
| `get_active_tab` | — | current active tab |
| `navigate` | `url` | go to a URL in the active tab |
| `open_tab` | `url` | open a new tab |
| `read_page` | — | plain text of the active page |
| `click` | `selector` | click the first CSS selector match |
| `type` | `selector`, `text` | type text into the first match |
| `extract_links` | — | links on the active page |
| `screenshot` | — | screenshot of the active tab |

## Important rules

- **Always** check `/status` first. If `firefox_connected` is false or you get a 503, tell the user: Firefox must be open with the extension active and the manifest configured correctly. Do not invent results.
- Command timeout: **45s**. Do not retry in a loop; report the failure.
- `navigate` may return the previous URL with status `loading` → confirm with `get_active_tab`.
- `type` and `click` act on the **active tab** and the **first** matching element → check `get_active_tab` first if the action depends on the page.
- Running `native_host.py` manually does NOT connect anything to Firefox; only Firefox starts the host via Native Messaging.
- The token in `~/.nanobot/browser-token` is a local secret: never include it in messages, public logs, or URLs.

## Typical flow

1. `get_active_tab` → know where we are.
2. `navigate` / `open_tab` → go to the target.
3. `get_active_tab` → confirm it loaded.
4. `read_page` / `extract_links` → read content.
5. `click` / `type` → interact if needed.
6. `screenshot` → visual evidence if the user asked for it.

## Troubleshooting

- 503 / `firefox_connected:false` → check `allowed_extensions` (must be `nanobot-panel@localhost` with `@`), kill stale host processes, restart Firefox.
- Odd results after navigating → the tab may have changed; re-check `get_active_tab`.
