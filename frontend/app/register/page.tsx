"use client";

import Link from "next/link";
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
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { refresh } = useAuth();

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const avatarPreview = avatar ? URL.createObjectURL(avatar) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
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
    } catch (e: any) {
      setErr(e.message || "register failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card wide">
        <h1>Join SocialNet</h1>
        <p className="sub">Build your profile and start connecting in seconds.</p>
        <form onSubmit={submit}>
          <div className="row" style={{ alignItems: "center", gap: 16, marginBottom: 8 }}>
            <label htmlFor="avatar-input" style={{ cursor: "pointer", margin: 0 }}>
              {avatarPreview ? (
                <img className="avatar lg ring" src={avatarPreview} alt="" />
              ) : (
                <span className="avatar lg ring" aria-hidden />
              )}
            </label>
            <div style={{ flex: 1 }}>
              <label htmlFor="avatar-input">Avatar (optional)</label>
              <input
                id="avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/gif"
                onChange={(e) => setAvatar(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <label>Email *</label>
          <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" required />

          <label>Password *</label>
          <input value={form.password} onChange={(e) => set("password", e.target.value)} type="password" required minLength={6} />

          <div className="row" style={{ gap: 12 }}>
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

          <label>Nickname (optional)</label>
          <input value={form.nickname} onChange={(e) => set("nickname", e.target.value)} placeholder="@you" />

          <label>About me (optional)</label>
          <textarea value={form.about_me} onChange={(e) => set("about_me", e.target.value)} rows={3} placeholder="A short bio…" />

          {err && <div className="error">{err}</div>}

          <button className="btn" style={{ marginTop: 18, width: "100%" }} type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : "Create account"}
          </button>
        </form>
        <p className="muted" style={{ textAlign: "center", marginTop: 18 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
