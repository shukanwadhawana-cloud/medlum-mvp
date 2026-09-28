/**
 * Platform default locale / currency / timezone for multi-region readiness.
 *
 * Defaults preserve existing India deployment behaviour.
 * Override via environment for future US (or other) deployments:
 *   MEDLUM_DEFAULT_TIMEZONE=America/New_York
 *   MEDLUM_DEFAULT_CURRENCY=USD
 *   MEDLUM_DEFAULT_LOCALE=en-US
 *   MEDLUM_DEFAULT_COUNTRY=US
 *
 * Facility-specific overrides are intentionally deferred until a Clinic field
 * is approved via migration. Do not invent a second settings architecture here.
 */

export type MedLumLocaleConfig = {
  timezone: string;
  currency: string;
  locale: string;
  country: string;
};

const DEFAULTS: MedLumLocaleConfig = {
  timezone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
  country: "IN",
};

function envOr(key: string, fallback: string): string {
  const v = String(process.env[key] || "").trim();
  return v || fallback;
}

export function getPlatformLocaleConfig(): MedLumLocaleConfig {
  return {
    timezone: envOr("MEDLUM_DEFAULT_TIMEZONE", DEFAULTS.timezone),
    currency: envOr("MEDLUM_DEFAULT_CURRENCY", DEFAULTS.currency).toUpperCase(),
    locale: envOr("MEDLUM_DEFAULT_LOCALE", DEFAULTS.locale),
    country: envOr("MEDLUM_DEFAULT_COUNTRY", DEFAULTS.country).toUpperCase(),
  };
}

/** Clinical display timezone (platform default until per-clinic config exists). */
export function getClinicalTimezone(): string {
  return getPlatformLocaleConfig().timezone;
}

export function formatMoney(
  amount: number,
  opts?: { currency?: string; locale?: string; maximumFractionDigits?: number }
): string {
  const cfg = getPlatformLocaleConfig();
  const currency = (opts?.currency || cfg.currency).toUpperCase();
  const locale = opts?.locale || cfg.locale;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
      minimumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    // Fallback if an invalid currency code is configured
    return `${currency} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

export function currencySymbol(currency?: string): string {
  const code = (currency || getPlatformLocaleConfig().currency).toUpperCase();
  try {
    const parts = new Intl.NumberFormat(getPlatformLocaleConfig().locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || code;
  } catch {
    return code;
  }
}
