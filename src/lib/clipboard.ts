/**
 * Copies text that may still be coming from the worker. Where ClipboardItem is
 * available the write starts synchronously inside the click (Safari requires
 * that) and resolves when the text arrives; otherwise falls back to writeText.
 */
export async function copyToClipboard(text: string | Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      const blob = Promise.resolve(text).then((t) => new Blob([t], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return;
    } catch {
      // Some browsers reject promised ClipboardItems; fall through.
    }
  }
  await navigator.clipboard.writeText(await text);
}
