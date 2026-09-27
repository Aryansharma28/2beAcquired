"use client";

import { useParams } from "next/navigation";
import { useItem } from "@/lib/useItem";
import { ChatList } from "@/components/Chats";
import { Navbar } from "@/components/Navbar";

/** Chats for this ad (prototype: renderChats). */
export default function ChatsPage() {
  const { id } = useParams<{ id: string }>();
  const { item, error } = useItem(id);
  return (
    <main className="pv2 flex flex-1 flex-col">
      {item && <ChatList item={item} />}
      {!item && (
        <div className="body2 has-nav" style={{ paddingTop: 28 }}>
          <h1 className="q" style={{ fontSize: 28 }}>Chats</h1>
          {error ? <p className="muted small">Can&apos;t load the chats: {error}</p> : <div className="skeleton h-40 rounded-[20px]" />}
        </div>
      )}
      <Navbar active="chats" chatsHref={`/item/${id}/chats`} chatBadge={item?.status === "needs_you" ? 1 : 0} />
    </main>
  );
}
