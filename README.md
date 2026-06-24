# Lapa OS

Personal Brain as a Service via WhatsApp, com Express, BullMQ, Redis, Groq, Gemini, TickTick e Google Sheets.

## Rodar localmente

```bash
npm install
cp .env.example .env
npm start
```

O servico sobe em `PORT` e expõe:

- `GET /health`
- `POST /webhook/whatsapp`

O webhook aceita texto, imagem e audio. Audio e transcrito via Groq antes de entrar no cerebro.

## LLMs

- Groq: mensagens curtas e transcricao de audio.
- Gemini: imagem/foto.
- OpenRouter: opcional para mensagens complexas e fallback quando Groq falhar.

Por padrao o OpenRouter roda em modo gratuito apenas. Use `openrouter/free` ou modelos que terminem com `:free`; se alguem configurar um modelo pago por engano, o app bloqueia e tenta os fallbacks gratuitos.

Para habilitar OpenRouter:

```env
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sua-openrouter-key
OPENROUTER_FREE_ONLY=true
OPENROUTER_MODEL=openrouter/free
OPENROUTER_FREE_FALLBACK_MODEL=openrouter/free
OPENROUTER_FREE_FALLBACK_MODELS=openrouter/free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free,qwen/qwen3-next-80b-a3b-instruct:free,nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-oss-20b:free
OPENROUTER_SITE_URL=https://central-lapaos.oopleb.easypanel.host
OPENROUTER_APP_NAME=Lapa OS
```

Modelos gratuitos do OpenRouter costumam ter limites diarios e podem ficar lentos/indisponiveis em horarios de pico.

## Deploy no EasyPanel

Use um **App Service** apontando para este repositorio GitHub.

Configuracao recomendada:

- Source: GitHub repository
- Build method: Dockerfile
- Dockerfile path: `Dockerfile`
- Proxy port: `3000`
- Environment: cole as variaveis do `.env`

Defina a timezone do app:

```env
TZ=America/Sao_Paulo
APP_TIMEZONE=America/Sao_Paulo
```

O `.env` real nao deve ir para o Git. Ele ja esta ignorado por `.gitignore` e `.dockerignore`.

Se voce usar um Redis criado dentro do EasyPanel, ajuste:

```env
REDIS_URL=redis://default:SENHA@NOME_DO_SERVICO_REDIS:6379
```

Depois de deployar, configure a Evolution API para enviar webhooks para:

```text
https://SEU_DOMINIO/webhook/whatsapp
```

## Variaveis obrigatorias

Veja [.env.example](.env.example).
