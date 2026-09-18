import { ImageResponse } from "next/og";
import { CovieMark } from "@/components/workspace/covie-brand";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#416653", borderRadius: 96 }}><CovieMark size={320} color="#F7F6F2" /></div>,
    size,
  );
}
