/** VAPID public key (safe to ship). The private half lives only in the server env (VAPID_PRIVATE_KEY). */
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BPEtfwr2PjfP65kEBbPOP8bruSgjkQJgnI7M1AbSn6DsiLBONghEgjTCWavxHt4-NciDpQtHZMDk6xR90EqRnT0";
