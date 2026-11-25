"""Extract parcel centroids (LV95) from the Baugesuche GeoPackage of Kanton Zürich.

Usage: python -I scripts/gpkg-centroids.py <KTZH_00002982_00006403.gpkg> <out.json>
Output: {id: [e, n]} - used once to seed coordinates; later rows are geocoded by the daily cron.
"""
import json, sqlite3, struct, sys

ENV_SIZE = [0, 32, 48, 48, 64]

def points(wkb, off=0):
    """Yield all (x, y) of a WKB Polygon/MultiPolygon/Point, returns new offset."""
    bo = "<" if wkb[off] == 1 else ">"
    t = struct.unpack_from(bo + "I", wkb, off + 1)[0] % 1000
    off += 5
    pts = []
    if t == 1:
        pts.append(struct.unpack_from(bo + "dd", wkb, off)); off += 16
    elif t == 3:
        rings = struct.unpack_from(bo + "I", wkb, off)[0]; off += 4
        for r in range(rings):
            npts = struct.unpack_from(bo + "I", wkb, off)[0]; off += 4
            ring = [struct.unpack_from(bo + "dd", wkb, off + 16 * i) for i in range(npts)]
            off += 16 * npts
            if r == 0:
                pts += ring  # outer ring only
    elif t in (4, 6, 7):
        parts = struct.unpack_from(bo + "I", wkb, off)[0]; off += 4
        for _ in range(parts):
            p, off = points(wkb, off)
            pts += p
    return pts, off

out = {}
for gid, geom in sqlite3.connect(sys.argv[1]).execute("select id, geom from BauPub where geom is not null"):
    env = (geom[3] >> 1) & 7
    pts, _ = points(geom, 8 + ENV_SIZE[env])
    if pts:
        out[gid] = [round(sum(p[0] for p in pts) / len(pts), 1), round(sum(p[1] for p in pts) / len(pts), 1)]
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"))
print(len(out), "centroids")
