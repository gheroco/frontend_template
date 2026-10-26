import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Canvas2D fallback for environments which disable WebGL. Renders the actual Three.js scene. */
export class SoftwareRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.domElement.dataset.renderer = 'software';
    this.context = this.domElement.getContext('2d', { alpha: false });
    if (!this.context) throw new Error('Canvas rendering is unavailable.');
    this.isSoftwareRenderer = true;
    this.info = { render: { calls: 0, triangles: 0, lines: 0, points: 0 }, memory: { geometries: 0, textures: 0 } };
    this.shadowMap = { enabled: false, type: null };
    this._pixelRatio = 1; this._width = 1; this._height = 1;
    this._geometries = new WeakMap(); this._objects = new WeakMap(); this._materialTextures = new WeakMap();
    this._planarLODs = new Map();
    this._colors = new Map(); this._rgbColors = new Map(); this._textureSamples = new WeakMap(); this._signature = ''; this._force = true; this._lastTime = -100;
    this._viewProjection = new THREE.Matrix4();
    this._light = new THREE.Vector3(.72,.68,-.13).normalize();
    this._fill = new THREE.Vector3(-.45,.66,.6).normalize();
    this._lighting = 'daylight';
  }
  setPixelRatio(ratio) { this._pixelRatio = Math.min(1.5, Math.max(1,ratio||1)); this.setSize(this._width,this._height,false); }
  getPixelRatio() { return this._pixelRatio; }
  setSize(width,height,updateStyle=true) {
    this._width=Math.max(1,width); this._height=Math.max(1,height);
    this.domElement.width=Math.round(this._width*this._pixelRatio);
    this.domElement.height=Math.round(this._height*this._pixelRatio);
    if(updateStyle){this.domElement.style.width=width+'px';this.domElement.style.height=height+'px';}
    this.invalidate();
  }
  getSize(target) { return target.set(this._width,this._height); }
  compile() {}
  dispose() { this._colors.clear(); for(const geometry of this._planarLODs.values())geometry.dispose();this._planarLODs.clear(); }
  invalidate() { this._force=true; }
  setLighting(value) { this._lighting=value;this._colors.clear();this.invalidate(); }

  _geometry(source, object = null, perspective = false) {
    // Large wall faces span widely different camera depths. Subdividing only these
    // planar surfaces keeps their painter ordering local in eye-level views.
    // The scene's original/export geometry is never changed.
    if(perspective && object && source.type === 'BoxGeometry' && !source.userData?.physicalUV) {
      const p=source.parameters||{},m=object.matrixWorld.elements;
      const dimensions=[
        (p.width||1)*Math.hypot(m[0],m[1],m[2]),
        (p.height||1)*Math.hypot(m[4],m[5],m[6]),
        (p.depth||1)*Math.hypot(m[8],m[9],m[10])
      ];
      const planar=dimensions.filter(d=>d>.85).length>=2 && Math.min(...dimensions)<.45;
      if(planar) {
        const seg=dimensions.map(d=>d<.45?1:Math.min(32,Math.max(1,Math.ceil(d/.36))));
        const key=source.id+':'+seg.join(',');
        let lod=this._planarLODs.get(key);
        if(!lod) {
          lod=new THREE.BoxGeometry(p.width||1,p.height||1,p.depth||1,...seg);
          this._planarLODs.set(key,lod);
        }
        source=lod;
      }
    }
    let cache=this._geometries.get(source); if(cache)return cache;
    const p=source.parameters||{};
    let geometry=source;
    // Metric UVs and sculpted primitive vertices must survive fallback LOD.
    if(!source.userData?.physicalUV)switch(source.type){
      case 'RoundedBoxGeometry': geometry=new RoundedBoxGeometry(p.width,p.height,p.depth,1,p.radius);break;
      case 'SphereGeometry': geometry=new THREE.SphereGeometry(p.radius,10,6,p.phiStart,p.phiLength,p.thetaStart,p.thetaLength);break;
      case 'CylinderGeometry': geometry=new THREE.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,12,1,p.openEnded,p.thetaStart,p.thetaLength);break;
      case 'TorusGeometry': geometry=new THREE.TorusGeometry(p.radius,p.tube,4,16,p.arc);break;
      case 'TubeGeometry': geometry=new THREE.TubeGeometry(p.path,10,p.radius,5,p.closed);break;
      case 'CircleGeometry': geometry=new THREE.CircleGeometry(p.radius,20,p.thetaStart,p.thetaLength);break;
    }
    const pos=geometry.attributes.position;
    if(!pos)return null;
    const indices=geometry.index?.array||null;
    const count=indices?.length||pos.count;
    const faces=[];
    let gi=0,groups=geometry.groups||[];
    for(let i=0;i+2<count;i+=3){
      while(gi<groups.length-1&&i>=groups[gi].start+groups[gi].count)gi++;
      faces.push([indices?indices[i]:i,indices?indices[i+1]:i+1,indices?indices[i+2]:i+2,groups[gi]?.materialIndex||0]);
    }
    geometry.computeBoundingSphere();
    cache={position:pos.array,normal:geometry.attributes.normal?.array||null,uv:geometry.attributes.uv?.array||null,faces,count:pos.count,geometry};
    this._geometries.set(source,cache);this.info.memory.geometries++;
    return cache;
  }
  _world(object,geo) {
    let cache=this._objects.get(object);
    const m=object.matrixWorld.elements;
    if(!cache||cache.geo!==geo){cache={geo,matrix:[],world:new Float64Array(geo.count*3),projected:new Float64Array(geo.count*4),normals:new Float32Array(geo.faces.length*3),smoothNormals:new Float32Array(geo.count*3)};this._objects.set(object,cache);}
    let changed=cache.matrix.length!==16;
    if(!changed)for(let i=0;i<16;i++)if(cache.matrix[i]!==m[i]){changed=true;break;}
    if(changed){
      const src=geo.position,w=cache.world;
      for(let i=0;i<src.length;i+=3){const x=src[i],y=src[i+1],z=src[i+2];w[i]=m[0]*x+m[4]*y+m[8]*z+m[12];w[i+1]=m[1]*x+m[5]*y+m[9]*z+m[13];w[i+2]=m[2]*x+m[6]*y+m[10]*z+m[14];}
      if(geo.normal){
        const matrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld),e=matrix.elements,n=geo.normal,out=cache.smoothNormals;
        for(let i=0;i<n.length;i+=3){const x=n[i],y=n[i+1],z=n[i+2],nx=e[0]*x+e[3]*y+e[6]*z,ny=e[1]*x+e[4]*y+e[7]*z,nz=e[2]*x+e[5]*y+e[8]*z,len=Math.hypot(nx,ny,nz)||1;out[i]=nx/len;out[i+1]=ny/len;out[i+2]=nz/len;}
      }
      for(let f=0;f<geo.faces.length;f++){
        const face=geo.faces[f],a=face[0]*3,b=face[1]*3,c=face[2]*3;
        const ux=w[b]-w[a],uy=w[b+1]-w[a+1],uz=w[b+2]-w[a+2],vx=w[c]-w[a],vy=w[c+1]-w[a+1],vz=w[c+2]-w[a+2];
        let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const len=Math.hypot(nx,ny,nz)||1;
        cache.normals[f*3]=nx/len;cache.normals[f*3+1]=ny/len;cache.normals[f*3+2]=nz/len;
      }
      cache.matrix=Array.from(m);
    }
    return cache;
  }
  _color(material,nx,ny,nz) {
    const unlit=material.isMeshBasicMaterial;
    const evening=this._lighting==='evening';
    const diffuse=Math.max(0,nx*this._light.x+ny*this._light.y+nz*this._light.z);
    const specular=(1-(material.roughness??1))*.10*Math.pow(Math.max(0,ny*.85+nx*.30+nz*.30),12);
    const lit=unlit?1:Math.min(1.15,(evening?.34:.47)+.18*Math.max(0,ny)+(evening?.28:.42)*diffuse+.10*Math.max(0,nx*this._fill.x+ny*this._fill.y+nz*this._fill.z)+specular);
    const level=Math.round(lit*55)/55;
    const color=material.color||new THREE.Color('#c4c8bc');
    const key=color.getHex()+':'+level;
    let css=this._colors.get(key);
    if(!css){const c=color.clone().multiplyScalar(level);css=c.getStyle(THREE.SRGBColorSpace);this._colors.set(key,css);}
    return {css,light:lit};
  }
  _project(x,y,z) {
    const m=this._viewProjection.elements;
    const w=m[3]*x+m[7]*y+m[11]*z+m[15];
    return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w*this._width*.5+this._width*.5, -(m[1]*x+m[5]*y+m[9]*z+m[13])/w*this._height*.5+this._height*.5,(m[2]*x+m[6]*y+m[10]*z+m[14])/w,w];
  }
  _clip(poly,planes) {
    for(const plane of planes){
      const next=[];
      for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length];
        const da=plane[0]*a[0]+plane[1]*a[1]+plane[2]*a[2]+plane[3];
        const db=plane[0]*b[0]+plane[1]*b[1]+plane[2]*b[2]+plane[3];
        if(da>=-1e-8)next.push(a);
        if((da<0)!==(db<0)){const t=da/(da-db);next.push(a.map((v,k)=>v+(b[k]-v)*t));}
      }
      poly=next;if(poly.length<3)return [];
    }
    return poly;
  }

  render(scene,camera) {
    const now=performance.now();
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    let signature=camera.uuid+':'+this._viewProjection.elements.map(x=>x.toFixed(5)).join(',');
    const objects=[],lines=[];
    scene.traverseVisible(object=>{
      if(object.isGridHelper||object.name==='Studio background')return;
      if(object.isMesh&&object.geometry&&object.material){
        objects.push(object);
        signature+=';'+object.id+':'+object.matrixWorld.elements.map(x=>x.toFixed(4)).join(',');
      }else if((object.isLine||object.isLineSegments)&&!object.isGridHelper)lines.push(object);
    });
    signature+='|'+lines.map(o=>o.id).join(',');
    if(!this._force&&signature===this._signature)return;
    if(!this._force&&now-this._lastTime<45)return;
    this._force=false;this._signature=signature;this._lastTime=now;
    const ctx=this.context,r=this._pixelRatio,w=this._width,h=this._height;
    ctx.setTransform(r,0,0,r,0,0);ctx.globalAlpha=1;ctx.filter='none';
    ctx.fillStyle=scene.background?.isColor?scene.background.getStyle(THREE.SRGBColorSpace):'#eeece6';ctx.fillRect(0,0,w,h);
    const projected=this._viewProjection.elements,view=camera.matrixWorldInverse.elements;
    const cameraBack=new THREE.Vector3(0,0,1).transformDirection(camera.matrixWorld);
    const cameraPosition=new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const nearPlane=[-view[2],-view[6],-view[10],-view[14]-camera.near];
    const renderables=[];
    let meshCalls=0;
    for(const object of objects){
      const geo=this._geometry(object.geometry,object,camera.isPerspectiveCamera);if(!geo)continue;
      const cache=this._world(object,geo),world=cache.world,pp=cache.projected;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      const floors=object.userData.kind==='floor';
      const slab=object.name==='Continuous apartment slab';
      const shapeFloor=object.geometry.type==='ShapeGeometry';
      const floorRug=/rug/i.test(object.name);
      const priority=slab?0:floors?1:object.userData.kind==='contact-shadow'?1.08:floorRug?1.15:shapeFloor?1.3:2;
      for(let i=0;i<geo.count;i++){
        const k=i*3,j=i*4,x=world[k],y=world[k+1],z=world[k+2],pw=projected[3]*x+projected[7]*y+projected[11]*z+projected[15];
        pp[j]=(projected[0]*x+projected[4]*y+projected[8]*z+projected[12])/pw*w*.5+w*.5;
        pp[j+1]=-(projected[1]*x+projected[5]*y+projected[9]*z+projected[13])/pw*h*.5+h*.5;
        pp[j+2]=-(view[2]*x+view[6]*y+view[10]*z+view[14]);pp[j+3]=pw;
      }
      let drawn=false;
      for(let fi=0;fi<geo.faces.length;fi++){
        const face=geo.faces[fi],material=materials[face[3]]||materials[0];
        if(!material||!material.visible||material.opacity<=.005)continue;
        const ai=face[0],bi=face[1],ci=face[2],ia=ai*3,ib=bi*3,ic=ci*3;
        let nx=cache.normals[fi*3],ny=cache.normals[fi*3+1],nz=cache.normals[fi*3+2];
        let facing;
        if(camera.isPerspectiveCamera)facing=nx*(cameraPosition.x-world[ia])+ny*(cameraPosition.y-world[ia+1])+nz*(cameraPosition.z-world[ia+2]);
        else facing=nx*cameraBack.x+ny*cameraBack.y+nz*cameraBack.z;
        if(material.side===THREE.BackSide?facing>=0:material.side!==THREE.DoubleSide&&facing<=0)continue;
        if(facing<0){nx=-nx;ny=-ny;nz=-nz;}
        if(geo.normal&&!material.flatShading){
          const sn=cache.smoothNormals;nx=sn[ia]+sn[ib]+sn[ic];ny=sn[ia+1]+sn[ib+1]+sn[ic+1];nz=sn[ia+2]+sn[ib+2]+sn[ic+2];
          const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;if(facing<0){nx=-nx;ny=-ny;nz=-nz;}
        }
        const shaded=this._color(material,nx,ny,nz);
        const clip=material.clippingPlanes?.length?material.clippingPlanes.map(p=>[p.normal.x,p.normal.y,p.normal.z,p.constant]):[];
        const a4=ai*4,b4=bi*4,c4=ci*4;
        const minDepth=Math.min(pp[a4+2],pp[b4+2],pp[c4+2]);
        const maxDepth=Math.max(pp[a4+2],pp[b4+2],pp[c4+2]);
        if(maxDepth<camera.near||minDepth>camera.far)continue;
        if(minDepth<camera.near)clip.push(nearPlane);
        const uv=geo.uv;
        const makePoint=(i)=>[world[i*3],world[i*3+1],world[i*3+2],uv?.[i*2]||0,uv?.[i*2+1]||0];
        let polygons;
        if(clip.length){const poly=this._clip([makePoint(ai),makePoint(bi),makePoint(ci)],clip);if(poly.length<3)continue;polygons=[];for(let n=1;n<poly.length-1;n++)polygons.push([poly[0],poly[n],poly[n+1]]);}
        else polygons=null;
        const add=(points,uvs,depth,depths)=>{
          const x0=points[0],y0=points[1],x1=points[2],y1=points[3],x2=points[4],y2=points[5];
          if(Math.max(x0,x1,x2)<-3||Math.min(x0,x1,x2)>w+3||Math.max(y0,y1,y2)<-3||Math.min(y0,y1,y2)>h+3)return;
          if(Math.abs((x1-x0)*(y2-y0)-(y1-y0)*(x2-x0))<.08)return;
          renderables.push({type:'triangle',p:points,depth,z:depths,priority,css:shaded.css,opacity:material.opacity??1,transparent:material.transparent,light:shaded.light,texture:material.map?this._tintedTexture(material):null,uv:uvs});drawn=true;
        };
        if(polygons){for(const tri of polygons){const pr=tri.map(v=>this._project(v[0],v[1],v[2]));const dep=tri.reduce((s,v)=>s-(view[2]*v[0]+view[6]*v[1]+view[10]*v[2]+view[14]),0)/3;add([pr[0][0],pr[0][1],pr[1][0],pr[1][1],pr[2][0],pr[2][1]],tri.flatMap(v=>[v[3],v[4]]),dep,tri.map(v=>-(view[2]*v[0]+view[6]*v[1]+view[10]*v[2]+view[14])));}}
        else add([pp[a4],pp[a4+1],pp[b4],pp[b4+1],pp[c4],pp[c4+1]],uv?[uv[ai*2],uv[ai*2+1],uv[bi*2],uv[bi*2+1],uv[ci*2],uv[ci*2+1]]:null,(pp[a4+2]+pp[b4+2]+pp[c4+2])/3,[pp[a4+2],pp[b4+2],pp[c4+2]]);
      }
      if(drawn)meshCalls++;
    }
    renderables.sort((a,b)=>a.priority-b.priority||b.depth-a.depth);
    const triangles=this._renderDepth(renderables,scene.background,camera.isOrthographicCamera);
    ctx.globalAlpha=1;
    let lineCount=0;
    for(const object of lines){
      const pos=object.geometry.attributes.position;if(!pos)continue;
      const mat=object.material;if(!mat||mat.opacity<=0)continue;
      ctx.strokeStyle=(mat.color||new THREE.Color('#6d8474')).getStyle(THREE.SRGBColorSpace);ctx.globalAlpha=mat.opacity??1;
      ctx.lineWidth=Math.max(.8,mat.linewidth||1);ctx.lineCap='round';ctx.lineJoin='round';
      ctx.setLineDash(mat.isLineDashedMaterial?[3,3]:[]);
      const step=object.isLineSegments?2:1;
      for(let i=0;i<pos.count-1;i+=step){
        const p1=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(object.matrixWorld),p2=new THREE.Vector3().fromBufferAttribute(pos,i+1).applyMatrix4(object.matrixWorld);
        const x=this._project(p1.x,p1.y,p1.z),y=this._project(p2.x,p2.y,p2.z);if(x[3]<=0||y[3]<=0)continue;
        ctx.beginPath();ctx.moveTo(x[0],x[1]);ctx.lineTo(y[0],y[1]);ctx.stroke();lineCount++;
      }
    }
    ctx.setLineDash([]);ctx.globalAlpha=1;
    this.info.render={calls:meshCalls+lines.length,triangles,lines:lineCount,points:0};
  }

  _rgb(css) {
    let rgb=this._rgbColors.get(css);
    if(!rgb){rgb=(css.match(/[\d.]+/g)||[180,185,175]).slice(0,3).map(Number);this._rgbColors.set(css,rgb);}
    return rgb;
  }

  _tintedTexture(material) {
    let texture=this._materialTextures.get(material);if(texture)return texture;
    const original=material.map,image=original.image||original.source?.data;
    if(!image?.width)return original;
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const color=material.color||new THREE.Color('white');
    // Albedo maps are multiplied by the material's sRGB tint, preserving their alpha.
    if(color.getHex()!==0xffffff){
      const tint=color.clone().convertLinearToSRGB(),pixels=ctx.getImageData(0,0,canvas.width,canvas.height),p=pixels.data;
      for(let i=0;i<p.length;i+=4){p[i]*=tint.r;p[i+1]*=tint.g;p[i+2]*=tint.b;}ctx.putImageData(pixels,0,0);
    }
    texture={image:canvas,repeat:original.repeat,offset:original.offset,rotation:original.rotation,center:original.center};
    this._materialTextures.set(material,texture);return texture;
  }

  _sampleData(texture) {
    let sample=this._textureSamples.get(texture);if(sample)return sample;
    const image=texture.image||texture.source?.data;if(!image?.width)return null;
    const canvas=document.createElement('canvas'),scale=Math.min(1,512/image.width,512/image.height);
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    sample={pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
    this._textureSamples.set(texture,sample);return sample;
  }

  _renderDepth(items,background,orthographic=false) {
    // All views use per-pixel visibility, avoiding canvas edge seams and painter-order artifacts.
    // Inverse camera depth is
    // linear in screen-space barycentric coordinates, unlike camera depth.
    const scale=Math.min(orthographic?Math.max(1.35,this._pixelRatio):1,1600/this._width,1250/this._height);
    const width=Math.max(1,Math.round(this._width*scale)),height=Math.max(1,Math.round(this._height*scale));
    if(!this._depthCanvas){this._depthCanvas=document.createElement('canvas');this._depthContext=this._depthCanvas.getContext('2d');}
    if(this._depthCanvas.width!==width||this._depthCanvas.height!==height||!this._depthImage){
      this._depthCanvas.width=width;this._depthCanvas.height=height;
      this._depthImage=this._depthContext.createImageData(width,height);
      this._depthBuffer=new Float32Array(width*height);
    }
    const output=this._depthImage.data,zbuffer=this._depthBuffer;
    zbuffer.fill(orthographic?-Infinity:0);
    const bg=this._rgb(background?.isColor?background.getStyle(THREE.SRGBColorSpace):'rgb(238,236,230)');
    for(let i=0;i<output.length;i+=4){output[i]=bg[0];output[i+1]=bg[1];output[i+2]=bg[2];output[i+3]=255;}
    const sx=width/this._width,sy=height/this._height;
    const transparent=[];let count=0;
    const raster=(item,blend)=>{
      if(item.type!=='triangle'||!item.z)return;
      const p=item.p,x0=p[0]*sx,y0=p[1]*sy,x1=p[2]*sx,y1=p[3]*sy,x2=p[4]*sx,y2=p[5]*sy;
      const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
      if(Math.abs(den)<.005)return;
      const minX=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxX=Math.min(width-1,Math.ceil(Math.max(x0,x1,x2)));
      const minY=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxY=Math.min(height-1,Math.ceil(Math.max(y0,y1,y2)));
      if(maxX<minX||maxY<minY)return;
      const inv0=1/item.z[0],inv1=1/item.z[1],inv2=1/item.z[2];
      if(!Number.isFinite(inv0+inv1+inv2)||Math.min(inv0,inv1,inv2)<=0)return;
      const aw=(y1-y2)/den,bw=(x2-x1)/den,cw=(y2-y0)/den,dw=(x0-x2)/den;
      let rowA=((y1-y2)*(minX+.5-x2)+(x2-x1)*(minY+.5-y2))/den;
      let rowB=((y2-y0)*(minX+.5-x2)+(x0-x2)*(minY+.5-y2))/den;
      let color=this._rgb(item.css);
      const tex=item.texture&&item.uv?this._sampleData(item.texture):null,uv=item.uv;
      const light=Math.min(1.1,item.light),tr=item.texture?.repeat||{x:1,y:1},to=item.texture?.offset||{x:0,y:0};
      const alpha=item.opacity;
      for(let y=minY;y<=maxY;y++,rowA+=bw,rowB+=dw){
        let wa=rowA,wb=rowB,index=y*width+minX;
        for(let x=minX;x<=maxX;x++,index++,wa+=aw,wb+=cw){
          const wc=1-wa-wb;
          if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
          const iz=orthographic?-(wa*item.z[0]+wb*item.z[1]+wc*item.z[2]):wa*inv0+wb*inv1+wc*inv2;
          if(iz<=zbuffer[index]+.00000001)continue;
          const q=index*4;
          let red=color[0],green=color[1],blue=color[2],pixelAlpha=alpha;
          if(tex){
            const u=(orthographic?(wa*uv[0]+wb*uv[2]+wc*uv[4]):((wa*uv[0]*inv0+wb*uv[2]*inv1+wc*uv[4]*inv2)/iz))*tr.x+to.x;
            const v=(orthographic?(wa*uv[1]+wb*uv[3]+wc*uv[5]):((wa*uv[1]*inv0+wb*uv[3]*inv1+wc*uv[5]*inv2)/iz))*tr.y+to.y;
            const tx=Math.min(tex.width-1,Math.floor((u-Math.floor(u))*tex.width));
            const ty=Math.min(tex.height-1,Math.floor((1-(v-Math.floor(v)))*tex.height));
            const ti=(ty*tex.width+tx)*4;red=tex.pixels[ti]*light;green=tex.pixels[ti+1]*light;blue=tex.pixels[ti+2]*light;pixelAlpha*=tex.pixels[ti+3]/255;
          }
          if(blend||pixelAlpha<.999){const rest=1-pixelAlpha;output[q]=red*pixelAlpha+output[q]*rest;output[q+1]=green*pixelAlpha+output[q+1]*rest;output[q+2]=blue*pixelAlpha+output[q+2]*rest;}
          else{zbuffer[index]=iz;output[q]=red;output[q+1]=green;output[q+2]=blue;}
        }
      }
      count++;
    };
    for(const item of items){if(item.type!=='triangle')continue;if(item.opacity<.999||item.transparent)transparent.push(item);else raster(item,false);}
    // Transparent surfaces test against the opaque depth buffer but do not write
    // depth, so windows retain the visible furniture and room behind them.
    transparent.sort((a,b)=>b.depth-a.depth);
    for(const item of transparent)raster(item,true);
    this._depthContext.putImageData(this._depthImage,0,0);
    this.context.globalAlpha=1;this.context.imageSmoothingEnabled=true;
    this.context.drawImage(this._depthCanvas,0,0,this._width,this._height);
    return count;
  }

}
