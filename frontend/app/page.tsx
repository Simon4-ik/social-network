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

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [image, setImage] = useState<File | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);

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
    let image_path: string | undefined;
    if (image) image_path = await uploadFile(image);
    const body: any = { content, privacy, image_path };
    if (privacy === "private") body.allowed_users = allowed;
    await api("/api/posts", { method: "POST", body: JSON.stringify(body) });
    setContent(""); setImage(null); setAllowed([]);
    reload();
  }

  if (!user) return null;

  return (
    <>
      <div className="card">
        <form onSubmit={createPost}>
          <textarea placeholder="What's on your mind?" value={content} onChange={(e) => setContent(e.target.value)} rows={3} required />
          <div className="row" style={{ marginTop: 8 }}>
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="public">Public</option>
              <option value="almost_private">Followers only</option>
              <option value="private">Selected followers</option>
            </select>
            <input type="file" accept="image/jpeg,image/png,image/gif" onChange={(e) => setImage(e.target.files?.[0] || null)} style={{ maxWidth: 260 }} />
            <div className="grow" />
            <button className="btn" type="submit">Post</button>
          </div>
          {privacy === "private" && (
            <div style={{ marginTop: 8 }}>
              <label>Pick followers who can see this post:</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {followers.length === 0 && <span className="muted">You have no followers yet.</span>}
                {followers.map((f) => {
                  const checked = allowed.includes(f.id);
                  return (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="checkbox" checked={checked}
                        onChange={(e) => setAllowed(e.target.checked ? [...allowed, f.id] : allowed.filter((x) => x !== f.id))}
                        style={{ width: "auto" }} />
                      {f.first_name} {f.last_name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </div>

      {posts.length === 0 && <p className="muted">No posts yet. Be the first!</p>}
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

  return (
    <div className="card">
      <div className="row">
        {post.author_avatar && <img className="avatar sm" src={mediaURL(post.author_avatar)} alt="" />}
        <Link href={`/users/${post.user_id}`}><b>{post.author_name}</b></Link>
        <span className="muted">· {new Date(post.created_at).toLocaleString()}</span>
        <span className="muted">· {post.privacy}</span>
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{post.content}</p>
      {post.image_path && <img src={mediaURL(post.image_path)} style={{ maxWidth: "100%", borderRadius: 6 }} />}
      <button className="btn secondary" onClick={() => { setOpen(!open); if (!open) loadComments(); }}>
        {post.comment_count} comments
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ padding: "6px 0", borderTop: "1px solid #f1f3f5" }}>
              <Link href={`/users/${c.user_id}`}><b>{c.author_name}</b></Link>
              <span className="muted"> · {new Date(c.created_at).toLocaleString()}</span>
              <div>{c.content}</div>
              {c.image_path && <img src={mediaURL(c.image_path)} style={{ maxWidth: 200, borderRadius: 6 }} />}
            </div>
          ))}
          <form onSubmit={addComment} className="row" style={{ marginTop: 8 }}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" />
            <input type="file" accept="image/jpeg,image/png,image/gif" onChange={(e) => setCommentImage(e.target.files?.[0] || null)} style={{ maxWidth: 200 }} />
            <button className="btn" type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}
