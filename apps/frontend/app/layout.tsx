import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./_providers";
import { appName, appUrl } from "@/lib/branding";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: appName,
  description: `${appName} - A task-oriented AI competition platform`,
  metadataBase: new URL(appUrl),
  openGraph: {
    title: appName,
    description: `${appName} - A task-oriented AI competition platform`,
    type: "website",
    siteName: appName,
    url: appUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description: `${appName} - A task-oriented AI competition platform`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0853CD" />
      </head>
      <body className={`${spaceGrotesk.variable} antialiased`}>
        <Providers>
          {children}
          <Toaster position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
