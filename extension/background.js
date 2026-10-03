
let visionWorker = null;
const SERVER_URL = "https://your-server.com";

async function ensureVisionWorker() {
  if (visionWorker) return visionWorker;
  visionWorker = new Worker("visionWorker.js", { type: "module" });
  await new Promise((resolve) => {
    visionWorker.onmessage = (e) => {
      if (e.data.type === "ready") resolve();
    };
    visionWorker.postMessage({ type: "init" });
  });
  return visionWorker;
}

async function runAgentStep(taskContext) {
  // 1. Capture screen
  const rawDataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  const rawBlob = await (await fetch(rawDataUrl)).blob();

  // 2. FastVLM local analysis (WebGPU)
  const worker = await ensureVisionWorker();
  const vlmDescription = await new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.type === "analysis") resolve(e.data.description);
    };
    worker.postMessage({
      type: "analyze",
      screenshotBlob: rawBlob,
      taskContext,
    });
  });

  // 3. Local redaction (runs in Worker with no network access)
  const { sanitizedBlob, metadata } = await sanitizeScreenshot(rawBlob);

  // 4. Send only sanitized data
  const formData = new FormData();
  formData.append("image", sanitizedBlob, "screen.webp");
  formData.append("metadata", JSON.stringify(metadata));
  formData.append("task", taskContext);
  formData.append("local_vlm_analysis", vlmDescription);

  const response = await fetch(`${SERVER_URL}/agent/step`, {
    method: "POST",
    body: formData,
  });

  const action = await response.json();
  await executeAction(action);
}

async function executeAction(action) {
  switch (action.action) {
    case "click": {
      const el = document.querySelector(action.target);
      if (el) el.click();
      break;
    }
    case "type": {
      const el = document.querySelector(action.target);
      if (el) {
        el.focus();
        el.value = action.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      break;
    }
    case "scroll":
      window.scrollBy({ top: action.value || 500, behavior: "smooth" });
      break;
  }
}