// Single source of truth for hosts allowed to serve images rendered via
// next/image — used by next.config.ts's remotePatterns/CSP img-src AND by
// any API route accepting a user/bot-submitted image URL, so the two never
// drift out of sync (an imageUrl that passes schema validation but isn't in
// remotePatterns throws at render time for every visitor viewing that page).
export function getAllowedImageHostnames(): string[] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : '';
  return ['images.unsplash.com', ...(supabaseHostname ? [supabaseHostname] : [])];
}

export function isAllowedImageUrl(url: string): boolean {
  try {
    return getAllowedImageHostnames().includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
