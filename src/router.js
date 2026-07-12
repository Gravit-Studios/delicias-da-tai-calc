export function parseRoute() {
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
