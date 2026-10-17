"""Validation and staged publication for a source snapshot (no network access)."""
import hashlib
import json
from pathlib import Path


def validate_refresh(raw, patch, units):
    if hashlib.sha256(raw).hexdigest() != patch['metadata']['baseAppSha256']:
        raise ValueError('App data changed since collection; regenerate or review the patch.')
    if units['metadata'].get('allListPagesComplete') is not True:
        raise ValueError('Unit capture incomplete; refusing inventory replacement.')
    reports = units['metadata'].get('reports', [])
    if not reports or any(r.get('complete') is not True for r in reports):
        raise ValueError('Every unit-list report must prove complete pagination.')
    if not all(c.get('complete') is True for c in patch['metadata']['catalogues'].values()):
        raise ValueError('Catalogue capture incomplete; no publication is allowed.')


def write_bundle(directory, files):
    """Serialize every output before writing any destination; replace via temp files."""
    directory = Path(directory)
    encoded = {name: (json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n').encode() for name, data in files.items()}
    directory.mkdir(parents=True, exist_ok=True)
    originals = {name: (directory/name).read_bytes() if (directory/name).exists() else None for name in encoded}
    completed = []
    try:
        for name, content in encoded.items():
            path = directory/name
            temp = path.with_suffix(path.suffix+'.tmp')
            temp.write_bytes(content)
            temp.replace(path)
            completed.append(name)
    except Exception:
        for name in completed:
            path = directory/name
            if originals[name] is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(originals[name])
        raise
    finally:
        for name in encoded:
            (directory/name).with_suffix('.json.tmp').unlink(missing_ok=True)
