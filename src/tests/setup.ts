// Mock ImageData for Vitest/happy-dom which doesn't support it
// This is a minimal implementation sufficient for tests

import { expect } from 'vitest';

class MockImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: 'srgb';

  constructor(
    data: Uint8ClampedArray | number,
    width: number,
    height?: number,
  ) {
    if (typeof data === 'number') {
      // new ImageData(width, height)
      this.width = data;
      this.height = width as number;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = data;
      this.width = width;
      this.height = height ?? data.byteLength / (width * 4);
    }
    this.colorSpace = 'srgb';
  }
}

// @ts-expect-error - Global mock
globalThis.ImageData = MockImageData;
