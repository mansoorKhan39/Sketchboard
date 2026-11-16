# Sketchboard — UI/UX Design Document

Nov 14, 2026 · @Mansoor

## 1. Design goals and principles

This document shows what Sketchboard looks like and how it behaves: the screens, how people move between them, and the visual rules the code will follow. The wireframes here are plain layouts, not final artwork; the final look is built in code with Tailwind CSS.

### 1.1 Principles

| Principle | What it means on screen | From SRS |
| --- | --- | --- |
| Canvas first | The board takes almost the whole window; tools are small and stay at the edges | NFR-12 |
| Familiar tools | Toolbar on the left, share button top right, zoom bottom right, and single-key shortcuts, as people expect from whiteboard apps | NFR-13 |
| Instant feedback | Every action shows at once; the connection and save state are always visible | FR-R6, NFR-1 |
| Others are visible | Live cursors with names, and avatars of who is on the board | FR-R2, FR-R3 |
| Keyboard and clarity | Everything important works with the keyboard; text is readable | NFR-18 |

### 1.2 The original-design rule

Sketchboard shares the general layout pattern of online whiteboards, but its name, logo, icons, colours, wording and illustrations are its own (SRS section 8.2). No Miro screenshot is traced or copied; only the common idea of a left toolbar and an infinite canvas is reused.

## 2. Screen map and user flow

&#91;embedded content: screen map and user flow · 8 screens\]

A new visitor lands on the landing page and signs up or logs in, then reaches the dashboard and opens a board. A guest skips all that: the share link goes straight to the board, or to a friendly error page if the link is off or wrong. The share dialog is not a separate page; it opens on top of the board.

| Screen | Path | Who | Use cases |
| --- | --- | --- | --- |
| Landing page | `/` | Anyone | UC-01 |
| Sign up | `/signup` | Guest | UC-01 |
| Log in | `/login` | Guest | UC-01 |
| Dashboard | `/boards` | Logged in | UC-02, UC-07 |
| Board | `/board/:id` | Owner, editor, viewer | UC-03, UC-04 |
| Share dialog | on the board | Owner | UC-05 |
| Share link page | `/s/:token` | Anyone with the link | UC-06 |
| Link not available | shown at `/s/:token` | Anyone | UC-06 A1 |

## 3. Dashboard

&#91;embedded content: dashboard wireframe · 6 board cards\]

The dashboard lists the user's boards, newest edit first (FR-B2). The board names, times and the avatar letter in the wireframe are sample content.

| Part | Behaviour |
| --- | --- |
| Top bar | Logo on the left; the avatar on the right opens a menu with the profile (display name and cursor colour, FR-A4) and Log out |
| New board button | Creates a board and opens it at once (UC-02) |
| Board card | A small preview of the board, the name and the last edit time; click to open; a menu on the card has Rename and Delete |
| Rename | The name becomes editable on the card; Enter saves, Escape cancels |
| Delete | A confirmation dialog names the board and says it cannot be undone (FR-B3) |

| State | What the user sees |
| --- | --- |
| Loading | Grey placeholder cards in the same grid, so the page does not jump |
| Empty | A friendly message, "No boards yet", with the New board button in the middle |
| Error | A short message and a Retry button; no data is changed (UC-07 A1) |

The grid shows 3 cards per row on a wide window, 2 on a medium one and 1 on a phone.

## 4. Board screen

&#91;embedded content: board screen wireframe · 5 regions\]

The wireframe shows a sticky note selected, with its colour picker above it, a connector to a shape, a pen stroke, and the live cursor of another user (Aisha). The text, names and colours are sample content.

### 4.1 Regions

| Region | Content | Notes |
| --- | --- | --- |
| Top bar | Board name, save and connection status, avatars of people on the board, Share button | Only the owner can rename the board and see Share; a viewer sees a "View only" tag |
| Toolbar | One button per tool, vertical on the left | Viewers see only the select tool |
| Canvas | Dotted background, objects, selection, live cursors | Fills the rest of the window |
| Properties panel | Small floating bar next to the selection: colour, text size, arrange | Appears only when something is selected |
| Zoom controls | Zoom out, zoom level, zoom in, fit to screen | Bottom right |

Save and connection status in the top bar: "All changes saved", "Saving", "Offline, changes will sync when you reconnect", and "Reconnecting" (FR-R5, FR-R6).

### 4.2 Tools and shortcuts

The keys are chosen to be easy to remember. F is a Phase 2 tool and is drawn dashed.

| Tool or action | Key | Phase |
| --- | --- | --- |
| Select and move | V | 1 |
| Sticky note | N | 1 |
| Shape | S | 1 |
| Pen | P | 1 |
| Text | T | 1 |
| Connector or line | L | 1 |
| Frame | F | 2 |
| Undo, redo | Ctrl or Cmd + Z, Ctrl or Cmd + Shift + Z | 1 |
| Copy, paste, duplicate | Ctrl or Cmd + C, V, D | 1 |
| Delete | Delete or Backspace | 1 |
| Bring forward, send backward | Ctrl or Cmd + \] and \[ | 1 |
| Move the selection a little | Arrow keys | 1 |
| Pan | Hold Space and drag, or middle mouse button | 1 |
| Zoom | Mouse wheel, pinch, or + and - keys | 1 |
| Fit the board to the screen | Shift + 1 | 1 |
| Back to the select tool, clear selection | Escape | 1 |

### 4.3 Making and editing objects

- Click or drag on the canvas with a tool to create an object; the tool returns to Select afterwards, except the pen, which stays on until the user presses Escape.
- A selected object shows a dashed outline and corner handles for resize; a rotate handle sits above it.
- A double click on a sticky note, shape or text starts editing the text in place.
- A connector snaps to the edge of an object when its end comes close, and stays attached when the object moves (FR-T6).

## 5. Other screens, dialogs and messages

### 5.1 Screens and dialogs

| Screen or dialog | Content | Behaviour |
| --- | --- | --- |
| Landing page | Product name, one sentence about what it does, an original illustration, Sign up and Log in buttons | No pricing, no Miro wording or images |
| Sign up | Email, display name, password with a show button, Sign up button, link to Log in | Errors appear under the field; on success the dashboard opens (UC-01) |
| Log in | Email, password, Log in button, link to Sign up | One general error for a wrong email or password |
| Share dialog | Switch "Anyone with the link", choice "Can view" or "Can edit", link box with a Copy button, "Turn off link" | Opens from the Share button; changing the choice keeps the same link (UC-05) |
| Guest name prompt | "Your name (optional)" and a Join button | Shown to a guest on opening a link; skipping gives a name like Guest 482 |
| Delete board dialog | The board name, a warning that it cannot be undone, Cancel and Delete buttons | Delete is the red button, Cancel is the default |
| Link not available | "This link is not available. It may have been turned off." and a button to the landing page | Same page for a wrong link and a turned-off link |
| Board not found | "This board does not exist." and a button to the dashboard | Shown for room close code 4003 |
| Connection banner | A thin bar at the top of the canvas: "Offline, changes will sync when you reconnect" or "Reconnecting" | Appears on a drop and disappears when connected (FR-R5, FR-R6) |

### 5.2 Messages

Messages use plain words, say what happened, and say what to do next. They are kept in one text file so that another language, for example Urdu, can be added later without changing the screens.

| Situation | Message | Where |
| --- | --- | --- |
| Link copied | Link copied | Short toast |
| Board deleted | Board deleted | Short toast |
| Email already used | This email already has an account. Try logging in. | Under the email field |
| Password too short | Use at least 8 characters. | Under the password field |
| Wrong log-in details | Email or password is wrong. | Above the form |
| Viewer tries to change something | View only: you cannot change this board. | Short toast |
| Save problem | Could not save. Trying again. | Top bar status |
| Server problem | Something went wrong on our side. Please try again. | Error page or toast |

## 6. Design system

These are the visual rules for the code. They are written as named tokens so the same value is never typed twice, and they go into the Tailwind theme. The values are a starting point and can be changed in one place.

### 6.1 Interface colours

| Token | Value | Use |
| --- | --- | --- |
| ink | `#111827` | Main text |
| muted | `#6B7280` | Secondary text, status text |
| border | `#E5E7EB` | Lines and outlines |
| background | `#FFFFFF` | Page and canvas |
| surface | `#F9FAFB` | Panels and cards |
| brand | `#4F46E5` | Primary buttons, selection outline, links |
| brand-dark | `#4338CA` | Button hover and pressed |
| danger | `#DC2626` | Delete and errors |
| success | `#16A34A` | Saved and confirmation |

Text and background pairs must reach WCAG AA contrast (NFR-18). The values above are expected to pass and are checked with a contrast tool during construction. A dark theme is optional and not part of Phase 1.

### 6.2 Colours on the board

| Group | Values |
| --- | --- |
| Sticky note colours | yellow `#FFD43B`, orange `#FFA94D`, pink `#F783AC`, green `#69DB7C`, blue `#74C0FC`, violet `#B197FC`; text on a sticky is always `#1F2937` |
| Shape and pen colours | black `#111827`, grey `#6B7280`, red `#E03131`, orange `#F76707`, green `#2F9E44`, blue `#1C7ED6`, violet `#7048E8` |
| Cursor colours (one is given to each user at sign up) | `#E8590C`, `#1C7ED6`, `#2F9E44`, `#AE3EC9`, `#F03E3E`, `#0CA678`, `#F59F00`, `#3B5BDB` |

### 6.3 Type, space and shape

| Topic | Rule |
| --- | --- |
| Font | Inter, with the system font as a fallback; the licence is checked and listed in the SCD |
| Interface sizes | 12, 14, 16, 18, 20 and 24 pixels (Tailwind `text-xs` to `text-2xl`); body text is 14 or 16 |
| Text on the board | Sticky notes start at 16 pixels; text objects start at 20; the size choices are small, medium, large and extra large |
| Spacing | Tailwind's 4 pixel steps; 16 pixels between a window edge and content on phones |
| Corners | 8 pixels for buttons and inputs, 12 pixels for cards and dialogs, none for sticky notes |
| Shadows | A light shadow for floating panels and dialogs, none on cards in the grid |
| Icons | One open-source icon set, for example Lucide; the licence is listed in the SCD |
| Motion | Short fades and slides of about 150 milliseconds; none while the user draws or drags |

### 6.4 How the tokens reach the code

The tokens are added to the Tailwind theme once, and screens only use the names. The file format depends on the Tailwind version installed, so the real file is recorded in the SCD. Example in Tailwind's CSS theme format:

```css
@theme {
  --color-ink: #111827;
  --color-muted: #6b7280;
  --color-brand: #4f46e5;
  --color-danger: #dc2626;
  --color-sticky-yellow: #ffd43b;
}
```

## 7. Interaction details, accessibility and usability test

### 7.1 Canvas behaviour

| Topic | Rule |
| --- | --- |
| Zoom | Between 10% and 400%; the point under the mouse stays still while zooming; the level is shown in the zoom controls |
| Pan | Space and drag, or middle mouse button; the canvas never has an edge |
| Selection | Click selects one; Shift and click adds or removes; dragging on empty canvas draws a selection box |
| Moving many objects | All selected objects move together and keep their distance |
| Live cursors | Each user's cursor has a name label in their colour; it fades after a few seconds without movement |
| People on the board | The top bar shows up to three avatars and then a count such as +2 |
| Undo | Only undoes the user's own last actions, never another person's (FR-T11) |

### 7.2 Responsive rules

| Window width | Landing, sign up, log in, dashboard | Board screen |
| --- | --- | --- |
| Wide (1024 pixels and more) | Full layout, 3 cards per row | Full layout |
| Medium (768 to 1023) | 2 cards per row | Full layout |
| Phone (under 768) | Single column | A note says boards work best on a larger screen; touch editing comes in Phase 2 (SRS section 2.3) |

### 7.3 Accessibility

- Every toolbar and top bar control is a real button with a text name; a tooltip shows the name and the shortcut.
- A clear focus ring in the brand colour shows where the keyboard focus is.
- Meaning is never carried by colour alone: status has words, and live cursors have names.
- Text and background pairs meet WCAG AA contrast (4.5 to 1 for normal text).
- Animations are switched off when the user's system asks for reduced motion.
- Limit in Phase 1: the drawing area is a canvas, so screen readers cannot read the objects on it. A list view of objects is a possible later addition.

### 7.4 Usability test

This checks NFR-12. Five people who have not seen the app, for example classmates, each try the tasks below without help while the author watches and takes notes.

| No. | Task | Pass when |
| --- | --- | --- |
| 1 | Sign up and create a board | Done in under 1 minute |
| 2 | Add a sticky note, type text, move it | Done without help |
| 3 | Join a shape and a sticky note with a connector | Connector stays attached when one is moved |
| 4 | Share the board as view only and open the link in a second browser | The second browser cannot change anything |
| 5 | Undo a mistake | Done with the shortcut or the keyboard |

The design target is that at least four of the five people finish every task without help. Problems found are written down and fixed in the interface, and the results go into the Test Cases and Reports document.

### Sources

- [W3C, Web Content Accessibility Guidelines 2.1 (contrast and keyboard rules)](https://www.w3.org/TR/WCAG21/)
