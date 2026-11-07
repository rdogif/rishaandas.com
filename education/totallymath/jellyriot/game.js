(()=>{'use strict';
/* JELLY//RIOT: standalone, dependency-free WebGL + Canvas arcade.
   The SAME polygon coordinates drive rendering fallback, hit testing and custom cuts. */
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d',{alpha:true}),bg=$('backdrop'),bctx=bg.getContext('2d'),fxCanvas=$('screenFX'),fctx=fxCanvas.getContext('2d');
const glCanvas=$('gl');let W=innerWidth,H=innerHeight,S=80,DPR=1,mode='arcade',active=false,paused=false,menuVisible=true,score=0,best=0,timeLeft=60,health=3,charge=0,frenzy=0,combo=0,lastCut=-100,spawning=0,spawnId=0,shake=0,flash=0,slow=0,gameT=0,last=performance.now(),frame=0,quality=1;
const colors=[{name:'PUNCH',base:'#ff568e',light:'#ffd5e7',dark:'#791f66',rgb:[1,.23,.48]}, {name:'MINT',base:'#3ff3bf',light:'#d5fff2',dark:'#077c89',rgb:[.13,.96,.72]},{name:'TANGERINE',base:'#ffba51',light:'#fff2b6',dark:'#d35455',rgb:[1,.66,.18]}, {name:'ULTRAVIOLET',base:'#aa82ff',light:'#e8dcff',dark:'#4c3f9e',rgb:[.59,.36,1]},{name:'BLUEBERRY',base:'#51baff',light:'#d7f5ff',dark:'#2744a4',rgb:[.18,.61,1]}];
const TAU=Math.PI*2,rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),vec=(x,y)=>({x,y}),cross=(a,b)=>a.x*b.y-a.y*b.x;
const balls=[],pieces=[],particles=[],ripples=[],texts=[],links=[],trail=[],stars=Array.from({length:150},()=>({x:Math.random(),y:Math.random(),r:rand(.35,1.45),a:rand(.07,.32),phase:rand(0,TAU)}));
const toScreen=p=>({x:W*.5+p.x*S,y:H*.61-p.y*S}),toWorld=p=>({x:(p.x-W*.5)/S,y:(H*.61-p.y)/S});
function safeRead(k){try{return +(localStorage.getItem(k)||0)}catch{return 0}}function safeWrite(k,v){try{localStorage.setItem(k,String(v))}catch{}}
best=safeRead('jellyriot-best-v2');$('menuBest').textContent=best.toLocaleString();
function resize(){W=innerWidth;H=innerHeight;S=Math.min(W/(W<650?9.8:15.5),H/(W<650?12:9.2));DPR=Math.min(devicePixelRatio||1,matchMedia("(pointer: coarse)").matches?1.5:2)*Math.max(.75,quality);for(const c of [canvas,bg,fxCanvas]){c.width=Math.floor(W*DPR);c.height=Math.floor(H*DPR);c.style.width=W+'px';c.style.height=H+'px'}for(const c of [ctx,bctx,fctx])c.setTransform(DPR,0,0,DPR,0,0);setupGlSize();drawBackground();poolDirty=true}
addEventListener('resize',resize,{passive:true});
/* REAL GPU metaball visualization: smooth SDF unions. The targets remain individual
   game objects so pointer hit testing is reliable, even if their images fuse. */
let GL=null,glProgram=null,glBuffer=null,glUniforms=null,glReady=false,glPixel=1;
const vertexSource=`attribute vec2 aPoint;void main(){gl_Position=vec4(aPoint,0.0,1.0);}`;
const fragmentSource=`precision highp float;
uniform vec2 uResolution;uniform float uTime;uniform int uCount;uniform vec4 uBalls[14];uniform vec3 uColors[14];uniform float uPress[14];
float sdf(vec2 p,vec4 b,float phase){vec2 v=(p-b.xy);float ang=atan(v.y,v.x);float wave=1.0+.034*sin(3.0*ang+uTime*4.0+phase)+.022*sin(6.0*ang-uTime*3.2+phase);float r=b.z*wave;float typ=b.w;float d;
if(typ<.5){d=length(v)-r;}
else if(typ<1.5){vec2 a=abs(v);d=pow(pow(a.x,3.35)+pow(a.y,3.35),1.0/3.35)-r*.91;}
else if(typ<2.5){d=length(v)-r*(1.0+.10*cos(5.0*ang+phase*.6));}
else if(typ<3.5){d=length(v/vec2(1.19,.82))-r;}
else if(typ<4.5){d=length(v)-r*(1.0+.075*cos(6.0*ang+phase*.4));}
else{d=pow(pow(abs(v.x),1.42)+pow(abs(v.y),1.42),1.0/1.42)-r*.91;}
return d;}
float smoothUnion(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
void main(){vec2 p=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);float d=100000.0;float nearDist=100000.0;vec2 nearVec=vec2(0.0);float nearR=1.0;vec3 colorSum=vec3(0.0);float weights=0.0;float pressure=0.0;float localWave=0.0;
for(int i=0;i<14;i++){if(i>=uCount)break;vec4 b=uBalls[i];vec2 offset=abs(p-b.xy);if(max(offset.x,offset.y)>b.z*1.4+48.0)continue;float di=sdf(p,b,float(i)*1.73);float w=exp(-max(di,-38.0)/max(12.0,b.z*.22));colorSum+=uColors[i]*w;weights+=w;if(di<nearDist){nearDist=di;nearVec=(p-b.xy)/b.z;nearR=b.z;pressure=uPress[i];}d=smoothUnion(d,di,min(b.z*.32,26.0));}
if(d>38.0){gl_FragColor=vec4(0.0);return;}
vec3 col=colorSum/max(weights,.001);float inside=1.0-smoothstep(-2.0,1.6,d);float glow=exp(-max(d,0.0)*.12)*.18;
float rim=exp(-abs(d)*.10);vec2 g=vec2(dFdx(d),-dFdy(d));vec3 n=normalize(vec3(g.x,g.y,1.25));vec3 light=normalize(vec3(-.6,.9,1.45));float diffuse=clamp(dot(n,light),.0,1.0);float spec=pow(max(dot(reflect(-light,n),normalize(vec3(.0,.05,1.0))),0.0),21.0);
float upper=(1.0-nearVec.y)*.19;float center=1.0-clamp(length(nearVec),0.0,1.0);float stripes=.5+.5*sin(nearVec.x*14.0+nearVec.y*9.0+uTime*.45);float glitter=pow(max(0.0,sin(nearVec.x*37.0+float(uCount)*.3)*sin(nearVec.y*32.0-uTime*.7)),18.0)*.21;
vec3 shade=col*(.45+.58*diffuse+.27*center+.12*upper)+vec3(1.0,.96,.94)*(.68*spec+.38*rim)+col*stripes*.09+glitter;
float gloss=exp(-pow((nearVec.x+.34)*3.6,2.0)-pow((nearVec.y+.48)*5.0,2.0));shade+=vec3(1.0,1.0,1.0)*gloss*.5;
shade=mix(shade,shade*.8,clamp(pressure*.2,0.0,.25));float a=clamp(inside*.97+glow*.22,0.0,1.0);
vec3 outColor=mix(col*.22,shade,inside)+vec3(.12,.35,.32)*glow;gl_FragColor=vec4(outColor,a);
}`;
function compileShader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function initGL(){try{const gl=glCanvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false})||glCanvas.getContext('experimental-webgl');if(!gl)throw Error('No WebGL');const ext=gl.getExtension('OES_standard_derivatives');if(!ext)throw Error('WebGL derivatives unavailable');let frag='#extension GL_OES_standard_derivatives : enable\n'+fragmentSource;const prog=gl.createProgram();gl.attachShader(prog,compileShader(gl,gl.VERTEX_SHADER,vertexSource));gl.attachShader(prog,compileShader(gl,gl.FRAGMENT_SHADER,frag));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(prog,'aPoint');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);GL=gl;glProgram=prog;glBuffer=buffer;glUniforms={resolution:gl.getUniformLocation(prog,'uResolution'),time:gl.getUniformLocation(prog,'uTime'),count:gl.getUniformLocation(prog,'uCount'),balls:gl.getUniformLocation(prog,'uBalls[0]'),colors:gl.getUniformLocation(prog,'uColors[0]'),press:gl.getUniformLocation(prog,'uPress[0]')};glReady=true;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);setupGlSize();return true}catch(err){console.warn('GPU metaballs unavailable; using canvas jelly renderer:',err);glCanvas.style.display='none';glReady=false;return false}}
function setupGlSize(){if(!GL)return;glPixel=clamp(Math.min(DPR,1.15)*quality,.45,1.1);glCanvas.width=Math.max(1,Math.floor(W*glPixel));glCanvas.height=Math.max(1,Math.floor(H*glPixel));GL.viewport(0,0,glCanvas.width,glCanvas.height)}
const glBallData=new Float32Array(14*4),glColorData=new Float32Array(14*3),glPressData=new Float32Array(14);
function drawMetaballs() {
    if (!glReady) return;
    const gl = GL;
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let count = 0;
    let left = W, top = H, right = 0, bottom = 0;
    for (const b of active ? balls : previewBalls) {
        if (b.bomb || b.special || count >= 14) continue;
        const p = toScreen(b);
        const r = b.r * S * (b.wobbleScale || 1);
        const margin = r * 1.4 + 48 / glPixel;
        if (p.x + margin < 0 || p.x - margin > W || p.y + margin < 0 || p.y - margin > H) continue;
        glBallData.set([p.x * glPixel, p.y * glPixel, r * glPixel, b.type], count * 4);
        glColorData.set(b.color.rgb, count * 3);
        glPressData[count++] = b.press || 0;
        left = Math.min(left, p.x - margin);
        top = Math.min(top, p.y - margin);
        right = Math.max(right, p.x + margin);
        bottom = Math.max(bottom, p.y + margin);
    }
    if (!count) return;
    // Shade only the area that can contain jelly or its glow.
    const x = Math.max(0, Math.floor(left * glPixel));
    const y = Math.max(0, Math.floor((H - bottom) * glPixel));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, Math.min(glCanvas.width, Math.ceil(right * glPixel)) - x,
        Math.min(glCanvas.height, Math.ceil((H - top) * glPixel)) - y);
    gl.uniform2f(glUniforms.resolution, glCanvas.width, glCanvas.height);
    gl.uniform1f(glUniforms.time, gameT);
    gl.uniform1i(glUniforms.count, count);
    gl.uniform4fv(glUniforms.balls, glBallData);
    gl.uniform3fv(glUniforms.colors, glColorData);
    gl.uniform1fv(glUniforms.press, glPressData);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
/* Polygon geometry: every visible target has a precise underlying outline. */
function shapeRadius(type,a){if(type===0)return 1;if(type===1){const c=Math.cos(a),s=Math.sin(a);return .92/Math.pow(Math.pow(Math.abs(c),3.35)+Math.pow(Math.abs(s),3.35),1/3.35)}if(type===2)return 1+.10*Math.cos(5*a);if(type===3){const c=Math.cos(a)/1.19,s=Math.sin(a)/.82;return 1/Math.hypot(c,s)}if(type===4)return 1+.075*Math.cos(6*a);const c=Math.cos(a),s=Math.sin(a);return .92/Math.pow(Math.pow(Math.abs(c),1.42)+Math.pow(Math.abs(s),1.42),1/1.42)}
function shapePolygon(b,n=78,inflate=1){const points=[];const angle=b.angle||0,c=Math.cos(angle),s=Math.sin(angle),r=b.r*(b.wobbleScale||1)*inflate,press=b.press||0;for(let i=0;i<n;i++){const a=i*TAU/n,rad=shapeRadius(b.type,a)*r*(1+.025*Math.sin(3*a+gameT*5+b.phase)+.015*Math.cos(7*a-gameT*3+b.phase));let x=Math.cos(a)*rad*(1-press*.03),y=Math.sin(a)*rad*(1+press*.055);points.push({x:b.x+x*c-y*s,y:b.y+x*s+y*c})}return points}
function polygonArea(p){let a=0;for(let i=0;i<p.length;i++){const j=(i+1)%p.length;a+=cross(p[i],p[j])}return a*.5}
function pointInPoly(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes}
function segmentHits(p0,p1,poly){const result=[],delta={x:p1.x-p0.x,y:p1.y-p0.y};for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],edge={x:b.x-a.x,y:b.y-a.y},den=cross(delta,edge);if(Math.abs(den)<1e-8)continue;const d={x:a.x-p0.x,y:a.y-p0.y};const t=cross(d,edge)/den,u=cross(d,delta)/den;if(t>=-1e-7&&t<=1+1e-7&&u>=-1e-7&&u<=1+1e-7)result.push({t:clamp(t,0,1),p:{x:p0.x+delta.x*t,y:p0.y+delta.y*t},edge:i})}result.sort((a,b)=>a.t-b.t);return result.filter((h,i)=>i===0||Math.abs(h.t-result[i-1].t)>1e-5)}
function snapBoundary(p,poly){let best={distance:Infinity};for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],v={x:b.x-a.x,y:b.y-a.y},l=v.x*v.x+v.y*v.y||1,t=clamp(((p.x-a.x)*v.x+(p.y-a.y)*v.y)/l,0,1),point={x:a.x+t*v.x,y:a.y+t*v.y},d=dist(point,p);if(d<best.distance)best={p:point,edge:i,t,distance:d}}return best}
function simplifyPath(points,limit=22){if(points.length<=limit)return points;const p=[points[0]];for(let i=1;i<limit-1;i++){const k=Math.floor(i*(points.length-1)/(limit-1));p.push(points[k])}p.push(points.at(-1));return p}
function borderRoute(poly,start,end){const out=[start.p];let i=(start.edge+1)%poly.length,guard=0;while(i!==(end.edge+1)%poly.length&&guard++<poly.length){out.push(poly[i]);i=(i+1)%poly.length}out.push(end.p);return out}
function clipHalf(poly,a,b,sign){const dir={x:b.x-a.x,y:b.y-a.y},side=p=>cross(dir,{x:p.x-a.x,y:p.y-a.y})*sign,output=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],sp=side(p),sq=side(q);if(sp>=0)output.push(p);if((sp>0&&sq<0)||(sp<0&&sq>0)){const t=sp/(sp-sq);output.push({x:lerp(p.x,q.x,t),y:lerp(p.y,q.y,t)})}}return output}
function splitPolygon(poly,trace){let path=simplifyPath(trace);const e=snapBoundary(path[0],poly),x=snapBoundary(path.at(-1),poly);if(e.edge===x.edge||dist(e.p,x.p)<.12){return straightSplit(poly,path)}path=[e.p,...path.slice(1,-1),x.p];const route1=borderRoute(poly,e,x),route2=borderRoute(poly,x,e);const a=[...route1,...path.slice(1,-1).reverse()],b=[...route2,...path.slice(1,-1)];const initialArea=Math.abs(polygonArea(poly));if(a.length<3||b.length<3||Math.abs(polygonArea(a))<initialArea*.025||Math.abs(polygonArea(b))<initialArea*.025)return straightSplit(poly,path);return {pieces:[a,b],cutPath:path}}
function straightSplit(poly,path){const a=path[0],b=path.at(-1),partA=clipHalf(poly,a,b,1),partB=clipHalf(poly,a,b,-1);if(partA.length<3||partB.length<3)return null;const start=snapBoundary(a,poly).p,end=snapBoundary(b,poly).p;return {pieces:[partA,partB],cutPath:[start,end]}}
function centroid(poly){let x=0,y=0,a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],f=cross(p,q);x+=(p.x+q.x)*f;y+=(p.y+q.y)*f;a+=f}if(Math.abs(a)<1e-5)return {x:poly.reduce((v,p)=>v+p.x,0)/poly.length,y:poly.reduce((v,p)=>v+p.y,0)/poly.length};return {x:x/(3*a),y:y/(3*a)}}
/* Stylized liquid deposition: overlapping drops accumulate in one persistent scalar field.
   The paint pixels use the value of the SUM, not separate circles. */
const PCW=512,PCH=162,poolField=new Float32Array(PCW*PCH),poolCanvas=document.createElement('canvas');poolCanvas.width=PCW;poolCanvas.height=PCH;const pc=poolCanvas.getContext('2d');let poolDirty=true,depCount=0;
function deposit(x,z,r=.20,energy=1){const cx=PCW*(.5+x/17),cy=PCH*(.45+z*.18),rx=clamp(r*PCW/17,2,PCW*.12),ry=rx*.7,reach=3.1;const x0=Math.max(1,Math.floor(cx-rx*reach)),x1=Math.min(PCW-2,Math.ceil(cx+rx*reach)),y0=Math.max(1,Math.floor(cy-ry*reach)),y1=Math.min(PCH-2,Math.ceil(cy+ry*reach));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d2=((x-cx)/rx)**2+((y-cy)/ry)**2;if(d2<8)poolField[y*PCW+x]+=energy*1.4*Math.exp(-1.65*d2)}poolDirty=true;depCount++}
function groundSplash(x,z=0,r=.20,n=6){deposit(x,z,r);for(let i=0;i<n;i++){const a=rand(0,TAU),q=rand(.18,.65);deposit(x+Math.cos(a)*q,z+Math.sin(a)*q*.9,rand(.04,.11),.48)}}
function rebuildPool(){if(!poolDirty)return;poolDirty=false;const img=pc.createImageData(PCW,PCH),px=img.data;for(let y=1;y<PCH-1;y++)for(let x=1;x<PCW-1;x++){const i=y*PCW+x,f=poolField[i],edge=clamp((f-.31)*5,0,1),deep=clamp((f-.65)*.4,0,1),highlight=clamp((f-poolField[i-PCW])*1.8,0,1),j=i*4;if(!edge)continue;px[j]=Math.round(208-deep*103+highlight*45);px[j+1]=Math.round(25-deep*13+highlight*35);px[j+2]=Math.round(68-deep*31+highlight*34);px[j+3]=Math.round(237*edge)}pc.putImageData(img,0,0)}
/* Visual systems */
const scenery = document.createElement('canvas');
const vignette = document.createElement('canvas');
let backgroundWidth = 0, backgroundHeight = 0;
function drawBackground() {
    if (backgroundWidth !== bg.width || backgroundHeight !== bg.height) {
        backgroundWidth = bg.width;
        backgroundHeight = bg.height;
        buildBackground();
        scenery.width = bg.width;
        scenery.height = bg.height;
        scenery.getContext('2d').drawImage(bg, 0, 0);
        vignette.width = bg.width;
        vignette.height = bg.height;
        const vctx = vignette.getContext('2d');
        vctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const vig = vctx.createRadialGradient(W*.5,H*.52,Math.min(W,H)*.13,W*.5,H*.5,Math.max(W,H)*.85);
        vig.addColorStop(0, '#00000000');
        vig.addColorStop(1, '#040714a0');
        vctx.fillStyle = vig;
        vctx.fillRect(0, 0, W, H);
        poolDirty = true;
    }
    if (!poolDirty) return;
    rebuildPool();
    bctx.clearRect(0, 0, W, H);
    bctx.drawImage(scenery, 0, 0, W, H);
    bctx.globalAlpha = .96;
    bctx.drawImage(poolCanvas, 0, H*.765, W, H*.245);
    bctx.globalAlpha = 1;
    bctx.drawImage(vignette, 0, 0, W, H);
}
function buildBackground(){bctx.clearRect(0,0,W,H);let g=bctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#081326');g.addColorStop(.55,'#0d1730');g.addColorStop(1,'#100f27');bctx.fillStyle=g;bctx.fillRect(0,0,W,H);
 const halo=bctx.createRadialGradient(W*.49,H*.47,10,W*.49,H*.45,Math.max(W,H)*.6);halo.addColorStop(0,'#25486b75');halo.addColorStop(.34,'#14335945');halo.addColorStop(1,'#08112600');bctx.fillStyle=halo;bctx.fillRect(0,0,W,H);
 for(const s of stars){bctx.globalAlpha=s.a;bctx.fillStyle='#b9e6ff';bctx.beginPath();bctx.arc(s.x*W,s.y*H*.83,s.r,0,TAU);bctx.fill()}bctx.globalAlpha=1;
 const horizon=H*.75;bctx.fillStyle='#070c1b77';bctx.fillRect(0,horizon,W,H-horizon);bctx.beginPath();bctx.moveTo(0,horizon);bctx.lineTo(W,horizon);bctx.lineWidth=2;bctx.strokeStyle='#51e6ef4e';bctx.shadowBlur=21;bctx.shadowColor='#51e6ef';bctx.stroke();bctx.shadowBlur=0;
 bctx.save();bctx.beginPath();bctx.rect(0,horizon,W,H-horizon);bctx.clip();const vanX=W*.5,vanY=horizon-8;bctx.lineWidth=1;for(let i=-25;i<=25;i++){const bx=W*.5+i*W/12;bctx.beginPath();bctx.moveTo(vanX,vanY);bctx.lineTo(bx,H*1.15);bctx.strokeStyle=i%5===0?'#4cebf42b':'#4ae2f419';bctx.stroke()}for(let i=0;i<18;i++){const y=horizon+(H-horizon)*((i/18)**1.7);bctx.beginPath();bctx.moveTo(0,y);bctx.lineTo(W,y);bctx.strokeStyle='#6afcff'+(i%3===0?'30':'15');bctx.stroke()}bctx.restore();
 // Side pylons and sci-fi observatory detailing.
 bctx.fillStyle='#79b8f20a';for(let i=0;i<6;i++){const x=W*(.1+i*.16);bctx.fillRect(x,H*.2,1,H*.55)}bctx.strokeStyle='#9ef5ff16';bctx.lineWidth=1;bctx.beginPath();bctx.ellipse(W*.5,H*.82,W*.31,H*.065,0,0,TAU);bctx.stroke();bctx.beginPath();bctx.ellipse(W*.5,H*.825,W*.38,H*.095,0,0,TAU);bctx.stroke();
}

function drawDynamicBg(){const t=gameT;ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<3;i++){const x=W*(.25+i*.28),y=H*(.22+Math.sin(t*.45+i)*.05);const radius=Math.min(W,H)*(.22+i*.055),grad=ctx.createRadialGradient(x,y,0,x,y,radius);grad.addColorStop(0,i===1?'#7ffffd0a':'#ff6cbe09');grad.addColorStop(1,'#00000000');ctx.fillStyle=grad;ctx.fillRect(x-radius,y-radius,radius*2,radius*2)}ctx.restore();
 ctx.save();ctx.translate(W*.5,H*.45);ctx.rotate(Math.sin(t*.14)*.1);ctx.strokeStyle='#8dd7ee15';ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,0,Math.min(W*.35,490)+i*50,Math.min(H*.33,290)+i*50,0,0,TAU);ctx.stroke()}ctx.restore();
}
function makeParticle(x,y,vx,vy,kind='juice',color='#ff4e83',size=rand(.026,.075),life=rand(.45,1.15)){if(particles.length>400)particles.shift();particles.push({x,y,vx,vy,kind,color,size,life,max:life,angle:rand(0,TAU),spin:rand(-5,5),z:rand(-1,1),bounce:0})}
function burstAt(x,y,color,amount=26,blood=false){for(let i=0;i<amount;i++){const a=rand(0,TAU),speed=rand(1.5,7.3);makeParticle(x,y,Math.cos(a)*speed,Math.sin(a)*speed+1.5,blood?'syrup':(Math.random()<.35?'shard':'spark'),blood?['#ff416b','#dc1646','#ff91a5'][i%3]:color,rand(.018,.09),rand(.45,1.65))}ripples.push({x,y,r:.1,life:.55,max:.55,color:blood?'#ff657e':color})}
function addToast(x,y,text,color='#8ffff1',sub=false){const p=toScreen({x,y});const el=document.createElement('div');el.className='toast'+(sub?' sub':'');el.textContent=text;el.style.left=clamp(p.x,85,W-85)+'px';el.style.top=clamp(p.y,85,H-85)+'px';el.style.color=color;$('toastLayer').appendChild(el);setTimeout(()=>el.remove(),760)}
function updateHUD(){const num=String(Math.floor(score)).padStart(5,'0');$('scoreNum').textContent=num;$('timerNum').textContent=mode==='zen'?'∞':String(Math.max(0,Math.ceil(timeLeft)));$('timerNum').classList.toggle('danger',timeLeft<10&&mode!=='zen');$('health').textContent='♥ '.repeat(Math.max(0,health)).trim()||'—';$('bestScore').textContent='BEST '+String(best).padStart(5,'0');$('feverFill').style.width=(frenzy>0?100:Math.floor(charge))+'%';$('feverPct').textContent=frenzy>0?'FEVER!':Math.floor(charge)+'%';$('feverTrack').classList.toggle('hot',frenzy>0);$('comboLarge').textContent='×'+Math.min(8,combo);$('comboWidget').classList.toggle('show',combo>=2&&gameT-lastCut<1.8);$('badgeMode').textContent=mode==='zen'?'ZEN ∞':'ARCADE'}
/* Simple synthesized audio. Nothing downloads and sounds only begin on a user gesture. */
let audio=null,soundOn=true;function ensureAudio(){try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume()}catch{}}
function tone(freq,duration=.12,kind='sine',gain=.05,change=0){if(!soundOn||!audio)return;try{let osc=audio.createOscillator(),vol=audio.createGain();osc.type=kind;osc.frequency.setValueAtTime(freq,audio.currentTime);if(change)osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq+change),audio.currentTime+duration);vol.gain.setValueAtTime(Math.max(.0001,gain),audio.currentTime);vol.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);osc.connect(vol);vol.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration+.01)}catch{}}
function playSound(type){if(type==='slice'){tone(rand(400,600),.13,'triangle',.065,350);tone(180,.10,'sine',.045,-130)}else if(type==='perfect'){tone(670,.14,'sine',.06,260);setTimeout(()=>tone(1000,.2,'sine',.047,210),60)}else if(type==='bomb'){tone(140,.33,'sawtooth',.12,-100);tone(72,.39,'triangle',.10,-52)}else if(type==='pickup'){tone(510,.17,'triangle',.07,240);setTimeout(()=>tone(880,.24,'sine',.065,230),120)}else if(type==='bounce'){tone(120,.08,'sine',.012,60)}else if(type==='frenzy'){[390,520,690,900].forEach((n,i)=>setTimeout(()=>tone(n,.26,'sine',.046,70),i*85))}}
/* Targets and the simulation */
const previewBalls=[{x:-2.1,y:.5,r:.85,type:2,color:colors[0],angle:0,phase:0,vx:0,vy:0},{x:-.92,y:.78,r:.82,type:1,color:colors[1],angle:0,phase:1,vx:0,vy:0},{x:1.7,y:.0,r:1.03,type:4,color:colors[3],angle:0,phase:2,vx:0,vy:0}];
function launch(extra=false){const n=balls.length;if(n>=13)return;const isBomb=Math.random()<(frenzy>0?.07:.125),special=!isBomb&&Math.random()<.085?(Math.random()<.55?'star':'clock'):null;const bound=Math.min(6,Math.max(2.6,W/(2*S)-.8));const b={id:spawnId++,x:rand(-bound,bound),y:-4.0-rand(0,.2),z:rand(-.3,.3),r:rand(.55,.9),type:Math.floor(rand(0,6)),color:colors[Math.floor(rand(0,colors.length))],vx:rand(-1.8,1.8),vy:rand(10.8,14.1),angle:rand(-.5,.5),omega:rand(-.85,.85),phase:rand(0,TAU),life:0,wobbleScale:1,press:0,bomb:isBomb,special,cut:null,glow:0,tail:[]};if(b.special)b.r=.65;if(b.bomb)b.r=.72;b.x=clamp(b.x,-bound,bound);balls.push(b);if(extra)b.vy+=rand(-.6,.4)}
function spawnWave(){const count=Math.random()<.32?3:Math.random()<.68?2:1;for(let i=0;i<count;i++)launch(i>0);spawning=rand(.5,.9)*(frenzy>0?.64:1)*clamp(1.1-score/2800,.58,1)}
function drawBomb(b){const p=toScreen(b),r=b.r*S;if(p.x<-r||p.x>W+r||p.y<-r||p.y>H+r)return;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-b.angle);ctx.scale(1+.03*Math.sin(gameT*5+b.phase),1-.03*Math.sin(gameT*5+b.phase));
 let glow=ctx.createRadialGradient(0,0,r*.25,0,0,r*2);glow.addColorStop(0,'#ff725822');glow.addColorStop(1,'#ff724400');ctx.fillStyle=glow;ctx.fillRect(-r*2,-r*2,r*4,r*4);
 ctx.shadowColor='#000d';ctx.shadowBlur=18;ctx.shadowOffsetY=13;const base=ctx.createRadialGradient(-r*.43,-r*.45,r*.05,r*.13,r*.15,r*1.6);base.addColorStop(0,'#79889f');base.addColorStop(.18,'#353e54');base.addColorStop(.65,'#121c2a');base.addColorStop(1,'#030813');ctx.fillStyle=base;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.save();ctx.beginPath();ctx.arc(0,0,r*.985,0,TAU);ctx.clip();ctx.rotate(-.23);ctx.fillStyle='#2d3440';ctx.fillRect(-r*1.1,-r*.2,r*2.2,r*.34);for(let i=-3;i<=3;i++){ctx.fillStyle=i%2===0?'#f9bc3c':'#171e27';ctx.beginPath();ctx.moveTo(i*r*.4,-r*.2);ctx.lineTo((i+1)*r*.4,-r*.2);ctx.lineTo(i*r*.4,r*.14);ctx.lineTo((i-1)*r*.4,r*.14);ctx.fill()}ctx.restore();
 ctx.strokeStyle='#b7c6dc77';ctx.lineWidth=Math.max(2,r*.055);ctx.beginPath();ctx.arc(0,0,r*.93,Math.PI*.9,Math.PI*1.9);ctx.stroke();ctx.strokeStyle='#000b';ctx.lineWidth=r*.09;ctx.beginPath();ctx.arc(0,0,r*.95,0,Math.PI);ctx.stroke();
 // Fuse collar, lit wick and sparks — classic cartoon game bomb.
 const cap=ctx.createLinearGradient(-r*.22,0,r*.22,0);cap.addColorStop(0,'#637387');cap.addColorStop(.5,'#dce2e5');cap.addColorStop(1,'#4a5563');ctx.fillStyle=cap;ctx.beginPath();ctx.roundRect(-r*.23,-r*1.04,r*.46,r*.22,r*.07);ctx.fill();ctx.strokeStyle='#bba488';ctx.lineWidth=r*.065;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-r*1.04);ctx.bezierCurveTo(-r*.05,-r*1.3,r*.2,-r*1.43,r*.18,-r*1.58);ctx.stroke();const fx=r*.18,fy=-r*1.58;ctx.fillStyle='#ffdf81';ctx.shadowColor='#ffa344';ctx.shadowBlur=20;ctx.beginPath();ctx.arc(fx,fy,r*(.095+.04*Math.sin(gameT*24+b.phase)),0,TAU);ctx.fill();ctx.shadowBlur=0;for(let i=0;i<4;i++){const a=gameT*10+i*TAU/4+b.phase;ctx.fillStyle=i%2?'#ffd769':'#ff804e';ctx.fillRect(fx+Math.cos(a)*r*.18,fy+Math.sin(a)*r*.18,Math.max(2,r*.045),Math.max(2,r*.045))}
 // Emergency LED and center logo.
 ctx.fillStyle='#ff4b68';ctx.shadowColor='#f15b71';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(r*.49,-r*.35,r*.087,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.font=`900 ${Math.floor(r*.44)}px system-ui`;ctx.textAlign='center';ctx.fillStyle='#ebf0ef';ctx.fillText('!',0,r*.2);ctx.restore()}
function drawSpecial(b){const p=toScreen(b),r=b.r*S;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(gameT*1.4+b.phase);ctx.shadowColor=b.special==='star'?'#ffd57d':'#9aefff';ctx.shadowBlur=27;const col=b.special==='star'?'#ffdf77':'#8aefff';ctx.fillStyle=col;const points=b.special==='star'?10:8;ctx.beginPath();for(let i=0;i<points;i++){const a=-Math.PI/2+i*TAU/points;const rad=i%2===0?r:r*.65;const x=rad*Math.cos(a),y=rad*Math.sin(a);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff4';ctx.lineWidth=3;ctx.stroke();ctx.rotate(-gameT*1.4-b.phase);ctx.fillStyle='#173040';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${r*.8}px system-ui`;ctx.fillText(b.special==='star'?'×2':'⌛',0,0);ctx.restore()}
function drawCanvasBridges(list){for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
 const a=list[i],b=list[j];if(a.bomb||b.bomb||a.special||b.special)continue;const ap=toScreen(a),bp=toScreen(b),dx=bp.x-ap.x,dy=bp.y-ap.y,d=Math.hypot(dx,dy),r1=a.r*S,r2=b.r*S,sum=r1+r2;if(d<Math.abs(r1-r2)*.32||d>sum*1.38||d<1)continue;
 const u={x:dx/d,y:dy/d},v={x:-u.y,y:u.x},t=clamp((sum*1.38-d)/(sum*.76),0,1),w=Math.min(r1,r2)*(.04+.65*t),start={x:ap.x+u.x*r1*.47,y:ap.y+u.y*r1*.47},end={x:bp.x-u.x*r2*.47,y:bp.y-u.y*r2*.47},cx=(start.x+end.x)*.5,cy=(start.y+end.y)*.5;
 ctx.save();ctx.shadowBlur=18;ctx.shadowColor=a.color.base;ctx.globalAlpha=.86;const fill=ctx.createLinearGradient(ap.x,ap.y,bp.x,bp.y);fill.addColorStop(0,a.color.base);fill.addColorStop(.48,a.color.light);fill.addColorStop(.52,b.color.light);fill.addColorStop(1,b.color.base);ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(start.x+v.x*w,start.y+v.y*w);ctx.bezierCurveTo(cx+v.x*w*1.1,cy+v.y*w*1.1,cx+v.x*w*1.1,cy+v.y*w*1.1,end.x+v.x*w,end.y+v.y*w);ctx.lineTo(end.x-v.x*w,end.y-v.y*w);ctx.bezierCurveTo(cx-v.x*w*1.1,cy-v.y*w*1.1,cx-v.x*w*1.1,cy-v.y*w*1.1,start.x-v.x*w,start.y-v.y*w);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#ffffff38';ctx.lineWidth=2;ctx.stroke();ctx.restore();
 }}
function drawPressureMark(b){if(!b.cut||b.cut.path.length<2)return;const pts=b.cut.path,p=pts.at(-1),s=toScreen(p);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();pts.forEach((v,i)=>{const q=toScreen(v);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.shadowColor='#061931';ctx.shadowBlur=13;ctx.lineWidth=15;ctx.strokeStyle='rgba(3,27,51,.36)';ctx.stroke();ctx.shadowBlur=0;ctx.lineWidth=2.5;ctx.strokeStyle='#e7fff7ae';ctx.stroke();const glow=ctx.createRadialGradient(s.x-5,s.y-5,0,s.x,s.y,Math.max(11,20*b.press));glow.addColorStop(0,'#fff8');glow.addColorStop(.43,'#ecfffa33');glow.addColorStop(1,'#ffffff00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(11,20*b.press),0,TAU);ctx.fill();ctx.restore()}
function drawJellyFallback(b){const p=toScreen(b),r=b.r*S,poly=shapePolygon(b);ctx.save();ctx.beginPath();poly.forEach((v,i)=>{const q=toScreen(v);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath();ctx.shadowColor=b.color.base;ctx.shadowBlur=15;const g=ctx.createRadialGradient(p.x-r*.33,p.y-r*.42,r*.02,p.x,p.y,r*1.35);g.addColorStop(0,'#ffffff');g.addColorStop(.09,b.color.light);g.addColorStop(.33,b.color.base);g.addColorStop(.83,b.color.dark);g.addColorStop(1,'#142346');ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=b.color.light+'ad';ctx.lineWidth=3;ctx.stroke();ctx.save();ctx.clip();ctx.fillStyle='#ffffff66';ctx.beginPath();ctx.ellipse(p.x-r*.3,p.y-r*.45,r*.25,r*.14,-.65,0,TAU);ctx.fill();
// Embedded caustic ribbons, tiny pearlescent bubbles and a refractive outer rim.
ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-b.angle);ctx.lineCap='round';for(let k=0;k<3;k++){ctx.strokeStyle=k%2?'#ffffff23':b.color.light+'49';ctx.lineWidth=Math.max(1.1,r*.052);ctx.beginPath();const sy=-r*.48+k*r*.4;ctx.moveTo(-r*.85,sy);ctx.bezierCurveTo(-r*.42,sy-r*.18,r*.22,sy+r*.26,r*.82,sy-r*.08);ctx.stroke()}
for(let k=0;k<5;k++){const a=b.phase*1.3+k*2.399,rad=r*(.2+.09*(k%3)),x=Math.cos(a)*rad,y=Math.sin(a)*rad;ctx.fillStyle=k%2?'#ffffff59':'#d5fff7aa';ctx.beginPath();ctx.arc(x,y,Math.max(1.1,r*(.025+.014*(k%3))),0,TAU);ctx.fill()}ctx.restore();ctx.restore();ctx.restore()}
function drawDecorativeGleams(b){if(b.bomb||b.special)return;const p=toScreen(b),r=b.r*S;ctx.save();ctx.globalAlpha=.75;ctx.translate(p.x,p.y);ctx.rotate(-b.angle);const flicker=.8+.2*Math.sin(gameT*3+b.phase);ctx.strokeStyle=`rgba(255,255,255,${.26*flicker})`;ctx.lineWidth=Math.max(1.2,r*.023);ctx.beginPath();ctx.ellipse(-r*.18,-r*.31,r*.38,r*.16,-.55,3.7,5.45);ctx.stroke();const sparkX=r*.38+Math.sin(b.phase)*r*.15,sparkY=-r*.45;ctx.fillStyle='#ffffffbd';ctx.beginPath();ctx.arc(sparkX,sparkY,r*.028,0,TAU);ctx.fill();ctx.restore()}
function tracePath(points,offset=false){if(!points.length)return;for(let i=0;i<points.length;i++){const p=points[i];if(i===0)ctx.moveTo(p.x*S, -p.y*S+(offset||0));else ctx.lineTo(p.x*S,-p.y*S+(offset||0))}ctx.closePath()}
function pieceDraw(p){const screen=toScreen(p),sx=p.sx||1,sy=p.sy||1,maxR=p.radius*S;if(screen.x+maxR<0||screen.x-maxR>W||screen.y+maxR<0||screen.y-maxR>H)return;ctx.save();ctx.translate(screen.x,screen.y);ctx.rotate(-p.angle);ctx.scale(sx,sy);const path=p.points,c=p.color;
 // Viscous thickness/shadow along the bottom edge.
 ctx.beginPath();tracePath(path,Math.max(5,12*.6));const bk=ctx.createLinearGradient(0,-maxR,0,maxR);bk.addColorStop(0,c.dark);bk.addColorStop(1,'#10102f');ctx.fillStyle=bk;ctx.globalAlpha=.9;ctx.fill();ctx.globalAlpha=1;
 ctx.beginPath();tracePath(path);const gel=ctx.createRadialGradient(-maxR*.45,-maxR*.43,maxR*.02,maxR*.12,maxR*.16,maxR*1.65);gel.addColorStop(0,'#fffef0');gel.addColorStop(.13,c.light);gel.addColorStop(.41,c.base);gel.addColorStop(.82,c.dark);gel.addColorStop(1,'#19193e');ctx.fillStyle=gel;ctx.shadowColor=c.base+'90';ctx.shadowBlur=15;ctx.fill();ctx.shadowBlur=0;ctx.lineWidth=2;ctx.strokeStyle=c.light+'bd';ctx.stroke();
 ctx.save();ctx.clip();ctx.globalAlpha=.33;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(-maxR*.3,-maxR*.35,maxR*.32,maxR*.13,-.45,0,TAU);ctx.fill();ctx.globalAlpha=1;ctx.restore();
 // The cut follows the exact swipe trace, including bends; gel seam is never a fixed center line.
 if(p.cut.length>=2){ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();p.cut.forEach((v,i)=>{i?ctx.lineTo(v.x*S,-v.y*S):ctx.moveTo(v.x*S,-v.y*S)});ctx.shadowBlur=15;ctx.shadowColor='#ff526c';ctx.strokeStyle='#5c1239';ctx.lineWidth=Math.max(5,S*.095);ctx.stroke();ctx.strokeStyle='#ed366a';ctx.lineWidth=Math.max(3,S*.057);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffb6bd';ctx.lineWidth=Math.max(1.2,S*.023);ctx.stroke()}
 ctx.restore()}
function particleDraw(p){const q=toScreen(p),r=Math.max(1.3,p.size*S),alpha=clamp(p.life/p.max,0,1);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(p.angle);ctx.globalAlpha=alpha;if(p.kind==='shard'){ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=5;ctx.beginPath();ctx.moveTo(0,-r*1.3);ctx.lineTo(r*.5,r*.4);ctx.lineTo(-r*.35,r*.95);ctx.closePath();ctx.fill()}else if(p.kind==='spark'){ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=12;ctx.fillRect(-r*.5,-r*.5,r,r)}else{const g=ctx.createRadialGradient(-r*.25,-r*.3,0,0,0,r*1.1);g.addColorStop(0,'#ffc4d2');g.addColorStop(.27,p.color);g.addColorStop(1,'#8a1539');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,r*.75,r*1.1,.1,0,TAU);ctx.fill()}ctx.restore()}
function drawScene(){ctx.clearRect(0,0,W,H);drawDynamicBg();const jitterX=rand(-shake,shake)*S*.02,jitterY=rand(-shake,shake)*S*.02;ctx.save();ctx.translate(jitterX,jitterY);if(!glReady){const list=active?balls:previewBalls;drawCanvasBridges(list);for(const b of list)if(!b.bomb&&!b.special)drawJellyFallback(b)}else{for(const b of active?balls:previewBalls)drawDecorativeGleams(b)}for(const b of balls)if(!b.bomb&&!b.special)drawPressureMark(b);for(const b of balls){if(b.bomb)drawBomb(b);else if(b.special)drawSpecial(b)}for(const p of pieces)pieceDraw(p);for(const p of particles)particleDraw(p);
for(const r of ripples){const sc=toScreen(r);ctx.strokeStyle=r.color;ctx.lineWidth=2.2;ctx.globalAlpha=clamp(r.life/r.max,0,1)*.67;ctx.beginPath();ctx.arc(sc.x,sc.y,r.r*S,0,TAU);ctx.stroke();ctx.globalAlpha=1}ctx.restore();if(flash>0){ctx.fillStyle=`rgba(255,130,170,${flash*.12})`;ctx.fillRect(0,0,W,H)}}
/* Slice mechanics. Swipe is followed continuously; cut fires immediately upon EXIT,
   not on mouseup. Both curved paths and diagonals preserve their orientation. */
let pointerDown=false,lastPointer=null,pointerId=null;const slicedThisStroke=new Set();
function scoreCut(b,position,perfect){combo=gameT-lastCut<1.9?combo+1:1;lastCut=gameT;let mult=Math.min(combo,8),points=Math.round((12+Math.min(8,b.r*5))*(1+.32*(mult-1))*(frenzy>0?2:1));if(perfect)points+=18;score+=points;charge=clamp(charge+(perfect?17:9),0,100);if(charge>=100&&frenzy<=0){frenzy=8;charge=0;playSound('frenzy');addToast(0,2,'✦ FRENZY MODE ✦','#fff4a7');shake=17}if(perfect){playSound('perfect');addToast(position.x,position.y,'PERFECT CUT  +' + points,'#ffe38c')}else{playSound('slice');addToast(position.x,position.y,'+'+points,combo>=3?'#98fff0':'#ffb6c8',combo<3)}if(combo>1&&combo%4===0)addToast(position.x,position.y+.6,combo+' HIT COMBO','#97ffee',true);if(score>best){best=Math.floor(score);safeWrite('jellyriot-best-v2',best)}updateHUD()}
function createPiece(b,polygon,cutPath,side,normal){const c=centroid(polygon),area=Math.abs(polygonArea(polygon));const local=polygon.map(p=>({x:p.x-c.x,y:p.y-c.y})),cut=cutPath.map(p=>({x:p.x-c.x,y:p.y-c.y}));const radius=Math.max(.25,...local.map(v=>Math.hypot(v.x,v.y)));const p={x:c.x+normal.x*side*.055,y:c.y+normal.y*side*.055,points:local,cut,radius,color:b.color,area,angle:0,omega:rand(-3,3)+side*.9,vx:b.vx*.52+normal.x*side*rand(1.7,3.1),vy:b.vy*.4+normal.y*side*rand(1.7,3.1)+.7,age:0,phase:rand(0,TAU),sx:1,sy:1,shock:.36,rest:0,grounded:false,landingCooldown:0};pieces.push(p)}
function removeBall(b){const i=balls.indexOf(b);if(i>=0)balls.splice(i,1);slicedThisStroke.add(b.id)}
function splitBall(b,path){if(!balls.includes(b)||slicedThisStroke.has(b.id))return;let fullPoly=shapePolygon(b,88),trace=simplifyPath(path.filter((p,i)=>!i||dist(p,path[i-1])>.012),25);if(trace.length<2)return;const start=snapBoundary(trace[0],fullPoly),end=snapBoundary(trace.at(-1),fullPoly);if(dist(start.p,end.p)<b.r*.38)return;trace[0]=start.p;trace[trace.length-1]=end.p;
 const dir={x:trace.at(-1).x-trace[0].x,y:trace.at(-1).y-trace[0].y},length=Math.hypot(dir.x,dir.y);if(length<.1)return;const split=splitPolygon(fullPoly,trace);if(!split)return;const [a,other]=split.pieces,A=Math.abs(polygonArea(a)),B=Math.abs(polygonArea(other)),total=A+B;if(A/total<.015||B/total<.015)return;const mid=trace[Math.floor(trace.length/2)],normal={x:-dir.y/length,y:dir.x/length},perfect=Math.min(A,B)/total>.38;
 removeBall(b);const c1=centroid(a),c2=centroid(other);const sign1=Math.sign(cross(dir,{x:c1.x-mid.x,y:c1.y-mid.y}))||1,sign2=Math.sign(cross(dir,{x:c2.x-mid.x,y:c2.y-mid.y}))||-1;createPiece(b,a,split.cutPath,sign1,normal);createPiece(b,other,split.cutPath,sign2,normal);
 burstAt(mid.x,mid.y,'#ff5686',Math.min(55,26+Math.round(b.r*14)),true);burstAt(mid.x,mid.y,b.color.light,13,false);ripples.push({x:mid.x,y:mid.y,r:.1,life:.4,max:.4,color:b.color.base});shake=Math.min(14,shake+6);slow=Math.max(slow,perfect?.11:.035);scoreCut(b,mid,perfect);return true}
function bombStrike(b){if(!balls.includes(b))return;removeBall(b);shake=28;flash=1;burstAt(b.x,b.y,'#ff7450',78,false);for(let i=0;i<8;i++)ripples.push({x:b.x,y:b.y,r:i*.15,life:.55+i*.04,max:.55+i*.04,color:i%2?'#ffca6f':'#ff4876'});health=Math.max(0,health-1);combo=0;charge=Math.max(0,charge-15);playSound('bomb');addToast(b.x,b.y,'BOOM!  −1 LIFE','#ff799a');updateHUD();if(health===0&&mode==='arcade')setTimeout(()=>{if(active)finish(false)},430)}
function specialStrike(b){if(!balls.includes(b))return;removeBall(b);burstAt(b.x,b.y,b.special==='star'?'#ffe788':'#8eeafa',43);playSound('pickup');if(b.special==='clock'&&mode==='arcade'){timeLeft=Math.min(90,timeLeft+7);addToast(b.x,b.y,'+7 SECONDS','#9efaff')}else{score+=100;charge=clamp(charge+25,0,100);addToast(b.x,b.y,'BONUS +100','#ffe688');if(score>best){best=Math.floor(score);safeWrite('jellyriot-best-v2',best)}}updateHUD()}
function hitBall(b,path){if(b.bomb)bombStrike(b);else if(b.special)specialStrike(b);else splitBall(b,path)}
function recordSegment(a,b){const d=dist(a,b);if(d<.004)return;const hitPolygons=new Map();const steps=Math.min(14,Math.ceil(d/.12));for(let step=0;step<steps;step++){const p={x:lerp(a.x,b.x,step/steps),y:lerp(a.y,b.y,step/steps)},q={x:lerp(a.x,b.x,(step+1)/steps),y:lerp(a.y,b.y,(step+1)/steps)};testAgainstTargets(p,q,hitPolygons)}}
function testAgainstTargets(a,b,hitPolygons){for(const ball of balls.slice()){if(slicedThisStroke.has(ball.id))continue;
 const reach=ball.r*(ball.wobbleScale||1)*1.55;
 if(!ball.cut&&(Math.max(a.x,b.x)<ball.x-reach||Math.min(a.x,b.x)>ball.x+reach||Math.max(a.y,b.y)<ball.y-reach||Math.min(a.y,b.y)>ball.y+reach))continue;
 let poly=hitPolygons.get(ball);if(!poly){poly=shapePolygon(ball,72,1.11);hitPolygons.set(ball,poly)}const wasInside=pointInPoly(a,poly),isInside=pointInPoly(b,poly),hits=segmentHits(a,b,poly);let state=ball.cut;
 if(!state){if(wasInside){const back={x:a.x-(b.x-a.x)*10,y:a.y-(b.y-a.y)*10};const revHits=segmentHits(a,back,poly);const start=revHits.length?revHits[0].p:snapBoundary(a,poly).p;state={path:[start,a],distance:dist(start,a)};ball.cut=state}else if(hits.length){state={path:[hits[0].p],distance:0};ball.cut=state}}
 if(!state)continue;ball.press=clamp(ball.press+.18,0,1);
 if(!isInside){const out=hits.length?hits.at(-1).p:b;const lastP=state.path.at(-1);state.distance+=dist(lastP,out);state.path.push(out);ball.cut=null;ball.press=0;if(state.distance>=ball.r*.43&&state.path.length>=2)hitBall(ball,state.path)}else{const lastP=state.path.at(-1);state.distance+=dist(lastP,b);state.path.push(b);if(state.path.length>75)state.path.splice(1,1)}
 }}
function addTrailScreen(a,b){const d=dist(a,b);const segments=Math.max(1,Math.ceil(d/18));for(let i=0;i<segments;i++){const t=(i+1)/segments;trail.push({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),life:.32,max:.32})}if(trail.length>70)trail.splice(0,trail.length-70)}
function pointerPos(e){const box=canvas.getBoundingClientRect();return{x:e.clientX-box.left,y:e.clientY-box.top}}
canvas.addEventListener('pointerdown',e=>{if(!active||paused||pointerDown)return;if(e.button!==0&&e.pointerType==='mouse')return;ensureAudio();pointerDown=true;pointerId=e.pointerId;lastPointer=pointerPos(e);slicedThisStroke.clear();for(const b of balls){b.cut=null;b.press=0}trail.push({...lastPointer,life:.32,max:.32});try{canvas.setPointerCapture(e.pointerId)}catch{}e.preventDefault()});
canvas.addEventListener('pointermove',e=>{if(!pointerDown||!active||paused||pointerId!==e.pointerId)return;const p=pointerPos(e),from=lastPointer;if(!from)return;const change=Math.hypot(p.x-from.x,p.y-from.y);if(change>.5){addTrailScreen(from,p);recordSegment(toWorld(from),toWorld(p));lastPointer=p}e.preventDefault()});
function stopStroke(){pointerDown=false;pointerId=null;lastPointer=null;slicedThisStroke.clear();for(const b of balls){b.cut=null;b.press=0}}
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(pointerId===e.pointerId)stopStroke()});window.addEventListener('blur',()=>{stopStroke();if(active)pauseGame(true)});
function drawTrail(){fctx.clearRect(0,0,W,H);if(trail.length<2)return;fctx.save();fctx.lineCap='round';fctx.lineJoin='round';for(let i=1;i<trail.length;i++){const a=trail[i-1],b=trail[i],life=Math.min(a.life,b.life);if(life<=0)continue;const alpha=clamp(life/.32,0,1);fctx.globalAlpha=alpha*.9;fctx.shadowColor='#34fff4';fctx.shadowBlur=0;fctx.strokeStyle='#39e9f455';fctx.lineWidth=15*alpha;fctx.beginPath();fctx.moveTo(a.x,a.y);fctx.lineTo(b.x,b.y);fctx.stroke();fctx.shadowBlur=0;fctx.strokeStyle='#effffc';fctx.lineWidth=Math.max(.3,2.8*alpha);fctx.stroke()}fctx.restore()}
/* Cut halves have their own gravity, soft-body squash, bounce, friction and settling. */
const FLOOR_Y=-3.48;
function pieceLowestY(p){const c=Math.cos(p.angle),s=Math.sin(p.angle);let min=1e4;for(const v of p.points){const y=v.x*p.sx*s+v.y*p.sy*c;if(y<min)min=y}return min}
function physicsUpdate(dt){gameT+=dt;for(const b of balls.slice()){b.life+=dt;b.vy-=14.8*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.omega*dt;b.wobbleScale=1+.02*Math.sin(gameT*8+b.phase)+.012*Math.cos(gameT*13-b.phase);b.press=Math.max(0,b.press-dt*.28);if(b.x<-9||b.x>9||b.y<-6.1||b.life>7.6){const i=balls.indexOf(b);if(i>=0)balls.splice(i,1)}}
 for(let i=pieces.length-1;i>=0;i--){const p=pieces[i];p.age+=dt;p.landingCooldown=Math.max(0,p.landingCooldown-dt);p.vy-=15.1*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.omega*dt;const floor=FLOOR_Y-pieceLowestY(p);if(p.y<floor){p.y=floor;if(p.vy<-.7){const impact=-p.vy;p.vy=Math.min(7,impact*.35);p.shock=Math.min(.45,.11+impact*.02);if(p.landingCooldown<=0){groundSplash(p.x,rand(-.3,.6),rand(.26,.43),6);p.landingCooldown=.12;playSound('bounce')}}else p.vy=0;p.vx*=Math.exp(-2.7*dt);p.omega*=Math.exp(-3*dt);p.rest+=dt;p.grounded=true}else p.grounded=false;
 p.shock*=Math.exp(-11*dt);p.sx=1+.045*Math.sin(p.age*18+p.phase)*Math.exp(-p.age*.43)+p.shock*.42;p.sy=1-.028*Math.sin(p.age*18+p.phase)*Math.exp(-p.age*.43)-p.shock*.50;p.x=clamp(p.x,-8.5,8.5);if(p.age>9.5){pieces.splice(i,1)}}
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.age=(p.age||0)+dt;p.vy-=(p.kind==='syrup'?18:9.5)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;p.vx*=Math.exp(-.45*dt);if(p.kind==='syrup'&&p.y<=FLOOR_Y){deposit(p.x,p.z,rand(.105,.23),1.0);particles.splice(i,1);continue}if(p.life<=0)particles.splice(i,1)}
 for(let i=ripples.length-1;i>=0;i--){const r=ripples[i];r.life-=dt;r.r+=dt*5;if(r.life<=0)ripples.splice(i,1)}for(let i=trail.length-1;i>=0;i--){trail[i].life-=dt;if(trail[i].life<=0)trail.splice(i,1)}
 shake*=Math.exp(-10*dt);flash*=Math.exp(-7*dt);if(combo>=2&&gameT-lastCut>2.0)combo=0;
 if(mode==='arcade'){timeLeft-=dt;if(timeLeft<=0){timeLeft=0;finish(true);return}}if(frenzy>0)frenzy=Math.max(0,frenzy-dt);spawning-=dt;if(spawning<=0)spawnWave();
}
function showMenu(){menuVisible=true;$('menu').classList.remove('hidden');$('menu').style.display='grid'}
function hideMenu(){menuVisible=false;$('menu').classList.add('hidden')}
function resetGame(selected){mode=selected;ensureAudio();balls.length=0;pieces.length=0;particles.length=0;ripples.length=0;trail.length=0;poolField.fill(0);poolDirty=true;depCount=0;score=0;timeLeft=60;health=3;charge=0;frenzy=0;combo=0;lastCut=-100;gameT=0;slow=0;shake=0;flash=0;paused=false;active=true;spawning=.18;spawnId=0;hideMenu();$('pauseBadge').classList.remove('show');updateHUD();for(let i=0;i<3;i++)launch(true)}
function finish(byTime=true){if(!active)return;active=false;paused=false;stopStroke();$('menuHeading').innerHTML='<span>ROUND</span><br><strong>OVER.</strong>';$('menuEyebrow').textContent=byTime?'✦ TIME IS UP / GREAT RUN':'✦ LAB EXPERIMENT COMPLETE';$('menuText').innerHTML=`You scored <strong style="color:#a8fff1;font-size:24px">${Math.floor(score).toLocaleString()}</strong> points and sliced ${spawnId} flying targets. Your personal best is <strong style="color:#fff">${best.toLocaleString()}</strong>. Ready to break it?`;$('playBtn').textContent='PLAY AGAIN ↗';$('zenBtn').textContent='ZEN MODE ∞';$('menuBest').textContent=best.toLocaleString();showMenu();updateHUD()}
function pauseGame(value){if(!active)return;paused=value;$('pauseBadge').classList.toggle('show',paused);$('pauseBtn').textContent=paused?'▶':'Ⅱ';if(paused)stopStroke()}
$('playBtn').addEventListener('click',()=>resetGame('arcade'));$('zenBtn').addEventListener('click',()=>resetGame('zen'));
$('pauseBtn').addEventListener('click',()=>{ensureAudio();pauseGame(!paused)});
$('soundBtn').addEventListener('click',()=>{ensureAudio();soundOn=!soundOn;$('soundBtn').textContent=soundOn?'♪':'♪̸';$('soundBtn').title=soundOn?'Mute':'Unmute'});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='p'||e.key==='Escape'){if(active)pauseGame(!paused);e.preventDefault()}if(e.key.toLowerCase()==='m'){$('soundBtn').click()}});
let frameAverage = 16.7, qualityFrames = 0;
document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden && active) pauseGame(true);
});

function loop(now){requestAnimationFrame(loop);
 if(document.hidden){last=now;return}
 const elapsed=now-last;
 if(paused){last=now;return}
 if(!active&&elapsed<1000/30)return;
 if(active&&!paused&&elapsed<1000){
    frameAverage=frameAverage*.95+elapsed*.05;
    if(++qualityFrames>=45){
        qualityFrames=0;
        const next=clamp(quality+(frameAverage>23?-.15:frameAverage<18?.05:0),.55,1);
        if(next!==quality){quality=next;resize()}
    }
 }
 let dt=clamp((now-last)/1000,0,.038);last=now;frame++;if(active&&!paused){physicsUpdate(dt*(slow>0?.42:1));slow=Math.max(0,slow-dt)}else if(!active){gameT+=dt;for(let i=0;i<previewBalls.length;i++){const b=previewBalls[i];b.y=[.3,.7,.0][i]+Math.sin(gameT*1.5+i*2)*.25;b.x=[-2.4,-.85,1.6][i]+Math.cos(gameT*.9+i)*.13;b.angle=Math.sin(gameT*.6+i)*.18;b.wobbleScale=1+.04*Math.sin(gameT*2+i)}}
 drawBackground();drawMetaballs();drawScene();drawTrail();if(frame%5===0)updateHUD();}
// Browser support: when the GPU shader can't run, beautiful Canvas jelly targets take over.
initGL();resize();updateHUD();requestAnimationFrame(loop);
window.JellyRiotDebug={get state(){return{active,paused,score,balls:balls.map(b=>({x:b.x,y:b.y,r:b.r,bomb:b.bomb,type:b.type,special:b.special,id:b.id})),pieces:pieces.length,pieceData:pieces.map(p=>({cut:p.cut,area:p.area,angle:p.angle,x:p.x,y:p.y})),glReady,mode,health,frenzy}},start:()=>resetGame('arcade'),worldToScreen:toScreen,spawn:launch,spawnTest:(x,y,type=0,kind='jelly')=>{launch();const b=balls.at(-1);Object.assign(b,{x,y,type,r:1.0,vx:0,vy:0,bomb:kind==='bomb',special:kind==='star'?'star':null,omega:0});return b.id},clearTargets:()=>{balls.length=0;pieces.length=0}};
})();
