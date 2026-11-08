# Nanobot Fox

Extensión de Firefox + skill de Nanobot que permiten a Nanobot inspeccionar y controlar la sesión activa de Firefox (listar pestañas, navegar, leer páginas, hacer clic, escribir, extraer enlaces y capturar pantallas).

Además incluye un panel lateral (`Ctrl+Shift+N`) que abre la interfaz local de Nanobot en `http://127.0.0.1:8765/`.

## Arquitectura

```
Nanobot ──HTTP──▶ 127.0.0.1:8766 (native_host.py) ──Native Messaging──▶ Extensión Nanobot Panel ──▶ Firefox
```

- La extensión se comunica con el **Native Messaging host** (`skills/native_host.py`).
- El host expone una API HTTP local solo en `127.0.0.1:8766`, protegida con un bearer token privado en `~/.nanobot/browser-token` (permisos 0600).
- Los comandos enviados a esa API se reenvían a la extensión y el resultado vuelve a Nanobot.
- **Nunca** expongas el puerto 8766 ni el token fuera de la máquina local.

## Requisitos

- Firefox Developer Edition (o cualquier Firefox ≥ 142) con la extensión instalada.
- Python 3 (solo stdlib) para el native host.
- Nanobot corriendo en la misma máquina.

## Instalación (usuario)

1. **Instalar la extensión**
   - Abrí `about:addons` en Firefox → menú de engranaje → **Install Add-on From File** → seleccioná `nanobot-panel.xpi`.
   - Al instalarse se abre solo el panel lateral de Nanobot.

2. **Instalar el native host**
   - Copiá la carpeta `skills/` a una ubicación permanente, por ejemplo:
     ```bash
     mkdir -p ~/.nanobot/workspace/skills/firefox-browser
     cp -r skills/* ~/.nanobot/workspace/skills/firefox-browser/
     chmod +x ~/.nanobot/workspace/skills/firefox-browser/native_host.py
     ```
   - Creá el manifest de native messaging `~/.mozilla/native-messaging-hosts/nanobot.browser.json` con la ruta absoluta a tu `native_host.py`:
     ```json
     {
       "name": "nanobot.browser",
       "description": "Local HTTP bridge for Nanobot Firefox extension",
       "path": "/home/TU_USUARIO/.nanobot/workspace/skills/firefox-browser/native_host.py",
       "type": "stdio",
       "allowed_extensions": ["nanobot-panel@localhost"]
     }
     ```
     > ⚠️ `allowed_extensions` debe contener exactamente `nanobot-panel@localhost` (con el `@`). Un error aquí hace que Firefox nunca inicie el host, sin avisar.

3. **Reiniciar Firefox**
   - Cerrá y volvé a abrir Firefox. El host se inicia automáticamente cuando la extensión se conecta.
   - Dejá Firefox abierto mientras Nanobot lo controla.

## Verificación rápida

```bash
# ¿La extensión está conectada?
curl -s http://127.0.0.1:8766/status
# Esperado: {"success":true,"firefox_connected":true}

# Listar pestañas
TOKEN="$(cat ~/.nanobot/browser-token)"
curl -sS -X POST http://127.0.0.1:8766/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"get_tabs"}'
```

## Acciones disponibles

| Acción | Parámetros | Descripción |
|---|---|---|
| `get_tabs` | — | Lista todas las pestañas |
| `get_active_tab` | — | Pestaña activa (URL, título) |
| `navigate` | `params.url` | Navega la pestaña activa |
| `open_tab` | `params.url` | Abre una pestaña nueva |
| `read_page` | — | Texto de la página activa |
| `click` | `params.selector` | Clic en el primer elemento que matchea |
| `type` | `params.selector`, `params.text` | Escribe en el primer elemento que matchea |
| `extract_links` | — | Links de la página activa |
| `screenshot` | — | Captura de la pestaña activa |

Ejemplo de comando:

```bash
curl -sS -X POST http://127.0.0.1:8766/command \
  -H "Authorization: Bearer $(cat ~/.nanobot/browser-token)" \
  -H 'Content-Type: application/json' \
  -d '{"action":"navigate","params":{"url":"https://github.com/HKUDS/nanobot"}}'
```

Los comandos esperan la respuesta de la extensión y hacen timeout a los **45 segundos**. Si la extensión no está conectada, el endpoint devuelve **503**.

## Solución de problemas

- **`firefox_connected: false` o 503**: verificá que `allowed_extensions` en `~/.mozilla/native-messaging-hosts/nanobot.browser.json` sea exactamente `["nanobot-panel@localhost"]`, matá procesos viejos del host y reiniciá Firefox.
- **`navigate` devuelve la URL anterior con estado `loading`**: confirmá con `get_active_tab` antes de asumir que cambió la página.
- **`type` escribió en otra página**: el selector apunta a la pestaña activa; verificá `get_active_tab` antes de acciones específicas de página.
- **Ejecutar `native_host.py` manualmente NO lo conecta a Firefox**: el host solo funciona cuando Firefox lo inicia vía Native Messaging.

## Estructura del repo

```
nanobot-fox/
├── extension/            # Código fuente de la extensión (MV3)
│   ├── manifest.json     # id: nanobot-panel@localhost
│   ├── background.js
│   ├── panel.html / panel.js
│   └── icon-*.png
├── nanobot-panel.xpi     # Extensión empaquetada, lista para instalar
├── skills/
│   ├── SKILL.md          # Skill para Nanobot (ver también AGENT.md)
│   ├── AGENT.md          # Instrucciones para el agente
│   ├── native_host.py    # Native Messaging host + puente HTTP 127.0.0.1:8766
│   └── nanobot.browser.json  # Manifest template
└── README.md
```

## Seguridad

- El puente HTTP escucha solo en `127.0.0.1` y exige bearer token.
- El token se genera con `secrets.token_urlsafe(32)` y se guarda en `~/.nanobot/browser-token` con permisos `0600`.
- No expongas ni el token ni el puerto a otras máquinas.
