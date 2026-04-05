"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";
import type { ScheduleItem, TransitionInsight } from "@/types/dossier";
import { campusLocations } from "@/lib/mock/campusLocations";

type CampusPathMapProps = {
  scheduleItems: ScheduleItem[];
  transitionInsights: TransitionInsight[];
};

export type PlottedItem = ScheduleItem & {
  lat: number;
  lng: number;
  /** All days this course meets at this location, e.g. ["Mon","Wed","Fri"] */
  days: string[];
};

const CampusPathLeafletMap = dynamic(
  () =>
    import("./CampusPathLeafletMap").then((mod) => ({
      default: mod.CampusPathLeafletMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-white/[0.08] bg-[#071124] text-sm text-hub-text-muted">
        Loading interactive map...
      </div>
    ),
  },
);

function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function getGoogleMapsUrl(locationName: string) {
  const query = `${locationName}, UC San Diego`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function CampusPathMap({
  scheduleItems,
  transitionInsights: _transitionInsights,
}: CampusPathMapProps) {
  void _transitionInsights;

  const locationMap = useMemo(
    () => new Map(campusLocations.map((loc) => [loc.code, loc])),
    [],
  );

  // Deduplicate by (title + buildingCode/location) so MWF lectures become one map pin.
  // Collect all days for each unique course-location pair.
  const plottedMap = new Map<string, PlottedItem>();
  for (const item of scheduleItems) {
    let lat: number | undefined = item.lat;
    let lng: number | undefined = item.lng;
    if ((lat == null || lng == null) && item.buildingCode) {
      const loc = locationMap.get(item.buildingCode);
      if (loc) { lat = loc.lat; lng = loc.lng; }
    }
    if (lat == null || lng == null) continue;

    const key = `${item.title}|${item.buildingCode ?? item.location ?? ""}`;
    if (plottedMap.has(key)) {
      const existing = plottedMap.get(key)!;
      if (!existing.days.includes(item.day)) existing.days.push(item.day);
    } else {
      plottedMap.set(key, { ...item, lat, lng, days: [item.day] });
    }
  }
  const plottedItems = [...plottedMap.values()];


  return (
    <section className="glass-panel rounded-xl border border-white/[0.08] p-4">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text">
            Campus path map
          </h2>
          <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
            Estimated route
          </span>
        </div>
        <p className="mt-1 text-sm text-hub-text-secondary">
          Sequence markers show the order of your schedule locations.
        </p>
      </div>

      <div className="mt-4">
        <CampusPathLeafletMap plottedItems={plottedItems} />
      </div>

      <div className="mt-3">
        <div className="rounded-xl border border-white/[0.08] bg-hub-bg/30 p-3">
          <h3 className="text-sm font-semibold text-hub-text">Mapped locations</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plottedItems.map((item, index) => (
              <div
                key={`item-${item.id}-${index}`}
                className="rounded-lg border border-white/[0.08] bg-hub-surface/75 p-2"
              >
                <p className="text-sm font-semibold text-hub-text">
                  {index + 1}. {item.title}
                </p>
                {item.location && (
                  <p className="text-xs text-hub-text-muted">{item.location}</p>
                )}
                {item.days.length > 0 && (
                  <p className="mt-0.5 text-xs text-hub-text-muted">
                    {item.days.join(" · ")}
                  </p>
                )}
                {item.start && item.end && (
                  <p className="mt-0.5 text-xs text-hub-cyan">
                    {fmt12(item.start)} – {fmt12(item.end)}
                  </p>
                )}
                <a
                  href={getGoogleMapsUrl(item.location ?? item.title)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-hub-cyan hover:underline"
                >
                  Open in Google Maps <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
