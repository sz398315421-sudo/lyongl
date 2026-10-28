window.__unseenPaused = false;
window.bootUnseenScene = async ({ o, n, c, m, tt, Lt, ws, co, l }) => {
  try {
    const initialContact=new URLSearchParams(location.search).get('view')==='contact';
    document.body.classList.toggle('home',!initialContact);
    Object.assign(o, window.globalData);
    const mobile=matchMedia('(max-width:600px), (pointer:coarse)').matches;
    const lowQuality=new URLSearchParams(location.search).get('quality')==='low';
    if(mobile||lowQuality)o.window.dpr=Math.min(o.window.dpr,lowQuality?1:1.25);
    const progress=(value,stage='assets')=>parent.postMessage({type:'unseen:progress',progress:value,stage},location.origin);
    progress(5,'scripts');
    // Cached assets can finish before the first renderer tick. Camera noise
    // needs a finite delta even when the scene starts paused behind another page.
    o.clockDelta = 0;
    o.ASScroll = { resize() {} };
    o.GlobalEvents = new c();
    o.RAFCollection = new m();
    // Continue shader time when the visible host temporarily drives rendering.
    // The iframe ticker itself may sleep while the transition canvas covers it.
    let sceneTimeOffset=0;
    const fire=o.RAFCollection.fire;
    n.off(o.events.RAF,fire);
    o.RAFCollection.fire=time=>fire(time+sceneTimeOffset);
    n.on(o.events.RAF,o.RAFCollection.fire);
    o.AssetLoader = new tt();
    if((mobile||lowQuality)&&o.AssetLoader.loadTexture&&o.AssetLoader.loadKtxTexture){
      // The mobile set is decoded once at authoring time. Native WebP loading
      // avoids downloading/compiling Basis WASM and transcoding large textures.
      const loadTexture=o.AssetLoader.loadTexture.bind(o.AssetLoader);
      const loadKtx=o.AssetLoader.loadKtxTexture.bind(o.AssetLoader);
      o.AssetLoader.loadTexture=(url,options)=>loadTexture(
        url.replace(/\/images\/matcap-white\.png(?:\?.*)?$/, '/images/mobile/matcap-white.webp?v=20261027-mobile-fast'),options);
      o.AssetLoader.loadKtxTexture=(url,options)=>{
        const mobileUrl=url.replace(/\/images\/home\/([^/?]+)\.ktx2(?:\?.*)?$/, '/images/mobile/$1.webp?v=20261027-mobile-fast');
        // Compressed GPU uploads ignore flipY. Keep the same UV orientation
        // when uploading their decoded image equivalents.
        return mobileUrl===url?loadKtx(url,options):loadTexture(mobileUrl,{...options,flipY:false});
      };
    }
    o.AssetLoader.dracoLoader?.setWorkerLimit?.(mobile?1:2);
    o.AssetLoader.ktxLoader?.setWorkerLimit?.(mobile?1:2);
    o.TextLoader = new tt({ name: 'TextLoader', progressEventName: 'TextLoaderProgress' });
    o.TaskScheduler = new co();
    o.Gl = new Lt(); o.Gl.addPasses();
    const button = document.querySelector('.scene-cta');
    ws.prototype.buildHtml = function () {
      Object.assign(this.dom, { viewProjectsBtn: button, contactContent: document.querySelector('.contact-content') });
      this.viewProjectsBtn3D = { element: button };
    };
    ws.prototype.updateHtmlScale = function () {};
    o.HomeContact = new ws();
    const onProgress=event=>progress(5+Math.min(100,event.percent)*.9);
    n.on('AssetsProgress',onProgress);
    try{
      const loaded=o.AssetLoader.load({ element: document.body });
      // The original loader's aggregate promise never rejects on asset failure.
      await Promise.all([loaded,...o.AssetLoader.promisesToLoad]);
    }finally{n.off('AssetsProgress',onProgress);}
    progress(95,'render');
    o.HomeContact.build();
    if(mobile||lowQuality){
      // The original scene reassigns these compressed-texture flags in build().
      for(const name of ['pearlMatcap','skymap']){
        const texture=o.HomeContact.assets?.textures[name];
        if(texture){texture.flipY=false;texture.needsUpdate=true;}
      }
    }
    window.applyCourtyardPalette(o);
    o.HomeContact.enable();
    o.HomeContact.homeTextMesh.material.uniforms.uOpacity.value = initialContact?0:1;
    o.HomeContact.homeTextMesh.material.uniforms.uProgress.value = 1;
    const home=o.HomeContact;
    // Touch keeps its native hit testing. Apply only the camera part of the
    // desktop cursor effect, without synthesizing mouse or fluid interactions.
    const tilt={x:0,y:0,targetX:0,targetY:0};
    const updateCamera=home.updateCameraPosition;
    home.updateCameraPosition=function(...args){
      updateCamera.apply(this,args);
      if(!o.isTouch)return;
      const ease=1-Math.exp(-Math.min(.05,Math.max(0,o.clockDelta||1/60))*5);
      tilt.x+=(tilt.targetX-tilt.x)*ease;tilt.y+=(tilt.targetY-tilt.y)*ease;
      if(!tilt.x&&!tilt.y)return;
      this.camera.translateZ(-this.options.cameraZOffset);
      this._e.set(tilt.y*this.options.mouseMoveAngleY,-tilt.x*this.options.mouseMoveAngleX,0);
      this._q.setFromEuler(this._e);this.camera.quaternion.multiply(this._q);
      this.camera.translateZ(this.options.cameraZOffset);this.camera.updateMatrixWorld();
    };
    await Promise.all([home.introText,home.line1,home.line2].filter(Boolean).map(text=>{
      if(text.textRenderInfo)return Promise.resolve();
      return new Promise(resolve=>{
        const complete=()=>{text.removeEventListener('synccomplete',complete);resolve();};
        text.addEventListener('synccomplete',complete);text.sync();
      });
    }));
    // Font workers complete independently from the render ticker. Rebuild the
    // native text target once all three lines are available, even without RAF.
    if(home.textScene&&home.textRT){
      o.Gl.renderer.setRenderTarget(home.textRT);o.Gl.renderer.clear();o.Gl.renderer.render(home.textScene,home.textCamera);o.Gl.renderer.setRenderTarget(null);
    }
    o.HomeContact.showUI();
    button.style.display=initialContact?'none':'flex';
    o.HomeContact.updateCameraPosition();
    window.store = o;
    let submerge = null, ascent = null,hostDriven=false,scenePaused=false,renderedFrames=0;
    const canvas = document.querySelector('#gl');
    const renderTransitionFrame = time => {
      // Run the same fluid, text, water and composer callbacks as the live hero.
      // A camera-only render freezes the water clock until the host resumes it.
      const paused=window.__unseenPaused;
      sceneTimeOffset=time-l.ZP.ticker.time;
      window.__unseenPaused=false;
      try{o.RAFCollection.fire(l.ZP.ticker.time);}
      finally{window.__unseenPaused=paused;}
      return canvas;
    };
    window.unseenScene = {
      setMotion(input) {
        tilt.targetX=input?.active?Math.max(-.65,Math.min(.65,input.x*.65)):0;
        tilt.targetY=input?.active?Math.max(-.65,Math.min(.65,-input.y*.65)):0;
      },
      // UNSEEN HomeContact → ProjectMenu timing and camera offsets (ko.out).
      // The host supplies its own portfolio scene, driven by this same GSAP clock.
      projectsTransition(state, draw, {returning=false,runTimeline,surfaceOffset=-(innerHeight/2)*5e-5,duration=returning?2.4:3,ease=returning?'power2.inOut':'power4.inOut'}={}) {
        const home=o.HomeContact;
        o.Gl.clock.getDelta();o.clockDelta=0;
        const sceneStart=l.ZP.ticker.time+sceneTimeOffset;
        const timeline=l.ZP.timeline({paused:true,defaults:{duration,ease},
          onUpdate:()=>{
            // GSAP rounds tiny world-space tween values into visible steps.
            // Tween normalized progress and derive the camera offset in full precision.
            home.tweenParams.cameraYOffset=surfaceOffset*state.progress;
            home.updateCameraPosition();
            draw(renderTransitionFrame(sceneStart+timeline.time()));
          },
        });
        timeline
          .fromTo(state,{progress:returning?1:0,cameraYOffset:returning?0:2*innerHeight},{progress:returning?0:1,cameraYOffset:returning?2*innerHeight:0},0);
        return runTimeline(timeline);
      },
      get view() {return o.HomeContact.isHome?'home':'about';},
      immersionMetrics() {
        const home=o.HomeContact;
        const baseHeight=home.cameraCurvePath.getPointAt(home.tweenParams.cameraPathProgress).y;
        return {clearance:Math.max(0,baseHeight-home.water.position.y)};
      },
      setView(view,{instant=false}={}) {
        const home=o.HomeContact,isHome=view==='home';
        home.isHome=isHome;document.body.classList.toggle('home',isHome);
        button.style.display='none';
        if(instant){
          l.ZP.killTweensOf(home.tweenParams);l.ZP.killTweensOf(home.homeTextMesh.material.uniforms.uOpacity);
          home.tweenParams.cameraPathProgress=isHome?1:0;home.tweenParams.cameraYOffset=0;home.homeTextMesh.material.uniforms.uOpacity.value=isHome?1:0;
          button.style.display=isHome?'flex':'none';home.updateCameraPosition();o.Gl.composer.render();return Promise.resolve();
        }
        l.ZP.to(home.homeTextMesh.material.uniforms.uOpacity,{value:isHome?1:0,duration:isHome?1.2:.8,delay:isHome?1.6:0,ease:'power2.inOut',overwrite:true});
        return new Promise(resolve=>{
          l.ZP.to(home.tweenParams,{cameraPathProgress:isHome?1:0,duration:3,ease:'power4.inOut',overwrite:true,onComplete:()=>{button.style.display=isHome?'flex':'none';resolve();}});
        });
      },
      capture() { o.Gl.composer.render(); return canvas; },
      setHostDriven(value) {
        hostDriven=value;
        window.__unseenPaused=scenePaused||hostDriven;
      },
      renderFrame(time,{validate=false}={}) {
        const gl=o.Gl.renderer.getContext?.();
        if(gl?.isContextLost())throw new Error('graphics-context-lost');
        // A phone WebView may stop its hidden iframe ticker. Advance both the
        // native tweens and scene callbacks from the visible parent's clock.
        window.__unseenPaused=true;
        l.ZP.ticker.tick();
        const source=renderTransitionFrame(time);
        if(validate&&gl?.readPixels){
          o.Gl.composer.render();
          const pixel=new Uint8Array(4);let visible=false;
          for(const [x,y] of [[.25,.75],[.75,.75],[.5,.25]]){
            gl.readPixels(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
            if(pixel[3]&&pixel[0]+pixel[1]+pixel[2]>0)visible=true;
          }
          if(!visible)throw new Error('empty-render-frame');
        }
        canvas.dataset.frameCount=String(++renderedFrames);canvas.dataset.frameTime=String(time);
        return source;
      },
      pause(value) {
        if(scenePaused&&!value){o.Gl.clock.getDelta();o.clockDelta=0;l.ZP.ticker.wake();}
        scenePaused=value;
        window.__unseenPaused = value||hostDriven;
      },
      ascend(progress, end = false) {
        const home = o.HomeContact, camera = home.camera;
        if (end) {
          if (ascent) {camera.position.copy(ascent.position);camera.quaternion.copy(ascent.rotation);camera.fov=ascent.fov;camera.updateProjectionMatrix();}
          ascent=null;return;
        }
        if (!ascent) {
          const direction=camera.position.clone();camera.getWorldDirection(direction);
          ascent={position:camera.position.clone(),rotation:camera.quaternion.clone(),direction,fov:camera.fov,height:Math.max(.005,Math.abs(camera.position.y-home.water.position.y))};
        }
        window.__unseenPaused=true;
        const p=Math.max(0,Math.min(1,progress)),smooth=p*p*(3-2*p),height=ascent.height;
        // Crane above the courtyard while retaining the horizon. The actual
        // translation supplies flight parallax; clouds occlude the walls in 3D.
        camera.position.copy(ascent.position).addScaledVector(ascent.direction,height*.2*smooth);
        camera.position.y=ascent.position.y+height*8*smooth;
        const target=camera.position.clone().addScaledVector(ascent.direction,height*5);
        target.y+=height*.3*smooth;
        camera.lookAt(target);camera.quaternion.slerpQuaternions(ascent.rotation,camera.quaternion.clone(),smooth);
        camera.fov=ascent.fov+Math.sin(p*Math.PI)*1.5;camera.updateProjectionMatrix();
        o.Gl.composer.render();return canvas;
      },
      submerge(progress, end = false) {
        const home = o.HomeContact;
        if (end) {home.tweenParams.cameraYOffset=0;home.updateCameraPosition();submerge=null;return;}
        window.__unseenPaused = true;
        home.tweenParams.cameraYOffset=(innerHeight/2)*-5e-5*Math.max(0,Math.min(1,progress));
        home.onRaf(performance.now()/1000);
        o.Gl.composer.render(); return canvas;
      },
    };
    button.addEventListener('click', event => { event.preventDefault(); parent.postMessage({ type: 'unseen:projects' }, location.origin); });
    const cursor = document.querySelector('.scene-cursor');
    document.addEventListener('pointermove', event => {
      document.body.classList.toggle('pointer-active', !event.target.closest('a,button'));
      cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`;
    }, { passive: true });
    document.addEventListener('pointerleave', () => document.body.classList.remove('pointer-active'));
    document.addEventListener('wheel', event => {
      if (event.ctrlKey) return;
      event.preventDefault();
    }, { passive: false });
    // Hidden iframes can suspend RAF in mobile WebViews. Readiness must not wait
    // for visibility that the host itself only grants after this ready message.
    for(let warm=0;warm<3;warm++){
      o.Gl.clock.getDelta();o.clockDelta=0;
      // Also fill text, fluid and reflection targets, rather than presenting
      // an uninitialized composer frame with missing type or a black waterplane.
      o.RAFCollection.fire(l.ZP.ticker.time);
    }
    o.HomeContact.updateCameraPosition();o.Gl.composer.render();
    canvas.dataset.effectSource = 'unseen-original';
    canvas.dataset.ready = 'true';
    parent.postMessage({ type: 'unseen:ready',pixelRatio:o.Gl.renderer.getPixelRatio() }, location.origin);
  } catch (error) {
    console.error('Original courtyard engine failed:', error);
    parent.postMessage({ type: 'unseen:error', message: String(error) }, location.origin);
  }
};
