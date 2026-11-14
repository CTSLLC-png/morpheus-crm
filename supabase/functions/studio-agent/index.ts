// Nguzo Creator Studio: studio-agent
// The one door the cloud render worker uses to put finished renders into the
// private studio-assets bucket and list them in the asset vault. It lets a
// render finish end to end with nobody signed in at a browser.
//
// What a key holder can do, and nothing else:
//   ping         → confirm the key works
//   sign_upload  → get a one-time upload link for a path under renders/
//   register     → add vault rows (studio_asset) for files already uploaded
//
// Auth: x-studio-key header, compared (by SHA-256, constant time) with the
// STUDIO_AGENT_KEY function secret. The service-role key never leaves
// Supabase. No CORS headers on purpose: this is server-to-server only, so a
// browser page cannot call it. If the secret is missing or short, every
// request is refused.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "studio-assets";
const PREFIX = "renders/";
const MIN_KEY_LENGTH = 32;
const KIND_BY_EXT: Record<string, { kind: string; mime: string }> = {
  mp4: { kind: "video", mime: "video/mp4" },
  jpg: { kind: "image", mime: "image/jpeg" },
  png: { kind: "image", mime: "image/png" },
  wav: { kind: "audio", mime: "audio/wav" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  srt: { kind: "doc", mime: "text/plain" },
  txt: { kind: "doc", mime: "text/plain" },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function safePath(p: unknown): string | null {
  if (typeof p !== "string" || !p.startsWith(PREFIX) || p.includes("..") || p.includes("//") || p.length > 300) return null;
  if (!/^[A-Za-z0-9_\-./]+$/.test(p)) return null;
  return extOf(p) in KIND_BY_EXT ? p : null;
}
const extOf = (p: string) => p.split(".").pop()!.toLowerCase();
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const expected = Deno.env.get("STUDIO_AGENT_KEY") ?? "";
  if (expected.length < MIN_KEY_LENGTH) return json({ error: "studio-agent is not configured" }, 503);
  const given = req.headers.get("x-studio-key") ?? "";
  if (!given || !sameBytes(await sha256(given), await sha256(expected))) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  if (body.action === "ping") return json({ ok: true });

  if (body.action === "sign_upload") {
    const path = safePath(body.path);
    if (!path) return json({ error: "path must be under renders/, use [A-Za-z0-9_-./] and end in an allowed file type" }, 400);
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, path, url: data.signedUrl, content_type: KIND_BY_EXT[extOf(path)].mime });
  }

  if (body.action === "register") {
    let projectId: string | null = null;
    if (body.project_id != null && body.project_id !== "") {
      if (typeof body.project_id !== "string" || !UUID.test(body.project_id)) return json({ error: "project_id must be a uuid" }, 400);
      const { data: p, error } = await sb.from("studio_project").select("id").eq("id", body.project_id).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!p) return json({ error: "project not found" }, 404);
      projectId = p.id;
    }
    const items = Array.isArray(body.assets) ? body.assets : [];
    if (!items.length || items.length > 20) return json({ error: "assets must list 1 to 20 files" }, 400);

    const rows = [];
    for (const item of items as Record<string, unknown>[]) {
      const path = safePath(item?.path);
      if (!path) return json({ error: `bad path: ${String(item?.path).slice(0, 120)}` }, 400);
      // Only list files that really are in the bucket.
      const slash = path.lastIndexOf("/");
      const { data: found, error } = await sb.storage.from(BUCKET)
        .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 100 });
      if (error) return json({ error: error.message }, 500);
      if (!found?.some((f) => f.name === path.slice(slash + 1))) return json({ error: `not uploaded yet: ${path}` }, 409);
      rows.push({
        project_id: projectId,
        name: clip(item.name, 200) || path.slice(slash + 1),
        kind: KIND_BY_EXT[extOf(path)].kind,
        storage_path: path,
        tags: ["render", ...(Array.isArray(item.tags) ? item.tags : []).map((t) => clip(t, 40).toLowerCase()).filter(Boolean)].slice(0, 12),
        notes: clip(item.notes, 2000) || null,
        source: "render-worker",
      });
    }

    // Re-running a job must not list the same file twice.
    const { data: existing, error: exErr } = await sb.from("studio_asset").select("storage_path")
      .in("storage_path", rows.map((r) => r.storage_path));
    if (exErr) return json({ error: exErr.message }, 500);
    const have = new Set((existing ?? []).map((e) => e.storage_path));
    const fresh = rows.filter((r) => !have.has(r.storage_path));
    if (fresh.length) {
      const { error } = await sb.from("studio_asset").insert(fresh);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, registered: fresh.length, already_listed: rows.length - fresh.length, project_id: projectId });
  }

  return json({ error: "action must be ping | sign_upload | register" }, 400);
});
