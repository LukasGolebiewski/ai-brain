import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const USUN_SELEKTORY = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
  '.nav', '.navbar', '.navigation', '.menu', '.sidebar', '.side-bar',
  '.header', '.footer', '.advertisement', '.ads', '.ad', '.cookie',
  '.popup', '.modal', '.newsletter', '.subscribe', '.social',
  '#nav', '#navbar', '#header', '#footer', '#sidebar', '#menu', '#ads',
  '[class*="cookie"]', '[class*="banner"]', '[class*="popup"]',
  '[class*="advert"]', '[class*="promo"]', '[class*="related"]',
  '[id*="cookie"]', '[id*="banner"]', '[id*="popup"]',
];

const TRESC_SELEKTORY = [
  'article',
  '[role="main"]',
  'main',
  '.post-content', '.entry-content', '.article-content', '.article-body',
  '.content-body', '.page-content', '.post-body', '.story-body',
  '#content', '#main-content', '#article-body',
  '.content', '#main',
];

// Ścieżki których nie traktujemy jako artykuły
const SKIP_REGEX = /\/(tag|category|kategoria|autor|author|search|szukaj|page|strona|feed)\/?(\?|$)|[?&]page=|\.(jpg|jpeg|png|gif|pdf|zip|mp4|mp3|webp)$/i;

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AI-Brain-Bot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pl,en;q=0.9',
    },
    timeout: 15000,
    redirect: 'follow',
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new Error(`Nieobsługiwany typ zawartości: ${contentType}`);
  }

  return res.text();
}

function ekstrahujTresc($, url) {
  USUN_SELEKTORY.forEach(sel => $(sel).remove());

  let kontener = null;
  for (const sel of TRESC_SELEKTORY) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) {
      kontener = el;
      break;
    }
  }
  if (!kontener) kontener = $('body');

  const tytul = $('title').first().text().trim() ||
                $('h1').first().text().trim() ||
                new URL(url).hostname;

  const tekst = kontener.text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();

  return { tekst, tytul };
}

function wykryjListe($, baseUrl) {
  const base = new URL(baseUrl);
  const linki = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    const tekst = $(el).text().trim();

    // Pomijaj linki z krótkim tekstem — to nawigacja, nie tytuły artykułów
    if (!href || tekst.length < 12) return;

    let absolutny;
    try {
      absolutny = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    const parsed = new URL(absolutny);

    if (parsed.hostname !== base.hostname) return;
    if (SKIP_REGEX.test(absolutny)) return;
    if (absolutny === baseUrl || absolutny === baseUrl + '/') return;
    // Musi mieć ścieżkę dłuższą niż '/'
    if (parsed.pathname.length <= 1) return;

    linki.add(absolutny);
  });

  // Heurystyka: lista artykułów → dużo linków z opisowym tekstem, mało treści właściwej
  const linkiArtykuly = linki.size;
  const dlugoscTekstu = $('body').text().replace(/\s+/g, ' ').trim().length;
  const stosunekTekstDoLinkow = dlugoscTekstu / Math.max(1, linkiArtykuly);

  // < 200 znaków tekstu na link oznacza stronę-listę
  const jestLista = linkiArtykuly >= 5 && stosunekTekstDoLinkow < 200;

  return { jestLista, linki: [...linki].slice(0, 10) };
}

// Pobiera i analizuje stronę — zwraca tekst + metadane wykrytego typu
export async function pobierzStrone(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const { jestLista, linki } = wykryjListe($, url);
  const { tekst, tytul } = ekstrahujTresc($, url);

  if (!jestLista && tekst.length < 100) {
    throw new Error('Strona jest pusta lub wymaga JavaScript. Spróbuj bezpośredniego linku do artykułu.');
  }

  return { tekst, tytul, url, jestLista, linki };
}

// Pobiera pojedynczy artykuł — używane przy przetwarzaniu listy
export async function pobierzArtykul(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);
  const { tekst, tytul } = ekstrahujTresc($, url);
  return { tekst, tytul, url };
}
