const fs = require('fs');
const p = 'artifacts/skillfit/tsconfig.json';
let s = fs.readFileSync(p, 'utf8');
const needle = '"resolveJsonModule": true,';
if (s.includes('"esModuleInterop"')) {
  console.log('already patched');
  process.exit(0);
}
if (!s.includes(needle)) {
  console.error('needle not found');
  process.exit(1);
}
s = s.replace(needle, `${needle}\n    "esModuleInterop": true,\n    "allowSyntheticDefaultImports": true,`);
fs.writeFileSync(p, s, 'utf8');
console.log('patched');
