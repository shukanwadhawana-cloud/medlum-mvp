import { ImageResponse } from "next/og";

export const alt = "MedLum – Clinical Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: "#140a1f",
          color: "white",
          fontFamily: "Arial",
        }}
      >
        <div style={{ fontSize: 34, color: "#c4b5fd", marginBottom: 18 }}>MedLum</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>Clinical Intelligence</div>
        <div style={{ fontSize: 30, color: "#cbd5e1", marginTop: 28 }}>Secure multi-doctor clinical operations</div>
      </div>
    ),
    size,
  );
}
