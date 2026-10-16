from pathlib import Path

src = Path(__file__).resolve().parents[1] / "internal" / "service" / "account.go"
text = src.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)


def slice_lines(start: int, end: int) -> str:
    return "".join(lines[start - 1 : end])


reservation = slice_lines(642, 753)
error_apply = slice_lines(496, 515)
error_msgs = slice_lines(907, 963)
error_helpers = slice_lines(1206, 1226)
remote_fetch = slice_lines(517, 618)
remote_headers = slice_lines(782, 883)
remote_types = slice_lines(1090, 1171)

reservation_file = (
    "package service\n\n"
    "import (\n"
    '\t"fmt"\n'
    '\t"time"\n\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + reservation
)

error_file = (
    "package service\n\n"
    "import (\n"
    '\t"net/http"\n'
    '\t"strings"\n'
    ")\n\n"
    + error_apply
    + error_msgs
    + error_helpers
)

remote_file = (
    "package service\n\n"
    "import (\n"
    '\t"bytes"\n'
    '\t"context"\n'
    '\t"encoding/json"\n'
    '\t"fmt"\n'
    '\t"io"\n'
    '\t"net/http"\n'
    '\t"strings"\n'
    '\t"time"\n\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + remote_fetch
    + remote_headers
    + remote_types
)

remove = [
    (1206, 1226),
    (1090, 1171),
    (907, 963),
    (782, 883),
    (642, 753),
    (517, 618),
    (496, 515),
]
new_lines = list(lines)
for start, end in remove:
    del new_lines[start - 1 : end]

base = src.parent
(base / "account_reservation.go").write_text(reservation_file, encoding="utf-8", newline="\n")
(base / "account_error.go").write_text(error_file, encoding="utf-8", newline="\n")
(base / "account_remote.go").write_text(remote_file, encoding="utf-8", newline="\n")
src.write_text("".join(new_lines), encoding="utf-8", newline="\n")

print("account.go lines", len(new_lines))
print("ok")
