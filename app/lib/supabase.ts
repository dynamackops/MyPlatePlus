import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && key && !url.includes('your-project'))
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

export async function requestMagicLink(email: string) {
  if (!supabase) return { error: new Error('Supabase is not configured.') }
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
}

export async function invokePlateAssistant(mode: 'brain_dump' | 'make_room', payload: unknown) {
  if (!supabase) return { data: null, error: new Error('AI is available after Supabase setup.') }
  return supabase.functions.invoke('plate-assistant', { body: { mode, payload } })
}
