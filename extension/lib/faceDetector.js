import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let faceDetector = null;

export async function initFaceDetector() {
  const vision = await FilesetResolver.forVisionTasks("wasm/");
  faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "models/blaze_face_short_range.tflite",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.5,
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