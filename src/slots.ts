/** Bound model requests while reserving capacity for current conversation. */
export class ReviewSlots {
  private active = 0;
  private memoryActive = 0;
  private waiting: Array<{memory: boolean; start: () => void}> = [];
  constructor(private readonly limit: () => number) {}
  acquire(memory: boolean, signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(Error('Review cancelled'));
    return new Promise((resolve, reject) => {
      const entry = {memory, start: () => {
        signal.removeEventListener('abort', abort);
        this.active++; if (memory) this.memoryActive++;
        let released = false;
        resolve(() => {
          if (released) return; released = true;
          this.active--; if (memory) this.memoryActive--; this.pump();
        });
      }};
      const abort = () => {
        this.waiting = this.waiting.filter(row => row !== entry);
        reject(Error('Review cancelled')); this.pump();
      };
      signal.addEventListener('abort', abort, {once: true});
      this.waiting.push(entry); this.pump();
      // A live request may use the reserved slot even when the memory backlog is full.
      if (this.waiting.length > 64) {
        this.waiting = this.waiting.filter(row => row !== entry);
        signal.removeEventListener('abort', abort);
        reject(Error('Review queue full'));
      }
    });
  }
  private pump(): void {
    while (this.active < this.limit() && this.waiting.length) {
      let index = this.waiting.findIndex(row => !row.memory);
      if (index < 0) {
        if (this.memoryActive >= Math.max(1, this.limit() - 1)) return;
        index = 0;
      }
      this.waiting.splice(index, 1)[0].start();
    }
  }
}
