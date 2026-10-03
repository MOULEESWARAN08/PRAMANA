// sidepanel.js — UI for the Privacy Vision Agent
const taskInput = document.getElementById("taskInput");
const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");

let stepCount = 0;

function setStatus(text) {
  statusEl.textContent = text;
}

function addLog(text, cls = "") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${cls}`;
  entry.textContent = text;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function setRunning(running) {
  runBtn.disabled = running;
  stopBtn.disabled = !running;
  taskInput.disabled = running;
}

// ---------- Buttons ----------
runBtn.addEventListener("click", async () => {
  const task = taskInput.value.trim();
  if (!task) {
    setStatus("Please enter a task.");
    return;
  }
  stepCount = 0;
  logEl.innerHTML = "";
  setRunning(true);
  setStatus("Starting agent...");
  addLog(`Task: ${task}`, "action");

  await chrome.runtime.sendMessage({ type: "START_TASK", task });
});

stopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_TASK" });
  setStatus("Stopped by user.");
  setRunning(false);
});

// ---------- Messages from background ----------
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "progress":
      setStatus(msg.message);
      if (msg.progress?.progress !== undefined) {
        const pct = Math.round(msg.progress.progress * 100);
        setStatus(`${msg.message} (${pct}%)`);
      }
      break;

    case "status":
      setStatus(msg.message);
      addLog(msg.message);
      break;

    case "action":
      stepCount = msg.step + 1;
      addLog(
        `Step ${stepCount}: ${msg.action.action} → ${msg.action.target || ""}`,
        "action"
      );
      if (msg.action.reasoning) {
        addLog(`  Reasoning: ${msg.action.reasoning}`);
      }
      break;

    case "done":
      setStatus(`✓ Done: ${msg.message}`);
      addLog(`✓ ${msg.message}`, "done");
      setRunning(false);
      break;

    case "error":
      setStatus(`✗ ${msg.message}`);
      addLog(`✗ ${msg.message}`, "error");
      setRunning(false);
      break;
  }
});

// Restore state on panel open
chrome.runtime.sendMessage({ type: "GET_STATE" }).then((state) => {
  if (state?.running) {
    setRunning(true);
    setStatus(`Running step ${state.step}...`);
  }
});

console.log("[Sidepanel] Loaded");