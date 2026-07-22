/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pgd/contracts", "@pgd/ui"]
};

module.exports = nextConfig;
