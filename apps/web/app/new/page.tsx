"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MOCK, intake } from "@/lib/api";
import { downscale } from "@/lib/image";
import { ICON_BTN, PoofTag, cx } from "@/components/ui";

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
    <main className="relative flex min-h-dvh flex-1 flex-col bg-page text-ink">
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />

      {/* Top bar */}
      <header className="relative z-10 flex min-h-16 items-center gap-2.5 px-5 pb-2 pt-[max(18px,env(safe-area-inset-top))]">
        <Link href="/" aria-label="Close" className={ICON_BTN}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </Link>
        <h1 className="flex-1 whitespace-nowrap text-center text-[17px] font-bold">Sell something</h1>
        {MOCK && !photos.length ? (
          <button
            type="button"
            onClick={() => add(["/demo/poang.jpg"])}
            className="h-[34px] whitespace-nowrap rounded-full border border-ink px-3 text-[12px] font-bold text-ink"
          >
            Use sample photo
          </button>
        ) : (
          <span className="size-11 shrink-0" aria-hidden />
        )}
      </header>

      {/* Viewfinder */}
      <section className="relative mx-4 min-h-[300px] flex-1 overflow-hidden rounded-[20px] bg-ink text-white">
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

        {photos.length === 0 && tip && (
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center px-4">
            <span className="animate-rise whitespace-nowrap rounded-full bg-white/92 px-3.5 py-1.5 text-[13px] font-semibold text-ink">{tip}</span>
          </div>
        )}
        {photos.length > 0 && tip && (
          <div key={tip} className="absolute inset-x-3 bottom-3 z-10 flex animate-rise items-start gap-2.5 rounded-[16px] bg-card px-3.5 py-3 text-[14px] text-ink">
            <PoofTag className="mt-0.5" />
            <b className="font-bold">{tip}</b>
          </div>
        )}
      </section>

      {/* Photo slots: tap a photo to remove it */}
      <div className="flex gap-2 px-5 pb-1 pt-3.5">
        {SLOTS.map((label, i) => {
          const p = photos[i];
          return (
            <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              {p ? (
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                  className="relative aspect-square w-full animate-pop rounded-[12px] bg-limetint"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.dataUrl} alt="" className="size-full rounded-[12px] object-cover" />
                  <span className="absolute -right-1.5 -top-1.5 grid size-[22px] place-items-center rounded-full bg-ink text-white">
                    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </span>
                </button>
              ) : (
                <span className={cx("grid aspect-square w-full place-items-center rounded-[12px] border-[1.5px] bg-card text-moss",
                  i === photos.length ? "border-solid border-ink" : "border-dashed border-line")}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                </span>
              )}
              <span className="text-[12px] font-semibold text-moss">{label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-[13px] font-semibold text-moss">
        {photos.length} of {MAX_PHOTOS} photos{photos.length ? " · tap one to remove" : " · one is enough"}
      </p>

      {error && <p className="mx-5 mt-3 rounded-[20px] bg-alert-soft p-3 text-[14px] text-alert">{error}</p>}

      {/* Controls */}
      <footer className="grid grid-cols-3 items-center px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5">
        <button
          type="button"
          onClick={() => libRef.current?.click()}
          disabled={full}
          aria-label="Choose from gallery"
          className={cx(ICON_BTN, "!size-12 justify-self-start disabled:opacity-30")}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </button>
        <button
          type="button"
          onClick={shoot}
          disabled={full || busy === "sending"}
          aria-label="Take photo"
          className="group grid size-[76px] place-items-center justify-self-center rounded-full border-4 border-ink bg-white transition active:scale-90 disabled:opacity-40"
        >
          <span className="grid size-[58px] place-items-center rounded-full bg-lime transition group-active:bg-limetint">
            {busy === "photo" && <span className="size-6 animate-spin rounded-full border-[3px] border-ink/15 border-t-ink" />}
          </span>
        </button>
        <button
          type="button"
          onClick={done}
          disabled={!photos.length || busy !== null}
          className={cx(
            "h-[38px] justify-self-end rounded-full px-4 text-[14px] font-bold transition active:scale-95",
            photos.length ? "bg-ink text-lime" : "border border-line text-moss",
          )}
        >
          {busy === "sending" ? <span className="inline-block size-4 animate-spin rounded-full border-[3px] border-lime/25 border-t-lime align-middle" /> : "Done"}
        </button>
      </footer>
    </main>
  );
}

const SLOTS = ["Front", "Back", "Side", "Detail", "Label"];

function Corners() {
  const c = "pointer-events-none absolute z-[1] size-[34px] border-lime";
  return (
    <>
      <span className={cx(c, "left-[22px] top-14 rounded-tl-[10px] border-l-[3px] border-t-[3px]")} />
      <span className={cx(c, "right-[22px] top-14 rounded-tr-[10px] border-r-[3px] border-t-[3px]")} />
      <span className={cx(c, "bottom-[84px] left-[22px] rounded-bl-[10px] border-b-[3px] border-l-[3px]")} />
      <span className={cx(c, "bottom-[84px] right-[22px] rounded-br-[10px] border-b-[3px] border-r-[3px]")} />
    </>
  );
}
