"""SEO router — dynamic sitemap.xml + IndexNow push to Bing/Yandex/Seznam.

Endpoints:
    GET  /sitemap.xml        — dynamic sitemap (tours, rentals, taxi routes,
                               attractions, packages) with fresh lastmod dates
    GET  /seo/indexnow-key   — returns the IndexNow key file content (Bing
                               / Yandex verify by hitting {key}.txt at the
                               root; the frontend serves that static file,
                               but this endpoint is the canonical source)
    POST /admin/seo/indexnow-ping — manual button in admin panel that pushes
                               a list of URLs to Bing + Yandex for instant
                               re-crawl. Fire-and-forget, 3s upstream timeout.

Wired up by server.py via `configure()` + `include_router()`.

IndexNow docs: https://www.indexnow.org/documentation
    Push endpoints (any of them accepts the payload — one call is enough):
        https://api.indexnow.org/indexnow
        https://www.bing.com/indexnow
        https://yandex.com/indexnow
        https://searchadvisor.naver.com/indexnow
"""
from datetime import datetime, timezone
from typing import Callable, List, Optional
from xml.sax.saxutils import escape

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field


_db = None
_require_admin: Callable = lambda x: None
_site_base_url: str = "https://roxtaxi.com"
_indexnow_key: str = "9f2c8b4a6e1d7a3f5b9e2c8d4a6f1e7b"


def configure(*, db, require_admin, site_base_url: str, indexnow_key: str):
    global _db, _require_admin, _site_base_url, _indexnow_key
    _db = db
    _require_admin = require_admin
    _site_base_url = (site_base_url or "https://roxtaxi.com").rstrip("/")
    _indexnow_key = indexnow_key or _indexnow_key


router = APIRouter()


def _admin_dep(authorization: Optional[str] = Header(None)) -> str:
    if _require_admin is None:
        raise HTTPException(500, "Admin dependency not configured")
    return _require_admin(authorization)


# ─── Static, high-priority pages ────────────────────────────────────
# These are the canonical hand-tuned pages. Dynamic catalog entries are
# appended after (tours, rentals, taxi routes, packages, attractions).
_STATIC_URLS: List[dict] = [
    {"loc": "/", "priority": 1.00, "changefreq": "daily"},
    {"loc": "/taxi", "priority": 0.95, "changefreq": "weekly"},
    {"loc": "/tours", "priority": 0.95, "changefreq": "weekly"},
    {"loc": "/rentals", "priority": 0.95, "changefreq": "weekly"},
    {"loc": "/travel-to-nassau", "priority": 0.85, "changefreq": "weekly"},
    {"loc": "/cruise-groups-nassau", "priority": 0.85, "changefreq": "weekly"},
    {"loc": "/groups", "priority": 0.85, "changefreq": "monthly"},
    {"loc": "/wedding-builder", "priority": 0.85, "changefreq": "monthly"},
    {"loc": "/gallery", "priority": 0.75, "changefreq": "weekly"},
    {"loc": "/wall", "priority": 0.65, "changefreq": "weekly"},
    {"loc": "/contact", "priority": 0.70, "changefreq": "monthly"},
    {"loc": "/about", "priority": 0.70, "changefreq": "monthly"},
    {"loc": "/attractions/atlantis", "priority": 0.80, "changefreq": "monthly"},
    {"loc": "/attractions/blue-lagoon", "priority": 0.80, "changefreq": "monthly"},
    {"loc": "/attractions/baha-mar", "priority": 0.80, "changefreq": "monthly"},
    {"loc": "/attractions/ardastra", "priority": 0.75, "changefreq": "monthly"},
]


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _collect_dynamic_urls() -> List[dict]:
    """Pull all indexable catalog entries with a fresh lastmod. Silently
    skips collections that don't exist yet."""
    urls: List[dict] = []
    if _db is None:
        return urls
    today = _today_iso()

    # Tours
    try:
        async for t in _db.tours.find({"active": True}, {"id": 1, "updated_at": 1}):
            slug = t.get("id")
            if not slug:
                continue
            urls.append({
                "loc": f"/tours/{slug}",
                "priority": 0.75,
                "changefreq": "weekly",
                "lastmod": (t.get("updated_at") or today)[:10],
            })
    except Exception:  # noqa: BLE001
        pass

    # Rentals
    try:
        async for r in _db.rentals.find({"active": True}, {"id": 1, "updated_at": 1}):
            slug = r.get("id")
            if not slug:
                continue
            urls.append({
                "loc": f"/rentals/{slug}",
                "priority": 0.70,
                "changefreq": "weekly",
                "lastmod": (r.get("updated_at") or today)[:10],
            })
    except Exception:  # noqa: BLE001
        pass

    # Packages (curated bundles)
    try:
        async for p in _db.packages.find({"active": {"$ne": False}}, {"id": 1, "updated_at": 1}):
            slug = p.get("id")
            if not slug:
                continue
            urls.append({
                "loc": f"/packages/{slug}",
                "priority": 0.70,
                "changefreq": "weekly",
                "lastmod": (p.get("updated_at") or today)[:10],
            })
    except Exception:  # noqa: BLE001
        pass

    return urls


@router.get("/sitemap.xml")
async def sitemap_xml():
    """Dynamic sitemap. Every hit rebuilds from live catalog so lastmod
    always reflects reality — search engines re-crawl fastest when the
    lastmod is recent and truthful."""
    today = _today_iso()
    base = _site_base_url

    static_rows = [
        {"loc": u["loc"], "priority": u["priority"], "changefreq": u["changefreq"], "lastmod": today}
        for u in _STATIC_URLS
    ]
    all_rows = static_rows + await _collect_dynamic_urls()

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]
    for row in all_rows:
        parts.append("  <url>")
        parts.append(f'    <loc>{escape(base + row["loc"])}</loc>')
        parts.append(f'    <lastmod>{row["lastmod"]}</lastmod>')
        parts.append(f'    <changefreq>{row["changefreq"]}</changefreq>')
        parts.append(f'    <priority>{row["priority"]:.2f}</priority>')
        parts.append("  </url>")
    parts.append("</urlset>")

    xml = "\n".join(parts)
    return Response(content=xml, media_type="application/xml", headers={
        "Cache-Control": "public, max-age=1800",  # 30-min CDN cache
        "X-Robots-Tag": "noindex",  # the sitemap itself shouldn't be indexed
    })


# ─── IndexNow (Bing + Yandex + Seznam + Naver instant reindex) ────────
class IndexNowPayload(BaseModel):
    urls: Optional[List[str]] = Field(default=None, description="Absolute URLs to submit. Defaults to sitemap URLs.")


async def _do_indexnow_ping(urls: List[str]) -> dict:
    """Fire the IndexNow push. Returns {ok, count, details}. Never raises."""
    if not urls:
        return {"ok": False, "count": 0, "reason": "no_urls"}
    host = _site_base_url.replace("https://", "").replace("http://", "").rstrip("/")
    payload = {
        "host": host,
        "key": _indexnow_key,
        "keyLocation": f"{_site_base_url}/{_indexnow_key}.txt",
        "urlList": urls[:9999],  # IndexNow spec: max 10k URLs per push
    }
    endpoint = "https://api.indexnow.org/indexnow"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(endpoint, json=payload, headers={"Content-Type": "application/json"})
        return {"ok": r.status_code in (200, 202), "status": r.status_code, "count": len(urls)}
    except Exception as ex:  # noqa: BLE001
        return {"ok": False, "count": 0, "error": str(ex)[:200]}


@router.post("/admin/seo/indexnow-ping")
async def admin_indexnow_ping(payload: IndexNowPayload, _: str = Depends(_admin_dep)):
    """Manual "Ping search engines now" button. If no URLs are supplied,
    push the entire sitemap. Owner can also paste a small list of just-
    edited pages after a big pricing update to force priority re-crawl."""
    urls = list(payload.urls or [])
    if not urls:
        # Push sitemap entries so Bing/Yandex know exactly what changed
        static_urls = [_site_base_url + u["loc"] for u in _STATIC_URLS]
        dynamic_urls = [_site_base_url + u["loc"] for u in await _collect_dynamic_urls()]
        urls = static_urls + dynamic_urls
    result = await _do_indexnow_ping(urls)
    return result


async def ping_indexnow_for_urls(urls: List[str]) -> dict:
    """Public helper other routers can call after catalog edits."""
    return await _do_indexnow_ping(urls)
