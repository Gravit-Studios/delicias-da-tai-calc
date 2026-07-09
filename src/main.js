import { calculatePricing, formatCurrency } from './pricing.js';
import { signUp, signIn, signOut, getSession, onAuthStateChange } from './auth.js';
import { parseRoute, navigate, onRouteChange } from './router.js';
import { headerArt } from './headerArt.js';
import * as db from './db.js';

// ---------------- Helpers de estado / formatação ----------------

function newIngredient(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    ingredientId: null,
    name: '',
    packagePrice: '',
    packageAmount: '',
    usedAmount: '',
    unit: 'g',
    ...overrides,
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function toNumberSafe(value) {
  const normalized = String(value ?? '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultWizard() {
  return {
    step: 1,
    productName: '',
    yieldAmount: '1',
    ingredients: [newIngredient()],
    packaging: '0',
    extraCosts: '0',
    labor: '0',
    profitMargin: '30',
  };
}

function defaultDetail() {
  return {
    loading: false,
    productId: null,
    productName: '',
    yieldAmount: '',
    packaging: '',
    extraCosts: '',
    labor: '',
    profitMargin: '',
    ingredients: [],
  };
}

const state = {
  session: null,
  authMode: 'signin',
  authError: '',
  authLoading: false,

  route: { path: 'inicio', param: undefined },

  savedIngredients: [],
  savedProducts: [],
  history: [],
  costSettings: null,
  costDraft: { packaging: '0', extraCosts: '0', labor: '0', profitMargin: '30' },
  dataLoading: false,
  statusMessage: '',

  wizard: defaultWizard(),
  detail: defaultDetail(),
};

const app = document.querySelector('#root');

function getEditor(key) {
  return key === 'wizard' ? state.wizard : state.detail;
}

// ---------------- Foco: captura/restauração entre re-renders ----------------

function captureFocus() {
  const el = document.activeElement;
  if (!el || !app.contains(el)) return null;
  let selector = null;
  if (el.dataset.ingredientField) {
    const rowId = el.closest('[data-ingredient]')?.dataset.ingredient;
    selector = `[data-ingredient="${rowId}"][data-ingredient-field="${el.dataset.ingredientField}"]`;
  } else if (el.dataset.field) {
    selector = `[data-editor="${el.dataset.editor}"][data-field="${el.dataset.field}"]`;
  } else if (el.dataset.costField) {
    selector = `[data-cost-field="${el.dataset.costField}"]`;
  } else if (el.name) {
    selector = `[name="${el.name}"]`;
  }
  if (!selector) return null;
  return { selector, selStart: el.selectionStart, selEnd: el.selectionEnd };
}

function restoreFocus(restore) {
  if (!restore) return;
  const el = app.querySelector(restore.selector);
  if (!el) return;
  el.focus();
  if (typeof restore.selStart === 'number' && el.setSelectionRange) {
    try { el.setSelectionRange(restore.selStart, restore.selEnd); } catch { /* ignore */ }
  }
}

// ---------------- Dados do usuário ----------------

async function loadUserData() {
  if (!state.session) return;
  state.dataLoading = true;
  render();
  try {
    const userId = state.session.user.id;
    const [ingredients, products, history, costSettings] = await Promise.all([
      db.listIngredients(userId),
      db.listProducts(userId),
      db.listHistory(userId, 30),
      db.getCostSettings(userId),
    ]);
    state.savedIngredients = ingredients;
    state.savedProducts = products;
    state.history = history;
    state.costSettings = costSettings;
    state.costDraft = costSettings
      ? {
          packaging: String(costSettings.packaging),
          extraCosts: String(costSettings.extra_costs),
          labor: String(costSettings.labor),
          profitMargin: String(costSettings.profit_margin),
        }
      : { packaging: '0', extraCosts: '0', labor: '0', profitMargin: '30' };
  } catch (error) {
    state.statusMessage = `Erro ao carregar dados: ${error.message}`;
  } finally {
    state.dataLoading = false;
    render();
  }
}

async function ensureDetailLoaded(id) {
  state.detail = { ...defaultDetail(), loading: true };
  render();
  try {
    const { product, items } = await db.loadProductWithIngredients(id);
    state.detail = {
      loading: false,
      productId: product.id,
      productName: product.name,
      yieldAmount: String(product.yield_amount),
      packaging: String(product.packaging),
      extraCosts: String(product.extra_costs),
      labor: String(product.labor),
      profitMargin: String(product.profit_margin),
      ingredients: items.length > 0
        ? items.map((item) => newIngredient({
            ingredientId: item.ingredient_id,
            name: item.name,
            packagePrice: String(item.package_price),
            packageAmount: String(item.package_amount),
            usedAmount: String(item.used_amount),
            unit: item.unit,
          }))
        : [newIngredient()],
    };
  } catch (error) {
    state.statusMessage = `Erro ao abrir produto: ${error.message}`;
    state.detail = { ...defaultDetail(), loading: false };
  }
  render();
}

function startWizard() {
  const c = state.costSettings;
  state.wizard = {
    step: 1,
    productName: '',
    yieldAmount: '1',
    ingredients: [newIngredient()],
    packaging: c ? String(c.packaging) : '0',
    extraCosts: c ? String(c.extra_costs) : '0',
    labor: c ? String(c.labor) : '0',
    profitMargin: c ? String(c.profit_margin) : '30',
  };
  state.statusMessage = '';
}

// ---------------- Roteamento ----------------

function handleRouteChange(route) {
  state.route = route;
  if (route.path === 'produto' && route.param && state.detail.productId !== route.param) {
    ensureDetailLoaded(route.param);
    return;
  }
  render();
}

onRouteChange(handleRouteChange);

getSession().then((session) => {
  state.session = session;
  if (session) loadUserData();
  handleRouteChange(parseRoute());
});

onAuthStateChange((session) => {
  const hadSession = Boolean(state.session);
  state.session = session;
  if (session && !hadSession) loadUserData();
  if (!session) {
    state.savedIngredients = [];
    state.savedProducts = [];
    state.history = [];
    state.costSettings = null;
  }
  render();
});

// ---------------- Fragmentos de UI reutilizáveis ----------------

function banner(title, subtitle) {
  return `<div class="banner">${headerArt}<div class="banner-content"><p class="eyebrow">Delícias da Tai</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div></div>`;
}

function statusBox() {
  return state.statusMessage ? `<p class="status-message">${escapeHtml(state.statusMessage)}</p>` : '';
}

function loadingMsg() {
  return '<p class="muted">Carregando...</p>';
}

function emptyState(message, showCta) {
  return `<div class="empty-state"><p>${escapeHtml(message)}</p>${showCta ? '<button type="button" data-action="start-wizard">Criar produto</button>' : ''}</div>`;
}

function fieldFor(editorKey, key, label, value, mode = 'text') {
  return `<label>${label}<input data-editor="${editorKey}" data-field="${key}" inputmode="${mode}" value="${escapeHtml(value)}" /></label>`;
}

function basicFields(editorKey, editor) {
  return `<div class="field-grid">
    ${fieldFor(editorKey, 'productName', 'Nome do produto', editor.productName)}
    ${fieldFor(editorKey, 'yieldAmount', 'Rendimento (un.)', editor.yieldAmount, 'decimal')}
  </div>`;
}

function costFields(editorKey, editor) {
  return `<div class="field-grid">
    ${fieldFor(editorKey, 'packaging', 'Embalagens', editor.packaging, 'decimal')}
    ${fieldFor(editorKey, 'extraCosts', 'Gás, energia e taxas', editor.extraCosts, 'decimal')}
    ${fieldFor(editorKey, 'labor', 'Mão de obra', editor.labor, 'decimal')}
    ${fieldFor(editorKey, 'profitMargin', 'Margem de lucro (%)', editor.profitMargin, 'decimal')}
  </div>`;
}

function ingredientRows(editorKey, ingredients) {
  const picker = state.savedIngredients.length > 0 ? `
    <select data-role="ingredient-picker-${editorKey}">
      <option value="">Usar da base...</option>
      ${state.savedIngredients.map((si) => `<option value="${si.id}">${escapeHtml(si.name)}</option>`).join('')}
    </select>
    <button type="button" class="ghost" data-action="use-ingredient" data-editor="${editorKey}">Adicionar selecionado</button>` : '';

  return `
  <div class="ingredient-grid header-row" aria-hidden="true"><span>Ingrediente</span><span>Preço da compra</span><span>Qtd. comprada</span><span>Qtd. usada</span><span>Un.</span><span></span></div>
  ${ingredients.map((ingredient) => `
    <div class="ingredient-grid" data-ingredient="${ingredient.id}">
      <input aria-label="Ingrediente" data-editor="${editorKey}" data-ingredient-field="name" value="${escapeHtml(ingredient.name)}" />
      <input aria-label="Preço da compra" inputmode="decimal" data-editor="${editorKey}" data-ingredient-field="packagePrice" value="${escapeHtml(ingredient.packagePrice)}" />
      <input aria-label="Quantidade comprada" inputmode="decimal" data-editor="${editorKey}" data-ingredient-field="packageAmount" value="${escapeHtml(ingredient.packageAmount)}" />
      <input aria-label="Quantidade usada" inputmode="decimal" data-editor="${editorKey}" data-ingredient-field="usedAmount" value="${escapeHtml(ingredient.usedAmount)}" />
      <input aria-label="Unidade" data-editor="${editorKey}" data-ingredient-field="unit" value="${escapeHtml(ingredient.unit)}" />
      <button class="ghost" type="button" data-action="remove-ingredient" data-editor="${editorKey}" data-id="${ingredient.id}">Remover</button>
    </div>`).join('')}
  <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
    <button type="button" data-action="add-ingredient" data-editor="${editorKey}">Adicionar ingrediente</button>
    ${picker}
  </div>`;
}

function summaryPanel(editor) {
  const pricing = calculatePricing(editor);
  return `<aside class="panel summary-panel">
    <p class="eyebrow">Resumo</p><h2>Resultado da precificação</h2>
    <dl>
      <div><dt>Ingredientes</dt><dd>${formatCurrency(pricing.ingredientsCost)}</dd></div>
      <div><dt>Custos adicionais</dt><dd>${formatCurrency(pricing.fixedCosts)}</dd></div>
      <div><dt>Custo total</dt><dd>${formatCurrency(pricing.totalCost)}</dd></div>
      <div><dt>Custo unitário</dt><dd>${formatCurrency(pricing.unitCost)}</dd></div>
      <div class="highlight"><dt>Preço de venda</dt><dd>${formatCurrency(pricing.suggestedPrice)}</dd></div>
      <div class="highlight"><dt>Preço por unidade</dt><dd>${formatCurrency(pricing.unitPrice)}</dd></div>
    </dl>
  </aside>`;
}

function productCardGrid(list) {
  return `<div class="card-grid">${list.map((product) => `
    <div class="item-card" data-action="open-produto" data-id="${product.id}">
      <strong>${escapeHtml(product.name)}</strong>
      <span class="muted">Rendimento: ${product.yield_amount} un. · Margem: ${product.profit_margin}%</span>
    </div>`).join('')}</div>`;
}

// ---------------- Páginas ----------------

function renderDashboard() {
  const ultimo = state.history[0];
  return `
    ${banner('Calculadora de precificação para confeitaria', 'Acompanhe seus produtos, ingredientes e o histórico de preços em um só lugar.')}
    ${statusBox()}
    <div class="stat-grid">
      <div class="stat-card"><span>Produtos salvos</span><strong>${state.savedProducts.length}</strong></div>
      <div class="stat-card"><span>Ingredientes cadastrados</span><strong>${state.savedIngredients.length}</strong></div>
      <div class="stat-card"><span>Último preço calculado</span><strong>${ultimo ? formatCurrency(ultimo.suggested_price) : '—'}</strong></div>
    </div>
    <div class="panel">
      <div class="section-header"><h2>Produtos recentes</h2><button type="button" class="ghost" data-action="goto" data-route="produtos">Ver todos</button></div>
      ${state.dataLoading ? loadingMsg() : (state.savedProducts.length ? productCardGrid(state.savedProducts.slice(0, 4)) : emptyState('Nenhum produto salvo ainda.', true))}
    </div>`;
}

function renderProdutosPage() {
  return `
    <div class="section-header">
      <div><p class="eyebrow">Produtos</p><h2>Seus produtos salvos</h2></div>
      <button type="button" data-action="start-wizard">+ Novo produto</button>
    </div>
    ${statusBox()}
    ${state.dataLoading ? loadingMsg() : (state.savedProducts.length ? productCardGrid(state.savedProducts) : `<div class="panel">${emptyState('Você ainda não salvou nenhum produto.', true)}</div>`)}
  `;
}

function renderProdutoDetalhe(id) {
  if (state.detail.loading || state.detail.productId !== id) return loadingMsg();
  const editor = state.detail;
  return `
    <div class="section-header">
      <div><p class="eyebrow">Produto</p><h2>${escapeHtml(editor.productName || 'Produto')}</h2></div>
      <button type="button" class="ghost" data-action="goto" data-route="produtos">Voltar para produtos</button>
    </div>
    ${statusBox()}
    <div class="panel">${basicFields('detail', editor)}</div>
    <div class="panel"><h3>Ingredientes</h3>${ingredientRows('detail', editor.ingredients)}</div>
    <div class="content-grid">
      <div class="panel cost-panel">
        <h3>Custos adicionais</h3>
        ${costFields('detail', editor)}
        <div class="save-actions">
          <button type="button" data-action="save-detail">Salvar alterações</button>
          <button type="button" class="ghost" data-action="save-history-detail">Salvar cálculo no histórico</button>
          <button type="button" class="danger" data-action="delete-detail" data-id="${id}">Excluir produto</button>
        </div>
      </div>
      ${summaryPanel(editor)}
    </div>`;
}

function renderWizardReview(editor) {
  const pricing = calculatePricing(editor);
  return `<div class="wizard-review">
    <h3>${escapeHtml(editor.productName || 'Produto sem nome')}</h3>
    <p class="muted">Rendimento: ${escapeHtml(editor.yieldAmount || '0')} un. · ${editor.ingredients.length} ingrediente(s)</p>
    <dl>
      <div><dt>Custo dos ingredientes</dt><dd>${formatCurrency(pricing.ingredientsCost)}</dd></div>
      <div><dt>Custos adicionais</dt><dd>${formatCurrency(pricing.fixedCosts)}</dd></div>
      <div><dt>Custo total</dt><dd>${formatCurrency(pricing.totalCost)}</dd></div>
      <div><dt>Preço de venda sugerido</dt><dd>${formatCurrency(pricing.suggestedPrice)}</dd></div>
      <div><dt>Preço por unidade</dt><dd>${formatCurrency(pricing.unitPrice)}</dd></div>
    </dl>
  </div>`;
}

function renderWizard() {
  const editor = state.wizard;
  const stepLabels = ['Informações', 'Ingredientes', 'Custos e margem', 'Revisão'];
  return `
    <div class="section-header">
      <div><p class="eyebrow">Novo produto</p><h2>Vamos montar sua ficha de precificação</h2></div>
      <button type="button" class="ghost" data-action="goto" data-route="produtos">Cancelar</button>
    </div>
    ${statusBox()}
    <div class="wizard-steps">
      ${stepLabels.map((label, i) => `<div class="wizard-step ${editor.step === i + 1 ? 'active' : ''}">${i + 1}. ${label}</div>`).join('')}
    </div>
    <div class="panel">
      ${editor.step === 1 ? basicFields('wizard', editor) : ''}
      ${editor.step === 2 ? `<h3>Ingredientes</h3>${ingredientRows('wizard', editor.ingredients)}` : ''}
      ${editor.step === 3 ? costFields('wizard', editor) : ''}
      ${editor.step === 4 ? renderWizardReview(editor) : ''}
    </div>
    <div class="wizard-actions">
      <button type="button" class="ghost" data-action="wizard-back" ${editor.step === 1 ? 'disabled' : ''}>Voltar</button>
      ${editor.step < 4
        ? '<button type="button" data-action="wizard-next">Avançar</button>'
        : '<button type="button" data-action="wizard-save">Salvar produto</button>'}
    </div>`;
}

function renderIngredientesPage() {
  const list = state.savedIngredients.length > 0
    ? `<ul class="saved-list">${state.savedIngredients.map((i) => `
        <li>
          <span>${escapeHtml(i.name)} <small class="muted">(${formatCurrency(i.package_price)} / ${i.package_amount}${escapeHtml(i.unit)})</small></span>
          <span class="saved-list-actions"><button type="button" class="ghost" data-action="delete-saved-ingredient" data-id="${i.id}">Excluir</button></span>
        </li>`).join('')}</ul>`
    : emptyState('Nenhum ingrediente cadastrado ainda.', false);

  return `
    <div class="section-header"><div><p class="eyebrow">Base de ingredientes</p><h2>Ingredientes cadastrados</h2></div></div>
    ${statusBox()}
    <div class="panel">
      ${state.dataLoading ? loadingMsg() : list}
      <form data-form="new-ingredient" class="new-ingredient-form">
        <input name="name" placeholder="Nome do ingrediente" required />
        <input name="packagePrice" inputmode="decimal" placeholder="Preço (ex: 7,50)" required />
        <input name="packageAmount" inputmode="decimal" placeholder="Qtd. da embalagem" required />
        <input name="unit" placeholder="Un. (g, ml, un)" value="g" required />
        <button type="submit">Adicionar</button>
      </form>
    </div>`;
}

function renderCustosPage() {
  const c = state.costDraft;
  return `
    <div class="section-header"><div><p class="eyebrow">Custos padrão</p><h2>Valores usados como ponto de partida</h2></div></div>
    <p>Esses valores pré-preenchem embalagem, custos extras, mão de obra e margem sempre que você cria um novo produto no assistente.</p>
    ${statusBox()}
    <div class="panel">
      <div class="field-grid">
        <label>Embalagens<input data-cost-field="packaging" inputmode="decimal" value="${escapeHtml(c.packaging)}" /></label>
        <label>Gás, energia e taxas<input data-cost-field="extraCosts" inputmode="decimal" value="${escapeHtml(c.extraCosts)}" /></label>
        <label>Mão de obra<input data-cost-field="labor" inputmode="decimal" value="${escapeHtml(c.labor)}" /></label>
        <label>Margem de lucro padrão (%)<input data-cost-field="profitMargin" inputmode="decimal" value="${escapeHtml(c.profitMargin)}" /></label>
      </div>
      <div class="save-actions"><button type="button" data-action="save-cost-settings">Salvar padrões</button></div>
    </div>`;
}

function renderHistoricoPage() {
  if (!state.history.length) return `<div class="panel">${emptyState('Nenhum cálculo salvo ainda.', false)}</div>`;
  return `<div class="panel"><ul class="saved-list">${state.history.map((h) => `
      <li>
        <span>${escapeHtml(h.product_name)} <small class="muted">${new Date(h.created_at).toLocaleString('pt-BR')}</small></span>
        <span>${formatCurrency(h.suggested_price)}</span>
      </li>`).join('')}</ul></div>`;
}

function renderPage() {
  switch (state.route.path) {
    case 'produtos': return renderProdutosPage();
    case 'produto': return renderProdutoDetalhe(state.route.param);
    case 'novo-produto': return renderWizard();
    case 'ingredientes': return renderIngredientesPage();
    case 'custos': return renderCustosPage();
    case 'historico': return renderHistoricoPage();
    default: return renderDashboard();
  }
}

// ---------------- Shell / autenticação ----------------

function navItem(route, label) {
  const active = state.route.path === route;
  return `<li><button type="button" class="nav-link ${active ? 'active' : ''}" data-action="goto" data-route="${route}">${label}</button></li>`;
}

function shellHtml() {
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark"></span> Delícias da Tai</div>
        <ul class="nav-list">
          ${navItem('inicio', 'Início')}
          ${navItem('produtos', 'Produtos')}
          ${navItem('ingredientes', 'Ingredientes')}
          ${navItem('custos', 'Custos')}
          ${navItem('historico', 'Histórico')}
        </ul>
        <button type="button" class="nav-cta" data-action="start-wizard" style="width:100%">+ Novo produto</button>
      </aside>
      <div class="main-area">
        <div class="topbar">
          <span>Olá, ${escapeHtml(state.session.user.email)}</span>
          <button type="button" class="ghost" data-action="logout">Sair</button>
        </div>
        <div class="page">${renderPage()}</div>
      </div>
    </div>`;
}

function authHtml() {
  const isSignUp = state.authMode === 'signup';
  return `
    <div class="auth-wrap">
      ${banner('Calculadora de precificação para confeitaria', 'Entre com sua conta para salvar produtos, ingredientes e o histórico dos seus cálculos.')}
      <div class="panel auth-panel">
        <div class="auth-tabs">
          <button type="button" class="${!isSignUp ? 'active' : 'ghost'}" data-action="auth-tab" data-mode="signin">Entrar</button>
          <button type="button" class="${isSignUp ? 'active' : 'ghost'}" data-action="auth-tab" data-mode="signup">Criar conta</button>
        </div>
        <form data-form="auth">
          ${isSignUp ? '<label>Nome<input name="fullName" type="text" required /></label>' : ''}
          <label>E-mail<input name="email" type="email" required /></label>
          <label>Senha<input name="password" type="password" minlength="6" required /></label>
          ${state.authError ? `<p class="auth-error">${escapeHtml(state.authError)}</p>` : ''}
          <button type="submit" ${state.authLoading ? 'disabled' : ''}>
            ${state.authLoading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>`;
}

function render() {
  const restore = captureFocus();
  app.innerHTML = state.session ? shellHtml() : authHtml();
  restoreFocus(restore);
}

// ---------------- Ações: autenticação ----------------

async function handleAuthSubmit(form) {
  const formData = new FormData(form);
  const email = formData.get('email');
  const password = formData.get('password');
  const fullName = formData.get('fullName');

  state.authLoading = true;
  state.authError = '';
  render();

  try {
    if (state.authMode === 'signup') {
      await signUp(email, password, fullName);
      state.authError = 'Conta criada! Verifique seu e-mail para confirmar o acesso, se necessário.';
    } else {
      await signIn(email, password);
    }
  } catch (error) {
    state.authError = error.message;
  } finally {
    state.authLoading = false;
    render();
  }
}

// ---------------- Ações: wizard ----------------

function wizardNext() {
  const ed = state.wizard;
  if (ed.step === 1 && !ed.productName.trim()) {
    state.statusMessage = 'Dê um nome ao produto antes de continuar.';
    render();
    return;
  }
  if (ed.step === 2 && !ed.ingredients.some((i) => i.name.trim())) {
    state.statusMessage = 'Adicione pelo menos um ingrediente.';
    render();
    return;
  }
  state.statusMessage = '';
  ed.step = Math.min(4, ed.step + 1);
  render();
}

async function handleWizardSave() {
  const ed = state.wizard;
  try {
    const saved = await db.saveProduct(
      state.session.user.id,
      null,
      {
        name: ed.productName || 'Produto sem nome',
        packaging: toNumberSafe(ed.packaging),
        extra_costs: toNumberSafe(ed.extraCosts),
        labor: toNumberSafe(ed.labor),
        profit_margin: toNumberSafe(ed.profitMargin),
        yield_amount: Math.max(1, Math.floor(toNumberSafe(ed.yieldAmount) || 1)),
      },
      ed.ingredients,
    );
    await loadUserData();
    state.statusMessage = 'Produto criado com sucesso!';
    navigate(`#/produto/${saved.id}`);
    ensureDetailLoaded(saved.id);
  } catch (error) {
    state.statusMessage = `Erro ao salvar: ${error.message}`;
    render();
  }
}

// ---------------- Ações: produto (página de detalhe) ----------------

async function handleSaveDetail() {
  const ed = state.detail;
  try {
    await db.saveProduct(
      state.session.user.id,
      ed.productId,
      {
        name: ed.productName || 'Produto sem nome',
        packaging: toNumberSafe(ed.packaging),
        extra_costs: toNumberSafe(ed.extraCosts),
        labor: toNumberSafe(ed.labor),
        profit_margin: toNumberSafe(ed.profitMargin),
        yield_amount: Math.max(1, Math.floor(toNumberSafe(ed.yieldAmount) || 1)),
      },
      ed.ingredients,
    );
    state.statusMessage = 'Alterações salvas.';
    await loadUserData();
  } catch (error) {
    state.statusMessage = `Erro ao salvar: ${error.message}`;
    render();
  }
}

async function handleDeleteDetail(id) {
  try {
    await db.deleteProduct(id);
    await loadUserData();
    navigate('#/produtos');
  } catch (error) {
    state.statusMessage = `Erro ao excluir: ${error.message}`;
    render();
  }
}

async function handleSaveHistoryFromDetail() {
  const ed = state.detail;
  try {
    const pricing = calculatePricing(ed);
    await db.saveHistoryEntry(state.session.user.id, {
      productId: ed.productId,
      productName: ed.productName || 'Produto sem nome',
      ...pricing,
    });
    state.statusMessage = 'Cálculo salvo no histórico.';
    await loadUserData();
  } catch (error) {
    state.statusMessage = `Erro ao salvar histórico: ${error.message}`;
    render();
  }
}

// ---------------- Ações: ingredientes / custos padrão ----------------

async function handleNewSavedIngredient(form) {
  const formData = new FormData(form);
  const draft = {
    name: formData.get('name'),
    packagePrice: toNumberSafe(formData.get('packagePrice')),
    packageAmount: toNumberSafe(formData.get('packageAmount')),
    unit: formData.get('unit'),
  };
  try {
    await db.createIngredient(state.session.user.id, draft);
    await loadUserData();
  } catch (error) {
    state.statusMessage = `Erro ao cadastrar ingrediente: ${error.message}`;
    render();
  }
}

async function handleDeleteSavedIngredient(id) {
  try {
    await db.deleteIngredient(id);
    await loadUserData();
  } catch (error) {
    state.statusMessage = `Erro ao excluir ingrediente: ${error.message}`;
    render();
  }
}

function handleUseIngredientInEditor(editorKey) {
  const select = app.querySelector(`[data-role="ingredient-picker-${editorKey}"]`);
  if (!select || !select.value) return;
  const source = state.savedIngredients.find((i) => i.id === select.value);
  if (!source) return;
  const ed = getEditor(editorKey);
  ed.ingredients.push(newIngredient({
    ingredientId: source.id,
    name: source.name,
    packagePrice: String(source.package_price),
    packageAmount: String(source.package_amount),
    usedAmount: '',
    unit: source.unit,
  }));
  render();
}

async function handleSaveCostSettings() {
  const c = state.costDraft;
  try {
    const saved = await db.saveCostSettings(state.session.user.id, {
      packaging: toNumberSafe(c.packaging),
      extra_costs: toNumberSafe(c.extraCosts),
      labor: toNumberSafe(c.labor),
      profit_margin: toNumberSafe(c.profitMargin),
    });
    state.costSettings = saved;
    state.statusMessage = 'Custos padrão salvos.';
  } catch (error) {
    state.statusMessage = `Erro ao salvar: ${error.message}`;
  }
  render();
}

// ---------------- Listeners globais ----------------

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.ingredientField) {
    const ed = getEditor(target.dataset.editor);
    const rowId = target.closest('[data-ingredient]').dataset.ingredient;
    ed.ingredients = ed.ingredients.map((i) => (i.id === rowId ? { ...i, [target.dataset.ingredientField]: target.value } : i));
    render();
    return;
  }
  if (target.dataset.field) {
    getEditor(target.dataset.editor)[target.dataset.field] = target.value;
    render();
    return;
  }
  if (target.dataset.costField) {
    state.costDraft[target.dataset.costField] = target.value;
    render();
  }
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const formType = event.target.dataset.form;
  if (formType === 'auth') handleAuthSubmit(event.target);
  if (formType === 'new-ingredient') {
    handleNewSavedIngredient(event.target);
    event.target.reset();
  }
});

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const editorKey = el.dataset.editor;
  const id = el.dataset.id;

  switch (action) {
    case 'goto':
      navigate(`#/${el.dataset.route}`);
      break;
    case 'open-produto':
      navigate(`#/produto/${id}`);
      break;
    case 'start-wizard':
      startWizard();
      navigate('#/novo-produto');
      render();
      break;
    case 'logout':
      signOut();
      break;
    case 'auth-tab':
      state.authMode = el.dataset.mode;
      state.authError = '';
      render();
      break;
    case 'add-ingredient':
      getEditor(editorKey).ingredients.push(newIngredient());
      render();
      break;
    case 'remove-ingredient': {
      const ed = getEditor(editorKey);
      ed.ingredients = ed.ingredients.filter((i) => i.id !== id);
      render();
      break;
    }
    case 'use-ingredient':
      handleUseIngredientInEditor(editorKey);
      break;
    case 'wizard-next':
      wizardNext();
      break;
    case 'wizard-back':
      state.wizard.step = Math.max(1, state.wizard.step - 1);
      render();
      break;
    case 'wizard-save':
      handleWizardSave();
      break;
    case 'save-detail':
      handleSaveDetail();
      break;
    case 'delete-detail':
      handleDeleteDetail(id);
      break;
    case 'save-history-detail':
      handleSaveHistoryFromDetail();
      break;
    case 'delete-saved-ingredient':
      handleDeleteSavedIngredient(id);
      break;
    case 'save-cost-settings':
      handleSaveCostSettings();
      break;
    default:
      break;
  }
});

render();
