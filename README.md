# Privacy Vision Agent

A browser extension that runs a local FastVLM-0.5B vision-language model via
WebGPU to read your screen, redacts sensitive content locally, and sends only
sanitized data to a server-side VLM for reasoning.

## Privacy Guarantee

Sensitive pixels (passwords, faces, emails, card numbers) **never leave the
browser**. Only a sanitized image + metadata JSON crosses the network boundary.

## Install

### 1. Extension

```bash
cd extension
npm install @huggingface/transformers @mediapipe/tasks-vision
mkdir -p lib/transformers
cp node_modules/@huggingface/transformers/dist/transformers.js lib/transformers/
cp node_modules/@mediapipe/tasks-vision/wasm/* wasm/
