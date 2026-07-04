#!/usr/bin/env python3
"""Generate HTML PREDICTIONS entries from the html_predictions.json file."""
import json

with open("/Users/xylei/.openclaw/canvas/worldcup/data/html_predictions.json", "r") as f:
    preds = json.load(f)

for p in preds:
    # Output each prediction as a single-line JSON
    line = json.dumps(p, ensure_ascii=False)
    print(f"  {line},")
