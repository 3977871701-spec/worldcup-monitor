#!/usr/bin/env python3
"""Update the PREDICTIONS constant in index.html with new Monte Carlo simulation data."""

import json
import re

html_path = "/Users/xylei/.openclaw/canvas/worldcup/docs/index.html"
preds_path = "/Users/xylei/.openclaw/canvas/worldcup/data/html_predictions.json"

# Read the HTML file
with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

# Read the new predictions
with open(preds_path, 'r', encoding='utf-8') as f:
    new_preds = json.load(f)

# Find the PREDICTIONS constant
# It starts with "const PREDICTIONS=[" and ends with "];"
# We need to find the section between the [ and ];

# Find the start of PREDICTIONS array
match = re.search(r'const PREDICTIONS=\[', html_content)
if not match:
    print("ERROR: Could not find PREDICTIONS constant")
    exit(1)

start_idx = match.start()

# Find the matching ]; 
# We need to find the closing bracket of the array
# The array contains JSON objects, so we need to track bracket depth
arr_start = match.end() - 1  # position of [
depth = 1
pos = arr_start + 1
while pos < len(html_content) and depth > 0:
    if html_content[pos] == '[':
        depth += 1
    elif html_content[pos] == ']':
        depth -= 1
    elif html_content[pos] == '"':
        # Skip string contents
        pos += 1
        while pos < len(html_content) and html_content[pos] != '"':
            if html_content[pos] == '\\':
                pos += 1  # skip escaped char
            pos += 1
    pos += 1

# pos now points to right after the ];
end_idx = pos

# The old content is from start_idx to end_idx
old_section = html_content[start_idx:end_idx]

# Now we need to keep entries 760499, 760500, 760501 from the old content
# and replace 760502-760507 with new data, adding 760508 and 760509

# Parse the old PREDICTIONS to find the entries we want to keep
# Find lines 448-450 (760499, 760500, 760501) - keep these
# Find lines 451-456 (760502-760507) - replace these
# Add 760508 and 760509

# Let's use a different approach: find each entry by ID
# Split the old section into entries
old_entries_text = old_section[len('const PREDICTIONS=['):-2]  # Remove prefix and ];

# Split by },\n  or }]\n to get individual entries
entries = []
current = ""
brace_depth = 0
for char in old_entries_text:
    if char == '{':
        brace_depth += 1
    elif char == '}':
        brace_depth -= 1
    current += char
    if brace_depth == 0 and current.strip():
        entries.append(current.strip().rstrip(','))
        current = ""

# Parse each entry to get ID
keep_entries = []
replace_ids = {str(m['id']) for m in new_preds}

for entry_text in entries:
    try:
        entry = json.loads(entry_text)
        entry_id = entry.get('id', '')
        if entry_id not in replace_ids:
            keep_entries.append(entry_text)
            print(f"Keeping entry {entry_id}")
        else:
            print(f"Replacing entry {entry_id}")
    except json.JSONDecodeError as e:
        print(f"Warning: Could not parse entry: {e}")
        # Keep it anyway
        keep_entries.append(entry_text)

# Build new entries
new_entries = []
for pred in new_preds:
    new_entries.append(json.dumps(pred, ensure_ascii=False))
    print(f"Adding new entry {pred['id']}")

# Combine all entries
all_entries = keep_entries + new_entries
combined = ',\n  '.join(all_entries)

# Build new PREDICTIONS section
new_section = f'const PREDICTIONS=[\n  {combined}\n];'

# Replace in HTML
new_html = html_content[:start_idx] + new_section + html_content[end_idx:]

# Write back
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(new_html)

print(f"\n[OK] Updated {html_path}")
print(f"  Kept {len(keep_entries)} old entries, added/updated {len(new_entries)} entries")
