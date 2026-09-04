// Compatibility for historical commands; the active config is explicitly ESM for Vite's native loader.
module.exports = async () => (await import('./vitest.config.mts')).default
