/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fl/core", "@fl/db"],
  reactStrictMode: true,
  // Same-origin proxy: the browser calls /api/* (carrying the httpOnly session
  // cookie automatically), Next forwards to the Fastify API. This removes the
  // JS-readable token + Bearer interceptor that the cross-origin setup needed.
  async rewrites() {
    const target = process.env.API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
  // @fl/core/@fl/db source uses NodeNext-style ".js" import specifiers that
  // point at ".ts" files. tsx resolves these natively; webpack needs the alias.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};
export default nextConfig;
