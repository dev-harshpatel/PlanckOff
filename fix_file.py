
import os

file_path = r"c:\Users\Dhruv\OneDrive\The Value Engineering\Software\Drywall Estimator\components\EstimateResult.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1-based line numbers to 0-based indices
# Keep lines 1 to 1460 (indices 0 to 1459)
# Cut lines 1461 to 1829 (indices 1460 to 1828)
# Keep lines 1830 to end (indices 1829 to end)

part1 = lines[:1460]
part2 = lines[1829:]

new_content = "".join(part1 + part2)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"File truncated. Original lines: {len(lines)}. New lines: {len(part1) + len(part2)}")
