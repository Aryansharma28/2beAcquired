# Prompt: Poof waitlist landing page

You are a senior brand and web designer. Build a very simple waitlist landing page for **Poof**, an autonomous AI agent that sells your second-hand stuff for you (snap a photo, it prices, posts, negotiates with buyers and removes the ad once sold). Hackathon project, Build Weekend (Young Creators x Prosus, Amsterdam).

## Scope
- One hero, plus at most ONE short section that explains how it works (3 steps: Snap it, It haggles, Poof, sold). Nothing else: no pricing, no FAQ, no footer clutter beyond one small line.
- Waitlist: one email field and one button ("Join the waitlist"), with a clear success state after submit. Ask me first how submissions should be stored (for now a front-end only success state is fine unless I say otherwise).
- Mobile first, also great on desktop. One self-contained HTML file.
- Save it as `~/Developer/2beAcquired/design/landing/index.html` (git branch `design/wireframes`). Only write inside `design/landing/`. Never commit, push or deploy without my explicit yes.

## Brand (read these first, they are law)
- Styleguide: `~/Developer/2beAcquired/design/visual/poof-styleguide.html` (colours, type, radius, spacing, shadows, hand-marker highlight, puff divider, buttons, slide button, cloud mark).
- Project notes: `~/Library/CloudStorage/GoogleDrive-keesmaat123@gmail.com/Mijn Drive/Secondbrain/020-projecten/poof/README.md`.
- Key rules: name "Poof" (no dot), wordmark in Baloo 2 800 with the cloud mark. Slogan "Sell anything", with the tilted lime hand-marker highlight. Colours: Lime #D7F57A on Ink #0F2A18 as the core pair, Page #F4F6F4, Surface #FFFFFF, Moss #4A5F50, Lime tint #EEFBC8, Line #E1E8E3. App type Figtree. No orange, not everything dark. One hand-marker highlight per view.
- Concept line: "Poof, and it's gone."

## Inspiration (look at every image before designing)
Folder: `~/Library/CloudStorage/GoogleDrive-keesmaat123@gmail.com/Mijn Drive/Secondbrain/020-projecten/poof/inspo/`
- `croissant-landingpage.png`, left panel: objects worked into the letters of the headline. This is the main reference for the hero.
- `crafted-locally-collage.png` (left side) and `friendship-scrapbook.png`: collage of things.
- `yuka-sticker-cutouts.png`, `truus-footer-stickers.png`, `truus-kaarten-stickers.png`: sticker-like cut-outs.
- `baseclub-poster-blauw-lime.png`, `foodtruckclub-bold.png`, `shinta-roze-lijnen.png`: bold poster energy.
- `blume-wolkjes-logo.png`: cloud shapes.
- Brandboard: https://claude.ai/artifact/DwZJEaadYcL3zjV4HJaNNy

## The hero idea
A playful collage of many different, typical second-hand items as cut-outs (think: a bike, armchair, lamp, sneakers, camera, guitar, game console, jacket, record player, plant, kettle, books, skateboard, headphones, mirror), worked around or into a big headline like "Sell anything", as if Poof is about to make them disappear. Personality, not a template. Lots of whitespace around the collage and the form.

## Photos (important)
- Use real photos, never grey placeholders or illustrations. Ordinary, slightly "ugly" second-hand ad photos that you cut out yourself, not glossy product shots.
- Existing cut-outs you can reuse: `~/Developer/2beAcquired/design/visual/assets/*-cutout.png` (PS4, egg chair, Canon camera, table lamp, lilac sneakers, electric guitar).
- For the other items: find free-to-use photos (Unsplash or Pexels, ad-style shots), save the originals in `design/landing/assets/`, and cut them out with macOS Vision subject lifting. Compile this once with `swiftc -O cutout.swift -o cutout`, then run `./cutout input.jpg output.png`:

```swift
import Vision
import CoreImage
import AppKit
let args = CommandLine.arguments
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
guard let ci = CIImage(contentsOf: inURL) else { fatalError("load") }
let handler = VNImageRequestHandler(ciImage: ci)
let req = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([req])
guard let obs = req.results?.first else { fatalError("no subject") }
let buf = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: true)
try CIContext().writePNGRepresentation(of: CIImage(cvPixelBuffer: buf), to: outURL, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
```
  Use absolute paths, convert PNG input to JPG first if loading fails, then trim and resize with ImageMagick (`magick in.png -trim +repage -resize '800x800>' out.png`). Check every cut-out visually.

## Before you build
Ask me your questions in one message (max 6), each with your recommended answer, plus the assumptions you'll make if I don't answer. Then build, screenshot it at phone and desktop width (headless Chrome), fix what looks off, and show me the result. Talk to me in Dutch; the page copy is English.
