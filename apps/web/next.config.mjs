/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fl/core", "@fl/db"],
  reactStrictMode: true,
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
