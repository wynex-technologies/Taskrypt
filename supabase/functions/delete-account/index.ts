// Supabase Edge Function: permanently delete the CALLING user's account.
//
// Runs server-side with the service-role key (injected by Supabase as an
// environment secret — it never ships in the mobile app). The caller is
// identified ONLY from their verified JWT; no user id is accepted from the body.
//
// Steps: verify JWT → delete every storage object under <uid>/ → delete the auth
// user (rows cascade through ON DELETE CASCADE foreign keys).
//
// Deploy:  supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = Deno.env.get('DOCUMENT_BUCKET') ?? 'vault';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'unauthorized' });

  let body: { confirm?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body
  }
  if (body.confirm !== true) return json(400, { error: 'confirmation_required' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Verify the JWT with the Auth server (not just decode it).
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json(401, { error: 'unauthorized' });
  const uid = userData.user.id;

  // 1. Remove every object under the user's prefix (paged; folders are <uid>/<docId>/<obj>).
  try {
    for (let guard = 0; guard < 1000; guard++) {
      const { data: docs, error } = await admin.storage.from(BUCKET).list(uid, { limit: 100 });
      if (error) throw error;
      if (!docs || docs.length === 0) break;
      const paths: string[] = [];
      for (const d of docs) {
        const { data: objects } = await admin.storage.from(BUCKET).list(`${uid}/${d.name}`, { limit: 100 });
        for (const o of objects ?? []) paths.push(`${uid}/${d.name}/${o.name}`);
      }
      if (paths.length === 0) break;
      const { error: rmError } = await admin.storage.from(BUCKET).remove(paths);
      if (rmError) throw rmError;
    }
  } catch (e) {
    console.error('storage cleanup failed', (e as Error).message);
    return json(500, { error: 'storage_cleanup_failed' });
  }

  // 2. Delete the auth user; profiles, tasks, documents … cascade.
  const { error: delError } = await admin.auth.admin.deleteUser(uid);
  if (delError) {
    console.error('auth delete failed', delError.message);
    return json(500, { error: 'delete_failed' });
  }

  return json(200, { deleted: true });
});
