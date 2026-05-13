import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function zapiszProjekt(nazwa, kontekst) {
  const { data, error } = await supabase
    .from('projekty')
    .insert({ nazwa, kontekst })
    .select()
    .single();

  if (error) throw new Error(`zapiszProjekt: ${error.message}`);
  return data;
}

export async function pobierzProjekty() {
  const { data, error } = await supabase
    .from('projekty')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`pobierzProjekty: ${error.message}`);
  return data;
}

export async function zapiszDokument(projektId, nazwapliku) {
  const { data, error } = await supabase
    .from('dokumenty')
    .insert({ projekt_id: projektId, nazwa_pliku: nazwapliku })
    .select()
    .single();

  if (error) throw new Error(`zapiszDokument: ${error.message}`);
  return data;
}

export async function zapiszFragment(dokumentId, projektId, tresc, embedding) {
  const { data, error } = await supabase
    .from('fragmenty')
    .insert({
      dokument_id: dokumentId,
      projekt_id: projektId,
      tresc,
      embedding,
    })
    .select()
    .single();

  if (error) throw new Error(`zapiszFragment: ${error.message}`);
  return data;
}

export async function szukajPodobnych(embedding, projektId, limit = 5) {
  const { data, error } = await supabase.rpc('szukaj_podobne', {
    query_embedding: embedding,
    filter_projekt_id: projektId,
    match_count: limit,
  });

  if (error) throw new Error(`szukajPodobnych: ${error.message}`);
  return data;
}

export default supabase;
