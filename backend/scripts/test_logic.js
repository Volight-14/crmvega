function simulateLogic(data) {
    let telegramId = data.telegram_user_id;

    if (!telegramId && data.User) {
        if (typeof data.User === 'object' && data.User.TelegramID) {
            telegramId = data.User.TelegramID;
            console.log(`CASE A: Object -> ${telegramId}`);
        }
        else if (typeof data.User === 'string' && data.User.length > 10) {
            console.log(`CASE B: Fetching... (Simulated skip)`);
        }
    }

    if (!telegramId && data.User) {
        const userValue = String(data.User).trim();
        console.log('Checking Normalized:', `'${userValue}'`);

        if (/^\d+$/.test(userValue)) {
            telegramId = userValue;
            console.log('Matched Digits!');
        } else {
            console.log('Did NOT match digits');
        }
    }

    return telegramId;
}

console.log('--- Test 1: Number ---');
console.log('Result:', simulateLogic({ User: 715033350 }));

console.log('\n--- Test 2: String ---');
console.log('Result:', simulateLogic({ User: "715033350" }));

console.log('\n--- Test 3: String with Space ---');
console.log('Result:', simulateLogic({ User: " 715033350 " }));

console.log('\n--- Test 4: Long ID ---');
simulateLogic({ User: "1765619883292x4563" });
