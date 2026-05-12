"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, uploadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "", password: "", first_name: "", last_name: "", date_of_birth: "",
    nickname: "", about_me: "",
  });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();
  const { refresh } = useAuth();

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const body: any = { ...form };
      if (!body.nickname) delete body.nickname;
      if (!body.about_me) delete body.about_me;
      await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
      if (avatar) {
        const avatar_path = await uploadFile(avatar);
        await api("/api/users/me", { method: "PUT", body: JSON.stringify({ avatar_path }) });
      }
      await refresh();
      router.push("/");
    } catch (e: any) { setErr(e.message || "register failed"); }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: "40px auto" }}>
      <h2>Register</h2>
      <form onSubmit={submit}>
        <label>Email *</label>
        <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" required />
        <label>Password *</label>
        <input value={form.password} onChange={(e) => set("password", e.target.value)} type="password" required minLength={6} />
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>First name *</label>
            <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Last name *</label>
            <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} required />
          </div>
        </div>
        <label>Date of birth *</label>
        <input value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} type="date" required />
        <label>Avatar (optional)</label>
        <input type="file" accept="image/jpeg,image/png,image/gif" onChange={(e) => setAvatar(e.target.files?.[0] || null)} />
        <label>Nickname (optional)</label>
        <input value={form.nickname} onChange={(e) => set("nickname", e.target.value)} />
        <label>About me (optional)</label>
        <textarea value={form.about_me} onChange={(e) => set("about_me", e.target.value)} rows={3} />
        {err && <p style={{ color: "#c92a2a", fontSize: 13 }}>{err}</p>}
        <button className="btn" style={{ marginTop: 12 }} type="submit">Create account</button>
      </form>
    </div>
  );
}
