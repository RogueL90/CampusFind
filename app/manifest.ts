import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Campus Quests · SJSU",
    short_name: "Campus Quests",
    description: "3D HUD campus map with lost & found missions and accessibility alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#05080f",
    theme_color: "#05080f",
  };
}
