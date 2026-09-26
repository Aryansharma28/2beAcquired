"use client";

import { useParams } from "next/navigation";
import { useItem } from "@/lib/useItem";
import { Negotiation } from "@/components/Chats";
import { BackButton, NavBar } from "@/components/ui";

/** 12 · Negotiating (one chat). */
export default function ChatPage() {
  const { id, cid } = useParams<{ id: string; cid: string }>();
  const { item, error } = useItem(id);
  const c = item?.conversations.find((x) => x.id === decodeURIComponent(cid));
  return (
    <main className="flex flex-1 flex-col px-5 pb-28 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <BackButton href={`/item/${id}/chats`} />
        {item?.title && <p className="min-w-0 truncate text-[13.5px] text-mute">{item.title}</p>}
      </header>
      <div className="flex-1 pt-3">
        {error && !item && <p className="rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">Can&apos;t load this chat: {error}</p>}
        {!item && !error && <div className="skeleton h-60 rounded-[22px]" />}
        {item && !c && <p className="rounded-2xl bg-card p-4 text-[14px] text-ink-2 shadow-soft">This chat isn&apos;t there anymore.</p>}
        {item && c && <Negotiation item={item} c={c} />}
      </div>
      <NavBar />
    </main>
  );
}
