"""One-shot, bounded bridge from the Node ingestion worker to Scrapling."""

import base64
import contextlib
import io
import json
import logging
import os
import sys
from urllib.parse import urlparse


def main() -> None:
    mode, url = sys.argv[1:3]
    parsed = urlparse(url)
    if mode not in {"http", "browser"} or parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Invalid Scrapling request")

    logging.disable(logging.CRITICAL)
    # Scrapling may print progress logs; stdout is reserved for one JSON response.
    with contextlib.redirect_stdout(io.StringIO()):
        from scrapling.fetchers import Fetcher, StealthyFetcher

        if mode == "http":
            page = Fetcher.get(url, retries=0, timeout=25)
        else:
            page = StealthyFetcher.fetch(
                url, solve_cloudflare=True, google_search=False,
                retries=1, timeout=45000,
                real_chrome=os.environ.get("SCRAPLING_REAL_CHROME") == "true",
            )

    body = bytes(page.body)
    if len(body) > 5_000_000:
        raise ValueError("Scrapling response exceeds 5 MB")
    content_type = next(
        (str(value) for key, value in page.headers.items() if str(key).lower() == "content-type"),
        "text/html" if mode == "browser" else "application/octet-stream",
    )
    print(json.dumps({
        "status": int(page.status),
        "contentType": content_type,
        "bodyBase64": base64.b64encode(body).decode("ascii"),
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
