import {
  AutoProcessor,
  AutoModelForImageTextToText,
  load_image,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/FastVLM-0.5B-ONNX";

let processor = null;
let model = null;

async function initFastVLM() {
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
    dtype: {
      embed_tokens: "fp16",
      vision_encoder: "q4",
      decoder_model_merged: "q4",
    },
    device: "webgpu",
  });
}

async function analyzeScreen(screenshotBlob, taskContext) {
  const imageUrl = URL.createObjectURL(screenshotBlob);
  const image = await load_image(imageUrl);

  const messages = [{
    role: "user",
    content: `<image>Analyze this screen. List visible UI elements 
    (buttons, input fields, links). User task: "${taskContext}".`,
  }];

  const prompt = processor.apply_chat_template(messages, { 
    add_generation_prompt: true 
  });

  const inputs = await processor(image, prompt, { 
    add_special_tokens: false 
  });

  const outputs = await model.generate({
    ...inputs,
    max_new_tokens: 256,
    do_sample: false,
  });

  const decoded = processor.batch_decode(
    outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
    { skip_special_tokens: true }
  );

  URL.revokeObjectURL(imageUrl);
  return decoded[0];
}

self.onmessage = async (e) => {
  if (e.data.type === "init") {
    await initFastVLM();
    self.postMessage({ type: "ready" });
  }
  if (e.data.type === "analyze") {
    const desc = await analyzeScreen(
      e.data.screenshotBlob, 
      e.data.taskContext
    );
    self.postMessage({ type: "analysis", description: desc });
  }
};