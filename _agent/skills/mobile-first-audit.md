---
name: mobile-first-audit
description: >-
  Audit the rendered mobile/touchscreen experience of a local web app and make
  opinionated, mobile-first improvements. Renders the app at real phone viewports
  with touch emulation, screenshots it, diagnoses against a phone-affordances
  checklist (touch targets, thumb zones, safe areas, keyboards, hover traps,
  overflow), then fixes and re-verifies. Treats mobile as the primary experience
  and desktop as secondary, stating tradeoffs plainly. Use this WHENEVER the user
  asks to review, audit, improve, or "look at" the mobile, responsive, touch, or
  phone experience of a web app — including phrasing like "check how this looks on
  my phone," "fix the mobile layout," "is this usable on mobile," "audit touch
  targets," "thumb reachability," "safe areas / notch," or "it works on desktop but
  breaks on mobile." Trigger even when the user says "responsive" or "small screen"
  without saying "mobile-first."
---

# Mobile-First Audit

You are auditing a web app the way a one-handed phone user actually experiences it,
not the way it looks on a 27-inch monitor. The person who requested this is a strong
desktop developer with a mobile blind spot: their users are primarily on phones, so
**the mobile experience is the product and desktop is secondary.** When mobile and
desktop needs conflict, optimize mobile and let desktop degrade gracefully — and say
so out loud.

Your job is not to be reassuring. It is to find what's wrong, rank it honestly, make
the call, and fix it. Pad nothing. If a pattern is bad on touch, say it's bad and
replace it.

## Core principle: render and look, don't just read code

Static code review misses the things that only appear once pixels hit a 375px screen:
a button row that bleeds off the edge, a CTA hidden under the home indicator, a tap
target that's 48px in CSS but overlaps its neighbor after wrapping. **Every finding in
your report must be grounded in the rendered view** — a screenshot, a measured bounding
box, or a probe result — not in your reading of the source alone.

This skill is the auditor and workflow. The rendering engine is the **webapp-testing**
skill (Anthropic's Playwright toolkit). If it's installed, use its `scripts/with_server.py`
to manage the dev server and write native Python Playwright scripts as it directs. If it
isn't installed, fall back to driving Playwright directly with the patterns below. Either
way, the discipline is the same.

## Workflow

Work this loop. Don't stop after diagnosis — the deliverable is improvement, not a list.

1. **Establish the target.** Identify the dev server URL (ask if unknown; check for a
   running server first). Identify the few highest-traffic views to audit — don't try to
   boil the ocean. Landing/home, the primary task flow, and any form are the usual three.
2. **Render at the phone matrix** (below), with touch emulation on. For each view and
   viewport: wait for `networkidle`, capture a full-page screenshot AND an above-the-fold
   screenshot, and run the probe script to collect measurements.
3. **Diagnose.** Walk the screenshots with your own eyes for the things scripts can't see
   (cramped layout, content under the notch, desktop modal centered in space, tiny text,
   a fixed bar covering the last list item). Cross-reference probe output for the things
   eyes can't measure precisely (exact target sizes, overflow, input font-size, meta tag).
4. **Rank ruthlessly** using the severity scale, and write the findings report.
5. **Fix the top issues**, making the opinionated mobile-first call each time. Edit the
   actual source files.
6. **Re-render and re-verify** the same views at the same viewports. Confirm each fix
   landed and introduced no regression at other breakpoints (especially desktop). Repeat
   until the blocking and high issues are gone.

## Phone viewport matrix

Test these. The smallest is the stress test — most layouts break there first. Emulate a
real phone: set the viewport, `device_scale_factor`, `is_mobile=True`, and `has_touch=True`
(or use a Playwright device descriptor). A desktop browser shrunk to 375px wide is NOT the
same as a phone — it lacks touch semantics and DPR.

| Device class             | Viewport (CSS px) | Why it's in the set                          |
| ------------------------ | ----------------- | -------------------------------------------- |
| Small Android / iPhone SE| 360 × 800         | Smallest common screen — the stress test     |
| Standard iPhone          | 390 × 844         | The modal-iPhone size; notch + home indicator|
| Large phone / Pro Max    | 430 × 932         | Reachability worst case (tall, one-handed)   |
| Tablet boundary (sanity) | 768 × 1024        | Confirm the mobile→desktop handoff isn't ugly |

Always include a desktop pass (e.g. 1440 × 900) on any view you changed, purely to confirm
you didn't break it. Desktop is a regression check here, not a design target.

## The phone-affordances checklist

Diagnose against these. For each, the *why* matters more than the rule — a thumb is a
blunt instrument attached to a person holding a phone in one hand on a moving bus.

### A. Layout & viewport (catch these first — they break everything downstream)
- **Horizontal overflow.** Nothing may be wider than the viewport. Accidental horizontal
  scroll is the #1 mobile defect. Usual culprits: unwrapped flex rows, fixed-width elements,
  `<pre>`/code blocks, wide tables, oversized images, `100vw` inside a padded container.
- **Viewport meta.** Require `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
  `viewport-fit=cover` is what makes `env(safe-area-inset-*)` work. Never `user-scalable=no`
  or `maximum-scale=1` — disabling zoom is an accessibility failure.
- **Safe areas.** On notched/Dynamic-Island/home-indicator phones, fixed top/bottom chrome
  and edge content must respect `env(safe-area-inset-*)`. A bottom action bar flush to the
  edge gets half-eaten by the home indicator; a header behind the notch loses its left items.
- **Single-column by default.** Multi-column desktop layouts must collapse to one column.
  Side-by-side cards at 360px are unreadable.

### B. Touch targets & ergonomics (this is the heart of touch UX)
- **Target size.** Interactive elements should render at **≥44×44 CSS px** (Apple HIG floor;
  Material prefers 48). Measure the *rendered* box, not the icon glyph. A 20px icon needs
  padding/hit-slop to reach 44.
- **Target spacing.** Even correctly-sized targets fail if crammed. Require **≥8px** between
  adjacent tappables. A row of icon buttons that's individually fine but packed tight produces
  constant mis-taps.
- **Thumb zone / reachability.** Map actions to where a thumb naturally falls. Primary,
  frequent, and destructive-confirm actions belong in the lower/center band; the top corners
  are the hardest reach one-handed. Prefer a **bottom tab bar over a top nav** for primary
  navigation. A "Save"/"Next"/"Buy" button stranded in the top-right is an ergonomic tax on
  every interaction.
- **Dense-text links.** Inline links inside paragraphs are tiny tap targets; ensure adequate
  size/spacing or they're a coin flip.

### C. Input & keyboards (forms are where mobile users rage-quit)
- **No iOS zoom-on-focus.** Inputs must have `font-size ≥16px`, or iOS Safari auto-zooms when
  the field is focused and the user has to pinch back out. This is jarring and constant.
- **Right keyboard for the field.** Use `type` / `inputmode` / `autocomplete` so the OS shows
  the correct keyboard: `type="email"`, `inputmode="numeric"`, `type="tel"`, `autocomplete="one-time-code"`,
  etc. Making someone hunt for "@" on an alpha keyboard is pure friction.
- **Submit reachable above the keyboard.** When the soft keyboard opens it covers the lower
  ~40% of the screen; confirm the active field and its submit affordance aren't hidden behind it.
- **Single-column forms, visible labels.** No placeholder-as-label (it vanishes on focus and
  fails accessibility). One field per row.

### D. Interaction & feedback (touch has no hover and no cursor)
- **No hover-only affordances.** Anything revealed *only* on `:hover` — tooltips, dropdown
  triggers, "reveal on hover" action buttons, hover-only menus — is invisible and unreachable
  on touch. Every hover affordance needs a tap-equivalent. This is the single most common way
  a desktop-built UI silently loses functionality on mobile.
- **Visible pressed state.** Touch users need immediate feedback that a tap registered
  (`:active` styling, a ripple, an opacity change). Without it the app feels broken and people
  double-tap.
- **No tap delay / dead taps.** A correct viewport meta removes the legacy 300ms delay. Avoid
  custom handlers that swallow taps. Don't hijack the browser's edge back-swipe.

### E. Navigation & chrome
- **Sticky/fixed bars earn their height.** A sticky header + sticky footer can eat 30% of a
  small viewport. Keep them slim, or let the header hide on scroll-down.
- **Fixed bars don't cover content.** Add bottom padding equal to a fixed footer's height so
  the last list item / form field isn't trapped under it.
- **Mobile-native overlays.** Replace centered desktop modals with full-screen views or
  bottom sheets; they're reachable and dismissable one-handed. Ensure a clear, large close/back.

### F. Legibility & content
- **Body text ≥16px**, generous line-height. Phones are read at arm's length in bad light.
- **Contrast** holds up in sunlight; don't rely on subtle hover-revealed cues.
- **Images sized for the device** (`srcset`/`sizes`), not a desktop-resolution asset shipped
  to a phone on cellular.

### G. Perceived speed (mobile networks are worse than your dev machine)
- **Above-the-fold first.** What renders in the first viewport on a phone should be the point
  of the page, not a hero that pushes everything below the scroll.
- **No layout shift** as content/images load — it causes mis-taps when a button jumps.

## Probe script (drop into `page.evaluate()`)

Run this in the rendered page at each mobile viewport to collect what the eye can't measure.
Treat it as a black box you can paste in; refine only if a specific check needs tuning. (You
can later extract this into `scripts/audit_probe.py` for reuse.)

```js
() => {
  const vw = document.documentElement.clientWidth;
  const out = { viewportWidth: vw, issues: [] };

  // 1. Horizontal overflow: any element wider than the viewport
  out.overflow = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 || r.right > vw + 1) {
      out.overflow.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString().slice(0, 40)) || '',
        width: Math.round(r.width), right: Math.round(r.right)
      });
    }
  });

  // 2. Undersized / crowded touch targets
  const SEL = 'a,button,input,select,textarea,[role=button],[onclick],[tabindex]';
  const boxes = [];
  out.smallTargets = [];
  document.querySelectorAll(SEL).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    boxes.push({ el, r });
    if (r.width < 44 || r.height < 44) {
      out.smallTargets.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 24),
        w: Math.round(r.width), h: Math.round(r.height)
      });
    }
  });

  // 3. Crowded targets: adjacent tappables closer than 8px
  out.crowded = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
      const overlapOneAxis = (dx === 0 || dy === 0);
      const gap = Math.max(dx, dy);
      if (overlapOneAxis && gap < 8 && gap >= 0) {
        out.crowded.push({
          a: boxes[i].el.tagName.toLowerCase(),
          b: boxes[j].el.tagName.toLowerCase(),
          gap: Math.round(gap)
        });
      }
    }
  }
  out.crowded = out.crowded.slice(0, 20); // cap noise

  // 4. iOS zoom-on-focus: inputs with effective font-size < 16px
  out.smallInputs = [];
  document.querySelectorAll('input,select,textarea').forEach(el => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) out.smallInputs.push({ tag: el.tagName.toLowerCase(), fontSize: fs });
  });

  // 5. Viewport meta sanity
  const mv = document.querySelector('meta[name=viewport]');
  out.viewportMeta = mv ? mv.getAttribute('content') : null;
  out.zoomDisabled = !!(out.viewportMeta &&
    /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(out.viewportMeta));
  out.viewportFitCover = !!(out.viewportMeta && /viewport-fit\s*=\s*cover/.test(out.viewportMeta));

  // 6. Body text size
  out.bodyFontSize = parseFloat(getComputedStyle(document.body).fontSize);

  // 7. Hover-only heuristic: count CSS rules that only act on :hover
  //    (a signal to inspect manually — not definitive)
  let hoverOnly = 0;
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    if (!rules) continue;
    for (const rule of rules) {
      if (rule.selectorText && /:hover/.test(rule.selectorText)) hoverOnly++;
    }
  }
  out.hoverRuleCount = hoverOnly;

  return out;
}
```

Use the probe for measurements; use the screenshots and your own judgment for everything
qualitative (does the layout actually *work* one-handed?). The `hoverRuleCount` is just a
flag to go read those rules and check whether any reveal content with no tap path.

## Findings report format

ALWAYS produce the report in this structure. Lead with the verdict and the blocking issues —
the reader is busy and mobile-blind, so be direct.

```
# Mobile audit: <view name>
**Verdict:** <one blunt sentence — is this good on a phone or not, and why>
**Tested:** <viewports> · <screenshot refs>

## Blocking — broken or unusable on a phone
- [B1] <what> — <where: file:line or selector + screenshot ref>
  Why it hurts: <concrete phone-user consequence>
  Fix: <the specific change you will make / made>
  Tradeoff: <desktop cost, if any — and why mobile wins anyway>

## High — works but actively bad on touch
- [H1] ...

## Medium — friction worth removing
- [M1] ...

## Low — polish
- [L1] ...

## Hard calls I made
<List the opinionated mobile-first decisions and what they cost desktop, stated plainly.
 e.g. "Moved primary nav to a bottom tab bar — desktop loses the familiar top nav, but
 mobile is primary and reachability matters more.">
```

Severity rubric:
- **Blocking** — a phone user cannot complete the task or sees broken layout (overflow,
  CTA off-screen, action hidden under keyboard/home-indicator, hover-only control with no
  tap path).
- **High** — completable but painful (sub-44px targets on a primary action, top-corner
  primary buttons, iOS zoom-on-focus, desktop modal stranded on mobile).
- **Medium** — noticeable friction (tight spacing, slim-but-present overflow, missing
  pressed states).
- **Low** — polish (legibility nudges, image sizing, micro-spacing).

## Operating stance

- **Mobile wins ties.** State the desktop tradeoff; make the mobile call anyway.
- **Be candid, not cruel.** Specific, direct, useful. No praise padding, no "looks great
  overall!" softeners. The most respectful thing you can do for a mobile-blind developer is
  tell them exactly what their users hit.
- **Show, don't assert.** Tie each claim to a screenshot or a measurement.
- **Finish the loop.** Re-render after fixing. A fix you didn't re-verify isn't done.
