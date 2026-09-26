# Wireframe prompt

First read `CONTEXT.md` in this folder completely. The photos are in `photos/`. If you are in Claude Code, use the `html-wireframe` skill for this task.

---

ROLE
You are a senior product designer who specialises in mobile UX and low-fidelity wireframes. You think in user goals, information hierarchy and task flow before visual style. You work like a professional: you state the review question, you use real content, and you keep the wireframe intentionally unfinished so the conversation stays about structure, not looks.

BEFORE YOU START: ASK FIRST
Do not start building until you are sure. If anything below or in CONTEXT.md is unclear, contradictory or missing, or you are not 100% sure what is meant:
- Ask your questions first, all in one message, numbered, max 8.
- For each question, give your recommended answer so I can just say "yes".
- List the assumptions you would make if I don't answer.
Only start building after I confirm. If new doubts come up while building, stop and ask again instead of guessing.

THE REVIEW QUESTION
Does every screen have exactly ONE clear purpose, is the order of screens right, and is it obvious at every moment what the agent is doing and what the user can do?

HARD RULES
- Mobile only: iPhone size, 390 x 844 px per screen.
- One purpose per screen: one question or one moment. If a screen tries to do two things, split it or flag it.
- Real content, no lorem ipsum. Use the example content from CONTEXT.md (IKEA Strandmon armchair, minimum 70, starts at 95, buyer Mila, deal at 80, pickup Saturday 14:00, lowball 55 from Tom).
- Low fidelity: grayscale only, system font, plain borders, simple blocks, small radius. No brand colours, gradients, shadows, illustrations, emoji; only simple outline icons where needed.
- Exception for photos: where the photo IS the content (camera, cover, the ad, ad cards, item thumbnails, similar listings), use the real photos from `photos/` (chair-livingroom.jpg is the main item). Reference them with relative paths so the HTML works from this folder.
- Accessibility basics: real buttons and inputs, touch targets of at least 44 px, readable text (min 14 px body), visible focus.
- No fake status bars. No features that are not listed below. Leave out everything marked "later".

THE SCREENS (in this order)
01 Snap it: full-screen camera, tip "Show the whole item, good light", photo strip (1 to 5, tap to remove), shutter and gallery, after the first photo an agent tip "Add one of the back?", button "Done".
02 Is this it?: cover photo picked by the agent (label "Cover", tap to swap), "IKEA Strandmon, armchair", condition chips (New, Like new, Good, Used; Good selected), details (colour dark green, brand IKEA, tap to edit), button "Yes, that's it", link "Fix it".
03 When should it be gone?: tabs "This week / 2 weeks / No rush", one line under the selected tab explaining the trade-off, button "Next".
04 What's your minimum?: one big price (70 euro) with minus and plus, hint "Similar ones sold for 60 to 120" with a small range bar showing your minimum, promise "Your agent never accepts less", button "Next".
05 How does it get to the buyer?: options Pickup (city: Amsterdam), Shipping (size S/M/L, who pays), Both; button "Create my ad".
06 Your agent is on it: steps that tick off: Item recognised (done), 23 similar listings found (done, tap to see them), Price: start at 95, never below 70 (running), Writing your ad (next); line "About 20 seconds". Moves on automatically.
07 Here's your ad: photos in the agent's order, title, price ("never below 70"), description, details (condition, pickup or shipping), each editable; platform toggles (Marktplaats, Vinted, eBay, Facebook); agent tip "A photo in daylight sells faster"; button "Approve and sell".
08 Going live: one row per platform agent with its status (Live, Posting 60%, Queued), swipe preview of the ad per platform, footer "You can close the app, we'll let you know". Push notification after: "Your chair is live on 4 platforms".
09 Your ads (home): summary "2 live, 1 needs you", ad cards with photo, title, price, status chip (Live, Negotiating, Needs you, Sold) and unread count; "Needs you" on top. Bottom navbar with only "Ads" and a big "+ Sell".
10 How this ad is going: item card with current price, status stepper (Live, Offers, Negotiating, Sold), numbers (views, saves, chats), what's happening now ("Answering 1 new message"), buttons "Open chats (3)", "Change goal", "Pause", "Take offline".
11 Chats for this ad: ordered sections: Needs you, Best offers (highest first), Recent, and folded "Lowballers and scams (2)". Each row: name, platform, last message, current offer, badge, unread dot.
12 Negotiating: header with buyer name, platform and a "serious buyer" badge; line "Aiming for 95, never below 70"; buyer messages left, agent messages right with an "Agent" tag; offer cards 50, counter 85, 80, accepted; deal card "Deal at 80" with pickup Saturday 14:00; "Take over" button: when tapped, a text field appears with an agent-suggested reply you can send with one tap.
13 Your call (only when an offer is below the minimum): "55 euro from Tom, your minimum is 70", agent advice "Seems serious. Counter at 70?", buttons Accept, Counter 70, Decline.
14 Sold: big "Sold for 80 euro", recap (2 days, 14 messages, 3 counters), removed from each platform, next step (pickup Saturday 14:00 with address shared, or shipping label ready), button "Sell something else".
Out of scope: clean-background photo editing, activity log, price plan.

WHAT TO DELIVER
- One self-contained HTML file saved in this folder as `wireframes.html`, no build tools, CSS and JS inline, photos via relative paths to `photos/`.
- All 14 screens as 390 x 844 phone frames, side by side in flow order (wrapping into rows), each with its number and purpose above it.
- Click-through: the main buttons navigate to the next screen, "Ads" and "+ Sell" in the navbar work, 13 opens from 12. Keep behaviour plain and immediate. Also offer a simple "play" mode that shows one phone at a time for walking through the flow (useful for recording the demo video).
- Small annotations only where something cannot be shown (for example "moves on automatically", "push notification").
- Where you see a better structural option (merging or splitting a screen, a better order), do not change it silently: add it as a numbered suggestion at the end.

HAND-OFF
After building, give me:
1. What you built and the assumptions you made.
2. Open questions and structural suggestions, numbered.
3. What you deliberately left for the visual design phase (colour, type, branding, motion).
