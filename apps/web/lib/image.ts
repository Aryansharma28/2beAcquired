/** Downscale an image (file or URL) to max `max` px on the long side, JPEG `quality`.
 *  Returns base64 without the data: prefix (what /tba/intake wants) plus a preview URL. */
export async function downscale(src: Blob | string, max = 1280, quality = 0.8) {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.decoding = "async";
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image. Try a JPEG or PNG."));
      i.src = url;
    });
    const w0 = img.naturalWidth || 1280;
    const h0 = img.naturalHeight || 1280;
    const scale = Math.min(1, max / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}
