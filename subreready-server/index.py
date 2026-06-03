from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from llama_cpp import Llama
import json

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

llm = Llama(model_path="./model/Qwen3-4B-Q4_K_M.gguf")

@app.post("/triage")
async def triage(body: dict):
    result = llm.create_chat_completion(
        messages=[{
            "role": "user",
            "content": f"Analyze this contractor document. Return only JSON with status (green/amber/red), reason, nextStep.\n\n{body['ocrText']}"
        }],
        response_format={ "type": "json_object" }
    )
    return json.loads(result['choices'][0]['message']['content'])

