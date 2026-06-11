import type { Metadata } from "next"
import { Inter, Poppins } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { Toaster } from "sonner"
import ErrorBoundary from "@/components/ErrorBoundary"
import { Analytics } from "@vercel/analytics/next"

const inter = Inter({ subsets: ["latin"] })
const poppins = Poppins({ 
  subsets: ["latin"], 
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://wisemelon.vercel.app"),
  title: "WiseMelon — Multi-School ID Card Management & Print Portal",
  description:
    "Professional ID card printing SaaS for manufacturers. Manage multiple schools, collect student data via smart links, design ID card templates, and generate print-ready PDFs with guaranteed front-back matching.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "WiseMelon — Multi-School ID Card Management & Print Portal",
    description:
      "Professional ID card printing SaaS for manufacturers. Manage multiple schools, collect student data via smart links, design ID card templates, and generate print-ready PDFs with guaranteed front-back matching.",
    url: "https://wisemelon.vercel.app",
    siteName: "WiseMelon",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1000,
        height: 1000,
        alt: "WiseMelon Ventures Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WiseMelon — Multi-School ID Card Management & Print Portal",
    description:
      "Professional ID card printing SaaS for manufacturers. Manage multiple schools, collect student data via smart links, design ID card templates, and generate print-ready PDFs with guaranteed front-back matching.",
    images: ["/opengraph-image.png"],
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Roboto+Condensed:wght@400;700&family=Open+Sans:wght@400;700&family=Open+Sans+Condensed:wght@300;700&family=Barlow+Condensed:wght@400;700&family=PT+Sans+Narrow:wght@400;700&family=Lato:wght@400;700&family=Montserrat:wght@400;700&family=Poppins:wght@400;700&family=Raleway:wght@400;700&family=Oswald:wght@400;700&family=Inter:wght@400;700&family=Nunito:wght@400;700&family=Playfair+Display:wght@400;700&family=Merriweather:wght@400;700&family=Ubuntu:wght@400;700&family=Rubik:wght@400;700&family=Outfit:wght@400;700&family=Mukta:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans:wght@400;700&family=Tiro+Devanagari+Hindi&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} ${poppins.variable}`} suppressHydrationWarning>
        <Providers>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster richColors position="bottom-right" />
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
