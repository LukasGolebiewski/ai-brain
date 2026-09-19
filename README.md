# AI Brain — baza wiedzy RAG

System RAG (Retrieval-Augmented Generation) pozwalający zadawać pytania do własnych dokumentów — PDF-ów i stron WWW. Odpowiedzi generuje Claude na podstawie fragmentów odnalezionych w bazie wiedzy, z podaniem źródeł i procentu dopasowania.

**Problem:** wiedza rozjeżdża się po dziesiątkach PDF-ów i artykułów, a wyszukiwanie po słowach kluczowych nie działa, gdy nie pamiętasz dokładnego sformułowania. Ten projekt zamienia zbiór dokumentów w asystenta, któremu zadajesz pytanie po polsku i dostajesz odpowiedź z odnośnikiem do konkretnego fragmentu.

> **Status:** projekt demonstracyjny. Instancja Supabase jest obecnie wyłączona (limit darmowego planu — 2 aktywne projekty), kod i dokumentacja pozostają dostępne.

---

## Zrzuty ekranu

<!-- TODO: wstaw 2–3 zrzuty:
     1. Interfejs z listą projektów i czatem
     2. Odpowiedź z rozwiniętymi źródłami i % dopasowania
     3. Wgrywanie PDF-a z paskiem postępu
     Wrzuć pliki do /docs i podlinkuj: ![Interfejs](docs/interfejs.png) -->

---

## Jak to działa

```
PDF / URL → chunki tekstu → embeddingi OpenAI → Supabase pgvector

pytanie (PL) → tłumaczenie na EN (Claude Haiku) → embedding
            → wyszukanie podobnych fragmentów → Claude Sonnet → odpowiedź + źródła
```

Baza zawiera obecnie ponad 4 600 zaindeksowanych fragmentów.

---

## Decyzje projektowe

**Dwa modele zamiast jednego.** Pytania zadaję po polsku, ale większość dokumentów jest po angielsku — a embedding polskiego zdania słabo dopasowuje się do angielskiego tekstu. Dlatego pytanie najpierw przechodzi przez Claude Haiku, który tłumaczy je na angielski, a dopiero przetłumaczona wersja trafia do wyszukiwania wektorowego. Odpowiedź generuje Claude Sonnet. Haiku jest tu wielokrotnie tańszy i szybszy, a do tłumaczenia jednego zdania w zupełności wystarcza — jakość płacę tylko tam, gdzie jest potrzebna.

**pgvector zamiast osobnej bazy wektorowej.** Supabase daje PostgreSQL z pgvector w jednym miejscu, więc metadane projektów i dokumentów leżą obok wektorów. Przy tej skali dedykowana baza wektorowa byłaby dodatkową zależnością bez realnego zysku.

**Kontekst per projekt.** Każdy projekt ma własny opis roli asystenta, doklejany do promptu. Ten sam silnik obsługuje więc bazę o marketingu i bazę o prawie podatkowym, odpowiadając w innym tonie i z innym nastawieniem.

**Wykrywanie stron-list przy imporcie z URL.** Scraper rozpoznaje, czy podany adres to pojedynczy artykuł, czy strona z listą odnośników. W drugim przypadku pobiera każdy artykuł osobno, zamiast indeksować bezużyteczną stronę z samymi tytułami.

**Cytowanie źródeł.** Każda odpowiedź pokazuje fragmenty, na których została oparta, wraz z procentem podobieństwa. Bez tego nie da się odróżnić odpowiedzi z bazy od halucynacji.

---

## Stack

| Warstwa | Technologia |
|---|---|
| Backend | Node.js 18+, Express |
| Baza wektorowa | Supabase (PostgreSQL + pgvector) |
| Embeddingi | OpenAI |
| Generowanie | Claude Haiku (tłumaczenie) + Claude Sonnet (odpowiedzi) |
| Przetwarzanie | pdf-parse, cheerio |
| Frontend | Vanilla JS (bez frameworka) |
| Hosting | Render |

---

## Znane ograniczenia

Projekt powstał jako narzędzie do użytku własnego i nie jest przygotowany na wdrożenie produkcyjne. Świadomie pominięte:

- **Brak uwierzytelniania** — każdy, kto zna adres instancji, może tworzyć projekty i zadawać pytania. Przed udostępnieniem publicznym konieczna byłaby autoryzacja i RLS po stronie Supabase.
- **Otwarty CORS** — do zawężenia przy wdrożeniu.
- **Pliki wgrywane na dysk lokalny** — na Renderze system plików jest ulotny, więc uploady nie przetrwają restartu (fragmenty w bazie oczywiście tak).
- **Import z URL nie blokuje adresów prywatnych** — walidowany jest tylko protokół. Produkcyjnie wymagałoby to ochrony przed SSRF.
- **Brak limitów zapytań** — koszty API nie są niczym ograniczone.

---

## Endpointy API

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| `GET` | `/api/projekty` | Lista projektów |
| `POST` | `/api/projekty` | Nowy projekt `{ nazwa, kontekst }` |
| `POST` | `/api/dokumenty/wgraj` | Wgranie PDF `multipart/form-data`: `plik`, `projektId` |
| `POST` | `/api/dokumenty/url` | Import strony WWW `{ url, projektId }` |
| `POST` | `/api/chat` | Pytanie RAG `{ pytanie, projektId }` |

---

## Struktura projektu

```
ai-brain/
├── server.js          # Serwer Express + endpointy
├── src/
│   ├── supabase.js    # Klient Supabase i funkcje DB
│   ├── embeddings.js  # Embeddingi OpenAI + przetwarzanie PDF
│   └── scraper.js     # Pobieranie stron WWW i artykułów
├── public/
│   └── index.html     # Interfejs webowy
├── projekty/          # Konteksty projektów
├── render.yaml        # Konfiguracja Render
└── package.json
```

---

## Uruchomienie lokalne

**Wymagania:** Node.js 18+, konto Supabase z włączonym pgvector, klucz API Anthropic, klucz API OpenAI.

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

### Zmienne środowiskowe

| Zmienna | Opis |
|---------|------|
| `ANTHROPIC_API_KEY` | Klucz Claude API |
| `SUPABASE_URL` | URL projektu Supabase |
| `SUPABASE_KEY` | Klucz anon/public Supabase |
| `OPENAI_API_KEY` | Klucz OpenAI (embeddingi) |
| `PORT` | Port serwera (domyślnie 3000) |

### Wdrożenie na Render

1. Wgraj kod na GitHub
2. W Render utwórz **New Web Service** z repozytorium
3. Render wykryje `render.yaml` automatycznie
4. W zakładce **Environment** uzupełnij wartości zmiennych
