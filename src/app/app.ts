import { Component, ChangeDetectorRef, AfterViewInit, OnDestroy, ElementRef, ViewChild, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AnimationModule } from './animations';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [AnimationModule, FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit, OnDestroy {
  readonly title = 'Myo San Aung | Portfolio';

  @ViewChild('liquidCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private animationFrameId: number | null = null;
  private isCanvasVisible = true;
  private intersectionObserver?: IntersectionObserver;

  private mouseX = 0;
  private mouseY = 0;
  private targetMouseX = 0;
  private targetMouseY = 0;
  private startTime = 0;

  private posAttrLoc = -1;
  private resUniLoc: WebGLUniformLocation | null = null;
  private mouseUniLoc: WebGLUniformLocation | null = null;
  private timeUniLoc: WebGLUniformLocation | null = null;
  private posBuffer: WebGLBuffer | null = null;

  private boundOnMouseMove?: (e: MouseEvent) => void;
  private boundOnTouchMove?: (e: TouchEvent) => void;
  private boundOnResize?: () => void;

  formData = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };

  isSubmitting = false;
  submitSuccess = false;
  submitError = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initLiquidGlassShader();
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
      }
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
      }
      if (this.boundOnMouseMove) {
        window.removeEventListener('mousemove', this.boundOnMouseMove);
      }
      if (this.boundOnTouchMove) {
        window.removeEventListener('touchmove', this.boundOnTouchMove);
      }
      if (this.boundOnResize) {
        window.removeEventListener('resize', this.boundOnResize);
      }
      if (this.gl && this.program) {
        this.gl.deleteProgram(this.program);
      }
      if (this.gl && this.posBuffer) {
        this.gl.deleteBuffer(this.posBuffer);
      }
    }
  }

  private initLiquidGlassShader(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return;
    this.gl = gl;

    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_time;

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      float map(vec3 p) {
        p.yz *= rot(u_mouse.y * 0.7 + 0.25);
        p.xz *= rot(u_mouse.x * 1.1 + u_time * 0.22);

        float d1 = length(p + vec3(sin(u_time * 0.8) * 0.3, cos(u_time * 0.6) * 0.3, 0.0)) - 1.15;
        vec3 p2 = p + vec3(cos(u_time * 1.1) * 1.35, sin(u_time * 1.0) * 0.75, sin(u_time * 0.8) * 0.55);
        float d2 = length(p2) - 0.52;
        vec3 p3 = p + vec3(sin(u_time * 0.65) * -1.25, cos(u_time * 1.2) * -0.85, cos(u_time * 0.55) * 0.75);
        float d3 = length(p3) - 0.42;

        float wave = sin(p.x * 4.0 + u_time * 1.8) * sin(p.y * 4.0 + u_time * 1.4) * sin(p.z * 4.0) * 0.075;

        float fluid = smin(d1, d2, 0.6);
        fluid = smin(fluid, d3, 0.5);

        return fluid + wave;
      }

      vec3 calcNormal(vec3 p) {
        float eps = 0.002;
        vec2 h = vec2(eps, 0.0);
        return normalize(vec3(
          map(p + h.xyy) - map(p - h.xyy),
          map(p + h.yxy) - map(p - h.yxy),
          map(p + h.yyx) - map(p - h.yyx)
        ));
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
        vec3 ro = vec3(0.0, 0.0, 3.8);
        vec3 rd = normalize(vec3(uv, -1.5));

        vec3 col = mix(vec3(0.039, 0.067, 0.102), vec3(0.020, 0.035, 0.059), uv.y + 0.5);

        float t = 0.0;
        for (int i = 0; i < 64; i++) {
          vec3 p = ro + rd * t;
          float d = map(p);
          if (d < 0.001 || t > 8.0) break;
          t += d * 0.75;
        }

        if (t < 8.0) {
          vec3 p = ro + rd * t;
          vec3 n = calcNormal(p);
          vec3 lightDir = normalize(vec3(1.2, 1.8, 2.0));
          vec3 lightDir2 = normalize(vec3(-1.5, -1.0, 1.0));
          vec3 viewDir = -rd;

          float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
          vec3 halfVec = normalize(lightDir + viewDir);
          float spec1 = pow(max(dot(n, halfVec), 0.0), 48.0);
          vec3 halfVec2 = normalize(lightDir2 + viewDir);
          float spec2 = pow(max(dot(n, halfVec2), 0.0), 32.0);

          vec3 refr = refract(rd, n, 0.85);
          float internalRef = dot(refr, vec3(0.0, 0.0, -1.0));

          vec3 glassTint = vec3(0.08, 0.45, 0.75);
          vec3 innerGlow = vec3(0.02, 0.85, 0.95) * max(internalRef, 0.0);
          vec3 glassCol = mix(glassTint * 0.3, innerGlow, 0.6);
          glassCol += fresnel * vec3(0.35, 0.80, 1.0) * 1.5;
          glassCol += (spec1 * vec3(1.0, 1.0, 1.0) + spec2 * vec3(0.3, 0.8, 1.0) * 0.8);

          col = mix(col, glassCol, 0.88);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const createShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    this.program = program;

    this.posAttrLoc = gl.getAttribLocation(program, 'position');
    this.resUniLoc = gl.getUniformLocation(program, 'u_resolution');
    this.mouseUniLoc = gl.getUniformLocation(program, 'u_mouse');
    this.timeUniLoc = gl.getUniformLocation(program, 'u_time');

    this.posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.startTime = performance.now();

    // Event listeners
    this.boundOnMouseMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.targetMouseX = (e.clientX / w - 0.5) * 2.0;
      this.targetMouseY = -(e.clientY / h - 0.5) * 2.0;
    };

    this.boundOnTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.targetMouseX = (e.touches[0].clientX / w - 0.5) * 2.0;
        this.targetMouseY = -(e.touches[0].clientY / h - 0.5) * 2.0;
      }
    };

    this.boundOnResize = () => {
      this.resizeCanvas();
    };

    window.addEventListener('mousemove', this.boundOnMouseMove, { passive: true });
    window.addEventListener('touchmove', this.boundOnTouchMove, { passive: true });
    window.addEventListener('resize', this.boundOnResize);

    // Pause rendering when hero is scrolled out of view to preserve 100% battery & performance
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            this.isCanvasVisible = entry.isIntersecting;
            if (this.isCanvasVisible && this.animationFrameId === null) {
              this.renderLoop();
            }
          });
        },
        { threshold: 0.05 }
      );
      this.intersectionObserver.observe(canvas);
    }

    this.resizeCanvas();
    this.renderLoop();
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = Math.floor(canvas.clientWidth * dpr);
    const displayHeight = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      this.gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  private renderLoop(): void {
    if (!this.isCanvasVisible || !this.gl || !this.program) {
      this.animationFrameId = null;
      return;
    }

    this.resizeCanvas();

    this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
    this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

    const elapsed = (performance.now() - this.startTime) * 0.001;

    this.gl.useProgram(this.program);
    this.gl.enableVertexAttribArray(this.posAttrLoc);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.posBuffer);
    this.gl.vertexAttribPointer(this.posAttrLoc, 2, this.gl.FLOAT, false, 0, 0);

    const canvas = this.canvasRef!.nativeElement;
    this.gl.uniform2f(this.resUniLoc, canvas.width, canvas.height);
    this.gl.uniform2f(this.mouseUniLoc, this.mouseX, this.mouseY);
    this.gl.uniform1f(this.timeUniLoc, elapsed);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
  }

  onSubmit() {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    const headers = new HttpHeaders({ Accept: 'application/json' });

    const payload = {
      name: this.formData.name,
      email: this.formData.email,
      subject: this.formData.subject,
      message: this.formData.message
    };

    this.http.post('https://formspree.io/f/xqeojkgv', payload, { headers }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.submitSuccess = true;
        this.formData = { name: '', email: '', subject: '', message: '' };
        this.cdr.markForCheck();

        setTimeout(() => {
          this.submitSuccess = false;
          this.cdr.markForCheck();
        }, 5000);
      },
      error: () => {
        this.isSubmitting = false;
        this.submitError = true;
        this.cdr.markForCheck();

        setTimeout(() => {
          this.submitError = false;
          this.cdr.markForCheck();
        }, 5000);
      }
    });
  }
}


