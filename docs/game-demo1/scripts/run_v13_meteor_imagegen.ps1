param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$cli = 'C:\Users\Administrator\.codex\skills\gpt-image-2-skill\scripts\gpt_image_2_skill.cjs'
$node = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$root = 'E:\codex\Game'
$tmp = Join-Path $root 'tmp\imagegen\v13_meteor_sequence'
$source = Join-Path $tmp 'meteor_sequence_storyboard_source.png'
$alpha = Join-Path $tmp 'meteor_sequence_storyboard_alpha.png'

New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$prompt = @'
A single clean 4 by 4 storyboard sheet containing exactly sixteen sequential panels for one continuous vertical mobile sci-fi roguelite pixel-art meteor event. The sheet has no gutters, no grid, no borders, no labels and no text; each panel has the same centered ground strike point and the same hard-edged 8-bit pixel palette, isolated on a perfectly flat pure magenta #ff00ff background for chroma extraction.

Panels 1 through 6 are METEOR WARNING ONLY: show only a ground-based danger locator made from cold cyan scan arcs, orange-yellow segmented target ticks, a compact center pulse and a widening/contracting stepped landing-zone ring. These first six panels must contain absolutely no meteor, no rock, no stone silhouette, no falling object, no trajectory, no smoke, no impact flash and no explosion. Keep every warning mark in the lower-middle strike zone with generous empty space above it.

Panels 7 through 16 are METEOR IMPACT ONLY and are the continuation after the warning: panel 7 is the first frame where a small charcoal meteor appears high above the same strike point while the warning marker remains; panel 8 shows the meteor descending with a short rust-orange hot tail; panel 9 shows contact sparks; panel 10 lights a pale-yellow hot core; panels 11 and 12 expand a hard pixel shockwave and rust-orange fragments; panel 13 reaches the largest compact explosion with charcoal debris and dusty pixels; panels 14 and 15 let the shockwave, dust and fragments dissipate; panel 16 leaves only a few ember pixels and then fades. The meteor must not appear in any of panels 1-6.

Use medium-detail hard-edge 8-bit pixel art, stepped silhouettes, nearest-neighbor-looking blocks, dark graphite, rust orange, ember yellow and limited cold cyan. No anti-aliasing, no smooth glow, no gradients, no realistic texture, no characters, no enemies, no terrain background, no HUD, no UI, no warning square, no red rectangle and no numbers. Keep the shared strike-point center stable in all sixteen panels; only the meteor and impact energy change after panel 6.
'@

if ($Force -or !(Test-Path -LiteralPath $source)) {
  Write-Host 'GENERATE meteor_sequence_storyboard_source'
  & $node $cli --json --json-events --provider codex images generate --prompt $prompt --out $source --format png --size 2K --quality medium
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $source)) {
    throw 'GPT-Image 2 generation failed for V13 meteor sequence.'
  }
} else {
  Write-Host 'SKIP existing storyboard source'
}

Write-Host 'EXTRACT meteor_sequence_storyboard_alpha'
& $node $cli --json transparent extract --method chroma --matte-color auto --material sticker --strict --input $source --out $alpha
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $alpha)) {
  throw 'GPT-Image 2 transparent extraction failed for V13 meteor sequence.'
}

Write-Host 'V13 storyboard generation and extraction complete.'
