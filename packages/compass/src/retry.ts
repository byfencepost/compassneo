/**
 * Trying again. Compass sits behind Cloudflare and answers a sign-in with the odd 5xx, an empty session or a page
 * where JSON should be; most of those are gone a second later. retrying runs fn until it succeeds, it fails in a way
 * that is not worth repeating (a wrong password: repeating that only locks the account), or the tries run out. The
 * waits double from backoffMs, with jitter so many sign-ins that failed together do not come back together.
 */
export async function retrying<T>(
  fn: (attempt: number) => Promise<T>,
  transient: (e: unknown) => boolean,
  { tries = 3, backoffMs = 600 }: { tries?: number; backoffMs?: number } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= tries || !transient(e)) throw e;
      const wait = backoffMs * 2 ** (attempt - 1);
      await new Promise(resolve => setTimeout(resolve, wait / 2 + Math.random() * wait));
    }
  }
}
