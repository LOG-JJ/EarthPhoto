declare module 'heic-decode' {
  interface HeicDecodeResult {
    width: number;
    height: number;
    data: Uint8Array;
  }

  interface HeicDecodeOptions {
    buffer: Buffer | Uint8Array;
  }

  export default function heicDecode(options: HeicDecodeOptions): Promise<HeicDecodeResult>;
}
