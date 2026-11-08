# AGENT.md — firefox-browser (Nanobot)

Instrucciones para el agente Nanobot al usar esta skill. La versión canónica vive en `~/.nanobot/workspace/skills/firefox-browser/`.

## Cuándo usarla

Usala cuando el usuario pida navegar, leer, hacer clic, escribir, sacar links o capturar pantalla en Firefox, o cuando una tarea requiera interactuar con una página web abierta en el navegador del usuario.

## Requisitos previos (verificar antes de actuar)

1. Firefox corriendo con la extensión **Nanobot Panel** instalada (id `nanobot-panel@localhost`).
2. Native host instalado en `~/.mozilla/native-messaging-hosts/nanobot.browser.json` con `allowed_extensions` exactamente `["nanobot-panel@localhost"]` (con `@`).
3. El host expone HTTP en `127.0.0.1:8766`; el bearer token está en `~/.nanobot/browser-token` (0600).

## Patrón de uso

```bash
TOKEN="$(cat ~/.nanobot/browser-token)"
BASE="http://127.0.0.1:8766"

# 1) Estado de conexión
curl -s $BASE/status
# {"success":true,"firefox_connected":true} → OK
# firefox_connected:false o 503 → la extensión no está conectada; NO seguir

# 2) Enviar comando
curl -sS -X POST $BASE/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"ACCION","params":{...}}'
```

## Acciones

| action | params | uso |
|---|---|---|
| `get_tabs` | — | listar pestañas abiertas |
| `get_active_tab` | — | pestaña activa ahora |
| `navigate` | `url` | ir a una URL en la pestaña activa |
| `open_tab` | `url` | abrir pestaña nueva |
| `read_page` | — | texto plano de la página activa |
| `click` | `selector` | clic en primer match del selector CSS |
| `type` | `selector`, `text` | escribir texto en primer match |
| `extract_links` | — | links de la página activa |
| `screenshot` | — | captura de la pestaña activa |

## Reglas importantes

- **Siempre** chequear `/status` primero. Si `firefox_connected` es false o hay 503, decírselo al usuario: hace falta que Firefox esté abierto con la extensión activa y el manifest bien configurado. No inventes resultados.
- Timeout de comandos: **45s**. No reintentes en bucle; informá el fallo.
- `navigate` puede devolver la URL anterior con estado `loading` → confirmá con `get_active_tab`.
- `type` y `click` actúan sobre la **pestaña activa** y el **primer** elemento que matchea el selector → verificá `get_active_tab` antes si la acción depende de la página.
- Ejecutar `native_host.py` a mano NO conecta nada a Firefox; solo Firefox inicia el host vía Native Messaging.
- El token de `~/.nanobot/browser-token` es secreto local: nunca lo incluyas en mensajes, logs públicos ni URLs.

## Flujo típico

1. `get_active_tab` → saber dónde estamos.
2. `navigate`/`open_tab` → ir al destino.
3. `get_active_tab` → confirmar que cargó.
4. `read_page` / `extract_links` → leer contenido.
5. `click` / `type` → interactuar si hace falta.
6. `screenshot` → evidencia visual si el usuario la pidió.

## Troubleshooting

- 503 / `firefox_connected:false` → revisar `allowed_extensions` (debe ser `nanobot-panel@localhost` con `@`), matar procesos viejos del host, reiniciar Firefox.
- Resultados raros tras navegar → la pestaña pudo haber cambiado; re-chequear `get_active_tab`.
