import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_guard import validate_refresh, write_bundle


class RefreshSafety(unittest.TestCase):
    def test_changed_base_and_partial_capture_are_rejected(self):
        raw = b'original'
        patch = {'metadata': {'baseAppSha256': hashlib.sha256(raw).hexdigest(), 'catalogues': {'one': {'complete': True}}}}
        units = {'metadata': {'allListPagesComplete': True, 'reports': [{'complete': True}]}}
        validate_refresh(raw, patch, units)
        with self.assertRaises(ValueError):
            validate_refresh(b'changed', patch, units)
        units['metadata']['reports'][0]['complete'] = False
        with self.assertRaises(ValueError):
            validate_refresh(raw, patch, units)

    def test_invalid_output_does_not_overwrite_existing_data(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'projects.json'
            path.write_text('{"keep":true}')
            with self.assertRaises(ValueError):
                write_bundle(directory, {'projects.json': {'bad': float('nan')}})
            self.assertEqual(json.loads(path.read_text()), {'keep': True})
            write_bundle(directory, {'projects.json': {'valid': True}})
            self.assertEqual(json.loads(path.read_text()), {'valid': True})


if __name__ == '__main__':
    unittest.main()
