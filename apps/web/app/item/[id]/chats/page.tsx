"use client";

import { useParams } from "next/navigation";
import { useItem } from "@/lib/useItem";
import { ChatList } from "@/components/Chats";
import { NavBar } from "@/components/ui";

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
      <NavBar />
    </main>
  );
}
