import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";

export const metadata = { title: "SocialNet" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Nav />
          <div className="container">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
