export class ScanCoordinator<TInput, TResult> {
  private activePromise: Promise<TResult> | null = null;
  private activeRequestId: string | null = null;

  get active() {
    return Boolean(this.activePromise);
  }

  get requestId() {
    return this.activeRequestId;
  }

  run(input: TInput, execute: (input: TInput, requestId: string) => Promise<TResult>) {
    if (this.activePromise) return this.activePromise;
    const requestId = crypto.randomUUID();
    this.activeRequestId = requestId;
    this.activePromise = execute(input, requestId).finally(() => {
      this.activePromise = null;
      this.activeRequestId = null;
    });
    return this.activePromise;
  }
}
