import { supabase } from '@/lib/supabase'

describe('Supabase Connection', () => {
    it('should have a valid Supabase client', () => {
        expect(supabase).toBeDefined()
        expect(typeof supabase.from).toBe('function')
    })

    it('should connect to the jobs table successfully', async () => {
        const { data, error } = await supabase
            .from('jobs')
            .select('id')
            .limit(1)

        expect(error).toBeNull()
        expect(data).toBeDefined()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should connect to the companies table successfully', async () => {
        const { data, error } = await supabase
            .from('companies')
            .select('id')
            .limit(1)

        expect(error).toBeNull()
        expect(data).toBeDefined()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should return an error for a non-existent table', async () => {
        const { error } = await supabase
            .from('non_existent_table')
            .select('*')
            .limit(1)

        expect(error).not.toBeNull()
    })
})
