/**
 * Chain time: the latest block's timestamp plus the local time elapsed since that block was fetched.
 * The device's wall clock is never read, so a wrong clock cannot change a countdown (01 V-10).
 *
 * @trace LLR-FE-012
 */
export class ChainClock {
  private base: { timestamp: bigint; fetchedAt: number } | null = null;
  private readonly monotonic: () => number;

  constructor(monotonic: () => number = () => performance.now()) {
    this.monotonic = monotonic;
  }

  /** The local reading to hand to `sync` when a block has just arrived, taken before anything else is awaited. */
  mark(): number {
    return this.monotonic();
  }

  /**
   * Called on every poll with the block just read and the `mark` taken when it arrived; the block replaces,
   * not adds to, the earlier base. Passing the arrival reading keeps the time another read took from being
   * counted as time since the block.
   */
  sync(blockTimestamp: bigint, fetchedAt: number = this.monotonic()): void {
    this.base = { timestamp: blockTimestamp, fetchedAt };
  }

  /** Null until the first block has been read. */
  now(): bigint | null {
    if (this.base === null) return null;
    const elapsedMs = Math.max(0, this.monotonic() - this.base.fetchedAt);
    return this.base.timestamp + BigInt(Math.floor(elapsedMs / 1000));
  }
}
