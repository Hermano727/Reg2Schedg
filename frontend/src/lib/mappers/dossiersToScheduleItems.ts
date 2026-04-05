import type { ClassDossier, ScheduleItem } from "@/types/dossier";
import { resolveLocationCode, campusLocationMap } from "@/lib/mock/campusLocations";

type WeekDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

/**
 * Parse a UCSD days string into individual week-day labels.
 * Handles "MWF", "TuTh", "MW", "Tu", "F", "M", "W", "Th", "Sa" etc.
 */
function expandDays(days: string): WeekDay[] {
  const result: WeekDay[] = [];
  let i = 0;
  const d = days.trim();
  while (i < d.length) {
    if (d.startsWith("Tu", i)) { result.push("Tue"); i += 2; }
    else if (d.startsWith("Th", i)) { result.push("Thu"); i += 2; }
    else if (d[i] === "M") { result.push("Mon"); i++; }
    else if (d[i] === "W") { result.push("Wed"); i++; }
    else if (d[i] === "F") { result.push("Fri"); i++; }
    else { i++; } // skip unknown chars (Sa, Su, spaces)
  }
  return result;
}

/**
 * Convert a 12-hour time string to 24-hour "HH:MM".
 * e.g. "10:00 AM" → "10:00", "2:00 PM" → "14:00", "12:00 PM" → "12:00", "12:00 AM" → "00:00"
 */
function to24h(time12: string): string {
  const match = time12.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time12; // passthrough if already 24h or unrecognized
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  else if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${m}`;
}

/**
 * Convert a list of ClassDossiers (from the research API) into ScheduleItem[]
 * suitable for feeding into CampusPathMap and the weekly calendar.
 *
 * Each meeting is expanded across its days, and location strings are resolved
 * to building codes + lat/lng via the campusLocations lookup table.
 * If the backend already provided lat/lng on the meeting, those take precedence.
 */
export function dossiersToScheduleItems(dossiers: ClassDossier[]): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  for (const dossier of dossiers) {
    for (let meetingIdx = 0; meetingIdx < dossier.meetings.length; meetingIdx++) {
      const meeting = dossier.meetings[meetingIdx];
      const days = expandDays(meeting.days);
      if (days.length === 0) continue;

      const start = to24h(meeting.start_time);
      const end = to24h(meeting.end_time);

      // Resolve building code: backend-provided first, then frontend lookup
      const buildingCode =
        meeting.building_code ?? resolveLocationCode(meeting.location);

      // Resolve lat/lng: backend-provided first, then campusLocations lookup
      let lat = meeting.lat;
      let lng = meeting.lng;
      if ((lat == null || lng == null) && buildingCode) {
        const loc = campusLocationMap.get(buildingCode);
        if (loc) {
          lat = loc.lat;
          lng = loc.lng;
        }
      }

      for (const day of days) {
        const sanitizedStart = start.replace(/:/g, "");
        const id = `${dossier.id}-${meeting.section_type}-${day}-${sanitizedStart}`.toLowerCase().replace(/\s+/g, "-");
        const item: ScheduleItem = {
          id,
          title: `${dossier.courseCode} ${meeting.section_type}`,
          kind: "class",
          day,
          start,
          end,
          location: meeting.location || undefined,
          buildingCode,
          ...(lat != null && lng != null ? { lat, lng } : {}),
        };
        items.push(item);
      }
    }
  }

  // Sort by day then start time
  const DAY_ORDER: Record<WeekDay, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };
  items.sort((a, b) => {
    const dayDiff = DAY_ORDER[a.day] - DAY_ORDER[b.day];
    if (dayDiff !== 0) return dayDiff;
    return a.start.localeCompare(b.start);
  });

  return items;
}
