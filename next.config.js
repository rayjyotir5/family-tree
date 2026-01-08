/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/family-tree',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sites-cf.mhcache.com',
      },
    ],
  },
  trailingSlash: true,
}

module.exports = nextConfig
