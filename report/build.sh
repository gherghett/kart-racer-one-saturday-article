#!/bin/bash
# Builds the static data files for the report viewer.
# Usage: cd report && ./build.sh
#   or:  ./report/build.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building tree-data.js..."

# ── tree-data.js ──
walk() {
  local dir="$1" rel="$2" first=true
  echo '{"name":"'"$(basename "$dir")"'","type":"dir","path":"'"$rel"'","children":['
  for entry in "$dir"/*; do
    [ -e "$entry" ] || continue
    name="$(basename "$entry")"
    [[ "$name" == .* ]] && continue
    [[ "$name" == "node_modules" ]] && continue
    $first || echo ','
    first=false
    if [ -d "$entry" ]; then
      walk "$entry" "${rel:+$rel/}$name"
    else
      p="${rel:+$rel/}$name"
      echo "{\"name\":\"$name\",\"type\":\"file\",\"path\":\"$p\"}"
    fi
  done
  echo ']}'
}

printf 'var TREE_DATA = ' > "$SCRIPT_DIR/tree-data.js"
walk "$ROOT_DIR" "" >> "$SCRIPT_DIR/tree-data.js"
printf ';\n' >> "$SCRIPT_DIR/tree-data.js"

echo "Building chat-data.js..."

# ── chat-data.js ──
# Parse all .jsonl files, extract text messages, output as JS object keyed by filename
python3 -c "
import json, glob, os, sys

root = '$ROOT_DIR'
out = {}

for path in glob.glob(os.path.join(root, '**/*.jsonl'), recursive=True):
    relpath = os.path.relpath(path, root)
    messages = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except:
                continue
            if obj.get('type') not in ('user', 'assistant'):
                continue
            msg = obj.get('message', {})
            content = msg.get('content')
            if not content:
                continue
            role = msg.get('role', obj['type'])
            texts = []
            if isinstance(content, str):
                texts.append(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get('type') == 'text' and block.get('text'):
                        texts.append(block['text'])
            full = '\n'.join(texts).strip()
            if not full:
                continue
            messages.append({
                'uuid': obj.get('uuid', ''),
                'role': role,
                'text': full,
            })
    if messages:
        out[relpath] = messages

sys.stdout.write('var CHAT_DATA = ')
json.dump(out, sys.stdout, ensure_ascii=False)
sys.stdout.write(';\n')
" > "$SCRIPT_DIR/chat-data.js"

echo "Done. Generated:"
echo "  $SCRIPT_DIR/tree-data.js"
echo "  $SCRIPT_DIR/chat-data.js"
