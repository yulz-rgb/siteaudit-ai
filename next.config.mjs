/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    },
    serverComponentsExternalPackages: ["playwright", "@sparticuz/chromium"]
  }
};

export default nextConfig;
