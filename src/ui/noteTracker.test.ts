import type { NoteBlock } from './Stage/geometry';
import { applyNoteOff, applyNoteOn, closeAllOpenNotes } from './noteTracker';

const HISTORY_MS = 60_000;
const MAX_NOTES = 2000;

describe('applyNoteOn', () => {
  it('F1a: closes the earlier same-pitch note on a retrigger without an intervening note-off', () => {
    const notes: NoteBlock[] = [];
    applyNoteOn(notes, 60, 1000, HISTORY_MS, MAX_NOTES);
    applyNoteOn(notes, 60, 2000, HISTORY_MS, MAX_NOTES);

    expect(notes).toEqual([
      { note: 60, start: 1000, end: 2000 },
      { note: 60, start: 2000, end: null },
    ]);
  });

  it('does not touch an open note of a different pitch', () => {
    const notes: NoteBlock[] = [];
    applyNoteOn(notes, 60, 1000, HISTORY_MS, MAX_NOTES);
    applyNoteOn(notes, 62, 2000, HISTORY_MS, MAX_NOTES);

    expect(notes).toEqual([
      { note: 60, start: 1000, end: null },
      { note: 62, start: 2000, end: null },
    ]);
  });

  it('F1d: prunes closed notes that sit behind a long-sustained open note at index 0', () => {
    // Constructed directly: a note that opened first and is still sounding
    // sits at index 0 for as long as it stays open (notes are pushed in
    // start-time order). Two shorter notes behind it started later but
    // already closed, long enough ago to qualify for pruning. Before the
    // fix, the cutoff loop only ever inspected notes[0]; since that entry's
    // `end` is `null` (read as `Infinity`), the loop stopped immediately and
    // the closed notes behind it were never reached.
    const notes: NoteBlock[] = [
      { note: 40, start: 0, end: null },
      { note: 41, start: 100, end: 200 },
      { note: 42, start: 300, end: 400 },
    ];

    const t = HISTORY_MS + 1000;
    applyNoteOn(notes, 43, t, HISTORY_MS, MAX_NOTES);

    expect(notes.some((n) => n.note === 41)).toBe(false);
    expect(notes.some((n) => n.note === 42)).toBe(false);
    // The long-sustained note is still open and must not be pruned: it isn't
    // "old", it's still sounding.
    expect(notes.find((n) => n.note === 40)).toEqual({ note: 40, start: 0, end: null });
    expect(notes.find((n) => n.note === 43)).toEqual({ note: 43, start: t, end: null });
  });

  it('keeps a closed note that has not yet aged past the cutoff', () => {
    const notes: NoteBlock[] = [{ note: 41, start: 100, end: 200 }];
    applyNoteOn(notes, 43, HISTORY_MS - 1, HISTORY_MS, MAX_NOTES);
    expect(notes.some((n) => n.note === 41)).toBe(true);
  });

  it('caps the array at MAX_NOTES as a backstop even when every note is open', () => {
    const notes: NoteBlock[] = [];
    // Every note here is a different pitch, so none close each other, and
    // all are recent enough that the cutoff-based prune above never removes
    // any of them — only the hard cap can bound the array in this scenario.
    for (let i = 0; i < MAX_NOTES + 5; i++) {
      applyNoteOn(notes, i % 128, i, HISTORY_MS, MAX_NOTES);
    }
    expect(notes.length).toBe(MAX_NOTES);
    // The cap trims from the front (oldest by start time) first.
    expect(notes[0].start).toBe(5);
  });
});

describe('applyNoteOff', () => {
  it('F1b: closes the oldest open note of a pitch, not the newest', () => {
    // Constructed directly: with applyNoteOn's retrigger handling in place,
    // two open notes of the same pitch can no longer arise through the
    // normal event stream, but note-off must still pick correctly if two
    // ever do coexist.
    const notes: NoteBlock[] = [
      { note: 60, start: 1000, end: null },
      { note: 60, start: 2000, end: null },
    ];
    applyNoteOff(notes, 60, 3000);

    expect(notes[0]).toEqual({ note: 60, start: 1000, end: 3000 });
    expect(notes[1]).toEqual({ note: 60, start: 2000, end: null });
  });

  it('ignores a pitch with no open note', () => {
    const notes: NoteBlock[] = [{ note: 60, start: 1000, end: 1500 }];
    applyNoteOff(notes, 60, 3000);
    expect(notes).toEqual([{ note: 60, start: 1000, end: 1500 }]);
  });
});

describe('closeAllOpenNotes', () => {
  it('F1c: closes every open note, leaving already-closed notes untouched', () => {
    const notes: NoteBlock[] = [
      { note: 60, start: 1000, end: 1500 },
      { note: 62, start: 2000, end: null },
      { note: 64, start: 2500, end: null },
    ];
    closeAllOpenNotes(notes, 9999);

    expect(notes).toEqual([
      { note: 60, start: 1000, end: 1500 },
      { note: 62, start: 2000, end: 9999 },
      { note: 64, start: 2500, end: 9999 },
    ]);
  });

  it('does nothing when there are no open notes', () => {
    const notes: NoteBlock[] = [{ note: 60, start: 0, end: 10 }];
    closeAllOpenNotes(notes, 9999);
    expect(notes).toEqual([{ note: 60, start: 0, end: 10 }]);
  });
});
