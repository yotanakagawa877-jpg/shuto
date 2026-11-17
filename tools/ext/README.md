# v3.7–3.9 map extension (±15 km) pipeline
Builds the ring between the v3.6 bounds (35.30–35.93 / 139.43–140.07) and the new bounds
(35.165–36.065 / 139.265–140.235) from OSM (download.openstreetmap.fr kanto extract) and merges it into
the v3.6 world.json / packs. The result is checked in as data/world.json and data/tiles/*.bin.
Order: extract.py PBF ex/ -> bldnp.py -> calib_b3.py (height model from old packs) -> roads.py -> rails.py
-> newrails.py -> sites.py -> mask.py -> bus.py -> packs.py -> assemble.py. Paths inside are the original
session's scratch paths; edit SC/SRC before re-running.
Rules derived from the v3.6 data: X motorway / R motorway_link / A trunk+primary / B secondary in the global
graph; tertiary and smaller streets are tile streets in the ring (memory); building heights from tags
(levels*3.3+0.8) or sampled from the v3.6 distribution by footprint area and local density.
