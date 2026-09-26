"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MOCK, intake } from "@/lib/api";
import { downscale } from "@/lib/image";
import { BackButton, Button, cx } from "@/components/ui";

type Photo = { dataUrl: string; base64: string };
const MAX_PHOTOS = 6;

export default function NewItem() {
  const router = useRouter();
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [floor, setFloor] = useState("70");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [busy, setBusy] = useState<null | "photos" | "sending">(null);
  const [error, setError] = useState<string | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy("photos");
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const next = await Promise.all([...files].slice(0, room).map((f) => downscale(f)));
      setPhotos((p) => [...p, ...next]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function loadSample() {
    setBusy("photos");
    try {
      setPhotos([await downscale("/demo/chair.svg")]);
    } finally {
      setBusy(null);
    }
  }

  const floorNum = Number(floor.replace(",", "."));
  const valid = photos.length > 0 && floorNum > 0;

  async function submit() {
    if (!valid) return;
    setBusy("sending");
    setError(null);
    try {
      const { itemId } = await intake({
        photos: photos.map((p) => p.base64),
        goal: "fast", // always: sell ASAP above the minimum
        floorPrice: floorNum,
        notes: notes.trim() || undefined,
      });
      router.push(`/item/${itemId}`);
    } catch (e) {
      setError(`Couldn't start selling: ${(e as Error).message}`);
      setBusy(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-36 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <BackButton />
        <h1 className="font-display text-[26px] font-extrabold tracking-[-0.04em]">Sell something</h1>
      </header>

      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

      {/* Photos */}
      <section className="mt-4 animate-rise">
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => camRef.current?.click()}
            className="group relative flex aspect-[4/3.8] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] bg-ink text-white transition active:scale-[0.98]"
          >
            <Corners />
            {busy === "photos" ? (
              <span className="size-8 animate-spin rounded-full border-[3px] border-white/20 border-t-tag" />
            ) : (
              <>
                <span className="grid size-[72px] place-items-center rounded-full bg-tag text-ink transition group-active:scale-90">
                  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.5-2.5h6L16.5 7h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" />
                    <circle cx="12" cy="12.5" r="3.5" />
                  </svg>
                </span>
                <span className="font-display text-[22px] font-bold tracking-[-0.03em]">Take a photo</span>
                <span className="text-[14px] text-white/60">Good light, whole item in frame</span>
              </>
            )}
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div
                key={i}
                className={cx("relative animate-pop overflow-hidden rounded-2xl bg-card", i === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-ink/70 text-white backdrop-blur"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
                {i === 0 && <span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">Cover</span>}
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => camRef.current?.click()}
                className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line text-mute transition active:scale-95"
                aria-label="Add another photo"
              >
                {busy === "photos" ? (
                  <span className="size-6 animate-spin rounded-full border-[3px] border-line border-t-cobalt" />
                ) : (
                  <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                )}
              </button>
            )}
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-between px-1 text-[14px]">
          <button type="button" onClick={() => libRef.current?.click()} className="font-semibold text-cobalt">
            Choose from library
          </button>
          {MOCK && photos.length === 0 && (
            <button type="button" onClick={loadSample} className="font-semibold text-mute underline decoration-dotted underline-offset-4">
              Use sample photo
            </button>
          )}
        </div>
      </section>

      {/* Floor */}
      <section className="mt-7 animate-rise [animation-delay:80ms]">
        <Label htmlFor="floor">Minimum price (€)</Label>
        <div className="flex items-center gap-1 rounded-2xl bg-card px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-cobalt">
          <span className="font-mono text-[30px] font-bold text-mute">€</span>
          <input
            id="floor"
            inputMode="decimal"
            value={floor}
            onChange={(e) => setFloor(e.target.value.replace(/[^\d.,]/g, ""))}
            className="tabular w-full bg-transparent py-3 font-mono text-[30px] font-bold outline-none"
            placeholder="0"
          />
        </div>
        <p className="mt-2 px-1 text-[13.5px] text-mute">The agent sells it as fast as it can and never goes below this. It handles buyers and pickup on its own.</p>
      </section>

      <section className="mt-5">
        {showNotes ? (
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the photo doesn't show? Brand, size, a scratch on the back…"
            className="w-full animate-fade rounded-2xl bg-card p-4 text-[15px] outline-none ring-1 ring-line focus:ring-2 focus:ring-cobalt"
          />
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="px-1 text-[14px] font-semibold text-cobalt">
            + Add a note for the agent
          </button>
        )}
      </section>

      {error && <p className="mt-4 rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[440px] bg-gradient-to-t from-paper via-paper/95 to-transparent px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-10">
        <Button onClick={submit} disabled={!valid || busy !== null} className="w-full !py-4 !text-[19px]">
          {busy === "sending" ? (
            <>
              <span className="size-5 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
              Sending to your agent…
            </>
          ) : (
            <>Sell it</>
          )}
        </Button>
      </div>
    </main>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2.5 block px-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mute">
      {children}
    </label>
  );
}

function Corners() {
  const c = "absolute size-7 border-tag";
  return (
    <>
      <span className={cx(c, "left-5 top-5 rounded-tl-lg border-l-[3px] border-t-[3px]")} />
      <span className={cx(c, "right-5 top-5 rounded-tr-lg border-r-[3px] border-t-[3px]")} />
      <span className={cx(c, "bottom-5 left-5 rounded-bl-lg border-b-[3px] border-l-[3px]")} />
      <span className={cx(c, "bottom-5 right-5 rounded-br-lg border-b-[3px] border-r-[3px]")} />
    </>
  );
}
