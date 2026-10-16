# -*- coding: utf-8 -*-
from pathlib import Path

settings = Path(__file__).resolve().parents[1] / "web" / "src" / "app" / "settings"
store = settings / "store.ts"
lines = store.read_text(encoding="utf-8").splitlines(keepends=True)

ti = next(i for i, l in enumerate(lines) if l.startswith("type SettingsStore"))
si = next(i for i, l in enumerate(lines) if l.startswith("function normalize"))
norm = "".join(lines[si:ti])
for name in [
    "normalizeRegisterClearanceConfig",
    "normalizeRegisterConfig",
    "normalizeConfig",
    "normalizeImageProxyMaxRetries",
    "normalizeImageDefaultModel",
    "normalizeImageInternalModelSlug",
    "normalizeImageFallbackModelSlugs",
    "normalizeFiles",
]:
    norm = norm.replace(f"function {name}", f"export function {name}")

(settings / "settings-normalizers.ts").write_text(
    'import type { CPARemoteFile, RegisterConfig, SettingsConfig } from "@/lib/api";\n'
    "import {\n"
    "  normalizeLoginPageImageMode,\n"
    "  normalizeLoginPageImageTransform,\n"
    '} from "@/lib/login-page-image-layout";\n\n'
    + norm,
    encoding="utf-8",
    newline="\n",
)

head = "".join(lines[:si])
if "settings-normalizers" not in head:
    head = head.replace(
        '} from "@/lib/login-page-image-layout";\n',
        '} from "@/lib/login-page-image-layout";\n'
        "import {\n"
        "  normalizeConfig,\n"
        "  normalizeFiles,\n"
        "  normalizeImageDefaultModel,\n"
        "  normalizeImageFallbackModelSlugs,\n"
        "  normalizeImageInternalModelSlug,\n"
        "  normalizeImageProxyMaxRetries,\n"
        "  normalizeRegisterClearanceConfig,\n"
        "  normalizeRegisterConfig,\n"
        '} from "./settings-normalizers";\n',
    )
tail = "".join(lines[ti:])
store.write_text(head + tail, encoding="utf-8", newline="\n")
print("store lines", len((head + tail).splitlines()))
print("chinese ok", "失败" in store.read_text(encoding="utf-8"))
