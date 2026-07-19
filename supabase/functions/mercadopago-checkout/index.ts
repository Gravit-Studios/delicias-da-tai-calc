// Edge Function: cria uma assinatura (preapproval) no Mercado Pago pros
// planos pagos (Controle, Vitrine) e devolve o init_point (URL do checkout)
// pro client redirecionar o navegador. O plano Gratuito nunca passa por
// aqui — não exige pagamento (ver planLimits.js/planStatus).
//
// Dois modos:
//   - signup   (público)      → cria a conta no Supabase (mesmo signUp() do
//                                cadastro normal, com captcha) e represa o
//                                acesso em payment_status = 'pending' até o
//                                webhook confirmar (ver mercadopago-webhook).
//                                Usado quando alguém escolhe Controle/Vitrine
//                                direto na landing page, sem conta ainda.
//   - upgrade  (autenticado)  → cria uma assinatura nova pra uma conta que já
//                                existe (Gratuito→Controle, Controle→Vitrine
//                                etc.), sem bloquear o acesso atual enquanto
//                                o pagamento não confirma — pending_plan/
//                                pending_billing_cycle guardam o que vai
//                                valer quando confirmar.
//
// O ID do plano no Mercado Pago (preapproval_plan_id) vem de secrets no
// formato MERCADOPAGO_PLAN_<PLANO>_<CICLO>, ex.: MERCADOPAGO_PLAN_CONTROLE_MENSAL.
// Preencha essas secrets no painel do Supabase (Project Settings → Edge
// Functions → Secrets) assim que os planos existirem no Mercado Pago.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

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

function planIdFor(plan: string, cycle: string): string | null {
  return Deno.env.get(`MERCADOPAGO_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}`) ?? null;
}

async function createPreapproval(options: {
  planId: string;
  payerEmail: string;
  externalReference: string;
  backUrl: string;
}) {
  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      preapproval_plan_id: options.planId,
      reason: 'Assinatura Doce Preço',
      external_reference: options.externalReference,
      payer_email: options.payerEmail,
      back_url: options.backUrl,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || 'Falha ao criar assinatura no Mercado Pago.');
  }
  return data as { id: string; init_point: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const mode = String(payload.mode || '');
  const plan = String(payload.plan || '');
  const billingCycle = String(payload.billingCycle || '');
  if (!['controle', 'vitrine'].includes(plan)) {
    return json({ error: 'Plano inválido.' }, 400);
  }
  if (!['mensal', 'anual'].includes(billingCycle)) {
    return json({ error: 'Ciclo de cobrança inválido.' }, 400);
  }
  const siteUrl = String(payload.siteUrl || '').replace(/\/+$/, '');
  if (!siteUrl) return json({ error: 'siteUrl é obrigatório.' }, 400);
  const backUrl = `${siteUrl}/#/assinatura/retorno`;

  const planId = planIdFor(plan, billingCycle);
  if (!planId) {
    return json({ error: `Plano do Mercado Pago ainda não configurado para ${plan}/${billingCycle}.` }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (mode === 'signup') {
    const email = String(payload.email || '');
    const password = String(payload.password || '');
    const fullName = String(payload.fullName || '');
    const companyName = String(payload.companyName || '');
    const captchaToken = String(payload.captchaToken || '');
    if (!email || !password) return json({ error: 'E-mail e senha são obrigatórios.' }, 400);

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signUpData, error: signUpError } = await anon.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, company_name: companyName }, captchaToken },
    });
    if (signUpError) return json({ error: signUpError.message }, 400);
    const userId = signUpData.user?.id;
    if (!userId) return json({ error: 'Não foi possível criar a conta.' }, 500);

    // Represa o acesso (ver payment_status em planStatus, main.js) até o
    // webhook confirmar o pagamento — sem isso a conta ganharia acesso ao
    // plano Gratuito mesmo escolhendo um plano pago.
    const { error: updateError } = await admin
      .from('profiles')
      .update({ payment_status: 'pending', pending_plan: plan, pending_billing_cycle: billingCycle })
      .eq('id', userId);
    if (updateError) return json({ error: updateError.message }, 500);

    try {
      const subscription = await createPreapproval({
        planId,
        payerEmail: email,
        externalReference: userId,
        backUrl,
      });
      await admin.from('profiles').update({ mercadopago_preapproval_id: subscription.id }).eq('id', userId);
      return json({ initPoint: subscription.init_point });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  if (mode === 'upgrade') {
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
    if (!caller.email) return json({ error: 'Conta sem e-mail associado.' }, 400);

    // Não mexe em payment_status aqui de propósito: quem já tem uma conta
    // ativa continua com acesso ao plano atual enquanto a nova assinatura não
    // confirma — só pending_plan/pending_billing_cycle guardam o que aplicar
    // quando o webhook autorizar (ver mercadopago-webhook).
    const { error: updateError } = await admin
      .from('profiles')
      .update({ pending_plan: plan, pending_billing_cycle: billingCycle })
      .eq('id', caller.id);
    if (updateError) return json({ error: updateError.message }, 500);

    try {
      const subscription = await createPreapproval({
        planId,
        payerEmail: caller.email,
        externalReference: caller.id,
        backUrl,
      });
      return json({ initPoint: subscription.init_point });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  return json({ error: `Modo desconhecido: ${mode}` }, 400);
});
