/**
 * Whether a file is there, without downloading it. HEAD first; some static
 * servers refuse HEAD, so a refused HEAD is retried as a one-byte GET.
 */
export async function fileExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return true;
    if (head.status !== 405 && head.status !== 501) return false;
    const get = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    return get.ok;
  } catch {
    return false;
  }
}
