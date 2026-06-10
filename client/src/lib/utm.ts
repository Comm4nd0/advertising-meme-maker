export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

/**
 * Append UTM tracking parameters to a URL so QR scans can be attributed to a
 * specific export. Existing utm_* params are never overwritten, a missing
 * scheme defaults to https, and anything unparseable is returned unchanged.
 */
export function withUtm(rawUrl: string, utm: UtmParams): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL('https://' + trimmed);
    } catch {
      return trimmed;
    }
  }

  const entries: Record<string, string | undefined> = {
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
  };
  for (const [key, value] of Object.entries(entries)) {
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
