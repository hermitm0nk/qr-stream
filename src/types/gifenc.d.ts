// Type declarations for gifenc@1 library
declare module 'gifenc' {
  export interface GIFEncoderOptions {
    initialCapacity?: number;
    auto?: boolean;
  }

  export interface GIFWriteOptions {
    /** Array of [R, G, B] or [R, G, B, A] color tuples */
    palette?: number[][];
    /** Delay in milliseconds (will be rounded to nearest 10ms) */
    delay?: number;
    /** Repeat count: 0 = loop forever, -1 = no repeat, >0 = loop count */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    colorDepth?: number;
    dispose?: number;
    /** Explicitly mark this as the first frame (for manual mode) */
    first?: boolean;
  }

  export interface GIFEncoderInstance {
    /**
     * Write a single frame of indexed pixel data.
     * @param index Uint8Array where each byte is a palette index (0-255)
     * @param width Frame width in pixels
     * @param height Frame height in pixels
     * @param opts Frame options
     */
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: GIFWriteOptions
    ): void;
    /** Finalise the GIF and return the complete bytes */
    bytes(): Uint8Array;
    /** Write the GIF trailer byte */
    finish(): void;
    /** Reset encoder state */
    reset(): void;
    /** View into the internal buffer */
    bytesView(): Uint8Array;
    /** The internal ArrayBuffer */
    readonly buffer: ArrayBuffer;
    /** The underlying byte stream */
    readonly stream: any;
    /** Write the GIF89a header manually */
    writeHeader(): void;
  }

  /** Create a new GIF encoder instance */
  export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance;
}
