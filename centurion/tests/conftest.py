"""Make the centurion package root importable as bare modules (from ledger
import Ledger, etc.) regardless of where pytest is invoked from."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
