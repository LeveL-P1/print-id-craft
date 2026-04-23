import type { Metadata } from "next"
import { Inter, Poppins } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { Toaster } from "sonner"
import ErrorBoundary from "@/components/ErrorBoundary"

const inter = Inter({ subsets: ["latin"] })
const poppins = Poppins({ 
  subsets: ["latin"], 
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Print ID Craft — Multi-School ID Card Management & Print Portal",
  description:
    "Professional ID card printing SaaS for manufacturers. Manage multiple schools, collect student data via smart links, design ID card templates, and generate print-ready PDFs with guaranteed front-back matching.",
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
      <body className={`${inter.className} ${poppins.variable}`} suppressHydrationWarning>
        <Providers>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster richColors position="bottom-right" />
        </Providers>
      </body>
    </html>
  )
}
