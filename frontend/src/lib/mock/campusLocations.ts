export type CampusLocation = {
  code: string;
  name: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
};

export const campusLocations: CampusLocation[] = [
  // Core lecture halls
  { code: "CENTR",  name: "Center Hall",                      x: 420, y: 240, lat: 32.87977, lng: -117.23620 },
  { code: "WLH",    name: "Warren Lecture Hall",              x: 640, y: 180, lat: 32.88104, lng: -117.23381 },
  { code: "PCYNH",  name: "Pepper Canyon Hall",               x: 390, y: 300, lat: 32.87705, lng: -117.23588 },
  { code: "MANDE",  name: "Mandeville Center",                x: 210, y: 260, lat: 32.87898, lng: -117.24098 },
  { code: "HSS",    name: "Humanities & Social Sciences",     x: 350, y: 270, lat: 32.87787, lng: -117.23736 },
  { code: "LEDDN",  name: "Leichtag Family Foundation Hall",  x: 360, y: 380, lat: 32.87467, lng: -117.23684 },
  { code: "YORK",   name: "York Hall",                        x: 380, y: 360, lat: 32.87540, lng: -117.23561 },
  { code: "SOLIS",  name: "Solis Hall",                       x: 620, y: 150, lat: 32.88173, lng: -117.23394 },
  { code: "PETER",  name: "Peterson Hall",                    x: 370, y: 330, lat: 32.87605, lng: -117.23676 },
  { code: "GALB",   name: "Galbraith Hall",                   x: 390, y: 340, lat: 32.87711, lng: -117.23478 },
  { code: "GH",     name: "Galbraith Hall",                   x: 390, y: 340, lat: 32.87711, lng: -117.23478 },

  // Engineering buildings
  { code: "EBU1",   name: "Engineering Building Unit 1",     x: 600, y: 220, lat: 32.87985, lng: -117.23373 },
  { code: "EBU2",   name: "Engineering Building Unit 2",     x: 620, y: 230, lat: 32.87952, lng: -117.23310 },
  { code: "EBU3",   name: "Engineering Building Unit 3",     x: 640, y: 210, lat: 32.88145, lng: -117.23315 },
  { code: "EBU3B",  name: "Engineering Building Unit 3B",    x: 640, y: 210, lat: 32.88145, lng: -117.23315 },
  { code: "ERCA",   name: "Engineering Research Complex A",   x: 660, y: 200, lat: 32.88220, lng: -117.23320 },
  { code: "ATK",    name: "Atkinson Hall",                    x: 660, y: 190, lat: 32.88229, lng: -117.23346 },

  // Science buildings
  { code: "APM",    name: "Applied Physics & Mathematics",    x: 440, y: 230, lat: 32.87898, lng: -117.23451 },
  { code: "MAYER",  name: "Mayer Hall",                       x: 350, y: 360, lat: 32.87524, lng: -117.23732 },
  { code: "UREY",   name: "Urey Hall",                        x: 340, y: 370, lat: 32.87514, lng: -117.23784 },
  { code: "BONNER", name: "Bonner Hall",                      x: 320, y: 390, lat: 32.87438, lng: -117.23861 },
  { code: "SKAGGS", name: "Skaggs School of Pharmacy",        x: 300, y: 400, lat: 32.87459, lng: -117.23830 },
  { code: "CSB",    name: "Cognitive Science Building",       x: 470, y: 235, lat: 32.87850, lng: -117.23437 },
  { code: "CSE",    name: "Computer Science & Engineering",   x: 620, y: 210, lat: 32.88145, lng: -117.23315 },
  { code: "BIOMED", name: "Biomedical Sciences Building",     x: 310, y: 410, lat: 32.87385, lng: -117.23745 },
  { code: "CMM",    name: "Center for Molecular Medicine",    x: 300, y: 420, lat: 32.87315, lng: -117.23680 },

  // Social sciences / humanities
  { code: "RBC",    name: "Robinson Building Complex",        x: 310, y: 330, lat: 32.87622, lng: -117.23860 },
  { code: "SSB",    name: "Social Sciences Building",         x: 330, y: 280, lat: 32.87764, lng: -117.23820 },
  { code: "SSC",    name: "Social Sciences Research Building", x: 335, y: 275, lat: 32.87790, lng: -117.23795 },
  { code: "RWAC",   name: "Rady School of Management",        x: 560, y: 150, lat: 32.88268, lng: -117.23451 },

  // Arts / performance
  { code: "THEA",   name: "Theater District",                 x: 230, y: 250, lat: 32.87963, lng: -117.24175 },
  { code: "DANCE",  name: "Dance Studio",                     x: 225, y: 255, lat: 32.87940, lng: -117.24200 },

  // Libraries / central campus
  { code: "GEISEL", name: "Geisel Library",                   x: 390, y: 210, lat: 32.88099, lng: -117.23744 },
  { code: "LIBS",   name: "Geisel Library",                   x: 390, y: 210, lat: 32.88099, lng: -117.23744 },
  { code: "PRICE",  name: "Price Center",                     x: 410, y: 245, lat: 32.87976, lng: -117.23748 },

  // Residential colleges
  { code: "MUIR",   name: "Muir College",                     x: 220, y: 170, lat: 32.87842, lng: -117.24162 },
  { code: "REVELLE", name: "Revelle College",                 x: 290, y: 440, lat: 32.87395, lng: -117.24206 },
  { code: "WARREN", name: "Warren College",                   x: 660, y: 170, lat: 32.88210, lng: -117.23401 },
  { code: "MARSH",  name: "Marshall College",                 x: 520, y: 170, lat: 32.88012, lng: -117.23522 },
  { code: "SIXTH",  name: "Sixth College",                    x: 560, y: 130, lat: 32.88350, lng: -117.23590 },
  { code: "SEVENTH", name: "Seventh College",                 x: 680, y: 130, lat: 32.88440, lng: -117.23300 },
  { code: "EIGHTH", name: "Eighth College",                   x: 700, y: 140, lat: 32.88390, lng: -117.23230 },

  // Recreation / student services
  { code: "RIMAC",  name: "RIMAC Arena",                      x: 240, y: 100, lat: 32.88460, lng: -117.24065 },
  { code: "SPIES",  name: "SPIES Recreation Center",          x: 230, y: 120, lat: 32.88390, lng: -117.24150 },
  { code: "SERF",   name: "Student Services Center",          x: 420, y: 215, lat: 32.87960, lng: -117.23665 },

  // Off campus
  { code: "UTC",    name: "UTC / Off Campus",                 x: 760, y: 60,  lat: 32.87090, lng: -117.21040 },
];

/** Build a Map from code → CampusLocation for O(1) lookups */
export const campusLocationMap: Map<string, CampusLocation> = new Map(
  campusLocations.map((loc) => [loc.code, loc]),
);

/**
 * Attempt to extract a UCSD building code from a raw location string.
 * e.g. "CENTER 119" → "CENTR", "WLH 2005" → "WLH", "PCYNH 109" → "PCYNH"
 */
export function resolveLocationCode(rawLocation: string): string | undefined {
  if (!rawLocation) return undefined;
  // Normalize: uppercase, collapse whitespace
  const upper = rawLocation.toUpperCase().trim();

  // Direct exact match first
  if (campusLocationMap.has(upper)) return upper;

  // Extract the first whitespace-delimited token (building code)
  const firstToken = upper.split(/\s+/)[0];
  if (firstToken && campusLocationMap.has(firstToken)) return firstToken;

  // Handle common aliases / slight misspellings
  const ALIASES: Record<string, string> = {
    CENTER:  "CENTR",
    "CTR":   "CENTR",
    "WL":    "WLH",
    "PEPPER":"PCYNH",
    "MAND":  "MANDE",
    "GH":    "GALB",
    "CSE":   "EBU3B",
    "COGNITIVE": "CSB",
    "GEISEL":"GEISEL",
    "LIB":   "GEISEL",
    "PRICE": "PRICE",
    "RIMAC": "RIMAC",
    "SKAGG": "SKAGGS",
    "BONNER":"BONNER",
    "UREY":  "UREY",
    "APM":   "APM",
  };

  if (ALIASES[firstToken]) return ALIASES[firstToken];

  // Substring match against known codes (fallback)
  for (const code of campusLocationMap.keys()) {
    if (upper.startsWith(code)) return code;
  }

  return undefined;
}
