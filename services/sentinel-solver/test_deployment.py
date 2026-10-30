"""Static checks only: does not claim docker compose/runtime acceptance."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_private_solver_in_every_compose():
    for filename in ("docker-compose.yml", "docker-compose.local.yml", "docker-compose.warp.yml"):
        services = yaml.safe_load((ROOT / filename).read_text(encoding="utf-8"))["services"]
        solver = services["sentinel-solver"]
        assert not solver.get("ports")
        assert not solver.get("volumes")
        assert solver["mem_limit"] == "768m"
        assert solver["pids_limit"] == 256
        assert solver["environment"]["SENTINEL_SOLVER_KEY"].startswith("${CHATGPT2API_SENTINEL_SOLVER_KEY:?")
        app = services["app"]
        assert app["environment"]["CHATGPT2API_SENTINEL_SOLVER_URL"] == "http://sentinel-solver:8080"
        assert app["environment"]["CHATGPT2API_SENTINEL_SOLVER_KEY"] == solver["environment"]["SENTINEL_SOLVER_KEY"]
        assert app["depends_on"]["sentinel-solver"]["condition"] == "service_started"



    for filename in ("docker-compose.yml", "docker-compose.warp.yml"):
        services = yaml.safe_load((ROOT / filename).read_text(encoding="utf-8"))["services"]
        assert "SENTINEL_SOLVER_FLARESOLVERR_URL" in services["sentinel-solver"]["environment"]


def test_existing_production_project_and_egress_network_are_fixed():
    config = yaml.safe_load((ROOT / "deploy/production-v46.override.yml").read_text(encoding="utf-8"))
    assert config["name"] == "shengtu39prod"
    assert config["networks"]["default"] == {"external": True, "name": "shengtu39prod_default"}
    services = config["services"]
    assert not services["sentinel-solver"].get("ports")
    assert services["app"]["environment"]["CHATGPT2API_BIND_ADDR"] == "0.0.0.0"
    assert services["app"]["environment"]["CHATGPT2API_PROXY"] == services["sentinel-solver"]["environment"]["SENTINEL_SOLVER_PROXY"]
