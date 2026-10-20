"""Release metadata must stay in sync with the locked dependency set and VERSION.txt.

Regeneration when this fails: rebuild `sbom-runtime.json` from `requirements.lock`
(every `name==version` at column 0) and copy `VERSION.txt` into
`metadata.component.version`; keep the component list sorted by name.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
LOCK_FILE = SERVICE_ROOT / "requirements.lock"
REQUIREMENTS_FILE = SERVICE_ROOT / "requirements.txt"
SBOM_FILE = SERVICE_ROOT / "sbom-runtime.json"
VERSION_FILE = REPO_ROOT / "VERSION.txt"

_LOCK_PACKAGE = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s\\]+)")


def _normalise(name: str) -> str:
    return name.strip().lower().replace("_", "-")


def _locked_packages() -> dict[str, str]:
    packages: dict[str, str] = {}
    for line in LOCK_FILE.read_text(encoding="utf-8").splitlines():
        match = _LOCK_PACKAGE.match(line)
        if match:
            packages[_normalise(match.group(1))] = match.group(2)
    return packages


def _sbom() -> dict:
    return json.loads(SBOM_FILE.read_text(encoding="utf-8"))


def test_sbom_components_match_requirements_lock() -> None:
    locked = _locked_packages()
    assert locked, "requirements.lock parsed to an empty package set"
    components = {_normalise(item["name"]): item["version"] for item in _sbom()["components"]}
    assert components == locked


def test_sbom_version_matches_release_version() -> None:
    assert _sbom()["metadata"]["component"]["version"] == VERSION_FILE.read_text(
        encoding="utf-8"
    ).strip()


def test_requirements_lock_covers_every_direct_requirement() -> None:
    locked = _locked_packages()
    for raw in REQUIREMENTS_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        name, separator, version = line.partition("==")
        if not separator:
            continue
        requirement = _normalise(name.split("[", 1)[0])
        assert locked.get(requirement) == version.strip(), f"{requirement} is stale in requirements.lock"
