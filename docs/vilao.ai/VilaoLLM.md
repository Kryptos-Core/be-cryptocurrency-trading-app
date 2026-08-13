# Vilao AI — LLM API Documentation

## API Key

Đặt trong biến môi trường `VILAO_API_KEY` (xem `.env.example`). **Không commit key vào repo** — mọi key phát hiện trong git history phải được rotate ngay trên console.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/chat/completions` | Chat completions (OpenAI-compatible) |
| POST | `/v1/responses` | Responses API (OpenAI-compatible) |
| POST | `/v1/messages` | Messages API |
| POST | `/v1/embeddings` | Embeddings generation |
| GET | `/v1/models` | List available models |

**Base URL:** `https://api.vilao.ai/v1`

---

## Models

### GPT Series (OpenAI-compatible)

| Model | Description |
|-------|-------------|
| `openai/gpt-4o` | GPT-4o model |
| `openai/gpt-4o-mini` | GPT-4o Mini model |
| `openai/gpt-4.5-turbo` | GPT-4.5 Turbo model |
| `openai/gpt-4.1-mini-2025-05-14` | GPT-4.1 Mini (dated) |
| `openai/gpt-4.1-mini` | GPT-4.1 Mini |

### o Series (OpenAI-compatible)

| Model | Description |
|-------|-------------|
| `openai/o4-mini` | o4 Mini model |

### Claude Series (Vilao ccf provider)

| Model | Description |
|-------|-------------|
| `ccf/claude-haiku-4-5-20251001` | Claude Haiku 4.5 |
| `ccf/claude-opus-4-8` | Claude Opus 4.8 |
| `ccf/claude-opus-5` | Claude Opus 5 |
| `ccf/claude-sonnet-5` | Claude Sonnet 5 |
| `openai/claude-5-haiku` | Claude 5 Haiku (OpenAI-compatible) |

### GX Series (Vilao custom)

| Model | Description |
|-------|-------------|
| `gx/gpt-5.4` | GX GPT-5.4 model |
| `gx/m2.7b-instruct` | GX M2.7B Instruct model |
| `gx/m2.2b-instruct` | GX M2.2B Instruct model |

---

## Examples

### cURL — Chat Completions

```bash
curl https://api.vilao.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gx/gpt-5.4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### cURL — Responses API

```bash
curl https://api.vilao.ai/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gx/gpt-5.4",
    "input": "Hello!"
  }'
```

### Python — Chat Completions (openai SDK)

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.vilao.ai/v1"
)

response = client.chat.completions.create(
    model="gx/gpt-5.4",  # Hoặc "openai/gpt-4o", "openai/gpt-4o-mini", v.v.
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Python — Chat Completions (streaming)

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.vilao.ai/v1"
)

stream = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### Python — Responses API

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.vilao.ai/v1"
)

response = client.responses.create(
    model="gx/gpt-5.4",
    input="Hello!"
)
print(response.output_text)
```

### Python — Embeddings

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.vilao.ai/v1"
)

response = client.embeddings.create(
    model="openai/gpt-4o-mini",
    input="The quick brown fox jumps over the lazy dog"
)
print(response.data[0].embedding)
```

### TypeScript — Chat Completions

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.VILAO_API_KEY,
  baseURL: 'https://api.vilao.ai/v1'
});

const response = await client.chat.completions.create({
  model: 'gx/gpt-5.4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

---

## Usage Notes

- **API Key Format:** Sử dụng format `pat-xxx...` từ Vilao console
- **Model Selection:** Chọn model phù hợp với use case (GX series tiết kiệm cost hơn)
- **Streaming:** Hỗ trợ streaming cho chat completions
- **OpenAI SDK:** Tương thích hoàn toàn với OpenAI SDK, chỉ cần đổi base URL
