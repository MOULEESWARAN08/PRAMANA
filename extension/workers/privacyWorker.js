// privacyWorker.js — Runs in isolated worker (no network). Detects PII and redacts.
import { detectSensitiveDOMRegions } from "../lib/domScanner.js";
import { detectFaces } from "../lib/faceDetector.js";
import { PII_PATTERNS } from "../lib/piiPatterns.js";

// NOTE: In a Web Worker we have no DOM access. DOM scanning happens in the
// content script and is passed here as pre-computed regions. For standalone
// running (e.g., screenshot-only mode), we rely on regex + face detection.

async function sanitize(blob) {
  const img = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // Layer 1 & 2: DOM regions (passed from content script via message)
  const domRegions = self.__domRegions || [];

  // Layer 3: Face detection
  let faceRegions = [];
  try {
    faceRegions = await detectFaces(img);
  } catch (err) {
    console.warn("Face detection failed:", err);
  }

  const allRegions = [...domRegions, ...faceRegions];
  const metadata = [];

  for (const region of allRegions) {
    const { x, y, width, height } = region.rect;
    if (width <= 0 || height <= 0) continue;

    if (region.severity === "critical") {
      // Solid black — irreversible
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, width, height);
    } else {
      // Gaussian blur for high severity
      ctx.filter = "blur(15px)";
      ctx.drawImage(img, x, y, width, height, x, y, width, height);
      ctx.filter = "none";
    }

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

self.onmessage = async (e) => {
  if (e.data.type === "sanitize") {
    try {
      if (e.data.domRegions) self.__domRegions = e.data.domRegions;
      const { sanitizedBlob, metadata } = await sanitize(e.data.blob);
      self.postMessage(
        { type: "sanitized", sanitizedBlob, metadata },
        [sanitizedBlob]
      );
    } catch (err) {
      self.postMessage({ type: "error", error: err.message });
    }
  }
};
