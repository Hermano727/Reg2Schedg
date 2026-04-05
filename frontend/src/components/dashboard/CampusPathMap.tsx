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

  const plottedItems = scheduleItems
    .map((item) => {
      if (!item.buildingCode) return null;
      const loc = locationMap.get(item.buildingCode);
      if (!loc) return null;

      return {
        ...item,
        lat: loc.lat,
        lng: loc.lng,
      };
    })
    .filter((item): item is PlottedItem => item !== null);

  const mappedCodes = new Set(plottedItems.map((item) => item.buildingCode));
  const unmappedItems = scheduleItems.filter(
    (item) => !item.buildingCode || !mappedCodes.has(item.buildingCode),
  );

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

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-xl border border-white/[0.08] bg-hub-bg/30 p-3">
          <h3 className="text-sm font-semibold text-hub-text">Mapped locations</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {plottedItems.map((item, index) => (
              <div
                key={`item-${item.id}`}
                className="rounded-lg border border-white/[0.08] bg-hub-surface/75 p-2"
              >
                <p className="text-sm font-semibold text-hub-text">
                  {index + 1}. {item.title}
                </p>
                {item.location && (
                  <p className="text-xs text-hub-text-muted">{item.location}</p>
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

        <div className="rounded-xl border border-white/[0.08] bg-hub-bg/30 p-3">
          <h3 className="text-sm font-semibold text-hub-text">Needs mapping</h3>
          <div className="mt-2 space-y-2">
            {unmappedItems.length ? (
              unmappedItems.map((item) => (
                <p key={`unmapped-${item.id}`} className="text-xs text-hub-text-muted">
                  {item.title}: add a `buildingCode` to include this on map.
                </p>
              ))
            ) : (
              <p className="text-xs text-emerald-300">All schedule items are mapped.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
