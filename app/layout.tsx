import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TabBar from "@/components/TabBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CampusFind · SJSU",
  description: "A 3D HUD map of campus problems, lost & found missions and accessibility alerts.",
  appleWebApp: { capable: true, title: "CampusFind", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#05080f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex h-dvh flex-col overflow-hidden">
        <main className="relative min-h-0 flex-1">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
