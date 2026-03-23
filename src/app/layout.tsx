import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { Toaster } from "sonner"
import ErrorBoundary from "@/components/ErrorBoundary"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Print ID Craft — Multi-School ID Card Management & Print Portal",
  description:
    "Professional ID card printing SaaS for manufacturers. Manage multiple schools, collect student data via smart links, design ID card templates, and generate print-ready PDFs with guaranteed front-back matching.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
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
