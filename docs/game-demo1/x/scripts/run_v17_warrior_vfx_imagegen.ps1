$ErrorActionPreference = 'Stop'

$cli = 'C:\Users\Administrator\.codex\skills\gpt-image-2-skill\scripts\gpt_image_2_skill.cjs'
$node = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$python = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$root = 'E:\codex\Game'
$tmp = Join-Path $root 'tmp\imagegen\v17_warrior_vfx'

New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$jobs = @(
  @{ id='star_ring'; prompt='A clean 4 by 2 storyboard sheet containing exactly eight sequential frames for a warrior star ring sword-array combat effect. Hard-edged medium-detail 8-bit pixel art for a vertical mobile sci-fi roguelite. The effect is transparent-ready on a perfectly flat solid pure magenta #ff00ff matte. Use a stable center and generous transparent-safe margin. A gold-orange oblique ellipse in 2.5D top-down perspective appears first, four cyan-white floating swords assemble around it, the swords orbit along the flattened ellipse, a crisp cutting pulse flares, then the ring settles to a smaller stable ellipse. The ring must always be a complete closed ellipse, never a circle and never cropped. No character, enemy, terrain, HUD, labels, numbers, border, smoke, gradient, soft glow or anti-aliasing. All eight panels share the same center, radius and light direction.' },
  @{ id='slash_arc'; prompt='A clean 4 by 2 storyboard sheet containing eight sequential storyboard panels for a warrior close-range slash combat effect. Only the first five panels contain the action; panels six through eight are empty flat magenta matte for padding and must contain no artwork. Hard-edged medium-detail 8-bit pixel art for a vertical mobile sci-fi roguelite. Transparent-ready flat pure magenta #ff00ff background. A compact orange-red start spark grows into one directional cyan-white stepped crescent blade, reaches full width with a few square pixel fragments, then rapidly fades. Keep the slash centered and pointing right in every panel so the game can rotate it. No character, enemy, terrain, HUD, labels, numbers, border, smoke, gradient, soft glow or anti-aliasing.' },
  @{ id='sword_wave'; prompt='A clean 4 by 2 storyboard sheet containing exactly eight sequential frames for a warrior rift slash sword-wave combat effect. Hard-edged medium-detail 8-bit pixel art for a vertical mobile sci-fi roguelite. The effect is transparent-ready on a perfectly flat solid pure magenta #ff00ff matte. Keep a stable center and a generous transparent-safe margin. An orange-red sword core charges, a first cyan-white stepped blade wave pushes forward, second and third layered waves follow, the wave reaches maximum range with a short angular space-rift edge, then fragments into square sparks and fades. One directional wave points right in every panel so the game can rotate it. No character, enemy, terrain, HUD, labels, numbers, border, smoke, gradient, soft glow or anti-aliasing.' }
)

foreach ($job in $jobs) {
  $out = Join-Path $tmp ($job.id + '_source.png')
  if (!(Test-Path -LiteralPath $out)) {
    Write-Host ("GENERATE " + $job.id)
    & $node $cli --json --json-events --provider codex images generate --prompt $job.prompt --out $out --format png --size 2K --quality medium
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $out)) {
      throw ("GPT-Image 2 generation failed for " + $job.id)
    }
  } else {
    Write-Host ("SKIP " + $job.id + " (source exists)")
  }
}

& $python (Join-Path $root 'scripts\build_v17_warrior_vfx.py') prepare

$specs = @(
  @{ id='star_ring'; count=8 },
  @{ id='slash_arc'; count=5 },
  @{ id='sword_wave'; count=8 }
)

foreach ($spec in $specs) {
  $sourceDir = Join-Path $tmp ("cells\" + $spec.id)
  $extractDir = Join-Path $tmp ("extracted\" + $spec.id)
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  for ($i = 0; $i -lt $spec.count; $i++) {
    $input = Join-Path $sourceDir ("source_{0:D2}.png" -f $i)
    $output = Join-Path $extractDir ("frame_{0:D2}.png" -f $i)
    & $node $cli --json transparent extract --method chroma --matte-color auto --input $input --out $output --material sticker --strict
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $output)) {
      throw ("Transparent extraction failed for " + $spec.id + " frame " + $i)
    }
  }
}

& $python (Join-Path $root 'scripts\build_v17_warrior_vfx.py') finalize
& $python (Join-Path $root 'scripts\build_v17_warrior_vfx.py') validate
Write-Host 'V17 warrior VFX generation, extraction and validation complete.'
