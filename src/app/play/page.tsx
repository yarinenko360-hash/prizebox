"use client";

import { useEffect, useState } from "react";

export default function PlayPage() {
  const [tickets, setTickets] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(data => setTickets(data.tickets));
  }, []);

  const handlePlay = async () => {
    const res = await fetch("/api/play", { method: "POST" });
    const data = await res.json();
    setResult(data.result);
    setTickets(data.tickets);
  };

  if (tickets === null) return <div>Loading...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>Tickets: {tickets}</h1>

      <button onClick={handlePlay} disabled={tickets === 0}>
        Играть
      </button>

      {result && <h2>Result: {result}</h2>}
    </div>
  );
}