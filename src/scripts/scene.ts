import * as THREE from 'three';
import { kill, reducedMotion, tween } from './motion';
import type { Project } from '../lib/project-types';

const GAP = 0.375,
  H = 1.25,
  W = 5 / 3;
const wrap = (min: number, max: number, value: number): number =>
  ((((value - min) % (max - min)) + max - min) % (max - min)) + min;
interface Tile {
  project: number;
  order: number;
  holder: THREE.Group;
  inner: THREE.Group;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  hit: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  opacity: number;
}
interface SceneEvents {
  hover: (project: number | null, x?: number, y?: number) => void;
  open: (project: number) => void;
  unavailable: () => void;
}
const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform vec2 uMeshSize;
uniform sampler2D uImageTexture,uBlurTexture;
uniform float uOpacity;
void main(){
 vec2 ratio=vec2(min(uMeshSize.x/uMeshSize.y,1.0),min(uMeshSize.y/uMeshSize.x,1.0));
 vec2 uv=vUv*ratio+(1.0-ratio)*.5;
 vec4 sharp=texture2D(uImageTexture,uv),blur=texture2D(uBlurTexture,uv);
 float edge=smoothstep(0.0,.15,vUv.x)*smoothstep(0.0,.15,1.0-vUv.x)*smoothstep(0.0,.15,vUv.y)*smoothstep(0.0,.15,1.0-vUv.y);
 blur.a*=.75;vec4 color=mix(sharp,blur,1.0-edge);color.a*=uOpacity;gl_FragColor=color;
}`;

async function coverCanvas(project: Project): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable.');
  context.fillStyle = '#060709';
  context.fillRect(0, 0, 512, 512);
  if (project.cover) {
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error('Cover load timed out')),
          10000,
        );
        image.onload = () => {
          window.clearTimeout(timer);
          resolve();
        };
        image.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error('Cover load failed'));
        };
        image.src = project.cover!;
      });
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        0,
        0,
        512,
        512,
      );
      return canvas;
    } catch {
      /* A missing cover must not make the catalogue or details unusable. */
    }
  }
  context.fillStyle = '#f2f4f8';
  context.font = '72px Georgia';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(project.title, 256, 256, 440);
  return canvas;
}

export class GalleryScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(
    5,
    innerWidth / innerHeight,
    0.1,
    1000,
  );
  private world = new THREE.Group();
  private geometry = new THREE.BoxGeometry(H, W, 0.0175);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private textures: THREE.Texture[] = [];
  private tiles: Tile[] = [];
  private frame = 0;
  private abort = new AbortController();
  private ready = false;
  private destroyed = false;
  private opened: Tile | null = null;
  private hovered: Tile | null = null;
  private aspect = innerWidth / innerHeight;
  private intro = { x: -20 };
  private scroll = { target: 0, current: 0 };
  private drag = {
    x: 0,
    y: 0,
    smoothed: 0,
    down: false,
    active: false,
    id: -1,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  };
  private mouse = { x: -1, y: -1, clientX: 0, clientY: 0, present: false };
  private transition = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private projects: Project[],
    private events: SceneEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setClearColor(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--bg')
        .trim(),
      1,
    );
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.scene.add(this.world);
    this.world.scale.setScalar(0.825);
    this.placeCamera();
    this.bind();
    this.render();
  }

  async prepare(progress: (percentage: number) => void): Promise<void> {
    for (let i = 0; i < this.projects.length; i++) {
      const sharp = await coverCanvas(this.projects[i]);
      if (this.destroyed) return;
      const blur = document.createElement('canvas');
      blur.width = blur.height = 24;
      blur.getContext('2d')?.drawImage(sharp, 0, 0, 24, 24);
      const image = new THREE.CanvasTexture(sharp),
        blurred = new THREE.CanvasTexture(blur);
      blurred.minFilter = blurred.magFilter = THREE.LinearFilter;
      this.textures.push(image, blurred);
      // A single WIP is one real card. Repetition only belongs to a multi-project stack.
      const copies = this.projects.length === 1 ? 1 : 3;
      for (let copy = 0; copy < copies; copy++)
        this.createTile(i, i + copy * this.projects.length, image, blurred);
      progress(((i + 1) / this.projects.length) * 100);
    }
  }

  start(): void {
    this.ready = true;
    this.intro.x = reducedMotion || this.projects.length === 1 ? 0 : -20;
    tween(this.intro, { x: 0, duration: 2, ease: 'expo.out' });
    tween(this.world.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 1,
      delay: 1.25,
      ease: 'expo.out',
    });
  }

  filter(category: string): void {
    this.setHover(null);
    for (const tile of this.tiles)
      tile.active =
        category === 'All' || this.projects[tile.project].category === category;
  }

  focus(project: number): void {
    if (this.opened || this.projects.length < 2) return;
    const tile = this.tiles.find(
      (tile) => tile.project === project && tile.active,
    );
    if (!tile) return;
    const length = Math.max(
        this.tiles.filter((tile) => tile.active).length,
        24,
      ),
      half = (length * GAP) / 2;
    const position =
      this.scroll.current / 25 - this.drag.smoothed / 100 + this.intro.x;
    const delta = wrap(-half, half, (tile.order - position) * GAP);
    this.scroll.target =
      (position + delta / GAP + this.drag.smoothed / 100 - this.intro.x) * 25;
  }

  async open(project: number): Promise<boolean> {
    const tile =
      this.hovered?.project === project
        ? this.hovered
        : this.tiles.find((tile) => tile.project === project && tile.active);
    if (!tile) return true;
    const version = ++this.transition;
    this.opened = tile;
    this.setHover(null);
    for (const other of this.tiles) other.holder.visible = other === tile;
    kill(tile.inner.position);
    tile.inner.position.set(0, 0, 0);
    kill(tile.holder.position);
    kill(tile.holder.rotation);
    kill(this.camera.position);
    kill(this.world.scale);
    tween(this.world.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 0.75,
      ease: 'expo.out',
    });
    tween(tile.holder.position, {
      x: 0,
      y: 0,
      duration: (1.25 / 3) * 2,
      ease: 'expo.out',
      onUpdate: () => {
        tile.holder.position.z = -tile.holder.position.x * this.aspect * 1.5;
      },
    });
    tween(tile.holder.rotation, { y: 0, duration: 1.25, ease: 'expo.inOut' });
    tween(tile.mesh.scale, {
      x: W / H,
      duration: 1.25,
      ease: 'expo.inOut',
      onUpdate: () => {
        tile.mesh.material.uniforms.uMeshSize.value.set(
          H * tile.mesh.scale.x,
          W,
        );
      },
    });
    await new Promise<void>((resolve) => {
      const animation = tween(this.camera.position, {
        x: 0,
        y: 0,
        z: innerWidth < 640 ? 35 : 30,
        duration: 1.25,
        ease: 'expo.inOut',
        onUpdate: () => this.camera.lookAt(0, 0, 0),
        onComplete: resolve,
        onInterrupt: resolve,
      });
      if (reducedMotion) animation.progress(1);
    });
    if (this.transition !== version || this.destroyed) return false;
    tile.holder.visible = false;
    return true;
  }

  close(): void {
    this.transition++;
    const tile = this.opened;
    if (tile) {
      kill(this.camera.position);
      kill(tile.holder.position);
      kill(tile.holder.rotation);
      kill(tile.mesh.scale);
      tile.mesh.scale.set(1, 1, 1);
      tile.mesh.material.uniforms.uMeshSize.value.set(H, W);
      tile.holder.rotation.y = -Math.PI / 6;
    }
    this.opened = null;
    this.placeCamera();
    this.intro.x = reducedMotion || this.projects.length === 1 ? 0 : -20;
    tween(this.intro, { x: 0, duration: 2, ease: 'expo.out', overwrite: true });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    this.close();
    kill(this.intro);
    kill(this.world.scale);
    for (const tile of this.tiles) {
      kill(tile.inner.position);
      tile.mesh.material.dispose();
      tile.hit.material.dispose();
    }
    this.geometry.dispose();
    for (const texture of this.textures) texture.dispose();
    this.renderer.dispose();
  }

  private createTile(
    project: number,
    order: number,
    image: THREE.Texture,
    blur: THREE.Texture,
  ): void {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        uMeshSize: { value: new THREE.Vector2(H, W) },
        uImageTexture: { value: image },
        uBlurTexture: { value: blur },
        uOpacity: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(this.geometry, material),
      hit = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
    hit.scale.x = 1.5;
    const inner = new THREE.Group(),
      holder = new THREE.Group();
    inner.add(mesh);
    holder.add(inner, hit);
    this.world.add(holder);
    const tile: Tile = {
      project,
      order,
      holder,
      inner,
      mesh,
      hit,
      active: true,
      opacity: 1,
    };
    hit.userData.tile = tile;
    this.tiles.push(tile);
  }

  private placeCamera(): void {
    this.camera.position.set(0, 100 / 7.5, this.aspect < 1 ? 55 : 35);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  private setHover(tile: Tile | null): void {
    if (this.hovered === tile) return;
    if (this.hovered)
      tween(this.hovered.inner.position, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: 'expo.out',
        overwrite: true,
      });
    this.hovered = tile;
    if (tile)
      tween(tile.inner.position, {
        x: 2 / 3,
        y: -0.1,
        duration: 0.5,
        ease: 'expo.out',
        overwrite: true,
      });
    this.events.hover(
      tile?.project ?? null,
      this.mouse.clientX,
      this.mouse.clientY,
    );
  }

  private pick(): void {
    if (!this.ready || this.opened || this.drag.active || !this.mouse.present)
      return;
    this.pointer.set(this.mouse.x, this.mouse.y);
    this.world.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.tiles
        .filter((tile) => tile.active && tile.holder.visible)
        .map((tile) => tile.hit),
      false,
    )[0];
    this.setHover(hit ? (hit.object.userData.tile as Tile) : null);
  }

  private layout(): void {
    this.drag.smoothed +=
      (this.drag.x - this.drag.y - this.drag.smoothed) * 0.1;
    this.scroll.current += (this.scroll.target - this.scroll.current) * 0.15;
    const position =
      this.scroll.current / 25 - this.drag.smoothed / 100 + this.intro.x;
    const visible = this.tiles.filter((tile) => tile.active),
      length = Math.max(visible.length, 24),
      half = (length * GAP) / 2,
      step = visible.length ? length / visible.length : 1;
    visible.forEach((tile, i) => (tile.order = i * step));
    for (const tile of this.tiles) {
      tile.opacity += ((tile.active ? 1 : 0) - tile.opacity) * 0.12;
      tile.mesh.material.uniforms.uOpacity.value = tile.opacity;
      if (this.opened) continue;
      const x =
          this.projects.length === 1
            ? 0
            : wrap(-half, half, (tile.order - position) * GAP),
        z = this.aspect < 1 ? -x * 6 : -x * this.aspect * 1.5;
      tile.holder.position.set(x, -(1 - tile.opacity) * 1.2, z);
      tile.holder.rotation.set(0, -Math.PI / 6, 0);
      tile.holder.visible = tile.opacity > 0.02 && Math.abs(z) < 12.5;
    }
  }

  private render = (): void => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this.render);
    if (document.hidden) return;
    this.layout();
    this.pick();
    this.renderer.render(this.scene, this.camera);
  };

  private bind(): void {
    const signal = this.abort.signal;
    const updatePointer = (event: PointerEvent): void => {
      this.mouse = {
        x: (event.clientX / innerWidth) * 2 - 1,
        y: -(event.clientY / innerHeight) * 2 + 1,
        clientX: event.clientX,
        clientY: event.clientY,
        present: event.pointerType !== 'touch',
      };
      this.events.hover(
        this.hovered?.project ?? null,
        event.clientX,
        event.clientY,
      );
    };
    this.canvas.addEventListener(
      'pointermove',
      (event) => {
        updatePointer(event);
        if (!this.drag.down || event.pointerId !== this.drag.id) return;
        if (
          !this.drag.active &&
          Math.hypot(
            event.clientX - this.drag.startX,
            event.clientY - this.drag.startY,
          ) > 3
        ) {
          this.drag.active = true;
          document.body.classList.add('drag');
          this.setHover(null);
          tween(this.world.scale, {
            x: 0.825,
            y: 0.825,
            z: 0.825,
            duration: 0.75,
            ease: 'expo.out',
            overwrite: true,
          });
        }
        if (this.drag.active) {
          this.drag.x = this.drag.offsetX + event.clientX;
          this.drag.y = this.drag.offsetY + event.clientY;
        }
      },
      { signal },
    );
    this.canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (
          !this.ready ||
          this.opened ||
          !event.isPrimary ||
          event.button !== 0
        )
          return;
        updatePointer(event);
        if (event.pointerType === 'touch') {
          this.mouse.present = true;
          this.pick();
          this.mouse.present = false;
        }
        this.drag.down = true;
        this.drag.id = event.pointerId;
        this.drag.startX = event.clientX;
        this.drag.startY = event.clientY;
        this.drag.offsetX = this.drag.x - event.clientX;
        this.drag.offsetY = this.drag.y - event.clientY;
        this.canvas.setPointerCapture(event.pointerId);
      },
      { signal },
    );
    const end = (event: PointerEvent, cancel: boolean): void => {
      if (!this.drag.down || event.pointerId !== this.drag.id) return;
      const dragged = this.drag.active;
      this.drag.down = this.drag.active = false;
      this.drag.id = -1;
      document.body.classList.remove('drag');
      if (this.canvas.hasPointerCapture(event.pointerId))
        this.canvas.releasePointerCapture(event.pointerId);
      tween(this.world.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.75,
        ease: 'expo.out',
        overwrite: true,
      });
      if (!cancel && !dragged && this.hovered)
        this.events.open(this.hovered.project);
    };
    this.canvas.addEventListener('pointerup', (event) => end(event, false), {
      signal,
    });
    this.canvas.addEventListener('pointercancel', (event) => end(event, true), {
      signal,
    });
    this.canvas.addEventListener(
      'lostpointercapture',
      (event) => end(event, true),
      { signal },
    );
    this.canvas.addEventListener(
      'pointerleave',
      () => {
        if (!this.drag.down) {
          this.mouse.present = false;
          this.setHover(null);
        }
      },
      { signal },
    );
    window.addEventListener(
      'wheel',
      (event) => {
        if (
          this.ready &&
          !this.opened &&
          !(
            event.target instanceof Element &&
            event.target.closest('#index, #navigation-bottom')
          )
        )
          this.scroll.target += (event.deltaY + event.deltaX) / 20;
      },
      { passive: true, signal },
    );
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          this.ready &&
          !this.opened &&
          ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(
            event.key,
          ) &&
          event.target === this.canvas
        ) {
          event.preventDefault();
          this.scroll.target += ['ArrowRight', 'ArrowDown'].includes(event.key)
            ? 12
            : -12;
        }
      },
      { signal },
    );
    window.addEventListener(
      'resize',
      () => {
        this.aspect = innerWidth / innerHeight;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.setSize(innerWidth, innerHeight);
        this.camera.aspect = this.aspect;
        this.camera.updateProjectionMatrix();
        if (!this.opened) this.placeCamera();
        else {
          this.camera.position.set(0, 0, innerWidth < 640 ? 35 : 30);
          this.camera.lookAt(0, 0, 0);
        }
      },
      { signal },
    );
    this.canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.events.unavailable();
      },
      { signal },
    );
    window.addEventListener('pagehide', () => this.destroy(), {
      once: true,
      signal,
    });
  }
}
