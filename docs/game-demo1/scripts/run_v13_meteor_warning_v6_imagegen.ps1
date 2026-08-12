param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$cli = 'C:\Users\Administrator\.codex\skills\gpt-image-2-skill\scripts\gpt_image_2_skill.cjs'
$node = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$root = 'E:\codex\Game'
$tmp = Join-Path $root 'tmp\imagegen\v13_meteor_warning_v6'
$source = Join-Path $tmp 'meteor_warning_storyboard_source.png'
$alpha = Join-Path $tmp 'meteor_warning_storyboard_alpha.png'

New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$prompt = @'
A single clean 2-column by 3-row storyboard sheet containing exactly six sequential panels for a sci-fi roguelite meteor ground-warning effect, isolated on a perfectly flat pure magenta #ff00ff background for chroma extraction. Use generous empty magenta gutters between panels, no grid lines, no borders, no labels and no text. Every panel has the same horizontal 3:2 composition as a 96x64 game frame, the same landing-point center exactly in the middle of its panel, and a complete stepped circular or elliptical lock ring fully visible with at least 8 pixels of clear empty margin on every side. Never crop or let any arc leave its panel.

All six panels are WARNING ONLY. They show only a ground-based danger locator: cold cyan scan arcs, orange-yellow segmented danger ticks, a compact center pulse, a few small square warning fragments and a stepped landing-zone ring. There is no meteor, no rock, no stone, no falling object, no trajectory, no hot tail, no smoke, no impact flash, no explosion, no debris, no character, no enemy, no terrain, no HUD and no numbers in any panel.

Panel 1: a faint central pulse and two short scan segments.
Panel 2: a partial ring begins to assemble around the same center.
Panel 3: more ring segments and rotating cyan scan arcs appear, still fully contained.
Panel 4: the ring becomes nearly complete and orange danger ticks brighten.
Panel 5: the complete ring pulses with a compact center warning core.
Panel 6: the complete ring reaches its strongest scan intensity and holds the exact same center as the future meteor impact; it must still contain no meteor or falling object.

Hard-edge medium-detail 8-bit pixel art, nearest-neighbor block shapes, dark graphite, cold cyan and orange-yellow only. No anti-aliasing, no smooth glow, no gradients, no realistic lighting, no red rectangle, no solid colored background other than the flat magenta matte. Keep every panel's complete ring safely inside its own 3:2 frame.
'@

if ($Force -or !(Test-Path -LiteralPath $source)) {
  Write-Host 'GENERATE meteor_warning_storyboard_source'
  & $node $cli --json --json-events --provider codex images generate --prompt $prompt --out $source --format png --size 2K --quality medium
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $source)) {
    throw 'GPT-Image 2 generation failed for V13 meteor warning v6.'
  }
} else {
  Write-Host 'SKIP existing storyboard source'
}

Write-Host 'EXTRACT meteor_warning_storyboard_alpha'
& $node $cli --json transparent extract --method chroma --matte-color auto --material sticker --strict --input $source --out $alpha
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $alpha)) {
  throw 'GPT-Image 2 transparent extraction failed for V13 meteor warning v6.'
}

Write-Host 'V13 meteor warning v6 generation and extraction complete.'
