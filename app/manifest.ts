import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Covie",
    short_name: "Covie",
    description:
      "A bright, simple shared organiser for co-parenting schedules, expenses, responsibilities and agreements.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFF9F2",
    theme_color: "#FF6B5F",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
