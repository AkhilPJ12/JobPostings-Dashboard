import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated'

export type { Database, Json } from './database.generated'

let supabaseClient: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
    if (supabaseClient) return supabaseClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        )
    }

    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey)
    return supabaseClient
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
    get(_target, prop) {
        const client = getSupabaseClient()
        const value = (client as any)[prop]
        return typeof value === 'function' ? value.bind(client) : value
    },
})
