#!/usr/bin/env node
// scripts/gen_bcrypt.js
// Usage: node scripts/gen_bcrypt.js <password>
import bcrypt from 'bcrypt';

const [, , password] = process.argv;
if (!password) {
  console.error('Usage: node scripts/gen_bcrypt.js <password>');
  process.exit(1);
}

(async () => {
  try {
    const hash = await bcrypt.hash(password, 12);
    console.log(hash);
  } catch (err) {
    console.error('Error generando hash:', err.message);
    process.exit(1);
  }
})();
