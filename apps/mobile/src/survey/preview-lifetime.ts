/** One-shot bounded consumer; owner closes after removing the viewer. */
export function createPreviewLifetime() {
 let stopped = false, started = false;
 let finish: (() => void) | undefined;
 return {
  get stopped() { return stopped; },
  async hold(uri: string, show: (uri: string) => void): Promise<void> {
   if (stopped || started) throw new Error('Anteprima non disponibile');
   started = true;
   await new Promise<void>((resolve, reject) => {
    finish = resolve;
    try { show(uri); } catch (error) { finish = undefined; reject(error); }
   });
  },
  close() { stopped = true; const release = finish; finish = undefined; release?.(); },
 };
}
