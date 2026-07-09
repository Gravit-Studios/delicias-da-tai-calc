export function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, param] = hash.split('/').filter(Boolean).reduce(
    (acc, segment, index) => (index === 0 ? [segment, acc[1]] : [acc[0], segment]),
    ['', undefined],
  );
  return { path: path || 'inicio', param };
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function onRouteChange(callback) {
  window.addEventListener('hashchange', () => callback(parseRoute()));
}
