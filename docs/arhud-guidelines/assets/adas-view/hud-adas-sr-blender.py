"""Create the HUD-ADAS compact SR perspective camera in a new Blender scene.

Open this file in the Scripting workspace and choose Run Script.
Scene coordinates use meters, +Y forward and +Z up.
"""
from math import radians, tan

import bpy


def create_sr_scene():
    scene = bpy.data.scenes.new("HUD-ADAS Compact SR")
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0

    aspect = scene.render.resolution_x / scene.render.resolution_y
    optics = bpy.data.cameras.new("SR Perspective Lens")
    optics.type = "PERSP"
    optics.sensor_fit = "HORIZONTAL"
    optics.sensor_width = 36.0
    optics.sensor_height = optics.sensor_width / aspect
    optics.lens = optics.sensor_width / (2 * aspect * tan(radians(15.0)))
    optics.shift_x = 0.0
    optics.shift_y = 0.0
    optics.clip_start = 0.12
    optics.clip_end = 200.0
    optics.dof.use_dof = False

    camera = bpy.data.objects.new("HUD-ADAS SR Camera", optics)
    camera.location = (0.0, -10.0, 3.4)
    camera.rotation_mode = "XYZ"
    camera.rotation_euler = (radians(72.0), 0.0, 0.0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene


if __name__ == "__main__":
    scene = create_sr_scene()
    if bpy.context.window:
        bpy.context.window.scene = scene
        for area in bpy.context.window.screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
