import { calculatePricing, formatCurrency } from './pricing.js';

const state = {
  productName: 'Brigadeiro gourmet',
  ingredients: [
    { id: crypto.randomUUID(), name: 'Leite condensado', packagePrice: '7,50', packageAmount: '395', usedAmount: '395', unit: 'g' },
    { id: crypto.randomUUID(), name: 'Chocolate em pó', packagePrice: '18,00', packageAmount: '500', usedAmount: '40', unit: 'g' },
  ],
  packaging: '8,00',
  extraCosts: '5,00',
  labor: '20,00',
  profitMargin: '40',
  yieldAmount: '25',
};

const app = document.querySelector('#root');

function field(label, key, value = state[key], inputMode = 'text') {
  return `<label>${label}<input data-field="${key}" inputmode="${inputMode}" value="${escapeHtml(value)}" /></label>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
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

function render() {
  const pricing = calculatePricing(state);

  app.innerHTML = `
    <main class="app-shell">
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
    </main>`;
}

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

app.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  if (action === 'add-ingredient') {
    state.ingredients.push({ id: crypto.randomUUID(), name: '', packagePrice: '', packageAmount: '', usedAmount: '', unit: 'g' });
    render();
  }
  if (action === 'remove-ingredient') {
    state.ingredients = state.ingredients.filter((ingredient) => ingredient.id !== event.target.dataset.id);
    render();
  }
});

render();
