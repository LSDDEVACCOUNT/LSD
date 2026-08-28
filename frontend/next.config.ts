import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: every route prerenders to HTML at build time and the
  // client hydrates and reads the chain from the browser. `output: "export"`
  // emits a plain `out/` folder of HTML/CSS/JS - no server runtime - which is
  // exactly what a static host like Cloudflare Pages serves. There are no API
  // routes, server actions or next/image to hold this back.
  output: "export",
  // Emit `/bonds/index.html` rather than `/bonds.html`, so clean URLs resolve
  // on any static host without extra rewrite rules.
  trailingSlash: true,
};

export default nextConfig;
