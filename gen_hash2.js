const bcrypt = require('./node_modules/bcryptjs');
const fs = require('fs');
const path = require('path');

(async () => {
    const password = 'DevAdmin123';
    const hash = await bcrypt.hash(password, 10);
    // Write to a file in the project directory
    const outPath = path.join(__dirname, '..', '..', 'temp_hash_output.txt');
    fs.writeFileSync(outPath, hash);
    console.log('Generated hash for password: ' + password);
    console.log('Hash written to: ' + outPath);
})();
