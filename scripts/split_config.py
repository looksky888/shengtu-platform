"""Split config.go accessors and normalize helpers into dedicated files."""
from pathlib import Path

src = Path(__file__).resolve().parents[1] / "internal" / "config" / "config.go"
lines = src.read_text(encoding="utf-8").splitlines(keepends=True)
n = len(lines)


def body(start: int, end: int) -> str:
    return "".join(lines[start - 1 : end])


# Line map from earlier scan of config.go (~1119 lines):
# 187-480 accessors AdminUsername..LoginPageImagePositionY
# 482-end Get/Update/cleanup/storage/setting helpers
# 719-end normalize/validate helpers
# Keep in config.go: NewStore, resolveRootDir, Get, Update, Cleanup, Storage, settingValue, validate, save, loadEnv
# Move accessors 187-480
# Move normalize helpers from 719 or 828?

# From first scan:
# 719 normalizeUpdateRepo
# 828 intSetting
# Through end of file normalize/mask helpers

accessors = body(187, 480)
normalize = body(719, n)

accessors_file = (
    "package config\n\n"
    "import (\n"
    '\t"fmt"\n'
    '\t"os"\n'
    '\t"path/filepath"\n'
    '\t"strings"\n\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + accessors
)

normalize_file = (
    "package config\n\n"
    "import (\n"
    '\t"fmt"\n'
    '\t"net/url"\n'
    '\t"strconv"\n'
    '\t"strings"\n\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + normalize
)

# Remove from config.go: 187-480 and 719-end (from bottom)
new_lines = list(lines)
# delete normalize first (bottom)
del new_lines[719 - 1 : n]
# delete accessors
del new_lines[187 - 1 : 480]

src.write_text("".join(new_lines), encoding="utf-8", newline="\n")
(src.parent / "config_accessors.go").write_text(accessors_file, encoding="utf-8", newline="\n")
(src.parent / "config_normalize.go").write_text(normalize_file, encoding="utf-8", newline="\n")

print("config.go", len(new_lines))
print("config_accessors.go", len(accessors_file.splitlines()))
print("config_normalize.go", len(normalize_file.splitlines()))
