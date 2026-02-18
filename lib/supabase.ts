import { createClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase environment variables. Please check your .env.local file.'
    )
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types (will be auto-generated later with Supabase CLI)
export type Database = {
    public: {
        Tables: {
            companies: {
                Row: {
                    id: number
                    name: string
                    logo_url: string | null
                    website_url: string | null
                    careers_url: string | null
                    color: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: number
                    name: string
                    logo_url?: string | null
                    website_url?: string | null
                    careers_url?: string | null
                    color?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: number
                    name?: string
                    logo_url?: string | null
                    website_url?: string | null
                    careers_url?: string | null
                    color?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            jobs: {
                Row: {
                    id: number
                    company_id: number
                    title: string
                    location: string | null
                    location_type: 'Remote' | 'Hybrid' | 'Onsite' | null
                    department: string | null
                    employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
                    posted_date: string | null
                    description: string | null
                    summary: string | null
                    required_qualifications: string[] | null
                    preferred_qualifications: string[] | null
                    pay_range: string | null
                    security_clearance: 'Yes' | 'No' | 'N/A' | null
                    h1b_sponsorship: 'Yes' | 'No' | 'N/A' | null
                    job_url: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: number
                    company_id: number
                    title: string
                    location?: string | null
                    location_type?: 'Remote' | 'Hybrid' | 'Onsite' | null
                    department?: string | null
                    employment_type?: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
                    posted_date?: string | null
                    description?: string | null
                    summary?: string | null
                    required_qualifications?: string[] | null
                    preferred_qualifications?: string[] | null
                    pay_range?: string | null
                    security_clearance?: 'Yes' | 'No' | 'N/A' | null
                    h1b_sponsorship?: 'Yes' | 'No' | 'N/A' | null
                    job_url?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: number
                    company_id?: number
                    title?: string
                    location?: string | null
                    location_type?: 'Remote' | 'Hybrid' | 'Onsite' | null
                    department?: string | null
                    employment_type?: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
                    posted_date?: string | null
                    description?: string | null
                    summary?: string | null
                    required_qualifications?: string[] | null
                    preferred_qualifications?: string[] | null
                    pay_range?: string | null
                    security_clearance?: 'Yes' | 'No' | 'N/A' | null
                    h1b_sponsorship?: 'Yes' | 'No' | 'N/A' | null
                    job_url?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
        }
    }
}
