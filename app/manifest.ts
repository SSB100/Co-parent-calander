import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Covie",
    short_name: "Covie",
    description: "A calm shared organiser for co-parenting schedules, expenses, responsibilities and agreements.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#dde6df",
    theme_color: "#dde6df",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
