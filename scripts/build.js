import { mkdir, copyFile, rm, cp } from 'node:fs/promises';
import { sep } from 'node:path';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await cp('src', 'dist/src', {
  recursive: true,
  // As fontes Sass já foram compiladas em src/styles.css (ver prebuild);
  // não precisam ir para o build final.
  filter: (source) => !source.split(sep).includes('styles'),
});
await cp('assets', 'dist/assets', { recursive: true });
console.log('Build estático gerado em dist/');
