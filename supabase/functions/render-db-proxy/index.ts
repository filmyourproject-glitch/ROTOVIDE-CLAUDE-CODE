import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-render-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate via RENDER_SECRET
  const secret = req.headers.get("X-Render-Secret");
  const expectedSecret = Deno.env.get("RENDER_SECRET");

  if (!secret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Query a table ──
      case "select": {
        const { table, columns = "*", filters = [], single = false } = body;
        let query = supabase.from(table).select(columns);
        for (const f of filters) {
          if (f.op === "eq") query = query.eq(f.column, f.value);
          else if (f.op === "is") query = query.is(f.column, f.value === "null" ? null : f.value);
          else if (f.op === "in") query = query.in(f.column, f.value);
        }
        if (single) query = query.single();
        const { data, error } = await query;
        if (error) throw error;
        return json({ data });
      }

      // ── Update rows ──
      case "update": {
        const { table, values, filters = [] } = body;
        let query = supabase.from(table).update(values);
        for (const f of filters) {
          if (f.op === "eq") query = query.eq(f.column, f.value);
        }
        const { data, error } = await query.select();
        if (error) throw error;
        return json({ data });
      }

      // ── Insert rows ──
      case "insert": {
        const { table, values } = body;
        const { data, error } = await supabase.from(table).insert(values).select();
        if (error) throw error;
        return json({ data });
      }

      // ── Get signed storage URL ──
      case "signed_url": {
        const { bucket = "media", path, expires_in = 3600 } = body;
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, expires_in);
        if (error) throw error;
        return json({ signedUrl: data.signedUrl });
      }

      // ── Call an RPC function ──
      case "rpc": {
        const { fn, args = {} } = body;
        const { data, error } = await supabase.rpc(fn, args);
        if (error) throw error;
        return json({ data });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("render-db-proxy error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
