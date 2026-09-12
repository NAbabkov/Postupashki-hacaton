#!/usr/bin/env python3
"""Collect only the HTML history exposed at https://t.me/s/<channel>."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

from lxml import etree, html


SOURCE_TYPE = "telegram_public_web"
USERNAME = re.compile(r"[A-Za-z0-9_]{5,32}\Z")


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def class_xpath(name):
    return "contains(concat(' ', normalize-space(@class), ' '), ' " + name + " ')"


def nodes_with_class(node, name):
    return node.xpath(".//*[" + class_xpath(name) + "]")


def visible_text(node):
    """Preserve <br>/block breaks without collecting HTML or hidden style data."""
    pieces = []

    def walk(element):
        if element.tag in {"script", "style"}:
            return
        if element.text:
            pieces.append(element.text)
        for child in element:
            if child.tag == "br":
                pieces.append("\n")
            else:
                walk(child)
            if child.tail:
                pieces.append(child.tail)
            if child.tag in {"div", "p", "li"}:
                pieces.append("\n")

    walk(node)
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in "".join(pieces).splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() or None


def public_url(href, source_url):
    if not href:
        return None
    result = urllib.parse.urljoin(source_url, href)
    return result if urllib.parse.urlsplit(result).scheme in {"http", "https", "tg"} else None


def parse_page(body, channel, source_url, collected_at):
    errors = []
    parser = html.HTMLParser(encoding="utf-8")
    root = html.document_fromstring(body, parser=parser)
    records = []
    for node in nodes_with_class(root, "tgme_widget_message"):
        key = node.get("data-post", "")
        match = re.fullmatch(re.escape(channel) + r"/(\d+)", key, flags=re.IGNORECASE)
        if not match:
            errors.append({"type": "invalid_post_identity", "data_post": key or None})
            continue
        message_id = int(match.group(1))
        dates = nodes_with_class(node, "tgme_widget_message_date")
        date_nodes = dates[0].xpath(".//time[@datetime]") if dates else []
        published_at = date_nodes[0].get("datetime") if date_nodes else None
        if published_at:
            try:
                parsed = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    raise ValueError("timezone absent")
            except ValueError as exc:
                errors.append({"type": "invalid_date", "message_id": message_id, "raw": published_at, "detail": str(exc)})
                published_at = None
        else:
            errors.append({"type": "missing_date", "message_id": message_id})
        text_nodes = nodes_with_class(node, "tgme_widget_message_text")
        text_parts = [visible_text(part) for part in text_nodes]
        text = "\n\n".join(part for part in text_parts if part) or None
        # Include links actually present in visible body, preview or document anchors.
        link_nodes = []
        for part in text_nodes + nodes_with_class(node, "tgme_widget_message_link_preview"):
            if part.tag == "a":
                link_nodes.append(part)
            link_nodes.extend(part.xpath(".//a[@href]"))
        link_nodes.extend(node.xpath(".//a[@href and " + class_xpath("tgme_widget_message_document_wrap") + "]"))
        links = list(dict.fromkeys(url for item in link_nodes if (url := public_url(item.get("href"), source_url))))
        forwards = nodes_with_class(node, "tgme_widget_message_forwarded_from")
        forwarded_links = forwards[0].xpath(".//a[@href]") if forwards else []
        forwarded_from_url = public_url(forwarded_links[0].get("href"), source_url) if forwarded_links else None
        views = nodes_with_class(node, "tgme_widget_message_views")
        records.append({
            "channel_username": channel,
            "message_id": message_id,
            "post_url": f"https://t.me/{channel}/{message_id}",
            "published_at": published_at,
            "text": text,
            "links": links,
            "forwarded_from_url": forwarded_from_url,
            "views_raw": visible_text(views[0]) if views else None,
            "collected_at": collected_at,
            "source_type": SOURCE_TYPE,
            "source_url": source_url,
        })
    next_url = None
    nav_nodes = root.xpath(".//a[@href and " + class_xpath("tme_messages_more") + "]")
    for anchor in nav_nodes:
        observed = urllib.parse.urljoin(source_url, anchor.get("href"))
        parsed_url = urllib.parse.urlsplit(observed)
        query = urllib.parse.parse_qs(parsed_url.query)
        before = query.get("before", [])
        if (parsed_url.scheme == "https" and parsed_url.netloc == "t.me"
                and parsed_url.path.lower() == f"/s/{channel}".lower()
                and len(before) == 1 and before[0].isdigit() and int(before[0]) > 0
                and set(query) == {"before"}):
            next_url = observed
            break
        errors.append({"type": "unsupported_observed_navigation", "href": anchor.get("href")})
    return records, next_url, errors, bool(nav_nodes)


def fetch_public(source_url, timeout):
    request = urllib.request.Request(source_url, headers={"User-Agent": "PostupashkiPublicHistoryPrototype/0.1", "Accept": "text/html"})
    collected_at = utc_now()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(10 * 1024 * 1024 + 1)
            if len(body) > 10 * 1024 * 1024:
                raise ValueError("response exceeds 10 MiB")
            return body, {"source_url": source_url, "final_url": response.url,
                          "http_status": response.status, "content_type": response.headers.get("Content-Type"),
                          "collected_at": collected_at, "http_error": None}
    except urllib.error.HTTPError as exc:
        return exc.read(10 * 1024 * 1024), {"source_url": source_url, "final_url": exc.url,
                "http_status": exc.code, "content_type": exc.headers.get("Content-Type"),
                "collected_at": collected_at, "http_error": str(exc)}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        return None, {"source_url": source_url, "final_url": None, "http_status": None,
                "content_type": None, "collected_at": collected_at, "http_error": f"{type(exc).__name__}: {exc}"}


def dump_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path, rows):
    with path.open("w", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def in_range(row, start, end):
    if row["published_at"] is None:
        return False
    day = datetime.fromisoformat(row["published_at"].replace("Z", "+00:00")).astimezone(timezone.utc).date()
    return start <= day <= end


def collect(args):
    args.out.mkdir(parents=True, exist_ok=False)
    raw_dir = args.out / "raw"
    raw_dir.mkdir()
    replay_pages = {}
    if args.replay:
        previous = json.loads((args.replay / "coverage.json").read_text(encoding="utf-8"))
        if previous["channel_username"] != args.channel:
            raise ValueError("replay channel does not match requested channel")
        replay_pages = {page["source_url"]: page for page in previous["pages"]}
    source_url = f"https://t.me/s/{args.channel}"
    visited, records, pages, errors = set(), {}, [], []
    duplicates = 0
    navigation_exhausted = False
    lower_bound_reached = False
    stop_reason = "max_pages"
    for page_number in range(1, args.max_pages + 1):
        if source_url in visited:
            errors.append({"type": "navigation_cycle", "source_url": source_url})
            stop_reason = "navigation_cycle"
            break
        visited.add(source_url)
        if args.replay:
            original = replay_pages.get(source_url)
            if original is None:
                errors.append({"type": "replay_page_unavailable", "source_url": source_url})
                stop_reason = "replay_page_unavailable"
                break
            body = (args.replay / original["raw_file"]).read_bytes() if original.get("raw_file") else None
            meta = {field: original.get(field) for field in ("source_url", "final_url", "http_status", "content_type", "collected_at", "http_error")}
        else:
            body, meta = fetch_public(source_url, args.timeout)
        meta.update({"page_number": page_number, "raw_file": None, "sha256": None,
                     "parsed_posts": 0, "new_unique_posts": 0, "next_source_url": None,
                     "seen_min_published_at": None, "seen_max_published_at": None, "parse_errors": []})
        if body is not None:
            raw_path = raw_dir / f"page_{page_number:03d}.html"
            raw_path.write_bytes(body)
            meta["raw_file"] = raw_path.relative_to(args.out).as_posix()
            meta["sha256"] = hashlib.sha256(body).hexdigest()
        pages.append(meta)
        if meta["http_error"]:
            errors.append({"type": "http_error", "source_url": source_url, "detail": meta["http_error"]})
            stop_reason = "http_error"
            dump_json(raw_dir / f"page_{page_number:03d}.meta.json", meta)
            print(f"page {page_number}: HTTP/network error: {meta['http_error']}", file=sys.stderr)
            break
        try:
            final = urllib.parse.urlsplit(meta["final_url"] or "")
            if final.netloc != "t.me" or final.path.lower() != f"/s/{args.channel}".lower():
                raise ValueError(f"public history redirected away from expected channel: {meta['final_url']}")
            if "html" not in (meta["content_type"] or "").lower():
                raise ValueError(f"unexpected content type: {meta['content_type']}")
            found, next_url, parse_errors, had_nav = parse_page(body, args.channel, source_url, meta["collected_at"])
            meta["parse_errors"] = parse_errors
            errors.extend({**item, "source_url": source_url} for item in parse_errors)
            meta["parsed_posts"] = len(found)
            meta["next_source_url"] = next_url
            dates = sorted((row["published_at"] for row in found if row["published_at"] is not None), key=datetime.fromisoformat)
            meta["seen_min_published_at"] = dates[0] if dates else None
            meta["seen_max_published_at"] = dates[-1] if dates else None
            for row in found:
                key = (row["channel_username"], row["message_id"])
                if key in records:
                    duplicates += 1
                else:
                    records[key] = row
                    meta["new_unique_posts"] += 1
            if not found:
                errors.append({"type": "no_public_post_containers", "source_url": source_url})
                stop_reason = "no_public_posts"
            elif next_url is None:
                navigation_exhausted = not had_nav
                stop_reason = "observed_navigation_exhausted" if navigation_exhausted else "unsupported_navigation"
            elif dates and not parse_errors and max(datetime.fromisoformat(value).astimezone(timezone.utc).date() for value in dates) < args.start:
                lower_bound_reached = True
                stop_reason = "requested_lower_bound_reached"
            else:
                source_url = next_url
        except (etree.ParserError, etree.XMLSyntaxError, ValueError, TypeError) as exc:
            errors.append({"type": "parse_error", "source_url": source_url, "detail": f"{type(exc).__name__}: {exc}"})
            meta["parse_errors"].append(errors[-1])
            stop_reason = "parse_error"
        dump_json(raw_dir / f"page_{page_number:03d}.meta.json", meta)
        print(f"page {page_number}: {meta['parsed_posts']} containers, {meta['new_unique_posts']} new; {meta['seen_min_published_at']} .. {meta['seen_max_published_at']}", file=sys.stderr)
        if stop_reason != "max_pages":
            break
        if not args.replay and page_number < args.max_pages:
            time.sleep(args.delay)
    observed = sorted(records.values(), key=lambda row: row["message_id"])
    selected = [row for row in observed if in_range(row, args.start, args.end)]
    dates = sorted((row["published_at"] for row in observed if row["published_at"]), key=datetime.fromisoformat)
    ids = sorted(row["message_id"] for row in observed)
    discontinuities = [{"after_message_id": left, "before_message_id": right, "missing_id_count": right - left - 1,
                        "reason": "unknown: grouped media, unavailable/deleted posts or other Telegram numbering"}
                       for left, right in zip(ids, ids[1:]) if right > left + 1]
    coverage = {
        "schema_version": 1, "data_origin": "real_public_telegram_html" if observed else "no_observed_public_posts", "source_type": SOURCE_TYPE,
        "channel_username": args.channel, "mode": "offline_replay" if args.replay else "live_http",
        "replay_from": str(args.replay.resolve()) if args.replay else None,
        "started_at": args.started_at, "finished_at": utc_now(),
        "requested_range": {"start": args.start.isoformat(), "end": args.end.isoformat(), "date_timezone": "UTC", "inclusive": True},
        "max_pages": args.max_pages, "pages_requested": len(pages), "pages_saved": sum(page["raw_file"] is not None for page in pages),
        "seen_min_published_at": dates[0] if dates else None, "seen_max_published_at": dates[-1] if dates else None,
        "unique_observed_posts": len(observed), "posts_in_requested_range": len(selected),
        "undated_posts": sum(row["published_at"] is None for row in observed), "duplicate_containers": duplicates,
        "observed_older_navigation_exhausted": navigation_exhausted,
        "requested_lower_bound_reached": lower_bound_reached,
        "stop_reason": stop_reason, "unfollowed_observed_next_url": pages[-1]["next_source_url"] if pages else None,
        "full_archive_claimed": False, "gaps": "unknown", "observed_id_discontinuities": discontinuities,
        "errors": errors, "pages": pages,
        "limitations": ["Only posts/fields exposed by Telegram public web HTML were observed.",
                        "Missing IDs do not prove deleted posts; grouped media also uses IDs.",
                        "No account/session, private channels, chat history or attachments were accessed.",
                        "views_raw is a rounded aggregate counter, not clicks or individual visits.",
                        "Posts and counters can change; this snapshot does not attribute buyers or advertising effects."],
    }
    write_jsonl(args.out / "observed_posts.jsonl", observed)
    write_jsonl(args.out / "posts.jsonl", selected)
    dump_json(args.out / "coverage.json", coverage)
    print(json.dumps({"output": str(args.out.resolve()), "observed": len(observed), "in_range": len(selected), "stop_reason": stop_reason, "errors": len(errors)}, ensure_ascii=False))
    return 2 if errors else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channel", required=True, help="public channel username, optionally @username")
    parser.add_argument("--start", type=date.fromisoformat, required=True, help="inclusive YYYY-MM-DD, UTC")
    parser.add_argument("--end", type=date.fromisoformat, required=True, help="inclusive YYYY-MM-DD, UTC")
    parser.add_argument("--max-pages", type=int, default=6)
    parser.add_argument("--out", type=Path, help="new output directory; existing directories are refused")
    parser.add_argument("--replay", type=Path, help="reparse raw HTML from a previous run, without network")
    parser.add_argument("--timeout", type=float, default=25)
    parser.add_argument("--delay", type=float, default=0.6, help="seconds between HTTP requests")
    args = parser.parse_args()
    args.channel = args.channel.lstrip("@").lower()
    if not USERNAME.fullmatch(args.channel):
        parser.error("invalid public channel username")
    if args.start > args.end or args.max_pages < 1 or args.timeout <= 0 or args.delay < 0:
        parser.error("require start <= end, max-pages >= 1, timeout > 0 and delay >= 0")
    args.started_at = utc_now()
    args.out = args.out or Path(__file__).parent / "data" / (args.channel + "_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ"))
    if args.out.exists():
        parser.error("output directory already exists; choose a new --out")
    try:
        return collect(args)
    except (OSError, ValueError, KeyError) as exc:
        print(f"collector setup/output error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
