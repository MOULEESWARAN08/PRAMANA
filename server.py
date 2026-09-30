
from fastapi import FastAPI, UploadFile, Form
import json, base64

app = FastAPI()

SYSTEM_PROMPT = """You are a browser automation agent. You receive screenshots
where sensitive regions have been REDACTED before transmission.

REDACTION METADATA:
{metadata}

LOCAL VLM ANALYSIS (from on-device model):
{local_analysis}

IMPORTANT RULES:
1. Blacked-out regions (redaction: "blackout") contain sensitive data that
   you MUST NOT attempt to interpret. Treat them as opaque elements.
2. Blurred regions (redaction: "blur") contain faces or high-risk PII.
   Do not attempt to identify individuals.
3. You CAN still reason about the PRESENCE of these elements:
   - A blacked-out field with type "password" means a password input exists.
   - You may instruct the client to "focus the password field and type the
     stored credential" without knowing the credential.
4. Return ONLY a JSON action object with this schema:
   {{"action": "click|type|scroll|navigate|done",
     "target": "CSS selector or coordinates",
     "value": "text to type (if applicable)",
     "reasoning": "brief explanation"}}
"""

@app.post("/agent/step")
async def agent_step(
    image: UploadFile,
    metadata: str = Form(...),
    task: str = Form(...),
    local_vlm_analysis: str = Form(""),
):
    img_bytes = await image.read()
    img_b64 = base64.b64encode(img_bytes).decode()

    prompt = SYSTEM_PROMPT.format(
        metadata=metadata,
        local_analysis=local_vlm_analysis,
    )
    prompt += f"\n\nUSER TASK: {task}\n\nWhat is the next action?"

    response = vlm_client.chat.completions.create(
        model="Qwen/Qwen2-VL-7B-Instruct",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/webp;base64,{img_b64}"}},
                {"type": "text", "text": task}
            ]}
        ],
        response_format={"type": "json_object"}
    )

    return json.loads(response.choices[0].message.content)

