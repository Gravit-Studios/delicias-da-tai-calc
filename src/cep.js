// Busca de endereço por CEP via ViaCEP (serviço público, sem chave de API).
export async function lookupCep(cep) {
  const digits = String(cep ?? '').replace(/\D/g, '');
  if (digits.length !== 8) throw new Error('CEP inválido.');
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) throw new Error('Não foi possível buscar o CEP.');
  const data = await response.json();
  if (data.erro) throw new Error('CEP não encontrado.');
  return {
    street: data.logradouro || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
  };
}
