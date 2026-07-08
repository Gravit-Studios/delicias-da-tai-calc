export const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const sanitized = String(value)
    .trim()
    .replace(/[^\d,.-]/g, '');

  if (!sanitized) return 0;

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);
  const decimalSeparator = lastComma > lastDot ? ',' : '.';
  const hasSingleSeparator = (lastComma === -1) !== (lastDot === -1);
  const digitsAfterSeparator = separatorIndex >= 0 ? sanitized.length - separatorIndex - 1 : 0;
  const shouldTreatAsThousands = hasSingleSeparator && digitsAfterSeparator === 3;

  const normalized = shouldTreatAsThousands
    ? sanitized.replace(/[,.]/g, '')
    : sanitized
      .replace(decimalSeparator === ',' ? /\./g : /,/g, '')
      .replace(decimalSeparator, '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value) {
  return BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

export function calculateIngredientCost(ingredient) {
  const packagePrice = toNumber(ingredient.packagePrice);
  const packageAmount = toNumber(ingredient.packageAmount);
  const usedAmount = toNumber(ingredient.usedAmount);

  if (packagePrice <= 0 || packageAmount <= 0 || usedAmount <= 0) return 0;

  return (packagePrice / packageAmount) * usedAmount;
}

export function calculatePricing({
  ingredients = [],
  packaging = 0,
  extraCosts = 0,
  labor = 0,
  profitMargin = 30,
  yieldAmount = 1,
}) {
  const ingredientsCost = ingredients.reduce(
    (sum, ingredient) => sum + calculateIngredientCost(ingredient),
    0,
  );
  const fixedCosts = toNumber(packaging) + toNumber(extraCosts) + toNumber(labor);
  const totalCost = ingredientsCost + fixedCosts;
  const marginRate = Math.max(0, toNumber(profitMargin)) / 100;
  const suggestedPrice = totalCost * (1 + marginRate);
  const safeYield = Math.max(1, Math.floor(toNumber(yieldAmount) || 1));

  return {
    ingredientsCost,
    fixedCosts,
    totalCost,
    suggestedPrice,
    unitCost: totalCost / safeYield,
    unitPrice: suggestedPrice / safeYield,
    yieldAmount: safeYield,
  };
}
