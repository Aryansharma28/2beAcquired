"use client";

import { useParams } from "next/navigation";
import { useItem } from "@/lib/useItem";
import { ChatList } from "@/components/Chats";
import { BackButton, NavBar } from "@/components/ui";

/** 11 · Chats for this ad. */
export default function ChatsPage() {
  const { id } = useParams<{ id: string }>();
  const { item, error } = useItem(id);
  return (
    <main className="flex flex-1 flex-col px-5 pb-28 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <BackButton href={`/item/${id}`} />
        <div className="min-w-0">
          <p className="font-display text-[22px] font-extrabold leading-none tracking-[-0.03em]">Chats</p>
          {item?.title && <p className="mt-0.5 truncate text-[13px] text-mute">{item.title}</p>}
        </div>
      </header>
      <div className="flex-1 pt-3">
        {error && !item && <p className="rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">Can&apos;t load the chats: {error}</p>}
        {!item && !error && <div className="skeleton h-40 rounded-[22px]" />}
        {item && <ChatList item={item} />}
      </div>
      <NavBar />
    </main>
  );
}
