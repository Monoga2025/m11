# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**PhysicsInk** — educational platform for engineering dynamics (Beer & Johnston). Students solve problems by writing with a stylus directly on the screen (Lenovo Tab M11 with stylus).

## Stack

- **Next.js 14** App Router
- **TypeScript** — strict mode, **never use `any`**
- **Tailwind CSS**
- **Fabric.js v6** — canvas for stylus input (browser-only, always dynamically imported inside `useEffect`)
- **AI:** OpenRouter (`OPENROUTER_API_KEY`) with model `deepseek/deepseek-v3-base`
  - Note: this is a text-only model. For vision analysis swap to a multimodal model in `lib/ai/analyzeExercise.ts`.

## Commands

```bash
npm install          # install deps
npm run dev          # start dev server (localhost:3000)
npm run build        # production build (outputs standalone for Docker)
npm run start        # run production build
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
```

## Architecture

```
app/
  page.tsx                  # Client component — owns all shared state
  layout.tsx                # Server component — root layout
  globals.css               # Tailwind + canvas touch-action overrides
  api/analyze/route.ts      # POST /api/analyze — calls analyzeExercise server-side

components/
  canvas/PhysicsCanvas.tsx  # Fabric.js canvas (always "use client")
  exercise/ExerciseImage.tsx # Floating draggable exercise image ("use client")

lib/
  types.ts                  # Point, Stroke, StrokeData, ExerciseAnalysis, AnalysisResult
  ai/analyzeExercise.ts     # OpenRouter call — SERVER-SIDE ONLY (uses OPENROUTER_API_KEY)
```

## Key Patterns

### Server vs Client components
Default to **Server Components**. Add `"use client"` only when genuinely needed. All canvas and exercise UI components require it. `app/page.tsx` is a client component because it manages shared state (ink color, ghost strokes, analysis result).

### Fabric.js in Next.js
Fabric.js accesses browser globals, so it **must** be dynamically imported inside `useEffect`:
```typescript
const { Canvas, PencilBrush } = await import('fabric');
```
Type-only imports at module level are safe for SSR:
```typescript
import type { Canvas as FabricCanvas } from 'fabric';
```

### Ghost strokes coordinate system
- `analyzeExercise` returns `ghostStroke` with **normalized (0–1) coordinates**.
- `page.tsx` scales them to pixel space using `window.innerWidth` / `window.innerHeight - 64` before passing to `PhysicsCanvas`.
- `Stroke` (for user-drawn strokes) always uses **pixel coordinates**.

### PhysicsCanvasHandle
`PhysicsCanvas` exposes a `takeSnapshot(): string` method via `forwardRef` + `useImperativeHandle`. Call it from `page.tsx` to get a base64 PNG of the student's work (ghost strokes are hidden in the snapshot).

### Pointer events & pressure
Stylus pressure is read via `(opt.e as PointerEvent).pressure` inside Fabric.js `mouse:down` / `mouse:move` event handlers. A `0.5` fallback is used for mouse input.

## Deployment (Easypanel / Docker)

The `Dockerfile` uses a three-stage Node 20 Alpine build. Requires `output: 'standalone'` in `next.config.ts` (already set). Port 3000.
