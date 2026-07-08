import { calculatePricing, formatCurrency } from './pricing.js';
import { signUp, signIn, signOut, getSession, onAuthStateChange } from './auth.js';
import * as db from './db.js';

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

function defaultCalculator() {
  return {
    productId: null,
    productName: 'Brigadeiro gourmet',
    ingredients: [
      newIngredient({ name: 'Leite condensado', packagePrice: '7,50', packageAmount: '395', usedAmount: '395', unit: 'g' }),
      newIngredient({ name: 'Chocolate em pó', packagePrice: '18,00', packageAmount: '500', usedAmount: '40', unit: 'g' }),
    ],
    packaging: '8,00',
    extraCosts: '5,00',
    labor: '20,00',
    profitMargin: '40',
    yieldAmount: '25',
  };
}

const state = {
  session: null,
  authMode: 'signin',
  authError: '',
  authLoading: false,

  ...defaultCalculator(),

  savedIngredients: [],
  savedProducts: [],
  history: [],
  dataLoading: false,
  statusMessage: '',
  newIngredientDraft: { name: '', packagePrice: '', packageAmount: '', unit: 'g' },
};

const app = document.querySelector('#root');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function field(label, key, value = state[key], inputMode = 'text') {
  return `<label>${label}<input data-field="${key}" inputmode="${inputMode}" value="${escapeHtml(value)}" /></label>`;
}

function updateText(selector, value) {
  const element = app.querySelector(selector);
  if (element) element.textContent = value;
}

function updatePricingSummary() {
  const pricing = calculatePricing(state);

  updateText('[data-result=hero-price]', formatCurrency(pricing.suggestedPrice));
  updateText('[data-result=hero-unit-price]', `${formatCurrency(pricing.unitPrice)} por unidade`);
  updateText('[data-result=ingredients-cost]', formatCurrency(pricing.ingredientsCost));
  updateText('[data-result=fixed-costs]', formatCurrency(pricing.fixedCosts));
  updateText('[data-result=total-cost]', formatCurrency(pricing.totalCost));
  updateText('[data-result=unit-cost]', formatCurrency(pricing.unitCost));
  updateText('[data-result=suggested-price]', formatCurrency(pricing.suggestedPrice));
  updateText('[data-result=unit-price]', formatCurrency(pricing.unitPrice));
}

function updateProductTitle() {
  updateText('[data-product-title]', `Ingredientes de ${state.productName || 'produto'}`);
}

// ---------------- Autenticação: dados e ações ----------------

async function loadUserData() {
  if (!state.session) return;
  state.dataLoading = true;
  render();
  try {
    const userId = state.session.user.id;
    const [ingredients, products, history] = await Promise.all([
      db.listIngredients(userId),
      db.listProducts(userId),
      db.listHistory(userId, 8),
    ]);
    state.savedIngredients = ingredients;
    state.savedProducts = products;
    state.history = history;
  } catch (error) {
    state.statusMessage = `Erro ao carregar dados: ${error.message}`;
  } finally {
    state.dataLoading = false;
    render();
  }
}

onAuthStateChange((session) => {
  const hadSession = Boolean(state.session);
  state.session = session;
  if (session && !hadSession) {
    loadUserData();
  }
  if (!session) {
    state.savedIngredients = [];
    state.savedProducts = [];
    state.history = [];
  }
  render();
});

getSession().then((session) => {
  state.session = session;
  render();
  if (session) loadUserData();
});

// ---------------- Renderização: tela de login/cadastro ----------------

function renderAuth() {
  const isSignUp = state.authMode === 'signup';
  app.innerHTML = `
    <main class="app-shell auth-shell">
      <section class="hero">
        <div>
          <p class="eyebrow">Delícias da Tai</p>
          <h1>Calculadora de precificação para confeitaria</h1>
          <p>Entre com sua conta para salvar produtos, ingredientes e o histórico dos seus cálculos.</p>
        </div>
      </section>

      <section class="panel auth-panel">
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
      </section>
    </main>`;
}

// ---------------- Renderização: app principal ----------------

function renderSavedProducts() {
  if (state.savedProducts.length === 0) return '<p class="muted">Nenhum produto salvo ainda.</p>';
  return `<ul class="saved-list">
    ${state.savedProducts.map((product) => `
      <li>
        <span>${escapeHtml(product.name)}</span>
        <span class="saved-list-actions">
          <button type="button" class="ghost" data-action="load-product" data-id="${product.id}">Abrir</button>
          <button type="button" class="ghost" data-action="delete-product" data-id="${product.id}">Excluir</button>
        </span>
      </li>`).join('')}
  </ul>`;
}

function renderSavedIngredients() {
  if (state.savedIngredients.length === 0) return '<p class="muted">Nenhum ingrediente cadastrado ainda.</p>';
  return `<ul class="saved-list">
    ${state.savedIngredients.map((ingredient) => `
      <li>
        <span>${escapeHtml(ingredient.name)} <small class="muted">(${formatCurrency(ingredient.package_price)} / ${ingredient.package_amount}${escapeHtml(ingredient.unit)})</small></span>
        <span class="saved-list-actions">
          <button type="button" class="ghost" data-action="use-ingredient" data-id="${ingredient.id}">Usar</button>
          <button type="button" class="ghost" data-action="delete-saved-ingredient" data-id="${ingredient.id}">Excluir</button>
        </span>
      </li>`).join('')}
  </ul>`;
}

function renderHistory() {
  if (state.history.length === 0) return '<p class="muted">Nenhum cálculo salvo no histórico ainda.</p>';
  return `<ul class="saved-list">
    ${state.history.map((entry) => `
      <li>
        <span>${escapeHtml(entry.product_name)} <small class="muted">${new Date(entry.created_at).toLocaleString('pt-BR')}</small></span>
        <span>${formatCurrency(entry.suggested_price)}</span>
      </li>`).join('')}
  </ul>`;
}

function render() {
  if (!state.session) {
    renderAuth();
    return;
  }

  const pricing = calculatePricing(state);

  app.innerHTML = `
    <main class="app-shell">
      <div class="topbar">
        <span>Olá, ${escapeHtml(state.session.user.email)}</span>
        <button type="button" class="ghost" data-action="logout">Sair</button>
      </div>

      <section class="hero">
        <div>
          <p class="eyebrow">Delícias da Tai</p>
          <h1>Calculadora de precificação para confeitaria</h1>
          <p>Some o custo dos ingredientes, embalagens, despesas, mão de obra e margem de lucro para chegar a um preço de venda seguro por receita e por unidade.</p>
        </div>
        <div class="hero-card">
          <span>Preço sugerido</span>
          <strong data-result="hero-price">${formatCurrency(pricing.suggestedPrice)}</strong>
          <small data-result="hero-unit-price">${formatCurrency(pricing.unitPrice)} por unidade</small>
        </div>
      </section>

      ${state.statusMessage ? `<p class="status-message">${escapeHtml(state.statusMessage)}</p>` : ''}

      <section class="panel product-panel">
        ${field('Nome do produto', 'productName')}
        ${field('Rendimento', 'yieldAmount', state.yieldAmount, 'decimal')}
        ${field('Margem de lucro (%)', 'profitMargin', state.profitMargin, 'decimal')}
      </section>

      <section class="panel">
        <div class="section-header">
          <div><p class="eyebrow">Ficha técnica</p><h2 data-product-title>Ingredientes de ${escapeHtml(state.productName || 'produto')}</h2></div>
          <button type="button" data-action="add-ingredient">Adicionar ingrediente</button>
        </div>
        <div class="ingredient-grid header-row" aria-hidden="true"><span>Ingrediente</span><span>Preço da compra</span><span>Qtd. comprada</span><span>Qtd. usada</span><span>Un.</span><span></span></div>
        ${state.ingredients.map((ingredient) => `
          <div class="ingredient-grid" data-ingredient="${ingredient.id}">
            <input aria-label="Ingrediente" data-ingredient-field="name" value="${escapeHtml(ingredient.name)}" />
            <input aria-label="Preço da compra" inputmode="decimal" data-ingredient-field="packagePrice" value="${escapeHtml(ingredient.packagePrice)}" />
            <input aria-label="Quantidade comprada" inputmode="decimal" data-ingredient-field="packageAmount" value="${escapeHtml(ingredient.packageAmount)}" />
            <input aria-label="Quantidade usada" inputmode="decimal" data-ingredient-field="usedAmount" value="${escapeHtml(ingredient.usedAmount)}" />
            <input aria-label="Unidade" data-ingredient-field="unit" value="${escapeHtml(ingredient.unit)}" />
            <button class="ghost" type="button" data-action="remove-ingredient" data-id="${ingredient.id}">Remover</button>
          </div>`).join('')}
      </section>

      <section class="content-grid">
        <div class="panel cost-panel">
          <p class="eyebrow">Custos adicionais</p><h2>Complete a composição</h2>
          ${field('Embalagens', 'packaging', state.packaging, 'decimal')}
          ${field('Gás, energia e taxas', 'extraCosts', state.extraCosts, 'decimal')}
          ${field('Mão de obra', 'labor', state.labor, 'decimal')}
          <div class="save-actions">
            <button type="button" data-action="save-product">${state.productId ? 'Atualizar produto' : 'Salvar produto'}</button>
            <button type="button" class="ghost" data-action="new-product">Novo produto</button>
            <button type="button" class="ghost" data-action="save-history">Salvar no histórico</button>
          </div>
        </div>
        <aside class="panel summary-panel">
          <p class="eyebrow">Resumo</p><h2>Resultado da precificação</h2>
          <dl>
            <div><dt>Ingredientes</dt><dd data-result="ingredients-cost">${formatCurrency(pricing.ingredientsCost)}</dd></div>
            <div><dt>Custos adicionais</dt><dd data-result="fixed-costs">${formatCurrency(pricing.fixedCosts)}</dd></div>
            <div><dt>Custo total</dt><dd data-result="total-cost">${formatCurrency(pricing.totalCost)}</dd></div>
            <div><dt>Custo unitário</dt><dd data-result="unit-cost">${formatCurrency(pricing.unitCost)}</dd></div>
            <div class="highlight"><dt>Preço de venda</dt><dd data-result="suggested-price">${formatCurrency(pricing.suggestedPrice)}</dd></div>
            <div class="highlight"><dt>Preço por unidade</dt><dd data-result="unit-price">${formatCurrency(pricing.unitPrice)}</dd></div>
          </dl>
        </aside>
      </section>

      <section class="content-grid">
        <div class="panel">
          <p class="eyebrow">Meus produtos</p><h2>Produtos salvos</h2>
          ${state.dataLoading ? '<p class="muted">Carregando...</p>' : renderSavedProducts()}
        </div>
        <div class="panel">
          <p class="eyebrow">Histórico</p><h2>Últimos cálculos</h2>
          ${state.dataLoading ? '<p class="muted">Carregando...</p>' : renderHistory()}
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Meus ingredientes</p><h2>Cadastro reutilizável</h2>
        ${state.dataLoading ? '<p class="muted">Carregando...</p>' : renderSavedIngredients()}
        <form data-form="new-ingredient" class="new-ingredient-form">
          <input name="name" placeholder="Nome do ingrediente" required />
          <input name="packagePrice" inputmode="decimal" placeholder="Preço (ex: 7,50)" required />
          <input name="packageAmount" inputmode="decimal" placeholder="Qtd. da embalagem" required />
          <input name="unit" placeholder="Un. (g, ml, un)" value="g" required />
          <button type="submit">Adicionar ao cadastro</button>
        </form>
      </section>
    </main>`;
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

// ---------------- Ações: produtos, ingredientes, histórico ----------------

function resetCalculator() {
  Object.assign(state, defaultCalculator());
}

async function handleSaveProduct() {
  if (!state.session) return;
  try {
    const userId = state.session.user.id;
    const saved = await db.saveProduct(
      userId,
      state.productId,
      {
        name: state.productName || 'Produto sem nome',
        packaging: toNumberSafe(state.packaging),
        extra_costs: toNumberSafe(state.extraCosts),
        labor: toNumberSafe(state.labor),
        profit_margin: toNumberSafe(state.profitMargin),
        yield_amount: Math.max(1, Math.floor(toNumberSafe(state.yieldAmount) || 1)),
      },
      state.ingredients,
    );
    state.productId = saved.id;
    state.statusMessage = 'Produto salvo com sucesso.';
    await loadUserData();
  } catch (error) {
    state.statusMessage = `Erro ao salvar produto: ${error.message}`;
    render();
  }
}

function toNumberSafe(value) {
  const normalized = String(value ?? '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function handleLoadProduct(productId) {
  try {
    const { product, items } = await db.loadProductWithIngredients(productId);
    state.productId = product.id;
    state.productName = product.name;
    state.packaging = String(product.packaging);
    state.extraCosts = String(product.extra_costs);
    state.labor = String(product.labor);
    state.profitMargin = String(product.profit_margin);
    state.yieldAmount = String(product.yield_amount);
    state.ingredients = items.length > 0
      ? items.map((item) => newIngredient({
          ingredientId: item.ingredient_id,
          name: item.name,
          packagePrice: String(item.package_price),
          packageAmount: String(item.package_amount),
          usedAmount: String(item.used_amount),
          unit: item.unit,
        }))
      : [newIngredient()];
    state.statusMessage = '';
    render();
  } catch (error) {
    state.statusMessage = `Erro ao abrir produto: ${error.message}`;
    render();
  }
}

async function handleDeleteProduct(productId) {
  try {
    await db.deleteProduct(productId);
    if (state.productId === productId) resetCalculator();
    await loadUserData();
  } catch (error) {
    state.statusMessage = `Erro ao excluir produto: ${error.message}`;
    render();
  }
}

async function handleSaveHistory() {
  if (!state.session) return;
  try {
    const pricing = calculatePricing(state);
    await db.saveHistoryEntry(state.session.user.id, {
      productId: state.productId,
      productName: state.productName || 'Produto sem nome',
      ...pricing,
    });
    state.statusMessage = 'Cálculo salvo no histórico.';
    await loadUserData();
  } catch (error) {
    state.statusMessage = `Erro ao salvar histórico: ${error.message}`;
    render();
  }
}

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

function handleUseIngredient(id) {
  const source = state.savedIngredients.find((ingredient) => ingredient.id === id);
  if (!source) return;
  state.ingredients.push(newIngredient({
    ingredientId: source.id,
    name: source.name,
    packagePrice: String(source.package_price),
    packageAmount: String(source.package_amount),
    usedAmount: '',
    unit: source.unit,
  }));
  render();
}

// ---------------- Listeners ----------------

app.addEventListener('input', (event) => {
  const target = event.target;
  const fieldName = target.dataset.field;
  if (fieldName) {
    state[fieldName] = target.value;
    if (fieldName === 'productName') updateProductTitle();
    updatePricingSummary();
    return;
  }

  const ingredientField = target.dataset.ingredientField;
  if (ingredientField) {
    const id = target.closest('[data-ingredient]').dataset.ingredient;
    state.ingredients = state.ingredients.map((ingredient) => ingredient.id === id ? { ...ingredient, [ingredientField]: target.value } : ingredient);
    updatePricingSummary();
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
  const action = event.target.dataset.action;
  if (!action) return;

  if (action === 'auth-tab') {
    state.authMode = event.target.dataset.mode;
    state.authError = '';
    render();
  }
  if (action === 'logout') signOut();
  if (action === 'add-ingredient') {
    state.ingredients.push(newIngredient());
    render();
  }
  if (action === 'remove-ingredient') {
    state.ingredients = state.ingredients.filter((ingredient) => ingredient.id !== event.target.dataset.id);
    render();
  }
  if (action === 'save-product') handleSaveProduct();
  if (action === 'new-product') {
    resetCalculator();
    state.statusMessage = '';
    render();
  }
  if (action === 'save-history') handleSaveHistory();
  if (action === 'load-product') handleLoadProduct(event.target.dataset.id);
  if (action === 'delete-product') handleDeleteProduct(event.target.dataset.id);
  if (action === 'use-ingredient') handleUseIngredient(event.target.dataset.id);
  if (action === 'delete-saved-ingredient') handleDeleteSavedIngredient(event.target.dataset.id);
});

render();
