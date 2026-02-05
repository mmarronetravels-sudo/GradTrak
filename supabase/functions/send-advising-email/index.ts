import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT and get the user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender profile (counselor/admin)
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .single();

    if (!senderProfile || !["counselor", "admin", "case_manager"].includes(senderProfile.role)) {
      return new Response(JSON.stringify({ error: "Only counselors, admins, and case managers can send emails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request body ──
    const {
      studentId,
      studentName,
      studentEmail,
      recipientEmails = [],
      subject,
      contentType,
      notesHtml,
      planHtml,
    } = await req.json();

    if (!studentEmail || !subject || !contentType) {
      return new Response(JSON.stringify({ error: "Missing required fields: studentEmail, subject, contentType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build email HTML ──
    const emailHtml = buildEmailHtml({
      studentName: studentName || "Student",
      senderName: senderProfile.full_name || "Your Counselor",
      senderEmail: senderProfile.email,
      contentType,
      notesHtml,
      planHtml,
    });

    // ── Send via Resend ──
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "advising@gradtrak.scholarpathsystems.org";

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build recipient list: student + any CCs
    const toEmails = [studentEmail];
    const ccEmails = recipientEmails.filter((e: string) => e && e.includes("@"));

    const resendPayload: Record<string, unknown> = {
      from: `GradTrack Advising <${FROM_EMAIL}>`,
      to: toEmails,
      subject: subject,
      html: emailHtml,
      reply_to: senderProfile.email,
    };

    if (ccEmails.length > 0) {
      resendPayload.cc = ccEmails;
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      // Log the failure
      await supabase.from("email_audit_logs").insert({
        sender_id: user.id,
        sender_email: senderProfile.email,
        sender_role: senderProfile.role,
        student_id: studentId,
        student_name: studentName,
        student_email: studentEmail,
        recipient_emails: ccEmails,
        subject,
        content_type: contentType,
        status: "failed",
        error_message: resendData?.message || "Resend API error",
      });

      return new Response(JSON.stringify({ error: "Failed to send email", details: resendData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Log success for FERPA audit ──
    await supabase.from("email_audit_logs").insert({
      sender_id: user.id,
      sender_email: senderProfile.email,
      sender_role: senderProfile.role,
      student_id: studentId,
      student_name: studentName,
      student_email: studentEmail,
      recipient_emails: ccEmails,
      subject,
      content_type: contentType,
      status: "sent",
      resend_message_id: resendData.id || null,
    });

    return new Response(JSON.stringify({ success: true, messageId: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ════════════════════════════════════════════
//  Build the full email HTML
// ════════════════════════════════════════════
function buildEmailHtml({
  studentName,
  senderName,
  senderEmail,
  contentType,
  notesHtml,
  planHtml,
}: {
  studentName: string;
  senderName: string;
  senderEmail: string;
  contentType: string;
  notesHtml?: string;
  planHtml?: string;
}) {
  const contentTitle =
    contentType === "notes" ? "Advising Notes" :
    contentType === "plan" ? "Graduation Progress" :
    "Advising Summary";

  let bodyContent = "";

  if ((contentType === "notes" || contentType === "both") && notesHtml) {
    bodyContent += `
      <h2 style="font-size: 16px; color: #1e293b; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">
        📝 Advising Notes
      </h2>
      ${notesHtml}
    `;
  }

  if ((contentType === "plan" || contentType === "both") && planHtml) {
    bodyContent += `
      <h2 style="font-size: 16px; color: #1e293b; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">
        📋 Graduation Progress
      </h2>
      ${planHtml}
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px 40px; border-radius: 16px 16px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">
                🎓 GradTrack
              </h1>
              <p style="margin: 6px 0 0 0; color: #c7d2fe; font-size: 14px;">
                ${contentTitle} — ${studentName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background: #ffffff; padding: 32px 40px;">
              <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">
                Hi ${studentName},
              </p>
              <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 24px 0;">
                Your counselor, <strong>${senderName}</strong>, has shared your ${contentTitle.toLowerCase()} from GradTrack. Please review the information below.
              </p>

              ${bodyContent}

              <!-- CTA -->
              <div style="margin: 32px 0; text-align: center;">
                <a href="https://gradtrak.scholarpathsystems.org"
                   style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
                  View My Progress in GradTrack →
                </a>
              </div>

              <!-- Contact -->
              <div style="background: #f8fafc; border-radius: 12px; padding: 16px 20px; margin-top: 24px;">
                <p style="font-size: 13px; color: #64748b; margin: 0;">
                  <strong>Questions?</strong> Reply to this email or contact your counselor at
                  <a href="mailto:${senderEmail}" style="color: #4f46e5;">${senderEmail}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- FERPA Notice -->
          <tr>
            <td style="background: #fefce8; padding: 16px 40px; border-top: 1px solid #fef08a;">
              <p style="font-size: 11px; color: #854d0e; margin: 0; line-height: 1.5;">
                🔒 <strong>FERPA Notice:</strong> This email contains confidential student education records
                protected under the Family Educational Rights and Privacy Act (FERPA), 20 U.S.C. § 1232g.
                This information is intended solely for the named recipient(s). If you received this in error,
                please delete it immediately and notify the sender.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-radius: 0 0 16px 16px; background: #f8fafc;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                Sent by GradTrack · Summit Learning Charter
              </p>
              <p style="font-size: 11px; color: #cbd5e1; margin: 4px 0 0 0;">
                gradtrak.scholarpathsystems.org · © 2026 ScholarPath Systems
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}