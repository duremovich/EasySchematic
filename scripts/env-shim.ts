// Shim Vite's import.meta.env for Node.js headless scripts
// Must be imported before any Vite-dependent modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(import.meta as any).env = {};
