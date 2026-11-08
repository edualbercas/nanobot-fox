// Nanobot Panel - sidebar panel
// Keeps iframe pointing to http://127.0.0.1:8765/ and reloads
// if local server doesn't respond on page load.

const PANEL_URL = "http://127.0.0.1:8765/";
const frame = document.getElementById("nanobot");
const wsDot = document.getElementById("ws-dot");
const wsText = document.getElementById("ws-text");

frame.addEventListener("error", () => {
  frame.src = PANEL_URL + "?retry=" + Date.now();
});

// If iframe stays blank because server isn't ready yet,
// retry every 5 seconds until it loads.
let attempts = 0;
const timer = setInterval(() => {
  if (attempts >= 12) {
    clearInterval(timer);
    return;
  }
  attempts++;
  frame.src = PANEL_URL;
}, 5000);

frame.addEventListener("load", () => {
  clearInterval(timer);
});

// === Bridge Connection Status Handling ===

function updateWSStatus(status) {
  wsDot.className = "dot"; // Reset
  if (status === "connected") {
    wsDot.classList.add("connected");
    wsText.textContent = "Bridge Online";
  } else if (status === "reconnecting") {
    wsDot.classList.add("reconnecting");
    wsText.textContent = "Reconnecting...";
  } else {
    wsText.textContent = "Bridge Offline";
  }
}

// Get initial status
browser.runtime.sendMessage({ type: "get-ws-status" }).then((response) => {
  if (response && response.status) {
    updateWSStatus(response.status);
  }
}).catch(() => {});

// Listen for real-time status changes
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "ws-status") {
    updateWSStatus(message.status);
  }
});