import { detectSensitiveDOMRegions } from "./domScanner.js";
import { detectFaces } from "./faceDetector.js";

export async function sanitizeScreenshot(screenshotBlob) {
  const img = await createImageBitmap(screenshotBlob);
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const [domRegions, faceRegions] = await Promise.all([
    detectSensitiveDOMRegions(),
    detectFaces(img),
  ]);

  const allRegions = [...domRegions, ...faceRegions];
  const metadata = [];

  for (const region of allRegions) {
    const { x, y, width, height } = region.rect;

    if (region.severity === "critical") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, width, height);
    } else {
      ctx.filter = "blur(15px)";
      ctx.drawImage(img, x, y, width, height, x, y, width, height);
      ctx.filter = "none";
    }

    metadata.push({
      x: Math.round(x), y: Math.round(y),
      w: Math.round(width), h: Math.round(height),
      type: region.type,
      redaction: region.severity === "critical" ? "blackout" : "blur",
    });
  }

  const sanitizedBlob = await canvas.convertToBlob({ 
    type: "image/webp", 
    quality: 0.85 
  });

  return { sanitizedBlob, metadata };
}