# Medieval Scale Design Integration

## Archive contents used

Design archive `twich votes(1).zip` contained the ready overlay composition and separated PNG assets:

- `base.png` — base/pillar/pedestal layer
- `scale_stick.png` — beam layer from which the bitmap `VS` disk was removed for runtime use
- `scale.png` — back pan + rear chains
- `scale_front.png` — front pan lip + front chains, drawn over items
- `title.png` — empty top parchment for the dynamic question
- `left_player.png`, `right_player.png` — optional side banner assets
- `coin.png`, `pelmen.png`, `pancake.png` — item-fill assets
- `layout.json`, `overlay.html` — original standalone layout reference

## Runtime mapping

Assets were copied/renamed into `public/assets/tavern-scale/`:

| Runtime asset | Source asset | Role |
| --- | --- | --- |
| `base.png` | `assets/base.png` | Stationary base + central pillar |
| `beam_no_vs.png` | generated from `assets/scale_stick.png` | Rotating beam; bitmap `VS` inner disk removed |
| `pan_back.png` | `assets/scale.png` | Back half of each pan and rear chains |
| `pan_front.png` | `assets/scale_front.png` | Front half of each pan, drawn above items |
| `title_parchment.png` | `assets/title.png` | Top question parchment |
| `item_coin.png` | `assets/coin.png` | Bowl fill item |
| `item_pelmen.png` | `assets/pelmen.png` | Alternative bowl fill item |
| `item_pancake.png` | `assets/pancake.png` | Alternative bowl fill item |
| `left_banner.png` | `assets/left_player.png` | Kept as optional side-banner replacement asset |
| `right_banner.png` | `assets/right_player.png` | Kept as optional side-banner replacement asset |

The visible `VS` is rendered by HTML/CSS, not baked into the beam bitmap, so it can rotate independently.

## Layer order

The OBS scene stays transparent. Runtime z-order is:

1. transparent stage
2. top parchment
3. base/pillar
4. beam transform group
5. left pan back
6. left items
7. left pan front
8. right pan back
9. right items
10. right pan front
11. beam image
12. CSS `VS` medallion
13. compact text/stat cards

## Layout knobs

Default layout is compact: the title parchment sits close to the beam, and stat cards sit directly under the bowls without intersecting the base.

Useful query parameters:

- `overlayX`, `overlayY`, `overlayScale`
- `rigX`, `rigTop`, `rigScale`
- `titleX`, `titleTop`, `titleWidth`, `titleHeight`
- `questionTop`, `questionRight`, `questionBottom`, `questionLeft`
- `leftStatsX`, `rightStatsX`, `statsTop`, `statsWidth`, `statsHeight`
- `pivotX`, `pivotY`, `attachLeftX`, `attachLeftY`, `attachRightX`, `attachRightY`
- `panHangX`, `panHangY`, `panScale`
- `beamWrapY`, `maxTilt`, `animationMs`
- `item=coin|pelmen|pancake`, `itemSize`, `maxItems`, `itemValue`
- `itemBoxX`, `itemBoxY`, `itemBoxWidth`, `itemBoxHeight`

Preview/query mode:

```text
/overlay?preview=1&question=Кто%20победит?&leftLabel=Left&rightLabel=Right&leftVotes=38&rightVotes=62&item=coin
```

## Verification performed

- JS syntax check: `node --check public/overlay-layout.js public/overlay.js`
- Project lint check: `npm run lint:check`
- Tests: `npm test`
- Visual assembly check: generated a 1920x1080 composite preview from the runtime layout to verify that base, beam, pans, items, title, and stats do not drift apart.
