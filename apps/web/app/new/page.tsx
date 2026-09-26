"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MOCK, intake } from "@/lib/api";
import { downscale } from "@/lib/image";
import { cx } from "@/components/ui";

type Photo = { dataUrl: string; base64: string };
const MAX_PHOTOS = 5;

/** 01 · Snap it — viewfinder, photo strip, shutter. */
export default function SnapIt() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<null | "photo" | "sending">(null);
  const [flash, setFlash] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Live camera when the browser allows it; the file picker is the fallback.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setLive(true);
        }
      } catch {
        setLive(false);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const full = photos.length >= MAX_PHOTOS;

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

  function shoot() {
    if (full) return;
    const v = videoRef.current;
    if (!live || !v || !v.videoWidth) return camRef.current?.click();
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash((f) => f + 1);
    add([c.toDataURL("image/jpeg", 0.92)]);
  }

  async function done() {
    if (!photos.length) return;
    setBusy("sending");
    setError(null);
    try {
      const { itemId } = await intake({ photos: photos.map((p) => p.base64) });
      router.push(`/item/${itemId}`);
    } catch (e) {
      setError(`Couldn't send the photos: ${(e as Error).message}`);
      setBusy(null);
    }
  }

  const tip = photos.length === 0 ? "Show the whole item, good light" : photos.length === 1 ? "Add one of the back?" : null;

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col bg-ink text-white">
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />

      {/* Top bar */}
      <header className="relative z-10 flex items-center gap-3 px-4 pb-2 pt-[max(14px,env(safe-area-inset-top))]">
        <Link href="/" aria-label="Close" className="grid size-10 place-items-center rounded-full bg-white/10 transition active:scale-95">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </Link>
        <h1 className="whitespace-nowrap font-display text-[19px] font-bold tracking-[-0.03em]">Sell something</h1>
        {MOCK && !photos.length && (
          <button
            type="button"
            onClick={() => add(["/demo/poang.jpg"])}
            className="ml-auto whitespace-nowrap rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/80"
          >
            Use sample photo
          </button>
        )}
      </header>

      {/* Viewfinder */}
      <section className="relative mx-3 flex-1 overflow-hidden rounded-[30px] bg-[#16181f]">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cx("absolute inset-0 size-full object-cover transition-opacity duration-500", live ? "opacity-100" : "opacity-0")}
        />
        {!live && photos.length > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos.at(-1)!.dataUrl} alt="" className="absolute inset-0 size-full animate-fade object-cover opacity-80" />
        )}
        {!live && photos.length === 0 && (
          <button type="button" onClick={() => camRef.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60">
            <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.5-2.5h6L16.5 7h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" />
              <circle cx="12" cy="12.5" r="3.5" />
            </svg>
            <span className="text-[15px]">Tap the shutter to open your camera</span>
          </button>
        )}
        <Corners />
        {flash > 0 && <span key={flash} className="pointer-events-none absolute inset-0 bg-white [animation:fade_0.35s_ease_reverse_both]" />}

        {tip && (
          <div key={tip} className="absolute inset-x-0 top-4 flex justify-center px-4">
            <span className={cx("flex animate-rise items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-semibold shadow-lg backdrop-blur",
              photos.length ? "bg-tag text-ink" : "bg-ink/70 text-white")}>
              {photos.length > 0 && <span className="rounded-full bg-ink px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-tag">Agent</span>}
              {tip}
            </span>
          </div>
        )}

        {/* Photo strip */}
        {photos.length > 0 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2 px-3">
            {photos.map((p, i) => (
              <button
                key={p.dataUrl.slice(-40) + i}
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                className="relative size-[48px] shrink-0 animate-pop overflow-hidden rounded-xl ring-2 ring-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="size-full object-cover" />
                <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-ink/80">
                  <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <p className="mx-4 mt-3 rounded-2xl bg-alert-soft p-3 text-[14px] text-alert">{error}</p>}

      {/* Controls */}
      <footer className="grid grid-cols-3 items-center px-6 pb-[max(22px,env(safe-area-inset-bottom))] pt-5">
        <button
          type="button"
          onClick={() => libRef.current?.click()}
          disabled={full}
          aria-label="Choose from gallery"
          className="grid size-12 place-items-center justify-self-start rounded-2xl bg-white/10 transition active:scale-95 disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={shoot}
          disabled={full || busy === "sending"}
          aria-label="Take photo"
          className="group grid size-[78px] place-items-center justify-self-center rounded-full ring-[5px] ring-white transition active:scale-90 disabled:opacity-30"
        >
          <span className="grid size-[62px] place-items-center rounded-full bg-white transition group-active:bg-tag">
            {busy === "photo" && <span className="size-6 animate-spin rounded-full border-[3px] border-ink/15 border-t-ink" />}
          </span>
        </button>
        <button
          type="button"
          onClick={done}
          disabled={!photos.length || busy !== null}
          className={cx(
            "justify-self-end rounded-2xl px-4 py-3 font-display text-[17px] font-extrabold tracking-[-0.02em] transition active:scale-95",
            photos.length ? "bg-tag text-ink" : "bg-white/10 text-white/40",
          )}
        >
          {busy === "sending" ? <span className="inline-block size-5 animate-spin rounded-full border-[3px] border-ink/20 border-t-ink align-middle" /> : "Done"}
        </button>
      </footer>
      <p className="-mt-3 pb-[max(10px,env(safe-area-inset-bottom))] text-center font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
        {photos.length}/{MAX_PHOTOS} photos{photos.length ? " · tap one to remove" : ""}
      </p>
    </main>
  );
}

function Corners() {
  const c = "pointer-events-none absolute size-8 border-tag";
  return (
    <>
      <span className={cx(c, "left-4 top-4 rounded-tl-xl border-l-[3px] border-t-[3px]")} />
      <span className={cx(c, "right-4 top-4 rounded-tr-xl border-r-[3px] border-t-[3px]")} />
      <span className={cx(c, "bottom-4 left-4 rounded-bl-xl border-b-[3px] border-l-[3px]")} />
      <span className={cx(c, "bottom-4 right-4 rounded-br-xl border-b-[3px] border-r-[3px]")} />
    </>
  );
}
