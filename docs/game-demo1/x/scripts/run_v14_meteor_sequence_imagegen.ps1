param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$cli = 'C:\Users\Administrator\.codex\skills\gpt-image-2-skill\scripts\gpt_image_2_skill.cjs'
$node = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$root = 'E:\codex\Game'
$tmp = Join-Path $root 'tmp\imagegen\v14_meteor_sequence'
$source = Join-Path $tmp 'meteor_sequence_storyboard_source.png'
$alpha = Join-Path $tmp 'meteor_sequence_storyboard_alpha.png'

New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$prompt = @'
A single clean 4 by 4 storyboard sheet containing exactly sixteen sequential panels for one continuous sci-fi roguelite meteor ground event. Use a perfectly flat pure magenta #ff00ff matte background in every panel and all gutters for chroma extraction. No grid, no borders, no labels, no numbers, no text. Every panel is a square game-frame composition with the exact same strike-point center and the same hard-edge 8-bit pixel palette.

CRITICAL SEQUENCE RULE: PANELS 1 THROUGH 6 ARE METEOR WARNING ONLY. They must contain only a complete ground-based danger locator: a centered stepped circular lock ring, cold-cyan scan arcs, orange-yellow segmented danger ticks, a compact center pulse and a few tiny warning pixels. In panels 1-6 there must be absolutely NO meteor, NO rock, NO stone, NO falling object, NO trajectory, NO hot tail, NO smoke, NO explosion and NO debris. Keep the whole warning ring complete and comfortably inside the panel with at least 12 percent empty magenta margin on every side.

WARNING PANELS 1-6 progression: 1 faint center pulse with two short scan arcs; 2 small ring segments assemble; 3 ring expands with rotating cyan scan marks; 4 nearly complete ring and brighter orange ticks; 5 complete ring with a stronger center pulse; 6 complete ring at maximum warning intensity, still absolutely no meteor or falling object.

CRITICAL SEQUENCE RULE: ONLY PANEL 7 MAY INTRODUCE THE METEOR. PANELS 7-16 are the impact sequence continuing from the exact same warning center. Panel 7: a small charcoal meteor first appears high above the strike point while the warning ring remains, with no explosion. Panel 8: meteor descends toward the center with a short rust-orange hot tail. Panel 9: contact sparks begin. Panel 10: pale-yellow hot core ignites. Panels 11-12: hard pixel shockwave and orange fragments expand. Panels 13-14: compact explosion reaches its largest size with charcoal debris and dust. Panel 15: dust, fragments and shockwave dissipate. Panel 16: a few ember pixels fade out.

Use hard-edge medium-detail 8-bit pixel art, stepped silhouettes, nearest-neighbor block shapes, dark graphite, rust orange, ember yellow and limited cold cyan. No anti-aliasing, no gradients, no smooth glow, no realistic lighting, no terrain, no character, no enemy, no HUD, no UI, no red rectangle. Preserve the same landing-zone center, ring geometry, scale and orientation across all sixteen panels so warning panel 6 and impact panel 7 align perfectly. The meteor must not appear in panels 1-6.
'@

if ($Force -or !(Test-Path -LiteralPath $source)) {
  Write-Host 'GENERATE V14 meteor_sequence_storyboard_source'
  & $node $cli --json --json-events --provider codex images generate --prompt $prompt --out $source --format png --size 2K --quality medium
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $source)) {
    throw 'GPT-Image 2 generation failed for V14 meteor sequence.'
  }
} else {
  Write-Host 'SKIP existing V14 storyboard source'
}

Write-Host 'EXTRACT V14 meteor_sequence_storyboard_alpha'
& $node $cli --json transparent extract --method chroma --matte-color auto --material sticker --strict --input $source --out $alpha
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $alpha)) {
  throw 'GPT-Image 2 transparent extraction failed for V14 meteor sequence.'
}

Write-Host 'V14 storyboard generation and extraction complete.'
