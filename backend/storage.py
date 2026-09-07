"""Emergent Object Storage wrapper.

Uploads go to the platform's persistent object store (per the object
storage playbook) instead of pod-local `/tmp` which is wiped between
deploys. Downloads fall back through this module too so legacy URLs
keep working.

Init once at startup via `init_storage()`; every put/get reuses the
cached `storage_key`. On 403/404 we auto-force-reinit exactly once
(the playbook's recovery pattern for a dead session key).
"""
import logging
import os
import threading
from typing import Optional, Tuple

import requests

log = logging.getLogger("storage")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "roxtaxi"  # namespaces every object

_storage_key: Optional[str] = None
_lock = threading.Lock()


def init_storage(force: bool = False) -> Optional[str]:
    """Get (or mint) a session-scoped storage_key. Safe to call from
    request paths — the first caller mints, everyone else gets the
    cached key. Returns None if the platform declines to provision
    (e.g. missing key) so callers can fall back to local disk."""
    global _storage_key
    with _lock:
        if _storage_key and not force:
            return _storage_key
        if not EMERGENT_KEY:
            log.warning("EMERGENT_LLM_KEY not set — object storage disabled")
            return None
        try:
            resp = requests.post(
                f"{STORAGE_URL}/init",
                json={"emergent_key": EMERGENT_KEY},
                timeout=30,
            )
            resp.raise_for_status()
            _storage_key = resp.json().get("storage_key")
            log.info("object storage initialized (key=%s…)", (_storage_key or "")[:8])
            return _storage_key
        except Exception as ex:  # noqa: BLE001
            log.warning("object storage init failed: %s", ex)
            _storage_key = None
            return None


def _object_path(name: str) -> str:
    """Map an upload filename onto its object-store path."""
    return f"{APP_NAME}/uploads/{name.lstrip('/')}"


def put_object(name: str, data: bytes, content_type: str) -> bool:
    """Upload bytes. Returns True on success, False if storage is
    unavailable (caller can fall back to disk)."""
    key = init_storage()
    if not key:
        return False
    path = _object_path(name)
    for attempt in (1, 2):
        try:
            resp = requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                data=data,
                timeout=120,
            )
            resp.raise_for_status()
            return True
        except requests.HTTPError as ex:
            # Playbook: 403/404 with a cached key → force-reinit once.
            if attempt == 1 and ex.response is not None and ex.response.status_code in (403, 404):
                key = init_storage(force=True)
                if not key:
                    return False
                continue
            log.warning("object storage put failed (%s): %s", getattr(ex.response, "status_code", "?"), ex)
            return False
        except Exception as ex:  # noqa: BLE001
            log.warning("object storage put failed: %s", ex)
            return False
    return False


def get_object(name: str) -> Optional[Tuple[bytes, str]]:
    """Download bytes for a previously stored upload. Returns
    (content, content_type) on success, None if missing/unavailable."""
    key = init_storage()
    if not key:
        return None
    path = _object_path(name)
    for attempt in (1, 2):
        try:
            resp = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key},
                timeout=60,
            )
            resp.raise_for_status()
            return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
        except requests.HTTPError as ex:
            if attempt == 1 and ex.response is not None and ex.response.status_code in (403, 404):
                # 404 on the object itself is legitimate — only re-init
                # if the key looks stale, i.e. init said 401 previously.
                # In practice: cheap to retry with a fresh key, so do it.
                key = init_storage(force=True)
                if not key:
                    return None
                continue
            return None
        except Exception:  # noqa: BLE001
            return None
    return None
