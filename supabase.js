import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vstiweftxjaszhnjwggb.supabase.co'
const supabaseAnonKey = 'YOUR_ANON_KEY_HERE' // Replace with your anon key

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
