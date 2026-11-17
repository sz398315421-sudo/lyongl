export interface SupabaseBrowserConfig {
  url: string;
  publishableKey: string;
}

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? ''
).trim();

export function getSupabaseConfig(): SupabaseBrowserConfig | null {
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') return null;
    return { url: parsed.origin, publishableKey };
  } catch {
    return null;
  }
}
