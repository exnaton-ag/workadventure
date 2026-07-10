# AGENTS.md

Instructions for agents (and humans) working in this repository.

## Adding a woka customisation asset (hat / accessory / companion)

WorkAdventure characters ("wokas") are customised with layered PNGs: hats,
accessories, and companions. To add a new one:

1. **Place the image file** in the matching directory under
   `play/public/resources/customisation/`:
   - Hats → `character_hats/`
   - Accessories → `character_accessories/`
   - Companions → `companions/`

   Legacy built-in assets use a numbered pattern (`character_accessoriesN.png`,
   `character_hatsN.png`). Custom additions instead use a short descriptive
   filename (e.g. `mask.png`, `trophy.png`, `santa_hat_red.png`,
   `blue_lightsaber.png`) — follow the descriptive convention for new assets.

2. **Register it** in `play/src/pusher/data/woka.json`:
   - Hats live under `hat.collections[0].textures`
   - Accessories live under `accessory.collections[0].textures`
   - Companions are registered in `play/src/pusher/data/companions.json`
     instead of `woka.json`

   Append an entry to the relevant `textures` array:

   ```json
   {
     "id": "accessory_<descriptive_name>",
     "name": "accessory_<descriptive_name>",
     "url": "resources/customisation/character_accessories/<file>.png",
     "position": <next integer after the current highest position>
   }
   ```

   `id`/`name` are identical and prefixed with the collection type
   (`accessory_`, `hat_`). `position` must be one greater than the current
   max in that array — check the last entry before appending.

3. If the artwork itself needs fixing after the fact, you can replace just
   the PNG bytes at the same path/filename without touching `woka.json` — no
   manifest change is needed for pure image fixes (see commit `b4c1ff09a`).
