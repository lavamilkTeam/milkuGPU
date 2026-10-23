#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
"""Check the small RTL module graph and Milku R32 reference fixtures."""
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
allowed = {
    "lavaneko_core": {"lavaneko_alu", "lavaneko_regfile", "lavaneko_muldiv"},
    "milku_gpu": {"milku_simd_core", "milku_arbiter"},
    "milku_simd_core": {"milku_lane", "milku_arbiter"},
    "milku_lane": {"lavaneko_alu", "lavaneko_regfile", "milku_dsp_muldiv"},
    "milku_dsp_muldiv": set(),
    "milku_arbiter": set(),
    "lavaneko_alu": set(),
    "lavaneko_regfile": set(),
    "lavaneko_muldiv": set(),
}
manifest = (root / "rtl/files.f").read_text().splitlines()
assert len(manifest) == len(set(manifest)) == len(allowed)
assert set(manifest) == {f"rtl/{name}.v" for name in allowed}
assert set(root.glob("rtl/*.v")) == {root / p for p in manifest}
for name, dependencies in allowed.items():
    source = (root / f"rtl/{name}.v").read_text()
    assert re.findall(r"\bmodule\s+(\w+)", source) == [name], name
    # $clog2 is a synthesizable elaboration-time width calculation.
    checked = source.replace("$clog2", "")
    assert not re.search(r"\b(initial|force|release|real)\b|\$|`include", checked), name
    instances = set(re.findall(r"\b((?:lavaneko|milku)_\w+)\s*#\s*\(", source)) - {name}
    assert instances == dependencies, (name, instances)
    assert not re.search(r"\b(?:tb_\w+|dut)\s*\.", source), name
for test in root.glob("tests/*.v"):
    assert not re.search(r"\bdut\s*\.", test.read_text()), test
for vectors in (root / "tests/vectors", root / "tests/vectors/gpu"):
    for case in json.loads((vectors / "manifest.json").read_text())["cases"]:
        for file, expected in case["files"].items():
            assert hashlib.sha256((vectors / file).read_bytes()).hexdigest() == expected, file
print("PASS RTL boundaries and reference fixture hashes")
