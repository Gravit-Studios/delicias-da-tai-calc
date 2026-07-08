import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateIngredientCost, calculatePricing, toNumber } from '../src/pricing.js';

describe('pricing helpers', () => {
  it('parses Brazilian decimal strings', () => {
    assert.equal(toNumber('1.234,56'), 1234.56);
    assert.equal(toNumber('7,50'), 7.5);
    assert.equal(toNumber('1,234.56'), 1234.56);
    assert.equal(toNumber('R$ 12,90'), 12.9);
    assert.equal(toNumber('1.000'), 1000);
  });

  it('calculates proportional ingredient cost', () => {
    assert.equal(calculateIngredientCost({ packagePrice: '10', packageAmount: '1000', usedAmount: '250' }), 2.5);
  });

  it('calculates total, suggested and unit prices', () => {
    const result = calculatePricing({
      ingredients: [{ packagePrice: '10', packageAmount: '1000', usedAmount: '500' }],
      packaging: '2',
      extraCosts: '3',
      labor: '10',
      profitMargin: '50',
      yieldAmount: '4',
    });

    assert.equal(result.ingredientsCost, 5);
    assert.equal(result.fixedCosts, 15);
    assert.equal(result.totalCost, 20);
    assert.equal(result.suggestedPrice, 30);
    assert.equal(result.unitCost, 5);
    assert.equal(result.unitPrice, 7.5);
  });
});
