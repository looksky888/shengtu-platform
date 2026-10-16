"""Split protocol/conversation.go into focused files without behavior changes."""
from pathlib import Path

src = Path(__file__).resolve().parents[1] / "internal" / "protocol" / "conversation.go"
lines = src.read_text(encoding="utf-8").splitlines(keepends=True)
n = len(lines)


def body(start: int, end: int) -> str:
    """1-based inclusive."""
    return "".join(lines[start - 1 : end])


def write(name: str, content: str) -> None:
    path = src.parent / name
    path.write_text(content, encoding="utf-8", newline="\n")
    print(f"{name}: {len(content.splitlines())} lines")


# Line map from current conversation.go (must match restored file):
# 31-167: ImageConfig..upstreamModelForAttempt
# 169-208: ConversationState..NewImageGenerationError
# 210-300: maxImageStreamTransientRetries..ImageOutput.Chunk
# 302-476: TextBackend..IterConversationPayloads
# 478-768: StreamImageOutputsWithPool..conversationImageResultOutput
# 770-1073: responses image tool block
# 1075-1281: CollectImageOutputs..imageOwnerDocumentName
# 1283-1350: IsTokenInvalidError..AssistantHistoryMessages
# 1351-1463: size/prompt/token/EncodeImages/UploadedImage
# 1465-end: AssistantText..firstNonEmpty

# --- image_options.go ---
# 31-43 interfaces, 58-167 request/options (skip Engine at 45-56)
write(
    "image_options.go",
    "package protocol\n\n"
    "import (\n"
    '\t"fmt"\n'
    '\t"regexp"\n'
    '\t"strings"\n\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + body(31, 43)
    + body(58, 167)
    + body(1351, 1463),
)

# --- image_stream.go ---
write(
    "image_stream.go",
    "package protocol\n\n"
    "import (\n"
    '\t"context"\n'
    '\t"fmt"\n'
    '\t"strings"\n'
    '\t"sync"\n'
    '\t"time"\n\n'
    '\t"chatgpt2api/internal/backend"\n'
    '\t"chatgpt2api/internal/service"\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + body(210, 300)
    + body(478, 768),
)

# --- image_responses_tool.go ---
write(
    "image_responses_tool.go",
    "package protocol\n\n"
    "import (\n"
    '\t"context"\n'
    '\t"fmt"\n'
    '\t"strings"\n'
    '\t"time"\n\n'
    '\t"chatgpt2api/internal/backend"\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + body(770, 1073),
)

# --- image_result_format.go ---
write(
    "image_result_format.go",
    "package protocol\n\n"
    "import (\n"
    '\t"bytes"\n'
    '\t"fmt"\n'
    '\t"image"\n'
    '\t"image/color"\n'
    '\t"image/jpeg"\n'
    '\t"image/png"\n'
    '\t"os"\n'
    '\t"path/filepath"\n'
    '\t"strings"\n'
    '\t"time"\n\n'
    '\t"chatgpt2api/internal/util"\n\n'
    '\t"github.com/HugoSmits86/nativewebp"\n'
    ")\n\n"
    + body(1075, 1281),
)

# --- conversation_text.go ---
write(
    "conversation_text.go",
    "package protocol\n\n"
    "import (\n"
    '\t"encoding/json"\n'
    '\t"fmt"\n'
    '\t"regexp"\n'
    '\t"strings"\n\n'
    '\t"chatgpt2api/internal/service"\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + body(1283, 1349)
    + body(1465, n),
)

# --- conversation.go (core engine + events) ---
write(
    "conversation.go",
    "package protocol\n\n"
    "import (\n"
    '\t"context"\n'
    '\t"encoding/json"\n'
    '\t"fmt"\n'
    '\t"strings"\n'
    '\t"sync"\n'
    '\t"time"\n\n'
    '\t"chatgpt2api/internal/backend"\n'
    '\t"chatgpt2api/internal/service"\n'
    '\t"chatgpt2api/internal/storage"\n'
    '\t"chatgpt2api/internal/util"\n'
    ")\n\n"
    + body(45, 56)  # Engine struct
    + body(169, 208)
    + body(302, 476),
)

print("done, source lines was", n)
