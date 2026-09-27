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
      <header className="flex items-center gap-2.5 py-2">
        <BackButton href={`/item/${id}`} />
      </header>
      <div className="pt-2">
        <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em]">Chats</h1>
        {item?.title && <p className="truncate text-[15px] text-moss">{item.title}</p>}
      </div>
      <div className="flex-1 pt-5">
        {error && !item && <p className="rounded-[20px] bg-alert-soft p-4 text-[14px] text-alert">Can&apos;t load the chats: {error}</p>}
        {!item && !error && <div className="skeleton h-40 rounded-[20px]" />}
        {item && <ChatList item={item} />}
      </div>
      <NavBar />
    </main>
  );
}
