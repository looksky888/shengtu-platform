from runtime.account_capabilities import enrich_account_capabilities, media_candidate


def test_basic_account_is_image_candidate_but_not_video_candidate() -> None:
    item = enrich_account_capabilities(
        {
            "pool": "basic",
            "runtime_status": "active",
            "quota": {"auto": {"remaining": 8, "total": 10}},
        }
    )
    assert media_candidate(item, "image") is True
    assert media_candidate(item, "video") is False
    assert item["capabilities"]["video"]["reason"] == "tier_not_supported"


def test_super_account_is_video_candidate_when_video_quota_is_unknown() -> None:
    item = enrich_account_capabilities(
        {
            "pool": "super",
            "runtime_status": "active",
            "quota": {"auto": {"remaining": 8, "total": 10}},
        }
    )
    assert media_candidate(item, "video") is True
    assert item["media_quota"]["video"]["status"] == "unknown"


def test_video_quota_exhaustion_does_not_disable_image_candidate() -> None:
    item = enrich_account_capabilities(
        {
            "pool": "super",
            "runtime_status": "active",
            "quota": {"auto": {"remaining": 8, "total": 10}},
            "media_quota": {
                "video": {"remaining": 0, "total": 5, "status": "exhausted"}
            },
        }
    )
    assert media_candidate(item, "image") is True
    assert media_candidate(item, "video") is False


def test_invalid_account_is_excluded_from_all_media_candidates() -> None:
    item = enrich_account_capabilities(
        {
            "pool": "super",
            "runtime_status": "invalid",
            "quota": {"auto": {"remaining": 8, "total": 10}},
        }
    )
    assert media_candidate(item, "image") is False
    assert media_candidate(item, "video") is False
    assert item["account_health"]["state"] == "invalid"
