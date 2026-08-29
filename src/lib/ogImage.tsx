import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

// Paper, Forest Ink and the type the site actually uses. The old card was
// purple-on-cream in a system sans, which matched nothing on the site.
//
// Sans only, per DESIGN.md: Plus Jakarta Sans does the work, extrabold and
// tight at display sizes. Instrument Serif is reserved for quoted human text,
// which a card like this never carries.
const PAPER = "#FAF9F6";
const INK = "#1E1E1E";
const MUTED = "#4F4F4C";
const FOREST = "#264021";
const BORDER = "#E6E3DC";

// Read once per lambda instance, not once per card. process.cwd() is the
// project root in both `next dev` and the traced serverless bundle; the .ttf
// files are pulled into that bundle by outputFileTracingIncludes, since a
// cwd-relative read is invisible to the build tracer.
//
// These are the static 400 and 800 instances. The variable Plus Jakarta Sans
// that Google ships by default cannot be used here: satori fails to parse it
// and the route 500s with "Cannot read properties of undefined".
let fontsPromise: Promise<{ regular: Buffer; extraBold: Buffer }> | null = null;

function loadFonts() {
  fontsPromise ??= (async () => {
    const dir = join(process.cwd(), "assets", "fonts");
    const [regular, extraBold] = await Promise.all([
      readFile(join(dir, "PlusJakartaSans-Regular.ttf")),
      readFile(join(dir, "PlusJakartaSans-ExtraBold.ttf")),
    ]);
    return { regular, extraBold };
  })();
  return fontsPromise;
}

/**
 * Render a branded 1200x630 OpenGraph card. Text-only by design, with no remote
 * image fetches, so generation is fast and cannot fail on an unreachable asset.
 */
export async function renderOgImage(label: string, title: string, subtitle?: string) {
  const heading = title.length > 80 ? `${title.slice(0, 77)}…` : title;
  const { regular, extraBold } = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "72px 80px",
          fontFamily: "Plus Jakarta Sans",
          position: "relative",
        }}
      >
        {/* Hairline frame, the same paper-edge structure the site's cards use. */}
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: FOREST }}>
            vibetrends.dk
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 19,
              color: FOREST,
              textTransform: "uppercase",
              letterSpacing: "3px",
              border: `1px solid ${FOREST}`,
              borderRadius: 999,
              padding: "10px 24px",
            }}
          >
            {label}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: heading.length > 46 ? 66 : 82,
              fontWeight: 800,
              letterSpacing: "-2px",
              lineHeight: 1.05,
              color: INK,
            }}
          >
            {heading}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: 27, color: MUTED, lineHeight: 1.4 }}>
              {subtitle.length > 110 ? `${subtitle.slice(0, 107)}…` : subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", width: 56, height: 3, background: FOREST }} />
          <div style={{ display: "flex", fontSize: 23, color: MUTED }}>
            AI-tools og viden, udvalgt til Danmark
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Plus Jakarta Sans", data: regular, style: "normal", weight: 400 },
        { name: "Plus Jakarta Sans", data: extraBold, style: "normal", weight: 800 },
      ],
    }
  );
}
