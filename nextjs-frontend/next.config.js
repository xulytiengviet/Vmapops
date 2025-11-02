/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@mastra/*"],
  outputFileTracingRoot: path.join(__dirname),
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  }
};

module.exports = nextConfig;
