#!/usr/bin/env python3
"""
scrape_onepiece_episodes_minimal.py

Scrape One Piece Fandom episode pages into per-episode JSON files, keeping ONLY:

Top-level fields:
- episode_number
- title
- url
- page_id
- revid
- categories
- infobox
- sections

Infobox:
- title
- items filtered to data_source (or label fallback):
  - Kanji
  - Romaji
  - Airdate
  - format
  - charDebut
  - techDebut

Sections (only these headings):
- Characters in Order of Appearance
- Short Summary
- Long Summary

Usage:
  pip install requests beautifulsoup4 lxml
  python scrape_onepiece_episodes_minimal.py --outdir ./out --sleep 1.0
  python scrape_onepiece_episodes_minimal.py --start-episode 1 --end-episode 50 --outdir ./out
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup, Tag
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

EP_TITLE_RE = re.compile(r"^Episode\s+(\d+)$", re.IGNORECASE)

ALLOWED_SECTION_HEADINGS = {
    "characters in order of appearance",
    "short summary",
    "long summary",
}

ALLOWED_INFOBOX_KEYS = {
    "kanji",
    "romaji",
    "airdate",
    "format",
    "chardebut",
    "techdebut",
}


@dataclass(frozen=True)
class EpisodeRef:
    number: int
    title: str


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _normalize(s: str) -> str:
    return " ".join((s or "").strip().lower().split())


def _extract_text(el: Tag) -> str:
    return " ".join(el.stripped_strings)


def _extract_links(el: Tag) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for a in el.find_all("a", href=True):
        out.append({"text": _extract_text(a) or "", "href": a.get("href") or ""})
    return out


def _build_session(user_agent: str, timeout_s: float) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": user_agent,
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
        }
    )
    retry = Retry(
        total=6,
        connect=6,
        read=6,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session._cc_timeout_s = timeout_s  # type: ignore[attr-defined]
    return session


def _get_timeout(session: requests.Session) -> float:
    return float(getattr(session, "_cc_timeout_s", 30.0))


def _api_get(session: requests.Session, api_url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    r = session.get(api_url, params=params, timeout=_get_timeout(session))
    r.raise_for_status()
    return r.json()


def list_episode_pages_allpages(
    session: requests.Session,
    api_url: str,
    prefix: str = "Episode ",
    limit: int = 500,
) -> List[EpisodeRef]:
    episodes: List[EpisodeRef] = []
    apcontinue: Optional[str] = None

    while True:
        params: Dict[str, Any] = {
            "action": "query",
            "format": "json",
            "list": "allpages",
            "apnamespace": 0,
            "apprefix": prefix,
            "aplimit": min(limit, 500),
            "formatversion": 2,
        }
        if apcontinue:
            params["apcontinue"] = apcontinue

        data = _api_get(session, api_url, params)
        pages = data.get("query", {}).get("allpages", []) or []

        for p in pages:
            title = (p.get("title") or "").strip()
            m = EP_TITLE_RE.match(title)
            if not m:
                continue
            episodes.append(EpisodeRef(number=int(m.group(1)), title=title))

        apcontinue = (data.get("continue", {}) or {}).get("apcontinue")
        if not apcontinue:
            break

    episodes.sort(key=lambda e: e.number)
    return episodes


def fetch_episode_parse(session: requests.Session, api_url: str, title: str) -> Dict[str, Any]:
    params = {
        "action": "parse",
        "format": "json",
        "page": title,
        "prop": "text|categories",
        "redirects": 1,
        "formatversion": 2,
    }
    return _api_get(session, api_url, params)


def parse_portable_infobox_minimal(soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
    aside = soup.find("aside", class_=lambda c: isinstance(c, str) and "portable-infobox" in c)
    if not aside:
        return None

    title_el = aside.find(["h2", "h3"])
    infobox_title = _extract_text(title_el) if isinstance(title_el, Tag) else ""

    items: List[Dict[str, Any]] = []
    for item in aside.find_all("div", class_=lambda c: isinstance(c, str) and "pi-item" in c):
        if not isinstance(item, Tag):
            continue

        data_source = (item.get("data-source") or "").strip()
        label_el = item.find(["h3", "div"], class_=lambda c: isinstance(c, str) and "pi-data-label" in c)
        value_el = item.find("div", class_=lambda c: isinstance(c, str) and "pi-data-value" in c)

        label = _extract_text(label_el) if isinstance(label_el, Tag) else ""
        key_norm = _normalize(data_source) or _normalize(label)

        if key_norm not in ALLOWED_INFOBOX_KEYS:
            continue

        value_text = _extract_text(value_el) if isinstance(value_el, Tag) else ""
        value_html = str(value_el) if isinstance(value_el, Tag) else ""
        links = _extract_links(value_el) if isinstance(value_el, Tag) else []

        items.append(
            {
                "data_source": data_source,
                "label": label,
                "value_text": value_text,
                "value_html": value_html,
                "links": links,
            }
        )

    return {"title": infobox_title, "items": items}


def parse_sections_minimal(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    root = soup.find("div", class_="mw-parser-output")
    if not isinstance(root, Tag):
        return []

    def heading_text(h: Tag) -> str:
        hl = h.find("span", class_="mw-headline")
        return _extract_text(hl) if isinstance(hl, Tag) else _extract_text(h)

    linear: List[Dict[str, Any]] = []
    cur: Dict[str, Any] = {"heading": "Lead", "level": 1, "blocks_html": []}

    for child in list(root.children):
        if not isinstance(child, Tag):
            continue

        if child.name in ("h2", "h3", "h4", "h5", "h6"):
            if cur["blocks_html"]:
                linear.append(cur)
            cur = {
                "heading": heading_text(child),
                "level": int(child.name[1]),
                "blocks_html": [],
            }
            continue

        if child.name in ("p", "ul", "ol", "dl", "table", "blockquote", "div"):
            cur["blocks_html"].append(str(child))

    if cur["blocks_html"]:
        linear.append(cur)

    out: List[Dict[str, Any]] = []
    for s in linear:
        if _normalize(s["heading"]) not in ALLOWED_SECTION_HEADINGS:
            continue

        html_blob = "\n".join(s["blocks_html"])
        sec_soup = BeautifulSoup(html_blob, "lxml")
        for tag in sec_soup(["script", "style", "noscript"]):
            tag.decompose()

        out.append(
            {
                "heading": s["heading"],
                "level": s["level"],
                "html": html_blob,
                "text": " ".join(sec_soup.stripped_strings),
            }
        )

    return out


def parse_episode_minimal(title: str, payload: Dict[str, Any], base_wiki_url: str) -> Dict[str, Any]:
    if "error" in payload:
        return {"title": title, "error": payload["error"]}

    page = payload.get("parse") or {}
    html = (page.get("text") or "") if isinstance(page, dict) else ""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    m = EP_TITLE_RE.match(title)
    episode_number = int(m.group(1)) if m else None

    url_title = title.replace(" ", "_")
    page_url = f"{base_wiki_url}/wiki/{url_title}"

    categories = [c.get("category") for c in (page.get("categories") or []) if isinstance(c, dict)]

    return {
        "episode_number": episode_number,
        "title": title,
        "url": page_url,
        "page_id": page.get("pageid"),
        "revid": page.get("revid"),
        "categories": categories,
        "infobox": parse_portable_infobox_minimal(soup),
        "sections": parse_sections_minimal(soup),
    }


def write_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Scrape One Piece episode pages into minimal per-episode JSON.")
    p.add_argument("--api-url", default="https://onepiece.fandom.com/api.php")
    p.add_argument("--base-wiki-url", default="https://onepiece.fandom.com")
    p.add_argument("--outdir", default="./onepiece_episodes_json")
    p.add_argument("--sleep", type=float, default=1.0)
    p.add_argument("--timeout", type=float, default=30.0)
    p.add_argument(
        "--user-agent",
        default="OnePieceEpisodeScraper/2.0 (research; contact: you@example.com)",
        help="Set a real UA; be polite.",
    )
    p.add_argument("--start-episode", type=int, default=None)
    p.add_argument("--end-episode", type=int, default=None)
    p.add_argument("--max-episodes", type=int, default=None)
    p.add_argument("--overwrite", action="store_true")
    args = p.parse_args(argv)

    _ensure_dir(args.outdir)
    session = _build_session(args.user_agent, args.timeout)

    episodes = list_episode_pages_allpages(session, args.api_url)

    if args.start_episode is not None:
        episodes = [e for e in episodes if e.number >= args.start_episode]
    if args.end_episode is not None:
        episodes = [e for e in episodes if e.number <= args.end_episode]
    if args.max_episodes is not None:
        episodes = episodes[: max(args.max_episodes, 0)]

    if not episodes:
        print("No episode pages found after filtering.", file=sys.stderr)
        return 2

    index: List[Dict[str, Any]] = []
    total = len(episodes)

    for i, ep in enumerate(episodes, start=1):
        filename = f"Episode_{ep.number}.json"
        out_path = os.path.join(args.outdir, filename)

        if os.path.exists(out_path) and not args.overwrite:
            index.append({"episode_number": ep.number, "title": ep.title, "file": filename, "skipped": True})
            continue

        try:
            payload = fetch_episode_parse(session, args.api_url, ep.title)
            data = parse_episode_minimal(ep.title, payload, args.base_wiki_url)
            write_json(out_path, data)
            index.append({"episode_number": ep.number, "title": ep.title, "file": filename, "skipped": False})
        except Exception as e:
            index.append({"episode_number": ep.number, "title": ep.title, "file": filename, "error": repr(e)})

        if i < total and args.sleep > 0:
            time.sleep(args.sleep)

    write_json(os.path.join(args.outdir, "episodes_index.json"), index)
    print(f"Done. Wrote {len(index)} entries to {args.outdir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
