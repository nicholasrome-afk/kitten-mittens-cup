"""Download the eight selected originals; no cropping or image modification.

Run manually if a bundled asset needs replacement. Provenance is in sources.json.
The website serves the resulting local files, not these third-party hosts.
"""
import concurrent.futures
import json
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parents[1] / 'assets' / 'avatars'
sources = json.loads((root / 'sources.json').read_text())

def fetch(source):
    request = urllib.request.Request(source['imageUrl'], headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=35) as response:
        content_type = response.headers.get('Content-Type', '')
        data = response.read(8 * 1024 * 1024 + 1)
    if not content_type.startswith('image/') or len(data) > 8 * 1024 * 1024:
        raise ValueError(f"Invalid image response for {source['character']}")
    if not data.startswith(b'\xff\xd8\xff'):
        raise ValueError(f"Expected an original JPEG for {source['character']}")
    (root / source['file']).write_bytes(data)
    return f"{source['character']}: {len(data):,} bytes"

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for result in executor.map(fetch, sources):
            print(result)
