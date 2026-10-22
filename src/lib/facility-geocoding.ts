export type FacilityAddress = {
  name: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export type FacilityGeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  confidence: "high" | "review";
  matchType: string;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  class?: string;
  type?: string;
  importance?: number;
  address?: {
    country_code?: string;
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
  };
};

const timeoutMs = 8000;
const minimumRequestIntervalMs = 1100;
const resultCache = new Map<string, FacilityGeocodeResult | null>();
let lastRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

function normalise(value: string | undefined) {
  return String(value || "").trim().replace(/\\s+/g, " ");
}

function confidenceFor(result: NominatimResult): "high" | "review" | null {
  const klass = normalise(result.class).toLowerCase();
  const type = normalise(result.type).toLowerCase();
  const a = result.address || {};
  if (a.country_code && a.country_code.toLowerCase() !== "in") return null;
  if (klass === "amenity" && ["hospital", "clinic", "doctors", "healthcare"].includes(type)) return "high";
  if (klass === "healthcare" && ["hospital", "clinic", "doctor", "centre", "center"].includes(type)) return "high";
  if (klass === "building" && ["hospital", "clinic", "healthcare"].includes(type)) return "high";
  if ((klass === "building" || type === "house" || type === "residential") &&
      Boolean(a.road) && Boolean(a.house_number || a.postcode) && Boolean(a.city || a.town || a.village || a.suburb)) {
    return "review";
  }
  if (klass === "amenity" && ["hospital", "clinic", "doctors"].includes(type)) return "high";
  return null;
}

async function waitForRequestSlot() {
  const task = requestQueue.then(async () => {
    const delay = Math.max(0, minimumRequestIntervalMs - (Date.now() - lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
  });
  requestQueue = task.catch(() => undefined);
  await task;
}

/**
 * Address geocoding is called only when an administrator adds a facility or
 * explicitly prepares that facility's geofence. Results are cached per process;
 * accepted coordinates are persisted on that clinic so the same address is not
 * geocoded on every attendance punch.
 *
 * The public Nominatim service has a strict 1 request/second policy. Keep this
 * call user-triggered/low-volume, identify MedLum, and retain OSM attribution in UI.
 */
export async function geocodeFacilityAddress(input: FacilityAddress): Promise<FacilityGeocodeResult | null> {
  const parts = [
    normalise(input.name),
    normalise(input.address),
    normalise(input.city),
    normalise(input.state),
    normalise(input.pincode),
    "India",
  ].filter(Boolean);
  if (parts.length < 3) return null;
  const query = parts.join(", ");
  const cacheKey = query.toLocaleLowerCase("en-IN");
  if (resultCache.has(cacheKey)) return resultCache.get(cacheKey) || null;

  await waitForRequestSlot();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "5");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MedLumHealth/0.2.1 (+https://medlumhealth.com)",
        "Accept-Language": "en",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Facility geocoding failed with HTTP ${response.status}`);
    const payload = await response.json() as NominatimResult[];
    const candidates = Array.isArray(payload) ? payload : [];
    const acceptable = candidates
      .map((candidate) => ({ candidate, confidence: confidenceFor(candidate) }))
      .filter((x): x is { candidate: NominatimResult; confidence: "high" | "review" } => x.confidence !== null)
      .sort((a, b) => (a.confidence === b.confidence ? (Number(b.candidate.importance || 0) - Number(a.candidate.importance || 0)) : a.confidence === "high" ? -1 : 1));
    const best = acceptable[0];
    if (!best) {
      resultCache.set(cacheKey, null);
      return null;
    }
    const lat = Number(best.candidate.lat);
    const lng = Number(best.candidate.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 6 || lat > 38 || lng < 68 || lng > 98) {
      resultCache.set(cacheKey, null);
      return null;
    }
    const result: FacilityGeocodeResult = {
      lat,
      lng,
      label: normalise(best.candidate.display_name) || query,
      confidence: best.confidence,
      matchType: `${normalise(best.candidate.class)}/${normalise(best.candidate.type)}`,
    };
    resultCache.set(cacheKey, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
