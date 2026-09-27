"use client";

import Link from "next/link";

type Tab = "ads" | "chats";

/**
 * The prototype's navbar (#tabbar): four equal items, one lime indicator pill behind the active one.
 * Ads, Chats, Sell (opens the sell sheet at /new) and Profile.
 */
export function Navbar({
  active = "ads", chatsHref, chatBadge = 0, onProfile,
}: {
  active?: Tab;
  /** Where Chats goes; without it the tab does nothing (no chats yet). */
  chatsHref?: string;
  /** Chats that need you. */
  chatBadge?: number;
  /** Profile opens the settings sheet on Home; elsewhere it goes to Home and opens it there. */
  onProfile?: () => void;
}) {
  const idx = active === "chats" ? 1 : 0;
  return (
    <nav id="tabbar" aria-label="Main">
      <span
        className="tab-indicator"
        aria-hidden="true"
        style={{ width: "calc((100% - 12px) / 4)", transform: `translateX(calc(6px + ${idx} * 100%))` }}
      />
      <Link className="tab" href="/" aria-current={active === "ads" ? "page" : undefined}>
        <svg className="icon"><use href="#i-grid" /></svg><span className="lbl">Ads</span>
      </Link>
      {chatsHref ? (
        <Link className="tab" href={chatsHref} aria-label="Chats" aria-current={active === "chats" ? "page" : undefined}>
          <ChatsInner badge={chatBadge} />
        </Link>
      ) : (
        <button className="tab" type="button" aria-label="Chats" aria-disabled="true">
          <ChatsInner badge={chatBadge} />
        </button>
      )}
      <Link className="tab" href="/new" aria-label="Sell something">
        <svg className="icon"><use href="#i-plus" /></svg><span className="lbl">Sell</span>
      </Link>
      {onProfile ? (
        <button className="tab" type="button" aria-label="Profile" onClick={onProfile}>
          <svg className="icon"><use href="#i-user" /></svg><span className="lbl">Profile</span>
        </button>
      ) : (
        <Link className="tab" href="/?profile=1" aria-label="Profile">
          <svg className="icon"><use href="#i-user" /></svg><span className="lbl">Profile</span>
        </Link>
      )}
    </nav>
  );
}

function ChatsInner({ badge }: { badge: number }) {
  return (
    <>
      <span className="ico">
        <svg className="icon"><use href="#i-chat" /></svg>
        <span className="tbadge" hidden={badge <= 0}>{badge}</span>
      </span>
      <span className="lbl">Chats</span>
    </>
  );
}
