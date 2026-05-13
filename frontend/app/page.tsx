"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, mediaURL, uploadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

type Post = {
  id: string; user_id: string; author_name: string; author_avatar?: string;
  content: string; image_path?: string; privacy: string; group_id?: string;
  created_at: string; comment_count: number;
};

const privacyLabel: Record<string, { label: string; cls: string }> = {
  public:         { label: "Public",            cls: "chip brand" },
  almost_private: { label: "Followers only",    cls: "chip success" },
  private:        { label: "Selected followers", cls: "chip rose" },
  group:          { label: "Group",             cls: "chip warn" },
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [image, setImage] = useState<File | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  const reload = async () => setPosts(await api<Post[]>("/api/feed"));

  useEffect(() => {
    if (!user) return;
    reload();
    api<any[]>(`/api/users/${user.id}/followers`).then(setFollowers).catch(() => {});
  }, [user?.id]);

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    try {
      let image_path: string | undefined;
      if (image) image_path = await uploadFile(image);
      const body: any = { content, privacy, image_path };
      if (privacy === "private") body.allowed_users = allowed;
      await api("/api/posts", { method: "POST", body: JSON.stringify(body) });
      setContent(""); setImage(null); setAllowed([]);
      reload();
    } finally {
      setPosting(false);
    }
  }

  const imagePreview = image ? URL.createObjectURL(image) : null;

  if (!user) return null;

  return (
    <>
      <div className="card">
        <form onSubmit={createPost}>
          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
            {user.avatar_path ? (
              <img className="avatar" src={mediaURL(user.avatar_path)} alt="" />
            ) : (
              <span className="avatar" aria-hidden />
            )}
            <textarea
              placeholder={`What's on your mind, ${user.first_name}?`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              required
              style={{ flex: 1 }}
            />
          </div>

          {imagePreview && (
            <div style={{ marginTop: 10, position: "relative", display: "inline-block" }}>
              <img src={imagePreview} alt="" style={{ maxHeight: 240, borderRadius: 12, display: "block" }} />
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => setImage(null)}
                aria-label="Remove image"
                style={{
                  position: "absolute", top: 6, right: 6,
                  background: "rgba(0,0,0,0.6)", color: "#fff",
                  width: 28, height: 28,
                }}
              >×</button>
            </div>
          )}

          <div className="row wrap" style={{ marginTop: 12 }}>
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="public">🌐  Public</option>
              <option value="almost_private">👥  Followers only</option>
              <option value="private">🔒  Selected followers</option>
            </select>
            <label className="btn secondary sm" style={{ margin: 0, cursor: "pointer" }}>
              📷 Photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
            </label>
            <div className="grow" />
            <button className="btn" type="submit" disabled={posting || !content.trim()}>
              {posting ? <span className="spinner" /> : "Post"}
            </button>
          </div>

          {privacy === "private" && (
            <div style={{ marginTop: 12 }}>
              <label style={{ marginTop: 0 }}>Pick followers who can see this post</label>
              <div className="row wrap">
                {followers.length === 0 && <span className="muted">You have no followers yet.</span>}
                {followers.map((f) => {
                  const checked = allowed.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className={"chip " + (checked ? "brand" : "")}
                      style={{ cursor: "pointer", margin: 0 }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setAllowed(e.target.checked ? [...allowed, f.id] : allowed.filter((x) => x !== f.id))
                        }
                        style={{ display: "none" }}
                      />
                      {checked ? "✓ " : ""}{f.first_name} {f.last_name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </div>

      {posts.length === 0 && (
        <div className="empty">
          <h3 style={{ marginBottom: 4 }}>Your feed is empty</h3>
          <p className="muted">Share your first thought above, or follow people to see their posts here.</p>
        </div>
      )}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </>
  );
}

function PostCard({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState("");
  const [commentImage, setCommentImage] = useState<File | null>(null);

  const loadComments = async () => {
    setComments(await api(`/api/posts/${post.id}/comments`));
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    let image_path: string | undefined;
    if (commentImage) image_path = await uploadFile(commentImage);
    await api(`/api/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ content: comment, image_path }) });
    setComment(""); setCommentImage(null); loadComments();
  };

  const tag = privacyLabel[post.privacy] || { label: post.privacy, cls: "chip" };

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        {post.author_avatar ? (
          <img className="avatar" src={mediaURL(post.author_avatar)} alt="" />
        ) : (
          <span className="avatar" aria-hidden />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/users/${post.user_id}`} style={{ fontWeight: 600, color: "var(--text)" }}>
            {post.author_name}
          </Link>
          <div className="muted" style={{ fontSize: 12 }}>
            {timeAgo(post.created_at)} · <span title={new Date(post.created_at).toLocaleString()}>{new Date(post.created_at).toLocaleString()}</span>
          </div>
        </div>
        <span className={tag.cls}>{tag.label}</span>
      </div>

      {post.content && (
        <p style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.55, margin: "4px 0 10px" }}>
          {post.content}
        </p>
      )}
      {post.image_path && (
        <img
          src={mediaURL(post.image_path)}
          alt=""
          style={{ width: "100%", maxHeight: 520, objectFit: "cover", borderRadius: 12, marginTop: 4 }}
        />
      )}

      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <button
          className="btn secondary sm"
          onClick={() => { setOpen(!open); if (!open) loadComments(); }}
        >
          💬 {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          {comments.length === 0 && <p className="muted" style={{ marginBottom: 8 }}>Be the first to comment.</p>}
          {comments.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: "flex-start", padding: "8px 0", gap: 10 }}>
              <span className="avatar sm" aria-hidden />
              <div style={{ flex: 1, background: "var(--surface-3)", padding: "8px 12px", borderRadius: 12 }}>
                <div style={{ fontSize: 13 }}>
                  <Link href={`/users/${c.user_id}`} style={{ fontWeight: 600, color: "var(--text)" }}>
                    {c.author_name}
                  </Link>
                  <span className="muted"> · {timeAgo(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, marginTop: 2 }}>{c.content}</div>
                {c.image_path && (
                  <img src={mediaURL(c.image_path)} alt="" style={{ maxWidth: 220, borderRadius: 8, marginTop: 6 }} />
                )}
              </div>
            </div>
          ))}
          <form onSubmit={addComment} className="row" style={{ marginTop: 10, gap: 8 }}>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a comment…"
              style={{ borderRadius: "var(--radius-pill)" }}
            />
            <label className="btn ghost icon" style={{ cursor: "pointer", margin: 0 }} title="Attach image">
              📎
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif"
                onChange={(e) => setCommentImage(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
            </label>
            <button className="btn sm" type="submit" disabled={!comment.trim()}>Send</button>
          </form>
          {commentImage && (
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              📎 {commentImage.name}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
