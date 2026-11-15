declare module 'postject' {
  export interface InjectOptions {
    sentinelFuse?: string;
    machoSegmentName?: string;
    overwrite?: boolean;
  }
  export function inject(filename: string, resourceName: string, resourceData: Uint8Array, options?: InjectOptions): Promise<void>;
}
