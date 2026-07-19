// Camada única de limites/recursos por plano (ver
// Doce_Preco_Resumo_Reestruturacao_Planos.pdf) — o resto do app não deve
// decidir nada com base no nome do plano (`if (plan === 'controle')`), e sim
// perguntar pra cá. A migração das telas é gradual: por enquanto só
// receitas/ingredientes usam limitFor()/canUse() de verdade (ver main.js);
// os demais limites e features já estão descritos aqui pra documentar o
// modelo alvo, mas ainda não são aplicados em lugar nenhum.
export const PLAN_LIMITS = {
  gratuito: { recipes: 20, ingredients: 50, clients: 1, suppliers: 1, categories: 5, photos: 10 },
  controle: { recipes: Infinity, ingredients: Infinity, clients: Infinity, suppliers: Infinity, categories: Infinity, photos: Infinity },
  vitrine: { recipes: Infinity, ingredients: Infinity, clients: Infinity, suppliers: Infinity, categories: Infinity, photos: Infinity },
};

// Recursos que dependem só de ligado/desligado, não de contagem. Ainda não
// usado pelo resto do app (relatórios/PDF/histórico não existem hoje) — fica
// aqui pronto pra quando essas telas forem migradas.
export const PLAN_FEATURES = {
  gratuito: ['ingredients', 'recipes', 'pricing', 'tech_sheet', 'dashboard_basic', 'auto_backup'],
  controle: [
    'ingredients', 'recipes', 'pricing', 'tech_sheet', 'dashboard_basic', 'auto_backup',
    'reports', 'pdf_export', 'price_history', 'dashboard_full', 'stats', 'suppliers', 'clients', 'company',
  ],
  vitrine: [
    'ingredients', 'recipes', 'pricing', 'tech_sheet', 'dashboard_basic', 'auto_backup',
    'reports', 'pdf_export', 'price_history', 'dashboard_full', 'stats', 'suppliers', 'clients', 'company',
    'storefront', 'custom_subdomain', 'qr_code', 'custom_theme',
  ],
};

export function limitFor(plan, limitKey) {
  return PLAN_LIMITS[plan]?.[limitKey] ?? 0;
}

export function canUse(plan, limitKey, currentCount) {
  return currentCount < limitFor(plan, limitKey);
}

export function hasFeature(plan, feature) {
  return PLAN_FEATURES[plan]?.includes(feature) ?? false;
}
