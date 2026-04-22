"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle } from "lucide-react";
import type { ScheduleItem, TransitionInsight } from "@/types/dossier";
import { campusLocations } from "@/lib/mock/campusLocations";

type CampusPathMapProps = {
  scheduleItems: ScheduleItem[];
  transitionInsights: TransitionInsight[];
  highlightedDossierId?: string | null;
  /** Dossier ID → sequential display-order marker number */
  dossierMarkerMap?: Map<string, number>;
  /** Tailwind height class override, e.g. "h-[75vh]" */
  mapHeight?: string;
  /** Called when the user clicks a map marker. Pass null to deselect. */
  onMarkerClick?: (dossierId: string | null) => void;
};

export type PlottedItem = ScheduleItem & {
  lat: number;
  lng: number;
  /** All days this course meets at this location, e.g. ["Mon","Wed","Fri"] */
  days: string[];
  /** Sequential marker number derived from dossier display order */
  markerNum: number;
  /** The ClassDossier ID this item belongs to — used for map→calendar highlight. */
  dossierId: string | null;
};

const CampusPathLeafletMap = dynamic(
  () =>
    import("./CampusPathLeafletMap").then((mod) => ({
      default: mod.CampusPathLeafletMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[340px] items-center justify-center rounded-xl border border-white/[0.08] bg-[#071124] text-sm text-white/50">
        Loading map...
      </div>
    ),
  },
);


export function CampusPathMap({
  scheduleItems,
  transitionInsights: _transitionInsights,
  highlightedDossierId,
  dossierMarkerMap,
  mapHeight,
  onMarkerClick,
}: CampusPathMapProps) {
  void _transitionInsights;

  const locationMap = useMemo(
    () => new Map(campusLocations.map((loc) => [loc.code, loc])),
    [],
  );

  // Deduplicate by (title + buildingCode/location) so MWF lectures become one map pin.
  // Collect all days for each unique course-location pair.
  // Resolve markerNum and dossierId from dossierMarkerMap by matching item.id prefix.
  const plottedMap = new Map<string, PlottedItem>();
  for (const item of scheduleItems) {
    let lat: number | undefined = item.lat;
    let lng: number | undefined = item.lng;
    if ((lat == null || lng == null) && item.buildingCode) {
      const loc = locationMap.get(item.buildingCode);
      if (loc) { lat = loc.lat; lng = loc.lng; }
    }
    if (lat == null || lng == null) continue;

    // Resolve marker number and dossier ID from the dossierMarkerMap
    let markerNum = 0;
    let dossierId: string | null = null;
    if (dossierMarkerMap) {
      for (const [id, num] of dossierMarkerMap) {
        if (item.id.startsWith(id + "-")) { markerNum = num; dossierId = id; break; }
      }
    }

    const key = `${item.title}|${item.buildingCode ?? item.location ?? ""}`;
    if (plottedMap.has(key)) {
      const existing = plottedMap.get(key)!;
      if (!existing.days.includes(item.day)) existing.days.push(item.day);
    } else {
      plottedMap.set(key, { ...item, lat, lng, days: [item.day], markerNum, dossierId });
    }
  }
  const plottedItems = [...plottedMap.values()];

  const hasUnresolved = plottedItems.some((i) => i.geocode_status === "unresolved");

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.08]">
      <CampusPathLeafletMap
        plottedItems={plottedItems}
        highlightedDossierId={highlightedDossierId}
        mapHeight={mapHeight}
        onMarkerClick={onMarkerClick}
      />
      {hasUnresolved && (
        <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-3 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" aria-hidden />
          <span className="text-[10px] text-amber-400/80">Some building locations are approximate</span>
        </div>
      )}
    </section>
  );
}
