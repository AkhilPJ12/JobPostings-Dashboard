/**
 * Test script to verify Supabase connection and data fetching
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

console.log('🔍 Testing Supabase connection...')
console.log('URL:', supabaseUrl)
console.log('Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'MISSING')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
    try {
        // Test 1: Fetch companies
        console.log('\n📊 Test 1: Fetching companies...')
        const { data: companies, error: companiesError } = await supabase
            .from('companies')
            .select('*')

        if (companiesError) {
            console.error('❌ Companies error:', companiesError)
        } else {
            console.log('✅ Companies fetched:', companies?.length)
        }

        // Test 2: Fetch jobs (simple)
        console.log('\n💼 Test 2: Fetching jobs (simple)...')
        const { data: jobs, error: jobsError } = await supabase
            .from('jobs')
            .select('*')

        if (jobsError) {
            console.error('❌ Jobs error:', jobsError)
        } else {
            console.log('✅ Jobs fetched:', jobs?.length)
            console.log('First job:', jobs?.[0])
        }

        // Test 3: Fetch jobs with company join
        console.log('\n🔗 Test 3: Fetching jobs with company join...')
        const { data: jobsWithCompany, error: joinError } = await supabase
            .from('jobs')
            .select(`
        *,
        company:companies(*)
      `)
            .eq('is_active', true)
            .order('posted_date', { ascending: false })

        if (joinError) {
            console.error('❌ Join error:', joinError)
        } else {
            console.log('✅ Jobs with company fetched:', jobsWithCompany?.length)
            console.log('First job with company:', jobsWithCompany?.[0])
        }

    } catch (error) {
        console.error('❌ Test failed:', error)
    }
}

testConnection()
