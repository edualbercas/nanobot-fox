const NATIVE_HOST = "nanobot.browser";
const API_NAMESPACES = new Set(["tabs", "windows", "bookmarks", "history", "cookies", "downloads", "sessions", "storage", "webNavigation", "browsingData", "find", "topSites", "permissions", "alarms", "idle", "notifications", "contextMenus", "commands", "sidebarAction", "theme", "privacy", "proxy", "management", "contextualIdentities", "browserSettings", "contentSettings", "search", "dns", "identity", "geolocation", "tabGroups", "action", "browserAction", "pageAction", "declarativeNetRequest", "userScripts", "debugger", "captivePortal", "publicSuffix", "pkcs11", "omnibox"]);
let port = null;
let reconnectTimer = null;
let reconnectDelay = 1000;

browser.runtime.onInstalled.addListener(async () => {
  try {
    await browser.contextMenus.removeAll();
    await browser.contextMenus.create({ id: "send-to-nanobot", title: "Enviar a Nanobot", contexts: ["selection", "page"] });
  } catch (error) {
    console.error(error);
  }
  try {
    await browser.sidebarAction.open();
  } catch (error) {
    console.error(error);
  }
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-nanobot" && port) {
    port.postMessage({ type: "user_input", payload: { text: info.selectionText || "Página completa", url: tab?.url, tabId: tab?.id } });
  }
});

browser.commands.onCommand.addListener(async command => {
  if (command === "open-nanobot-panel") {
    try { await browser.sidebarAction.open(); } catch (error) { console.error(error); }
  }
});

function connectNativeHost() {
  if (port) return;
  try {
    const nextPort = browser.runtime.connectNative(NATIVE_HOST);
    port = nextPort;
    nextPort.onMessage.addListener(message => {
      if (message?.type === "bridge_ready") {
        nextPort.postMessage({ type: "bridge_connected" });
        return;
      }
      handleExtensionMessage(message);
    });
    nextPort.onDisconnect.addListener(() => {
      const error = browser.runtime.lastError;
      console.error("Native host disconnected", error?.message || "");
      if (port === nextPort) port = null;
      broadcastStatus("disconnected");
      scheduleReconnect();
    });
    reconnectDelay = 1000;
    broadcastStatus("connected");
  } catch (error) {
    port = null;
    console.error("Native host connection failed", error);
    broadcastStatus("disconnected");
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeHost();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 15000);
}

connectNativeHost();

function broadcastStatus(status) {
  browser.runtime.sendMessage({ type: "ws-status", status }).catch(() => {});
}

browser.runtime.onMessage.addListener(message => {
  if (message?.type === "get-ws-status") return Promise.resolve({ status: port ? "connected" : "disconnected" });
});

async function handleExtensionMessage(message) {
  const id = message?.id;
  try {
    const data = await handleAction(message?.action, message?.params || {});
    sendResponse(id, true, data);
  } catch (error) {
    sendResponse(id, false, null, error?.message || String(error));
  }
}

function sendResponse(id, success, data, error = null) {
  if (!port) return;
  const response = { id, success };
  if (success) response.data = data;
  else response.error = error;
  try { port.postMessage(response); } catch (sendError) { console.error(sendError); }
}

async function activeTabId() {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error("No hay una pestaña activa");
  return tab.id;
}

async function targetTabId(params) {
  return params.tabId ?? await activeTabId();
}

async function inject(tabId, func, args = []) {
  const result = await browser.scripting.executeScript({ target: { tabId }, func, args });
  if (!result?.length) throw new Error("Firefox no devolvió resultados del script");
  return result.map(item => ({ frameId: item.frameId, result: item.result }));
}

async function browserApi(params) {
  const path = params.path;
  if (typeof path !== "string" || !path.trim()) throw new Error("path es obligatorio, por ejemplo downloads.search");
  const parts = path.split(".");
  if (parts.length < 2 || !API_NAMESPACES.has(parts[0])) throw new Error("API no permitida: " + path);
  if (parts.some(part => !/^[A-Za-z][A-Za-z0-9_]*$/.test(part))) throw new Error("Ruta API inválida");
  let target = browser;
  let parent = browser;
  for (const part of parts) {
    if (target == null || !(part in target)) throw new Error("API no disponible en esta versión de Firefox: " + path);
    parent = target;
    target = target[part];
  }
  if (typeof target !== "function") throw new Error("La ruta no identifica una función API: " + path);
  const args = params.args ?? [];
  if (!Array.isArray(args)) throw new Error("args debe ser un array");
  const result = await target.apply(parent, args);
  return result === undefined ? { success: true } : result;
}

async function handleAction(action, params = {}) {
  switch (action) {
    case "get_tabs": return browser.tabs.query(params.query || {});
    case "get_active_tab": {
      const tab = await browser.tabs.get(await activeTabId());
      return tab;
    }
    case "get_tab": return browser.tabs.get(params.tabId);
    case "navigate": return browser.tabs.update(await targetTabId(params), { url: params.url });
    case "reload_tab": return browser.tabs.reload(await targetTabId(params), { bypassCache: !!params.bypassCache }).then(() => ({ success: true }));
    case "open_tab": return browser.tabs.create({ url: params.url, active: params.active !== false, pinned: !!params.pinned, index: params.index, windowId: params.windowId });
    case "duplicate_tab": return browser.tabs.duplicate(params.tabId ?? await activeTabId());
    case "close_tab": await browser.tabs.remove(params.tabId ?? await activeTabId()); return { success: true };
    case "close_tabs": await browser.tabs.remove(params.tabIds); return { success: true };
    case "switch_tab": return browser.tabs.update(params.tabId, { active: true });
    case "move_tab": return browser.tabs.move(params.tabId, { windowId: params.windowId, index: params.index });
    case "pin_tab": return browser.tabs.update(params.tabId ?? await activeTabId(), { pinned: params.pinned !== false });
    case "mute_tab": return browser.tabs.update(params.tabId ?? await activeTabId(), { muted: params.muted !== false });
    case "zoom_tab": return browser.tabs.setZoom(params.tabId ?? await activeTabId(), params.zoom);
    case "get_windows": return browser.windows.getAll({ populate: !!params.populate, windowTypes: params.windowTypes });
    case "get_window": return browser.windows.get(params.windowId, { populate: !!params.populate });
    case "create_window": return browser.windows.create({ url: params.url, type: params.type || "normal", focused: params.focused !== false, incognito: !!params.incognito, state: params.state });
    case "update_window": return browser.windows.update(params.windowId, params.updateInfo || {});
    case "close_window": await browser.windows.remove(params.windowId); return { success: true };
    case "read_page": {
      const tabId = await targetTabId(params);
      const results = await inject(tabId, () => ({ title: document.title, url: location.href, text: document.body?.innerText || "", html: document.documentElement?.outerHTML?.slice(0, 200000) || "", readyState: document.readyState }));
      return results[0].result;
    }
    case "get_page_html": {
      const results = await inject(await targetTabId(params), max => document.documentElement.outerHTML.slice(0, max), [params.maxLength || 500000]);
      return results[0].result;
    }
    case "click": {
      if (params.x !== undefined && params.y !== undefined) {
        return inject(await targetTabId(params), (x, y) => { const element = document.elementFromPoint(x, y); if (!element) throw new Error("No hay elemento en esas coordenadas"); element.click(); return { tag: element.tagName, text: element.innerText?.slice(0, 200) }; }, [params.x, params.y]);
      }
      if (!params.selector) throw new Error("selector es obligatorio");
      return inject(await targetTabId(params), selector => { const element = document.querySelector(selector); if (!element) throw new Error("Selector no encontrado: " + selector); element.click(); return { tag: element.tagName, text: element.innerText?.slice(0, 200) }; }, [params.selector]);
    }
    case "type": return inject(await targetTabId(params), (selector, text, clear) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Selector no encontrado: " + selector);
      element.focus();
      if (element.isContentEditable) {
        if (clear) element.textContent = "";
        document.execCommand("insertText", false, text);
      } else {
        const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        const value = (clear ? "" : element.value) + text;
        if (setter) setter.call(element, value); else element.value = value;
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return { success: true, value: element.isContentEditable ? element.textContent : element.value };
    }, [params.selector, String(params.text ?? ""), !!params.clear]);
    case "select_option": return inject(await targetTabId(params), (selector, value) => { const element = document.querySelector(selector); if (!element) throw new Error("Selector no encontrado"); element.value = value; element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); return { success: true, value: element.value }; }, [params.selector, String(params.value)]);
    case "press_key": return inject(await targetTabId(params), (selector, key) => { const element = selector ? document.querySelector(selector) : document.activeElement; if (!element) throw new Error("Elemento no encontrado"); element.focus(); for (const type of ["keydown", "keyup"]) element.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })); return { success: true, key }; }, [params.selector || null, params.key]);
    case "hover": return inject(await targetTabId(params), selector => { const element = document.querySelector(selector); if (!element) throw new Error("Selector no encontrado"); element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); return { success: true }; }, [params.selector]);
    case "scroll": return inject(await targetTabId(params), (x, y, behavior) => { window.scrollTo({ left: x || 0, top: y || 0, behavior: behavior || "smooth" }); return { x: scrollX, y: scrollY }; }, [params.x, params.y, params.behavior]);
    case "scroll_into_view": return inject(await targetTabId(params), selector => { const element = document.querySelector(selector); if (!element) throw new Error("Selector no encontrado"); element.scrollIntoView({ behavior: "smooth", block: "center" }); return { success: true }; }, [params.selector]);
    case "extract_links": return inject(await targetTabId(params), () => Array.from(document.links, a => ({ text: a.innerText.trim(), href: a.href, title: a.title })).filter(a => a.href));
    case "find_text": return browser.find.find(params.text, { tabId: params.tabId ?? await activeTabId(), caseSensitive: !!params.caseSensitive, entireWord: !!params.entireWord, includeRangeData: true });
    case "screenshot": {
      const dataUrl = await browser.tabs.captureVisibleTab(params.windowId, { format: params.format || "png", quality: params.quality });
      return { image_base64: dataUrl.split(",")[1], mime_type: "image/" + (params.format || "png") };
    }
    case "get_cookies": return browser.cookies.getAll({ url: params.url, domain: params.domain, name: params.name, storeId: params.storeId });
    case "set_cookie": return browser.cookies.set(params.cookie || params);
    case "remove_cookie": return browser.cookies.remove({ url: params.url, name: params.name, storeId: params.storeId });
    case "get_history": return browser.history.search({ text: params.text || "", maxResults: params.maxResults || 50, startTime: params.startTime, endTime: params.endTime });
    case "delete_history": await browser.history.deleteUrl({ url: params.url }); return { success: true };
    case "get_bookmarks": return browser.bookmarks.getTree();
    case "search_bookmarks": return browser.bookmarks.search(params.query);
    case "create_bookmark": return browser.bookmarks.create({ title: params.title, url: params.url, parentId: params.parentId, index: params.index });
    case "update_bookmark": return browser.bookmarks.update(params.id, params.changes);
    case "remove_bookmark": await browser.bookmarks.remove(params.id); return { success: true };
    case "get_downloads": return browser.downloads.search(params.query || {});
    case "download": return { id: await browser.downloads.download({ url: params.url, filename: params.filename, saveAs: !!params.saveAs, conflictAction: params.conflictAction || "uniquify" }) };
    case "cancel_download": await browser.downloads.cancel(params.id); return { success: true };
    case "erase_download": await browser.downloads.erase({ id: params.id }); return { success: true };
    case "get_sessions": return browser.sessions.getRecentlyClosed({ maxResults: params.maxResults || 25 });
    case "restore_session": return params.sessionId ? browser.sessions.restore(params.sessionId) : browser.sessions.restore();
    case "storage_get": return browser.storage[params.area || "local"].get(params.key ?? null);
    case "storage_set": await browser.storage[params.area || "local"].set(params.items || { [params.key]: params.value }); return { success: true };
    case "storage_remove": await browser.storage[params.area || "local"].remove(params.keys || params.key); return { success: true };
    case "get_top_sites": return browser.topSites.get({ limit: params.limit || 20 });
    case "get_permissions": return browser.permissions.getAll();
    case "request_permissions": return { granted: await browser.permissions.request({ permissions: params.permissions || [], origins: params.origins || [] }) };
    case "get_web_navigation": return browser.webNavigation.getAllFrames({ tabId: params.tabId ?? await activeTabId() });
    case "clear_data": await browser.browsingData.remove(params.options || { since: 0 }, params.dataToRemove || { cache: true, cookies: true, history: true }); return { success: true };
    case "notify": await browser.notifications.create(params.notificationId || "nanobot-notify", { type: "basic", iconUrl: browser.runtime.getURL("icon-32.png"), title: params.title || "Nanobot", message: params.message || "" }); return { success: true };
    case "browser_api": return browserApi(params);
    case "get_capabilities": return { firefoxVersion: navigator.userAgent, namespaces: Array.from(API_NAMESPACES).filter(name => !!browser[name]), actions: ["get_tabs", "get_active_tab", "get_tab", "navigate", "reload_tab", "open_tab", "duplicate_tab", "close_tab", "close_tabs", "switch_tab", "move_tab", "pin_tab", "mute_tab", "zoom_tab", "get_windows", "get_window", "create_window", "update_window", "close_window", "read_page", "get_page_html", "click", "type", "select_option", "press_key", "hover", "scroll", "scroll_into_view", "extract_links", "find_text", "screenshot", "get_cookies", "set_cookie", "remove_cookie", "get_history", "delete_history", "get_bookmarks", "search_bookmarks", "create_bookmark", "update_bookmark", "remove_bookmark", "get_downloads", "download", "cancel_download", "erase_download", "get_sessions", "restore_session", "storage_get", "storage_set", "storage_remove", "get_top_sites", "get_permissions", "request_permissions", "get_web_navigation", "clear_data", "notify", "browser_api"] };
    default: throw new Error("Acción desconocida: " + action);
  }
}
