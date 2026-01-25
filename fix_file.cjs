
const fs = require('fs');
const path = require('path');

const filePath = String.raw`c:\Users\Dhruv\OneDrive\The Value Engineering\Software\Drywall Estimator\components\EstimateResult.tsx`;

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split(/\r?\n/);

    // Keep lines 0 to 1459 (corresponding to 1 to 1460 1-based)
    // Cut lines 1460 to 1828 (corresponding to 1461 to 1829 1-based)
    // Keep lines 1829 to end (corresponding to 1830 to end 1-based)

    // Validate length
    if (lines.length < 1800) {
        console.log("File appears to be already truncated or too short: " + lines.length);
        process.exit(0);
    }

    const part1 = lines.slice(0, 1460);
    const part2 = lines.slice(1829);

    console.log("Last line of part 1:", part1[part1.length - 1]);
    console.log("First line of part 2:", part2[0]);

    const newContent = part1.join('\n') + '\n' + part2.join('\n');

    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Success! Reduced from ${lines.length} lines to ${part1.length + part2.length} lines.`);
} catch (err) {
    console.error("Error:", err);
    process.exit(1);
}
