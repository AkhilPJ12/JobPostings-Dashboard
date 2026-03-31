/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      // Allow any HTTPS image source — company icons come from various domains
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig
