import { supabase } from './supabaseClient.js';

// ---------- Ingredientes reutilizáveis ----------

export async function listIngredients(userId) {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createIngredient(userId, ingredient) {
  const { data, error } = await supabase
    .from('ingredients')
    .insert({
      user_id: userId,
      name: ingredient.name,
      package_price: ingredient.packagePrice,
      package_amount: ingredient.packageAmount,
      unit: ingredient.unit,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIngredient(id) {
  const { error } = await supabase.from('ingredients').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Produtos / receitas ----------

export async function listProducts(userId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function loadProductWithIngredients(productId) {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();
  if (productError) throw productError;

  const { data: items, error: itemsError } = await supabase
    .from('product_ingredients')
    .select('*')
    .eq('product_id', productId)
    .order('position', { ascending: true });
  if (itemsError) throw itemsError;

  return { product, items };
}

export async function saveProduct(userId, productId, productData, ingredients) {
  let savedProduct;

  if (productId) {
    const { data, error } = await supabase
      .from('products')
      .update({ ...productData, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select()
      .single();
    if (error) throw error;
    savedProduct = data;

    const { error: deleteError } = await supabase
      .from('product_ingredients')
      .delete()
      .eq('product_id', productId);
    if (deleteError) throw deleteError;
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert({ user_id: userId, ...productData })
      .select()
      .single();
    if (error) throw error;
    savedProduct = data;
  }

  if (ingredients.length > 0) {
    const rows = ingredients.map((ingredient, index) => ({
      user_id: userId,
      product_id: savedProduct.id,
      ingredient_id: ingredient.ingredientId ?? null,
      name: ingredient.name,
      package_price: ingredient.packagePrice,
      package_amount: ingredient.packageAmount,
      used_amount: ingredient.usedAmount,
      unit: ingredient.unit,
      position: index,
    }));
    const { error: insertError } = await supabase.from('product_ingredients').insert(rows);
    if (insertError) throw insertError;
  }

  return savedProduct;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Histórico de precificação ----------

export async function saveHistoryEntry(userId, entry) {
  const { error } = await supabase.from('pricing_history').insert({
    user_id: userId,
    product_id: entry.productId ?? null,
    product_name: entry.productName,
    ingredients_cost: entry.ingredientsCost,
    fixed_costs: entry.fixedCosts,
    total_cost: entry.totalCost,
    suggested_price: entry.suggestedPrice,
    unit_cost: entry.unitCost,
    unit_price: entry.unitPrice,
    yield_amount: entry.yieldAmount,
  });
  if (error) throw error;
}

export async function listHistory(userId, limit = 10) {
  const { data, error } = await supabase
    .from('pricing_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
