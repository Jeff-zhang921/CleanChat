---
name: ui-master
description: Senior UI review and implementation guidance for local web pages. Use when Codex needs to open a user-provided localhost URL or local web app in Playwright, capture a full-page screenshot, critique motion, layout, and Matter.js-driven physics as a senior interaction designer, and then produce concrete code-level improvement recommendations or patches.
---

# UI Master

## Overview

Inspect a local web page visually before giving design advice.
Use Playwright to capture the current UI, then review it as a senior interaction designer with emphasis on motion, composition, and Matter.js presentation quality.

## Workflow

1. Resolve the target page.
2. Inspect it with Playwright before analyzing anything.
3. Read the relevant local code after the visual pass.
4. Give direct, code-oriented improvements.

## Resolve The Target

Prefer the exact local URL, route, or dev server address provided by the user.

If the user gives a file path or vague page name rather than a URL:

- inspect the repo
- determine the likely local page and dev command
- use the most direct local URL you can justify

Ask a concise follow-up only when the target page cannot be inferred safely.

## Inspect With Playwright First

Always perform the browser inspection before offering design conclusions.

Preferred tool order:

1. Use the `Playwright MCP` MCP server if it is available in the current environment.
2. If `Playwright MCP` is unavailable, say so plainly and stop the visual review rather than inventing observations.

Do not fall back to the local Playwright CLI workflow for this skill.

Do not ask permission for the inspection step when the user has already invoked this skill for UI review. Just perform the browser inspection.

Minimum inspection loop:

1. Open the user-provided local page.
2. Wait for the page to settle enough for a representative capture.
3. Capture a full-page screenshot.
4. If the page contains motion-heavy or Matter.js content, inspect long enough to understand the rhythm and physical behavior instead of judging from static structure alone.
5. Re-capture if an overlay, cookie prompt, or loading state obscures the actual UI.

Store screenshots in a local artifact path when applicable, but keep the user-facing output focused on findings and code suggestions.

## Review The Code After The Screenshot

After the visual pass, inspect the source files that control:

- page structure and layout
- typography and spacing tokens
- animation timing and transitions
- Matter.js world setup, runner timing, bodies, constraints, restitution, friction, damping, gravity, bounds, and render layering

Read the smallest useful set of files. Prefer the actual page entrypoint plus the animation or physics modules that drive the visible behavior.

## Analyze Like A Senior Interaction Designer

Use the checklist in [references/review-checklist.md](references/review-checklist.md).

Focus on three dimensions:

- motion quality
- layout and hierarchy
- Matter.js physical presentation

Judge motion by purpose, pacing, easing, continuity, and whether it supports comprehension rather than distracting from it.

Judge layout by hierarchy, alignment, whitespace discipline, typography scale, density, responsiveness, and whether the eye lands where the product wants it to.

Judge Matter.js scenes by:

- physical plausibility
- visual clarity of bodies and collisions
- whether mass, damping, restitution, and gravity feel intentional
- whether the physics layer supports the product story instead of feeling like a demo pasted on top
- whether canvas, DOM, and hit targets feel integrated

## Output Format

Lead with the highest-impact findings, not a generic summary.

When the user asked for critique only, provide:

1. the key visual and interaction issues
2. the likely root cause in code
3. concrete code changes to make next

When the user asked for implementation help, move from findings directly into patches.

Prefer recommendations that are specific enough to implement:

- exact timing and easing adjustments
- spacing, width, or typography changes
- Matter.js parameter changes
- DOM and CSS restructuring suggestions
- file-specific edits with paths and rationale

Do not give vague design language like "make it pop" or "improve UX."

## Guardrails

Do not claim a visual issue unless it comes from actual inspection of the page.

Do not infer motion quality purely from static code when a browser check is possible.

Do not stop at screenshot critique if the user clearly wants code guidance. Trace the relevant implementation and tie every major suggestion back to code.

If the page is broken or cannot be reached locally, report that first and include the exact blocker.
