import { iconResponse } from "@/lib/icon";

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable-512" }];
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const maskable = size.startsWith("maskable");
  return iconResponse(Number(size.replace("maskable-", "")) || 512, maskable);
}
