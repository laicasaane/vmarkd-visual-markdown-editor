/**
 * Task 469 item 5d — module-structure check (circular imports + unresolvable imports).
 *
 * Rules are inlined (not `extends: 'dependency-cruiser/configs/recommended'`) because that
 * preset's subpath isn't exposed through the package's `exports` map in this version — Node
 * refuses the require. The two rules below are copied from that preset's `no-circular` /
 * `not-to-unresolvable` (see node_modules/dependency-cruiser/configs/rules/*.cjs).
 *
 * Deliberately narrower than the full "recommended" preset: `no-orphans` is left out because
 * knip (item 5b) already owns "is this file used" — running both would just double-report the
 * same finding two different ways. Circular imports and broken resolution are the signal this
 * tool adds that knip/Biome don't cover.
 *
 * Run separately per compilation unit (see package.json `depcruise:*` scripts) — src/ and
 * media-src/src/ have separate tsconfigs and module systems (CommonJS host vs ESM/browser
 * webview, see DEVELOPMENT.md "Layout").
 *
 * Task 460's phase-4 boundary meta-test will declare the actual layering rules (which module
 * may import which) once the physical decomposition lands — extend `forbidden` here instead of
 * writing a separate hand-rolled test, per task 469 item 5d ("coordinate so the two are not
 * built twice").
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'This dependency is part of a circular relationship. You might want to revise ' +
        'your solution (i.e. use dependency inversion, make sure the modules have a ' +
        'single responsibility).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment:
        "This module depends on a module that cannot be found ('resolved to disk'). " +
        "If it's an npm module: add it to your package.json. In all other cases you " +
        'likely already know what to do.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: {
      // vendor/ is checked-in third-party bundles (ADR-0005) with their own internal require
      // graph that plain Node-style resolution can't always follow (e.g. a vendored .mjs chunk
      // requiring a bare 'elkjs/...' specifier that only resolves inside esbuild's bundler) —
      // stop at the boundary instead of reporting their internals as broken.
      path: 'node_modules|(^|/)vendor/',
      dependencyTypes: [
        'npm',
        'npm-dev',
        'npm-optional',
        'npm-peer',
        'npm-bundled',
        'npm-no-pkg',
      ],
    },
    exclude: {
      path: [
        'node_modules',
        'media-src/node_modules',
        '(^|/)media/',
        '(^|/)out/',
        '(^|/)tmp/',
        '(^|/)\\.worktrees/',
        '\\.test\\.ts$',
      ],
    },
  },
}
