import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Selektory elementów do usunięcia przed ekstrakcją treści
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

// Selektory głównej treści (sprawdzane po kolei, bierzemy pierwszy trafiony)
const TRESC_SELEKTORY = [
  'article',
  '[role="main"]',
  'main',
  '.post-content', '.entry-content', '.article-content', '.article-body',
  '.content-body', '.page-content', '.post-body', '.story-body',
  '#content', '#main-content', '#article-body',
  '.content', '#main',
];

export async function pobierzStrone(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AI-Brain-Bot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pl,en;q=0.9',
    },
    timeout: 15000,
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new Error(`Nieobsługiwany typ zawartości: ${contentType}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Usuń niechciane elementy
  USUN_SELEKTORY.forEach(sel => $(sel).remove());

  // Znajdź główny kontener treści
  let kontener = null;
  for (const sel of TRESC_SELEKTORY) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) {
      kontener = el;
      break;
    }
  }

  // Fallback: cały body
  if (!kontener) kontener = $('body');

  const tytul = $('title').first().text().trim() ||
                $('h1').first().text().trim() ||
                new URL(url).hostname;

  const surowy = kontener.text();

  const tekst = surowy
    .replace(/[ \t]+/g, ' ')         // wiele spacji → jedna
    .replace(/\n{3,}/g, '\n\n')      // >2 puste linie → 2
    .replace(/^\s+|\s+$/gm, '')      // trim każdej linii
    .trim();

  if (tekst.length < 100) {
    throw new Error('Strona jest pusta lub zawiera tylko JavaScript. Spróbuj innego URL.');
  }

  return { tekst, tytul, url };
}
