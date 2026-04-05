"""
UCSD geocoding service.

Resolution order:
  1. Supabase `course_locations` cache (keyed by normalized location string)
  2. Static UCSD building table (no API key required)
  3. Google Maps Text Search (if GOOGLE_MAPS_API_KEY is set in env)

Returns None for locations that cannot be resolved.
"""

from __future__ import annotations

import os
import re
import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Static UCSD building table
# Keys are the canonical building codes used in course schedules.
# ---------------------------------------------------------------------------

UCSD_BUILDINGS: dict[str, dict[str, Any]] = {
    # Core lecture halls
    "CENTR":  {"display": "Center Hall",                     "lat": 32.87977, "lng": -117.23620},
    "WLH":    {"display": "Warren Lecture Hall",             "lat": 32.88104, "lng": -117.23381},
    "PCYNH":  {"display": "Pepper Canyon Hall",              "lat": 32.87705, "lng": -117.23588},
    "MANDE":  {"display": "Mandeville Center",               "lat": 32.87898, "lng": -117.24098},
    "HSS":    {"display": "Humanities & Social Sciences",    "lat": 32.87787, "lng": -117.23736},
    "LEDDN":  {"display": "Leichtag Family Foundation Hall", "lat": 32.87467, "lng": -117.23684},
    "YORK":   {"display": "York Hall",                       "lat": 32.87540, "lng": -117.23561},
    "SOLIS":  {"display": "Solis Hall",                      "lat": 32.88173, "lng": -117.23394},
    "PETER":  {"display": "Peterson Hall",                   "lat": 32.87749, "lng": -117.23528},
    "GALB":   {"display": "Galbraith Hall",                  "lat": 32.87711, "lng": -117.23478},
    "GH":     {"display": "Galbraith Hall",                  "lat": 32.87711, "lng": -117.23478},

    # Engineering buildings
    "EBU1":   {"display": "Engineering Building Unit 1",    "lat": 32.87985, "lng": -117.23373},
    "EBU2":   {"display": "Engineering Building Unit 2",    "lat": 32.87952, "lng": -117.23310},
    "EBU3":   {"display": "Engineering Building Unit 3B",   "lat": 32.88145, "lng": -117.23315},
    "EBU3B":  {"display": "Engineering Building Unit 3B",   "lat": 32.88145, "lng": -117.23315},
    "ERCA":   {"display": "Engineering Research Complex A", "lat": 32.88220, "lng": -117.23320},
    "ATK":    {"display": "Atkinson Hall",                  "lat": 32.88229, "lng": -117.23346},
    "CSE":    {"display": "Computer Science & Engineering", "lat": 32.88145, "lng": -117.23315},

    # Science buildings
    "APM":    {"display": "Applied Physics & Mathematics",  "lat": 32.87938, "lng": -117.24053},
    "CTL":    {"display": "Clinical Teaching Facility",    "lat": 32.87408, "lng": -117.23522},
    "MAYER":  {"display": "Mayer Hall",                     "lat": 32.87524, "lng": -117.23732},
    "UREY":   {"display": "Urey Hall",                      "lat": 32.87514, "lng": -117.23784},
    "BONNER": {"display": "Bonner Hall",                    "lat": 32.87438, "lng": -117.23861},
    "SKAGGS": {"display": "Skaggs School of Pharmacy",      "lat": 32.87459, "lng": -117.23830},
    "CSB":    {"display": "Cognitive Science Building",     "lat": 32.87850, "lng": -117.23437},
    "BIOMED": {"display": "Biomedical Sciences Building",   "lat": 32.87385, "lng": -117.23745},

    # Social sciences / humanities
    "RBC":    {"display": "Robinson Building Complex",      "lat": 32.87622, "lng": -117.23860},
    "SSB":    {"display": "Social Sciences Building",       "lat": 32.87764, "lng": -117.23820},
    "RWAC":   {"display": "Rady School of Management",      "lat": 32.88268, "lng": -117.23451},

    # Arts / performance
    "THEA":   {"display": "Theater District",               "lat": 32.87963, "lng": -117.24175},

    # Libraries / central campus
    "GEISEL": {"display": "Geisel Library",                 "lat": 32.88099, "lng": -117.23744},
    "LIBS":   {"display": "Geisel Library",                 "lat": 32.88099, "lng": -117.23744},
    "PRICE":  {"display": "Price Center",                   "lat": 32.87976, "lng": -117.23748},

    # Residential colleges
    "MUIR":   {"display": "Muir College",                   "lat": 32.87842, "lng": -117.24162},
    "REVELLE": {"display": "Revelle College",               "lat": 32.87395, "lng": -117.24206},
    "WARREN": {"display": "Warren College",                 "lat": 32.88210, "lng": -117.23401},
    "MARSH":  {"display": "Marshall College",               "lat": 32.88012, "lng": -117.23522},
    "SIXTH":  {"display": "Sixth College",                  "lat": 32.88350, "lng": -117.23590},
    "SEVENTH": {"display": "Seventh College",               "lat": 32.88440, "lng": -117.23300},
    "EIGHTH": {"display": "Eighth College",                 "lat": 32.88390, "lng": -117.23230},

    # Recreation
    "RIMAC":  {"display": "RIMAC Arena",                    "lat": 32.88460, "lng": -117.24065},
    "SERF":   {"display": "Student Services Center",        "lat": 32.87960, "lng": -117.23665},
}

# Alias → canonical code (handles Gemini variations)
_ALIASES: dict[str, str] = {
    "CENTER": "CENTR",
    "CTR":    "CENTR",
    "WL":     "WLH",
    "PEPPER": "PCYNH",
    "MAND":   "MANDE",
    "LIB":    "GEISEL",
    "COGNITIVE": "CSB",
    "SKAGG":  "SKAGGS",
    "EBEN":   "EBU1",
    "EBUB":   "EBU3B",
}


@dataclass
class GeocodedLocation:
    building_code: str | None
    display_name: str
    lat: float
    lng: float
    status: str   # "resolved" | "ambiguous" | "unresolved"
    provider: str # "static" | "google" | "nominatim"


def normalize_location(raw: str) -> str:
    """Uppercase, strip punctuation, collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", raw.upper())).strip()


def _extract_building_code(normalized: str) -> str | None:
    """Extract the first token as a potential building code."""
    tokens = normalized.split()
    if not tokens:
        return None
    first = tokens[0]

    # Exact match
    if first in UCSD_BUILDINGS:
        return first

    # Alias match
    if first in _ALIASES:
        return _ALIASES[first]

    # Prefix match (e.g. "CENTR" matches "CENTRH" unlikely but defensive)
    for code in UCSD_BUILDINGS:
        if normalized.startswith(code):
            return code

    return None


def _lookup_static(building_code: str) -> GeocodedLocation | None:
    entry = UCSD_BUILDINGS.get(building_code)
    if not entry:
        return None
    return GeocodedLocation(
        building_code=building_code,
        display_name=entry["display"],
        lat=entry["lat"],
        lng=entry["lng"],
        status="resolved",
        provider="static",
    )


def _lookup_google(raw_location: str) -> GeocodedLocation | None:
    """Call Google Maps Text Search API. Requires GOOGLE_MAPS_API_KEY."""
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return None

    query = f"{raw_location}, UC San Diego, La Jolla CA"
    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/place/textsearch/json",
            params={"query": query, "key": api_key},
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return None
        top = results[0]
        loc = top["geometry"]["location"]
        return GeocodedLocation(
            building_code=None,
            display_name=top.get("name", raw_location),
            lat=loc["lat"],
            lng=loc["lng"],
            status="resolved",
            provider="google",
        )
    except Exception as exc:
        logger.warning("Google Maps geocode failed for %r: %s", raw_location, exc)
        return None


def geocode_location(raw_location: str) -> GeocodedLocation | None:
    """
    Resolve a raw location string to geographic coordinates.

    Resolution order:
      1. Static UCSD building table (no API required)
      2. Google Maps Text Search (if GOOGLE_MAPS_API_KEY env var is set)

    Returns None if the location cannot be resolved.
    """
    if not raw_location or not raw_location.strip():
        return None

    normalized = normalize_location(raw_location)

    # Try static table first
    building_code = _extract_building_code(normalized)
    if building_code:
        result = _lookup_static(building_code)
        if result:
            return result

    # Fall back to Google Maps
    result = _lookup_google(raw_location)
    if result:
        return result

    logger.debug("Could not geocode location: %r", raw_location)
    return None
