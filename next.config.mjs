/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { hostname: 'www.vectorlogo.zone' },
      { hostname: 'upload.wikimedia.org' },
      { hostname: 'cdn-icons-png.freepik.com' },
      { hostname: 'cdn-icons-png.flaticon.com' },
      { hostname: 'altaseamedia.s3.us-west-1.amazonaws.com' },
    ],
  },
}

export default nextConfig
