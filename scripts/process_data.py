#!/usr/bin/env python3
"""Prepare map-ready NYC design-resource data using only Python's standard library."""

import csv
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

DESIGN_TERMS = {
    "architecture",
    "architectural",
    "art",
    "arts",
    "creative",
    "design",
    "drawing",
    "fashion",
    "film",
    "graphic",
    "industrial",
    "maker",
    "media",
    "museum",
    "photography",
    "printing",
    "sculpture",
    "studio",
    "technology",
    "textile",
    "visual",
}

KNOWN_DESIGN_SCHOOLS = {
    "cooper union",
    "fashion institute of technology",
    "new school",
    "parsons",
    "pratt institute",
    "school of visual arts",
}


def normalize_name(value):
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def contains_design_term(text):
    words = set(normalize_name(text).split())
    return bool(words & DESIGN_TERMS) or any(
        school in normalize_name(text) for school in KNOWN_DESIGN_SCHOOLS
    )


def point_in_ring(point, ring):
    x, y = point
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = (yi > y) != (yj > y) and x < (
            (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_geometry(point, geometry):
    coordinates = geometry["coordinates"]
    polygons = [coordinates] if geometry["type"] == "Polygon" else coordinates
    for polygon in polygons:
        if point_in_ring(point, polygon[0]) and not any(
            point_in_ring(point, hole) for hole in polygon[1:]
        ):
            return True
    return False


def neighborhood_for(point, neighborhoods):
    for feature in neighborhoods:
        if point_in_geometry(point, feature["geometry"]):
            props = feature["properties"]
            return {
                "nta_code": props.get("nta2020", ""),
                "neighborhood": props.get("ntaname", ""),
                "borough": props.get("boroname", ""),
            }
    return {"nta_code": "", "neighborhood": "", "borough": ""}


def osm_category(tags):
    name = tags.get("name", "")
    searchable = " ".join(
        str(tags.get(key, ""))
        for key in ("name", "description", "operator", "subject", "craft")
    )
    design_related = contains_design_term(searchable)

    if tags.get("makerspace") == "yes":
        return "make", "OpenStreetMap makerspace tag"
    if tags.get("craft") and (
        design_related
        or tags.get("shop") in {"craft", "art", "fabric", "sewing", "hardware"}
    ):
        return "make", "OpenStreetMap craft/workshop tag"
    if tags.get("tourism") in {"museum", "gallery"} and design_related:
        return "experience", "Design-related museum or gallery"
    if tags.get("amenity") == "arts_centre":
        return "experience", "OpenStreetMap arts-centre tag"
    if tags.get("amenity") in {"college", "university"} and (
        design_related or contains_design_term(name)
    ):
        return "learn", "Design-related college or university"
    if tags.get("amenity") == "library" and design_related:
        return "learn", "Design-related library"
    if (
        tags.get("community_centre")
        or tags.get("club") == "art"
        or tags.get("office") == "association"
    ) and design_related:
        return "connect", "Design-related community or association"
    return "", "Requires manual review"


def load_neighborhoods():
    with (RAW / "nyc-2020-neighborhood-tabulation-areas.geojson").open() as file:
        return json.load(file)["features"]


def osm_records(neighborhoods):
    with (RAW / "osm-design-resource-candidates.json").open() as file:
        elements = json.load(file)["elements"]

    accepted = []
    review = []
    for element in elements:
        tags = element.get("tags", {})
        name = tags.get("name", "").strip()
        location = element if "lat" in element else element.get("center", {})
        if not name or "lat" not in location or "lon" not in location:
            continue

        category, reason = osm_category(tags)
        record = {
            "name": name,
            "category": category,
            "longitude": float(location["lon"]),
            "latitude": float(location["lat"]),
            "website": tags.get("website", tags.get("contact:website", "")),
            "address": " ".join(
                part
                for part in (
                    tags.get("addr:housenumber", ""),
                    tags.get("addr:street", ""),
                )
                if part
            ),
            "source": "OpenStreetMap",
            "source_id": f'{element["type"]}/{element["id"]}',
            "reason": reason,
        }
        review.append(record)
        if category:
            record.update(
                neighborhood_for(
                    (record["longitude"], record["latitude"]), neighborhoods
                )
            )
            accepted.append(record)
    return accepted, review


def dcla_records(neighborhoods):
    accepted = []
    review = []
    with (RAW / "dcla-cultural-organizations.csv").open(
        newline="", encoding="utf-8-sig"
    ) as file:
        for index, row in enumerate(csv.DictReader(file), start=2):
            name = (row.get("Organization Name") or "").strip()
            discipline = (row.get("Discipline") or "").strip()
            try:
                latitude = float(row.get("Latitude") or "")
                longitude = float(row.get("Longitude") or "")
            except ValueError:
                continue

            category = ""
            reason = "Requires manual review"
            if discipline == "Architecture/Design":
                category = "experience"
                reason = "DCLA Architecture/Design discipline"
            elif discipline in {"Visual Arts", "Museum", "Photography", "New Media"} and contains_design_term(name):
                category = "experience"
                reason = f"Design-related name in DCLA {discipline} discipline"

            record = {
                "name": name,
                "category": category,
                "longitude": longitude,
                "latitude": latitude,
                "website": "",
                "address": ", ".join(
                    part
                    for part in (
                        row.get("Address", "").strip(),
                        row.get("City", "").strip(),
                        row.get("Postcode", "").strip(),
                    )
                    if part
                ),
                "source": "NYC DCLA",
                "source_id": f"dcla-row-{index}",
                "reason": reason,
            }
            review.append(record)
            if category:
                record.update(neighborhood_for((longitude, latitude), neighborhoods))
                accepted.append(record)
    return accepted, review


def deduplicate(records):
    result = {}
    for record in records:
        key = normalize_name(record["name"])
        if not key:
            continue
        existing = result.get(key)
        if existing is None or (
            existing["source"] == "NYC DCLA" and record["source"] == "OpenStreetMap"
        ):
            result[key] = record
    return sorted(result.values(), key=lambda item: item["name"].lower())


def write_outputs(records, review):
    PROCESSED.mkdir(parents=True, exist_ok=True)
    features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [record["longitude"], record["latitude"]],
            },
            "properties": {
                key: value
                for key, value in record.items()
                if key not in {"longitude", "latitude"}
            },
        }
        for record in records
    ]
    with (PROCESSED / "design-resources.geojson").open("w") as file:
        json.dump({"type": "FeatureCollection", "features": features}, file)

    fields = [
        "include",
        "name",
        "suggested_category",
        "longitude",
        "latitude",
        "address",
        "website",
        "source",
        "source_id",
        "reason",
    ]
    with (PROCESSED / "resource-review.csv").open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for record in sorted(review, key=lambda item: item["name"].lower()):
            writer.writerow(
                {
                    "include": "yes" if record["category"] else "",
                    "suggested_category": record["category"],
                    **{key: record.get(key, "") for key in fields},
                }
            )

    counts = Counter(record["category"] for record in records)
    with (PROCESSED / "summary.json").open("w") as file:
        json.dump({"total": len(records), "categories": counts}, file, indent=2)


def main():
    neighborhoods = load_neighborhoods()
    osm, osm_review = osm_records(neighborhoods)
    dcla, dcla_review = dcla_records(neighborhoods)
    records = deduplicate(osm + dcla)
    write_outputs(records, osm_review + dcla_review)
    counts = Counter(record["category"] for record in records)
    print(f"Exported {len(records)} resources: {dict(counts)}")


if __name__ == "__main__":
    main()
