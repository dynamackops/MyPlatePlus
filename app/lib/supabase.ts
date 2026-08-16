import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type SupabasePublicConfig = {
  url?: string
  publishableKey?: string
}

export function createSupabaseClient(config: SupabasePublicConfig) {
  const { url, publishableKey } = config
  return url && publishableKey && !url.includes('your-project')
    ? createClient(url, publishableKey)
    : null
}

export async function requestMagicLink(supabase: SupabaseClient | null, email: string) {
  if (!supabase) return { error: new Error('Supabase is not configured.') }
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
}

export async function invokePlateAssistant(supabase: SupabaseClient | null, mode: 'brain_dump' | 'make_room', payload: unknown) {
  if (!supabase) return { data: null, error: new Error('AI is available after Supabase setup.') }
  return supabase.functions.invoke('plate-assistant', { body: { mode, payload } })
}
