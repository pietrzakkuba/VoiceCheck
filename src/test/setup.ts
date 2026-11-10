// Tests assert Polish UI copy; pin the detected browser language to Polish.
const nav = globalThis.navigator as Navigator | undefined;
if (nav) {
  Object.defineProperty(nav, 'language', { value: 'pl-PL', configurable: true });
  Object.defineProperty(nav, 'languages', { value: ['pl-PL', 'pl'], configurable: true });
}
