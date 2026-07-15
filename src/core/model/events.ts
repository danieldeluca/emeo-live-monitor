export type EmeoEvent =
  | { kind: 'note-on'; note: number; velocity: number; t: number }
  | { kind: 'note-off'; note: number; t: number }
  | { kind: 'breath'; value: number; t: number }
  | { kind: 'raw'; data: Uint8Array; t: number };
