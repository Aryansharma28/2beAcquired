# Context: AI sell agent (Build Weekend, Young Creators x Prosus)

Everything a new session needs to make the mobile wireframes. Read this fully, then follow `PROMPT.md`.

## 1. The challenge

- Build Weekend by Young Creators x Prosus, StartDock Amsterdam, Sat 26 and Sun 27 Sept 2026, about 35 teams.
- The one rule: what you build must act autonomously. Chatbot = answers when asked. Copilot = does the work but you approve every step. Autonomous = notices something, decides, acts, learns and tells you what happened, and knows when to bring in a human and when to stop.
- Judging: Autonomy 25%, Proven in real use 25% (real data, real actions, logs, an unattended run, a failure it handled itself), Apify and n8n 20%, Problem fit 15%, Product and presentation 15%.
- Round 1: a video of max 2 minutes by Sunday 15:00; a panel reviews all ~35 videos in one hour. Round 2: top 10 pitch live at 16:15, 3 minutes plus questions.
- Partners: n8n, Apify, Mollie. Prosus owns OLX, so the jury knows classifieds well.
- Team: Teije (designer) plus 2 strong AI vibe coders. We build today, Sunday is for the pitch. We only build the demo, and want a 30-second vertical demo video for socials and traction.

## 2. The product (name still open)

An autonomous AI agent that sells your second-hand stuff for you.
- You snap a photo, pick when it should be gone and your minimum price.
- The agent recognises the item, prices it from comparable listings, writes the ad, posts it on Marktplaats, Vinted, eBay and Facebook (one agent per platform), negotiates with buyers on its own, and removes the listing everywhere once sold.
- You only step in when an offer is below your minimum. You can always watch along, take over a chat, pause, or change your goal.
- Core promise: "Your stuff, sold. Without the hassle."

Tech (for context, not for the wireframes): n8n runs the workflows (intake, publish, inbox every 2 min, reprice hourly, sold). Apify pulls comparable listings (Marktplaats, Vinted, eBay scrapers) and our own Apify actor posts and reads the inbox via browser automation. Claude recognises photos and writes the ad and replies. Jev (TypeSafe) makes the fast judgments: which comparable listings match, which buyer is serious / lowballer / scam, and whether to accept, counter or wait. eBay has an official API as fallback.

## 3. Decisions already made (do not change without asking)

- Mobile app, phone first.
- Every screen has ONE purpose (one question or one moment).
- Goal is split in two questions: "When should it be gone?" (this week / 2 weeks / no rush) and "What's your minimum?" (a price).
- You approve the ad once, then the agents put it online by themselves, one agent per platform with its own progress.
- After going live you follow along via a tracker per ad, a home screen with all your ads, and a chat overview per ad.
- Chats per ad are ordered: needs you, highest offer, most recent; lowballers and scams folded at the bottom.
- Handover: pickup or shipping (or both), chosen per item.
- Take over a chat: you type yourself and the agent suggests a reply you send with one tap.
- Ad page stays simple: status, numbers, what's happening now, open chats, change goal, pause, take offline.
- Photos: the agent picks the cover and suggests missing angles, but does not edit photos.
- Navbar after going live: only "Ads" (home) and a big "+ Sell".
- Aha moments for the demo: the ad ready on all platforms, the "live" notification, watching the agent negotiate, the "sold" notification.
- Later, NOT for the demo: clean-background photo editing with animation, activity log, price plan.
- Visual design and brand personality are handled in a separate session. The wireframes must stay low fidelity (grayscale), except real photos where the photo is the content.

## 4. The flow (14 screens)

01 Snap it · 02 Is this it? · 03 When should it be gone? · 04 What's your minimum? · 05 How does it get to the buyer? · 06 Your agent is on it · 07 Here's your ad · 08 Going live · 09 Your ads (home) · 10 How this ad is going · 11 Chats for this ad · 12 Negotiating · 13 Your call (only if an offer is below the minimum) · 14 Sold.
The full content per screen is in `PROMPT.md`.

Example content to use everywhere: IKEA Strandmon armchair, dark green, good condition. 23 similar listings sell for 60 to 120 euro. Starts at 95, never below 70. Buyer Mila on Marktplaats: offers 50, agent counters 85, Mila offers 80, deal at 80, pickup Saturday 14:00. Lowball offer: 55 euro from Tom.

## 5. UX references (Mobbin, clickable)

- 01 Snap: eBay photo tips https://mobbin.com/screens/75dad681-41a4-4103-91c8-706ef8d740a0 · Yami scan dots https://mobbin.com/screens/6e09bc52-a188-4e3a-8534-ab434af78589 · Whatnot photo grid https://mobbin.com/screens/b1e48a3c-435b-419e-b542-275daba7e001
- 02 Is this it: eBay recognition https://mobbin.com/screens/2437b966-bc35-4f82-b5d0-3ea451897036 · DICK'S scan result https://mobbin.com/screens/df28e20e-2f23-4f33-a359-eaa8d47ca63e · Lloyds "Have we read your ID correctly?" https://mobbin.com/screens/f7a27995-e8c7-4923-b1e6-9d53cd1e3559
- 03 When gone: DICE tabs https://mobbin.com/screens/a6d5e953-059f-41a6-b567-5f1594de95b5 · stoic. time pills https://mobbin.com/screens/1eff4f38-a258-4319-8264-02b7fdfe97d5 · Me+ segmented https://mobbin.com/screens/b7225a7f-d941-44d9-be13-d4bf821885c5
- 04 Minimum: Kraken target price https://mobbin.com/screens/b1b9a9a6-b7c9-43e2-a7e4-37261e441d63 · Grailed sold range https://mobbin.com/screens/360b7405-b221-4b75-bbc3-21242fecec7b · Lightyear price alert https://mobbin.com/screens/d4cf4dae-e576-470e-add2-36d562c0d2f6
- 05 Handover: Shopee pickup or delivery https://mobbin.com/screens/703b228a-0988-437c-a86f-7ff62d64c031 · Fresha pickup https://mobbin.com/screens/5a81131b-9c26-40a7-a831-ba4c049fa5c3 · Woolworths method https://mobbin.com/screens/249c817c-1f66-43cd-b174-107f1f8c7c0e
- 06 Agent at work: Calm checklist https://mobbin.com/screens/52e0bf63-158b-49be-a8d6-fd6bab9c17af · Perplexity steps https://mobbin.com/screens/de4e581f-945f-4abf-8be4-583c7bee04d5 · Manus sub-steps https://mobbin.com/screens/1fcf114e-d809-4e1c-94c8-4cefb5520a37
- 07 Your ad: eBay review listing https://mobbin.com/screens/3d721318-f32c-4e6c-954e-23018fb3fd68 · Vestiaire review https://mobbin.com/screens/87e172a6-ea15-4dd8-80bd-cbcdaf551833 · Alta item card https://mobbin.com/screens/c1c7aa27-029c-4c8c-8970-bd008ee44673
- 08 Going live: Dropbox uploads https://mobbin.com/screens/0344b16a-a8e5-442b-a8f9-efddae1ab159 · GoPro Quik rows https://mobbin.com/screens/d9d1710a-5585-42da-ae77-c4811a8ed7b0 · Fabric queue https://mobbin.com/screens/5147837c-94f4-4b9b-889f-4af0e985dcd6
- 09 Your ads: Whatnot cards https://mobbin.com/screens/88de456a-36ab-4456-b294-c14cf94ccc56 · Revolut Business list https://mobbin.com/screens/92523bcc-943b-4b63-b82b-01106b6ea268 · stoic. navbar https://mobbin.com/screens/dff57a4a-84c2-4173-88d3-c300700b2593
- 10 Ad status: eBay active listing https://mobbin.com/screens/15399c72-1e63-438e-af52-ec1bace49436 · Airbnb host listing https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a · StubHub stepper https://mobbin.com/screens/b3c71fe5-884d-4f57-85a2-8b39192d46d8
- 11 Chats: Peerspace priority inbox https://mobbin.com/screens/13fbbdbe-437d-48ed-92ee-4b07155661cb · Notion Mail https://mobbin.com/screens/7a35d0c0-4ec2-4289-b21b-b7e4553a8cc2 · Expensify https://mobbin.com/screens/7da2c6b0-471c-4c46-bec5-1de2f2d6126f
- 12 Negotiating: eBay offer cards https://mobbin.com/screens/64936389-7c59-4394-9480-b60d70ab05bd · Grailed bot badge https://mobbin.com/screens/b8098cc7-9b0a-44fe-bcaf-04eba1b3762f · Depop make offer https://mobbin.com/screens/2135e249-6484-4728-959a-7880867f1f7b
- 13 Your call: Vinted offer https://mobbin.com/screens/63834367-46bf-49a0-90ac-89dd355cea9f · inDrive accept https://mobbin.com/screens/b74a2d56-a8da-4ecd-b8fe-a0d7618364ba · Airtasker bids https://mobbin.com/screens/da38f2a7-176c-43ea-a635-409920931031
- 14 Sold: Wise done https://mobbin.com/screens/d03d7181-826c-4fc1-9910-88ce41e93010 · Cash App https://mobbin.com/screens/5f175b2f-cd07-4a43-831d-d8cc97607a2c · Vestiaire earnings https://mobbin.com/screens/dbc45f74-6236-4081-b937-188553c8a896
- Full listing flows: Depop https://mobbin.com/flows/9f6278f3-41a4-4e03-9e3f-0db7cc5bcac7 · eBay https://mobbin.com/flows/759f1243-69b1-49e9-93da-01cb9ac6ee65

UX principles from research:
- Show the agent's work as steps that tick off one by one, in human words; tap a step for the why.
- Offers are cards in the chat (amount big), agent messages carry an "Agent" tag, "Take over" is always visible.
- Control is always one tap away (pause, take over). Autonomy without visible control feels like losing control.
- End the video on the "Sold" push notification on a lock screen.

## 6. Competitors (for context)

Nobody does the whole flow. onlist.ai negotiates but only on eBay. Meta's Seller App writes the listing and answers first messages, only on Facebook. Marktplaats AI writes title and description from a photo. Vendoo, Crosslist and Nifty crosspost but don't negotiate. Mercari Smart Pricing lowers the price, only on Mercari. Our edge: one agent, one goal and a minimum price, negotiating and delisting across every marketplace.

## 7. Photos (in `photos/`, all from Unsplash, free to use, no faces)

- chair-livingroom.jpg: green armchair in a colourful living room (use as the IKEA Strandmon cover). Fujiphilm.
- chair-back.jpg: brown wingback chair from the side (second angle). Eran Menashri.
- chair-close.jpg: off-white armchair in a reading nook (third angle / similar listing). Erica Marsland Huynh.
- jacket.jpg: blue washed jacket on a white door (other ad on home). Kemal Alkan.
- bike.jpg: black city bike by an Amsterdam canal (other ad). Callum Parker.
- lamp.jpg: mid-century desk, chair and lamp (other ad). Urban Vintage.
- sneakers.jpg: white low-top sneakers (other ad or similar listings). Stephen Murphy.
- record-player.jpg: vintage record player (other ad). Lesha Tuman.

## 8. Where the rest lives

- FigJam (TodayTomorrow account): https://www.figma.com/board/X9fNw0lVlAkxL8LhhKQPCz/Build-weekend (sections "Demo UX flow, detailed: one purpose per screen", "UX flow (phone)", "Moodboard: style directions", "How Apify and n8n power it", "Pitch flow").
- Team board: https://www.figma.com/board/VZJ6JjAEWm1bZlrSFPL0yw/Untitled
- Earlier design explorations (rejected as too generic, no photos): https://claude.ai/artifact/Kz7k3P9Fj8MTwREDqDweks
