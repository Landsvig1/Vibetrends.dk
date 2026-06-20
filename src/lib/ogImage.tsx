import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/**
 * Render a branded 1200x630 OpenGraph card. Text-only by design — no remote
 * image fetches — so generation is fast and can't fail on an unreachable asset.
 */
export function renderOgImage(label: string, title: string) {
  const heading = title.length > 90 ? `${title.slice(0, 87)}…` : title;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAF9F6",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            color: "#7c3aed",
            textTransform: "uppercase",
            letterSpacing: "3px",
          }}
        >
          {label}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 800,
            color: "#1a1a1a",
            lineHeight: 1.1,
          }}
        >
          {heading}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#6b7280" }}>
          vibetrends.dk
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
