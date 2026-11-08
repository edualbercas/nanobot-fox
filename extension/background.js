// Nanobot Panel - background script
// Opens the sidebar panel with http://127.0.0.1:8765/ on install and
// exposes a command to reopen it from keyboard or menu.
// Implements Native Messaging to receive commands from Nanobot.

const PANEL_URL = "http://127.0.0.1:8765/";
const NATIVE_HOST = "nanobot.browser";

let port = null;
let reconnectTimer = null;

browser.runtime.onInstalled.addListener(() => {
  browser.sidebarAction.open().catch((err) => {
    console.error("Failed to open sidebar panel:", err);
  });
});

browser.commands.onCommand.addListener((command) => {
  if (command === "open-nanobot-panel") {
    browser.sidebarAction
      .open()
      .then(() => browser.sidebarAction.setPanel({ panel: PANEL_URL }))
      .catch((err) => console.error("Failed to open panel:", err));
  }
});

// === Native Messaging Connection ===

function connectNativeHost() {
  if (port) {
    return;
  }

  try {
    port = browser.runtime.connectNative(NATIVE_HOST);

    port.onMessage.addListener((msg) => {
      if (msg && msg.type === "bridge_ready") {
        port.postMessage({ type: "bridge_connected" });
        return;
      }
      handleExtensionMessage(msg);
    });

    port.onDisconnect.addListener(() => {
      console.log("Native host disconnected:", browser.runtime.lastError);
      port = null;
      broadcastStatus("disconnected");
      // Retry connection after 2 seconds
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectNativeHost, 2000);
    });

    console.log("Connected to native host");
    broadcastStatus("connected");
  } catch (err) {
    console.error("Error connecting to native host:", err);
    port = null;
    broadcastStatus("disconnected");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectNativeHost, 2000);
  }
}

// Start automatic connection
connectNativeHost();

function broadcastStatus(status) {
  browser.runtime.sendMessage({ type: "ws-status", status }).catch(() => {});
}

// Listen for initial status requests from panel
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-ws-status") {
    const status = port ? "connected" : "disconnected";
    sendResponse({ status });
  }
});

// === Handlers for messages from Nanobot (via Native Host) ===

async function handleExtensionMessage(msg) {
  const { id, action, params } = msg;

  try {
    const result = await handleAction(action, params);
    sendResponse(id, true, result);
  } catch (err) {
    sendResponse(id, false, null, err.message || String(err));
  }
}

function sendResponse(id, success, data, error = null) {
  if (!port) return;

  const response = { id, success };
  if (success) {
    response.data = data;
  } else {
    response.error = error;
  }

  port.postMessage(response);
}

// === Browser Action Handlers ===

async function handleAction(action, params = {}) {
  switch (action) {
    case "get_tabs": {
      const tabs = await browser.tabs.query({});
      return tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active }));
    }

    case "get_active_tab": {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab in current window");
      return { id: tab.id, url: tab.url, title: tab.title };
    }

    case "navigate": {
      const tabId = params.tabId || (await getActiveTabId());
      const updatedTab = await browser.tabs.update(tabId, { url: params.url });
      return { id: updatedTab.id, url: updatedTab.url, status: "loading" };
    }

    case "open_tab": {
      const newTab = await browser.tabs.create({ url: params.url });
      return { id: newTab.id, url: newTab.url };
    }

    case "close_tab": {
      if (!params.tabId) throw new Error("tabId is required");
      await browser.tabs.remove(params.tabId);
      return { success: true };
    }

    case "switch_tab": {
      if (!params.tabId) throw new Error("tabId is required");
      const tab = await browser.tabs.update(params.tabId, { active: true });
      return { id: tab.id, url: tab.url, active: true };
    }

    case "read_page": {
      const tabId = params.tabId || (await getActiveTabId());
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          return {
            title: document.title,
            url: window.location.href,
            text: document.body.innerText || ""
          };
        }
      });
      return results[0].result;
    }

    case "get_page_html": {
      const tabId = params.tabId || (await getActiveTabId());
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => document.documentElement.outerHTML
      });
      return results[0].result;
    }

    case "screenshot": {
      const dataUrl = await browser.tabs.captureVisibleTab(null, { format: "png" });
      return { image_base64: dataUrl.split(",")[1] };
    }

    case "click": {
      const tabId = params.tabId || (await getActiveTabId());
      if (!params.selector) throw new Error("selector is required");
      const results = await browser.scripting.executeScript({
        target: { tabId },
        args: [params.selector],
        func: (sel) => {
          const el = document.querySelector(sel);
          if (!el) return { success: false, error: `Selector '${sel}' not found` };
          el.click();
          return { success: true };
        }
      });
      return results[0].result;
    }

    case "type": {
      const tabId = params.tabId || (await getActiveTabId());
      if (!params.selector) throw new Error("selector is required");
      if (params.text === undefined) throw new Error("text is required");
      const results = await browser.scripting.executeScript({
        target: { tabId },
        args: [params.selector, params.text],
        func: (sel, text) => {
          const el = document.querySelector(sel);
          if (!el) return { success: false, error: `Selector '${sel}' not found` };
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        }
      });
      return results[0].result;
    }

    case "submit_form": {
      const tabId = params.tabId || (await getActiveTabId());
      if (!params.selector) throw new Error("selector is required (for form or button)");
      const results = await browser.scripting.executeScript({
        target: { tabId },
        args: [params.selector],
        func: (sel) => {
          const el = document.querySelector(sel);
          if (!el) return { success: false, error: `Selector '${sel}' not found` };
          if (el.tagName === "FORM") {
            el.submit();
            return { success: true, method: "form_submit" };
          } else {
            el.click();
            return { success: true, method: "button_click" };
          }
        }
      });
      return results[0].result;
    }

    case "extract_links": {
      const tabId = params.tabId || (await getActiveTabId());
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          return Array.from(document.querySelectorAll('a')).map(a => ({
            text: a.innerText.trim(),
            href: a.href
          })).filter(a => a.href);
        }
      });
      return results[0].result;
    }

    case "search_page": {
      const tabId = params.tabId || (await getActiveTabId());
      if (!params.query) throw new Error("query is required");
      const results = await browser.scripting.executeScript({
        target: { tabId },
        args: [params.query],
        func: (q) => {
          const text = document.body.innerText || "";
          const count = (text.match(new RegExp(q, "gi")) || []).length;
          return { count, query: q };
        }
      });
      return results[0].result;
    }

    default:
      throw new Error(`Unknown action '${action}'`);
  }
}

async function getActiveTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab in current window");
  return tab.id;
}