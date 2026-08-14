param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$cli = 'C:\\Users\\Administrator\\.codex\\skills\\gpt-image-2-skill\\scripts\\gpt_image_2_skill.cjs'
$node = 'C:\\Users\\Administrator\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe'
$root = 'E:\\codex\\Game'
$tmp = Join-Path $root 'tmp\\imagegen\\v15_meteor_perspective'
$warningSource = Join-Path $tmp 'meteor_warning_storyboard_source.png'
$warningAlpha = Join-Path $tmp 'meteor_warning_storyboard_alpha.png'
$impactSource = Join-Path $tmp 'meteor_impact_storyboard_source.png'
$impactAlpha = Join-Path $tmp 'meteor_impact_storyboard_alpha.png'

New-Item -ItemType Directory -Force -Path $tmp | Out-Null


$warningPrompt = @'
A single clean 3 by 2 storyboard sheet with exactly six sequential panels, no more and no fewer, for a sci-fi roguelite METEOR WARNING viewed from the same angled top-down 2.5D pixel-game camera as an isometric ground map. Use a perfectly flat pure magenta #ff00ff matte background in every panel and gutters for chroma extraction. No grid, no borders, no labels, no numbers, no text. Each of the six panels is a centered square game frame and shares exactly the same strike-point center and orientation.

This sheet is WARNING ONLY. In all six panels there must be absolutely no meteor, no rock, no stone, no falling object, no trajectory, no hot tail, no smoke, no explosion and no debris. Show only a complete closed ground-plane danger locator: a horizontally wide, vertically compressed stepped ellipse about 1.7 times wider than tall, cold-cyan scan arcs, orange-yellow segmented danger ticks, a compact center pulse and a few tiny warning pixels. The full ellipse must remain comfortably inside every panel and never be clipped or shown as a half-ring.

Six-panel progression left-to-right, then next row: faint center pulse; ring segments assembling; rotating scan arc; nearly complete flattened ellipse; complete ellipse with brighter ticks; maximum-intensity complete ellipse. Keep the exact same ellipse center, long axis and scale in every panel so the last warning frame can connect to an impact animation.

Hard-edge medium-detail 8-bit pixel art, stepped silhouettes, nearest-neighbor block shapes, dark graphite, rust orange, ember yellow and limited cold cyan. No anti-aliasing, gradients, smooth glow, terrain, character, enemy, HUD, UI or red rectangle. This is a flat ground warning viewed from an angled camera, never a face-on circle.
'@

$impactPrompt = @'
A single clean 5 by 2 storyboard sheet with exactly ten sequential panels, no more and no fewer, for a continuous sci-fi roguelite METEOR IMPACT viewed from the same angled top-down 2.5D pixel-game camera as an isometric ground map. Use a perfectly flat pure magenta #ff00ff matte background in every panel and gutters for chroma extraction. No grid, no borders, no labels, no numbers, no text. Each panel is a centered square game frame. Use the same strike-point center and same wide, vertically compressed ground ellipse in every panel; the first panel must connect to a warning ellipse.

The ground footprint is not a front-facing circle: any shockwave, fire pool, dust cloud and debris spread lies on the ground plane as a horizontally wide, vertically compressed stepped ellipse about 1.7 times wider than tall. The meteor rock itself is a small three-dimensional charcoal rock and may be vertically elongated while descending.

Ten-panel progression left-to-right, then next row: panel 1 is the first appearance of a small charcoal meteor high above the strike point with the empty warning ellipse below and no explosion; panel 2 the rock descends with a short rust-orange hot tail; panel 3 the rock is close to the center, still no blast; panel 4 contact sparks at the ground; panel 5 pale-yellow hot core ignites; panel 6 low elliptical shockwave and orange fragments begin; panel 7 compact ellipse-shaped explosion expands; panel 8 reaches maximum width with layered dust, dark debris and a small upright heat core; panel 9 dust and the elliptical shockwave dissipate; panel 10 only a few ember pixels and a faint flattened energy trace fade out. Do not show any explosion before panel 4 and do not show the meteor in a warning-only panel.

Hard-edge medium-detail 8-bit pixel art, stepped silhouettes, nearest-neighbor block shapes, dark graphite, rust orange, ember yellow and limited cold cyan only in the locator. No anti-aliasing, gradients, smooth bloom, terrain, character, enemy, HUD, UI or red rectangle. The visual must clearly match a slanted 2.5D ground plane; never draw a round face-on explosion.
'@

if ($Force -or !(Test-Path -LiteralPath $warningSource)) {
  Write-Host 'GENERATE V15 perspective meteor warning storyboard'
  & $node $cli --json --json-events --provider codex images generate --prompt $warningPrompt --out $warningSource --format png --size 2K --quality medium
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $warningSource)) { throw 'GPT-Image 2 warning generation failed for V15.' }
} else { Write-Host 'SKIP existing V15 warning storyboard source' }

if ($Force -or !(Test-Path -LiteralPath $impactSource)) {
  Write-Host 'GENERATE V15 perspective meteor impact storyboard'
  & $node $cli --json --json-events --provider codex images generate --prompt $impactPrompt --out $impactSource --format png --size 2K --quality medium
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $impactSource)) { throw 'GPT-Image 2 impact generation failed for V15.' }
} else { Write-Host 'SKIP existing V15 impact storyboard source' }

Write-Host 'EXTRACT V15 perspective meteor warning alpha'
& $node $cli --json transparent extract --method chroma --matte-color auto --material sticker --strict --input $warningSource --out $warningAlpha
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $warningAlpha)) { throw 'Warning transparency extraction failed for V15.' }

Write-Host 'EXTRACT V15 perspective meteor impact alpha'
& $node $cli --json transparent extract --method chroma --matte-color auto --material sticker --strict --input $impactSource --out $impactAlpha
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $impactAlpha)) { throw 'Impact transparency extraction failed for V15.' }

Write-Host 'V15 perspective meteor storyboard generation and extraction complete.'
