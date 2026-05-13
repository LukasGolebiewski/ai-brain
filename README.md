# AI Brain — Baza Wiedzy RAG

System RAG (Retrieval-Augmented Generation) pozwalający zadawać pytania do własnych dokumentów PDF. Odpowiedzi generuje Claude AI na podstawie fragmentów z bazy wiedzy.

## Jak to działa

```
PDF → chunki tekstu → embeddingi OpenAI → Supabase pgvector
pytanie → embedding → wyszukanie podobnych fragmentów → Claude → odpowiedź
```

## Wymagania

- Node.js 18+
- Konto [Supabase](https://supabase.com) z włączonym pgvector
- Klucz API [Anthropic](https://console.anthropic.com)
- Klucz API [OpenAI](https://platform.openai.com)

## Instalacja lokalna

1. Sklonuj repo i zainstaluj zależności:
   ```bash
   git clone <url-repo>
   cd ai-brain
   npm install
   ```

2. Skopiuj `.env.example` i uzupełnij klucze:
   ```bash
   cp .env.example .env
   ```

3. W Supabase SQL Editor wykonaj migrację z pliku `supabase_schema.sql`

4. Uruchom serwer:
   ```bash
   npm start
   # → http://localhost:3000
   ```

## Zmienne środowiskowe

| Zmienna | Opis |
|---------|------|
| `ANTHROPIC_API_KEY` | Klucz Claude API (claude.ai/settings) |
| `SUPABASE_URL` | URL projektu Supabase |
| `SUPABASE_KEY` | Klucz anon/public Supabase |
| `OPENAI_API_KEY` | Klucz OpenAI (embeddingi) |
| `PORT` | Port serwera (domyślnie 3000) |

## Endpointy API

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| `GET` | `/api/projekty` | Lista projektów |
| `POST` | `/api/projekty` | Nowy projekt `{ nazwa, kontekst }` |
| `POST` | `/api/dokumenty/wgraj` | Wgranie PDF `multipart/form-data`: `plik`, `projektId` |
| `POST` | `/api/chat` | Pytanie RAG `{ pytanie, projektId }` |

## Wdrożenie na Render

1. Wgraj kod na GitHub
2. W [Render](https://render.com) utwórz **New Web Service** z repozytorium
3. Render wykryje `render.yaml` automatycznie
4. W zakładce **Environment** dodaj wartości zmiennych środowiskowych

## Struktura projektu

```
ai-brain/
├── server.js          # Serwer Express + endpointy
├── src/
│   ├── supabase.js    # Klient Supabase i funkcje DB
│   └── embeddings.js  # Embeddingi OpenAI + przetwarzanie PDF
├── public/
│   └── index.html     # Interfejs webowy
├── projekty/          # Konteksty projektów
├── render.yaml        # Konfiguracja Render
└── package.json
```
