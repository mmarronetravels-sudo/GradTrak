import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vstiweftxjaszhnjwggb.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdGl3ZWZ0eGphc3pobmp3Z2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNTQ0NjcsImV4cCI6MjA4MzgzMDQ2N30.qY9ky3YBFlWHTG39eJpwqwghaOuEseosGZ1eMRZDi2k'
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
   },
})
// ============================================
// DIPLOMA TYPE FUNCTIONS
// ============================================

// Fetch all diploma types for a school
export async function getDiplomaTypes(schoolId) {
  const { data, error } = await supabase
    .from('diploma_types')
    .select('*')
    .eq('school_id', schoolId)
    .order('total_credits', { ascending: true })
  
  if (error) {
    console.error('Error fetching diploma types:', error)
    return []
  }
  return data
}

// Fetch credit requirements for a specific diploma type
export async function getDiplomaRequirements(diplomaTypeId) {
  const { data, error } = await supabase
    .from('diploma_requirements')
    .select(`
      *,
      credit_categories (
        id,
        name,
        code
      )
    `)
    .eq('diploma_type_id', diplomaTypeId)
  
  if (error) {
    console.error('Error fetching diploma requirements:', error)
    return []
  }
  return data
}

// Fetch diploma types with their requirements (combined)
export async function getDiplomaTypesWithRequirements(schoolId) {
  const diplomaTypes = await getDiplomaTypes(schoolId)
  
  // Fetch requirements for each diploma type
  const diplomaTypesWithReqs = await Promise.all(
    diplomaTypes.map(async (diploma) => {
      const requirements = await getDiplomaRequirements(diploma.id)
      return {
        ...diploma,
        requirements
      }
    })
  )
  
  return diplomaTypesWithReqs
}
