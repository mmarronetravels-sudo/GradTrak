import { serve } from 'https://deno.land/x/supa_base@1.0.0/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { parentEmail, studentId, studentName, counselorName, schoolId } = await req.json();

    if (!parentEmail || !studentId || !schoolId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role key to create the invite
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the calling user from the auth header
    const authHeader = req.headers.get('Authorization');
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if this email already has an account
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('email', parentEmail)
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ 
        error: 'A GradTrack account already exists for this email. Use the Link Parent button instead.' 
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if invite already sent for this email + student combo
    const { data: existingInvite } = await supabaseAdmin
      .from('parent_invites')
      .select('id, is_accepted')
      .eq('parent_email', parentEmail.toLowerCase())
      .eq('student_id', studentId)
      .maybeSingle();

    if (existingInvite?.is_accepted) {
      return new Response(JSON.stringify({ 
        error: 'This parent has already accepted an invite for this student.' 
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Store or update the pending invite
    if (existingInvite) {
      await supabaseAdmin
        .from('parent_invites')
        .update({ invited_at: new Date().toISOString(), invited_by: user.id })
        .eq('id', existingInvite.id);
    } else {
      await supabaseAdmin
        .from('parent_invites')
        .insert({
          parent_email: parentEmail.toLowerCase(),
          student_id: studentId,
          school_id: schoolId,
          invited_by: user.id,
        });
    }

    // Send the Supabase invite email with redirect to GradTrack
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      parentEmail,
      {
        redirectTo: 'https://gradtrak.scholarpathsystems.org',
        data: {
          role: 'parent',
          school_id: schoolId,
          invited_as_parent: true,
        },
      }
    );

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
