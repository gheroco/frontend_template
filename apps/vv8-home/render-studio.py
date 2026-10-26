"""Render the exported Three.js apartment geometry with Blender Cycles.

Requires Blender's official bpy module (4.5 LTS). Geometry, materials, coordinates
and furniture are imported from the same GLB offered by the viewer. The ceiling
follows the recorded user height; sky and lighting remain presentation choices.
"""
import argparse
import json
import math
import os
from pathlib import Path
import sys

if os.environ.get('VV8_BPY_PATH'):
    sys.path.insert(0, os.environ['VV8_BPY_PATH'])
import bpy
import bmesh
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--data', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--shots', default='dollhouse,living,primary')
parser.add_argument('--samples', type=int, default=48)
parser.add_argument('--width', type=int, default=1800)
args = parser.parse_args()
data = json.loads(Path(args.data).read_text())
output = Path(args.output); output.mkdir(parents=True, exist_ok=True)

def pos(x, y, z):
    """Three.js X,Y,Z to Blender X,Y,Z."""
    return Vector((x, -z, y))

def point_camera(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()

def area(name, xyz, target, power, color, size=3, size_y=None):
    light_data = bpy.data.lights.new(name, 'AREA')
    light_data.energy = power; light_data.color = color
    light_data.shape = 'RECTANGLE'; light_data.size = size; light_data.size_y = size_y or size
    obj = bpy.data.objects.new(name, light_data); bpy.context.collection.objects.link(obj)
    obj.location = pos(*xyz); point_camera(obj, pos(*target)); return obj

def surface(name, color, roughness=0.8):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

def parent_names(obj):
    names = [obj.name]; p = obj.parent
    while p:
        names.append(p.name); p = p.parent
    return ' / '.join(names).lower()

def solid_section(points, height, material, name):
    """Cap a convex architectural member despite glTF primitive seams."""
    pts = sorted(set((round(v.x,6),round(v.y,6)) for v in points))
    if len(pts) < 3: return
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[]; upper=[]
    for p in pts:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0: lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0: upper.pop()
        upper.append(p)
    hull=lower[:-1]+upper[:-1]
    if len(hull)<3: return
    mesh=bpy.data.meshes.new(name+' solid section')
    mesh.from_pydata([(x,y,height+.00025) for x,y in hull],[],[tuple(range(len(hull)))])
    mesh.update(); obj=bpy.data.objects.new(name+' solid section',mesh)
    bpy.context.collection.objects.link(obj);mesh.materials.append(material)
    # Adjacent wall and pier sections overlap at an identical cut height.
    # The underlying walls cast shadows; presentation caps must not shadow
    # one another at zero distance and create spurious black intersections.
    obj.visible_shadow = False

def cut_walls(height=1.05):
    """Cut the actual architecture geometry, leaving all furniture at full size."""
    cap_material = surface('Solid plaster at cut plane', (.81,.79,.75), .92)
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH': continue
        ancestry = parent_names(obj)
        if not any(t in ancestry for t in ['walls, columns', 'wall structure', 'structural architecture']): continue
        obj.data = obj.data.copy()
        # The interactive plan uses charcoal section faces for legibility.
        # Render solid plaster on those pre-existing section surfaces as well.
        section_rgb = (.0331047666, .0382043716, .0343398068)
        for slot in obj.material_slots:
            bsdf = slot.material.node_tree.nodes.get('Principled BSDF') if slot.material and slot.material.use_nodes else None
            if bsdf:
                color = bsdf.inputs['Base Color']
                if not color.is_linked and max(abs(color.default_value[i]-section_rgb[i]) for i in range(3)) < .00001:
                    slot.material = cap_material
        bm = bmesh.new(); bm.from_mesh(obj.data)
        mat = obj.matrix_world.copy(); inv = mat.inverted()
        for v in bm.verts: v.co = mat @ v.co
        # glTF stores separate vertices at UV seams. Weld those seams before
        # cutting so the section is a closed loop rather than disconnected
        # triangles. Keep the per-face UV layers on all original surfaces.
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
        result = bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=0.00001, plane_co=(0,0,height), plane_no=(0,0,1), clear_outer=True, clear_inner=False)
        edges = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z-height)<0.0001 for v in e.verts)]
        if edges:
            try:
                caps = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
                cap_index = len(obj.data.materials)
                obj.data.materials.append(cap_material)
                for face in caps.get('faces', []):
                    face.material_index = cap_index
            except RuntimeError: pass
        # The source is a collection of convex box members, glazing frames and
        # trims. A separate section surface also covers disconnected primitives
        # that remain after a glTF material split.
        if 'curtain' not in ancestry and 'linen' not in ancestry:
            section_points=[v.co.copy() for v in bm.verts if abs(v.co.z-height)<0.0001]
            solid_section(section_points,height,cap_material,obj.name)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        for v in bm.verts: v.co = inv @ v.co
        bm.to_mesh(obj.data); bm.free(); obj.data.update()

def ceilings(height):
    mat = surface('Warm plaster ceiling · user-specified height', (.83,.81,.77), .92)
    for rid, room in data['rooms'].items():
        if rid.startswith('balcony'): continue
        verts = [pos(x,height,z) for x,z in room['polygon']]
        mesh = bpy.data.meshes.new(rid+' ceiling'); mesh.from_pydata(verts, [], [tuple(range(len(verts)))])
        mesh.update(); obj = bpy.data.objects.new(rid+' ceiling', mesh); bpy.context.collection.objects.link(obj)
        obj.data.materials.append(mat)

def prepare_scene(shot):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.model).resolve()), import_pack_images=True)
    scene = bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.device='CPU'
    scene.cycles.samples=args.samples; scene.cycles.use_denoising=True
    scene.cycles.max_bounces=8; scene.cycles.diffuse_bounces=4; scene.cycles.glossy_bounces=4
    scene.cycles.transmission_bounces=6; scene.cycles.transparent_max_bounces=12
    scene.cycles.sample_clamp_indirect=3
    scene.render.threads_mode='FIXED'; scene.render.threads=min(12, os.cpu_count() or 4)
    scene.render.resolution_x=args.width
    scene.render.resolution_y=round(args.width*(.82 if shot=='dollhouse' else .625))
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='JPEG'; scene.render.image_settings.quality=95
    scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=.2
    world=bpy.data.worlds.new('Soft daylight'); scene.world=world; world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.80,.86,1,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.35
    # Sun and broad window lights are kept consistent with the viewer's east-side light rig.
    sun_data=bpy.data.lights.new('Soft afternoon daylight','SUN'); sun_data.energy=2.0; sun_data.angle=.10
    sun=bpy.data.objects.new('Soft afternoon daylight',sun_data); scene.collection.objects.link(sun)
    sun.location=pos(14,13,4);point_camera(sun,pos(3,0,5)); sun.data.color=(1,.92,.80)
    area('Living window softbox',(10.8,3,4.2),(4,1,4.5),650,(.87,.93,1),3,3.2)
    area('Primary window softbox',(10.7,2.8,10.8),(5,1,10.4),500,(.87,.93,1),2.8,2.8)
    area('Kitchen sky fill',(7.9,3.1,1.3),(3.5,1,1.3),280,(.88,.94,1),2.4,2.4)
    camera_data=bpy.data.cameras.new('Architectural camera'); camera=bpy.data.objects.new('Architectural camera',camera_data)
    scene.collection.objects.link(camera); scene.camera=camera
    camera_data.clip_start=.04; camera_data.clip_end=150
    if shot=='dollhouse':
        cut_walls(.95)
        bpy.ops.mesh.primitive_plane_add(size=200, location=(4.5,-6,-.28))
        ground=bpy.context.object;ground.name='Studio ground';ground.data.materials.append(surface('Studio limestone',(.77,.76,.72),.85))
        area('Large studio softbox',(0,11,5),(4,0,6),1700,(1,.97,.90),9)
        camera_data.type='ORTHO'; camera_data.ortho_scale=16.0
        camera.location=pos(14,20.8,20);point_camera(camera,pos(4.5,.15,6.1))
    else:
        ceilings(data.get('wallHeight',3))
        # Low-energy broad bounced light prevents impossible black interiors without flattening the sun shadows.
        bounce_height=data.get('wallHeight',3)-.15
        area('Living ceiling bounce',(4.7,bounce_height,4.5),(4.7,0,4.5),60,(1,.90,.78),3.4,2.3)
        area('Primary ceiling bounce',(5.4,bounce_height,10.6),(5.4,0,10.6),45,(1,.91,.82),3.5,2)
        if shot=='living':
            camera_data.lens=25
            camera.location=pos(3.05,1.52,5.65);point_camera(camera,pos(6.25,1.05,3.9))
        else:
            camera_data.lens=24
            camera.location=pos(2.48,1.62,9.40);point_camera(camera,pos(6.20,1.08,11.76))
    scene.render.filepath=str(output/f'render-{shot}.jpg')
    bpy.ops.render.render(write_still=True)
    return {'shot':shot,'path':scene.render.filepath,'width':scene.render.resolution_x,'height':scene.render.resolution_y,
        'engine':'Blender Cycles','samples':args.samples,'source':'Exported viewer geometry','ceilingHeight':data.get('wallHeight',3),'ceilingHeightBasis':data.get('wallHeightBasis','provided')}

records=[]
for shot in args.shots.split(','):
    if shot not in ('dollhouse','living','primary'): raise ValueError('Unknown shot '+shot)
    records.append(prepare_scene(shot))
    print('VV8_RENDER_COMPLETE '+json.dumps(records[-1]),flush=True)
(output/'renders.json').write_text(json.dumps({'views':records,'note':'Rendered from the interactive model. Ceiling height is user specified; lighting and cutaway styling are presentation choices.'},indent=2))
