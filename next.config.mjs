/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 构建产物目录；需要与既有 .next 隔离时用 NEXT_DIST_DIR 覆盖（CI / 受限环境）。
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
