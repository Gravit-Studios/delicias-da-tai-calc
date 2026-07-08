import { mkdir, copyFile, rm, cp } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive: true });
console.log('Build estático gerado em dist/');
