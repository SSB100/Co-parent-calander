import { ImageResponse } from "next/og";
import { CovieMark } from "@/components/workspace/covie-brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FFF9F2",
        borderRadius: 36,
      }}
    >
      <CovieMark size={112} primary="#FF6B5F" secondary="#19A897" />
    </div>,
    size,
  );
}
