import { config } from './config.js';

export async function getClient() {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url) ||
      !config.publishableKey.startsWith('sb_publishable_')) {
    throw new Error('Cloud setup is not finished. Follow supabase/SETUP.md and fill in homework/config.js.');
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.117.3');
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(15000) }) },
  });
}
