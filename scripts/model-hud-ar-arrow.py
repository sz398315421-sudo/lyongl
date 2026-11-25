"""Build the editable blue arrow and a matching preview camera.

blender -b --python-exit-code 1 --python scripts/model-hud-ar-arrow.py -- arrow.blend [preview.png]
"""

import math
import sys
from pathlib import Path

import bpy


def linear_channel(value):
    channel = value / 255
    return channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4


def color(hex_code):
    return (*[linear_channel(int(hex_code[index:index + 2], 16)) for index in (0, 2, 4)], 1)


def gradient(name, stops, edge=None):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color(stops[len(stops) // 2][1])
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    tree.nodes.clear()
    uv = tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "Arrow UV"
    uv.location = (-720, 40)
    axes = tree.nodes.new("ShaderNodeSeparateXYZ")
    axes.location = (-500, 40)
    tree.links.new(uv.outputs["UV"], axes.inputs["Vector"])

    def ramp(points, y):
        node = tree.nodes.new("ShaderNodeValToRGB")
        node.location = (-280, y)
        node.color_ramp.interpolation = "LINEAR"
        elements = node.color_ramp.elements
        for element, (position, rgb) in zip(elements, points[:2]):
            element.position, element.color = position, color(rgb)
        for position, rgb in points[2:]:
            elements.new(position).color = color(rgb)
        tree.links.new(axes.outputs["Y"], node.inputs["Fac"])
        return node.outputs["Color"]

    paint = ramp(stops, 120)
    if edge:
        outer = ramp(edge, -135)
        mix = tree.nodes.new("ShaderNodeMixRGB")
        mix.location = (10, 120)
        tree.links.new(axes.outputs["X"], mix.inputs["Fac"])
        tree.links.new(paint, mix.inputs["Color1"])
        tree.links.new(outer, mix.inputs["Color2"])
        paint = mix.outputs["Color"]
    emission = tree.nodes.new("ShaderNodeEmission")
    emission.location = (220, 120)
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    output.location = (420, 120)
    tree.links.new(paint, emission.inputs["Color"])
    tree.links.new(emission.outputs[0], output.inputs["Surface"])
    return material


args = sys.argv[sys.argv.index("--") + 1:]
output_path = Path(args[0]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "AR 蓝色折面参考"

# Invert the reference projection at the same tilt and optical depth as the
# straight HUD pose. Use real heights for the ridge, bevel and closed shell.
width, height = 763, 378
center_x = 394.75
top_px, wing_px, wing_y = 68.5, 252, -.60
angle, distance = math.radians(22), 13.21
sin, cos = math.sin(angle), math.cos(angle)
focal = 262.5 * (distance + wing_y * cos)
center_y = wing_px + focal * wing_y * sin / (distance + wing_y * cos)


def point(x, y, z):
    slope = (center_y - y) / focal
    forward = (slope * (distance - z * sin) - z * cos) / (sin - slope * cos)
    depth = distance + forward * cos - z * sin
    return ((x - center_x) * depth / focal, forward, z)


tip = point(center_x, top_px, .160)
left = point(center_x - 262.5, wing_px, 0)
rear = point(center_x, 200.5, .160)
right = point(center_x + 262.5, wing_px, 0)
inner_tip = point(center_x, 77.6, .196)
tip_under = (0, tip[1], .137)
rear_slope = (center_y - 225.1) / focal
rear_under_z = (rear_slope * (distance + rear[1] * cos) - rear[1] * sin) / (cos + rear_slope * sin)
rear_under = (0, rear[1], rear_under_z)

vertices = [tip, left, rear, right, inner_tip, tip_under, rear_under]
faces = [
    (0, 1, 4), (4, 1, 2), (0, 4, 3), (4, 2, 3),
    (0, 5, 1), (0, 3, 5), (1, 6, 2), (2, 6, 3),
    (5, 6, 1), (5, 3, 6),
]
left_blue = [(0, "80C0FF"), (.23, "64B0FF"), (.45, "49A2FE"),
             (.66, "2E95FF"), (.80, "1E8DFE"), (1, "0083FE")]
materials = [
    gradient("左翼折面", left_blue),
    gradient("右翼折面", [(0, "ACD6FF"), (.23, "96C9FF"), (.45, "76BAFF"),
                        (.66, "52A7FF"), (.80, "319AFF"), (1, "0083FE")], left_blue),
    gradient("左侧浅蓝前缘", [(0, "D7ECFF"), (.18, "B5D9FF"), (.33, "93C9FF"),
                             (.60, "54A9FF"), (.76, "2290FF"), (1, "0083FE")]),
    gradient("右侧浅蓝前缘", [(0, "E6F3FF"), (.18, "C9E4FF"), (.33, "ADD6FF"),
                             (.60, "58ABFF"), (.76, "2290FF"), (1, "0083FE")]),
    gradient("前缘侧壁", [(0, "2278D8"), (1, "0F4AAB")]),
    gradient("钴蓝尾部侧壁", [(0, "0031BC"), (.48, "002AA3"), (1, "002590")]),
    gradient("深蓝底面", [(0, "002583"), (1, "001B67")]),
]

mesh = bpy.data.meshes.new("双翼折面和前缘")
mesh.from_pydata(vertices, [], faces)
mesh.update()
arrow = bpy.data.objects.new("AR 蓝色折面箭头", mesh)
scene.collection.objects.link(arrow)
for material in materials:
    mesh.materials.append(material)
uvs = mesh.uv_layers.new(name="Arrow UV")
face_materials = (2, 0, 3, 1, 4, 4, 5, 5, 6, 6)

for face, material_index in zip(mesh.polygons, face_materials):
    face.material_index = material_index
    for loop_index in face.loop_indices:
        index = mesh.loops[loop_index].vertex_index
        x, y, z = vertices[index]
        projected_y = center_y - focal * (y * sin + z * cos) / (distance + y * cos - z * sin)
        v = (projected_y - top_px) / (wing_px - top_px)
        u = min(1, abs(x) * 1.8)
        if material_index == 4:
            v = float(index == 5)
        elif material_index == 5:
            v = float(index == 6)
        uvs.data[loop_index].uv = (u, v)

camera_data = bpy.data.cameras.new("参考视角")
camera_data.sensor_fit = "HORIZONTAL"
camera_data.lens = camera_data.sensor_width * focal / width
camera_data.shift_x = (.5 * width - center_x) / width
camera_data.shift_y = (center_y - .5 * height) / width
camera = bpy.data.objects.new("参考视角", camera_data)
scene.collection.objects.link(camera)
camera.location = (0, -distance * cos, distance * sin)
camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = camera
scene.world = bpy.data.worlds.new("黑色背景")
scene.world.use_nodes = True
background = next(node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0, 0, 0, 1)
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 32
scene.render.resolution_x = width
scene.render.resolution_y = height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
bpy.context.view_layer.objects.active = arrow
arrow.select_set(True)
for screen in bpy.data.screens:
    for area in (area for area in screen.areas if area.type == "VIEW_3D"):
        area.spaces.active.region_3d.view_perspective = "CAMERA"
        area.spaces.active.shading.type = "MATERIAL"

output_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output_path))
if len(args) > 1:
    scene.render.filepath = str(Path(args[1]).resolve())
    bpy.ops.render.render(write_still=True)
