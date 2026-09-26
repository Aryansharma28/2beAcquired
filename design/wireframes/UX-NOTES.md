# poof wireframes: UX notes

Low-fidelity wireframes of the FigJam flow **"Demo UX flow, detailed: one purpose per screen"** (Build weekend board). They cover everything we show in the pitch and the pitch video: 14 screens plus 2 lock-screen pushes.

Review question: *does every screen have exactly one purpose, is the order right, and is it always clear what the agent is doing and what the user can do?*

## How to open

- Double-click `design/wireframes/wireframes.html` (no build, no server).
- Truly low fidelity: no colour and no photos. Crossed grey boxes are image placeholders; grey bars are body text. The review is about layout, hierarchy and flow only.
- **Overview**: all frames side by side in flow order. Buttons click through and scroll to the target frame.
- **Play**: one phone at a time, fitted to the window, for walking through or screen-recording the demo. Use Prev / Next, the screen menu or the arrow keys. In Play, 06 and 08 advance on their own and pushes appear as a banner.
- "Show notes" hides the dashed notes under each phone (handy for recording).
- Figma: the same frames, one row in flow order, in [poof · mobile wireframes](https://www.figma.com/design/8ePtaivdmW79Rv5TrHKct9?node-id=5-2) (Todaytomorrow team; the latest page is round 3, the two earlier pages can be deleted). To re-capture, open `wireframes.html?figma` (one-row layout with flow arrows, no toolbar) and use the Figma html-to-design capture.
- Dashed "Simulate" buttons stand in for events that come from the agent (steps done, all live, offer below minimum, deal closed).

Content everywhere: IKEA Strandmon armchair, dark green, good. 23 similar listings, 60 to 120. Starts at 95, never below 70. Mila offers 50, agent counters 85, Mila offers 80, deal at 80, pickup Saturday 14:00. Tom offers 55 (below the minimum).

## Round 3 (feedback: calmer screens, grid home, product detail, new navbar)

- **Navbar** on top-level screens: Ads, Chats, Sell, Profile. Chats carries a badge for what needs you. Detail, chat, decision and sold screens have no navbar; they have their own bottom action.
- **09 Your ads** is a 2-column grid: photo and title only. Status moved to the ad itself.
- **10** is a product detail page: big photo with back and more, location and age, "Live on" platforms, 4-step status, views/saves/chats, what the agent does now, Change goal / Pause / Take offline, and a pinned bar with the asking price and "Open 3 chats".
- **11 Chats** is its own tab: all chats grouped per ad, needs you first, lowballers and scams folded per ad.
- **Calmer**: 03 lost the speed/price blocks, 04 the stats row, 06 the progress bar and thumbnails, 12 the range bar (the item and Take over sit on top instead), 13 the comparison bar and buyer card, 14 the receipt (now a short recap plus a Next timeline).
- **Open**: what goes in the Profile tab (pickup details, connected accounts, payouts?).

## How screens are filled (round 2, Mobbin research)

Round 1 was too sparse. Round 2 fills every screen with content that helps the one purpose, based on Mobbin patterns:

- **Steps 02 to 05**: segmented progress and "n of 4" in the header; from 03 an item context card on top (Structured); a supporting line under each question and a reassurance line near the button (TIDE).
- **03**: per tab a trade-off line, speed and price blocks, and "What to expect" (start price, likely sale price, likely time).
- **04**: big stepper plus a histogram of the 23 listings with your minimum marked and lower bars hatched (Kraken, Crypto.com), lowest/typical/highest, and the promise card.
- **05**: option cards that each say what the choice means; the chosen one opens its fields.
- **06**: every step shows its result (Manus, Perplexity), plus a skeleton of the ad being written.
- **08**: "2 of 4 live" summary with an overall bar, per-platform rows with their own progress (Dropbox, Fabric).
- **09**: summary tiles, one attention banner for what needs you, ads grouped Selling / Sold (Fiverr, Whatnot).
- **10**: status line, stats with today's change, "Now" and "Next", top chats, then controls.
- **12**: a range bar with every offer against minimum and target, above the chat.
- **13**: offer against minimum, typical and asking price; buyer card; the agent's reasons; advice as the primary button (eBay offer).
- **14**: result, next step, a receipt (asked, minimum, sold for) and the removed platforms (Public, Coinbase).

Deviations from FigJam, to confirm: no navbar on 12 and 13; a "Next" line on 10 (light price plan); home puts the chair in "Needs you" so the whole story (09, 10, 11, 13) is one item.

## Per screen

| # | Screen | Purpose | Unclear or more than one purpose | Suggestion |
|---|---|---|---|---|
| 01 | Snap it | Take 1 to 5 photos | Clear. | Keep "Done" disabled at 0 photos. |
| 02 | Is this it? | Confirm the item | Two jobs share a screen: confirm the item and set its condition. Condition is quick, so it stays. "Fix it" has no defined target in FigJam. | "Fix it" edits the name inline (as drawn); colour and brand edit via their own pencil. |
| 03 | When should it be gone? | Pick a pace | FigJam has no trade-off line for "2 weeks". No default tab is defined. | Placeholder line: "A good price, sold within two weeks." Default: This week. |
| 04 | What's your minimum? | Set the floor | Clear. Which starting value (70) does the agent suggest, and why? | Pre-fill the minimum from the low end of the market range and say so in one line. |
| 05 | How does it get to the buyer? | Pick handover | "Both" needs both sets of fields; drawn as a summary only. | For Both, show the pickup city and shipping size in one compact block. |
| 06 | Your agent is on it | Watch | Clear. Tapping the other steps for "the why" is mentioned in older FigJam versions, not in the detailed one. | Keep only "See them" tappable for the demo. |
| 07 | Here's your ad | Approve | **More than one purpose**: review the ad, edit fields and choose platforms. Long screen, the button is far from the content. | Collapse "Where" into one row ("On 4 platforms, change") so the screen stays about the ad itself. |
| 08 | Going live | Watch | Clear. The previews are identical in low-fi; their value only shows once each looks like the platform. | Visual phase: style each preview like its platform. |
| P1 | Push: live | Aha | Clear. | Tapping it opens home (09), not the ad. Consider opening the ad (10) instead. |
| 09 | Your ads | Pick an ad | "2 live · 1 needs you" is ambiguous: does Negotiating count as live? What opens when you tap a "Needs you" card: the ad or straight to the decision? | Summary per status ("1 needs you · 2 selling · 1 sold"). A "Needs you" card opens the decision (13) directly. |
| 10 | How this ad is going | Open the chats | **Four actions compete** (Open chats, Change goal, Pause, Take offline). "Change goal" has no defined target. "Take offline" needs a confirm. | One primary action (Open chats); Pause stays visible (control within one tap); Change goal and Take offline go under "More". Change goal reopens 03 and 04 as a sheet. |
| 11 | Chats for this ad | Pick a chat | Where is the line between "Needs you" (Tom, 55) and "Lowballer" (Sander, 20)? Both are below the minimum. | Rule: below the minimum but within about 20% = needs you; further below = lowballer, auto-declined and folded. |
| 12 | Negotiating | Watch, take over | The header carries a lot (back, avatar, name, platform, badge, Take over). The navbar competes with the composer when you take over. | Hide the navbar on 12 and 13. Put the badge under the name; keep "Take over" in the header. |
| 13 | Your call | Decide | FigJam says "counter goes back to 12", but 12 is Mila's chat, not Tom's. The navbar distracts from the one decision. | Counter goes to Tom's chat (same layout as 12). No navbar on this screen. Make the agent's advice the primary button (Counter 70), as drawn. |
| 14 | Sold | Enjoy | Recap says 3 counters while the chat shows 1. The removed rows and the next step compete for attention with the big number. | Make the recap match the chat. Order: big number, next step, removed rows (as drawn). |
| P2 | Push: sold | End of video | Clear. | Last shot of the video. |

## Suggestions for Aryan (numbered)

These compare the FigJam flow with what the app has today. "Demo" = worth building before the video; "later" = fine without.

1. **Take over in the chat (12)**: a "Take over" button that shows a composer with an agent-suggested reply you send in one tap, plus "Let the agent continue". Demo: it is the visible proof that you stay in control.
2. **Pause on the ad screen (10)**: one tap stops the agent answering; "Resume" starts it again. Demo.
3. **Your call (13)**: when an offer is below the minimum but close, ask the owner instead of declining (push "Offer below your minimum. Your call."). This matches the jury's "knows when to bring in a human". Demo, but it reverses the v2 "fully autonomous" decision, so a team decision first.
4. **Pushes**: "live" and "sold" are aha moments in the pitch. At least those two as real notifications (ntfy is already in the plan). Demo.
5. **Chats sections (11)**: add a "Needs you" section on top and fold lowballers and scams. The app has best offers, recent and folded lowballers already. Demo, small change.
6. **Home summary and "Needs you" first (09)**: status per card plus unread count, "Needs you" cards on top. Demo, small change.
7. **Change goal and Take offline (10)**: reopen the goal questions as a sheet; take offline with a confirm. Later.
8. **Platforms**: the flow shows 4 platform agents; the app has Marktplaats live and the rest as "Soon". For the video either show 4 honestly or keep "Soon". Team decision.
9. **Shipping and "Both" (05)**: pickup only in the app. Later.
10. **Price plan and activity log on 10**: FigJam marks them "later". The app shows both; consider moving them behind a "How your agent works" link so 10 keeps one purpose. Later.
11. **Onboarding, Connect Marktplaats and Settings** exist in the app but not in the FigJam flow. They are needed for a real run but not shown in the video; the visual design phase should still cover them. Later.

## Open questions

1. Trade-off line for "2 weeks" (03), and which tab is the default.
2. Line between "needs you" and "lowballer" (11).
3. Where "Counter 70" leads (13): Tom's chat, not Mila's.
4. Does P1 open home or the ad?
5. Is "Your call" in or out for the demo (team decision, see suggestion 3)?

## Deliberately left for the visual design phase

- Colour, type, brand personality and the logo (poof cloud icon).
- Platform-styled ad previews (08) and platform logos.
- Motion: steps ticking off (06), agents going live (08), the "poof" moment on sold (14).
- Lock-screen styling for the pushes (P1, P2), including the final shot of the video.
- Photo treatment: cover crops, the camera viewfinder, thumbnails.
- Density and spacing; the wireframes use plain boxes on purpose.

Out of scope for now (FigJam "later" or older iterations): clean-background photo edit, activity log, price plan, prediction line ("likely sold in about 4 days"), Mollie payment link, "time saved" in the recap.
