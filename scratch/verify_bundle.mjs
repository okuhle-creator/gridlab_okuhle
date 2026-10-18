import { readFileSync, existsSync, statSync } from 'fs';
const html = readFileSync('index.html', 'utf8');
console.log('type=module removed:', !html.includes('type="module"'));
console.log('dist/bundle.js linked:', html.includes('dist/bundle.js'));
console.log('dist/bundle.js exists:', existsSync('dist/bundle.js'));
console.log('Bundle size:', (statSync('dist/bundle.js').size / 1024).toFixed(1) + ' KB');
