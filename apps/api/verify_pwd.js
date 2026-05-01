const bcrypt = require('bcryptjs');

async function check() {
    const dbHash = '$2b$10$WFxd76YxxiBnat.e0zgFL.WV2PwvJxnLEAywbNOW6.1ayaprpGAZG';
    const isMatch = await bcrypt.compare('admin@1234', dbHash);
    console.log(`Password 'admin@1234' matches DB hash: ${isMatch}`);
    
    // Also let's check some common defaults just in case
    if (!isMatch) {
        const tests = ['admin', 'password', 'whatszor', 'admin123'];
        for (const test of tests) {
            if (await bcrypt.compare(test, dbHash)) {
                console.log(`Actually, the password is: '${test}'`);
                return;
            }
        }
        console.log("None of the standard guesses matched.");
    }
}

check().catch(console.error);
