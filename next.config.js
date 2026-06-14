const { withSentryConfig } = require('@sentry/nextjs')

const supabaseImageHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null
  } catch {
    return null
  }
})()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Performance: enable React strict mode (catches bugs early)
  reactStrictMode: true,
  // Performance: compress responses
  compress: true,
  // Security: power-hide
  poweredByHeader: false,
  // Next 16 uses Turbopack by default; this app relies on custom webpack
  // (WASM/ONNX). Keep webpack for production builds on Vercel.
  turbopack: {},
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Externalize heavy WASM packages from the server bundle.
  serverExternalPackages: ['@imgly/background-removal'],
  // Performance: optimize images
  images: {
    remotePatterns: supabaseImageHost
      ? [{ protocol: 'https', hostname: supabaseImageHost }]
      : [],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
  // Performance: optimize builds - tree-shake large packages
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      '@react-pdf/renderer',
      'sonner',
      '@supabase/supabase-js',
      'zod',
    ],
    // Cache router segments for faster page transitions
    staleTimes: {
      dynamic: 30, // Cache dynamic pages for 30s
    },
  },
  // Security-relevant headers (augments middleware headers)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
      // Enable Cross-Origin Isolation for WASM SharedArrayBuffer (ONNX runtime)
      // On submit pages and manufacturer dashboard where AI background removal runs
      {
        source: '/submit/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      {
        source: '/schools/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      {
        source: '/dashboard/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      // Cache static assets aggressively & allow cross-origin loading under COEP
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      // Serve WASM files with correct MIME type & cross-origin support
      {
        source: '/(.*)\\.wasm',
        headers: [
          { key: 'Content-Type', value: 'application/wasm' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
    ]
  },
  // Webpack: handle @imgly/background-removal (loaded dynamically at runtime only)
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }

    // Externalize heavy WASM/ONNX packages from server bundle
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push('@imgly/background-removal')
      config.externals.push('onnxruntime-web')
      config.externals.push('onnxruntime-web/webgpu')
    } else {
      // Client: stub onnxruntime-web/webgpu (not available in browsers without WebGPU)
      config.resolve = config.resolve || {}
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'onnxruntime-web/webgpu': false,
      }
    }

    return config
  },
}

const sentryBuildOptions = {
  silent: true,
  disableLogger: true,
}

module.exports = process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig
