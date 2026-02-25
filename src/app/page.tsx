// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setStatus("Supabase ERROR: " + error.message);
        return;
      }

      const has = !!data.session;
      const userId = data.session?.user?.id ?? "-";
      setStatus(`Supabase OK ✅ (session: ${has ? "yes" : "no"}) user: ${userId}`);
    })();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Prize Box</h1>
      <p>{status}</p>

      <div style={{ marginTop: 16, opacity: 0.7 }}>
        <div>/admin — админка</div>
        <div>/admin/login — вход админа</div>
      </div>
    </main>
  );
}