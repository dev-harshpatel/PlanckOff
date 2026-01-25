
const fs = require('fs');
const path = 'c:/Users/Dhruv/OneDrive/The Value Engineering/Software/Drywall Estimator/components/EstimateResult.tsx';

try {
    const content = fs.readFileSync(path, 'utf8');
    let balance = 0;
    let mainFunctionOpen = false;
    let lineNum = 1;

    // Find the start of EstimateResult
    const lines = content.split('\n');
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('export const EstimateResult')) {
            startLine = i + 1;
            break;
        }
    }

    console.log(`EstimateResult starts at line ${startLine}`);

    for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        for (let char of line) {
            if (char === '{') balance++;
            if (char === '}') balance--;
        }

        if (balance === 0 && startLine > 0) {
            console.log(`Balance hit 0 at line ${i + 1}: ${line.trim()}`);
        }
        if (balance < 0) {
            console.log(`Balance negative at line ${i + 1}: ${line.trim()}`);
            break;
        }
    }
} catch (e) {
    console.error(e);
}
