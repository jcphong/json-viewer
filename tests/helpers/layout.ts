/** jsdom has no layout; the virtualizer reads clientHeight for the viewport and offsetHeight for items. */
export function stubLayout() {
  for (const [prop, value] of [
    ["clientHeight", 600],
    ["clientWidth", 800],
    ["offsetHeight", 120],
    ["offsetWidth", 800],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value });
  }
}
