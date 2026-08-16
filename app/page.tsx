import MyPlateApp from './components/MyPlateApp'

export const dynamic = 'force-dynamic'

export default function Home() {
  return <MyPlateApp supabaseConfig={{
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }} />
}
