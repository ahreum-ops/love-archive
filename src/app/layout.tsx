import type { Metadata, Viewport } from "next";
import { Gowun_Dodum, Jua, Nanum_Pen_Script } from "next/font/google";
import AppShell from "@/components/app-shell";
import "./globals.css";

const body = Gowun_Dodum({ weight: "400", variable: "--font-gowun", preload: false });
const cute = Jua({ weight: "400", variable: "--font-jua", preload: false });
const pen = Nanum_Pen_Script({ weight: "400", variable: "--font-pen-script", preload: false });

export const metadata: Metadata = {
  title: "러브아카이브",
  description: "우리 둘만의 추억 보관함",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "러브아카이브", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fff9f5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${body.variable} ${cute.variable} ${pen.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
