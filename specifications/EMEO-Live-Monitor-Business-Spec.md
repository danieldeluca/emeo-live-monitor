# EMEO Live Monitor — Business / Functional Specification

**Product working title:** EMEO Live Monitor
**Version:** 1.0 (functional spec for v1 prototype)
**Author:** Prepared for Daniel
**Date:** 15 July 2026
**Status:** Draft for development

---

## 1. Purpose

The EMEO Live Monitor is a web application that connects to an **EMEO digital saxophone** and displays, in real time, **what the player is playing** (the notes/fingerings) and **how they are blowing** (the breath curve). It is the first building block of a larger set of EMEO practice tools, and it exists to prove the connection works, to make the instrument's live data visible and satisfying to watch, and to provide the foundation that later tools (trainers, coaches, analytics) will reuse.

This document describes **what** the product must do and **why**, in business/functional terms. It deliberately does not prescribe the technology, code structure, or libraries — those decisions are left to the development stage.

---

## 2. Background & context

The EMEO is a silent, digital practice saxophone. When played, it does not produce acoustic sound; instead it transmits **MIDI** (a standard musical-instrument data protocol) to a connected computer, either over a USB cable or over Bluetooth. That MIDI stream contains two kinds of information that this app cares about:

- **Notes** — which pitch the player is fingering, when a note starts, and when it stops.
- **Breath** — a continuously changing value representing how hard the player is blowing (air pressure). This is the expressive heart of a wind instrument and is the data point most ordinary music software ignores.

Because the app reads a standard MIDI stream directly in the browser, no installation is required for the end user beyond opening a web page in a compatible browser and granting access to the instrument.

---

## 3. Goals and non-goals

### 3.1 Goals

1. Confirm and display a live connection to the EMEO from a web browser.
2. Show the **current note(s)** being played, clearly and immediately.
3. Show the **breath intensity** both as a live level and as a **scrolling curve over time**.
4. Make the experience feel responsive and pleasant — low perceived latency, smooth motion.
5. Serve as a reusable foundation and reference for future EMEO tools.

### 3.2 Non-goals (explicitly out of scope for v1)

- No sound generation / no synthesizer. (The app visualizes; it does not make audio.)
- No lessons, scoring, or gamification.
- No user accounts, login, or cloud storage.
- No changing of EMEO device settings or firmware. (That is handled by EMEO's own configuration page.)
- No mobile-first design requirement (desktop browser is the primary target).

---

## 4. Target users & primary use cases

**Primary user:** An EMEO owner (hobbyist or professional saxophonist) who is comfortable opening a web page and connecting their instrument.

**Secondary user:** The developer/product owner (you), who will use the app as a diagnostic and as a foundation for further tools.

**Primary use cases:**

1. *"Is my EMEO working and what is it sending?"* — The user opens the app, connects, plays a few notes, and immediately sees the notes and breath responding. This validates the instrument and the connection.
2. *"Watch my breath."* — The user plays and observes the breath curve to become aware of their air control, dynamics, and phrasing over time.
3. *"What data does the EMEO actually send?"* — The user (or developer) inspects the raw incoming signals to understand and confirm how the instrument behaves (e.g., which control carries breath).

---

## 5. Key features

### 5.1 Connection management
The app lets the user connect to and disconnect from the EMEO, and clearly communicates the current connection state at all times (e.g., *Not connected*, *Connecting*, *Connected to EMEO*, *Connection lost*). If more than one compatible instrument is available, the user can choose which one to use. If the browser or environment cannot support the connection, the app explains this in plain language rather than failing silently.

### 5.2 Live note display
The app shows, in real time, the note or notes currently being played, including:

- The **note name** (e.g., "A♯4" / with an option to show European solfège names such as "La♯").
- A **visual representation** of pitch — at minimum a highlighted key on an on-screen keyboard/piano strip, and/or the note's position on a musical staff.
- **Clear on/off behavior** — a note appears the instant it starts and disappears (or visibly releases) the instant it stops.
- A rolling display of the **most recent notes played** (a short history), so the user can see the last several notes at a glance.

### 5.3 Breath visualization
The breath signal is the centerpiece. The app shows it two ways:

- **Live level** — an immediate indicator (e.g., a vertical meter or bar) of how hard the player is currently blowing, from silent to maximum.
- **Scrolling curve** — a continuously scrolling graph plotting breath intensity against time (like a heart-rate monitor), so the user sees the shape of their phrases: attacks, swells, steadiness, and releases.

The breath display must feel live and fluid, updating many times per second, and must clearly show the full range from "no air" to "maximum air."

### 5.4 Combined timeline (desirable)
Ideally, notes and breath share a common time axis so the user can see *which breath shape produced which note*. For example, note events could be marked along the same scrolling timeline as the breath curve.

### 5.5 Raw signal monitor (diagnostic)
A panel that lists the incoming MIDI messages in human-readable form (e.g., "Note On A♯4", "Breath 87", "Note Off A♯4"), with the most recent at the top. This serves two purposes: it reassures the user that data is flowing, and it lets the developer confirm exactly how the EMEO encodes its data — in particular, **which control channel carries the breath value**, since this should be auto-detected or easily identifiable rather than hard-coded on blind faith.

### 5.6 Basic session controls
Simple controls to **pause/resume** the live display and to **clear** the current view (reset the breath curve and note history). This helps the user focus on a fresh phrase without visual clutter.

---

## 6. User stories

1. As an EMEO owner, I want to connect my instrument to the app in one or two clicks so that I can start seeing my playing right away.
2. As a player, I want to see the exact note I'm fingering so that I can confirm I'm playing what I intend.
3. As a player, I want to watch my breath as a moving curve so that I can become aware of my air control and phrasing.
4. As a player, I want the note and breath displays to react instantly so that the app feels connected to my playing rather than laggy.
5. As a player, I want note names optionally shown in European (solfège) notation so that they match how I read music.
6. As a developer, I want to see the raw incoming signals so that I can verify how the EMEO transmits notes and breath and build future tools on solid assumptions.
7. As a user, I want clear feedback when the instrument disconnects or can't be found so that I know whether the problem is the app, the browser, or the instrument.
8. As a user, I want to pause and clear the display so that I can study one phrase at a time.

---

## 7. Functional requirements

Each requirement is written so it can be verified as done or not done.

**Connection**
- FR-1 The app shall provide a clearly labeled control to initiate a connection to the EMEO.
- FR-2 The app shall display the current connection state at all times.
- FR-3 The app shall allow the user to disconnect and reconnect without reloading the page.
- FR-4 If multiple compatible instruments are present, the app shall let the user choose which one to use.
- FR-5 If the environment does not support the connection, the app shall show a plain-language explanation and, where relevant, guidance (e.g., which browsers are supported).

**Notes**
- FR-6 The app shall display the currently sounding note(s) within a perceptually immediate delay of the note being played.
- FR-7 The app shall show each note's name, with a toggle between standard (C, D, E…) and European solfège (Do, Ré, Mi…) naming.
- FR-8 The app shall visually indicate note start and note end distinctly.
- FR-9 The app shall show a short rolling history of recently played notes.

**Breath**
- FR-10 The app shall display a live breath-intensity level spanning the instrument's full range (minimum to maximum).
- FR-11 The app shall display a scrolling breath curve over time that updates fluidly.
- FR-12 The breath displays shall clearly distinguish "no air" from "some air" from "maximum air."

**Diagnostics & controls**
- FR-13 The app shall provide a readable log of incoming messages, newest first.
- FR-14 The app shall identify (ideally auto-detect) which incoming control represents breath.
- FR-15 The app shall provide controls to pause/resume and to clear the live display.

**Quality of experience**
- FR-16 The app shall remain responsive and smooth during continuous, rapid playing.
- FR-17 The app shall handle an instrument disconnect gracefully, informing the user and allowing reconnection.

---

## 8. Screens & layout (functional description)

The v1 app is a **single screen** with the following regions. Exact placement and styling are left to design/development; this describes *what must be present*.

- **Header / status bar:** app name, connection state, and the Connect/Disconnect control. Includes the notation toggle (standard vs solfège) and pause/clear controls.
- **Now-playing panel:** the large, prominent display of the current note(s) — note name plus a keyboard/staff visualization.
- **Breath panel:** the live breath level indicator alongside the scrolling breath curve. This is the visual focal point of the app.
- **Recent notes strip:** a compact rolling list or lane of the last several notes.
- **Raw monitor panel:** a collapsible/secondary panel listing incoming messages in readable form. Can be hidden by default so it doesn't distract casual users.

---

## 9. Primary user flow

1. User opens the web page. The app shows *Not connected* and a Connect control, plus a one-line hint about how to connect the EMEO.
2. User connects the EMEO (cable or Bluetooth) and clicks Connect; if prompted, selects the EMEO from a list.
3. The app shows *Connected*. The user plays.
4. Notes light up in the now-playing panel and appear in the recent-notes strip; the breath level moves and the breath curve scrolls.
5. The user optionally toggles solfège naming, pauses to study a phrase, or clears the view to start fresh.
6. The user optionally opens the raw monitor to inspect the underlying data.
7. On finishing, the user disconnects (or simply closes the page).

---

## 10. Acceptance criteria (definition of done for v1)

The v1 prototype is considered complete when:

- A user can connect an EMEO and see a clear *Connected* state.
- Playing a note immediately shows the correct note name and visual, and releasing it clears/releases it.
- Blowing changes the live breath level and produces a smooth scrolling breath curve reflecting the shape of the air.
- Notation can be switched between standard and solfège.
- The raw monitor shows readable incoming messages and the breath control is correctly identified.
- Pause and clear work as described.
- Disconnecting the instrument shows a clear message and reconnection works.
- The experience feels responsive during fast, continuous playing.

---

## 11. Assumptions & dependencies

- The EMEO transmits standard MIDI containing note on/off events and a continuous breath control value.
- The end user has a compatible, up-to-date desktop browser and can grant the app access to the instrument.
- The instrument is charged/powered and connected before or during the session (per EMEO's own connection behavior, a cabled connection is the most reliable).
- The app runs entirely on the user's machine/browser; no server-side processing or data storage is required for v1.
- Exact details of the EMEO's data encoding (e.g., which control number carries breath, whether bite/expression data is present) should be confirmed via the raw monitor during development rather than assumed.

---

## 12. Future roadmap (context, not v1 scope)

This monitor is the foundation for later EMEO tools, each of which will reuse its connection and data layer:

- **Breath-control / phrasing coach** — target breath shapes, feedback on steadiness and dynamics.
- **Sight-reading trainer** — scrolling notation the player performs, with accuracy/timing scoring.
- **Fingering/note coach** — guidance for players learning sax fingerings.
- **Practice analytics** — automatic logging of what was practiced and progress over time.
- **Session recording & export** — capture and replay/export a session (e.g., for analysis or transcription).
- **Custom sound engine** — turn breath + notes into audio.

Designing v1's connection and data handling cleanly (as a reusable core) will make these follow-ons much easier.

---

## 13. Glossary

- **EMEO** — the digital, silent practice saxophone this app connects to.
- **MIDI** — the standard protocol musical instruments use to send performance data (notes, controls) to computers.
- **Note on / note off** — the signals marking the start and end of a played note.
- **Breath control value** — a continuously updating number representing how hard the player is blowing.
- **Solfège** — European note naming (Do, Ré, Mi, Fa, Sol, La, Si) as opposed to the letter system (C, D, E, F, G, A, B).
- **Scrolling curve** — a graph that moves over time, showing recent history like a monitor readout.
