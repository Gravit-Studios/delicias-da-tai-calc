// Link público do cardápio (plano Vitrine): /loja/:slug é uma rota "de
// verdade" (ver rewrite em vercel.json), diferente do resto do app que
// vive todo em #/hash — é o que permite um link limpo tipo
// sweethub.com.br/loja/ateliedamaria em vez de sweethub.com.br/#/cardapio/...
// (ver publicMenuUrl em main.js). Só importa no carregamento inicial da
// página (quem chega por esse link não navega para outro lugar sem sair do
// path), por isso não precisa reagir a mudanças depois.
function parsePublicMenuPath() {
  const match = window.location.pathname.match(/^\/loja\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

export function parseRoute() {
  const menuSlug = parsePublicMenuPath();
  if (menuSlug) return { path: 'cardapio', param: menuSlug };
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, param, param2] = hash.split('/').filter(Boolean);
  return { path: path || 'inicio', param, param2 };
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function onRouteChange(callback) {
  window.addEventListener('hashchange', () => callback(parseRoute()));
}
