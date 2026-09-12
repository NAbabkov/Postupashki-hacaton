#!/usr/bin/env python3
"""Check a saved snapshot's provenance and invariants; optionally compare a replay."""

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urljoin


REQUIRED = {"channel_username", "message_id", "post_url", "published_at", "text", "links",
            "forwarded_from_url", "views_raw", "collected_at", "source_type", "source_url"}


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def verify(path):
    coverage = json.loads((path / "coverage.json").read_text(encoding="utf-8"))
    observed, selected = read_jsonl(path / "observed_posts.jsonl"), read_jsonl(path / "posts.jsonl")
    keys = [(row["channel_username"], row["message_id"]) for row in observed]
    assert len(keys) == len(set(keys)), "duplicate channel/message ID"
    assert len(observed) == coverage["unique_observed_posts"]
    assert len(selected) == coverage["posts_in_requested_range"]
    assert coverage["gaps"] == "unknown" and coverage["full_archive_claimed"] is False
    raw_sources = {}
    for page in coverage["pages"]:
        if not page["raw_file"]:
            continue
        raw = (path / page["raw_file"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == page["sha256"], "raw snapshot hash changed"
        text = raw.decode("utf-8")
        raw_sources[page["source_url"]] = (page, text)
        if page["next_source_url"]:
            # The navigation URL must originate in an actual HTML href.
            hrefs = [urljoin(page["source_url"], unescape(href)) for href in re.findall(r'href="([^"]+)"', text)]
            assert page["next_source_url"] in hrefs, "invented pagination"
    for row in observed:
        assert set(row) == REQUIRED, "unexpected/missing record fields"
        assert row["channel_username"] == coverage["channel_username"]
        assert isinstance(row["message_id"], int) and row["message_id"] > 0
        assert row["post_url"] == f"https://t.me/{row['channel_username']}/{row['message_id']}"
        assert row["source_type"] == "telegram_public_web"
        assert row["text"] is None or isinstance(row["text"], str) and row["text"].strip()
        assert row["views_raw"] is None or isinstance(row["views_raw"], str) and row["views_raw"].strip()
        assert row["forwarded_from_url"] is None or isinstance(row["forwarded_from_url"], str)
        assert isinstance(row["links"], list) and len(row["links"]) == len(set(row["links"]))
        assert datetime.fromisoformat(row["collected_at"]).tzinfo is not None
        page, raw = raw_sources[row["source_url"]]
        assert row["collected_at"] == page["collected_at"]
        identity = f"{row['channel_username']}/{row['message_id']}"
        assert f'data-post="{identity}"' in raw, "record identity absent from raw HTML"
        if row["published_at"]:
            assert datetime.fromisoformat(row["published_at"]).tzinfo is not None
            assert f'datetime="{row["published_at"]}"' in raw, "date absent from raw HTML"
        actual_hrefs = {urljoin(row["source_url"], unescape(href)) for href in re.findall(r'href="([^"]+)"', raw)}
        assert all(link in actual_hrefs for link in row["links"]), "link absent from raw HTML"
        if row["forwarded_from_url"]:
            assert row["forwarded_from_url"] in actual_hrefs
    requested = coverage["requested_range"]
    expected = [row for row in observed if row["published_at"] and requested["start"] <=
                datetime.fromisoformat(row["published_at"]).astimezone(timezone.utc).date().isoformat() <= requested["end"]]
    assert selected == expected, "range filtering inconsistent with inclusive UTC dates"
    print(json.dumps({"snapshot": str(path.resolve()), "validated_observed": len(observed), "validated_selected": len(selected),
                      "validated_raw_pages": len(raw_sources), "null_text_posts": sum(row["text"] is None for row in observed),
                      "undated_posts": sum(row["published_at"] is None for row in observed), "coverage_errors": len(coverage["errors"])}, ensure_ascii=False))
    return observed, selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--compare-replay", type=Path)
    args = parser.parse_args()
    original = verify(args.snapshot)
    if args.compare_replay:
        replay = verify(args.compare_replay)
        assert original == replay, "replay changed observed/selected records"
        print("Offline replay is identical for both JSONL files.")


if __name__ == "__main__":
    main()
