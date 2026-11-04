/** The part of archiver 8 the fixtures use (the package ships no types) */
declare module 'archiver' {
  import type { Writable } from 'stream';
  export class ZipArchive {
    constructor(options?: Record<string, unknown>);
    pipe(dest: Writable): void;
    append(source: Buffer | string, data: { name: string }): this;
    finalize(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): this;
  }
}
