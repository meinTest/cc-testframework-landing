import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The TMT detail page slug was renamed cc-testmanagement →
      // verify-test-management. Keep existing links (emails, docs, CMS) working.
      {
        source: "/cc-testmanagement",
        destination: "/verify-test-management",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
