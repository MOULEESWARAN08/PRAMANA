// visionWorker.js — Runs in a Web Worker to keep UI responsive
import {
  AutoProcessor,
  AutoModelForImageTextToText,
  load_image,
  TextStreamer,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/FastVLM-0.5B-ONNX";

let processor = null;
let model = null;

async function initFastVLM(onProgress) {
  // Load processor and model with quantized dtypes for browser efficiency
  processor = await AutoProcessor.from_pretrained(MODEL_ID, {
    progress_callback: onProgress,
  });

  model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
    dtype: {
      embed_tokens: "fp16",
      vision_encoder: "q4",
      decoder_model_merged: "q4",
    },
    device: "webgpu",
    progress_callback: onProgress,
  });
}

async function analyzeScreen(screenshotBlob, taskContext) {
  // Convert blob to image
  const imageUrl = URL.createObjectURL(screenshotBlob);
  const image = await load_image(imageUrl);

  // Build the prompt — this is what FastVLM will answer
  const messages = [
    {
      role: "user",
      content:
        `<image>You are a browser automation agent. Analyze this screen ` +
        `and describe what UI elements are visible (buttons, input fields, ` +
        `links, forms). The user's task is: "${taskContext}". ` +
        `List the most relevant interactive elements with approximate positions.`,
    },
  ];

  const prompt = processor.apply_chat_template(messages, {
    add_generation_prompt: true,
  });

  const inputs = await processor(image, prompt, {
    add_special_tokens: false,
  });

  // Generate with streaming for faster perceived response
  let output = "";
  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      output += text;
      // Optionally stream partial results to UI
      self.postMessage({ type: "partial", text });
    },
  });

  const outputs = await model.generate({
    ...inputs,
    max_new_tokens: 256,
    do_sample: false,
    streamer,
  });

  const decoded = processor.batch_decode(
    outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
    { skip_special_tokens: true }
  );

  URL.revokeObjectURL(imageUrl);
  return decoded[0];
}

// Worker message handler
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === "init") {
    await initFastVLM((progress) => {
      self.postMessage({ type: "progress", progress });
    });
    self.postMessage({ type: "ready" });
  }

  if (type === "analyze") {
    const { screenshotBlob, taskContext } = payload;
    const description = await analyzeScreen(screenshotBlob, taskContext);
    self.postMessage({ type: "analysis", description });
  }
}

// background.js — Orchestration and caching
import { env } from "@huggingface/transformers";

// Enable browser caching (default is true, but explicit here)
env.useBrowserCache = true;
env.allowLocalModels = false; // We're fetching from Hugging Face

let visionWorker = null;

async function ensureVisionWorker() {
  if (visionWorker) return visionWorker;

  visionWorker = new Worker("workers/visionWorker.js", { type: "module" });

  // Wait for model to load
  await new Promise((resolve, reject) => {
    visionWorker.onmessage = (e) => {
      if (e.data.type === "ready") resolve();
      if (e.data.type === "progress") {
        console.log("Model loading:", e.data.progress);
      }
    };
    visionWorker.postMessage({ type: "init" });
  });

  return visionWorker;
}
// piiPatterns.js
export const PII_PATTERNS = [
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "phone", regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { name: "credit_card", regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { name: "aadhaar", regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g },
  { name: "pan", regex: /[A-Z]{5}[0-9]{4}[A-Z]{1}/g },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "api_key", regex: /(?:sk-|pk_|api[_-]?key[=:]\s*)[A-Za-z0-9_-]{20,}/g },
]

// domScanner.js
export function detectSensitiveDOMRegions() {
  const regions = [];

  // Password fields — black out entirely
  document.querySelectorAll("input[type='password']").forEach((el) => {
    regions.push({
      rect: el.getBoundingClientRect(),
      type: "password",
      severity: "critical",
    });
  });

  // Autocomplete fields that often contain PII
  const sensitiveAutocomplete = [
    "cc-number", "cc-csc", "cc-exp", "email", "tel",
    "given-name", "family-name", "street-address", "postal-code",
  ];
  document.querySelectorAll("input[autocomplete]").forEach((el) => {
    const ac = el.getAttribute("autocomplete");
    if (sensitiveAutocomplete.includes(ac)) {
      regions.push({
        rect: el.getBoundingClientRect(),
        type: ac,
        severity: "high",
      });
    }
  });

  // Text nodes matching PII regex
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    for (const pattern of PII_PATTERNS) {
      if (pattern.regex && pattern.regex.test(node.textContent)) {
        const range = document.createRange();
        range.selectNodeContents(node);
        regions.push({
          rect: range.getBoundingClientRect(),
          type: pattern.name,
          severity: "high",
        });
      }
    }
  }

  return regions;
}

// faceDetector.js
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let faceDetector = null;

export async function initFaceDetector() {
  const vision = await FilesetResolver.forVisionTasks("wasm/");
  faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "models/blaze_face_short_range.tflite",
    },
    runningMode: "IMAGE",
  });
}

export async function detectFaces(imageBitmap) {
  const detections = faceDetector.detect(imageBitmap);
  return detections.detections.map((d) => ({
    rect: {
      x: d.boundingBox.originX,
      y: d.boundingBox.originY,
      width: d.boundingBox.width,
      height: d.boundingBox.height,
    },
    type: "face",
    severity: "critical",
  }));
}

// redactor.js
import { detectSensitiveDOMRegions } from "./domScanner.js";
import { detectFaces } from "./faceDetector.js";

export async function sanitizeScreenshot(screenshotBlob) {
  const img = await createImageBitmap(screenshotBlob);

  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // Collect all sensitive regions (run in parallel)
  const [domRegions, faceRegions] = await Promise.all([
    detectSensitiveDOMRegions(),
    detectFaces(img),
  ]);

  const allRegions = [...domRegions, ...faceRegions];
  const metadata = [];

  for (const region of allRegions) {
    const { x, y, width, height } = region.rect;

    if (region.severity === "critical") {
      // Solid black box — irreversible
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, width, height);
    } else {
      // Gaussian blur for high-severity (faces, some PII)
      ctx.filter = "blur(15px)";
      ctx.drawImage(img, x, y, width, height, x, y, width, height);
      ctx.filter = "none";
    }

    // Record metadata so server can reason about redacted elements
    metadata.push({
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(width),
      h: Math.round(height),
      type: region.type,
      redaction: region.severity === "critical" ? "blackout" : "blur",
    });
  }

  const sanitizedBlob = await canvas.convertToBlob({
    type: "image/webp",
    quality: 0.85,
  });

  return { sanitizedBlob, metadata };
}

// background.js — Agent step orchestration
async function runAgentStep(taskContext) {
  // 1. Capture screenshot (requires "activeTab" permission)
  const rawDataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  const rawBlob = await (await fetch(rawDataUrl)).blob();

  // 2. Get FastVLM analysis (runs locally in WebGPU)
  const worker = await ensureVisionWorker();
  const vlmDescription = await new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.type === "analysis") resolve(e.data.description);
    };
    worker.postMessage({
      type: "analyze",
      payload: { screenshotBlob: rawBlob, taskContext },
    });
  });

  // 3. Sanitize — this runs in a worker with no network
  const { sanitizedBlob, metadata } = await sanitizeScreenshot(rawBlob);

  // 4. ONLY NOW make the network request
  const formData = new FormData();
  formData.append("image", sanitizedBlob, "screen.webp");
  formData.append("metadata", JSON.stringify(metadata));
  formData.append("task", taskContext);
  formData.append("local_vlm_analysis", vlmDescription);

  const response = await fetch(SERVER_URL + "/agent/step", {
    method: "POST",
    body: formData,
  });

  const action = await response.json();
  await executeAction(action);
}
// actionExecutor.js
async function executeAction(action) {
  switch (action.action) {
    case "click": {
      const el = document.querySelector(action.target);
      if (el) {
        el.click();
      } else {
        const [x, y] = action.target.split(",").map(Number);
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          clientX: x,
          clientY: y,
        });
        document.elementFromPoint(x, y)?.dispatchEvent(clickEvent);
      }
      break;
    }
    case "type": {
      const el = document.querySelector(action.target);
      if (el) {
        el.focus();
        el.value = action.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      break;
    }
    case "scroll":
      window.scrollBy({ top: action.value || 500, behavior: "smooth" });
      break;
    case "navigate":
      window.location.href = action.value;
      break;
    case "done":
      return { status: "complete" };
  }
}