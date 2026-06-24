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
