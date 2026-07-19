// Edge Function: recebe as notificações do Mercado Pago (webhook) sobre
// assinaturas (preapproval) e libera/atualiza o plano da conta correspondente.
//
// IMPORTANTE: nunca confia no corpo da notificação por si só (qualquer um
// poderia chamar essa URL) — sempre busca o status de verdade direto na API
// do Mercado Pago usando o Access Token, e valida a assinatura (x-signature)
// da notificação com o webhook secret antes de processar.
//
// Configure no painel do Mercado Pago (Suas integrações → Webhooks) a URL
// desta função pro evento "Assinaturas" (subscription_preapproval).
//
// Secrets necessárias (Project Settings → Edge Functions → Secrets):
//   MERCADOPAGO_ACCESS_TOKEN
//   MERCADOPAGO_WEBHOOK_SECRET
//
// ATENÇÃO: a parte de renovação/downgrade agendado (ver handleRenewal) foi
// escrita com base na documentação pública do Mercado Pago, mas não pôde ser
// testada contra uma notificação real de renovação — vale conferir no
// sandbox do Mercado Pago antes de depender disso em produção.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const MP_WEBHOOK_SECRET = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Verificação de assinatura conforme documentada pelo Mercado Pago:
// x-signature: "ts=<timestamp>,v1=<hash>" — hash = HMAC-SHA256("id:<data.id>;request-id:<x-request-id>;ts:<ts>;", secret).
async function verifySignature(xSignature: string | null, xRequestId: string | null, dataId: string): Promise<boolean> {
  if (!xSignature || !dataId) return false;
  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    }),
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;
  const manifest = `id:${dataId};request-id:${xRequestId ?? ''};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return computedHex === hash;
}

async function fetchPreapproval(id: string) {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Falha ao buscar assinatura ${id} no Mercado Pago.`);
  return response.json();
}

async function cancelPreapproval(id: string) {
  try {
    await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  } catch {
    // Best-effort: se falhar, a assinatura antiga fica ativa no Mercado Pago
    // e vai exigir cancelamento manual — não deve travar a liberação do
    // plano novo por causa disso.
  }
}

async function updatePreapprovalPlan(id: string, planId: string) {
  try {
    await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ preapproval_plan_id: planId }),
    });
  } catch {
    // Best-effort (ver comentário no topo do arquivo sobre downgrade agendado).
  }
}

function planIdFor(plan: string, cycle: string): string | null {
  return Deno.env.get(`MERCADOPAGO_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}`) ?? null;
}

// A resposta do GET /preapproval nem sempre traz a próxima data de cobrança
// de forma explícita — quando falta, estima a partir de auto_recurring
// (frequency/frequency_type), contando a partir de agora.
function computeNextPaymentDate(subscription: Record<string, any>): string | null {
  if (subscription.next_payment_date) return subscription.next_payment_date;
  const auto = subscription.auto_recurring;
  if (!auto?.frequency || !auto?.frequency_type) return null;
  const next = new Date();
  if (auto.frequency_type === 'months') next.setMonth(next.getMonth() + Number(auto.frequency));
  else if (auto.frequency_type === 'days') next.setDate(next.getDate() + Number(auto.frequency));
  else return null;
  return next.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    // MP também pode mandar só pelos query params (notificação antiga).
  }
  const url = new URL(req.url);
  const type = String(body.type || url.searchParams.get('type') || '');
  const dataId = String(body.data?.id || url.searchParams.get('data.id') || '');

  if (!dataId || !['subscription_preapproval', 'preapproval'].includes(type)) {
    // Notificação de um tipo que não tratamos (ex.: payment avulso) — só
    // confirma o recebimento pra o Mercado Pago não ficar retentando.
    return json({ ok: true });
  }

  const validSignature = await verifySignature(
    req.headers.get('x-signature'),
    req.headers.get('x-request-id'),
    dataId,
  );
  if (!validSignature) return json({ error: 'Assinatura inválida.' }, 401);

  let subscription: Record<string, any>;
  try {
    subscription = await fetchPreapproval(dataId);
  } catch (error) {
    return json({ error: (error as Error).message }, 502);
  }

  const profileId = String(subscription.external_reference || '');
  if (!profileId) return json({ ok: true });

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('mercadopago_preapproval_id, pending_plan, pending_billing_cycle, scheduled_plan, plan, plan_billing_cycle')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError || !profile) return json({ ok: true });

  if (subscription.status === 'authorized') {
    const isSamePreapprovalAsBefore = profile.mercadopago_preapproval_id === subscription.id;

    if (!isSamePreapprovalAsBefore) {
      // Primeira confirmação de uma assinatura nova (cadastro pago ou
      // upgrade/troca de plano) — libera o plano escolhido e cancela a
      // assinatura anterior, se havia uma, pra não cobrar duas vezes.
      if (profile.mercadopago_preapproval_id) await cancelPreapproval(profile.mercadopago_preapproval_id);
      const nextPaymentDate = computeNextPaymentDate(subscription);
      await admin
        .from('profiles')
        .update({
          plan: profile.pending_plan,
          plan_billing_cycle: profile.pending_billing_cycle,
          plan_renews_at: nextPaymentDate,
          plan_auto_renew: true,
          payment_status: 'paid',
          pending_plan: null,
          pending_billing_cycle: null,
          mercadopago_preapproval_id: subscription.id,
          approval_status: 'approved',
        })
        .eq('id', profileId);
    } else {
      // Renovação de uma assinatura já ativa — só atualiza a data e aplica
      // um downgrade agendado (ver scheduled_plan), se houver.
      if (profile.scheduled_plan === 'gratuito') {
        // Gratuito não tem cobrança — cancela a assinatura no Mercado Pago
        // em vez de trocar de plano pago (não existe
        // MERCADOPAGO_PLAN_GRATUITO_* pra updatePreapprovalPlan usar).
        await cancelPreapproval(subscription.id);
        await admin
          .from('profiles')
          .update({
            plan: 'gratuito',
            scheduled_plan: null,
            plan_billing_cycle: null,
            plan_renews_at: null,
            plan_auto_renew: false,
            payment_status: 'none',
            mercadopago_preapproval_id: null,
          })
          .eq('id', profileId);
      } else {
        const nextPaymentDate = computeNextPaymentDate(subscription);
        const updates: Record<string, unknown> = { plan_renews_at: nextPaymentDate };
        if (profile.scheduled_plan) {
          updates.plan = profile.scheduled_plan;
          updates.scheduled_plan = null;
          const newPlanId = planIdFor(profile.scheduled_plan, profile.plan_billing_cycle || 'mensal');
          if (newPlanId) await updatePreapprovalPlan(subscription.id, newPlanId);
        }
        await admin.from('profiles').update(updates).eq('id', profileId);
      }
    }
  } else if (['cancelled', 'paused'].includes(subscription.status) && profile.mercadopago_preapproval_id === subscription.id) {
    // Cancelamento pelo próprio Mercado Pago (ex.: cliente cancelou direto
    // por lá) — só desliga a renovação automática por enquanto, sem cortar
    // o acesso sozinho (mesma decisão do toggle manual em Configurações).
    await admin.from('profiles').update({ plan_auto_renew: false }).eq('id', profileId);
  }

  return json({ ok: true });
});
