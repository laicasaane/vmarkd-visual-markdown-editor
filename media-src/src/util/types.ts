declare module '*.scss'
declare module '*.css'
declare module '*.less'
declare module '*.png'
declare module '*.jpg'
declare module '*.svg'

// Vendored plain-JS/mjs bundles imported directly by their esbuild entry points (elk-entry.ts,
// mermaid-elk-entry.ts) — no .d.ts ships with them, and they're not run through allowJs/checkJs.
// Scoped by filename suffix (task 503) rather than a blanket `*.js`, so an accidental typo'd
// import into vendor/ still surfaces as a real "module not found" error.
declare module '*/vendor/elk/elk-api.js'
declare module '*/vendor/elk/elk-worker.min.js'
declare module '*/vendor/mermaid-layout-elk/mermaid-layout-elk.core.mjs'

// `jsdom` ships no types of its own, and `@types/jsdom` (latest 28.x) trails our jsdom@29 by a
// major version — installing it risks the exact silent-mismatch class of bug task 503 is about.
// Only `native-offscreen.test.ts` imports jsdom, and only for `new JSDOM(html).window.document`,
// so this declares just that surface rather than the package's full API.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string)
    window: { document: Document }
  }
}
