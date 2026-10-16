"""Pytest bootstrap: isolate runtime data and provide test-only required config."""

import atexit
import os
import sys
import tempfile
from pathlib import Path


_ROOT = Path(__file__).resolve().parent
_UPSTREAM = _ROOT / "upstream"
if str(_UPSTREAM) not in sys.path:
    sys.path.insert(0, str(_UPSTREAM))


_TEST_DATA = tempfile.TemporaryDirectory(prefix="shengtu-grok-pytest-")
atexit.register(_TEST_DATA.cleanup)

os.environ["DATA_DIR"] = _TEST_DATA.name
os.environ["GROK_RUNTIME_DATA_DIR"] = _TEST_DATA.name
os.environ["GROK_DATA_DIR"] = os.path.join(_TEST_DATA.name, "native")
os.environ["GROK_LOG_DIR"] = os.path.join(_TEST_DATA.name, "logs")
os.environ.setdefault("CHATGPT2API_AUTH_KEY", "pytest-only-auth-key-not-for-production")
