import importlib.util
import io
from pathlib import Path

import pytest
from PIL import Image

path = Path(__file__).resolve().parents[2] / "scripts" / "verify-image-output.py"
spec = importlib.util.spec_from_file_location("image_acceptance", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_complete_png_and_truncation():
    buf = io.BytesIO()
    Image.new("RGB", (1254, 1254), "blue").save(buf, format="PNG")
    raw = buf.getvalue()
    report = module.decode_complete(raw)
    assert (report["width"], report["height"], report["format"]) == (1254, 1254, "PNG")
    with pytest.raises(Exception):
        module.decode_complete(raw[:len(raw) // 2])
    with pytest.raises(Exception):
        module.decode_complete(b"<html>upstream error</html>")
