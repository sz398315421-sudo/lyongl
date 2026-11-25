"""Export the folded arrow as a Y-up, forward -Z GLB with its UV shading baked.

blender -b arrow.blend --python-exit-code 1 --python scripts/export-hud-ar-arrow.py -- arrow.glb
"""

import sys
import tempfile
from pathlib import Path

import bpy


output = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
source_scene = bpy.context.scene
source, = [obj for obj in source_scene.objects if obj.type == "MESH"]
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(
    source.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph
)
materials = list(mesh.materials)
uvs = mesh.uv_layers.active
tile_size = 256
padding = 4 / tile_size
tile_count = len(materials)

# Render each original material on a UV square. Some of the original side
# faces use collapsed UVs, which cannot be baked by rendering those faces.
bake = bpy.data.scenes.new("AR arrow material bake")
bpy.context.window.scene = bake
for index, material in enumerate(materials):
    swatch = bpy.data.meshes.new("UV swatch")
    swatch.from_pydata([(index, 0, 0), (index + 1, 0, 0), (index + 1, 1, 0), (index, 1, 0)], [], [(0, 1, 2, 3)])
    layer = swatch.uv_layers.new(name=uvs.name)
    coords = [(-padding, -padding), (1 + padding, -padding),
              (1 + padding, 1 + padding), (-padding, 1 + padding)]
    for loop, uv in zip(layer.data, coords):
        loop.uv = uv
    swatch.materials.append(material)
    bake.collection.objects.link(bpy.data.objects.new("UV swatch", swatch))

camera = bpy.data.cameras.new("UV camera")
camera.type = "ORTHO"
camera.ortho_scale = tile_count
bake.camera = bpy.data.objects.new("UV camera", camera)
bake.collection.objects.link(bake.camera)
bake.camera.location = (tile_count / 2, .5, 2)
bake.render.engine = "BLENDER_EEVEE_NEXT"
bake.render.resolution_x = tile_size * tile_count
bake.render.resolution_y = tile_size
bake.render.resolution_percentage = 100
bake.render.image_settings.file_format = "PNG"
bake.render.image_settings.color_mode = "RGB"
bake.view_settings.view_transform = "Standard"
bake.eevee.taa_render_samples = 8

with tempfile.TemporaryDirectory() as directory:
    bake.render.filepath = str(Path(directory) / "arrow-colors.png")
    bpy.ops.render.render(write_still=True)
    texture = bpy.data.images.load(bake.render.filepath)
    texture.pack()

material = bpy.data.materials.new("AR folded blue")
material.use_nodes = True
material.use_backface_culling = True
nodes = material.node_tree.nodes
nodes.clear()
image = nodes.new("ShaderNodeTexImage")
image.image = texture
image.extension = "EXTEND"
emission = nodes.new("ShaderNodeEmission")
surface = nodes.new("ShaderNodeOutputMaterial")
material.node_tree.links.new(image.outputs["Color"], emission.inputs["Color"])
material.node_tree.links.new(emission.outputs[0], surface.inputs["Surface"])
for face in mesh.polygons:
    for index in face.loop_indices:
        u, v = uvs.data[index].uv
        uvs.data[index].uv = ((face.material_index + (u + padding) / (1 + 2 * padding)) / tile_count,
                              (v + padding) / (1 + 2 * padding))
mesh.materials.clear()
mesh.materials.append(material)

export = bpy.data.scenes.new("AR arrow web export")
bpy.context.window.scene = export
arrow = bpy.data.objects.new("AR folded arrow", mesh)
export.collection.objects.link(arrow)
arrow.select_set(True)
bpy.context.view_layer.objects.active = arrow
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                          export_yup=True, export_animations=False, use_active_scene=True)
