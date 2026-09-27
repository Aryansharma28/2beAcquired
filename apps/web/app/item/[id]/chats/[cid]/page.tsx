"use client";

import { useParams } from "next/navigation";
import { useItem } from "@/lib/useItem";
import { BackIcon, Negotiation } from "@/components/Chats";

/** One chat (prototype: renderChatMila). No navbar, like the prototype. */
export default function ChatPage() {
  const { id, cid } = useParams<{ id: string; cid: string }>();
  const { item, error } = useItem(id);
  const c = item?.conversations.find((x) => x.id === decodeURIComponent(cid));
  return (
    <main className="pv2 flex flex-1 flex-col">
      {item && c ? (
        <Negotiation item={item} c={c} />
      ) : (
        <>
          <div className="top2"><BackIcon href={`/item/${id}`} /></div>
          <div className="body2">
            {error && !item && <p className="muted small">Can&apos;t load this chat: {error}</p>}
            {!item && !error && <div className="skeleton h-60 rounded-[20px]" />}
            {item && !c && <p className="muted small">This chat isn&apos;t there anymore.</p>}
          </div>
        </>
      )}
    </main>
  );
}
