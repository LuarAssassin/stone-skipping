const ASSET_TIMEOUT_MS = 10_000;

/** Keep procedural fallbacks usable when a model or texture cannot finish loading. */
export async function loadOptionalAsset<T>(load: Promise<T>): Promise<T | undefined> {
    let timer: number | undefined;
    const timeout = new Promise<undefined>(resolve => {
        timer = window.setTimeout(resolve, ASSET_TIMEOUT_MS);
    });
    try {
        return await Promise.race([load, timeout]);
    } catch {
        return undefined;
    } finally {
        window.clearTimeout(timer);
    }
}
