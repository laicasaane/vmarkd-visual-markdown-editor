# 397 — SMILES molecule render is too large, scale down

**Status: 📋 TODO.**

## Report

> "smiles zrob ogolnie mniejsze tak 4/3 ztego co teraz" — the SMILES (chemistry) diagram renders
> too large overall; wants it scaled down to roughly 3/4 of the current size.

## Not done

No measurement yet of the current render size / where it's set (SMILES.js canvas dimensions or a
CSS max-width, `smiles-render.ts`). Needs the current pixel dimensions on a representative fixture
before picking a concrete scale factor, and a check against `diagram-fill-width.md`'s existing
sizing contract (SMILES is listed there as one of the natural-size, shrink-only renderers) so a
fix doesn't fight that.
