"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MOCK, intake } from "@/lib/api";
import { downscale } from "@/lib/image";
import { Ic, SfScreen } from "@/components/Wizard";
import { cx } from "@/components/ui";

type Photo = { dataUrl: string; base64: string };
const MAX_PHOTOS = 5;
const SLOT_NAMES = ["Front", "Back", "Side", "Detail", "Label"];
/** Mock mode only: the mock backend's sample photo stands in for a camera that isn't there. */
const SAMPLE = "/demo/poang.jpg";

/** "+ Sell": the sell sheet slides up over the app and opens on "Snap it" (prototype renderSnap). */
export default function SnapIt() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [camFallback, setCamFallback] = useState(false);
  const [camDenied, setCamDenied] = useState(false);
  const [torch, setTorch] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<null | "photo" | "sending">(null);
  const [error, setError] = useState<string | null>(null);

  // Slide the sheet up on arrival.
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  async function startCamera() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCamFallback(false);
      setCamDenied(false);
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
    } catch (err) {
      streamRef.current = null;
      setCamFallback(true);
      setCamDenied((err as Error)?.name === "NotAllowedError");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const boot = setTimeout(() => { startCamera().then(() => { if (cancelled) stopCamera(); }); }, 0);
    // A stream that never delivers frames must not block: fall back.
    const watchdog = setTimeout(() => {
      const v = videoRef.current;
      if (!cancelled && streamRef.current && !(v && v.videoWidth)) { stopCamera(); setCamFallback(true); }
    }, 4000);
    return () => { cancelled = true; clearTimeout(boot); clearTimeout(watchdog); stopCamera(); };
  }, []);

  // The <video> is re-created after a fallback: hand it the stream again.
  useEffect(() => {
    const v = videoRef.current;
    if (!camFallback && v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  }, [camFallback]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamReady(false);
  }

  const n = photos.length;
  const full = n >= MAX_PHOTOS;
  const notReady = !camFallback && !camReady;

  async function add(srcs: (Blob | string)[]) {
    if (!srcs.length) return;
    setBusy("photo");
    setError(null);
    try {
      const next = await Promise.all(srcs.slice(0, MAX_PHOTOS - photos.length).map((f) => downscale(f)));
      setPhotos((p) => [...p, ...next].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function flashOnce() {
    const el = flashRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.opacity = "1";
    requestAnimationFrame(() => { el.style.transition = "opacity .15s linear"; el.style.opacity = "0"; });
  }

  function shoot() {
    if (full) return;
    const v = videoRef.current;
    if (!camFallback && streamRef.current && v && v.videoWidth) {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      flashOnce();
      const shot = c.toDataURL("image/jpeg", 0.92);
      setTimeout(() => add([shot]), 150);
      return;
    }
    if (MOCK) { flashOnce(); setTimeout(() => add([SAMPLE]), 150); return; }
    camRef.current?.click(); // no live camera: the phone's own camera
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { /* no torch on this camera */ }
  }

  function close() {
    setShown(false);
    stopCamera();
    setTimeout(() => (history.length > 1 ? router.back() : router.push("/")), 380);
  }

  async function done() {
    if (!photos.length) return;
    setBusy("sending");
    setError(null);
    try {
      const { itemId } = await intake({ photos: photos.map((p) => p.base64) });
      stopCamera();
      router.push(`/item/${itemId}`);
    } catch (e) {
      setError(`Couldn't send the photos: ${(e as Error).message}`);
      setBusy(null);
    }
  }

  const pill = camFallback
    ? (MOCK ? "Camera off, using a sample photo" : "Camera off, the shutter opens your camera")
    : notReady ? "Starting camera…" : null;
  const last = photos.at(-1)?.dataUrl;

  return (
    <SfScreen className="clear">
      <div className={cx("sheet-backdrop", shown && "show")} onClick={close} />
      <div className={cx("sell-sheet", shown && "show")}>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <div className="layer">
          <div className="top2 cam">
            <button className="icon-btn" type="button" aria-label="Close" onClick={close}><Ic n="close" /></button>
            <h1 className="bar-title" style={{ flex: 1, textAlign: "center" }}>Sell something</h1>
            <button className="icon-btn" type="button" aria-label="Flash" aria-pressed={torch} onClick={toggleTorch}><Ic n="flash" /></button>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "0 20px" }}>
            <div className="viewfinder" style={{ flex: 1 }}>
              {camFallback ? (
                // eslint-disable-next-line @next/next/no-img-element
                (MOCK || last) && <img src={last ?? SAMPLE} alt={last ? "Your last photo" : "Sample photo"} />
              ) : (
                <video
                  ref={videoRef} playsInline muted autoPlay
                  onLoadedData={() => setCamReady(true)} onPlaying={() => setCamReady(true)}
                />
              )}
              <div className="vf-scrim" aria-hidden />
              <div className="flash-overlay" ref={flashRef} aria-hidden />
              {pill && <p className="pill quiet">{pill}</p>}
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              {camDenied && (
                <button className="btn secondary" type="button" onClick={startCamera} style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 2 }}>Allow camera</button>
              )}
            </div>
            <div className="slots">
              {SLOT_NAMES.map((name, i) => {
                const p = photos[i];
                const next = i === n;
                return (
                  <button
                    key={name} type="button"
                    className={cx("slot", p ? "filled" : next && "next")}
                    aria-label={`${name}${p ? " photo, tap to remove" : ", empty"}`}
                    onClick={() => (p ? setPhotos((ps) => ps.filter((_, j) => j !== i)) : next && shoot())}
                  >
                    <span className="box">
                      {p ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.dataUrl} alt="" />
                          <span className="x"><Ic n="close" /></span>
                        </>
                      ) : <Ic n="plus" />}
                    </span>
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
            <p className="cam-count">{n} of {MAX_PHOTOS} photos{n ? " · one is enough" : ""}</p>
            {error && <p className="sf-error" style={{ marginTop: 8 }}>{error}</p>}
          </div>
          <div className="cam-controls" style={{ padding: "10px 24px 24px" }}>
            <button className="icon-btn" type="button" aria-label="Pick from gallery" disabled={full} onClick={() => libRef.current?.click()}><Ic n="gallery" /></button>
            <button className="shutter" type="button" onClick={shoot} disabled={full || notReady || busy !== null} aria-label="Take photo" />
            <button className="btn small" type="button" disabled={n === 0 || busy !== null} onClick={done}>
              {busy === "sending" ? <span className="sf-spin" style={{ width: 14, height: 14, borderWidth: 2 }} /> : "Done"}
            </button>
          </div>
        </div>
      </div>
    </SfScreen>
  );
}
