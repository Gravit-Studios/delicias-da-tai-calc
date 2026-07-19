// Edge Function: ações administrativas sobre usuários (listar, suspender,
// reativar, excluir) e exclusão da própria conta (LGPD — direito ao
// esquecimento). A chave de service role NUNCA é exposta ao navegador:
// ela só existe nesta função, rodando no servidor da Supabase.
//
// Ações:
//   - list          (admin)  → lista usuários + papel
//   - approve       (admin)  → libera o acesso de uma conta pendente de aprovação
//   - suspend       (admin)  → bane um usuário (não pode banir a si mesmo)
//   - reactivate    (admin)  → remove o banimento
//   - delete        (admin)  → exclui um usuário (não pode excluir a si mesmo)
//   - self-delete   (usuário autenticado) → exclui a própria conta
//
// O primeiro super admin é promovido manualmente via SQL
// (`update profiles set role = 'admin' where id = '...'`) depois de criar a
// conta pelo cadastro normal do site — não existe endpoint de bootstrap aqui
// de propósito, para não deixar uma porta de promoção de admin exposta em
// produção.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }
  const action = String(payload.action || '');

  // ---- todas as ações exigem um usuário autenticado ----
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Não autenticado.' }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) return json({ error: 'Sessão inválida.' }, 401);
  const caller = userData.user;

  // ---- self-delete: qualquer usuário autenticado pode excluir a própria conta ----
  if (action === 'self-delete') {
    const { error } = await admin.auth.admin.deleteUser(caller.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  // ---- demais ações exigem papel admin ----
  const { data: profile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single();
  if (profileError || profile?.role !== 'admin') {
    return json({ error: 'Acesso restrito a administradores.' }, 403);
  }

  if (action === 'list') {
    const { data: authUsers, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listError) return json({ error: listError.message }, 500);

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, full_name, company_name, cnpj, role, approval_status, plan, plan_renews_at');
    if (profilesError) return json({ error: profilesError.message }, 500);
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const users = authUsers.users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: profileById.get(u.id)?.full_name ?? null,
      companyName: profileById.get(u.id)?.company_name ?? null,
      cnpj: profileById.get(u.id)?.cnpj ?? null,
      role: profileById.get(u.id)?.role ?? 'user',
      approvalStatus: profileById.get(u.id)?.approval_status ?? 'approved',
      plan: profileById.get(u.id)?.plan ?? 'gratuito',
      planRenewsAt: profileById.get(u.id)?.plan_renews_at ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      bannedUntil: u.banned_until ?? null,
    }));
    return json({ users });
  }

  const targetUserId = String(payload.userId || '');
  if (!targetUserId) return json({ error: 'userId é obrigatório.' }, 400);
  if (targetUserId === caller.id) {
    return json({ error: 'Você não pode executar esta ação na própria conta.' }, 400);
  }

  if (action === 'approve') {
    const { error } = await admin
      .from('profiles')
      .update({ approval_status: 'approved' })
      .eq('id', targetUserId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === 'suspend') {
    const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === 'reactivate') {
    const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === 'delete') {
    const { error } = await admin.auth.admin.deleteUser(targetUserId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: `Ação desconhecida: ${action}` }, 400);
});
