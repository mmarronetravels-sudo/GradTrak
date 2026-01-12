import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vstiweftxjaszhnjwggb.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdGl3ZWZ0eGphc3pobmp3Z2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNTQ0NjcsImV4cCI6MjA4MzgzMDQ2N30.qY9ky3YBFlWHTG39eJpwqwghaOuEseosGZ1eMRZDi2k' // Replace with your anon key

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
