"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const { refresh } = useAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await refresh();
      router.push("/");
    } catch (e: any) { setErr(e.message || "login failed"); }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Login</h2>
      <form onSubmit={submit}>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        {err && <p style={{ color: "#c92a2a", fontSize: 13 }}>{err}</p>}
        <button className="btn" style={{ marginTop: 12 }} type="submit">Sign in</button>
      </form>
    </div>
  );
}
