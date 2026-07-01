import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { SidebarNav } from "@/components/sidebar-nav";
import { OfflineSync } from "@/components/offline-sync";
import { getCurrentFarm } from "@/lib/session";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", weight: ["500", "600", "700"] });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Field & Ledger",
  description: "Accounting and financial planning for farmers and ranchers.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2f3d29",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentFarm();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="font-sans">
        <OfflineSync />
        {session ? (
          <div className="flex min-h-screen">
            <SidebarNav
              user={{ name: session.user.name ?? session.user.email, email: session.user.email }}
              role={session.role}
              farms={session.memberships.map((m) => ({ id: m.farmId, name: m.farm.name }))}
              currentFarmId={session.farm.id}
            />
            <main className="min-w-0 flex-1 px-4 pb-8 pt-20 sm:px-6 lg:px-10 lg:py-8">{children}</main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
