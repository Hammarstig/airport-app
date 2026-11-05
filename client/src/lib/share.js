/**
 * Delar via Web Share API (Android/iOS-delningsmenyn). Fallback: kopierar länken.
 * Returnerar 'shared', 'copied' eller 'cancelled'.
 */
export async function share({ title, text, url, files }) {
  const abs = url ? new URL(url, window.location.origin).href : window.location.href;
  const data = { title, text, url: abs };
  if (files?.length && navigator.canShare?.({ files })) data.files = files;
  if (navigator.share) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      // Annat fel (t.ex. ej tillåtet utan användargest): fall tillbaka på kopiering.
    }
  }
  const line = [text, abs].filter(Boolean).join(' ');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(line);
    return 'copied';
  }
  window.prompt('Kopiera länken:', line);
  return 'copied';
}
