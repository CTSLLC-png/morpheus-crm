import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// SECURITY: role authorization reads/writes app_metadata (server-only), never
// user_metadata (client-writable, so a caller can set it on themselves).
//
// This file was deployed to the project but absent from the repository until
// now — version 13 was recovered from the deployed source and is reproduced
// here verbatim apart from the `vendor` role noted below, so the repo and the
// deployment no longer disagree.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// `vendor` is an external partner account: view-only, scoped to the cohorts
// granted in public.vendor_cohort. It is accepted here because nothing else
// can mint it — set_default_participant_app_role only ever writes
// `participant` or `lp_customer`, so without this a vendor_user row resolves
// current_vendor_id() while the account still routes to whatever portal its
// old role implies, and the partner portal is unreachable.
//
// Note the asymmetry with `participant`: an unrecognised value still falls
// back to `participant`, the least-privileged role. Never make the fallback
// anything else.
function normalizeRole(raw: string | undefined): string {
  const r = (raw ?? "participant").toLowerCase().replace(/[\s-]+/g, "_");
  if (["participant", "trainer", "super_admin", "vendor"].includes(r)) return r;
  if (r === "admin" || r === "superadmin") return "super_admin";
  return "participant";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Authorize caller: must be a logged-in super_admin ---
    // Reads app_metadata ONLY -- never user_metadata, which the caller could
    // have set on themselves at signup.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: callerData, error: callerErr } = await admin.auth.getUser(
      token,
    );
    if (callerErr || !callerData?.user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const callerRole = (callerData.user.app_metadata?.role ?? "") as string;
    if (callerRole !== "super_admin") {
      return json({ error: "Only super admins can create accounts" }, 403);
    }

    // --- Parse payload (tolerant to key naming) ---
    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body.email ?? body.email_address ??
      body.emailAddress;
    const password: string | undefined = body.password ??
      body.temp_password ?? body.tempPassword ?? body.temporary_password ??
      body.temporaryPassword;
    const fullName: string | undefined = body.full_name ?? body.fullName ??
      body.name;
    const role = normalizeRole(body.role ?? body.account_type ?? body.accountType);
    const programSource: string | undefined = body.program_source ??
      body.programSource;
    const title: string | undefined = body.title;
    const phone: string | undefined = body.phone;

    if (!email || !password || !fullName) {
      return json(
        { error: "Missing required fields: full name, email, and password" },
        400,
      );
    }
    if (role === "participant" && !programSource) {
      return json({ error: "Program source is required for participants" }, 400);
    }

    // --- Create auth user ---
    const { data: created, error: createErr } = await admin.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role },
        user_metadata: { full_name: fullName },
      });
    if (createErr || !created?.user) {
      return json(
        { error: createErr?.message ?? "Failed to create auth user" },
        400,
      );
    }
    const newUserId = created.user.id;

    // --- Create profile row ---
    if (role === "participant") {
      const { data: participant, error: pErr } = await admin
        .from("participants")
        .insert({
          user_id: newUserId,
          full_name: fullName,
          program_source: programSource,
        })
        .select("id, cts_id")
        .single();
      if (pErr) {
        await admin.auth.admin.deleteUser(newUserId);
        return json({ error: `Participant record failed: ${pErr.message}` }, 400);
      }
      return json({
        success: true,
        user_id: newUserId,
        participant_id: participant.id,
        cts_id: participant.cts_id,
        role,
      });
    } else if (role === "vendor") {
      // A vendor owns no profile row. Their identity is the auth account; what
      // they may see comes entirely from public.vendor_user and
      // public.vendor_cohort, attached afterwards in the partner admin screen.
      // Deliberately no staff_profiles row: a partner is not staff, and one
      // here would put an external organisation in the staff directory.
      return json({
        success: true,
        user_id: newUserId,
        role,
        next: "Attach this account to a partner organisation and grant it cohorts in Partner access.",
      });
    } else {
      const { data: staff, error: sErr } = await admin
        .from("staff_profiles")
        .insert({
          user_id: newUserId,
          full_name: fullName,
          title: title ?? (role === "trainer" ? "Trainer" : "Super Admin"),
          phone: phone ?? null,
        })
        .select("id")
        .single();
      if (sErr) {
        await admin.auth.admin.deleteUser(newUserId);
        return json({ error: `Staff record failed: ${sErr.message}` }, 400);
      }
      return json({
        success: true,
        user_id: newUserId,
        staff_id: staff.id,
        role,
      });
    }
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
