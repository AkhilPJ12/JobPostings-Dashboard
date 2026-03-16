/**
 * One-time migration: normalize all existing job departments
 * to the 15 standard categories.
 *
 * Usage: npx tsx scripts/migrate-departments.ts
 */

import { supabase, normalizeDepartment } from './scraper-utils'

async function migrateDepartments() {
    console.log('🔄 Fetching all jobs...')

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, department, title')

    if (error) {
        console.error('❌ Error fetching jobs:', error.message)
        process.exit(1)
    }

    if (!jobs || jobs.length === 0) {
        console.log('No jobs found.')
        return
    }

    console.log(`📊 Found ${jobs.length} jobs`)

    // Group updates by new department to minimize queries
    const updates: { id: number; newDept: string }[] = []
    const stats: Record<string, number> = {}

    for (const job of jobs) {
        const newDept = normalizeDepartment(job.department || 'General', job.title || '')
        if (newDept !== job.department) {
            updates.push({ id: job.id, newDept })
        }
        stats[newDept] = (stats[newDept] || 0) + 1
    }

    console.log(`\n📋 Department distribution after normalization:`)
    const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1])
    for (const [dept, count] of sorted) {
        console.log(`   ${count.toString().padStart(5)} - ${dept}`)
    }

    console.log(`\n🔄 ${updates.length} jobs need updating (${jobs.length - updates.length} already correct)`)

    if (updates.length === 0) {
        console.log('✅ Nothing to update.')
        return
    }

    // Batch update
    const batchSize = 100
    let updated = 0

    for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize)

        // Update each job individually (Supabase doesn't support bulk conditional updates)
        for (const { id, newDept } of batch) {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ department: newDept })
                .eq('id', id)

            if (updateError) {
                console.error(`   ❌ Error updating job ${id}:`, updateError.message)
            } else {
                updated++
            }
        }

        console.log(`   📦 Updated ${Math.min(i + batchSize, updates.length)}/${updates.length}`)
    }

    console.log(`\n✅ Done! Updated ${updated} jobs.`)
}

migrateDepartments().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
