import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// A chave "publishable/anon" é feita para ficar no front-end.
// A segurança dos dados é garantida pelas políticas de RLS no banco (ver supabase/schema.sql).
const SUPABASE_URL = 'https://cjlggkxpmuxnxipxdcuj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_e_AgrQgDaza_EZ46TREWYA_p5iDYXql';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
