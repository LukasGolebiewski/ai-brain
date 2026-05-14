import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

import {
  zapiszProjekt,
  pobierzProjekty,
  zapiszDokument,
  szukajPodobnych,
} from './src/supabase.js';
import { przetworzPDF, przetworzTekst } from './src/embeddings.js';
import { pobierzStrone } from './src/scraper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- Middleware ---

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer: pliki PDF do folderu /uploads
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Dozwolone tylko pliki PDF'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// --- Endpointy ---

// GET /api/projekty — lista projektów
app.get('/api/projekty', async (_req, res, next) => {
  try {
    const projekty = await pobierzProjekty();
    res.json(projekty);
  } catch (err) {
    next(err);
  }
});

// POST /api/projekty — nowy projekt
app.post('/api/projekty', async (req, res, next) => {
  try {
    const { nazwa, kontekst } = req.body;

    if (!nazwa?.trim()) {
      return res.status(400).json({ error: 'Pole "nazwa" jest wymagane' });
    }

    const projekt = await zapiszProjekt(nazwa.trim(), kontekst?.trim() ?? '');
    res.status(201).json(projekt);
  } catch (err) {
    next(err);
  }
});

// POST /api/dokumenty/wgraj — wgrywanie i przetwarzanie PDF
app.post('/api/dokumenty/wgraj', upload.single('plik'), async (req, res, next) => {
  const sciezka = req.file?.path;

  try {
    const { projektId } = req.body;

    if (!projektId) {
      return res.status(400).json({ error: 'Pole "projektId" jest wymagane' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Brak pliku PDF' });
    }

    const dokument = await zapiszDokument(projektId, req.file.originalname);
    const wynik = await przetworzPDF(sciezka, dokument.id, projektId);

    res.status(201).json({
      dokumentId: dokument.id,
      nazwa: req.file.originalname,
      fragmenty: wynik.chunks,
    });
  } catch (err) {
    next(err);
  } finally {
    // Usuń tymczasowy plik niezależnie od wyniku
    if (sciezka) fs.unlink(sciezka, () => {});
  }
});

// POST /api/dokumenty/url — wgrywanie strony WWW jako źródła wiedzy
app.post('/api/dokumenty/url', async (req, res, next) => {
  try {
    const { url, projektId } = req.body;

    if (!url?.trim()) {
      return res.status(400).json({ error: 'Pole "url" jest wymagane' });
    }
    if (!projektId) {
      return res.status(400).json({ error: 'Pole "projektId" jest wymagane' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return res.status(400).json({ error: 'Nieprawidłowy adres URL' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Dozwolone tylko adresy http:// i https://' });
    }

    const { tekst, tytul } = await pobierzStrone(url.trim());
    const dokument = await zapiszDokument(projektId, tytul || url.trim());
    const wynik = await przetworzTekst(tekst, dokument.id, projektId);

    res.status(201).json({
      dokumentId: dokument.id,
      nazwa: tytul,
      fragmenty: wynik.chunks,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat — pytanie do Claude z kontekstem RAG
app.post('/api/chat', async (req, res, next) => {
  try {
    const { pytanie, projektId } = req.body;

    if (!pytanie?.trim()) {
      return res.status(400).json({ error: 'Pole "pytanie" jest wymagane' });
    }
    if (!projektId) {
      return res.status(400).json({ error: 'Pole "projektId" jest wymagane' });
    }

    // 1. Przetłumacz pytanie na angielski dla lepszego dopasowania do anglojęzycznych PDF-ów
    const tlumaczenie = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: 'You are a translator. Translate the user\'s question to English. Reply with ONLY the translated question, nothing else.',
      messages: [{ role: 'user', content: pytanie.trim() }],
    });
    const pytanieEN = tlumaczenie.content[0].text.trim();
    console.log(`[chat] tłumaczenie: "${pytanie.trim()}" → "${pytanieEN}"`);

    // 2. Stwórz embedding z angielskiego pytania i znajdź podobne fragmenty
    const { stworzEmbedding } = await import('./src/embeddings.js');
    const embeddingPytania = await stworzEmbedding(pytanieEN);
    const fragmenty = await szukajPodobnych(embeddingPytania, projektId, 5);

    if (fragmenty.length === 0) {
      return res.json({
        odpowiedz: 'Nie znalazłem żadnych pasujących informacji w bazie wiedzy dla tego projektu.',
        zrodla: [],
      });
    }

    // 2. Zbuduj kontekst z fragmentów
    const kontekstFragmentow = fragmenty
      .map((f, i) => `[Źródło ${i + 1}] ${f.tresc}`)
      .join('\n\n');

    // 3. Wyślij do Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `Jesteś asystentem odpowiadającym na pytania na podstawie dostarczonej bazy wiedzy.
Odpowiadaj wyłącznie na podstawie poniższych fragmentów. Jeśli odpowiedź nie wynika z fragmentów, powiedz o tym wprost.
Odpowiadaj po polsku, zwięźle i konkretnie.`,
      messages: [
        {
          role: 'user',
          content: `Fragmenty z bazy wiedzy:\n\n${kontekstFragmentow}\n\n---\nPytanie: ${pytanie}`,
        },
      ],
    });

    const odpowiedz = message.content[0].text;

    res.json({
      odpowiedz,
      zrodla: fragmenty.map((f, i) => ({
        numer: i + 1,
        tresc: f.tresc,
        podobienstwo: Math.round(f.podobienstwo * 100) / 100,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// --- Obsługa błędów ---

// Błędy multera (zbyt duży plik, zły format)
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('PDF')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Ogólny handler błędów
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Błąd serwera', szczegoly: err.message });
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});
