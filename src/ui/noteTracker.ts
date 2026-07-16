import type { NoteBlock } from './Stage/geometry';

/**
 * Pure note-array bookkeeping for `App`, extracted so the pruning/closing
 * invariants have one home instead of being duplicated across inline event
 * handlers (which is how the original bug — an open note orphaning itself and
 * blocking every future prune — got in).
 *
 * Every function here mutates `notes` in place (`push` / `splice` / direct
 * field assignment) and never reassigns or copies it: `notes` is a stable
 * array held by `App` and shared by reference with `Stage` and `History`.
 */

/**
 * Applies an incoming note-on.
 *
 * A same-pitch retrigger without an intervening note-off means the earlier
 * note ended — close it first. Left open, it would read as `end === null`
 * (`Infinity` in the prune check below) and be orphaned forever.
 */
export function applyNoteOn(
  notes: NoteBlock[],
  note: number,
  t: number,
  historyMs: number,
  maxNotes: number,
): void {
  const stillOpen = notes.find((n) => n.note === note && n.end === null);
  if (stillOpen) stillOpen.end = t;

  notes.push({ note, start: t, end: null });
  pruneNotes(notes, t - historyMs, maxNotes);
}

/**
 * Applies an incoming note-off: closes the OLDEST open note of this pitch
 * (`find`, not `findLast`). That is how MIDI note-off is normally
 * interpreted, and — together with `applyNoteOn` closing a same-pitch
 * retrigger — it prevents an earlier note from ever being orphaned by a
 * later one of the same pitch.
 */
export function applyNoteOff(notes: NoteBlock[], note: number, t: number): void {
  const open = notes.find((n) => n.note === note && n.end === null);
  if (open) open.end = t;
}

/**
 * Closes every still-open note. Called when the connection can no longer be
 * trusted to deliver a matching note-off for whatever is currently
 * sounding — e.g. the cable was unplugged mid-note (FR-17).
 */
export function closeAllOpenNotes(notes: NoteBlock[], t: number): void {
  for (const n of notes) {
    if (n.end === null) n.end = t;
  }
}

/**
 * Removes every closed note older than `cutoff`, then enforces `maxNotes` as
 * a hard cap.
 *
 * Walks the whole array rather than shifting only from the front. A single
 * still-open note — whether a genuine long sustain or (formerly) an
 * orphan — sits at index 0 for as long as it remains open, since notes are
 * pushed in start-time order. A front-only shift loop stops at the very
 * first entry that fails the cutoff check and never reaches the closed,
 * aged-out notes behind it, so pruning would stall for as long as that one
 * note stays open. Splicing out of a backward pass removes every qualifying
 * entry regardless of position, without shifting indices out from under the
 * scan in progress.
 */
function pruneNotes(notes: NoteBlock[], cutoff: number, maxNotes: number): void {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.end !== null && n.end < cutoff) notes.splice(i, 1);
  }
  // Backstop, should never trigger: bounds per-frame draw/sort cost even if
  // some future path leaves more notes outstanding than expected.
  while (notes.length > maxNotes) notes.shift();
}
