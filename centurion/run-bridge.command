#!/bin/bash
# Double-click on a Mac to run the Ollama quality bridge. Edit the two values
# below, then double-click this file (you may need: right-click -> Open the
# first time). It keeps your local model working Centurion's upgrade jobs.
cd "$(dirname "$0")"

SERVER="https://centurion-dashboard.onrender.com"
BRIDGE_TOKEN="PASTE_YOUR_CENTURION_BRIDGE_TOKEN"
MODEL="llama3.1:8b"

if [ "$BRIDGE_TOKEN" = "PASTE_YOUR_CENTURION_BRIDGE_TOKEN" ]; then
  echo "Edit run-bridge.command and set BRIDGE_TOKEN first (from Render env: CENTURION_BRIDGE_TOKEN)."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

# Make sure Ollama is up and the model is pulled.
if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "Starting Ollama..."
  (ollama serve >/dev/null 2>&1 &) ; sleep 3
fi
ollama pull "$MODEL"

python3 -m pip install --quiet requests 2>/dev/null
python3 ollama_bridge.py --server "$SERVER" --token "$BRIDGE_TOKEN" --model "$MODEL"
