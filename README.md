# Quaddle Solo Digital

A browser-based solo adaptation of the tabletop game for a human player versus a digital opponent.

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173>.

## Implemented gameplay

- 7x7 board.
- 54-card deck with the requested distribution:
  - I = 6 cards
  - O, T, L, J, S, Z = 8 cards each
- Difficulty levels:
  - **Easy**: mostly random legal move selection.
  - **Standard**: heuristic move selection with noise.
  - **Expert**: stronger deterministic heuristic.
- Phase 1 and 2 logic:
  - Phase 1 prevents overlap.
  - Phase 2 unlocks when a turn's card cannot be played without overlap.
  - In phase 2, overlap may include unlimited own pieces and up to 3 opponent pieces.
- Overlay preview while moving the placement anchor:
  - legal placements are highlighted.
  - illegal placements render a red X overlay.
- Rotation in 90° increments.
- Scoring and line clear:
  - +1 point per completed row/column entirely in your color.
  - Completed lines are removed.
- End-game logic:
  - stop at 5 points or when deck is empty.
  - tie-break by pieces on board, then true tie.

## PC + mobile controls

- Tap/click any grid square to move the shape anchor there.
- Tap/click a legal position to place immediately.
- Or use **Place Shape** button for explicit confirmation.
- On mobile, use the on-screen arrow controls to fine-tune anchor position.
