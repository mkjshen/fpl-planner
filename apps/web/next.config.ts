import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@fpl-planner/db"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fantasy.premierleague.com",
        pathname: "/dist/img/shirts/**",
      },
    ],
  },
};

export default nextConfig;
