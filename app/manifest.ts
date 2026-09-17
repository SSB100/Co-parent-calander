import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Co-parent Calendar",
    short_name: "Co-parent",
    description: "A calm, shared calendar for co-parenting schedules.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f4",
    theme_color: "#f6f7f4",
    icons: [],
  };
}
