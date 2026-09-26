// App icon: a yellow swing tag reading "2b" on cobalt. Rendered with next/og for
// favicon, apple-touch-icon and PWA icons. The tag shape is SVG; text is real type.
import { ImageResponse } from "next/og";

const TAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 220"><path d="M80 0 H360 a20 20 0 0 1 20 20 V200 a20 20 0 0 1 -20 20 H80 L0 110 Z" fill="#ffd84d"/><circle cx="62" cy="110" r="17" fill="#2b3bff"/></svg>`;
const TAG_SRC = `data:image/svg+xml;base64,${Buffer.from(TAG).toString("base64")}`;

export function iconResponse(px: number, maskable = false) {
  const scale = (maskable ? 0.72 : 0.86) * (px / 512);
  const w = 380 * scale;
  const h = 220 * scale;
  return new ImageResponse(
    (
      <div
        style={{
          width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center",
          background: "#2b3bff", borderRadius: maskable ? 0 : px * 0.22,
        }}
      >
        <div style={{ position: "relative", width: w, height: h, display: "flex", transform: "rotate(-12deg)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TAG_SRC} width={w} height={h} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
          <div
            style={{
              position: "absolute", left: w * 0.3, top: 0, width: w * 0.66, height: h,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: h * 0.62, fontWeight: 700, color: "#0b0d12", letterSpacing: -h * 0.04,
            }}
          >
            2b
          </div>
        </div>
      </div>
    ),
    { width: px, height: px },
  );
}
