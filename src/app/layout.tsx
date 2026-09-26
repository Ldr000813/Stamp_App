import "./globals.css";
import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import PWARegister from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "京都まちめぐりスタンプラリー",
  description: "京都に暮らす人と訪れる人のための、まちめぐりスタンプラリー。",
  applicationName: "スタンプラリー",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "スタンプラリー", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F6C64B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PWARegister />
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
