import * as THREE from 'three';
var Mw = Object.defineProperty;
var vi = (n, t) => {
  for (var e in t)
    Mw(n, e, {
      get: t[e],
      enumerable: !0,
    });
};
var c0 = class n extends THREE.Mesh {
  constructor() {
    let t = n.SkyShader,
      e = new THREE.ShaderMaterial({
        name: t.name,
        uniforms: THREE.UniformsUtils.clone(t.uniforms),
        vertexShader: t.vertexShader,
        fragmentShader: t.fragmentShader,
        side: THREE.BackSide,
        depthWrite: !1,
      });
    (super(new THREE.BoxGeometry(1, 1, 1), e), (this.isSky = !0));
  }
};
c0.SkyShader = {
  name: 'SkyShader',
  uniforms: {
    turbidity: {
      value: 2,
    },
    rayleigh: {
      value: 1,
    },
    mieCoefficient: {
      value: 0.005,
    },
    mieDirectionalG: {
      value: 0.8,
    },
    sunPosition: {
      value: new THREE.Vector3(),
    },
    up: {
      value: new THREE.Vector3(0, 1, 0),
    },
  },
  vertexShader: `
		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;
		uniform vec3 up;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		// constants for atmospheric scattering
		const float e = 2.71828182845904523536028747135266249775724709369995957;
		const float pi = 3.141592653589793238462643383279502884197169;

		// wavelength of used primaries, according to preetham
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		// this pre-calcuation replaces older TotalRayleigh(vec3 lambda) function:
		// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
		const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

		// mie stuff
		// K coefficient for the primaries
		const float v = 4.0;
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
		const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

		// earth shadow hack
		// cutoffAngle = pi / 1.95;
		const float cutoffAngle = 1.6110731556870734;
		const float steepness = 1.5;
		const float EE = 1000.0;

		float sunIntensity( float zenithAngleCos ) {
			zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
			return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
		}

		vec3 totalMie( float T ) {
			float c = ( 0.2 * T ) * 10E-18;
			return 0.434 * c * MieConst;
		}

		void main() {

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vSunDirection = normalize( sunPosition );

			vSunE = sunIntensity( dot( vSunDirection, up ) );

			vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

			float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

			// extinction (absorbtion + out scattering)
			// rayleigh coefficients
			vBetaR = totalRayleigh * rayleighCoefficient;

			// mie coefficients
			vBetaM = totalMie( turbidity ) * mieCoefficient;

		}`,
  fragmentShader: `
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		uniform float mieDirectionalG;
		uniform vec3 up;

		// constants for atmospheric scattering
		const float pi = 3.141592653589793238462643383279502884197169;

		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

		// optical length at zenith for molecules
		const float rayleighZenithLength = 8.4E3;
		const float mieZenithLength = 1.25E3;
		// 66 arc seconds -> degrees, and the cosine of that
		const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

		// 3.0 / ( 16.0 * pi )
		const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
		// 1.0 / ( 4.0 * pi )
		const float ONE_OVER_FOURPI = 0.07957747154594767;

		float rayleighPhase( float cosTheta ) {
			return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
		}

		float hgPhase( float cosTheta, float g ) {
			float g2 = pow( g, 2.0 );
			float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
			return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
		}

		void main() {

			vec3 direction = normalize( vWorldPosition - cameraPosition );

			// optical length
			// cutoff angle at 90 to avoid singularity in next formula.
			float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
			float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
			float sR = rayleighZenithLength * inverse;
			float sM = mieZenithLength * inverse;

			// combined extinction factor
			vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
			vec3 betaRTheta = vBetaR * rPhase;

			float mPhase = hgPhase( cosTheta, mieDirectionalG );
			vec3 betaMTheta = vBetaM * mPhase;

			vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
			Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

			// nightsky
			float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
			float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
			vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
			vec3 L0 = vec3( 0.1 ) * Fex;

			// composition + solar disc
			float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
			L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

			vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

			vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );

			gl_FragColor = vec4( retColor, 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`,
};
var cp = {
  name: 'CopyShader',
  uniforms: {
    tDiffuse: {
      value: null,
    },
    opacity: {
      value: 1,
    },
  },
  vertexShader: `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
  fragmentShader: `

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`,
};
var cs = class {
    constructor() {
      ((this.isPass = !0), (this.enabled = !0), (this.needsSwap = !0), (this.clear = !1), (this.renderToScreen = !1));
    }
    setSize() {}
    render() {
      console.error('THREE.Pass: .render() must be implemented in derived pass.');
    }
    dispose() {}
  },
  b9 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
  C2 = class extends THREE.BufferGeometry {
    constructor() {
      (super(),
        this.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3)),
        this.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2)));
    }
  },
  v9 = new C2(),
  Dr = class {
    constructor(t) {
      this._mesh = new THREE.Mesh(v9, t);
    }
    dispose() {
      this._mesh.geometry.dispose();
    }
    render(t) {
      t.render(this._mesh, b9);
    }
    get material() {
      return this._mesh.material;
    }
    set material(t) {
      this._mesh.material = t;
    }
  };
var fp = class extends cs {
  constructor(t, e) {
    (super(),
      (this.textureID = e !== void 0 ? e : 'tDiffuse'),
      t instanceof THREE.ShaderMaterial
        ? ((this.uniforms = t.uniforms), (this.material = t))
        : t &&
          ((this.uniforms = THREE.UniformsUtils.clone(t.uniforms)),
          (this.material = new THREE.ShaderMaterial({
            name: t.name !== void 0 ? t.name : 'unspecified',
            defines: Object.assign({}, t.defines),
            uniforms: this.uniforms,
            vertexShader: t.vertexShader,
            fragmentShader: t.fragmentShader,
          }))),
      (this.fsQuad = new Dr(this.material)));
  }
  render(t, e, i) {
    (this.uniforms[this.textureID] && (this.uniforms[this.textureID].value = i.texture),
      (this.fsQuad.material = this.material),
      this.renderToScreen
        ? (t.setRenderTarget(null), this.fsQuad.render(t))
        : (t.setRenderTarget(e), this.clear && t.clear(t.autoClearColor, t.autoClearDepth, t.autoClearStencil), this.fsQuad.render(t)));
  }
  dispose() {
    (this.material.dispose(), this.fsQuad.dispose());
  }
};
var mf = class extends cs {
    constructor(t, e) {
      (super(), (this.scene = t), (this.camera = e), (this.clear = !0), (this.needsSwap = !1), (this.inverse = !1));
    }
    render(t, e, i) {
      let s = t.getContext(),
        o = t.state;
      (o.buffers.color.setMask(!1), o.buffers.depth.setMask(!1), o.buffers.color.setLocked(!0), o.buffers.depth.setLocked(!0));
      let r, a;
      (this.inverse ? ((r = 0), (a = 1)) : ((r = 1), (a = 0)),
        o.buffers.stencil.setTest(!0),
        o.buffers.stencil.setOp(s.REPLACE, s.REPLACE, s.REPLACE),
        o.buffers.stencil.setFunc(s.ALWAYS, r, 4294967295),
        o.buffers.stencil.setClear(a),
        o.buffers.stencil.setLocked(!0),
        t.setRenderTarget(i),
        this.clear && t.clear(),
        t.render(this.scene, this.camera),
        t.setRenderTarget(e),
        this.clear && t.clear(),
        t.render(this.scene, this.camera),
        o.buffers.color.setLocked(!1),
        o.buffers.depth.setLocked(!1),
        o.buffers.color.setMask(!0),
        o.buffers.depth.setMask(!0),
        o.buffers.stencil.setLocked(!1),
        o.buffers.stencil.setFunc(s.EQUAL, 1, 4294967295),
        o.buffers.stencil.setOp(s.KEEP, s.KEEP, s.KEEP),
        o.buffers.stencil.setLocked(!0));
    }
  },
  hp = class extends cs {
    constructor() {
      (super(), (this.needsSwap = !1));
    }
    render(t) {
      (t.state.buffers.stencil.setLocked(!1), t.state.buffers.stencil.setTest(!1));
    }
  };
var up = class {
  constructor(t, e) {
    if (((this.renderer = t), (this._pixelRatio = t.getPixelRatio()), e === void 0)) {
      let i = t.getSize(new THREE.Vector2());
      ((this._width = i.width),
        (this._height = i.height),
        (e = new THREE.WebGLRenderTarget(this._width * this._pixelRatio, this._height * this._pixelRatio, {
          type: THREE.HalfFloatType,
        })),
        (e.texture.name = 'EffectComposer.rt1'));
    } else ((this._width = e.width), (this._height = e.height));
    ((this.renderTarget1 = e),
      (this.renderTarget2 = e.clone()),
      (this.renderTarget2.texture.name = 'EffectComposer.rt2'),
      (this.writeBuffer = this.renderTarget1),
      (this.readBuffer = this.renderTarget2),
      (this.renderToScreen = !0),
      (this.passes = []),
      (this.copyPass = new fp(cp)),
      (this.copyPass.material.blending = THREE.NoBlending),
      (this.clock = new THREE.Clock()));
  }
  swapBuffers() {
    let t = this.readBuffer;
    ((this.readBuffer = this.writeBuffer), (this.writeBuffer = t));
  }
  addPass(t) {
    (this.passes.push(t), t.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio));
  }
  insertPass(t, e) {
    (this.passes.splice(e, 0, t), t.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio));
  }
  removePass(t) {
    let e = this.passes.indexOf(t);
    e !== -1 && this.passes.splice(e, 1);
  }
  isLastEnabledPass(t) {
    for (let e = t + 1; e < this.passes.length; e++) if (this.passes[e].enabled) return !1;
    return !0;
  }
  render(t) {
    t === void 0 && (t = this.clock.getDelta());
    let e = this.renderer.getRenderTarget(),
      i = !1;
    for (let s = 0, o = this.passes.length; s < o; s++) {
      let r = this.passes[s];
      if (r.enabled !== !1) {
        if (
          ((r.renderToScreen = this.renderToScreen && this.isLastEnabledPass(s)),
          r.render(this.renderer, this.writeBuffer, this.readBuffer, t, i),
          r.needsSwap)
        ) {
          if (i) {
            let a = this.renderer.getContext(),
              l = this.renderer.state.buffers.stencil;
            (l.setFunc(a.NOTEQUAL, 1, 4294967295),
              this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer, t),
              l.setFunc(a.EQUAL, 1, 4294967295));
          }
          this.swapBuffers();
        }
        mf !== void 0 && (r instanceof mf ? (i = !0) : r instanceof hp && (i = !1));
      }
    }
    this.renderer.setRenderTarget(e);
  }
  reset(t) {
    if (t === void 0) {
      let e = this.renderer.getSize(new THREE.Vector2());
      ((this._pixelRatio = this.renderer.getPixelRatio()),
        (this._width = e.width),
        (this._height = e.height),
        (t = this.renderTarget1.clone()),
        t.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio));
    }
    (this.renderTarget1.dispose(),
      this.renderTarget2.dispose(),
      (this.renderTarget1 = t),
      (this.renderTarget2 = t.clone()),
      (this.writeBuffer = this.renderTarget1),
      (this.readBuffer = this.renderTarget2));
  }
  setSize(t, e) {
    ((this._width = t), (this._height = e));
    let i = this._width * this._pixelRatio,
      s = this._height * this._pixelRatio;
    (this.renderTarget1.setSize(i, s), this.renderTarget2.setSize(i, s));
    for (let o = 0; o < this.passes.length; o++) this.passes[o].setSize(i, s);
  }
  setPixelRatio(t) {
    ((this._pixelRatio = t), this.setSize(this._width, this._height));
  }
  dispose() {
    (this.renderTarget1.dispose(), this.renderTarget2.dispose(), this.copyPass.dispose());
  }
};
var dp = class extends cs {
  constructor(t, e, i = null, s = null, o = null) {
    (super(),
      (this.scene = t),
      (this.camera = e),
      (this.overrideMaterial = i),
      (this.clearColor = s),
      (this.clearAlpha = o),
      (this.clear = !0),
      (this.clearDepth = !1),
      (this.needsSwap = !1),
      (this._oldClearColor = new THREE.Color()));
  }
  render(t, e, i) {
    let s = t.autoClear;
    t.autoClear = !1;
    let o, r;
    (this.overrideMaterial !== null && ((r = this.scene.overrideMaterial), (this.scene.overrideMaterial = this.overrideMaterial)),
      this.clearColor !== null && (t.getClearColor(this._oldClearColor), t.setClearColor(this.clearColor, t.getClearAlpha())),
      this.clearAlpha !== null && ((o = t.getClearAlpha()), t.setClearAlpha(this.clearAlpha)),
      this.clearDepth == !0 && t.clearDepth(),
      t.setRenderTarget(this.renderToScreen ? null : i),
      this.clear === !0 && t.clear(t.autoClearColor, t.autoClearDepth, t.autoClearStencil),
      t.render(this.scene, this.camera),
      this.clearColor !== null && t.setClearColor(this._oldClearColor),
      this.clearAlpha !== null && t.setClearAlpha(o),
      this.overrideMaterial !== null && (this.scene.overrideMaterial = r),
      (t.autoClear = s));
  }
};
var dv = {
  name: 'LuminosityHighPassShader',
  shaderID: 'luminosityHighPass',
  uniforms: {
    tDiffuse: {
      value: null,
    },
    luminosityThreshold: {
      value: 1,
    },
    smoothWidth: {
      value: 1,
    },
    defaultColor: {
      value: new THREE.Color(0),
    },
    defaultOpacity: {
      value: 0,
    },
  },
  vertexShader: `

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
  fragmentShader: `

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`,
};
var f0 = class n extends cs {
  constructor(t, e, i, s) {
    (super(),
      (this.strength = e !== void 0 ? e : 1),
      (this.radius = i),
      (this.threshold = s),
      (this.resolution = t !== void 0 ? new THREE.Vector2(t.x, t.y) : new THREE.Vector2(256, 256)),
      (this.clearColor = new THREE.Color(0, 0, 0)),
      (this.renderTargetsHorizontal = []),
      (this.renderTargetsVertical = []),
      (this.nMips = 5));
    let o = Math.round(this.resolution.x / 2),
      r = Math.round(this.resolution.y / 2);
    ((this.renderTargetBright = new THREE.WebGLRenderTarget(o, r, {
      type: THREE.HalfFloatType,
    })),
      (this.renderTargetBright.texture.name = 'UnrealBloomPass.bright'),
      (this.renderTargetBright.texture.generateMipmaps = !1));
    for (let c = 0; c < this.nMips; c++) {
      let h = new THREE.WebGLRenderTarget(o, r, {
        type: THREE.HalfFloatType,
      });
      ((h.texture.name = 'UnrealBloomPass.h' + c), (h.texture.generateMipmaps = !1), this.renderTargetsHorizontal.push(h));
      let d = new THREE.WebGLRenderTarget(o, r, {
        type: THREE.HalfFloatType,
      });
      ((d.texture.name = 'UnrealBloomPass.v' + c),
        (d.texture.generateMipmaps = !1),
        this.renderTargetsVertical.push(d),
        (o = Math.round(o / 2)),
        (r = Math.round(r / 2)));
    }
    let a = dv;
    ((this.highPassUniforms = THREE.UniformsUtils.clone(a.uniforms)),
      (this.highPassUniforms.luminosityThreshold.value = s),
      (this.highPassUniforms.smoothWidth.value = 0.01),
      (this.materialHighPassFilter = new THREE.ShaderMaterial({
        uniforms: this.highPassUniforms,
        vertexShader: a.vertexShader,
        fragmentShader: a.fragmentShader,
      })),
      (this.separableBlurMaterials = []));
    let l = [3, 5, 7, 9, 11];
    ((o = Math.round(this.resolution.x / 2)), (r = Math.round(this.resolution.y / 2)));
    for (let c = 0; c < this.nMips; c++)
      (this.separableBlurMaterials.push(this.getSeperableBlurMaterial(l[c])),
        (this.separableBlurMaterials[c].uniforms.invSize.value = new THREE.Vector2(1 / o, 1 / r)),
        (o = Math.round(o / 2)),
        (r = Math.round(r / 2)));
    ((this.compositeMaterial = this.getCompositeMaterial(this.nMips)),
      (this.compositeMaterial.uniforms.blurTexture1.value = this.renderTargetsVertical[0].texture),
      (this.compositeMaterial.uniforms.blurTexture2.value = this.renderTargetsVertical[1].texture),
      (this.compositeMaterial.uniforms.blurTexture3.value = this.renderTargetsVertical[2].texture),
      (this.compositeMaterial.uniforms.blurTexture4.value = this.renderTargetsVertical[3].texture),
      (this.compositeMaterial.uniforms.blurTexture5.value = this.renderTargetsVertical[4].texture),
      (this.compositeMaterial.uniforms.bloomStrength.value = e),
      (this.compositeMaterial.uniforms.bloomRadius.value = 0.1));
    let f = [1, 0.8, 0.6, 0.4, 0.2];
    ((this.compositeMaterial.uniforms.bloomFactors.value = f),
      (this.bloomTintColors = [
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
      ]),
      (this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors));
    let u = cp;
    ((this.copyUniforms = THREE.UniformsUtils.clone(u.uniforms)),
      (this.blendMaterial = new THREE.ShaderMaterial({
        uniforms: this.copyUniforms,
        vertexShader: u.vertexShader,
        fragmentShader: u.fragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: !1,
        depthWrite: !1,
        transparent: !0,
      })),
      (this.enabled = !0),
      (this.needsSwap = !1),
      (this._oldClearColor = new THREE.Color()),
      (this.oldClearAlpha = 1),
      (this.basic = new THREE.MeshBasicMaterial()),
      (this.fsQuad = new Dr(null)));
  }
  dispose() {
    for (let t = 0; t < this.renderTargetsHorizontal.length; t++) this.renderTargetsHorizontal[t].dispose();
    for (let t = 0; t < this.renderTargetsVertical.length; t++) this.renderTargetsVertical[t].dispose();
    this.renderTargetBright.dispose();
    for (let t = 0; t < this.separableBlurMaterials.length; t++) this.separableBlurMaterials[t].dispose();
    (this.compositeMaterial.dispose(), this.blendMaterial.dispose(), this.basic.dispose(), this.fsQuad.dispose());
  }
  setSize(t, e) {
    let i = Math.round(t / 2),
      s = Math.round(e / 2);
    this.renderTargetBright.setSize(i, s);
    for (let o = 0; o < this.nMips; o++)
      (this.renderTargetsHorizontal[o].setSize(i, s),
        this.renderTargetsVertical[o].setSize(i, s),
        (this.separableBlurMaterials[o].uniforms.invSize.value = new THREE.Vector2(1 / i, 1 / s)),
        (i = Math.round(i / 2)),
        (s = Math.round(s / 2)));
  }
  render(t, e, i, s, o) {
    (t.getClearColor(this._oldClearColor), (this.oldClearAlpha = t.getClearAlpha()));
    let r = t.autoClear;
    ((t.autoClear = !1),
      t.setClearColor(this.clearColor, 0),
      o && t.state.buffers.stencil.setTest(!1),
      this.renderToScreen &&
        ((this.fsQuad.material = this.basic), (this.basic.map = i.texture), t.setRenderTarget(null), t.clear(), this.fsQuad.render(t)),
      (this.highPassUniforms.tDiffuse.value = i.texture),
      (this.highPassUniforms.luminosityThreshold.value = this.threshold),
      (this.fsQuad.material = this.materialHighPassFilter),
      t.setRenderTarget(this.renderTargetBright),
      t.clear(),
      this.fsQuad.render(t));
    let a = this.renderTargetBright;
    for (let l = 0; l < this.nMips; l++)
      ((this.fsQuad.material = this.separableBlurMaterials[l]),
        (this.separableBlurMaterials[l].uniforms.colorTexture.value = a.texture),
        (this.separableBlurMaterials[l].uniforms.direction.value = n.BlurDirectionX),
        t.setRenderTarget(this.renderTargetsHorizontal[l]),
        t.clear(),
        this.fsQuad.render(t),
        (this.separableBlurMaterials[l].uniforms.colorTexture.value = this.renderTargetsHorizontal[l].texture),
        (this.separableBlurMaterials[l].uniforms.direction.value = n.BlurDirectionY),
        t.setRenderTarget(this.renderTargetsVertical[l]),
        t.clear(),
        this.fsQuad.render(t),
        (a = this.renderTargetsVertical[l]));
    ((this.fsQuad.material = this.compositeMaterial),
      (this.compositeMaterial.uniforms.bloomStrength.value = this.strength),
      (this.compositeMaterial.uniforms.bloomRadius.value = this.radius),
      (this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors),
      t.setRenderTarget(this.renderTargetsHorizontal[0]),
      t.clear(),
      this.fsQuad.render(t),
      (this.fsQuad.material = this.blendMaterial),
      (this.copyUniforms.tDiffuse.value = this.renderTargetsHorizontal[0].texture),
      o && t.state.buffers.stencil.setTest(!0),
      this.renderToScreen ? (t.setRenderTarget(null), this.fsQuad.render(t)) : (t.setRenderTarget(i), this.fsQuad.render(t)),
      t.setClearColor(this._oldClearColor, this.oldClearAlpha),
      (t.autoClear = r));
  }
  getSeperableBlurMaterial(t) {
    let e = [];
    for (let i = 0; i < t; i++) e.push((0.39894 * Math.exp((-0.5 * i * i) / (t * t))) / t);
    return new THREE.ShaderMaterial({
      defines: {
        KERNEL_RADIUS: t,
      },
      uniforms: {
        colorTexture: {
          value: null,
        },
        invSize: {
          value: new THREE.Vector2(0.5, 0.5),
        },
        direction: {
          value: new THREE.Vector2(0.5, 0.5),
        },
        gaussianCoefficients: {
          value: e,
        },
      },
      vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
      fragmentShader: `#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`,
    });
  }
  getCompositeMaterial(t) {
    return new THREE.ShaderMaterial({
      defines: {
        NUM_MIPS: t,
      },
      uniforms: {
        blurTexture1: {
          value: null,
        },
        blurTexture2: {
          value: null,
        },
        blurTexture3: {
          value: null,
        },
        blurTexture4: {
          value: null,
        },
        blurTexture5: {
          value: null,
        },
        bloomStrength: {
          value: 1,
        },
        bloomFactors: {
          value: null,
        },
        bloomTintColors: {
          value: null,
        },
        bloomRadius: {
          value: 0,
        },
      },
      vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
      fragmentShader: `varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`,
    });
  }
};
f0.BlurDirectionX = new THREE.Vector2(1, 0);
f0.BlurDirectionY = new THREE.Vector2(0, 1);
var pv = {
  name: 'OutputShader',
  uniforms: {
    tDiffuse: {
      value: null,
    },
    toneMappingExposure: {
      value: 1,
    },
  },
  vertexShader: `
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
  fragmentShader: `
	
		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`,
};
var pp = class extends cs {
  constructor() {
    super();
    let t = pv;
    ((this.uniforms = THREE.UniformsUtils.clone(t.uniforms)),
      (this.material = new THREE.RawShaderMaterial({
        name: t.name,
        uniforms: this.uniforms,
        vertexShader: t.vertexShader,
        fragmentShader: t.fragmentShader,
      })),
      (this.fsQuad = new Dr(this.material)),
      (this._outputColorSpace = null),
      (this._toneMapping = null));
  }
  render(t, e, i) {
    ((this.uniforms.tDiffuse.value = i.texture),
      (this.uniforms.toneMappingExposure.value = t.toneMappingExposure),
      (this._outputColorSpace !== t.outputColorSpace || this._toneMapping !== t.toneMapping) &&
        ((this._outputColorSpace = t.outputColorSpace),
        (this._toneMapping = t.toneMapping),
        (this.material.defines = {}),
        THREE.ColorManagement.getTransfer(this._outputColorSpace) === THREE.SRGBTransfer && (this.material.defines.SRGB_TRANSFER = ''),
        this._toneMapping === THREE.LinearToneMapping
          ? (this.material.defines.LINEAR_TONE_MAPPING = '')
          : this._toneMapping === THREE.ReinhardToneMapping
            ? (this.material.defines.REINHARD_TONE_MAPPING = '')
            : this._toneMapping === THREE.CineonToneMapping
              ? (this.material.defines.CINEON_TONE_MAPPING = '')
              : this._toneMapping === THREE.ACESFilmicToneMapping
                ? (this.material.defines.ACES_FILMIC_TONE_MAPPING = '')
                : this._toneMapping === THREE.AgXToneMapping
                  ? (this.material.defines.AGX_TONE_MAPPING = '')
                  : this._toneMapping === THREE.NeutralToneMapping && (this.material.defines.NEUTRAL_TONE_MAPPING = ''),
        (this.material.needsUpdate = !0)),
      this.renderToScreen === !0
        ? (t.setRenderTarget(null), this.fsQuad.render(t))
        : (t.setRenderTarget(e), this.clear && t.clear(t.autoClearColor, t.autoClearDepth, t.autoClearStencil), this.fsQuad.render(t)));
  }
  dispose() {
    (this.material.dispose(), this.fsQuad.dispose());
  }
};
var ce = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Yu Gothic","Meiryo","Noto Sans JP",sans-serif';
function Ne(n, t) {
  let e = document.createElement('canvas');
  return ((e.width = n), (e.height = t), [e, e.getContext('2d')]);
}
function Fe(n, t = {}) {
  let e = new THREE.CanvasTexture(n);
  return (
    (e.anisotropy = t.aniso ?? 8),
    (e.colorSpace = t.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace),
    t.rep !== !1 && (e.wrapS = e.wrapT = THREE.RepeatWrapping),
    t.dyn || (e.onUpdate = P2),
    e
  );
}
function P2(n) {
  let t = n.image;
  (t && t.getContext && t.width > 1 && ((t.width = 1), (t.height = 1)), (n.onUpdate = null));
}
var z2 = 99,
  mn = () => ((z2 = (z2 * 16807) % 2147483647), (z2 - 1) / 2147483646);
function k2(n, t, e, i, s, o) {
  let r = n.getImageData(0, 0, t, e),
    a = r.data;
  for (let l = 0; l < a.length; l += 4) {
    let f = (mn() - 0.5) * s;
    ((a[l] = i[0] + f), (a[l + 1] = i[1] + f), (a[l + 2] = i[2] + f), (a[l + 3] = 255));
  }
  n.putImageData(r, 0, 0);
}
function mv() {
  let [n, t] = Ne(512, 512);
  k2(t, 512, 512, [70, 72, 76], 26);
  for (let e = 0; e < 1400; e++) {
    t.fillStyle = `rgba(${mn() < 0.5 ? 30 : 120},${mn() < 0.5 ? 30 : 120},${mn() < 0.5 ? 34 : 124},${mn() * 0.25})`;
    let i = 1 + mn() * 3;
    t.fillRect(mn() * 512, mn() * 512, i, i);
  }
  ((t.strokeStyle = 'rgba(25,25,28,0.45)'), (t.lineWidth = 1.2));
  for (let e = 0; e < 14; e++) {
    t.beginPath();
    let i = mn() * 512,
      s = mn() * 512;
    t.moveTo(i, s);
    for (let o = 0; o < 8; o++) ((i += (mn() - 0.5) * 40), (s += (mn() - 0.5) * 40), t.lineTo(i, s));
    t.stroke();
  }
  for (let e = 0; e < 6; e++)
    ((t.fillStyle = `rgba(40,40,44,${0.15 + mn() * 0.2})`), t.fillRect(mn() * 512, mn() * 512, 40 + mn() * 120, 30 + mn() * 90));
  return Fe(n);
}
function xv() {
  let [n, t] = Ne(256, 256);
  ((t.fillStyle = '#9d9a94'), t.fillRect(0, 0, 256, 256));
  for (let e = 0; e < 8; e++)
    for (let i = 0; i < 4; i++) {
      let s = e % 2 ? 32 : 0,
        o = 140 + mn() * 30;
      ((t.fillStyle = `rgb(${o},${o - 3},${o - 8})`),
        t.fillRect(i * 64 + s + 1, e * 32 + 1, 62, 30),
        t.fillRect(i * 64 + s - 255, e * 32 + 1, 62, 30));
    }
  ((t.fillStyle = '#d9b420'), t.fillRect(96, 0, 30, 256), (t.fillStyle = 'rgba(0,0,0,.18)'));
  for (let e = 4; e < 256; e += 8) for (let i = 0; i < 3; i++) t.fillRect(100 + i * 9, e, 5, 3);
  return Fe(n);
}
function gv(n = [150, 148, 142]) {
  let [t, e] = Ne(256, 256);
  k2(e, 256, 256, n, 18);
  for (let i = 0; i < 40; i++) ((e.fillStyle = `rgba(0,0,0,${mn() * 0.06})`), e.fillRect(mn() * 256, mn() * 256, 20 + mn() * 80, 8 + mn() * 40));
  return Fe(t);
}
function Mv() {
  let [n, t] = Ne(256, 256);
  k2(t, 256, 256, [78, 112, 58], 34);
  for (let e = 0; e < 300; e++)
    ((t.fillStyle = `rgba(${mn() < 0.5 ? 60 : 110},${mn() < 0.5 ? 90 : 140},40,0.3)`), t.fillRect(mn() * 256, mn() * 256, 2, 5));
  return Fe(n);
}
function yv() {
  let [t, e] = Ne(256, 256),
    i = e.createImageData(256, 256),
    s = i.data,
    o = (r, a) => {
      let l = 0;
      for (let f = 1; f <= 4; f++) l += Math.sin((((r * (f * 1.7 + 0.3) + a * (f * 0.9 - 1.1)) * Math.PI * 2) / 256) * f * 2 + f * 1.3) / f;
      return l;
    };
  for (let r = 0; r < 256; r++)
    for (let a = 0; a < 256; a++) {
      let l = o(a + 1, r) - o(a - 1, r),
        f = o(a, r + 1) - o(a, r - 1),
        u = (r * 256 + a) * 4;
      ((s[u] = 128 + l * 40), (s[u + 1] = 128 + f * 40), (s[u + 2] = 255), (s[u + 3] = 255));
    }
  return (
    e.putImageData(i, 0, 0),
    Fe(t, {
      linear: !0,
    })
  );
}
function bv() {
  let [n, t] = Ne(256, 64);
  (t.clearRect(0, 0, 256, 64), (t.fillStyle = '#fff'));
  let e = 256 / 12;
  for (let i = 0; i < 12; i++) t.fillRect(i * e + e * 0.22, 2, e * 0.56, 60);
  return Fe(n, {
    rep: !1,
  });
}
var _9 = [
    '\u5C45\u9152\u5C4B',
    '\u30E9\u30FC\u30E1\u30F3',
    '\u30AB\u30E9\u30AA\u30B1',
    '\u713C\u8089',
    '\u5BFF\u53F8',
    '\u85AC',
    '\u30DB\u30C6\u30EB',
    '\u6F2B\u753B\u55AB\u8336',
    '\u725B\u4E3C',
    '\u6B6F\u79D1',
    '\u4E0D\u52D5\u7523',
    '\u9EBB\u96C0',
    '\u4E2D\u83EF\u6599\u7406',
    '\u7F8E\u5BB9\u5BA4',
    '\u53E4\u7740',
    '\u30B2\u30FC\u30E0',
    '\u713C\u9CE5',
    '\u3046\u3069\u3093',
    '\u305D\u3070',
    '\u5929\u3077\u3089',
    '\u8CEA',
    '\u6574\u4F53',
    '\u82F1\u4F1A\u8A71',
    '\u5B66\u7FD2\u587E',
    '\u30AF\u30EA\u30CB\u30C3\u30AF',
    '\u773C\u79D1',
    '\u55AB\u8336',
    '\u9152\u5834',
    '\u30B9\u30CA\u30C3\u30AF',
    '\u92AD\u6E6F',
    '\u5B9A\u98DF',
    '\u5199\u771F',
  ],
  w9 = [
    '\u30BB\u30D6\u30F3\u30C7\u30A4\u30BA',
    '\u30D5\u30A1\u30DF\u30EA\u30FC\u30DD\u30FC\u30C8',
    '\u30ED\u30FC\u30BD\u30AF',
    '\u30C9\u30E9\u30C3\u30B0\u677E\u7AF9',
    '\u725B\u4E3C\u3059\u304D\u3084\u4E38',
    '\u55AB\u8336\u3072\u306A\u305F',
    '\u30B2\u30FC\u30E0\u30BB\u30F3\u30BF\u30FC',
    '\u30D6\u30C3\u30AF\u30E9\u30F3\u30C9',
    '\u6FC0\u5B89\u306E\u6BBF\u5802\u30C9\u30F3\u30C9\u30F3',
    '\u30AB\u30E1\u30E9\u306E\u30E8\u30C9\u30AC\u30EF',
    '\u30AB\u30E1\u30E9\u306E\u30D3\u30C3\u30B0',
    '\u30E6\u30CB\u30D5\u30A9\u30FC\u30E0',
    '100\u5747\u30C0\u30A4',
    '\u725B\u4E3C\u5409\u7530\u5BB6',
    '\u73C8\u7432\u30B9\u30BF\u30FC',
    '\u30D0\u30FC\u30AC\u30FC\u30AD\u30C3\u30C1\u30F3',
    '\u7ACB\u3061\u305D\u3070\u5BCC\u58EB\u898B',
    '\u4E2D\u83EF\u65E5\u9AD8\u898B',
    '\u3089\u30FC\u3081\u3093\u5929\u4E0B',
    '\u3068\u3093\u3053\u3064\u4E00\u862D\u4EAD',
    '\u30D5\u30E9\u30A4\u30C9\u30C1\u30AD\u30F3\u5357',
    '\u30E2\u30C3\u30AF\u30D0\u30FC\u30AC\u30FC',
    '\u30A4\u30BF\u30EA\u30A2\u98DF\u5802',
    '\u55AB\u8336\u30B3\u30E1\u30C3\u30C8',
    '\u30AB\u30E9\u30AA\u30B1\u9928',
    '\u307E\u3093\u304C\u55AB\u8336',
    '\u30B3\u30A4\u30F3\u30E9\u30F3\u30C9\u30EA\u30FC',
    '\u56DE\u8EE2\u5BFF\u53F8',
    '\u30D1\u30C1\u30F3\u30B3',
    '\u6574\u9AA8\u9662',
    '\u30AF\u30EA\u30FC\u30CB\u30F3\u30B0',
    'PHARMACY',
    '\u30E6\u30CB\u30AF\u30ED\u30B9',
    '\u7121\u5730\u826F\u54C1',
    '\u30CB\u30C8\u30ED',
    'ABB\u30DE\u30FC\u30C8',
    '\u30DE\u30C4\u30E2\u30C8\u30AD\u30E8\u30DF',
    '\u30B9\u30AE\u85AC\u54C1',
    '\u30B5\u30A4\u30BC\u30EA\u30E4\u30F3',
    '\u30AC\u30B9\u30C8\u30F3',
    '\u677E\u5C4B\u6577',
    '\u3066\u3093\u3084\u3093',
    '\u30AB\u30EC\u30FC\u306E\u58F1\u5C4B',
    '\u5927\u6238\u5C4B\u6577',
    '\u30DF\u30B9\u30BF\u30FC\u30C9\u30FC\u30E0',
    '\u30B9\u30BF\u30D0\u30C3\u30AF\u30B9',
    '\u30BF\u30EA\u30FC\u30BA\u30F3',
    '\u30C9\u30C8\u30FC\u30EB\u30F3',
    '\u9CE5\u738B\u65CF',
    '\u548C\u6C11\u5BB6',
    '\u9B5A\u306E\u6C11',
    '\u767D\u6728\u5BB6',
    '\u306A\u304B\u514E',
    '\u30ED\u30A4\u30E4\u30EB\u30DD\u30B9\u30C8',
    '\u30C7\u30CB\u30FC\u30BC',
    '\u30D3\u30C3\u30B0\u30A8\u30B3\u30ED',
    '\u307E\u306D\u304D\u3044\u306C',
    'TSUTAYO',
    'BOOK ON',
    '\u4E09\u89D2\u4F4F\u53CB\u9280\u884C',
    '\u307F\u305A\u304B\u9280\u884C',
    '\u4E09\u83F1UFO\u9280\u884C',
    '\u30A2\u30D1\u30DE\u30BD\u30B7\u30E7\u30C3\u30D7',
    '\u713C\u8089 \u725B\u683C',
  ];
function vv() {
  let [n, t] = Ne(2048, 1024);
  ((t.fillStyle = '#222'), t.fillRect(0, 0, 2048, 1024));
  let e = [
    ['#c8102e', '#fff'],
    ['#ffd400', '#141414'],
    ['#fff', '#c8102e'],
    ['#0b3d91', '#fff'],
    ['#141414', '#ffd400'],
    ['#0a7d3b', '#fff'],
    ['#e4007f', '#fff'],
    ['#ff6a00', '#fff'],
    ['#5a2d82', '#fff'],
    ['#f4ead2', '#7a2e12'],
  ];
  for (let s = 0; s < 32; s++) {
    let [o, r] = e[(s * 3) % e.length],
      a = s * 64;
    ((t.fillStyle = o),
      t.fillRect(a, 0, 64, 512),
      (t.strokeStyle = r),
      (t.globalAlpha = 0.5),
      (t.lineWidth = 3),
      t.strokeRect(a + 5, 5, 54, 502),
      (t.globalAlpha = 1));
    let l = Array.from(_9[s]),
      f = Math.min(50, 430 / l.length);
    ((t.fillStyle = r), (t.font = `900 ${f}px ${ce}`), (t.textAlign = 'center'), (t.textBaseline = 'middle'));
    let u = (512 - l.length * f * 1.08) / 2 + f * 0.54;
    for (let c of l)
      (c === '\u30FC' ? (t.save(), t.translate(a + 32, u), t.rotate(Math.PI / 2), t.fillText(c, 0, 0), t.restore()) : t.fillText(c, a + 32, u),
        (u += f * 1.08));
  }
  let i = [
    ['#fff', '#d71921', '#0a8a3a'],
    ['#0b3d91', '#fff', '#68c'],
    ['#c8102e', '#fff', '#fff'],
    ['#ffd400', '#1a1a1a', '#e00'],
    ['#1a1a1a', '#ffd400', '#ffd400'],
    ['#0a7d3b', '#fff', '#fff'],
    ['#f4ead2', '#7a2e12', '#7a2e12'],
    ['#e4007f', '#fff', '#fff'],
    ['#fff', '#1b4fa8', '#1b4fa8'],
    ['#d4121f', '#ffe600', '#ffe600'],
    ['#2a2d33', '#fff', '#e86a17'],
  ];
  for (let s = 0; s < 8; s++)
    for (let o = 0; o < 8; o++) {
      let r = s * 8 + o,
        [a, l, f] = i[(r * 7) % i.length],
        u = o * 256,
        c = 512 + s * 64;
      ((t.fillStyle = a), t.fillRect(u, c, 256, 64), (t.fillStyle = f), t.fillRect(u, c, 256, 6), t.fillRect(u, c + 58, 256, 6));
      let h = w9[r],
        d = 34;
      for (t.font = `900 ${d}px ${ce}`; t.measureText(h).width > 230 && d > 12;) ((d -= 2), (t.font = `900 ${d}px ${ce}`));
      ((t.fillStyle = l), (t.textAlign = 'center'), (t.textBaseline = 'middle'), t.fillText(h, u + 128, c + 33));
    }
  return Fe(n, {
    rep: !1,
    aniso: 4,
  });
}
function _v() {
  let [n, t] = Ne(1024, 256),
    e = [
      ['\u65B0\u767A\u58F2', 'NEW DRINK', '#e4007f'],
      ['SHUTO', 'MOTORS', '#0b3d91'],
      ['\u6771\u4EAC', 'FESTIVAL', '#c8102e'],
      ['\u590F', 'SALE', '#ff6a00'],
      ['\u8EE2\u8077\u306A\u3089', '\u30B8\u30E7\u30D6\u30CD\u30AF\u30B9\u30C8', '#0a7d3b'],
      ['\u5287\u5834\u7248', '\u8FD1\u65E5\u516C\u958B', '#5a2d82'],
      ['\u30D3\u30FC\u30EB', '\u30AD\u30EA\u3063\u3068\u4E00\u676F', '#c9a33a'],
      ['\u82F1\u4F1A\u8A71', '\u306F\u3058\u3081\u3088\u3046', '#1b4fa8'],
    ];
  for (let i = 0; i < 8; i++) {
    let [s, o, r] = e[i],
      a = (i % 4) * 256,
      l = Math.floor(i / 4) * 128,
      f = t.createLinearGradient(a, l, a + 256, l + 128);
    (f.addColorStop(0, r),
      f.addColorStop(1, '#111'),
      (t.fillStyle = f),
      t.fillRect(a, l, 256, 128),
      (t.fillStyle = '#fff'),
      (t.textAlign = 'center'));
    let u = 52;
    for (t.font = `900 ${u}px ${ce}`; t.measureText(s).width > 236 && u > 20;) ((u -= 4), (t.font = `900 ${u}px ${ce}`));
    (t.fillText(s, a + 128, l + 66), (t.font = `800 20px ${ce}`), t.fillText(o, a + 128, l + 102));
  }
  return Fe(n, {
    rep: !1,
  });
}
function wv(n, t = 512, e = 128, i = '#1d4fa6', s = '#fff') {
  let [o, r] = Ne(t, e);
  ((r.fillStyle = i),
    r.fillRect(0, 0, t, e),
    (r.strokeStyle = s),
    (r.lineWidth = 6),
    r.strokeRect(6, 6, t - 12, e - 12),
    (r.fillStyle = s),
    (r.textAlign = 'center'),
    (r.textBaseline = 'middle'));
  let a = n.length;
  return (
    n.forEach((l, f) => {
      let u = Math.min(64, (e - 30) / a);
      for (r.font = `900 ${u}px ${ce}`; r.measureText(l).width > t - 40 && u > 12;) ((u -= 2), (r.font = `900 ${u}px ${ce}`));
      r.fillText(l, t / 2, 15 + ((f + 0.5) * (e - 30)) / a);
    }),
    Fe(o, {
      rep: !1,
    })
  );
}
function Sv() {
  let [n, t] = Ne(128, 256);
  ((t.fillStyle = '#f6f6f2'), t.fillRect(0, 0, 128, 256), (t.fillStyle = '#1b1d22'), t.fillRect(8, 10, 112, 150));
  let e = ['#d33', '#2a7', '#36c', '#fc3', '#f80', '#8c4', '#c39', '#eee', '#4cf'];
  for (let i = 0; i < 4; i++)
    for (let s = 0; s < 6; s++) ((t.fillStyle = e[(i * 6 + s * 5) % e.length]), t.fillRect(14 + s * 18, 18 + i * 36, 12, 24));
  return (
    (t.fillStyle = '#ccc'),
    t.fillRect(80, 170, 30, 40),
    (t.fillStyle = '#333'),
    t.fillRect(20, 220, 88, 22),
    Fe(n, {
      rep: !1,
    })
  );
}
var Tv = {
    low: {
      pr: 1,
      shadow: 0,
      view: 650,
      lod: 1600,
      cars: 45,
      peds: 110,
      bloom: 0,
      aa: 0,
      trees: 0.5,
    },
    mid: {
      pr: 1.5,
      shadow: 1024,
      view: 950,
      lod: 2600,
      cars: 75,
      peds: 200,
      bloom: 0,
      aa: 1,
      trees: 1,
    },
    high: {
      pr: 2,
      shadow: 2048,
      view: 1300,
      lod: 3600,
      cars: 110,
      peds: 300,
      bloom: 1,
      aa: 1,
      trees: 1,
    },
    ultra: {
      pr: 2,
      shadow: 4096,
      view: 1700,
      lod: 5e3,
      cars: 150,
      peds: 400,
      bloom: 1,
      aa: 1,
      trees: 1,
    },
  },
  R = {
    renderer: null,
    scene: null,
    camera: null,
    sun: null,
    hemi: null,
    sky: null,
    composer: null,
    Q: Tv.mid,
    qName: 'mid',
    night: 0,
    dusk: 0,
    tod: 16.5,
    U: null,
    M: {},
  },
  rn = {
    uNight: {
      value: 0,
    },
    uTime: {
      value: 0,
    },
    uSky: {
      value: new THREE.Color(10274024),
    },
    uRain: {
      value: 0,
    },
  };
R.U = rn;
function Av(n, t) {
  ((R.qName = t), (R.Q = Tv[t]));
  let e = new THREE.WebGLRenderer({
    canvas: n,
    antialias: !!R.Q.aa,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: !1,
  });
  (e.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.Q.pr)),
    e.setSize(innerWidth, innerHeight, !1),
    (e.toneMapping = THREE.ACESFilmicToneMapping),
    (e.toneMappingExposure = 0.8),
    (e.outputColorSpace = THREE.SRGBColorSpace),
    R.Q.shadow && ((e.shadowMap.enabled = !0), (e.shadowMap.type = THREE.PCFSoftShadowMap)),
    (R.renderer = e));
  let i = new THREE.Scene();
  if (
    ((R.scene = i),
    (i.fog = new THREE.Fog(12375014, 400, R.Q.lod * 1.05)),
    (R.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, R.Q.lod * 1.6 + 1500)),
    (R.hemi = new THREE.HemisphereLight(13624319, 5918792, 0.9)),
    i.add(R.hemi),
    (R.sun = new THREE.DirectionalLight(16773596, 2.4)),
    R.Q.shadow)
  ) {
    ((R.sun.castShadow = !0), R.sun.shadow.mapSize.set(R.Q.shadow, R.Q.shadow));
    let r = R.sun.shadow.camera,
      a = R.Q.shadow >= 4096 ? 180 : 130;
    ((r.left = -a),
      (r.right = a),
      (r.top = a),
      (r.bottom = -a),
      (r.near = 10),
      (r.far = 1400),
      (R.sun.shadow.bias = -4e-4),
      (R.sun.shadow.normalBias = 0.6));
  }
  (i.add(R.sun), i.add(R.sun.target));
  let s = new c0();
  (s.scale.setScalar(R.camera.far * 0.9), i.add(s), (R.sky = s));
  let o = s.material.uniforms;
  ((o.turbidity.value = 6),
    (o.rayleigh.value = 1.6),
    (o.mieCoefficient.value = 0.004),
    (o.mieDirectionalG.value = 0.85),
    (s.material.depthWrite = !1),
    (s.renderOrder = -10),
    (s.frustumCulled = !1),
    (R.dome = E9(R.camera.far * 0.85)),
    i.add(R.dome),
    (R.pmrem = new THREE.PMREMGenerator(e)),
    (R.envScene = new THREE.Scene()),
    (R.envSky = new c0()),
    R.envSky.scale.setScalar(1e3),
    R.envScene.add(R.envSky));
  for (let r of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) R.envSky.material.uniforms[r].value = o[r].value;
  if (R.Q.bloom) {
    let r = new up(e);
    (r.addPass(new dp(i, R.camera)),
      (R.bloom = new f0(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.92)),
      r.addPass(R.bloom),
      r.addPass(new pp()),
      (R.composer = r));
  }
  return (T9(), addEventListener('resize', S9), R);
}
function S9() {
  let n = R.renderer;
  n &&
    (n.setSize(innerWidth, innerHeight, !1),
    (R.camera.aspect = innerWidth / innerHeight),
    R.camera.updateProjectionMatrix(),
    R.composer && R.composer.setSize(innerWidth, innerHeight));
}
function E9(n) {
  let t = new THREE.SphereGeometry(n, 32, 16),
    e = new THREE.ShaderMaterial({
      uniforms: {
        night: rn.uNight,
        time: rn.uTime,
        sunDir: {
          value: new THREE.Vector3(0, 1, 0),
        },
        tint: {
          value: new THREE.Color(1, 1, 1),
        },
        rain: rn.uRain,
      },
      transparent: !0,
      depthWrite: !1,
      side: THREE.BackSide,
      fog: !1,
      vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float night,time,rain;uniform vec3 sunDir,tint;varying vec3 vD;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*n2(p);p*=2.03;a*=0.5;}return v;}
void main(){vec3 d=normalize(vD);float y=d.y;vec4 c=vec4(0.0);
if(y>0.0){vec2 uv=d.xz/(y+0.08)*0.9+vec2(time*0.002,time*0.001);
float cl=fbm(uv*1.4);cl=smoothstep(0.5-rain*0.35,0.85,cl)*smoothstep(0.0,0.18,y);
float lit=0.65+0.35*max(dot(d,sunDir),0.0);
vec3 cc=mix(tint*lit,vec3(0.07,0.08,0.11),night*0.85);cc=mix(cc,vec3(0.45,0.47,0.5)*(1.0-night*0.8),rain*0.6);
c=vec4(cc,cl*0.85);
vec3 q=floor(d*260.0);float st=step(0.9975,h3(q))*night*(1.0-cl)*smoothstep(0.05,0.3,y)*(1.0-rain);
c.rgb+=vec3(st);c.a=max(c.a,st);
float moon=pow(max(dot(d,-sunDir),0.0),1500.0)*night*3.0;c.rgb+=vec3(moon*0.9,moon*0.92,moon);c.a=max(c.a,min(1.0,moon));}
gl_FragColor=c;}`,
    }),
    i = new THREE.Mesh(t, e);
  return ((i.frustumCulled = !1), (i.renderOrder = -9), i);
}
function T9() {
  let n = R.M;
  ((n.asphaltTex = mv()),
    (n.walkTex = xv()),
    (n.concTex = gv()),
    (n.grassTex = Mv()),
    (n.road = new THREE.MeshStandardMaterial({
      map: n.asphaltTex,
      roughness: 0.92,
      metalness: 0,
    })),
    (n.road.onBeforeCompile = (t) => {
      ((t.uniforms.uRain = rn.uRain),
        (t.fragmentShader = t.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
uniform float uRain;`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,0.18,uRain);`,
          )));
    }),
    (n.express = new THREE.MeshStandardMaterial({
      map: n.asphaltTex,
      roughness: 0.9,
      color: 14211288,
    })),
    (n.walk = new THREE.MeshStandardMaterial({
      map: n.walkTex,
      color: 11052706,
      roughness: 0.85,
    })),
    (n.curb = new THREE.MeshStandardMaterial({
      color: 12170926,
      roughness: 0.8,
    })),
    (n.ground = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      map: n.concTex,
      roughness: 0.95,
    })),
    (n.grass = new THREE.MeshStandardMaterial({
      map: n.grassTex,
      roughness: 1,
    })),
    (n.concrete = new THREE.MeshStandardMaterial({
      map: n.concTex,
      color: 13617858,
      roughness: 0.85,
    })),
    (n.mark = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      roughness: 0.7,
      polygonOffset: !0,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    })),
    (n.cross = new THREE.MeshStandardMaterial({
      map: bv(),
      transparent: !0,
      alphaTest: 0.5,
      roughness: 0.7,
      polygonOffset: !0,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    })),
    (n.metal = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      roughness: 0.45,
      metalness: 0.6,
    })),
    (n.paint = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      roughness: 0.75,
      metalness: 0.05,
    })),
    (n.leaf = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      roughness: 0.9,
      flatShading: !0,
    })),
    (n.glow = new THREE.MeshBasicMaterial({
      vertexColors: !0,
      toneMapped: !1,
    })),
    (n.lamp = new THREE.MeshBasicMaterial({
      color: 8947848,
      toneMapped: !1,
    })),
    (n.atlas = vv()),
    (n.sign = new THREE.MeshStandardMaterial({
      map: n.atlas,
      emissiveMap: n.atlas,
      emissive: 16777215,
      emissiveIntensity: 0.3,
      roughness: 0.6,
    })),
    (n.billboard = new THREE.MeshStandardMaterial({
      map: _v(),
      emissive: 16777215,
      emissiveIntensity: 0.3,
      roughness: 0.6,
    })),
    (n.billboard.emissiveMap = n.billboard.map),
    (n.vend = new THREE.MeshBasicMaterial({
      map: Sv(),
      toneMapped: !1,
    })),
    (n.water = new THREE.MeshStandardMaterial({
      color: 1916757,
      roughness: 0.08,
      metalness: 0.15,
      normalMap: yv(),
      normalScale: new THREE.Vector2(0.35, 0.35),
    })),
    n.water.normalMap.repeat.set(160, 160),
    (n.building = Ev(!1)),
    (n.buildingFar = Ev(!0)),
    (n.roof = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      map: n.concTex,
      roughness: 0.9,
    })),
    (n.glass = new THREE.MeshStandardMaterial({
      color: 9417928,
      roughness: 0.05,
      metalness: 0.9,
      transparent: !0,
      opacity: 0.55,
    })));
}
function Ev(n) {
  let t = new THREE.MeshStandardMaterial({
    vertexColors: !0,
    roughness: 0.82,
    metalness: 0,
  });
  return (
    (t.onBeforeCompile = (e) => {
      ((e.uniforms.uNight = rn.uNight),
        (e.uniforms.uSky = rn.uSky),
        (e.vertexShader = e.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
attribute vec4 aB;attribute vec2 aF;varying vec4 vB;varying vec2 vF;varying vec3 vWN;varying float vWY;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
vB=aB;vF=aF;vWN=normal;vWY=position.y;`,
          )),
        (e.fragmentShader = e.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
uniform float uNight;uniform vec3 uSky;varying vec4 vB;varying vec2 vF;varying vec3 vWN;varying float vWY;
float bh(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float gWin=0.0;float gCurt=0.0;`,
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
vec3 bEm=vec3(0.0);
{float st=vB.x,sd=vB.y,fh=vB.z,lp=vB.w;
if(abs(vWN.y)<0.5){
 float ww=st<1.5?2.6:(st<2.5?2.4:(st<3.5?3.4:1.8));
 if(st<0.5)ww=2.8;
 vec2 cl=vec2(vF.x/ww,vF.y/fh);vec2 f=fract(cl);vec2 id=floor(cl);
 float w=0.0;
 if(st<0.5) w=step(0.25,f.x)*step(f.x,0.75)*step(0.35,f.y)*step(f.y,0.8);
 else if(st<1.5) w=step(0.14,f.x)*step(f.x,0.86)*step(0.4,f.y)*step(f.y,0.92);
 else if(st<2.5) w=step(0.2,f.x)*step(f.x,0.8)*step(0.3,f.y)*step(f.y,0.84);
 else if(st<3.5) w=step(0.36,f.y)*step(f.y,0.9)*step(0.04,f.x);
 else if(st<4.5) w=step(0.06,f.x)*step(0.08,f.y);
 else w=step(0.1,f.x)*step(f.x,0.9)*step(0.3,f.y)*step(f.y,0.85);
 float gf=1.0-step(1.0,id.y);
 if(st>4.5&&st<5.5)gf=1.0-step(1.0,vF.y/4.2);
 float r=bh(id+vec2(sd*13.1,sd*7.3));
 gCurt=step(3.5,st)*step(st,4.5);
 vec3 glass=mix(vec3(0.08,0.10,0.13),uSky*0.9,0.18+0.32*gCurt);
 glass=mix(glass,vec3(0.03,0.035,0.05),uNight*0.85);
 diffuseColor.rgb=mix(diffuseColor.rgb,glass,w);
 gWin=w;
 float lit=step(r,lp*0.75)*(1.0-gf);
 vec3 wc=mix(vec3(1.0,0.78,0.5),vec3(0.8,0.9,1.0),step(0.6,bh(id.yx+sd*3.0)));
 bEm+=w*lit*wc*uNight*(0.5+0.4*bh(id*1.7+sd));
 bEm+=gf*w*vec3(1.0,0.9,0.75)*(0.05+0.7*uNight)*step(0.5,st)*step(st,3.5);
 if(st>0.5&&st<1.5){float par=step(f.y,0.32)*(1.0-gf);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.12+0.03,par);diffuseColor.rgb*=1.0-0.28*step(0.32,f.y)*step(f.y,0.38)*(1.0-gf);diffuseColor.rgb*=1.0-0.35*par*step(f.x,0.035);w*=1.0-par;}
 diffuseColor.rgb*=0.7+0.3*smoothstep(0.0,10.0,vF.y);
}else{diffuseColor.rgb*=0.62;}
}`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,0.08+0.3*uNight,gWin);`,
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `#include <metalnessmap_fragment>
metalnessFactor=mix(metalnessFactor,(0.55+0.3*gCurt)*(1.0-0.75*uNight),gWin);`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
totalEmissiveRadiance+=bEm;`,
          )));
    }),
    t
  );
}
var xf = new THREE.Vector3(),
  I2 = (n) => new THREE.Color(n),
  L2 = {
    day: I2(12965604),
    dusk: I2(15247480),
    night: I2(1317675),
  },
  gf = new THREE.Color(),
  D2 = -99;
function N2(n, t, e, i = 1) {
  R.tod = (R.tod + ((n * 24) / (72 * 60)) * i) % 24;
  let s = ((R.tod - 6) / 24) * Math.PI * 2,
    o = Math.sin(s);
  xf.set(Math.cos(s) * 0.85, o, 0.45).normalize();
  let r = THREE.MathUtils.smoothstep(-o, -0.06, 0.16),
    a = Math.exp(-(((o - 0.03) / 0.16) ** 2));
  ((R.night = r), (R.dusk = a), (rn.uNight.value = r));
  let l = R.sky.material.uniforms;
  (l.sunPosition.value.copy(xf).multiplyScalar(1e3),
    (l.rayleigh.value = 1.2 + 1.8 * a),
    (l.turbidity.value = 5 + 6 * rn.uRain.value),
    R.dome.material.uniforms.sunDir.value.copy(xf),
    R.dome.material.uniforms.tint.value.setRGB(1, 0.92 - 0.25 * a, 0.88 - 0.4 * a),
    gf
      .copy(L2.day)
      .lerp(L2.dusk, a * (1 - r * 0.5))
      .lerp(L2.night, r),
    gf.lerp(new THREE.Color(9080983), rn.uRain.value * 0.6 * (1 - r)),
    R.scene.fog.color.copy(gf),
    rn.uSky.value.copy(gf));
  let f = o > -0.06,
    u = f ? xf : xf.clone().negate();
  ((R.sun.intensity = f ? Math.max(0, o) ** 0.45 * 1.75 * (1 - r) * (1 - rn.uRain.value * 0.6) + 0.05 : 0.25),
    R.sun.color.setRGB(f ? 1 : 0.55, f ? 0.92 - 0.25 * a : 0.66, f ? 0.82 - 0.45 * a : 0.95),
    (R.hemi.intensity = 0.65 - 0.25 * r),
    R.hemi.color
      .setRGB(0.75, 0.83, 1)
      .lerp(gf.clone().multiplyScalar(1.5), 0.3)
      .lerp(new THREE.Color(0.32, 0.38, 0.6), r),
    R.hemi.groundColor.setRGB(0.36, 0.32, 0.28).lerp(new THREE.Color(0.35, 0.24, 0.16), r * 0.8),
    (R.renderer.toneMappingExposure = 0.78 + 0.3 * r));
  let c = Math.round(t / 4) * 4,
    h = Math.round(e / 4) * 4;
  if (
    (R.sun.position.set(c + u.x * 600, Math.max(60, u.y * 600), h + u.z * 600),
    R.sun.target.position.set(c, 0, h),
    R.sky.position.set(t, 0, e),
    R.dome.position.set(t, 0, e),
    R.bloom && (R.bloom.strength = 0.18 + 0.55 * r),
    Math.abs(R.tod - D2) > 0.35 || D2 < 0)
  ) {
    D2 = R.tod;
    let d = R.envSky.material.uniforms;
    (d.sunPosition.value.copy(l.sunPosition.value),
      (d.rayleigh.value = l.rayleigh.value),
      R.envRT && R.envRT.dispose(),
      (R.envRT = R.pmrem.fromScene(R.envScene, 0.04)),
      (R.scene.environment = R.envRT.texture),
      (R.scene.environmentIntensity = 0.2 + 0.35 * (1 - r)));
  }
}
function Rv() {
  R.composer ? R.composer.render() : R.renderer.render(R.scene, R.camera);
}
async function mp(n) {
  let t = await fetch(n);
  if (!t.ok) throw new Error(n + ' ' + t.status);
  let e = await t.arrayBuffer();
  if (n.endsWith('.gz')) {
    let i = new Uint8Array(e, 0, 2);
    i[0] === 31 && i[1] === 139 && (e = await U2(e));
  }
  return e;
}
async function U2(n) {
  if (typeof DecompressionStream < 'u') {
    let t = new DecompressionStream('gzip'),
      e = new Blob([n]).stream().pipeThrough(t);
    return await new Response(e).arrayBuffer();
  }
  throw new Error(
    '\u3053\u306E\u7AEF\u672B\u306F\u5727\u7E2E\u30C7\u30FC\u30BF\u306E\u5C55\u958B\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093',
  );
}
async function Cv(n) {
  let t = await fetch(n);
  if (!t.ok) throw new Error(n + ' ' + t.status);
  let e = atob((await t.text()).trim()),
    i = new Uint8Array(e.length);
  for (let s = 0; s < e.length; s++) i[s] = e.charCodeAt(s);
  return i[0] === 31 && i[1] === 139 ? await U2(i.buffer) : i.buffer;
}
async function zv(n) {
  let t = [];
  for (let o = 0; o < 16; o++) {
    let r;
    try {
      r = await fetch(`${n}.${o}.txt`);
    } catch {
      break;
    }
    if (!r.ok) break;
    let a = atob((await r.text()).trim()),
      l = new Uint8Array(a.length);
    for (let f = 0; f < a.length; f++) l[f] = a.charCodeAt(f);
    t.push(l);
  }
  if (!t.length) throw new Error(n + ' parts');
  let e = t.reduce((o, r) => o + r.length, 0),
    i = new Uint8Array(e),
    s = 0;
  for (let o of t) (i.set(o, s), (s += o.length));
  return i[0] === 31 && i[1] === 139 ? await U2(i.buffer) : i.buffer;
}
var Pv = (...n) => n.reduce((t, e) => t.catch(e), Promise.reject(new Error('start')));
async function kv(n, t) {
  t && t(0.05);
  let [e, i] = await Promise.all([
    Pv(
      () => mp(n + 'world.json.gz'),
      () => zv(n + 'world.b64'),
      () => Cv(n + 'world.b64.txt'),
      () => mp(n + 'world.json'),
    ),
    Pv(
      () => mp(n + 'buildings.bin.gz'),
      () => zv(n + 'buildings.b64'),
      () => Cv(n + 'buildings.b64.txt'),
      () => mp(n + 'buildings.bin'),
    ),
  ]);
  return (
    t && t(0.5),
    {
      json: JSON.parse(new TextDecoder().decode(e)),
      bld: new Uint8Array(i),
    }
  );
}
var WD = {};
vi(WD, {
  KINDS: () => KINDS,
  M_AIR: () => M_AIR,
  M_FOREST: () => M_FOREST,
  M_LAND: () => M_LAND,
  M_MOAT: () => M_MOAT,
  M_PALACE: () => M_PALACE,
  M_PARK: () => M_PARK,
  M_WATER: () => M_WATER,
  ROADLANES: () => ROADLANES,
  ROADW: () => ROADW,
  SIGCYC: () => SIGCYC,
  W: () => W,
  addProp: () => addProp,
  buildingsInRect: () => buildingsInRect,
  buildingsNear: () => buildingsNear,
  clearBuilding: () => clearBuilding,
  collideBuildings: () => collideBuildings,
  districtAt: () => districtAt,
  edgeBetween: () => edgeBetween,
  edgePos: () => edgePos,
  edgeY: () => edgeY,
  edgesInRect: () => edgesInRect,
  fitColliders: () => fitColliders,
  freeSpot: () => freeSpot,
  inBounds: () => inBounds,
  inPoly: () => inPoly,
  initWorld: () => initWorld,
  isWaterAt: () => isWaterAt,
  maskQ: () => maskQ,
  nearestNode: () => nearestNode,
  propChunk: () => propChunk,
  propsNear: () => propsNear,
  railFree: () => railFree,
  railHits: () => railHits,
  rayBuildings: () => rayBuildings,
  removeChunkProps: () => removeChunkProps,
  roadHits: () => roadHits,
  roadsNear: () => roadsNear,
  route: () => route,
  sigState: () => sigState,
  treeBlocked: () => treeBlocked,
  treeFree: () => treeFree,
  treeFreePoly: () => treeFreePoly,
});
var A9 = Math.cos((35.64 * Math.PI) / 180) * 111320,
  R9 = 110950,
  fe = (n, t) => [(t - 139.755) * A9, -(n - 35.64) * R9];
var xn = (() => {
    let n = fe(35.745, 139.6),
      t = fe(35.425, 139.845);
    return {
      x0: n[0],
      z0: n[1],
      x1: t[0],
      z1: t[1],
    };
  })(),
  Iv = [
    [35.76, 139.58],
    [35.76, 139.86],
    [35.641, 139.86],
    [35.641, 139.842],
    [35.643, 139.83],
    [35.645, 139.818],
    [35.646, 139.806],
    [35.6465, 139.795],
    [35.647, 139.787],
    [35.65, 139.782],
    [35.652, 139.776],
    [35.6545, 139.772],
    [35.658, 139.77],
    [35.6595, 139.7665],
    [35.6575, 139.7635],
    [35.6535, 139.7615],
    [35.649, 139.7605],
    [35.6445, 139.7585],
    [35.64, 139.7575],
    [35.6355, 139.7585],
    [35.6315, 139.7555],
    [35.627, 139.7525],
    [35.6215, 139.7515],
    [35.618, 139.7565],
    [35.6155, 139.7625],
    [35.611, 139.765],
    [35.604, 139.7655],
    [35.597, 139.7635],
    [35.5915, 139.7575],
    [35.5865, 139.751],
    [35.58, 139.7495],
    [35.574, 139.7515],
    [35.5675, 139.7495],
    [35.562, 139.7475],
    [35.556, 139.7465],
    [35.549, 139.747],
    [35.542, 139.7505],
    [35.536, 139.7545],
    [35.531, 139.76],
    [35.528, 139.776],
    [35.5225, 139.7905],
    [35.5165, 139.7965],
    [35.5085, 139.79],
    [35.507, 139.77],
    [35.5115, 139.758],
    [35.505, 139.745],
    [35.4975, 139.735],
    [35.4945, 139.715],
    [35.496, 139.7],
    [35.4925, 139.69],
    [35.4895, 139.676],
    [35.486, 139.66],
    [35.481, 139.648],
    [35.476, 139.64],
    [35.47, 139.635],
    [35.465, 139.633],
    [35.46, 139.633],
    [35.4615, 139.64],
    [35.457, 139.6418],
    [35.4545, 139.64],
    [35.456, 139.644],
    [35.4532, 139.6478],
    [35.4505, 139.6455],
    [35.4548, 139.6508],
    [35.4536, 139.6524],
    [35.4492, 139.6482],
    [35.4466, 139.6512],
    [35.4446, 139.6546],
    [35.4476, 139.6578],
    [35.4466, 139.6652],
    [35.4414, 139.6662],
    [35.4394, 139.6582],
    [35.4366, 139.6562],
    [35.4385, 139.668],
    [35.4305, 139.6835],
    [35.42, 139.68],
    [35.417, 139.665],
    [35.405, 139.66],
    [35.405, 139.58],
  ],
  F2 = {
    odaiba: [
      [35.6385, 139.7685],
      [35.6395, 139.779],
      [35.6405, 139.79],
      [35.6395, 139.8015],
      [35.6325, 139.804],
      [35.625, 139.801],
      [35.618, 139.793],
      [35.6115, 139.783],
      [35.611, 139.7745],
      [35.617, 139.769],
      [35.625, 139.768],
      [35.631, 139.765],
    ],
    shinagawaFuto: [
      [35.6205, 139.756],
      [35.6215, 139.7655],
      [35.615, 139.77],
      [35.609, 139.769],
      [35.611, 139.76],
    ],
    haneda: [
      [35.566, 139.756],
      [35.568, 139.77],
      [35.564, 139.788],
      [35.558, 139.803],
      [35.547, 139.809],
      [35.533, 139.805],
      [35.525, 139.793],
      [35.524, 139.776],
      [35.53, 139.762],
      [35.542, 139.7575],
      [35.554, 139.756],
    ],
    runwayD: [
      [35.532, 139.807],
      [35.542, 139.821],
      [35.537, 139.8285],
      [35.5265, 139.815],
    ],
    toyosu6: [
      [35.6478, 139.78],
      [35.6476, 139.79],
      [35.6445, 139.7925],
      [35.6418, 139.7905],
      [35.642, 139.78],
      [35.645, 139.7785],
    ],
    chuoBouhatei: [
      [35.6165, 139.796],
      [35.617, 139.815],
      [35.605, 139.817],
      [35.602, 139.8],
    ],
    higashiOgishima: [
      [35.5005, 139.76],
      [35.4975, 139.7905],
      [35.4835, 139.786],
      [35.481, 139.753],
    ],
    ogishima: [
      [35.4895, 139.7],
      [35.4885, 139.736],
      [35.478, 139.738],
      [35.477, 139.705],
    ],
    daikoku: [
      [35.4725, 139.6775],
      [35.4708, 139.6905],
      [35.456, 139.6885],
      [35.4558, 139.6745],
    ],
    mizuho: [
      [35.4745, 139.644],
      [35.4725, 139.655],
      [35.466, 139.652],
      [35.4675, 139.6425],
    ],
  },
  xp = [
    {
      name: '\u9685\u7530\u5DDD',
      w: 170,
      pts: [
        [35.76, 139.798],
        [35.745, 139.807],
        [35.733, 139.8065],
        [35.722, 139.802],
        [35.7125, 139.7995],
        [35.7035, 139.7955],
        [35.6975, 139.7895],
        [35.692, 139.787],
        [35.6845, 139.79],
        [35.678, 139.79],
        [35.672, 139.786],
        [35.667, 139.78],
        [35.663, 139.7745],
        [35.656, 139.77],
      ],
    },
    {
      name: '\u795E\u7530\u5DDD',
      w: 28,
      pts: [
        [35.709, 139.72],
        [35.706, 139.733],
        [35.702, 139.743],
        [35.701, 139.752],
        [35.7005, 139.76],
        [35.6995, 139.766],
        [35.6975, 139.774],
        [35.696, 139.781],
        [35.6945, 139.787],
      ],
    },
    {
      name: '\u65E5\u672C\u6A4B\u5DDD',
      w: 30,
      pts: [
        [35.701, 139.752],
        [35.695, 139.756],
        [35.6905, 139.763],
        [35.686, 139.77],
        [35.684, 139.776],
        [35.6805, 139.783],
        [35.6785, 139.7895],
      ],
    },
    {
      name: '\u76EE\u9ED2\u5DDD',
      w: 18,
      pts: [
        [35.651, 139.688],
        [35.644, 139.699],
        [35.637, 139.711],
        [35.63, 139.723],
        [35.623, 139.733],
        [35.62, 139.742],
        [35.6205, 139.75],
      ],
    },
    {
      name: '\u6E0B\u8C37\u5DDD\u30FB\u53E4\u5DDD',
      w: 16,
      pts: [
        [35.658, 139.705],
        [35.6505, 139.711],
        [35.6475, 139.723],
        [35.65, 139.733],
        [35.653, 139.744],
        [35.6515, 139.752],
        [35.648, 139.7575],
      ],
    },
    {
      name: '\u6674\u6D77\u904B\u6CB3',
      w: 70,
      pts: [
        [35.6585, 139.7845],
        [35.652, 139.7865],
        [35.646, 139.7895],
      ],
    },
    {
      name: '\u8C4A\u6D32\u904B\u6CB3',
      w: 60,
      pts: [
        [35.662, 139.7935],
        [35.654, 139.7985],
        [35.647, 139.8005],
      ],
    },
    {
      name: '\u829D\u6D66\u904B\u6CB3',
      w: 40,
      pts: [
        [35.646, 139.748],
        [35.642, 139.753],
        [35.639, 139.7575],
      ],
    },
    {
      name: '\u4EAC\u6D5C\u904B\u6CB3',
      w: 90,
      pts: [
        [35.62, 139.752],
        [35.61, 139.7545],
        [35.6, 139.7555],
        [35.588, 139.752],
        [35.576, 139.75],
        [35.566, 139.75],
      ],
    },
    {
      name: '\u6D77\u8001\u53D6\u5DDD',
      w: 70,
      pts: [
        [35.569, 139.752],
        [35.556, 139.753],
        [35.542, 139.7545],
        [35.533, 139.757],
      ],
    },
    {
      name: '\u591A\u6469\u5DDD',
      w: 330,
      pts: [
        [35.632, 139.588],
        [35.618, 139.607],
        [35.6085, 139.6255],
        [35.6, 139.64],
        [35.593, 139.65],
        [35.5855, 139.6625],
        [35.576, 139.675],
        [35.5655, 139.6905],
        [35.556, 139.7],
        [35.547, 139.709],
        [35.542, 139.718],
        [35.5375, 139.7375],
        [35.5335, 139.755],
        [35.53, 139.772],
        [35.5255, 139.79],
        [35.52, 139.81],
      ],
    },
    {
      name: '\u9DB4\u898B\u5DDD',
      w: 85,
      pts: [
        [35.52, 139.595],
        [35.528, 139.615],
        [35.535, 139.63],
        [35.53, 139.645],
        [35.518, 139.66],
        [35.508, 139.674],
        [35.5, 139.684],
        [35.492, 139.693],
      ],
    },
    {
      name: '\u5927\u5CA1\u5DDD',
      w: 34,
      pts: [
        [35.432, 139.615],
        [35.44, 139.623],
        [35.4455, 139.6275],
        [35.4495, 139.632],
        [35.453, 139.638],
      ],
    },
    {
      name: '\u4E2D\u6751\u5DDD\u30FB\u5800\u5DDD',
      w: 30,
      pts: [
        [35.434, 139.624],
        [35.4385, 139.633],
        [35.4405, 139.642],
        [35.4395, 139.648],
        [35.4425, 139.657],
      ],
    },
    {
      name: '\u5E37\u5B50\u5DDD',
      w: 30,
      pts: [
        [35.462, 139.608],
        [35.464, 139.618],
        [35.4655, 139.626],
        [35.4655, 139.633],
      ],
    },
    {
      name: '\u4EAC\u6D5C\u904B\u6CB3\uFF08\u5DDD\u5D0E\uFF09',
      w: 80,
      pts: [
        [35.4995, 139.735],
        [35.4935, 139.745],
        [35.492, 139.765],
        [35.502, 139.795],
      ],
    },
    {
      name: '\u5584\u798F\u5BFA\u5DDD',
      w: 14,
      pts: [
        [35.713, 139.6],
        [35.705, 139.62],
        [35.696, 139.638],
        [35.693, 139.655],
        [35.695, 139.67],
      ],
    },
  ],
  gp = [
    [35.685, 139.76],
    [35.6808, 139.7613],
    [35.676, 139.7577],
    [35.6772, 139.755],
    [35.68, 139.7552],
    [35.6832, 139.7564],
  ],
  Mp = [
    [35.6858, 139.7588],
    [35.683, 139.7566],
    [35.68, 139.7554],
    [35.6778, 139.755],
    [35.6762, 139.7562],
  ],
  yp = [
    [35.6935, 139.747],
    [35.6925, 139.756],
    [35.688, 139.761],
    [35.68, 139.7615],
    [35.6755, 139.757],
    [35.677, 139.7475],
    [35.6835, 139.744],
    [35.689, 139.744],
  ],
  bp = [
    {
      n: '\u660E\u6CBB\u795E\u5BAE\u30FB\u4EE3\u3005\u6728\u516C\u5712',
      p: [
        [35.683, 139.6905],
        [35.684, 139.7025],
        [35.6745, 139.705],
        [35.666, 139.6995],
        [35.6655, 139.692],
        [35.674, 139.688],
      ],
      forest: 1,
    },
    {
      n: '\u65B0\u5BBF\u5FA1\u82D1',
      p: [
        [35.688, 139.704],
        [35.6875, 139.716],
        [35.683, 139.7165],
        [35.6825, 139.706],
      ],
    },
    {
      n: '\u4E0A\u91CE\u516C\u5712',
      p: [
        [35.7195, 139.769],
        [35.72, 139.7765],
        [35.711, 139.776],
        [35.711, 139.7695],
      ],
    },
    {
      n: '\u65E5\u6BD4\u8C37\u516C\u5712',
      p: [
        [35.6755, 139.7535],
        [35.6755, 139.758],
        [35.6715, 139.758],
        [35.6715, 139.753],
      ],
    },
    {
      n: '\u829D\u516C\u5712',
      p: [
        [35.659, 139.7465],
        [35.6595, 139.7505],
        [35.6535, 139.75],
        [35.6535, 139.746],
      ],
    },
    {
      n: '\u6D5C\u96E2\u5BAE\u6069\u8CDC\u5EAD\u5712',
      p: [
        [35.6625, 139.76],
        [35.662, 139.766],
        [35.6575, 139.766],
        [35.6565, 139.7615],
      ],
    },
    {
      n: '\u5C0F\u77F3\u5DDD\u5F8C\u697D\u5712',
      p: [
        [35.7075, 139.7465],
        [35.707, 139.7515],
        [35.704, 139.7515],
        [35.704, 139.7465],
      ],
    },
    {
      n: '\u516D\u7FA9\u5712',
      p: [
        [35.7345, 139.7445],
        [35.7345, 139.749],
        [35.731, 139.749],
        [35.731, 139.7445],
      ],
    },
    {
      n: '\u9752\u5C71\u970A\u5712',
      p: [
        [35.669, 139.7195],
        [35.669, 139.724],
        [35.6625, 139.7245],
        [35.6625, 139.7195],
      ],
    },
    {
      n: '\u5317\u306E\u4E38\u516C\u5712',
      p: [
        [35.6935, 139.7495],
        [35.6925, 139.754],
        [35.6885, 139.7535],
        [35.6895, 139.749],
      ],
    },
    {
      n: '\u304A\u53F0\u5834\u6D77\u6D5C\u516C\u5712',
      p: [
        [35.6325, 139.77],
        [35.633, 139.777],
        [35.629, 139.7775],
        [35.6285, 139.771],
      ],
    },
    {
      n: '\u6709\u6816\u5DDD\u5BAE\u8A18\u5FF5\u516C\u5712',
      p: [
        [35.6535, 139.7225],
        [35.6535, 139.726],
        [35.6505, 139.726],
        [35.6505, 139.7225],
      ],
    },
    {
      n: '\u660E\u6CBB\u795E\u5BAE\u5916\u82D1',
      p: [
        [35.6812, 139.7158],
        [35.6812, 139.7206],
        [35.67, 139.7206],
        [35.67, 139.715],
        [35.6745, 139.715],
      ],
    },
    {
      n: '\u6771\u4EAC\u90FD\u5E81\u30FB\u65B0\u5BBF\u4E2D\u592E\u516C\u5712',
      p: [
        [35.692, 139.687],
        [35.6915, 139.6905],
        [35.6875, 139.6905],
        [35.688, 139.687],
      ],
    },
    {
      n: '\u7827\u516C\u5712',
      p: [
        [35.6355, 139.615],
        [35.6355, 139.6225],
        [35.627, 139.6225],
        [35.627, 139.615],
      ],
      forest: 1,
    },
    {
      n: '\u99D2\u6CA2\u30AA\u30EA\u30F3\u30D4\u30C3\u30AF\u516C\u5712',
      p: [
        [35.6295, 139.6585],
        [35.6295, 139.665],
        [35.622, 139.665],
        [35.622, 139.6585],
      ],
    },
    {
      n: '\u7FBD\u6839\u6728\u516C\u5712',
      p: [
        [35.6575, 139.6555],
        [35.6575, 139.659],
        [35.655, 139.659],
        [35.655, 139.6555],
      ],
    },
    {
      n: '\u7B49\u3005\u529B\u7DD1\u5730',
      p: [
        [35.589, 139.647],
        [35.589, 139.6545],
        [35.5835, 139.6545],
        [35.5835, 139.647],
      ],
    },
    {
      n: '\u5C71\u4E0B\u516C\u5712',
      p: [
        [35.4485, 139.6492],
        [35.446, 139.6538],
        [35.4448, 139.6528],
        [35.4473, 139.6485],
      ],
    },
    {
      n: '\u81E8\u6E2F\u30D1\u30FC\u30AF',
      p: [
        [35.4612, 139.6385],
        [35.461, 139.64],
        [35.459, 139.6408],
        [35.4588, 139.639],
      ],
    },
    {
      n: '\u6E2F\u306E\u898B\u3048\u308B\u4E18\u516C\u5712',
      p: [
        [35.4395, 139.651],
        [35.4395, 139.6545],
        [35.4375, 139.6545],
        [35.4375, 139.651],
      ],
      forest: 1,
    },
    {
      n: '\u91CE\u6BDB\u5C71\u516C\u5712',
      p: [
        [35.447, 139.6205],
        [35.447, 139.625],
        [35.444, 139.625],
        [35.444, 139.6205],
      ],
      forest: 1,
    },
    {
      n: '\u5584\u798F\u5BFA\u5DDD\u7DD1\u5730',
      p: [
        [35.699, 139.632],
        [35.699, 139.642],
        [35.6955, 139.642],
        [35.6955, 139.632],
      ],
      forest: 1,
    },
  ];
var O2 = [
    ['\u65B0\u5BBF', 'SHINJUKU', 35.6905, 139.7],
    ['\u897F\u65B0\u5BBF', 'NISHI-SHINJUKU', 35.69, 139.692],
    ['\u6B4C\u821E\u4F0E\u753A', 'KABUKICHO', 35.695, 139.703],
    ['\u6E0B\u8C37', 'SHIBUYA', 35.6595, 139.701],
    ['\u539F\u5BBF', 'HARAJUKU', 35.6705, 139.703],
    ['\u4EE3\u3005\u6728', 'YOYOGI', 35.683, 139.702],
    ['\u6C60\u888B', 'IKEBUKURO', 35.7295, 139.711],
    ['\u9AD8\u7530\u99AC\u5834', 'TAKADANOBABA', 35.7125, 139.704],
    ['\u76EE\u767D', 'MEJIRO', 35.721, 139.706],
    ['\u5927\u585A', 'OTSUKA', 35.7315, 139.729],
    ['\u5DE3\u9D28', 'SUGAMO', 35.7335, 139.739],
    ['\u99D2\u8FBC', 'KOMAGOME', 35.7365, 139.747],
    ['\u6075\u6BD4\u5BFF', 'EBISU', 35.6467, 139.71],
    ['\u76EE\u9ED2', 'MEGURO', 35.6339, 139.716],
    ['\u4E94\u53CD\u7530', 'GOTANDA', 35.626, 139.724],
    ['\u5927\u5D0E', 'OSAKI', 35.6198, 139.728],
    ['\u54C1\u5DDD', 'SHINAGAWA', 35.6285, 139.739],
    ['\u7530\u753A', 'TAMACHI', 35.6457, 139.748],
    ['\u6D5C\u677E\u753A', 'HAMAMATSUCHO', 35.6555, 139.757],
    ['\u65B0\u6A4B', 'SHIMBASHI', 35.6662, 139.758],
    ['\u6C50\u7559', 'SHIODOME', 35.6627, 139.762],
    ['\u9280\u5EA7', 'GINZA', 35.6717, 139.765],
    ['\u6709\u697D\u753A', 'YURAKUCHO', 35.675, 139.763],
    ['\u4E38\u306E\u5185', 'MARUNOUCHI', 35.6812, 139.764],
    ['\u5927\u624B\u753A', 'OTEMACHI', 35.6862, 139.765],
    ['\u65E5\u672C\u6A4B', 'NIHONBASHI', 35.683, 139.774],
    ['\u795E\u7530', 'KANDA', 35.6917, 139.771],
    ['\u79CB\u8449\u539F', 'AKIHABARA', 35.6984, 139.773],
    ['\u5FA1\u8336\u30CE\u6C34', 'OCHANOMIZU', 35.6995, 139.765],
    ['\u795E\u4FDD\u753A', 'JIMBOCHO', 35.696, 139.758],
    ['\u6C34\u9053\u6A4B', 'SUIDOBASHI', 35.702, 139.753],
    ['\u98EF\u7530\u6A4B', 'IIDABASHI', 35.702, 139.745],
    ['\u5E02\u30F6\u8C37', 'ICHIGAYA', 35.691, 139.736],
    ['\u56DB\u30C4\u8C37', 'YOTSUYA', 35.686, 139.73],
    ['\u8D64\u5742', 'AKASAKA', 35.674, 139.737],
    ['\u6C38\u7530\u753A', 'NAGATACHO', 35.678, 139.744],
    ['\u971E\u304C\u95A2', 'KASUMIGASEKI', 35.6735, 139.751],
    ['\u864E\u30CE\u9580', 'TORANOMON', 35.668, 139.749],
    ['\u516D\u672C\u6728', 'ROPPONGI', 35.663, 139.731],
    ['\u9EBB\u5E03', 'AZABU', 35.656, 139.736],
    ['\u5E83\u5C3E', 'HIRO-O', 35.651, 139.722],
    ['\u9752\u5C71', 'AOYAMA', 35.668, 139.718],
    ['\u8868\u53C2\u9053', 'OMOTESANDO', 35.665, 139.712],
    ['\u4E0A\u91CE', 'UENO', 35.7138, 139.777],
    ['\u5FA1\u5F92\u753A', 'OKACHIMACHI', 35.7075, 139.775],
    ['\u6D45\u8349', 'ASAKUSA', 35.712, 139.796],
    ['\u8535\u524D', 'KURAMAE', 35.703, 139.791],
    ['\u4E21\u56FD', 'RYOGOKU', 35.696, 139.793],
    ['\u9326\u7CF8\u753A', 'KINSHICHO', 35.6965, 139.814],
    ['\u62BC\u4E0A', 'OSHIAGE', 35.71, 139.812],
    ['\u4EBA\u5F62\u753A', 'NINGYOCHO', 35.686, 139.783],
    ['\u7BC9\u5730', 'TSUKIJI', 35.6655, 139.77],
    ['\u6708\u5CF6', 'TSUKISHIMA', 35.6635, 139.783],
    ['\u52DD\u3069\u304D', 'KACHIDOKI', 35.6585, 139.777],
    ['\u6674\u6D77', 'HARUMI', 35.654, 139.783],
    ['\u8C4A\u6D32', 'TOYOSU', 35.655, 139.796],
    ['\u9580\u524D\u4EF2\u753A', 'MONZEN-NAKACHO', 35.672, 139.796],
    ['\u6E05\u6F84\u767D\u6CB3', 'KIYOSUMI', 35.682, 139.799],
    ['\u6709\u660E', 'ARIAKE', 35.634, 139.793],
    ['\u53F0\u5834', 'DAIBA', 35.627, 139.775],
    ['\u9752\u6D77', 'AOMI', 35.618, 139.78],
    ['\u829D\u6D66', 'SHIBAURA', 35.642, 139.753],
    ['\u5929\u738B\u6D32', 'TENNOZU', 35.622, 139.75],
    ['\u5927\u4E95', 'OI', 35.6, 139.752],
    ['\u5927\u68EE', 'OMORI', 35.588, 139.729],
    ['\u5E73\u548C\u5CF6', 'HEIWAJIMA', 35.58, 139.742],
    ['\u84B2\u7530', 'KAMATA', 35.562, 139.718],
    ['\u7FBD\u7530', 'HANEDA', 35.55, 139.747],
    ['\u7FBD\u7530\u7A7A\u6E2F', 'HANEDA AIRPORT', 35.547, 139.78],
    ['\u672C\u90F7', 'HONGO', 35.708, 139.76],
    ['\u5F8C\u697D\u5712', 'KORAKUEN', 35.706, 139.752],
    ['\u795E\u697D\u5742', 'KAGURAZAKA', 35.703, 139.737],
    ['\u65E9\u7A32\u7530', 'WASEDA', 35.706, 139.72],
    ['\u65B0\u5927\u4E45\u4FDD', 'SHIN-OKUBO', 35.701, 139.7],
    ['\u4E2D\u76EE\u9ED2', 'NAKAMEGURO', 35.644, 139.699],
    ['\u4EE3\u5B98\u5C71', 'DAIKANYAMA', 35.6485, 139.703],
    ['\u521D\u53F0', 'HATSUDAI', 35.681, 139.686],
    ['\u4E09\u8ED2\u8336\u5C4B', 'SANGENJAYA', 35.6435, 139.671],
    ['\u767D\u91D1', 'SHIROKANE', 35.642, 139.727],
    ['\u9AD8\u8F2A', 'TAKANAWA', 35.636, 139.735],
    ['\u837B\u7AAA', 'OGIKUBO', 35.7047, 139.62],
    ['\u963F\u4F50\u30F6\u8C37', 'ASAGAYA', 35.705, 139.636],
    ['\u9AD8\u5186\u5BFA', 'KOENJI', 35.7055, 139.6495],
    ['\u4E2D\u91CE', 'NAKANO', 35.706, 139.6655],
    ['\u9AD8\u4E95\u6238', 'TAKAIDO', 35.683, 139.615],
    ['\u6C38\u798F', 'EIFUKU', 35.676, 139.643],
    ['\u4E0B\u9AD8\u4E95\u6238', 'SHIMO-TAKAIDO', 35.6665, 139.641],
    ['\u5343\u6B73\u70CF\u5C71', 'CHITOSE-KARASUYAMA', 35.668, 139.6005],
    ['\u4E0B\u5317\u6CA2', 'SHIMOKITAZAWA', 35.6615, 139.668],
    ['\u7D4C\u5802', 'KYODO', 35.6505, 139.6365],
    ['\u5343\u6B73\u8239\u6A4B', 'CHITOSE-FUNABASHI', 35.6475, 139.6245],
    ['\u6210\u57CE', 'SEIJO', 35.6405, 139.602],
    ['\u685C\u65B0\u753A', 'SAKURA-SHIMMACHI', 35.6315, 139.645],
    ['\u7528\u8CC0', 'YOGA', 35.6265, 139.6335],
    ['\u4E8C\u5B50\u7389\u5DDD', 'FUTAKO-TAMAGAWA', 35.6115, 139.627],
    ['\u7B49\u3005\u529B', 'TODOROKI', 35.6085, 139.648],
    ['\u81EA\u7531\u304C\u4E18', 'JIYUGAOKA', 35.6075, 139.6685],
    ['\u7530\u5712\u8ABF\u5E03', 'DEN-EN-CHOFU', 35.5965, 139.667],
    ['\u99D2\u6CA2', 'KOMAZAWA', 35.6265, 139.661],
    ['\u9DFA\u30CE\u5BAE', 'SAGINOMIYA', 35.7225, 139.639],
    ['\u77F3\u795E\u4E95', 'SHAKUJII', 35.738, 139.608],
    ['\u4E0A\u4E95\u8349', 'KAMI-IGUSA', 35.7255, 139.604],
    ['\u4E45\u6211\u5C71', 'KUGAYAMA', 35.6855, 139.601],
    ['\u6E9D\u306E\u53E3', 'MIZONOKUCHI', 35.6, 139.611],
    ['\u6B66\u8535\u5C0F\u6749', 'MUSASHI-KOSUGI', 35.5765, 139.6595],
    ['\u5143\u4F4F\u5409', 'MOTOSUMIYOSHI', 35.564, 139.654],
    ['\u65E5\u5409', 'HIYOSHI', 35.5535, 139.6465],
    ['\u7DB1\u5CF6', 'TSUNASHIMA', 35.537, 139.635],
    ['\u65B0\u5DDD\u5D0E', 'SHIN-KAWASAKI', 35.5525, 139.672],
    ['\u5DDD\u5D0E', 'KAWASAKI', 35.531, 139.697],
    ['\u5DDD\u5D0E\u5927\u5E2B', 'KAWASAKI-DAISHI', 35.5345, 139.7275],
    ['\u6D5C\u5DDD\u5D0E', 'HAMA-KAWASAKI', 35.512, 139.715],
    ['\u6D6E\u5CF6', 'UKISHIMA', 35.515, 139.785],
    ['\u6771\u6247\u5CF6', 'HIGASHI-OGISHIMA', 35.491, 139.77],
    ['\u6247\u5CF6', 'OGISHIMA', 35.484, 139.72],
    ['\u9DB4\u898B', 'TSURUMI', 35.5085, 139.6765],
    ['\u751F\u9EA6', 'NAMAMUGI', 35.4945, 139.666],
    ['\u65B0\u5B50\u5B89', 'SHIN-KOYASU', 35.4865, 139.655],
    ['\u5927\u9ED2\u3075\u982D', 'DAIKOKU PIER', 35.463, 139.683],
    ['\u83CA\u540D', 'KIKUNA', 35.5095, 139.631],
    ['\u65B0\u6A2A\u6D5C', 'SHIN-YOKOHAMA', 35.5075, 139.6175],
    ['\u5927\u53E3', 'OGUCHI', 35.493, 139.63],
    ['\u6771\u795E\u5948\u5DDD', 'HIGASHI-KANAGAWA', 35.478, 139.632],
    ['\u6A2A\u6D5C', 'YOKOHAMA', 35.466, 139.6225],
    ['\u307F\u306A\u3068\u307F\u3089\u3044', 'MINATO MIRAI', 35.4575, 139.6325],
    ['\u685C\u6728\u753A', 'SAKURAGICHO', 35.451, 139.631],
    ['\u91CE\u6BDB', 'NOGE', 35.4475, 139.629],
    ['\u95A2\u5185', 'KANNAI', 35.444, 139.6365],
    ['\u99AC\u8ECA\u9053', 'BASHAMICHI', 35.4505, 139.6375],
    ['\u4F0A\u52E2\u4F50\u6728\u753A', 'ISEZAKICHO', 35.4425, 139.6315],
    ['\u4E2D\u83EF\u8857', 'CHINATOWN', 35.443, 139.6465],
    ['\u5143\u753A', 'MOTOMACHI', 35.439, 139.649],
    ['\u5C71\u4E0B\u753A', 'YAMASHITACHO', 35.4455, 139.6495],
    ['\u5C71\u624B', 'YAMATE', 35.4365, 139.648],
    ['\u77F3\u5DDD\u753A', 'ISHIKAWACHO', 35.4385, 139.643],
    ['\u672C\u7267', 'HONMOKU', 35.423, 139.662],
    ['\u5409\u91CE\u753A', 'YOSHINOCHO', 35.433, 139.618],
  ],
  H2 = [
    [35.6905, 139.695, 1, 900, 0.5],
    [35.6935, 139.702, 0.8, 500, 1],
    [35.6595, 139.701, 0.62, 650, 1],
    [35.6585, 139.7025, 0.85, 160, 0.8],
    [35.729, 139.713, 0.8, 700, 0.8],
    [35.6812, 139.765, 1, 800, 0.2],
    [35.6717, 139.765, 0.8, 600, 0.8],
    [35.6625, 139.761, 0.9, 500, 0.3],
    [35.663, 139.731, 0.8, 600, 0.7],
    [35.6285, 139.741, 0.75, 600, 0.3],
    [35.6984, 139.773, 0.65, 450, 1],
    [35.668, 139.749, 0.85, 500, 0.2],
    [35.655, 139.796, 0.7, 600, 0.2],
    [35.625, 139.778, 0.55, 600, 0.3],
    [35.6467, 139.71, 0.6, 450, 0.6],
    [35.7138, 139.776, 0.6, 500, 0.8],
    [35.6198, 139.728, 0.7, 450, 0.2],
    [35.686, 139.774, 0.7, 500, 0.3],
    [35.674, 139.737, 0.6, 450, 0.6],
    [35.702, 139.745, 0.5, 450, 0.4],
    [35.6604, 139.74, 0.8, 350, 0.2],
    [35.696, 139.814, 0.5, 450, 0.6],
    [35.656, 139.757, 0.6, 400, 0.3],
    [35.466, 139.623, 0.95, 750, 0.6],
    [35.456, 139.633, 0.9, 600, 0.3],
    [35.4445, 139.637, 0.6, 480, 0.5],
    [35.446, 139.63, 0.45, 380, 0.9],
    [35.4428, 139.646, 0.5, 250, 1],
    [35.531, 139.699, 0.75, 550, 0.8],
    [35.5765, 139.6595, 0.85, 380, 0.2],
    [35.6115, 139.627, 0.6, 330, 0.3],
    [35.6615, 139.668, 0.45, 330, 0.8],
    [35.7047, 139.62, 0.45, 330, 0.5],
    [35.5075, 139.6175, 0.6, 380, 0.3],
    [35.5085, 139.6765, 0.4, 300, 0.5],
    [35.6, 139.611, 0.45, 330, 0.5],
    [35.706, 139.6655, 0.55, 380, 0.6],
  ];
var Mf = {
  tokyoTower: [35.6586, 139.7454],
  skytree: [35.7101, 139.8107],
  tokyoStation: [35.6812, 139.766],
  scramble: [35.6595, 139.7005],
  shibuya109: [35.6596, 139.6987],
  tocho: [35.6896, 139.6917],
  docomo: [35.6837, 139.703],
  cocoon: [35.6913, 139.6966],
  roppongiHills: [35.6604, 139.7292],
  azabudai: [35.6606, 139.7398],
  sensoji: [35.7148, 139.7967],
  kaminarimon: [35.7111, 139.7963],
  rainbowBridge: [35.6365, 139.7633],
  fujiTV: [35.6268, 139.7745],
  bigSight: [35.6301, 139.7948],
  kabukichoGate: [35.6938, 139.702],
  diet: [35.6759, 139.7448],
  meijiShrine: [35.6764, 139.6993],
  sunshine60: [35.729, 139.7194],
  tokyoDome: [35.7056, 139.7519],
  toranomonHills: [35.6668, 139.7494],
  palaceKeep: [35.687, 139.754],
  kachidokiBridge: [35.663, 139.7745],
  gate: [35.68, 139.762],
  heliport: [35.6375, 139.8275],
  nihonbashi: [35.6841, 139.7745],
  ameyoko: [35.7101, 139.7745],
  landmarkTower: [35.4548, 139.6314],
  queensSquare: [35.4567, 139.6348],
  cosmoClock: [35.4556, 139.6376],
  redBrick: [35.4527, 139.643],
  osanbashi: [35.452, 139.6492],
  yamashitaPark: [35.4466, 139.6508],
  marineTower: [35.4438, 139.6508],
  chinatown: [35.4428, 139.6462],
  yokohamaStadium: [35.4434, 139.64],
  bayBridge: [35.4472, 139.6765],
  tsubasaBridge: [35.4745, 139.699],
  kawasakiDaishi: [35.5345, 139.7292],
  yokohamaStation: [35.466, 139.6225],
  musashiKosugi: [35.577, 139.6585],
};
var M_WATER = 0,
  M_LAND = 1,
  M_PARK = 2,
  M_PALACE = 3,
  M_FOREST = 4,
  M_MOAT = 5,
  M_AIR = 6,
  Je = 8;
function B2() {
  let n = xn.x0 - 400,
    t = xn.z0 - 400,
    e = Math.ceil((xn.x1 - xn.x0 + 800) / Je),
    i = Math.ceil((xn.z1 - xn.z0 + 800) / Je),
    s = new Uint8Array(e * i),
    o = (c, h) => {
      let d = c.map((y) => fe(y[0], y[1])),
        p = 1e9,
        x = -1e9;
      for (let y of d) ((p = Math.min(p, y[1])), (x = Math.max(x, y[1])));
      let m = Math.max(0, Math.floor((p - t) / Je)),
        g = Math.min(i - 1, Math.ceil((x - t) / Je)),
        M = [];
      for (let y = m; y <= g; y++) {
        let _ = t + (y + 0.5) * Je;
        M.length = 0;
        for (let v = 0, b = d.length - 1; v < d.length; b = v++) {
          let w = d[v],
            E = d[b];
          w[1] > _ != E[1] > _ && M.push(w[0] + ((_ - w[1]) / (E[1] - w[1])) * (E[0] - w[0]));
        }
        M.sort((v, b) => v - b);
        for (let v = 0; v + 1 < M.length; v += 2) {
          let b = Math.max(0, Math.ceil((M[v] - n) / Je - 0.5)),
            w = Math.min(e - 1, Math.floor((M[v + 1] - n) / Je - 0.5));
          for (let E = b; E <= w; E++) s[y * e + E] = h;
        }
      }
    };
  o(Iv, M_LAND);
  for (let c in F2) o(F2[c], c === 'haneda' || c === 'runwayD' ? M_AIR : M_LAND);
  for (let c of bp) o(c.p, c.forest ? M_FOREST : M_PARK);
  let r = yp.map((c) => fe(c[0], c[1])),
    a = r.reduce((c, h) => c + h[0], 0) / r.length,
    l = r.reduce((c, h) => c + h[1], 0) / r.length,
    f = (c) =>
      r.map((h) => {
        let d = h[0] - a,
          p = h[1] - l,
          x = Math.hypot(d, p);
        return [h[0] + (d / x) * c, h[1] + (p / x) * c];
      }),
    u = (c) =>
      c.map((h) => {
        let d = [0, 0];
        return h;
      });
  (Lv(s, e, i, n, t, f(45), M_MOAT), Lv(s, e, i, n, t, r, M_PALACE), o(gp, M_PARK));
  {
    let c = Mp.map((d) => fe(d[0], d[1])),
      h = 16;
    for (let d = 0; d + 1 < c.length; d++) {
      let [p, x] = c[d],
        [m, g] = c[d + 1];
      for (let M = Math.floor((Math.min(x, g) - h - t) / Je); M <= Math.ceil((Math.max(x, g) + h - t) / Je); M++)
        for (let y = Math.floor((Math.min(p, m) - h - n) / Je); y <= Math.ceil((Math.max(p, m) + h - n) / Je); y++) {
          if (M < 0 || M >= i || y < 0 || y >= e) continue;
          let _ = n + (y + 0.5) * Je,
            v = t + (M + 0.5) * Je;
          yf(_, v, p, x, m, g) < h && (s[M * e + y] = M_MOAT);
        }
    }
  }
  for (let c of xp) {
    let h = c.pts.map((p) => fe(p[0], p[1])),
      d = c.w / 2;
    for (let p = 0; p + 1 < h.length; p++) {
      let [x, m] = h[p],
        [g, M] = h[p + 1],
        y = Math.min(x, g) - d,
        _ = Math.max(x, g) + d,
        v = Math.min(m, M) - d,
        b = Math.max(m, M) + d;
      for (let w = Math.floor((v - t) / Je); w <= Math.ceil((b - t) / Je); w++)
        if (!(w < 0 || w >= i))
          for (let E = Math.floor((y - n) / Je); E <= Math.ceil((_ - n) / Je); E++) {
            if (E < 0 || E >= e) continue;
            let C = n + (E + 0.5) * Je,
              S = t + (w + 0.5) * Je;
            yf(C, S, x, m, g, M) < d && (s[w * e + E] = M_WATER);
          }
    }
  }
  return {
    m: s,
    W: e,
    H: i,
    X0: n,
    Z0: t,
  };
}
function Lv(n, t, e, i, s, o, r) {
  let a = 1e9,
    l = -1e9;
  for (let u of o) ((a = Math.min(a, u[1])), (l = Math.max(l, u[1])));
  let f = [];
  for (let u = Math.max(0, Math.floor((a - s) / Je)); u <= Math.min(e - 1, Math.ceil((l - s) / Je)); u++) {
    let c = s + (u + 0.5) * Je;
    f.length = 0;
    for (let h = 0, d = o.length - 1; h < o.length; d = h++) {
      let p = o[h],
        x = o[d];
      p[1] > c != x[1] > c && f.push(p[0] + ((c - p[1]) / (x[1] - p[1])) * (x[0] - p[0]));
    }
    f.sort((h, d) => h - d);
    for (let h = 0; h + 1 < f.length; h += 2)
      for (let d = Math.max(0, Math.ceil((f[h] - i) / Je - 0.5)); d <= Math.min(t - 1, Math.floor((f[h + 1] - i) / Je - 0.5)); d++) n[u * t + d] = r;
  }
}
function yf(n, t, e, i, s, o) {
  let r = s - e,
    a = o - i,
    l = r * r + a * a,
    f = l > 0 ? ((n - e) * r + (t - i) * a) / l : 0;
  return ((f = f < 0 ? 0 : f > 1 ? 1 : f), Math.hypot(n - e - r * f, t - i - a * f));
}
function bf(n, t, e) {
  let i = Math.floor((t - n.X0) / Je),
    s = Math.floor((e - n.Z0) / Je);
  return i < 0 || s < 0 || i >= n.W || s >= n.H ? M_WATER : n.m[s * n.W + i];
}
var ROADW = {
    X: 17,
    A: 22,
    B: 15,
    L: 7,
    R: 8,
  },
  ROADLANES = {
    X: 2,
    A: 2,
    B: 1,
    L: 1,
    R: 1,
  },
  C9 = 12,
  Dv = fe(35.6365, 139.7633);
function W2(n, t) {
  let e = Math.hypot(n - Dv[0], t - Dv[1]);
  return C9 + 38 * Math.exp(-((e / 420) ** 2));
}
var KINDS = 'XABLR',
  W = {
    cleared: [],
    lmCol: [],
    mask: null,
    nodes: [],
    edges: [],
    rails: [],
    bld: null,
    nb: 0,
    roadNames: [],
    stations: [],
    districts: [],
  },
  Nn = 64,
  _p = new Map(),
  wp = new Map(),
  Rs = (n, t) => (n + 1e3) * 4096 + (t + 1e3);
function initWorld(n, t) {
  ((W.mask = B2()),
    (W.roadNames = n.roadNames),
    (W.nodes = n.nodes.map(([c, h, d], p) => ({
      i: p,
      x: c,
      z: h,
      y: d,
      edges: [],
      sig: 0,
      phase: 0,
      groups: null,
      r: 4,
    }))),
    (W.edges = n.edges.map(([c, h, d, p, x], m) => {
      let g = W.nodes[c],
        M = W.nodes[h],
        y = KINDS[d],
        _ = [[g.x, g.z], ...x, [M.x, M.z]],
        v = [0];
      for (let w = 1; w < _.length; w++) v.push(v[w - 1] + Math.hypot(_[w][0] - _[w - 1][0], _[w][1] - _[w - 1][1]));
      let b = {
        i: m,
        a: c,
        b: h,
        kind: y,
        road: p,
        pts: _,
        cum: v,
        len: v[v.length - 1],
        hw: ROADW[y] / 2,
        lanes: ROADLANES[y],
        ya: g.y,
        yb: M.y,
        elev: y === 'X' || y === 'R',
      };
      (g.edges.push(m), M.edges.push(m));
      for (let w = 0; w + 1 < _.length; w++) {
        let [E, C] = _[w],
          [S, T] = _[w + 1],
          D = b.hw + 2;
        for (let O = Math.floor((Math.min(E, S) - D) / Nn); O <= Math.floor((Math.max(E, S) + D) / Nn); O++)
          for (let U = Math.floor((Math.min(C, T) - D) / Nn); U <= Math.floor((Math.max(C, T) + D) / Nn); U++) {
            let B = Rs(O, U),
              R = _p.get(B);
            (R || _p.set(B, (R = [])), R.push(m * 4096 + w));
          }
      }
      return b;
    })));
  {
    let c = (M) => M.kind === 'R',
      h = new Set();
    for (let M of W.edges) c(M) && (h.add(M.a), h.add(M.b));
    let d = (M) => {
        let y = new Map(),
          _ = [];
        for (let v of M) (y.set(v, 0), _.push(v));
        for (; _.length;) {
          _.sort((w, E) => y.get(E) - y.get(w));
          let v = _.pop(),
            b = y.get(v);
          for (let w of W.nodes[v].edges) {
            let E = W.edges[w];
            if (!c(E)) continue;
            let C = E.a === v ? E.b : E.a,
              S = b + E.len;
            S < (y.get(C) ?? 1e9) && (y.set(C, S), _.push(C));
          }
        }
        return y;
      },
      p = [...h].filter((M) => W.nodes[M].y > 1),
      x = [...h].filter((M) => W.nodes[M].y <= 1 && W.nodes[M].edges.some((y) => !c(W.edges[y]))),
      m = d(p),
      g = d(x);
    for (let M of h) {
      let y = W.nodes[M];
      if (y.y > 1 || x.includes(M)) continue;
      let _ = m.get(M),
        v = g.get(M);
      if (_ === void 0 || v === void 0) continue;
      let b = 12,
        w = 1e9;
      for (let E of p) {
        let C = Math.hypot(W.nodes[E].x - y.x, W.nodes[E].z - y.z);
        C < w && ((w = C), (b = W.nodes[E].y));
      }
      y.y = (b * v) / (_ + v);
    }
    for (let M of W.edges) ((M.ya = W.nodes[M.a].y), (M.yb = W.nodes[M.b].y));
  }
  {
    let c = [];
    for (let h of W.edges) {
      if (h.kind !== 'R') continue;
      let d = h.ya > h.yb,
        p = Math.max(h.ya, h.yb);
      if (p < 4 || Math.min(h.ya, h.yb) > 1) continue;
      let x = 0;
      for (let m = 0; m <= h.len * 0.55; m += 4) {
        let g = edgePos(h, d ? m : h.len - m, {});
        roadsNear(g.x, g.z, 30, c);
        let M = !1;
        for (let y of c)
          if (y.e.kind === 'X' && y.d < y.e.hw + h.hw * 0.9 && Math.abs(W2(y.x, y.z) - p) < 3) {
            M = !0;
            break;
          }
        if (!M) break;
        x = m + 4;
      }
      ((h.sf = Math.max(0, Math.min(x, h.len * 0.55, h.len - 100))), (h.topA = d));
    }
  }
  for (let c of W.nodes) {
    let h = 3,
      d = 0;
    for (let x of c.edges) {
      let m = W.edges[x];
      ((h = Math.max(h, m.hw)), (m.kind === 'A' || m.kind === 'B') && d++);
    }
    c.r = h + 1;
    let p = 0;
    for (let x of c.edges) W.edges[x].kind === 'A' && p++;
    c.edges.length >= 3 && c.y < 1 && ((p >= 1 && d >= 2) || (d >= 3 && c.edges.length >= 4)) && z9(c);
  }
  let e = W.nodes.filter((c) => c.sig);
  for (let c = 0; c < e.length; c++) {
    let h = e[c];
    if (h.sig)
      for (let d = c + 1; d < e.length; d++) {
        let p = e[d];
        p.sig && Math.abs(h.x - p.x) < 30 && Math.abs(h.z - p.z) < 30 && Math.hypot(h.x - p.x, h.z - p.z) < 30 && (p.sig = 0);
      }
  }
  let i = new DataView(t.buffer || t, t.byteOffset || 0, t.byteLength),
    s = Math.floor(t.byteLength / 12);
  W.nb = s;
  let o = n.bq || {
      s: 0.5,
      ox: 0,
      oz: 0,
    },
    r = o.s,
    a = o.ox,
    l = o.oz,
    f = new Float32Array(s * 9);
  for (let c = 0; c < s; c++) {
    let h = c * 12;
    ((f[c * 9] = i.getInt16(h, !0) * r + a),
      (f[c * 9 + 1] = i.getInt16(h + 2, !0) * r + l),
      (f[c * 9 + 2] = (i.getUint8(h + 4) / 255) * Math.PI),
      (f[c * 9 + 3] = i.getUint8(h + 5) / 4),
      (f[c * 9 + 4] = i.getUint8(h + 6) / 4),
      (f[c * 9 + 5] = i.getUint8(h + 7)),
      (f[c * 9 + 6] = i.getUint16(h + 8, !0) / 10),
      (f[c * 9 + 7] = i.getUint8(h + 10)),
      (f[c * 9 + 8] = i.getUint8(h + 11) / 255));
    let d = Math.floor(f[c * 9] / Nn),
      p = Math.floor(f[c * 9 + 1] / Nn),
      x = Rs(d, p),
      m = wp.get(x);
    (m || wp.set(x, (m = [])), m.push(c));
  }
  W.bld = f;
  {
    let c = [],
      h = 0;
    for (let d of W.edges)
      if (!(d.kind !== 'R' && d.kind !== 'X'))
        for (let p = 0; p <= d.len; p += d.kind === 'X' ? 6 : 4) {
          let x = edgeY(d, p);
          if (d.kind === 'R' && x > 11) continue;
          let m = edgePos(d, p, {});
          buildingsNear(m.x, m.z, 30, c);
          for (let g of c) {
            let M = g * 9;
            if (f[M + 6] <= 0 || (d.kind === 'X' && f[M + 6] < x - 1)) continue;
            let y = Math.cos(f[M + 2]),
              _ = Math.sin(f[M + 2]),
              v = m.x - f[M],
              b = m.z - f[M + 1],
              w = v * y + b * _,
              E = -v * _ + b * y;
            Math.abs(w) < f[M + 3] / 2 + d.hw + 0.8 &&
              Math.abs(E) < f[M + 4] / 2 + d.hw + 0.8 &&
              ((f[M + 6] = 0), (f[M + 3] = 0), (f[M + 4] = 0), h++);
          }
        }
    h && console.log('ramp buildings cleared', h);
  }
  W.rails = n.rails.map((c) => {
    let h = [0];
    for (let m = 1; m < c.path.length; m++) h.push(h[m - 1] + Math.hypot(c.path[m][0] - c.path[m - 1][0], c.path[m][1] - c.path[m - 1][1]));
    let d = h[h.length - 1];
    c.loop && (d += Math.hypot(c.path[0][0] - c.path[c.path.length - 1][0], c.path[0][1] - c.path[c.path.length - 1][1]));
    let p = c.kind === 'sub' ? -16 : c.kind === 'tram' ? 0.25 : c.kind === 'mono' || c.kind === 'ats' ? 10 : 8,
      x = {
        ...c,
        cum: h,
        len: d,
        y: p,
      };
    return (
      (x.st = c.st.map((m) => ({
        ...m,
        s: h[m.i],
        x: c.path[m.i][0],
        z: c.path[m.i][1],
      }))),
      x
    );
  });
  let u = [];
  for (let c of W.rails)
    for (let h of c.st) {
      if (!inBounds(h.x, h.z, -200)) continue;
      let d = u.find((p) => p.ja.replace(/[〈（(].*$/, '') === h.ja.replace(/[〈（(].*$/, '') && Math.hypot(p.x - h.x, p.z - h.z) < 450);
      (d ||
        ((d = {
          id: u.length,
          ja: h.ja.replace(/[〈（(].*$/, ''),
          en: h.en.replace(/\s*\(.*$/, ''),
          x: h.x,
          z: h.z,
          lines: [],
        }),
        u.push(d)),
        d.lines.push({
          rail: c,
          st: h,
        }),
        (h.complex = d));
    }
  ((W.stations = u),
    (W.districts = O2.map(([c, h, d, p]) => {
      let [x, m] = fe(d, p);
      return {
        n: c,
        e: h,
        x,
        z: m,
      };
    })),
    (W.sites = n.sites || []),
    (W.landmarks = {}));
  for (let c in Mf) {
    let [h, d] = fe(Mf[c][0], Mf[c][1]);
    W.landmarks[c] = {
      x: h,
      z: d,
    };
  }
}
var inBounds = (n, t, e = 0) => n > xn.x0 - e && n < xn.x1 + e && t > xn.z0 - e && t < xn.z1 + e;
function z9(n) {
  let t = n.edges.map((l) => {
      let f = W.edges[l],
        u = f.a === n.i ? f.pts[1] : f.pts[f.pts.length - 2];
      return Math.atan2(u[1] - n.z, u[0] - n.x);
    }),
    e = t[0],
    i = t.map((l) => {
      let f = Math.abs((((l - e) % Math.PI) + Math.PI) % Math.PI);
      return ((f = Math.min(f, Math.PI - f)), f < Math.PI / 4 ? 0 : 1);
    });
  if (!i.includes(1)) return;
  let s = {
      X: 3,
      A: 3,
      B: 2,
      L: 1,
      R: 2,
    },
    o = 0,
    r = 0;
  (n.edges.forEach((l, f) => {
    let u = s[W.edges[l].kind];
    i[f] ? (r = Math.max(r, u)) : (o = Math.max(o, u));
  }),
    (n.sig = 1),
    (n.groups = i),
    (n.angs = t),
    (n.major = r > o ? 1 : 0),
    (n.g0 = o === r ? 0.5 : 0.62));
  let a = n.major ? t[i.indexOf(1)] : e;
  n.off = ((((n.x * Math.cos(a) + n.z * Math.sin(a)) / 13) % SIGCYC) + SIGCYC) % SIGCYC;
}
var SIGCYC = 40;
function sigState(n, t, e) {
  if (!n.sig) return 0;
  let i = n.groups[n.edges.indexOf(t)],
    s = i === n.major,
    o = SIGCYC * n.g0,
    r = (e + n.off) % SIGCYC;
  return s ? (r < o - 3.5 ? 0 : r < o - 0.5 ? 1 : 2) : ((r -= o), r >= 0 && r < SIGCYC - o - 3.5 ? 0 : r >= 0 && r < SIGCYC - o - 0.5 ? 1 : 2);
}
function maskQ(n, t) {
  return bf(W.mask, n, t);
}
function isWaterAt(n, t) {
  let e = bf(W.mask, n, t);
  return e === M_WATER || e === M_MOAT;
}
function roadsNear(n, t, e, i) {
  i.length = 0;
  let s = new Set();
  for (let o = Math.floor((n - e) / Nn); o <= Math.floor((n + e) / Nn); o++)
    for (let r = Math.floor((t - e) / Nn); r <= Math.floor((t + e) / Nn); r++) {
      let a = _p.get(Rs(o, r));
      if (a)
        for (let l of a) {
          if (s.has(l)) continue;
          s.add(l);
          let f = Math.floor(l / 4096),
            u = l % 4096,
            c = W.edges[f],
            [h, d] = c.pts[u],
            [p, x] = c.pts[u + 1],
            m = p - h,
            g = x - d,
            M = m * m + g * g || 1,
            y = ((n - h) * m + (t - d) * g) / M;
          y = y < 0 ? 0 : y > 1 ? 1 : y;
          let _ = h + m * y,
            v = d + g * y,
            b = Math.hypot(n - _, t - v);
          b < e &&
            i.push({
              e: c,
              j: u,
              d: b,
              t: y,
              x: _,
              z: v,
              s: c.cum[u] + Math.sqrt(M) * y,
            });
        }
    }
  return i;
}
function edgeY(n, t) {
  if (n.kind === 'X') {
    let e = edgePos(n, t);
    return W2(e.x, e.z);
  }
  if (n.kind === 'R') {
    let e = t / n.len,
      i = n.ya,
      s = n.yb,
      o = Math.min(i, s),
      r = Math.max(i, s);
    if (n.sf) {
      let l = n.len - n.sf;
      if (n.topA) {
        if (t <= n.sf) return i;
        e = (t - n.sf) / l;
      } else {
        if (t >= l) return s;
        e = t / l;
      }
    }
    let a = o < 1 && r - o > 6 ? e * e * (3 - 2 * e) * 0.5 + e * 0.5 : e;
    return i + (s - i) * a;
  }
  return 0;
}
var P9 = {
  x: 0,
  z: 0,
  dx: 1,
  dz: 0,
};
function edgePos(n, t, e = P9) {
  let i = n.cum;
  t = t < 0 ? 0 : t > n.len ? n.len : t;
  let s = 0,
    o = i.length - 2;
  for (; s < o;) {
    let u = (s + o + 1) >> 1;
    i[u] <= t ? (s = u) : (o = u - 1);
  }
  let r = n.pts[s],
    a = n.pts[s + 1],
    l = i[s + 1] - i[s] || 1,
    f = (t - i[s]) / l;
  return ((e.x = r[0] + (a[0] - r[0]) * f), (e.z = r[1] + (a[1] - r[1]) * f), (e.dx = (a[0] - r[0]) / l), (e.dz = (a[1] - r[1]) / l), (e.j = s), e);
}
function buildingsNear(n, t, e, i) {
  i.length = 0;
  for (let s = Math.floor((n - e) / Nn); s <= Math.floor((n + e) / Nn); s++)
    for (let o = Math.floor((t - e) / Nn); o <= Math.floor((t + e) / Nn); o++) {
      let r = wp.get(Rs(s, o));
      if (r) for (let a of r) i.push(a);
    }
  return i;
}
function buildingsInRect(n, t, e, i, s) {
  s.length = 0;
  for (let o = Math.floor(n / Nn); o < Math.ceil(e / Nn); o++)
    for (let r = Math.floor(t / Nn); r < Math.ceil(i / Nn); r++) {
      let a = wp.get(Rs(o, r));
      if (a) for (let l of a) s.push(l);
    }
  return s;
}
function edgesInRect(n, t, e, i) {
  let s = new Set();
  for (let o = Math.floor(n / Nn); o < Math.ceil(e / Nn); o++)
    for (let r = Math.floor(t / Nn); r < Math.ceil(i / Nn); r++) {
      let a = _p.get(Rs(o, r));
      if (a) for (let l of a) s.add(l);
    }
  return s;
}
var k9 = xp.map((n) => ({
  n: n.name,
  e:
    {
      隅田川: 'SUMIDA RIVER',
      神田川: 'KANDA RIVER',
      日本橋川: 'NIHONBASHI RIVER',
      目黒川: 'MEGURO RIVER',
      '\u6E0B\u8C37\u5DDD\u30FB\u53E4\u5DDD': 'FURUKAWA RIVER',
      晴海運河: 'HARUMI CANAL',
      豊洲運河: 'TOYOSU CANAL',
      芝浦運河: 'SHIBAURA CANAL',
      京浜運河: 'KEIHIN CANAL',
      海老取川: 'EBITORI RIVER',
      多摩川: 'TAMA RIVER',
    }[n.name] || 'RIVER',
  w: n.w,
  P: n.pts.map((t) => fe(t[0], t[1])),
}));
function I9(n, t) {
  let e = null,
    i = 1e9;
  for (let s of k9)
    for (let o = 0; o + 1 < s.P.length; o++) {
      let r = yf(n, t, s.P[o][0], s.P[o][1], s.P[o + 1][0], s.P[o + 1][1]) - s.w / 2;
      r < 40 && r < i && ((i = r), (e = s));
    }
  return e
    ? {
        n: e.n,
        e: e.e,
      }
    : null;
}
function districtAt(n, t) {
  let e = bf(W.mask, n, t);
  if (e === M_AIR)
    return {
      n: '\u7FBD\u7530\u7A7A\u6E2F',
      e: 'HANEDA AIRPORT',
    };
  if (e === M_WATER) {
    let o = I9(n, t);
    return (
      o ||
      (n > 1900 && t < -500
        ? {
            n: '\u9685\u7530\u5DDD',
            e: 'SUMIDA RIVER',
          }
        : t > 17e3
          ? {
              n: '\u6A2A\u6D5C\u6E2F',
              e: 'PORT OF YOKOHAMA',
            }
          : t > 13e3
            ? {
                n: '\u5DDD\u5D0E\u6E2F',
                e: 'PORT OF KAWASAKI',
              }
            : t > 2500 && t < 9500 && n < 1500
              ? {
                  n: '\u4EAC\u6D5C\u904B\u6CB3',
                  e: 'KEIHIN CANAL',
                }
              : {
                  n: '\u6771\u4EAC\u6E7E',
                  e: 'TOKYO BAY',
                })
    );
  }
  if (e === M_MOAT)
    return {
      n: '\u7687\u5C45\u306E\u304A\u6FE0',
      e: 'IMPERIAL MOAT',
    };
  if (e === M_PALACE || e === M_MOAT)
    return {
      n: '\u7687\u5C45',
      e: 'IMPERIAL PALACE',
    };
  let i = W.districts[0],
    s = 1e18;
  for (let o of W.districts) {
    let r = (o.x - n) ** 2 + (o.z - t) ** 2;
    r < s && ((s = r), (i = o));
  }
  return i;
}
var yo = [],
  X2 = [];
function Y2(n, t, e) {
  X2.length = 0;
  for (let i of W.lmCol) Math.abs(i.x - n) < e + i.rad && Math.abs(i.z - t) < e + i.rad && X2.push(i);
  return X2;
}
var u0 = 24,
  m0 = new Map(),
  vf = new Map(),
  vp = null;
function propChunk(n) {
  ((vp = n), vf.has(n) || vf.set(n, []));
}
function addProp(n, t, e, i, s = 0) {
  let o = Rs(Math.floor(n / u0), Math.floor(t / u0)),
    r = m0.get(o);
  r || m0.set(o, (r = []));
  let a = {
    x: n,
    z: t,
    r: e,
    h: i,
    y0: s,
    k: vp,
  };
  (r.push(a), vp !== null && vf.get(vp).push(o));
}
function removeChunkProps(n) {
  let t = vf.get(n);
  if (t) {
    for (let e of new Set(t)) {
      let i = m0.get(e);
      if (!i) continue;
      let s = i.filter((o) => o.k !== n);
      s.length ? m0.set(e, s) : m0.delete(e);
    }
    vf.delete(n);
  }
}
var Fv = [];
function propsNear(n, t, e, i = Fv) {
  i.length = 0;
  for (let s = Math.floor((n - e) / u0); s <= Math.floor((n + e) / u0); s++)
    for (let o = Math.floor((t - e) / u0); o <= Math.floor((t + e) / u0); o++) {
      let r = m0.get(Rs(s, o));
      if (r) for (let a of r) i.push(a);
    }
  return i;
}
function L9(n, t, e, i) {
  propsNear(n.x, n.z, t + 2);
  for (let s of Fv) {
    if (e > s.h || e + 1.7 < s.y0) continue;
    let o = n.x - s.x,
      r = n.z - s.z,
      a = Math.hypot(o, r),
      l = t + s.r;
    if (a >= l) continue;
    let f = a > 1e-6 ? o / a : 1,
      u = a > 1e-6 ? r / a : 0,
      c = l - a;
    ((n.x += f * c),
      (n.z += u * c),
      (!i || c > i.pen) &&
        (i = {
          nx: f,
          nz: u,
          pen: c,
          prop: !0,
        }));
  }
  return i;
}
function collideBuildings(n, t, e = 0, i = !1) {
  buildingsNear(n.x, n.z, t + 40, yo);
  let s = null,
    o = W.bld,
    r = Y2(n.x, n.z, t + 5);
  for (let a = 0; a < yo.length + r.length; a++) {
    let l,
      f,
      u,
      c,
      h,
      d,
      p = 0;
    if (a < yo.length) {
      let B = yo[a] * 9;
      ((d = o[B + 6]), (l = o[B]), (f = o[B + 1]), (u = o[B + 2]), (c = o[B + 3] / 2), (h = o[B + 4] / 2));
    } else {
      let B = r[a - yo.length];
      if (((l = B.x), (f = B.z), (u = B.rot), (c = B.w / 2), (h = B.d / 2), (d = B.h), (p = B.y0 || 0), e + 1.7 < p)) continue;
    }
    if (d < 0.5 || e > d + 0.3) continue;
    let x = n.x - l,
      m = n.z - f;
    if (Math.abs(x) > c + h + t && Math.abs(m) > c + h + t) continue;
    let g = Math.cos(u),
      M = Math.sin(u),
      y = x * g + m * M,
      _ = -x * M + m * g,
      v = Math.max(-c, Math.min(c, y)),
      b = Math.max(-h, Math.min(h, _)),
      w = y - v,
      E = _ - b,
      C = w * w + E * E;
    if (C >= t * t) continue;
    let S, T, D;
    if (C < 1e-8) {
      let B = c - Math.abs(y),
        R = h - Math.abs(_);
      B < R ? ((S = Math.sign(y) || 1), (T = 0), (D = B + t)) : ((S = 0), (T = Math.sign(_) || 1), (D = R + t));
    } else {
      let B = Math.sqrt(C);
      ((S = w / B), (T = E / B), (D = t - B));
    }
    let O = S * g - T * M,
      U = S * M + T * g;
    ((n.x += O * D),
      (n.z += U * D),
      (!s || D > s.pen) &&
        (s = {
          nx: O,
          nz: U,
          pen: D,
        }));
  }
  return i ? s : L9(n, t, e, s);
}
function rayBuildings(n, t, e, i, s, o) {
  let r = (n + i) / 2,
    a = (e + o) / 2,
    l = Math.hypot(i - n, o - e);
  buildingsNear(r, a, l / 2 + 30, yo);
  let f = 1,
    u = W.bld,
    c = Y2(r, a, l / 2 + 10).slice();
  for (let h = 0; h < yo.length + c.length; h++) {
    let d,
      p,
      x,
      m,
      g,
      M,
      y = 0;
    if (h < yo.length) {
      let P = yo[h] * 9;
      ((d = u[P]), (p = u[P + 1]), (x = u[P + 2]), (m = u[P + 3] / 2), (g = u[P + 4] / 2), (M = u[P + 6] + 0.2));
    } else {
      let P = c[h - yo.length];
      ((d = P.x), (p = P.z), (x = P.rot), (m = P.w / 2), (g = P.d / 2), (M = P.h), (y = P.y0 || 0));
    }
    if (M < 0.6) continue;
    let _ = Math.cos(x),
      v = Math.sin(x),
      b = (P, H) => [(P - d) * _ + (H - p) * v, -(P - d) * v + (H - p) * _],
      [w, E] = b(n, e),
      [C, S] = b(i, o),
      T = [w, t, E],
      D = [C - w, s - t, S - E],
      O = [-m, y, -g],
      U = [m, M, g],
      B = 0,
      R = f,
      k = !0;
    for (let P = 0; P < 3; P++) {
      if (Math.abs(D[P]) < 1e-9) {
        if (T[P] < O[P] || T[P] > U[P]) {
          k = !1;
          break;
        }
        continue;
      }
      let H = (O[P] - T[P]) / D[P],
        Z = (U[P] - T[P]) / D[P];
      if (H > Z) {
        let q = H;
        ((H = Z), (Z = q));
      }
      if ((H > B && (B = H), Z < R && (R = Z), B > R)) {
        k = !1;
        break;
      }
    }
    k && B < f && (f = B);
  }
  return f;
}
function nearestNode(n, t, e) {
  let i = [];
  roadsNear(n, t, 120, i);
  let s = -1,
    o = 1e18;
  for (let r of i)
    if (!(e && !e(r.e)))
      for (let a of [r.e.a, r.e.b]) {
        let l = W.nodes[a],
          f = (l.x - n) ** 2 + (l.z - t) ** 2;
        f < o && ((o = f), (s = a));
      }
  if (s < 0)
    for (let r of W.nodes) {
      if (e && !r.edges.some((l) => e(W.edges[l]))) continue;
      let a = (r.x - n) ** 2 + (r.z - t) ** 2;
      a < o && ((o = a), (s = r.i));
    }
  return s;
}
function route(n, t, e = 8e4, i = null, s = -1, o = -1) {
  if (n < 0 || t < 0) return null;
  if (n === t) return [n];
  let r = W.nodes.length,
    a = new Float32Array(r).fill(1e30),
    l = new Int32Array(r).fill(-1),
    f = new Uint8Array(r),
    u = [],
    c = [],
    h = (y, _) => {
      (u.push(y), c.push(_));
      let v = u.length - 1;
      for (; v > 0;) {
        let b = (v - 1) >> 1;
        if (u[b] <= u[v]) break;
        (([u[b], u[v]] = [u[v], u[b]]), ([c[b], c[v]] = [c[v], c[b]]), (v = b));
      }
    },
    d = () => {
      let y = c[0],
        _ = u.pop(),
        v = c.pop();
      if (u.length) {
        ((u[0] = _), (c[0] = v));
        let b = 0;
        for (;;) {
          let w = 2 * b + 1,
            E = w + 1,
            C = b;
          if ((w < u.length && u[w] < u[C] && (C = w), E < u.length && u[E] < u[C] && (C = E), C === b)) break;
          (([u[C], u[b]] = [u[b], u[C]]), ([c[C], c[b]] = [c[b], c[C]]), (b = C));
        }
      }
      return y;
    },
    p = W.nodes[t].x,
    x = W.nodes[t].z;
  ((a[n] = 0), h(0, n));
  let m = 0;
  for (; u.length && m++ < e;) {
    let y = d();
    if (!f[y]) {
      if (((f[y] = 1), y === t)) break;
      for (let _ of W.nodes[y].edges) {
        let v = W.edges[_],
          b = v.a === y ? v.b : v.a;
        if ((y === n && b === s) || (b === t && y === o)) continue;
        let w = v.len * (i ? i[v.kind] : v.kind === 'X' ? 0.55 : v.kind === 'L' ? 1.35 : v.kind === 'A' ? 0.9 : 1);
        if (a[y] + w < a[b]) {
          ((a[b] = a[y] + w), (l[b] = y));
          let E = W.nodes[b];
          h(a[b] + Math.hypot(E.x - p, E.z - x) * 0.55, b);
        }
      }
    }
  }
  if (l[t] < 0) return null;
  let g = [],
    M = t;
  for (; M !== n && M >= 0;) (g.push(M), (M = l[M]));
  return (g.push(n), g.reverse());
}
function edgeBetween(n, t) {
  for (let e of W.nodes[n].edges) {
    let i = W.edges[e];
    if ((i.a === n && i.b === t) || (i.b === n && i.a === t)) return i;
  }
  return null;
}
var h0 = null,
  d0 = 40;
function D9() {
  if (h0) return h0;
  h0 = new Map();
  for (let n of W.rails) {
    if (n.kind === 'sub' || n.kind === 'tram') continue;
    let t = n.path,
      e = t.length;
    for (let i = 0; i < e; i++) {
      if ((n.ys ? n.ys[i] : 8) < 0) continue;
      let o = t[i],
        r = t[Math.min(e - 1, i + 1)];
      for (let a of [0, 0.5]) {
        let l = o[0] + (r[0] - o[0]) * a,
          f = o[1] + (r[1] - o[1]) * a,
          u = Rs(Math.floor(l / d0), Math.floor(f / d0)),
          c = h0.get(u);
        (c || h0.set(u, (c = [])), c.push([l, f, n]));
      }
    }
  }
  return h0;
}
function railHits(n, t, e, i, s, o = 7) {
  let r = D9(),
    a = Math.hypot(e, i) / 2 + o,
    l = Math.cos(s),
    f = Math.sin(s);
  for (let u = Math.floor((n - a) / d0); u <= Math.floor((n + a) / d0); u++)
    for (let c = Math.floor((t - a) / d0); c <= Math.floor((t + a) / d0); c++) {
      let h = r.get(Rs(u, c));
      if (h)
        for (let [d, p] of h) {
          let x = d - n,
            m = p - t,
            g = x * l + m * f,
            M = -x * f + m * l;
          if (Math.abs(g) < e / 2 + o && Math.abs(M) < i / 2 + o) return !0;
        }
    }
  return !1;
}
function railFree(n, t, e, i, s, o = 7, r = 160) {
  if (!railHits(n, t, e, i, s, o)) return [n, t];
  for (let a = 6; a <= r; a += 6)
    for (let l = 0; l < 8; l++) {
      let f = (l / 8) * Math.PI * 2 + s,
        u = n + Math.cos(f) * a,
        c = t + Math.sin(f) * a;
      if (!railHits(u, c, e, i, s, o)) return [u, c];
    }
  return null;
}
var Nv = [];
function roadHits(n, t, e, i, s, o = 1) {
  let r = Math.cos(s),
    a = Math.sin(s),
    l = Math.max(1, Math.ceil(e / 5)),
    f = Math.max(1, Math.ceil(i / 5));
  for (let u = 0; u <= l; u++)
    for (let c = 0; c <= f; c++) {
      let h = (u / l - 0.5) * e,
        d = (c / f - 0.5) * i,
        p = n + r * h - a * d,
        x = t + a * h + r * d;
      roadsNear(p, x, 22, Nv);
      for (let m of Nv) if ((!m.e.elev || edgeY(m.e, m.s) < 9) && m.d < m.e.hw + o) return !0;
    }
  return !1;
}
function freeSpot(n, t, e, i, s, o = 140, r = 6) {
  let a = (l, f) => !roadHits(l, f, e, i, s, 1) && !railHits(l, f, e, i, s, r) && !isWaterAt(l, f);
  if (a(n, t)) return [n, t];
  for (let l = 5; l <= o; l += 5)
    for (let f = 0; f < 12; f++) {
      let u = (f / 12) * Math.PI * 2 + s,
        c = n + Math.cos(u) * l,
        h = t + Math.sin(u) * l;
      if (a(c, h)) return [c, h];
    }
  return null;
}
var q2 = new Map(),
  p0 = 32,
  Hv = [];
function treeFree(n, t, e) {
  for (let i = Math.floor((n - e) / p0); i <= Math.floor((n + e) / p0); i++)
    for (let s = Math.floor((t - e) / p0); s <= Math.floor((t + e) / p0); s++) {
      let o = Rs(i, s),
        r = q2.get(o);
      (r || q2.set(o, (r = [])), r.push([n, t, e]));
    }
}
function treeFreePoly(n) {
  let t = 1e9,
    e = 1e9,
    i = -1e9,
    s = -1e9;
  for (let o of n) ((t = Math.min(t, o[0])), (i = Math.max(i, o[0])), (e = Math.min(e, o[1])), (s = Math.max(s, o[1])));
  Hv.push({
    P: n,
    x0: t,
    z0: e,
    x1: i,
    z1: s,
  });
}
function inPoly(n, t, e) {
  let i = !1;
  for (let s = 0, o = e.length - 1; s < e.length; o = s++) {
    let r = e[s],
      a = e[o];
    r[1] > t != a[1] > t && n < r[0] + ((t - r[1]) / (a[1] - r[1])) * (a[0] - r[0]) && (i = !i);
  }
  return i;
}
function treeBlocked(n, t) {
  let e = q2.get(Rs(Math.floor(n / p0), Math.floor(t / p0)));
  if (e) {
    for (let i of e) if ((n - i[0]) ** 2 + (t - i[1]) ** 2 < i[2] * i[2]) return !0;
  }
  for (let i of Hv) if (n > i.x0 && n < i.x1 && t > i.z0 && t < i.z1 && inPoly(n, t, i.P)) return !0;
  for (let i of Y2(n, t, 3)) {
    let s = Math.cos(i.rot),
      o = Math.sin(i.rot),
      r = n - i.x,
      a = t - i.z,
      l = r * s + a * o,
      f = -r * o + a * s;
    if (Math.abs(l) < i.w / 2 + 2.5 && Math.abs(f) < i.d / 2 + 2.5) return !0;
  }
  return !1;
}
function fitColliders() {
  let n = [],
    t = 0,
    e = (i) => {
      let s = Math.cos(i.rot || 0),
        o = Math.sin(i.rot || 0),
        r = 0,
        a = Math.max(2, Math.ceil(i.w / 6)),
        l = Math.max(2, Math.ceil(i.d / 6));
      for (let f = 0; f <= a; f++)
        for (let u = 0; u <= l; u++) {
          let c = (f / a - 0.5) * i.w,
            h = (u / l - 0.5) * i.d,
            d = i.x + s * c - o * h,
            p = i.z + o * c + s * h;
          roadsNear(d, p, 30, n);
          for (let x of n) {
            if (x.e.elev) {
              let m = edgeY(x.e, x.s);
              if ((i.y0 || 0) > m + 2.5 || i.h < m - 0.5) continue;
            }
            r = Math.max(r, x.e.hw - x.d);
          }
        }
      return r;
    };
  for (let i of W.lmCol) {
    if (i.h < 1) continue;
    let s = 0;
    for (; e(i) > 0.2 && s < 26 && i.w > 2 && i.d > 2;) ((i.w *= 0.94), (i.d *= 0.94), (i.rad = Math.hypot(i.w, i.d) / 2), s++);
    s && t++;
  }
  return t;
}
function clearBuilding(n) {
  let t = W.bld;
  (t[n + 6] >= 1 &&
    t[n + 3] > 0 &&
    W.cleared.push({
      x: t[n],
      z: t[n + 1],
      rot: t[n + 2],
      w: t[n + 3],
      d: t[n + 4],
    }),
    (t[n + 6] = 0),
    (t[n + 3] = 0),
    (t[n + 4] = 0));
}
function N9() {
  this.array = null;
}
var Mt = class {
    constructor(t = {}) {
      ((this.nv = 0),
        (this.cap = 0),
        (this.c = t.color ? !0 : null),
        (this.B = t.aB ? !0 : null),
        (this.Mt = t.mat ? !0 : null),
        (this.col = [1, 1, 1]),
        (this.bv = [0, 0, 0, 0]),
        (this.mv = 0),
        this._grow(64));
    }
    _grow(t) {
      let e = Math.max(t, this.cap * 2 || 64),
        i = (s, o, r) => {
          let a = new o(e * r);
          return (s && a.set(s.subarray(0, this.nv * r)), a);
        };
      ((this._p = i(this._p, Float32Array, 3)),
        (this._n = i(this._n, Int8Array, 3)),
        (this._uv = i(this._uv, Float32Array, 2)),
        this.c && (this._c = i(this._c, Uint16Array, 3)),
        this.B && ((this._B = i(this._B, Float32Array, 4)), (this._F = i(this._F, Float32Array, 2))),
        this.Mt && (this._M = i(this._M, Float32Array, 1)),
        (this.cap = e));
    }
    get p() {
      return this._p.subarray(0, this.nv * 3);
    }
    setColor(t) {
      if (typeof t == 'number') {
        let e = new THREE.Color(t);
        this.col = [e.r, e.g, e.b];
      } else this.col = t;
      return this;
    }
    v(t, e, i, s, o, r, a, l, f, u) {
      this.nv >= this.cap && this._grow(this.nv + 1);
      let c = this.nv++,
        h = c * 3,
        d = c * 2,
        p = this._p,
        x = this._n,
        m = (g) => Math.round((g > 1 ? 1 : g < -1 ? -1 : g) * 127);
      if (
        ((p[h] = t),
        (p[h + 1] = e),
        (p[h + 2] = i),
        (x[h] = m(s)),
        (x[h + 1] = m(o)),
        (x[h + 2] = m(r)),
        (this._uv[d] = a),
        (this._uv[d + 1] = l),
        this.c)
      ) {
        let g = this._c,
          M = this.col,
          y = (_) => Math.round((_ > 1 ? 1 : _ < 0 ? 0 : _) * 65535);
        ((g[h] = y(M[0])), (g[h + 1] = y(M[1])), (g[h + 2] = y(M[2])));
      }
      if ((this.Mt && (this._M[c] = this.mv), this.B)) {
        let g = this.bv,
          M = c * 4;
        ((this._B[M] = g[0]),
          (this._B[M + 1] = g[1]),
          (this._B[M + 2] = g[2]),
          (this._B[M + 3] = g[3]),
          (this._F[d] = f ?? a),
          (this._F[d + 1] = u ?? l));
      }
    }
    quad(t, e, i, s, o, r, a) {
      o || (o = Gv(Bv(Tp(e, t), Tp(i, t))));
      let l = r || [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        f = a || l;
      (this.v(t[0], t[1], t[2], o[0], o[1], o[2], l[0][0], l[0][1], f[0][0], f[0][1]),
        this.v(e[0], e[1], e[2], o[0], o[1], o[2], l[1][0], l[1][1], f[1][0], f[1][1]),
        this.v(i[0], i[1], i[2], o[0], o[1], o[2], l[2][0], l[2][1], f[2][0], f[2][1]),
        this.v(t[0], t[1], t[2], o[0], o[1], o[2], l[0][0], l[0][1], f[0][0], f[0][1]),
        this.v(i[0], i[1], i[2], o[0], o[1], o[2], l[2][0], l[2][1], f[2][0], f[2][1]),
        this.v(s[0], s[1], s[2], o[0], o[1], o[2], l[3][0], l[3][1], f[3][0], f[3][1]));
    }
    tri(t, e, i, s, o) {
      s || (s = Gv(Bv(Tp(e, t), Tp(i, t))));
      let r = o || [
        [0, 0],
        [1, 0],
        [0.5, 1],
      ];
      (this.v(t[0], t[1], t[2], s[0], s[1], s[2], r[0][0], r[0][1]),
        this.v(e[0], e[1], e[2], s[0], s[1], s[2], r[1][0], r[1][1]),
        this.v(i[0], i[1], i[2], s[0], s[1], s[2], r[2][0], r[2][1]));
    }
    ribbon(t, e, i, s, o, r, a, l, f = 8, u = 0) {
      let c = i - t,
        h = s - e,
        d = Math.hypot(c, h) || 1,
        p = -h / d,
        x = c / d,
        m = [t + p * o, a, e + x * o],
        g = [t - p * r, a, e - x * r],
        M = [i - p * r, l, s - x * r],
        y = [i + p * o, l, s + x * o],
        _ = u / f,
        v = (u + d) / f;
      this.quad(
        g,
        m,
        y,
        M,
        [0, 1, 0],
        [
          [-r / f, _],
          [o / f, _],
          [o / f, v],
          [-r / f, v],
        ],
      );
    }
    box(t, e, i, s, o, r, a, l = {}) {
      let f = Math.cos(a),
        u = Math.sin(a),
        c = (g, M, y) => [t + f * g - u * M, y, i + u * g + f * M],
        h = s / 2,
        d = r / 2,
        p = e + o,
        x = [
          [-h, -d],
          [h, -d],
          [h, d],
          [-h, d],
        ],
        m = 0;
      for (let g = 0; g < 4; g++) {
        let [M, y] = x[g],
          [_, v] = x[(g + 1) % 4],
          b = Math.hypot(_ - M, v - y),
          w = _ - M,
          E = v - y,
          C = E / b,
          S = -w / b,
          T = f * C - u * S,
          D = u * C + f * S;
        if (l.skipBottomFaces && o < 0.01) continue;
        let O = m + (l.fu || 0),
          U = l.base ?? 0;
        (this.quad(
          c(_, v, e),
          c(M, y, e),
          c(M, y, p),
          c(_, v, p),
          [T, 0, D],
          [
            [(O + b) / 4, (e - U) / 4],
            [O / 4, (e - U) / 4],
            [O / 4, (p - U) / 4],
            [(O + b) / 4, (p - U) / 4],
          ],
          [
            [O + b, e - U],
            [O, e - U],
            [O, p - U],
            [O + b, p - U],
          ],
        ),
          (m += b));
      }
      if (!l.noTop) {
        let g = c(-h, -d, p),
          M = c(h, -d, p),
          y = c(h, d, p),
          _ = c(-h, d, p);
        this.quad(
          _,
          y,
          M,
          g,
          [0, 1, 0],
          [
            [g[0] / 6, g[2] / 6],
            [M[0] / 6, M[2] / 6],
            [y[0] / 6, y[2] / 6],
            [_[0] / 6, _[2] / 6],
          ].reverse(),
        );
      }
      if (l.bottom) {
        let g = c(-h, -d, e),
          M = c(h, -d, e),
          y = c(h, d, e),
          _ = c(-h, d, e);
        this.quad(g, M, y, _, [0, -1, 0]);
      }
    }
    gable(t, e, i, s, o, r, a) {
      let l = Math.cos(a),
        f = Math.sin(a),
        u = (y, _, v) => [t + l * y - f * _, v, i + f * y + l * _],
        c = s / 2,
        h = o / 2,
        d = u(-c, -h, e),
        p = u(c, -h, e),
        x = u(c, h, e),
        m = u(-c, h, e),
        g = u(-c, 0, e + r),
        M = u(c, 0, e + r);
      (this.quad(p, d, g, M, null, null), this.quad(m, x, M, g, null, null), this.tri(d, m, g, [-l, 0, -f]), this.tri(x, p, M, [l, 0, f]));
    }
    cyl(t, e, i, s, o, r = 8, a = !0) {
      for (let l = 0; l < r; l++) {
        let f = (l / r) * Math.PI * 2,
          u = ((l + 1) / r) * Math.PI * 2,
          c = Math.cos(f),
          h = Math.sin(f),
          d = Math.cos(u),
          p = Math.sin(u),
          x = [(c + d) / 2, 0, (h + p) / 2];
        (this.quad([t + d * s, e, i + p * s], [t + c * s, e, i + h * s], [t + c * s, e + o, i + h * s], [t + d * s, e + o, i + p * s], x),
          a && this.tri([t, e + o, i], [t + d * s, e + o, i + p * s], [t + c * s, e + o, i + h * s], [0, 1, 0]));
      }
    }
    ell(t, e, i, s, o, r, a = 10, l = 6, f = 0, u = 1) {
      let c = (h, d) => {
        let p = h * Math.PI * 2,
          x = d * Math.PI;
        return [t + Math.sin(x) * Math.cos(p) * s, e - Math.cos(x) * o, i + Math.sin(x) * Math.sin(p) * r];
      };
      for (let h = 0; h < l; h++) {
        let d = f + ((u - f) * h) / l,
          p = f + ((u - f) * (h + 1)) / l;
        for (let x = 0; x < a; x++) {
          let m = x / a,
            g = (x + 1) / a,
            M = c(m, d),
            y = c(g, d),
            _ = c(g, p),
            v = c(m, p);
          d <= 1e-6 ? this.tri(M, v, _, null) : p >= 1 - 1e-6 ? this.tri(M, v, y, null) : this.quad(M, v, _, y, null);
        }
      }
    }
    tube(t, e, i, s, o, r, a, l, f = 10, u = !0, c = 0, h = 0) {
      for (let d = 0; d < f; d++) {
        let p = (d / f) * Math.PI * 2,
          x = ((d + 1) / f) * Math.PI * 2,
          m = (v, b, w, E, C) => [t + Math.cos(v) * b, E, i + Math.sin(v) * w + C],
          g = m(p, s, o, e, c),
          M = m(x, s, o, e, c),
          y = m(x, r, a, e + l, h),
          _ = m(p, r, a, e + l, h);
        (this.quad(M, g, _, y, null), u && (this.tri([t, e + l, i + h], y, _, [0, 1, 0]), this.tri([t, e, i + c], g, M, [0, -1, 0])));
      }
    }
    discDown(t, e, i, s, o = 14) {
      for (let r = 0; r < o; r++) {
        let a = (r / o) * Math.PI * 2,
          l = ((r + 1) / o) * Math.PI * 2;
        this.tri([t, e, i], [t + Math.cos(a) * s, e, i + Math.sin(a) * s], [t + Math.cos(l) * s, e, i + Math.sin(l) * s], [0, -1, 0]);
      }
    }
    disc(t, e, i, s, o = 14) {
      for (let r = 0; r < o; r++) {
        let a = (r / o) * Math.PI * 2,
          l = ((r + 1) / o) * Math.PI * 2;
        this.tri(
          [t, e, i],
          [t + Math.cos(l) * s, e, i + Math.sin(l) * s],
          [t + Math.cos(a) * s, e, i + Math.sin(a) * s],
          [0, 1, 0],
          [
            [t / 8, i / 8],
            [(t + Math.cos(l) * s) / 8, (i + Math.sin(l) * s) / 8],
            [(t + Math.cos(a) * s) / 8, (i + Math.sin(a) * s) / 8],
          ],
        );
      }
    }
    vplane(t, e, i, s, o, r, a, l) {
      let f = a,
        u = -r,
        c = [t - (f * s) / 2, e, i - (u * s) / 2],
        h = [t + (f * s) / 2, e, i + (u * s) / 2];
      this.quad(c, h, [h[0], e + o, h[2]], [c[0], e + o, c[2]], [r, 0, a], l);
    }
    prism(t, e, i, s, o, r, a, l, f, u) {
      let c = [
          [-o, e, l],
          [o, e, l],
          [o, e, a],
          [-o, e, a],
        ].map((d) => [t + d[0], d[1], s + d[2]]),
        h = [
          [-r, i, u],
          [r, i, u],
          [r, i, f],
          [-r, i, f],
        ].map((d) => [t + d[0], d[1], s + d[2]]);
      (this.quad(c[3], c[2], h[2], h[3], null),
        this.quad(c[1], c[0], h[0], h[1], null),
        this.quad(c[2], c[1], h[1], h[2], null),
        this.quad(c[0], c[3], h[3], h[0], null),
        this.quad(h[3], h[2], h[1], h[0], null));
    }
    get count() {
      return this.nv;
    }
    build() {
      let t = new THREE.BufferGeometry(),
        e = this.nv,
        i = (s, o) => s.slice(0, e * o);
      (t.setAttribute('position', new THREE.BufferAttribute(i(this._p, 3), 3)),
        t.setAttribute('normal', new THREE.BufferAttribute(i(this._n, 3), 3, !0)),
        t.setAttribute('uv', new THREE.BufferAttribute(i(this._uv, 2), 2)),
        this.c && t.setAttribute('color', new THREE.BufferAttribute(i(this._c, 3), 3, !0)),
        this.B &&
          (t.setAttribute('aB', new THREE.BufferAttribute(i(this._B, 4), 4)), t.setAttribute('aF', new THREE.BufferAttribute(i(this._F, 2), 2))),
        this.Mt && t.setAttribute('aMat', new THREE.BufferAttribute(i(this._M, 1), 1)),
        t.computeBoundingSphere());
      for (let s in t.attributes) t.attributes[s].onUpload(N9);
      return t;
    }
  },
  Tp = (n, t) => [n[0] - t[0], n[1] - t[1], n[2] - t[2]],
  Bv = (n, t) => [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]],
  Gv = (n) => {
    let t = Math.hypot(...n) || 1;
    return n.map((e) => e / t);
  };
var TR = {};
vi(TR, {
  DRV: () => DRV,
  RAILSPEC: () => RAILSPEC,
  buildRailChunk: () => buildRailChunk,
  cabMode: () => cabMode,
  driverInput: () => driverInput,
  hideInterior: () => hideInterior,
  initTrains: () => initTrains,
  nextStation: () => nextStation,
  notchName: () => notchName,
  placeInterior: () => placeInterior,
  railPos: () => railPos,
  setDoorSfx: () => setDoorSfx,
  setupStations: () => setupStations,
  skipToNext: () => skipToNext,
  stopsAt: () => stopsAt,
  terminusName: () => terminusName,
  trainInterior: () => trainInterior,
  updTrains: () => updTrains,
});
var G = {
    t: 0,
    dt: 0,
    paused: !1,
    started: !1,
    player: null,
    cars: [],
    peds: [],
    trains: [],
    aircraft: [],
    input: {
      mx: 0,
      my: 0,
      lx: 0,
      ly: 0,
      thr: 0,
      brake: 0,
      steer: 0,
      hand: 0,
      sprint: !1,
      jump: !1,
      act: !1,
      enter: !1,
      horn: !1,
      pitch: 0,
      roll: 0,
      yaw: 0,
      collective: 0,
      look: [0, 0],
    },
    pressed: new Set(),
    cam: {
      yaw: 0,
      pitch: 0.25,
      dist: 6,
      x: 0,
      y: 10,
      z: 0,
      lastDrag: -10,
      mode: 'follow',
      fov: 60,
      shake: 0,
    },
    money: 5e3,
    heat: 0,
    evade: 0,
    bust: 0,
    waypoint: null,
    route: null,
    stats: {
      missions: 0,
      jobs: 0,
      distance: 0,
      rides: 0,
      flights: 0,
      capsules: [],
    },
    settings: {
      quality: 'mid',
      sound: !0,
      music: !0,
      invertY: !1,
      sens: 1,
      timeSpeed: 1,
    },
    ui: {},
    events: [],
  },
  xt = (n, t) =>
    G.events.push({
      type: n,
      data: t,
    }),
  rt = (n, t) => n + (t - n) * Math.random(),
  Be = (n) => n[Math.floor(Math.random() * n.length)],
  It = (n, t, e) => (n < t ? t : n > e ? e : n),
  Ee = (n, t, e) => n + (t - n) * e,
  ln = (n) => ((n %= Math.PI * 2), n > Math.PI ? (n -= Math.PI * 2) : n < -Math.PI && (n += Math.PI * 2), n),
  Ke = () => (G.heat >= 1 ? Math.min(5, Math.floor(G.heat + 1e-6)) : 0);
var RAILSPEC = {
    el: {
      vmax: 33,
      cars: 8,
      carL: 20,
      deckW: 10.5,
    },
    sub: {
      vmax: 28,
      cars: 8,
      carL: 20,
    },
    mono: {
      vmax: 28,
      cars: 6,
      carL: 15,
      deckW: 1,
    },
    ats: {
      vmax: 20,
      cars: 6,
      carL: 9,
      deckW: 8,
    },
    tram: {
      vmax: 13,
      cars: 1,
      carL: 13,
      deckW: 6,
    },
  },
  Fr = 2.1;
function railPos(n, t, e) {
  let i = n.path,
    s = n.cum,
    o = i.length,
    r = n.len;
  n.loop ? ((t %= r), t < 0 && (t += r)) : (t = It(t, 0, r - 0.01));
  let a = 0,
    l = o - 1;
  for (; a < l;) {
    let m = (a + l + 1) >> 1;
    s[m] <= t ? (a = m) : (l = m - 1);
  }
  let f = i[a],
    u = i[(a + 1) % o],
    c = (a + 1 < o ? s[a + 1] : r) - s[a] || 1,
    h = Math.min(1, (t - s[a]) / c);
  ((e.x = f[0] + (u[0] - f[0]) * h), (e.z = f[1] + (u[1] - f[1]) * h), (e.y = n.ys ? n.ys[a] + (n.ys[(a + 1) % o] - n.ys[a]) * h : n.y));
  let d = u[0] - f[0],
    p = u[1] - f[1],
    x = Math.hypot(d, p) || 1;
  return ((e.dx = d / x), (e.dz = p / x), e);
}
var Ef = null,
  M0 = 32;
function U9() {
  ((Ef = new Map()),
    W.rails.forEach((n, t) => {
      if (n.kind !== 'el' && n.kind !== 'ats') return;
      let e = n.path,
        i = e.length;
      for (let s = 0; s < i - (n.loop ? 0 : 1); s++) {
        let o = e[s],
          r = e[(s + 1) % i],
          a = n.ys ? (n.ys[s] + n.ys[(s + 1) % i]) / 2 : n.y;
        if (a < 1.5) continue;
        let l = Math.min(o[0], r[0]) - 18,
          f = Math.max(o[0], r[0]) + 18,
          u = Math.min(o[1], r[1]) - 18,
          c = Math.max(o[1], r[1]) + 18,
          h = [t, o[0], o[1], r[0], r[1], a + (t % 9) * 0.014];
        for (let d = Math.floor(l / M0); d <= Math.floor(f / M0); d++)
          for (let p = Math.floor(u / M0); p <= Math.floor(c / M0); p++) {
            let x = d * 100003 + p,
              m = Ef.get(x);
            (m || Ef.set(x, (m = [])), m.push(h));
          }
      }
    }));
}
var Ap = [];
function F9(n, t, e, i, s, o) {
  (Ef || U9(), (Ap.length = 0));
  let r = Ef.get(Math.floor(t / M0) * 100003 + Math.floor(e / M0));
  if (!r) return Ap;
  let a = new Map();
  for (let [l, f, u, c, h, d] of r) {
    if (l === n || Math.abs(d - o) > 1.6) continue;
    let p = c - f,
      x = h - u,
      m = Math.hypot(p, x) || 1;
    if (Math.abs((p * i + x * s) / m) < 0.94) continue;
    let g = ((t - f) * p + (e - u) * x) / (m * m);
    if (g < -0.05 || g > 1.05) continue;
    g = Math.max(0, Math.min(1, g));
    let M = f + p * g,
      y = u + x * g,
      _ = M - t,
      v = y - e,
      b = Math.hypot(_, v);
    if (b < 4 || b > 24) continue;
    let w = _ * s - v * i > 0 ? 1 : -1,
      E = l * 2 + (w > 0 ? 1 : 0),
      C = a.get(E);
    (!C || b < C.d) &&
      a.set(E, {
        ri: l,
        d: b,
        side: w,
        y: d,
      });
  }
  for (let l of a.values()) Ap.push(l);
  return Ap;
}
var oe = {},
  Sf = null;
function O9() {
  if (Sf) return Sf;
  Sf = new Map();
  let n = new Map(),
    t = (e, i) => Math.floor(e / 12) * 1e5 + Math.floor(i / 12);
  return (
    W.rails.forEach((e, i) => {
      (e.kind !== 'el' && e.kind !== 'ats') ||
        e.path.forEach((s, o) => {
          let r = t(s[0], s[1]),
            a = n.get(r);
          (a || n.set(r, (a = [])), a.push([s[0], s[1], e.ys ? e.ys[o] : e.y, i]));
        });
    }),
    W.rails.forEach((e, i) => {
      if (e.kind !== 'el') return;
      let s = new Uint8Array(e.path.length);
      (e.path.forEach((o, r) => {
        let a = e.path[Math.min(e.path.length - 1, r + 1)],
          l = e.path[Math.max(0, r - 1)],
          f = a[0] - l[0],
          u = a[1] - l[1],
          c = Math.hypot(f, u) || 1,
          h = u / c,
          d = -f / c,
          p = e.ys ? e.ys[r] : e.y;
        for (let x = -1; x <= 1; x++)
          for (let m = -1; m <= 1; m++) {
            let g = n.get((Math.floor(o[0] / 12) + x) * 1e5 + Math.floor(o[1] / 12) + m);
            if (g)
              for (let M of g) {
                if (M[3] === i || Math.abs(M[2] - p) > 4) continue;
                let y = M[0] - o[0],
                  _ = M[1] - o[1],
                  v = y * h + _ * d;
                Math.hypot(y, _) < 13 && Math.abs(v) < 11.5 && (s[r] |= v > 0 ? 1 : 2);
              }
          }
      }),
        Sf.set(e, s));
    }),
    Sf
  );
}
function buildRailChunk(n, t, e, i, s, o, r, a, l, f) {
  let u = O9();
  for (let [c, h] of W.rails.entries()) {
    if (h.kind === 'sub') continue;
    let d = h.path,
      p = d.length,
      x = RAILSPEC[h.kind];
    for (let m = 0; m < p - (h.loop ? 0 : 1); m++) {
      let g = d[m],
        M = d[(m + 1) % p],
        y = (g[0] + M[0]) / 2,
        _ = (g[1] + M[1]) / 2;
      if (y < n || y >= e || _ < t || _ >= i) continue;
      let v = h.ys ? (h.ys[m] + h.ys[(m + 1) % p]) / 2 : h.y;
      if (v < 1.5 && h.kind !== 'tram') continue;
      let b = v + (c % 9) * 0.014,
        w = M[0] - g[0],
        E = M[1] - g[1],
        C = Math.hypot(w, E);
      if (C < 0.01) continue;
      let S = E / C,
        T = -w / C,
        D = Math.atan2(E, w),
        O = 0.25,
        U = g[0] - (w / C) * O,
        B = g[1] - (E / C) * O,
        R = M[0] + (w / C) * O,
        k = M[1] + (E / C) * O;
      if (h.kind === 'el' || h.kind === 'ats') {
        let P = x.deckW / 2,
          H = {
            '-1': P,
            1: P,
          },
          Z = {
            '-1': null,
            1: null,
          };
        for (let Y of F9(c, y, _, w / C, E / C, v)) {
          let Q = Y.side,
            J = Math.min(P + 7, Math.max(P, Y.d / 2 + 0.03));
          Y.d / 2 < P + 7 && (!Z[Q] || Y.d < Z[Q].d) && ((H[Q] = J), (Z[Q] = Y));
        }
        let q = H[1],
          G = H[-1];
        (s.ribbon(U, B, R, k, G, q, b, b, 6, h.cum[m]),
          s.quad(
            [U + S * q, b - 1.3, B + T * q],
            [R + S * q, b - 1.3, k + T * q],
            [R - S * G, b - 1.3, k - T * G],
            [U - S * G, b - 1.3, B - T * G],
            [0, -1, 0],
          ));
        for (let Y of [-1, 1]) {
          let Q = Z[String(Y)],
            J = (Y > 0 ? q : G) * Y;
          if (Q) {
            b > Q.y + 0.05 &&
              (s.quad([U + S * J, Q.y, B + T * J], [R + S * J, Q.y, k + T * J], [R + S * J, b, k + T * J], [U + S * J, b, B + T * J], null),
              s.quad([R + S * J, Q.y, k + T * J], [U + S * J, Q.y, B + T * J], [U + S * J, b, B + T * J], [R + S * J, b, k + T * J], null));
            continue;
          }
          (s.quad(
            [U + S * J, b - 1.3, B + T * J],
            [R + S * J, b - 1.3, k + T * J],
            [R + S * J, b + (h.kind === 'ats' ? 1.4 : 0.9), k + T * J],
            [U + S * J, b + (h.kind === 'ats' ? 1.4 : 0.9), B + T * J],
            null,
          ),
            s.quad(
              [R + S * J, b - 1.3, k + T * J],
              [U + S * J, b - 1.3, B + T * J],
              [U + S * J, b + (h.kind === 'ats' ? 1.4 : 0.9), B + T * J],
              [R + S * J, b + (h.kind === 'ats' ? 1.4 : 0.9), k + T * J],
              null,
            ));
        }
        if (h.kind === 'el')
          for (let Y of [-Fr, Fr])
            for (let Q of [-0.72, 0.72]) {
              let J = Y + Q;
              o.setColor(5920078).ribbon(U + S * J, B + T * J, R + S * J, k + T * J, 0.07, 0.07, b + 0.18, b + 0.18);
            }
        if (h.kind === 'el')
          for (let Y of [-Fr, Fr]) r.setColor(4867392).ribbon(U + S * Y, B + T * Y, R + S * Y, k + T * Y, 1.3, 1.3, b + 0.06, b + 0.06);
        let tt = h.cum[m],
          K = tt + C;
        for (let Y = Math.ceil(tt / 26) * 26; Y < K; Y += 26) {
          let Q = (Y - tt) / C,
            J = g[0] + w * Q,
            ft = g[1] + E * Q;
          Z2(J, ft) ||
            (s.box(J, 0, ft, 1.9, b - 1.3, 2.4, D, {
              noTop: !0,
            }),
            addProp(J, ft, 1.3, b - 1.3));
        }
        if (h.kind === 'el') {
          let Y = u.get(h),
            Q = Y ? Y[m] : 0;
          for (let J = Math.ceil(tt / 50) * 50; J < K; J += 50) {
            let ft = (J - tt) / C,
              yt = g[0] + w * ft,
              zt = g[1] + E * ft;
            for (let At of [-1, 1]) {
              if (Q & (At > 0 ? 1 : 2) || (Z[String(At)] && c > Z[String(At)].ri)) continue;
              let ct = Z[String(At)] ? (At > 0 ? q : G) : 4.8;
              o.setColor(8225416).box(yt + S * At * ct, b, zt + T * At * ct, 0.22, 6.2, 0.22, D, {});
            }
            Q !== 3 && o.box(yt, b + 6, zt, 0.22, 0.22, 10, D + Math.PI / 2, {});
          }
        }
        if (h.kind === 'el') {
          let Y = (U + R) / 2,
            Q = (B + k) / 2,
            J = Math.hypot(R - U, k - B);
          for (let ft of [-Fr, Fr])
            (o.setColor(3814704).box(Y + S * ft, b + 5.35, Q + T * ft, J, 0.035, 0.035, D, {}),
              o.box(Y + S * ft, b + 5.75, Q + T * ft, J, 0.03, 0.03, D, {}));
        }
      } else if (h.kind === 'mono') {
        (s.ribbon(U, B, R, k, 0.45, 0.45, b, b),
          s.quad(
            [U + S * 0.45, b - 1.6, B + T * 0.45],
            [R + S * 0.45, b - 1.6, k + T * 0.45],
            [R - S * 0.45, b - 1.6, k - T * 0.45],
            [U - S * 0.45, b - 1.6, B - T * 0.45],
            [0, -1, 0],
          ));
        for (let Z of [-1, 1]) {
          let q = 0.45 * Z;
          (s.quad([U + S * q, b - 1.6, B + T * q], [R + S * q, b - 1.6, k + T * q], [R + S * q, b, k + T * q], [U + S * q, b, B + T * q], null),
            s.quad([R + S * q, b - 1.6, k + T * q], [U + S * q, b - 1.6, B + T * q], [U + S * q, b, B + T * q], [R + S * q, b, k + T * q], null));
        }
        let P = h.cum[m],
          H = P + C;
        for (let Z = Math.ceil(P / 30) * 30; Z < H; Z += 30) {
          let q = (Z - P) / C,
            G = g[0] + w * q,
            tt = g[1] + E * q;
          Z2(G, tt) ||
            (s.box(G, 0, tt, 1.5, b - 1.6, 1.5, D, {
              noTop: !0,
            }),
            addProp(G, tt, 0.95, b - 1.6));
        }
      } else if (h.kind === 'tram') {
        if (maskQ(y, _) === M_WATER) continue;
        r.setColor(9079948).ribbon(U, B, R, k, 3, 3, 0.07, 0.07);
        for (let P of [-1.6, 1.6])
          for (let H of [-0.55, 0.55])
            o.setColor(6972766).ribbon(U + S * (P + H), B + T * (P + H), R + S * (P + H), k + T * (P + H), 0.06, 0.06, 0.1, 0.1);
      }
    }
    for (let m of h.st) m.x < n || m.x >= e || m.z < t || m.z >= i || H9(h, m, s, o, r, a, l, f);
  }
  for (let c of W.stations) c.big && c.big.x >= n && c.big.x < e && c.big.z >= t && c.big.z < i && G9(c, s, o, r, a, l, f);
  for (let c of W.stations)
    for (let h of c.entrances || []) {
      if (h.x < n || h.x >= e || h.z < t || h.z >= i || h.kind !== 'sub') continue;
      let d = h.rot;
      (r.setColor(14080218).box(h.x, 0.18, h.z, 2.6, 2.7, 4.2, d, {}),
        r.setColor(4014664).box(h.x, 2.88, h.z, 3, 0.25, 4.6, d, {}),
        a.setColor(h.color).box(h.x + Math.cos(d) * 1.31, 2.3, h.z + Math.sin(d) * 1.31, 0.05, 0.6, 0.6, d, {}),
        f.push({
          x: h.x,
          y: 3.6,
          z: h.z,
          w: 3.2,
          h: 0.9,
          nx: Math.cos(d + Math.PI / 2),
          nz: Math.sin(d + Math.PI / 2),
          lines: [c.ja + '\u99C5', h.label],
          bg: '#ffffff',
          fg: '#1d2b5a',
          both: !0,
        }),
        l.push([h.x, 3.2, h.z, 0.9, 0.95, 1]));
    }
}
function Z2(n, t) {
  let e = [];
  roadsNear(n, t, 14, e);
  for (let i of e) if (!i.e.elev && i.d < i.e.hw + 0.5) return !0;
  return !1;
}
function H9(n, t, e, i, s, o, r, a) {
  if (n.ys && n.ys[t.i] < 1.5 && n.kind !== 'tram') return;
  let l = n.ys ? n.ys[t.i] : n.y,
    f = n.kind === 'tram' ? 12 : n.kind === 'ats' ? 40 : t.complex && t.complex.big ? 110 : 75,
    u = t.s,
    c = n.kind === 'mono' ? 3.2 : n.kind === 'tram' ? 2 : 3.2,
    h = n.kind === 'mono' ? 3.4 : n.kind === 'tram' ? 4.2 : n.kind === 'ats' ? 5.4 : 5.1;
  for (let M = u - f; M < u + f; M += 6) {
    railPos(n, M + 3, oe);
    let y = oe.dz,
      _ = -oe.dx,
      v = Math.atan2(oe.dz, oe.dx),
      b = n.kind === 'tram' ? 0.35 : l + 1.05;
    for (let w of [-1, 1]) {
      if (t.skip && t.skip[w]) continue;
      let E = oe.x + y * h * w,
        C = oe.z + _ * h * w;
      (e.box(E, n.kind === 'tram' ? 0 : l - 1.3, C, 6.3, b - (n.kind === 'tram' ? 0 : l - 1.3), c, v, {}),
        s.setColor(15254330).box(E - y * (c / 2 - 0.35) * w, b, C - _ * (c / 2 - 0.35) * w, 6.2, 0.02, 0.35, v, {}),
        n.kind !== 'tram' &&
          (s.setColor(10134443).box(E + y * 0.3 * w, b + 3.6, C + _ * 0.3 * w, 6.4, 0.18, c + 1.2, v, {}),
          Math.round(M) % 18 < 6 && i.setColor(9212826).box(E + y * (c / 2 - 0.4) * w, b, C + _ * (c / 2 - 0.4) * w, 0.18, 3.6, 0.18, v, {}),
          Math.round(M) % 24 < 6 && r.push([E, b + 3.3, C, 0.92, 0.96, 1])));
    }
  }
  railPos(n, u, oe);
  let d = oe.dz,
    p = -oe.dx,
    x = Math.atan2(oe.dz, oe.dx),
    m = n.code + String(n.st.indexOf(t) + 1).padStart(2, '0'),
    g = n.kind === 'tram' ? 0.35 : l + 1.05;
  for (let M of [-1, 1])
    for (let y of [-25, 25])
      a.push({
        x: oe.x + d * (h + c / 2 - 0.3) * M + oe.dx * y,
        y: g + 2.2,
        z: oe.z + p * (h + c / 2 - 0.3) * M + oe.dz * y,
        w: 2.8,
        h: 0.9,
        nx: -d * M,
        nz: -p * M,
        station: [t.ja, t.en, m, n.color],
      });
  if (n.kind !== 'tram' && !(t.complex && t.complex.big) && !t.near) {
    let M = oe.x + d * (n.kind === 'mono', 0),
      y = oe.z;
    (e.box(M, 0, y, 34, Math.min(6, l - 1.5), n.kind === 'mono' ? 8 : 12, x, {}),
      o.setColor(new THREE.Color(n.color).toArray()).box(M, Math.min(6, l - 1.5) - 0.9, y, 34.2, 0.5, (n.kind === 'mono' ? 8 : 12) + 0.2, x, {}));
    for (let _ of [-1, 1])
      a.push({
        x: M + d * ((n.kind === 'mono' ? 4 : 6) + 0.05) * _,
        y: Math.min(6, l - 1.5) - 2.6,
        z: y + p * ((n.kind === 'mono' ? 4 : 6) + 0.05) * _,
        w: 9,
        h: 1.6,
        nx: d * _,
        nz: p * _,
        station: [t.ja, t.en, m, n.color],
      });
    r.push([M, 3, y, 1, 0.95, 0.85]);
  }
}
var Vv = {
  新宿: '\u30EB\u30DF\u30CD\u30B9\u65B0\u5BBF',
  渋谷: '\u3057\u3076\u3061\u304B\u30D2\u30AB\u30EA\u30A8',
  池袋: '\u30A8\u30AD\u30E5\u30FC\u30C8\u6C60\u888B',
  品川: '\u30A2\u30C8\u30EC\u30A4\u54C1\u5DDD',
  上野: '\u30A2\u30C8\u30EC\u30A4\u4E0A\u91CE',
  秋葉原: '\u30A2\u30C8\u30EC\u30A4\u79CB\u8449\u539F',
  浜松町: '\u6D5C\u677E\u753A\u30B9\u30C6\u30FC\u30B7\u30E7\u30F3\u30D3\u30EB',
  新橋: '\u30CB\u30E5\u30FC\u65B0\u6A4B\u30D3\u30EB',
  大崎: '\u30B2\u30FC\u30C8\u30B7\u30C6\u30A3\u5927\u5D0E',
  恵比寿: '\u30A2\u30C8\u30EC\u30A4\u6075\u6BD4\u5BFF',
  目黒: '\u30A2\u30C8\u30EC\u30A4\u76EE\u9ED2',
  五反田: '\u30EC\u30DF\u30A3\u4E94\u53CD\u7530',
  高田馬場: 'BIG BOX \u9AD8\u7530\u99AC\u5834',
  代々木: '\u4EE3\u3005\u6728\u99C5\u30D3\u30EB',
  田町: '\u7530\u753A\u30B9\u30C6\u30FC\u30B7\u30E7\u30F3\u30D3\u30EB',
  有楽町: '\u30A4\u30C8\u30B7\u30A2\u6709\u697D\u753A',
  神田: '\u795E\u7530\u99C5\u30D3\u30EB',
  御茶ノ水: '\u30BD\u30E9\u30B7\u30C6\u30A3',
  飯田橋: '\u98EF\u7530\u6A4B\u99C5\u30D3\u30EB',
  四ツ谷: '\u30A2\u30C8\u30EC\u30A4\u56DB\u8C37',
  日暮里: '\u65E5\u66AE\u91CC\u99C5\u30D3\u30EB',
};
function B9(n) {
  let t = n.lines.filter((O) => O.rail.kind === 'el');
  if (n.ja === '\u6771\u4EAC') return;
  let e = n.lines.length + t.length;
  if (!t.length || !(Vv[n.ja] || e >= 6)) return;
  let i = t[0].rail;
  railPos(i, t[0].st.s, oe);
  let s = oe.dx,
    o = oe.dz,
    r = o,
    a = -s,
    l = oe.x,
    f = oe.z,
    u = t.filter(
      (O) => (
        railPos(O.rail, O.st.s, oe),
        Math.abs(oe.dx * s + oe.dz * o) > 0.9 && Math.abs((oe.x - l) * r + (oe.z - f) * a) < 70 && Math.abs((oe.x - l) * s + (oe.z - f) * o) < 160
      ),
    ),
    c = 1e9,
    h = -1e9,
    d = 0;
  for (let O of u) {
    railPos(O.rail, O.st.s, oe);
    let U = (oe.x - n.x) * r + (oe.z - n.z) * a;
    ((c = Math.min(c, U - 12)), (h = Math.max(h, U + 12)), (d += ((oe.x - n.x) * s + (oe.z - n.z) * o) / u.length));
  }
  if (h - c > 150) return;
  let p = n.x + (r * (c + h)) / 2 + s * d,
    x = n.z + (a * (c + h)) / 2 + o * d,
    m = It(150 + e * 16, 160, 290),
    g = h - c,
    M = It(24 + e * 6, 30, 70),
    y = maskQ(p + r * (g / 2 + 25), x + a * (g / 2 + 25)) === M_WATER ? -1 : 1,
    _ = p + r * y * (g / 2 + 18),
    v = x + a * y * (g / 2 + 18),
    b = y,
    w = !1,
    E = Math.atan2(o, s),
    C = m * 0.75;
  for (let O of [1, 0.75, 0.55, 0.4]) {
    if (w) break;
    let U = m * 0.75 * O;
    for (let B = g / 2 + 18; B < g / 2 + 110 && !w; B += 6)
      for (let R of [y, -y])
        for (let k of [0, -0.25, 0.25]) {
          if (w) break;
          let P = p + r * R * B + s * m * k,
            H = x + a * R * B + o * m * k;
          if (!railHits(P, H, U, 34, E, 7.5) && maskQ(P, H) !== M_WATER && !roadHits(P, H, U, 34, E, 1)) {
            ((_ = P), (v = H), (b = R), (w = !0), (C = U));
            break;
          }
          if (w) break;
        }
  }
  if (!w) return;
  n.big = {
    x: p,
    z: x,
    dx: s,
    dz: o,
    nx: r,
    nz: a,
    L: m,
    D: g,
    bh: M,
    bx: _,
    bz: v,
    side: b,
    bw: C,
    name: Vv[n.ja] || n.ja + '\u30B9\u30C6\u30FC\u30B7\u30E7\u30F3\u30D3\u30EB',
    rank: e,
  };
  let S = [];
  buildingsNear(p, x, m / 2 + g + 60, S);
  let T = W.bld;
  for (let O of S) {
    let U = O * 9,
      B = T[U] - p,
      R = T[U + 1] - x,
      k = B * s + R * o,
      P = B * r + R * a,
      H = Math.max(T[U + 3], T[U + 4]) / 2;
    Math.abs(k) < m * 0.5 + H &&
      P > Math.min(c - (c + h) / 2, y < 0 ? -g / 2 - 40 : -g / 2) - H &&
      P < Math.max(g / 2, y > 0 ? g / 2 + 40 : g / 2) + H &&
      clearBuilding(U);
  }
  let D = Math.atan2(o, s);
  W.lmCol.push({
    x: _,
    z: v,
    w: C,
    d: 34,
    h: M,
    rot: D,
    y0: 0,
    rad: Math.hypot(C, 34) / 2,
  });
  {
    buildingsNear(_, v, m * 0.5 + 40, S);
    let O = Math.cos(D),
      U = Math.sin(D);
    for (let B of S) {
      let R = B * 9,
        k = T[R] - _,
        P = T[R + 1] - v,
        H = k * O + P * U,
        Z = -k * U + P * O,
        q = Math.max(T[R + 3], T[R + 4]) / 2;
      Math.abs(H) < C / 2 + q + 2 && Math.abs(Z) < 17 + q + 6 && clearBuilding(R);
    }
  }
}
function G9(n, t, e, i, s, o, r) {
  let a = n.big,
    l = Math.atan2(a.dz, a.dx),
    f = 20;
  (e.setColor(11844288).box(a.x, f, a.z, a.L * 0.62, 0.6, a.D + 6, l, {}), e.setColor(9213084).box(a.x, f + 0.6, a.z, a.L * 0.62, 1.4, 4, l, {}));
  for (let x = -a.L * 0.3; x <= a.L * 0.3; x += 22)
    for (let m of [-a.D / 2 - 2, a.D / 2 + 2])
      Z2(a.x + a.dx * x + a.nx * m, a.z + a.dz * x + a.nz * m) ||
        (e.setColor(8226188).box(a.x + a.dx * x + a.nx * m, 0, a.z + a.dz * x + a.nz * m, 0.9, f, 0.9, l, {}),
        addProp(a.x + a.dx * x + a.nx * m, a.z + a.dz * x + a.nz * m, 0.6, f));
  for (let x = -a.L * 0.28; x <= a.L * 0.28; x += 11) o.push([a.x + a.dx * x, f - 0.6, a.z + a.dz * x, 1, 0.97, 0.9]);
  (t.box(a.x, 13.6, a.z, 34, 5.4, a.D + 8, l, {}), s.setColor([0.95, 0.93, 0.85]).box(a.x, 14.6, a.z, 34.2, 2.2, a.D + 8.2, l, {}));
  let u = a.bw || a.L * 0.75,
    c = Math.round(a.bh * 0.55);
  (i.setColor(14210252).box(a.bx, 0, a.bz, u, c, 34, l, {}),
    i.setColor(12896718).box(a.bx, c, a.bz, u * 0.62, a.bh - c, 26, l, {}),
    i.setColor(9080982).box(a.bx, a.bh, a.bz, u * 0.4, 3, 16, l, {}),
    i.setColor(10133928).box(a.bx, c, a.bz, u + 0.6, 0.8, 34.6, l, {}));
  let h = (x, m, g, M, y, _) => {
    for (let v = g; v < M - 1.5; v += y) {
      s.setColor(_(v));
      for (let b of [-1, 1])
        (s.box(a.bx + a.nx * b * (m / 2 + 0.05), v, a.bz + a.nz * b * (m / 2 + 0.05), x * 0.94, y * 0.55, 0.08, l, {}),
          s.box(a.bx + a.dx * b * (x / 2 + 0.05), v, a.bz + a.dz * b * (x / 2 + 0.05), 0.08, y * 0.55, m * 0.9, l, {}));
    }
  };
  (h(u, 34, 6, c, 4.6, () => [0.68, 0.78, 0.86]),
    h(u * 0.62, 26, c + 2, a.bh, 3.8, (x) => (Math.floor(x / 3.8) % 3 ? [0.58, 0.7, 0.8] : [0.82, 0.86, 0.9])),
    s.setColor([1, 0.95, 0.82]).box(a.bx + a.nx * a.side * 17.1, 0.3, a.bz + a.nz * a.side * 17.1, u * 0.6, 4.2, 0.12, l, {}),
    i.setColor(10133928).box(a.bx + a.nx * a.side * 19, 5, a.bz + a.nz * a.side * 19, u * 0.7, 0.4, 6, l, {}));
  let d = a.nx * a.side,
    p = a.nz * a.side;
  (r.push({
    x: a.bx + d * 17.2,
    y: a.bh - 9,
    z: a.bz + p * 17.2,
    w: Math.min(48, u * 0.4),
    h: Math.min(48, u * 0.4) / 4,
    nx: d,
    nz: p,
    lines: [n.ja + '\u99C5', n.en.toUpperCase() + ' STATION'],
    bg: '#123a7a',
    fg: '#ffffff',
  }),
    r.push({
      x: a.bx + d * 17.2 + a.dx * u * 0.32,
      y: a.bh * 0.55,
      z: a.bz + p * 17.2 + a.dz * u * 0.32,
      w: 16,
      h: 4,
      nx: d,
      nz: p,
      lines: [a.name],
      bg: '#ffffff',
      fg: '#c8102e',
    }),
    o.push([a.bx + d * 20, 6, a.bz + p * 20, 1, 0.95, 0.85]));
}
function V9() {
  let n = W.bld,
    t = [],
    e = 0;
  for (let i of W.rails) {
    if (i.kind === 'sub') continue;
    let s = i.kind === 'tram' ? 3.2 : i.kind === 'mono' ? 3 : (RAILSPEC[i.kind].deckW || 10) / 2 + 1.2,
      o = i.st.map((a) => a.s),
      r = i.kind === 'tram' ? 14 : i.kind === 'ats' ? 42 : 112;
    for (let a = 0; a < i.len; a += 5) {
      railPos(i, a, oe);
      let l = s;
      for (let f of o)
        if (Math.abs(f - a) < r) {
          l = Math.max(l, i.kind === 'tram' ? 5 : 10.5);
          break;
        }
      buildingsNear(oe.x, oe.z, l + 30, t);
      for (let f of t) {
        let u = f * 9;
        if (n[u + 6] < 0.5) continue;
        let c = Math.cos(n[u + 2]),
          h = Math.sin(n[u + 2]),
          d = oe.x - n[u],
          p = oe.z - n[u + 1],
          x = d * c + p * h,
          m = -d * h + p * c,
          g = Math.max(0, Math.abs(x) - n[u + 3] / 2),
          M = Math.max(0, Math.abs(m) - n[u + 4] / 2);
        g * g + M * M < l * l && (clearBuilding(u), e++);
      }
    }
  }
  return e;
}
function setupStations() {
  W.railCleared = V9();
  for (let n of W.stations) {
    let t = n.lines.filter((e) => e.rail.kind === 'el' || e.rail.kind === 'ats' || e.rail.kind === 'mono');
    t.forEach((e, i) => {
      railPos(e.rail, e.st.s, oe);
      let s = oe.dz,
        o = -oe.dx,
        r = oe.x,
        a = oe.z;
      ((e.st.skip = {}), (e.st.near = !1));
      for (let l = 0; l < i; l++) {
        railPos(t[l].rail, t[l].st.s, oe);
        let f = (oe.x - r) * s + (oe.z - a) * o,
          u = Math.abs((oe.x - r) * o - (oe.z - a) * s);
        (Math.abs(f) < 12.5 && u < 120 && ((e.st.skip[Math.sign(f) || 1] = !0), (e.st.near = !0)), Math.abs(f) < 25 && u < 120 && (e.st.near = !0));
      }
    });
  }
  for (let n of W.stations) {
    ((n.entrances = []), B9(n));
    let t = n.lines.find((i) => i.rail.kind !== 'sub' && !(i.rail.ys && i.rail.ys[i.st.i] < 1.5 && i.rail.kind !== 'tram'));
    if (t) {
      let i = t.rail,
        s = t.st;
      railPos(i, s.s, oe);
      let o = oe.dz,
        r = -oe.dx,
        a = i.kind === 'tram' || i.kind === 'mono' ? 6 : 8.5;
      if (n.big) {
        let l = n.big;
        n.entrances.push({
          x: l.bx + l.nx * l.side * 19,
          z: l.bz + l.nz * l.side * 19,
          kind: 'surface',
          rot: Math.atan2(l.dz, l.dx),
          color: new THREE.Color(i.color).toArray(),
          label: l.name,
        });
      } else
        n.entrances.push({
          x: oe.x + o * a,
          z: oe.z + r * a,
          kind: 'surface',
          rot: Math.atan2(oe.dz, oe.dx),
          color: new THREE.Color(i.color).toArray(),
          label: i.ja,
        });
      if (i.kind !== 'tram') {
        let l = n.big ? n.big.D / 2 + 4 : a;
        n.entrances.push({
          x: oe.x - o * (l + 2),
          z: oe.z - r * (l + 2),
          kind: 'surface',
          rot: Math.atan2(oe.dz, oe.dx),
          color: new THREE.Color(i.color).toArray(),
          label: i.ja + '\uFF08\u53CD\u5BFE\u53E3\uFF09',
        });
      }
    }
    let e = n.lines.filter((i) => i.rail.kind === 'sub' || (i.rail.ys && i.rail.ys[i.st.i] < 1.5 && i.rail.kind !== 'tram'));
    if (e.length) {
      let i = [];
      roadsNear(n.x, n.z, 120, i);
      let s = i.filter((o) => !o.e.elev && o.e.kind !== 'L').sort((o, r) => o.d - r.d)[0] || i.filter((o) => !o.e.elev)[0];
      if (s) {
        let o = s.e,
          r = s.j,
          [a, l] = o.pts[r],
          [f, u] = o.pts[r + 1],
          c = Math.hypot(f - a, u - l) || 1,
          h = (f - a) / c,
          d = (u - l) / c,
          p = (s.x - n.x) * -d + (s.z - n.z) * h > 0 ? -1 : 1,
          x = o.hw + (o.kind === 'A' ? 2.6 : 1.9),
          m = e.some((M) => /メトロ/.test(M.rail.ja));
        n.entrances.push({
          x: s.x - d * x * p,
          z: s.z + h * x * p,
          kind: 'sub',
          rot: Math.atan2(d, h),
          color: m ? [0.05, 0.55, 0.85] : [0.25, 0.65, 0.3],
          label: m ? '\u6771\u4EAC\u30E1\u30C8\u30ED' : '\u90FD\u55B6\u5730\u4E0B\u9244',
        });
        let g = i.filter((M) => !M.e.elev && M.e !== o && Math.hypot(M.x - s.x, M.z - s.z) > 50).sort((M, y) => M.d - y.d)[0];
        if (g) {
          let M = g.e,
            y = g.j,
            [_, v] = M.pts[y],
            [b, w] = M.pts[y + 1],
            E = Math.hypot(b - _, w - v) || 1,
            C = (b - _) / E,
            S = (w - v) / E,
            T = M.hw + (M.kind === 'A' ? 2.6 : 1.9);
          n.entrances.push({
            x: g.x - S * T,
            z: g.z + C * T,
            kind: 'sub',
            rot: Math.atan2(S, C),
            color: m ? [0.05, 0.55, 0.85] : [0.25, 0.65, 0.3],
            label: m ? '\u6771\u4EAC\u30E1\u30C8\u30ED' : '\u90FD\u55B6\u5730\u4E0B\u9244',
          });
        }
      }
    }
    for (let i of n.entrances) q9(i);
  }
}
function W9(n, t, e = 0.5) {
  for (let i of W.lmCol) {
    if (Math.abs(i.x - n) > i.rad + 2 || Math.abs(i.z - t) > i.rad + 2 || (i.y0 || 0) > 2) continue;
    let s = Math.cos(i.rot || 0),
      o = Math.sin(i.rot || 0),
      r = n - i.x,
      a = t - i.z,
      l = r * s + a * o,
      f = -r * o + a * s;
    if (Math.abs(l) < i.w / 2 + e && Math.abs(f) < i.d / 2 + e) return !0;
  }
  return !1;
}
function X9(n, t) {
  let e = [];
  return (roadsNear(n, t, 20, e), e.some((i) => !i.e.elev && i.d < i.e.hw - 0.3));
}
function q9(n) {
  let t = (s, o) => isWaterAt(s, o) || W9(s, o) || X9(s, o) || railHits(s, o, 2, 2, 0, 1.5);
  if (t(n.x, n.z)) {
    let s = null;
    for (let o of [!0, !1]) {
      for (let r = 3; r <= 120 && !s; r += 3)
        for (let a = 0; a < 24; a++) {
          let l = (a / 24) * Math.PI * 2,
            f = n.x + Math.cos(l) * r,
            u = n.z + Math.sin(l) * r;
          if (!t(f, u)) {
            if (o) {
              let c = [];
              if ((roadsNear(f, u, 16, c), !c.some((h) => !h.e.elev))) continue;
            }
            s = [f, u];
            break;
          }
        }
      if (s) break;
    }
    s && ((n.x = s[0]), (n.z = s[1]));
  }
  let e = [];
  buildingsNear(n.x, n.z, 40, e);
  let i = W.bld;
  for (let s of e) {
    let o = s * 9;
    if (i[o + 6] < 1) continue;
    let r = Math.cos(i[o + 2]),
      a = Math.sin(i[o + 2]),
      l = n.x - i[o],
      f = n.z - i[o + 1],
      u = l * r + f * a,
      c = -l * a + f * r;
    Math.abs(u) < i[o + 3] / 2 + 2 && Math.abs(c) < i[o + 4] / 2 + 2 && clearBuilding(o);
  }
}
function Ur(n, t = 20, e = 'el') {
  let i = new Mt({
      color: !0,
      mat: !0,
    }),
    s = e === 'ats' ? 2.5 : 2.95,
    o = s / 2,
    r = e === 'tram' ? 3.3 : 3.7,
    a = (u, c) => ((i.mv = u), i.setColor(c), i),
    l = e === 'tram' ? 15921904 : 14080992;
  (a(0, 3027253).box(0, 0.35, 0, s - 0.35, 0.55, t - 0.6, 0, {}),
    a(0, l).box(0, 0.9, 0, s, r - 1.2, t, 0, {}),
    a(1, 2041390).box(0, 2.15, 0, s + 0.04, 0.95, t - 1.4, 0, {}),
    a(0, 16777215).box(0, 1.55, 0, s + 0.05, 0.2, t, 0, {}),
    a(0, 16777215).box(0, r - 0.42, 0, s + 0.03, 0.14, t, 0, {}),
    a(0, 10133670).box(0, r - 0.3, 0, s - 0.4, 0.24, t - 0.4, 0, {}));
  let f = t > 15 ? 4 : 2;
  for (let u = 0; u < f; u++) {
    let c = (u - (f - 1) / 2) * (t / f);
    for (let h of [-1, 1])
      (a(0, 9344412).box(h * (o + 0.02), 0.95, c, 0.04, 2.1, 1.3, 0, {}),
        a(1, 2041390).box(h * (o + 0.03), 2, c, 0.04, 0.8, 0.9, 0, {}),
        a(0, 16777215).box(h * (o + 0.035), 0.95, c - 0.72, 0.04, 2.1, 0.12, 0, {}));
  }
  for (let u of [-t / 2 + 3, t / 2 - 3]) a(0, 2040100).box(0, 0, u, 2.4, 0.65, 2.8, 0, {});
  if ((e !== 'ats' && e !== 'tram' && !n && a(0, 2763306).box(0, r, -t / 2 + 4, 1.2, 0.5, 0.2, 0, {}), n)) {
    (a(1, 1119256).prism(0, 1.4, r - 0.5, t / 2 - 0.4, o - 0.05, o - 0.25, 0.5, -0.5, 0, -0.5),
      a(0, 16777215).box(0, 0.95, t / 2 - 0.05, s - 0.2, 0.45, 0.14, 0, {}));
    for (let u of [-0.9, 0.9]) a(4, 16774352).box(u, 1.25, t / 2 + 0.02, 0.42, 0.18, 0.06, 0, {});
  }
  return i.build();
}
function $9() {
  let n = new THREE.MeshStandardMaterial({
    vertexColors: !0,
    roughness: 0.35,
    metalness: 0.6,
  });
  return (
    (n.onBeforeCompile = (t) => {
      ((t.uniforms.uNight = rn.uNight),
        (t.vertexShader = t.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
attribute float aMat;varying float vMat;`,
          )
          .replace(
            '#include <color_vertex>',
            `#include <color_vertex>
vMat=aMat;
#ifdef USE_INSTANCING_COLOR
vColor=color.xyz; if(color.r+color.g+color.b>2.95)vColor=instanceColor.xyz;
#endif`,
          )),
        (t.fragmentShader = t.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
uniform float uNight;varying float vMat;`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
if(vMat>0.5&&vMat<1.5)roughnessFactor=0.05;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
if(vMat>0.5&&vMat<1.5)totalEmissiveRadiance+=vec3(0.95,0.95,0.85)*uNight*0.7;if(vMat>3.5)totalEmissiveRadiance+=vec3(1.0,0.95,0.8)*(0.3+uNight*2.0);`,
          )));
    }),
    n
  );
}
var Zo = {},
  Qo = new THREE.Object3D(),
  Wv = new THREE.Color();
function initTrains() {
  let n = $9(),
    t = (i, s) => {
      let o = new THREE.InstancedMesh(i, n, s);
      (o.instanceMatrix.setUsage(THREE.DynamicDrawUsage), (o.frustumCulled = !1), (o.castShadow = !0), Qo.scale.set(0, 0, 0), Qo.updateMatrix());
      for (let r = 0; r < s; r++) (o.setMatrixAt(r, Qo.matrix), o.setColorAt(r, Wv.set(16777215)));
      return (
        Qo.scale.set(1, 1, 1),
        R.scene.add(o),
        {
          m: o,
          n: 0,
        }
      );
    };
  ((Zo.el = [t(Ur(!1, 20, 'el'), 900), t(Ur(!0, 20, 'el'), 260)]),
    (Zo.mono = [t(Ur(!1, 15, 'el'), 120), t(Ur(!0, 15, 'el'), 60)]),
    (Zo.ats = [t(Ur(!1, 9, 'ats'), 120), t(Ur(!0, 9, 'ats'), 60)]),
    (Zo.tram = [t(Ur(!1, 13, 'tram'), 10), t(Ur(!0, 13, 'tram'), 60)]),
    (Zo.sub = null));
  let e = /^(J|KK|KS|TS|TY|OH|KO|SS|SI|TJ|IK|T$|F$|TX)/;
  for (let i of W.rails) {
    if (i.loop || i.kind === 'tram' || i.kind === 'mono' || i.st.length < 7 || !e.test(i.code)) continue;
    let s = new Set(i.st.filter((o, r) => r === 0 || r === i.st.length - 1 || (o.complex && o.complex.lines.length >= 3)));
    s.size >= 3 && s.size < i.st.length - 1 && ((i.expSt = s), (i.expName = i.code.startsWith('J') ? '\u5FEB\u901F' : '\u6025\u884C'));
  }
  for (let i of W.rails) {
    let s = RAILSPEC[i.kind],
      o = Math.max(2, Math.min(10, Math.round(i.len / 2400)));
    for (let r = 0; r < o; r++) {
      let a = r % 2 ? -1 : 1,
        l = i.len * (r / o) + rt(0, 200),
        f = i.expSt && r % 3 === 2 ? i.expName : null;
      G.trains.push({
        r: i,
        spec: s,
        dir: a,
        type: f,
        s: i.loop ? l : It(l, 200, i.len - 200),
        v: s.vmax * 0.6 * (f ? 1.1 : 1),
        boost: f ? 1.12 : 1,
        state: 'run',
        dwell: 0,
        last: null,
        cur: null,
        cars: s.cars,
        off: Fr * a,
        id: G.trains.length,
      });
    }
  }
}
var Ya = {},
  Ka = {};
function updTrains(n) {
  for (let t of Zo.el ? Object.values(Zo).filter(Boolean) : []) for (let e of t) e.n = 0;
  for (let t of G.trains) {
    let e = t.r,
      i = (t.cars * (t.spec.carL + 0.6)) / 2;
    if ((t.cab && t.cab--, t.drive)) Y9(t, n);
    else if (t.state === 'dwell')
      ((t.dwell -= n),
        (t.v = 0),
        t.dwell <= 0 && ((t.state = 'run'), (t.last = t.cur), t.atEnd && ((t.dir *= -1), (t.atEnd = !1)), xt('trainDepart', t)));
    else {
      let s = 1e9,
        o = null;
      for (let a of e.st) {
        let l = (a.s - t.s) * t.dir;
        (e.loop && (l = ((l % e.len) + e.len) % e.len),
          !(a === t.last && (l < 8 || (e.loop && l > e.len - 8))) &&
            ((!e.loop && l < -0.5) || (t.type && e.expSt && !e.expSt.has(a)) || (l < s && ((s = l), (o = a)))));
      }
      if (!e.loop) {
        let a = t.dir > 0 ? e.len - 30 - t.s : t.s - 30;
        a < s && ((s = a), (o = 'END'));
      }
      for (let a of G.trains)
        if (a.drive && a.r === e && a.dir === t.dir && a !== t) {
          let l = (a.s - t.s) * t.dir;
          (e.loop && (l = ((l % e.len) + e.len) % e.len), l > 0 && l - 200 < s && (s = Math.max(0, l - 200)));
        }
      let r = Math.min(t.spec.vmax * (t.boost || 1), Math.sqrt(Math.max(0, 2 * 1.2 * s)));
      ((t.v = t.v < r ? Math.min(r, t.v + (t.v < 12 ? 1.7 : 1.2) * n) : Math.max(r, t.v - 1.8 * n)),
        (t.s += t.dir * t.v * n),
        s < 0.6 &&
          t.v < 0.7 &&
          ((t.state = 'dwell'),
          (t.dwell = o === 'END' ? 20 : t.r.kind === 'tram' ? 8 : 14),
          (t.cur = o === 'END' ? j9(t) : o),
          o === 'END' && (t.atEnd = !0),
          (t.v = 0),
          xt('trainArrive', t)));
    }
    t.carPos = t.carPos || [];
    for (let s = 0; s < t.cars; s++) {
      let o = t.s + t.dir * (i - t.spec.carL / 2 - s * (t.spec.carL + 0.6));
      (railPos(e, o + t.dir * t.spec.carL * 0.35, Ya), railPos(e, o - t.dir * t.spec.carL * 0.35, Ka));
      let r = t.dir * Fr * (e.kind === 'mono' ? 0 : e.kind === 'tram' ? 0.76 : 1),
        a = Ya.x + Ya.dz * r,
        l = Ya.z - Ya.dx * r,
        f = Ka.x + Ka.dz * r,
        u = Ka.z - Ka.dx * r,
        c =
          t.carPos[s] ||
          (t.carPos[s] = {
            x: 0,
            y: 0,
            z: 0,
            yaw: 0,
          });
      if (
        ((c.x = (a + f) / 2),
        (c.z = (l + u) / 2),
        (c.yaw = Math.atan2(a - f, l - u)),
        (c.y = (Ya.y + Ka.y) / 2 + (e.kind === 'mono' ? -0.9 : e.kind === 'tram' ? 0.1 : 0.25)),
        (c.pitch = Math.atan2(Ya.y - Ka.y, t.spec.carL * 0.7)),
        e.kind === 'sub' || c.y < 0 || (t.cab && s === 0))
      )
        continue;
      let h = Zo[e.kind],
        d = s === 0 || s === t.cars - 1,
        p = h[d ? 1 : 0];
      if (p.n >= p.m.instanceMatrix.count) continue;
      let x = s === t.cars - 1 && t.cars > 1;
      (Qo.position.set(c.x, c.y, c.z),
        (Qo.rotation.order = 'YXZ'),
        Qo.rotation.set(x ? c.pitch : -c.pitch, c.yaw + (x ? Math.PI : 0), 0),
        Qo.updateMatrix(),
        p.m.setMatrixAt(p.n, Qo.matrix),
        p.m.setColorAt(p.n, Wv.set(e.color)),
        p.n++);
    }
    ((t.x = t.carPos[Math.min(1, t.cars - 1)].x), (t.z = t.carPos[Math.min(1, t.cars - 1)].z));
  }
  for (let t of Object.values(Zo))
    if (t) for (let e of t) ((e.m.count = e.n), (e.m.instanceMatrix.needsUpdate = !0), e.m.instanceColor && (e.m.instanceColor.needsUpdate = !0));
}
var DRV = {
  score: 0,
  last: null,
};
function Y9(n, t) {
  let e = G.input,
    i = n.r;
  n.notch = n.notch ?? 0;
  let s = e.thr > 0.5,
    o = e.brake > 0.5,
    r = s && !o ? 'p' : o && !s ? 'b' : null;
  if (
    (r !== n.hold && ((n.hold = r), (n.nT = 0)),
    r &&
      ((n.nT -= t),
      n.nT <= 0 &&
        ((n.nT = r === 'p' ? 0.32 : 0.2),
        r === 'p' ? (n.notch = n.notch < 0 ? 0 : Math.min(5, n.notch + 1)) : (n.notch = n.notch > 0 ? 0 : Math.max(-8, n.notch - 1)))),
    n.state === 'dwell')
  ) {
    ((n.v = 0),
      (n.dwell -= t),
      n.doors && n.dwell <= 0 && n.depart && ((n.doors = !1), (n.depart = !1), (n.state = 'run'), (n.last = n.cur), xt('trainDepart', n)));
    return;
  }
  let a = e.hand > 0,
    l = n.spec.vmax * 1.15,
    f = n.notch > 0 ? n.notch * 0.34 * Math.max(0.3, 1 - n.v / (l * 1.05)) : n.notch < 0 ? n.notch * 0.2 : 0;
  if (
    (a && (f = -2.2), (f -= 0.012 * n.v + (n.v > 0 ? 0.03 : 0)), n.tasc && !a && n.tdist !== void 0 && n.tdist <= 0.05 && n.tdist > -30 && n.tascOn)
  )
    ((f = Math.min(f, -1.5)), n.notch > 0 && (n.notch = 0));
  else if (n.tasc && !a && n.tdist !== void 0 && n.tdist > 0) {
    let h = n.tdist,
      d = (n.v * n.v) / (2 * Math.max(0.12, h - 0.05));
    d > 0.42 || (n.tascOn && h < 1.2)
      ? ((f = Math.min(f, -Math.min(1.5, d * 1.06))), n.notch > 0 && (n.notch = 0), (n.tascOn = !0))
      : n.tascOn && h < 25 && n.v < 0.8 && h > 0.4 && (f = Math.max(f, 0.35));
  }
  ((n.v = Math.max(0, n.v + f * t)),
    n.v < 0.02 && n.notch <= 0 && f <= 0 && (n.v = 0),
    (n.s += n.dir * n.v * t),
    i.loop ||
      ((n.s < 5 || n.s > i.len - 5) &&
        ((n.s = It(n.s, 5, i.len - 5)), n.v > 4 && xt('toast', '\u8ECA\u6B62\u3081\u306B\u885D\u7A81\uFF01'), (n.v = 0))),
    n.target || (n.target = nextStation(n)));
  let u = n.target,
    c = u ? (u.s - n.s) * n.dir : 1e9;
  if (
    (i.loop && u && ((c = ((c % i.len) + i.len) % i.len), c > i.len / 2 && (c -= i.len)),
    u && c < -150 && (n.target = null),
    (n.next = u),
    (n.dist = c),
    (n.tdist = c),
    (n.limit = l),
    n.v > l + 1 ? ((n.v -= 2 * t), (n.ats = !0)) : (n.ats = !1),
    u && Math.abs(c) < 4 && n.v < 0.15 && !(n.tasc && c > 0.5))
  ) {
    let h = Math.round(Math.abs(c) * 100),
      d = n.tascOn ? 200 : Math.max(0, Math.round((900 - h * 8) / 10) * 10) + 200;
    ((n.tascOn = !1),
      (n.state = 'dwell'),
      (n.cur = u),
      (n.target = null),
      (n.doors = !0),
      (n.depart = !1),
      (n.dwell = 6),
      (DRV.last = {
        st: u,
        cm: h,
        pay: d,
      }),
      (DRV.score += d),
      (G.money += d),
      (n.notch = Math.min(n.notch, 0)),
      xt('trainArrive', n),
      xt(
        'toast',
        `${u.ja}\u99C5 \u505C\u8ECA\u3000\u505C\u6B62\u4F4D\u7F6E ${h < 10 ? '\u3074\u3063\u305F\u308A\uFF01' : h + 'cm \u305A\u308C'}\u3000+\xA5${d}${n.tasc ? '\uFF08TASC\uFF09' : ''}\u3000F \u3067\u30C9\u30A2\u3092\u9589\u3081\u3066\u767A\u8ECA`,
      ));
  } else
    u &&
      c < -4 &&
      c > -60 &&
      n.v < 0.15 &&
      !n.overrunWarn &&
      ((n.overrunWarn = !0),
      xt(
        'toast',
        '\u30AA\u30FC\u30D0\u30FC\u30E9\u30F3\uFF01 R \u30AD\u30FC\uFF08\u5F8C\u9000\u30DC\u30BF\u30F3\uFF09\u3092\u62BC\u3057\u3066\u3044\u308B\u9593\u3060\u3051\u5C11\u3057\u305A\u3064\u5F8C\u9000\u3057\u307E\u3059',
      ));
  (u && c < -2 && n.v < 0.15 && e.rev && (n.s -= n.dir * 1.2 * t), u && c > 0 && (n.overrunWarn = !1));
}
function driverInput(n, t) {
  t === 'up'
    ? (n.notch = Math.min(5, (n.notch ?? 0) + 1))
    : t === 'down'
      ? (n.notch = Math.max(-8, (n.notch ?? 0) - 1))
      : t === 'n'
        ? (n.notch = 0)
        : t === 'tasc'
          ? ((n.tasc = !n.tasc),
            xt(
              'toast',
              n.tasc
                ? 'TASC\uFF08\u81EA\u52D5\u505C\u6B62\uFF09\u30AA\u30F3\uFF1A\u99C5\u306E\u624B\u524D\u3067\u81EA\u52D5\u3067\u30D6\u30EC\u30FC\u30AD\u3057\u307E\u3059\uFF08\u5831\u916C\u306F\u5C11\u306A\u3081\uFF09'
                : 'TASC \u30AA\u30D5\uFF1A\u81EA\u5206\u3067\u30D6\u30EC\u30FC\u30AD\u3057\u3066\u505C\u6B62\u4F4D\u7F6E\u306B\u6B62\u3081\u3088\u3046',
            ))
          : t === 'go' &&
            n.state === 'dwell' &&
            ((n.notch = Math.max(0, n.notch)),
            !n.r.loop && n.cur && ((n.dir > 0 && n.cur === n.r.st[n.r.st.length - 1]) || (n.dir < 0 && n.cur === n.r.st[0])) && (n.dir *= -1),
            (n.depart = !0),
            (n.dwell = Math.min(n.dwell, 1.2)),
            Xv());
}
var Xv = () => {};
function setDoorSfx(n) {
  Xv = n;
}
var notchName = (n) => (n > 0 ? 'P' + n : n < 0 ? 'B' + -n : 'N');
function j9(n) {
  let t = null,
    e = 1e9;
  for (let i of n.r.st) {
    let s = Math.abs(i.s - n.s);
    s < e && ((e = s), (t = i));
  }
  return t;
}
function nextStation(n) {
  let t = n.r,
    e = null,
    i = 1e9;
  for (let s of t.st) {
    if (n.type && t.expSt && !t.expSt.has(s)) continue;
    let o = (s.s - n.s) * n.dir;
    (t.loop && (o = ((o % t.len) + t.len) % t.len), !(s === n.cur && n.state === 'dwell') && o > 1 && o < i && ((i = o), (e = s)));
  }
  return e || (t.loop ? t.st[0] : n.dir > 0 ? t.st[t.st.length - 1] : t.st[0]);
}
function terminusName(n) {
  let t = n.r;
  return t.loop
    ? n.dir > 0
      ? '\u5916\u56DE\u308A'
      : '\u5185\u56DE\u308A'
    : (n.type ? n.type + ' ' : '') + (n.dir > 0 ? t.st[t.st.length - 1] : t.st[0]).ja + '\u884C\u304D';
}
function skipToNext(n) {
  let t = n.r;
  if (n.drive) return null;
  n.state === 'dwell' && (n.atEnd && ((n.dir *= -1), (n.atEnd = !1)), (n.last = n.cur), (n.state = 'run'));
  let e = nextStation(n);
  if (!e) return null;
  let i = e.s;
  return (
    t.loop ? (i = ((i % t.len) + t.len) % t.len) : (i = It(i, 5, t.len - 5)),
    (n.s = i),
    (n.v = 0),
    (n.last = n.cur),
    (n.state = 'dwell'),
    (n.dwell = 14),
    (n.cur = e),
    !t.loop && ((n.dir > 0 && e === t.st[t.st.length - 1]) || (n.dir < 0 && e === t.st[0])) && ((n.atEnd = !0), (n.dwell = 20)),
    xt('trainArrive', n),
    e
  );
}
function stopsAt(n, t, e) {
  return !e || !n.expSt || n.expSt.has(t);
}
var Ti = null,
  eo = null;
function trainInterior() {
  if (Ti) return Ti;
  let n = new Mt({
      color: !0,
    }),
    t = 20,
    e = 2.8,
    i = e / 2,
    s = 2.35;
  (n.setColor(7106418).quad([-i, 0, -t / 2], [i, 0, -t / 2], [i, 0, t / 2], [-i, 0, t / 2], [0, 1, 0]),
    n.setColor(15330028).quad([-i, s, t / 2], [i, s, t / 2], [i, s, -t / 2], [-i, s, -t / 2], [0, -1, 0]));
  for (let p of [-1, 1]) {
    (n
      .setColor(14277855)
      .quad(
        [p * i, 0, p > 0 ? t / 2 : -t / 2],
        [p * i, 0, p > 0 ? -t / 2 : t / 2],
        [p * i, 0.85, p > 0 ? -t / 2 : t / 2],
        [p * i, 0.85, p > 0 ? t / 2 : -t / 2],
        [-p, 0, 0],
      ),
      n
        .setColor(14277855)
        .quad(
          [p * i, 1.95, p > 0 ? t / 2 : -t / 2],
          [p * i, 1.95, p > 0 ? -t / 2 : t / 2],
          [p * i, s, p > 0 ? -t / 2 : t / 2],
          [p * i, s, p > 0 ? t / 2 : -t / 2],
          [-p, 0, 0],
        ));
    for (let x = -3; x <= 3; x++) {
      let m = x * 2.8;
      n.setColor(14277855).box(p * (i - 0.03), 0.85, m, 0.06, 1.1, 0.5, 0, {});
    }
    for (let x of [-7.5, -2.5, 2.5, 7.5])
      (n.setColor(4026280).box(p * (i - 0.3), 0.42, x, 0.5, 0.12, 3.6, 0, {}), n.box(p * (i - 0.05), 0.5, x, 0.1, 0.55, 3.6, 0, {}));
    for (let x of [-5, 0, 5]) n.setColor(10133670).box(p * (i - 0.02), 0, x, 0.04, 1.95, 1.3, 0, {});
    for (let x = -9; x <= 9; x += 0.9)
      (n.setColor(13685976).box(p * 0.75, 1.75, x, 0.03, 0.3, 0.03, 0, {}), n.setColor(15921906).box(p * 0.75, 1.68, x, 0.12, 0.1, 0.03, 0, {}));
    n.setColor(12633288).box(p * 0.75, 2.02, 0, 0.04, 0.04, t - 1, 0, {});
    for (let x = -8; x <= 8; x += 4) n.setColor(15921384).box(p * 0.55, 2.3, x, 0.3, 0.04, 3, 0, {});
  }
  for (let p of [-t / 2, t / 2]) n.setColor(14277855).quad([i, 0, p], [-i, 0, p], [-i, s, p], [i, s, p], [0, 0, p > 0 ? -1 : 1]);
  for (let p of [-5, 0, 5]) n.setColor(10133670).box(0, 0, p, 0.05, s, 0.05, 0, {});
  let o = new THREE.Mesh(
      n.build(),
      new THREE.MeshStandardMaterial({
        vertexColors: !0,
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
    ),
    r = new THREE.Mesh(
      new THREE.BoxGeometry(e + 0.02, 1.1, t),
      new THREE.MeshStandardMaterial({
        color: 10467528,
        transparent: !0,
        opacity: 0.12,
        roughness: 0.05,
        metalness: 0.5,
        side: THREE.DoubleSide,
        depthWrite: !1,
      }),
    );
  r.position.y = 1.4;
  let a = new THREE.PointLight(16774368, 2.2, 14, 1.5);
  (a.position.set(0, 2.1, 0), (Ti = new THREE.Group()), Ti.add(o), Ti.add(r), Ti.add(a), (Ti.visible = !1), R.scene.add(Ti));
  let [l, f] = Ne(512, 128);
  Ti.userData.lcd = {
    c: l,
    x: f,
    t: Fe(l, {
      rep: !1,
      dyn: !0,
    }),
  };
  let u = new THREE.MeshBasicMaterial({
    map: Ti.userData.lcd.t,
    toneMapped: !1,
  });
  for (let p of [-1, 1])
    for (let x of [-5, 5]) {
      let m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), u);
      (m.position.set(p * (i - 0.04), 2.08, x), (m.rotation.y = (-p * Math.PI) / 2), Ti.add(m));
    }
  let c = new THREE.CylinderGeometry(4.2, 4.2, 140, 16, 1, !0);
  (c.rotateX(Math.PI / 2),
    (eo = new THREE.Mesh(
      c,
      new THREE.MeshStandardMaterial({
        color: 3816510,
        roughness: 0.95,
        side: THREE.BackSide,
      }),
    )),
    (eo.visible = !1),
    R.scene.add(eo));
  let h = [];
  for (let p = -70; p < 70; p += 8) h.push(3.6, 2.4, p);
  let d = new THREE.BufferGeometry();
  return (
    d.setAttribute('position', new THREE.Float32BufferAttribute(h, 3)),
    eo.add(
      new THREE.Points(
        d,
        new THREE.PointsMaterial({
          color: 16773312,
          size: 0.6,
          toneMapped: !1,
        }),
      ),
    ),
    Ti
  );
}
function placeInterior(n, t) {
  let e = trainInterior(),
    i = n.carPos[t] || n.carPos[0];
  ((e.visible = !0),
    e.position.set(i.x, i.y + (n.r.kind === 'mono' ? 1.4 : 1), i.z),
    e.rotation.set(0, i.yaw, 0),
    (eo.visible = n.r.kind === 'sub'),
    eo.visible && (eo.position.set(i.x, i.y + 2, i.z), eo.rotation.set(0, i.yaw, 0), (eo.children[0].position.z = (n.s * n.dir) % 8)));
  let s = e.userData.lcd,
    o = nextStation(n);
  if ((s.last || '') !== (o && o.ja) + n.state) {
    s.last = (o && o.ja) + n.state;
    let r = s.x;
    ((r.fillStyle = '#05070a'),
      r.fillRect(0, 0, 512, 128),
      (r.fillStyle = n.r.color),
      r.fillRect(0, 0, 18, 128),
      (r.fillStyle = '#ffb000'),
      (r.font = `800 26px ${ce}`),
      (r.textAlign = 'left'),
      r.fillText(n.state === 'dwell' ? '\u305F\u3060\u3044\u307E' : '\u6B21\u306F', 40, 44),
      (r.fillStyle = '#fff'),
      (r.font = `900 52px ${ce}`),
      r.fillText(n.state === 'dwell' && n.cur ? n.cur.ja : o ? o.ja : '', 40, 104),
      (r.fillStyle = '#9fd'),
      (r.font = '700 20px Arial'),
      (r.textAlign = 'right'),
      r.fillText(terminusName(n), 500, 40),
      (s.t.needsUpdate = !0));
  }
  return e;
}
function cabMode(n) {
  (placeInterior(n, 0), Ti && (Ti.visible = !1), (n.cab = 2));
}
function hideInterior() {
  (Ti && (Ti.visible = !1), eo && (eo.visible = !1));
}
var un = 320,
  w0 = new Map(),
  Cf = [];
var Re = (n, t) => {
    let e = Math.imul(n | 0, 374761393) + Math.imul(t | 0, 668265263);
    return ((e = Math.imul(e ^ (e >>> 13), 1274126177)), (e ^= e >>> 16), (e >>> 0) / 4294967296);
  },
  no = {
    house: [15656922, 14077369, 12760220, 15921128, 12104358, 9273715, 10986908, 14272424, 14998992, 10129022, 13619916, 7301730, 14207410, 11905688],
    apt: [15394006, 14207922, 11967620, 15789282, 13617080, 10256234, 14866888, 13222841, 9071445, 11045490, 14472130, 8218198, 12892066, 15262424],
    mid: [
      14273973, 12562068, 10718068, 15131094, 10198950, 12892328, 9204834, 14144198, 7236198, 11577504, 11037263, 12108464, 13617597, 8748660,
      14867661, 6119526,
    ],
    off: [13223355, 11578530, 9343898, 14210248, 8159880, 10787468, 12433320, 10133928, 7106934, 12764872, 9077880, 10988978],
    tower: [7309206, 5203317, 9348016, 4019298, 10466495, 5991288, 8227972, 4479598, 9083558, 3095880, 11122882, 6255744],
    roof: [3883081, 5913134, 3099228, 5593182, 7031354, 4213306, 8010539, 2764083, 4871520],
  },
  Ip = (n, t = 0) => {
    let e = new THREE.Color(n),
      i = (1 + t) * 0.88;
    return [Math.min(1, e.r * i), Math.min(1, e.g * i), Math.min(1, e.b * i)];
  },
  Np = (n, t) => n * 1e4 + t;
function $v(n, t) {
  let e = n.pts,
    i = e.length,
    s = e[Math.max(0, t - 1)],
    o = e[t],
    r = e[Math.min(i - 1, t + 1)],
    a = o[0] - s[0],
    l = o[1] - s[1],
    f = r[0] - o[0],
    u = r[1] - o[1],
    c = Math.hypot(a, l),
    h = Math.hypot(f, u);
  (c < 1e-6 && ((a = f), (l = u), (c = h)), h < 1e-6 && ((f = a), (u = l), (h = c)), (a /= c), (l /= c), (f /= h), (u /= h));
  let d = -(l + u),
    p = a + f,
    x = Math.hypot(d, p) || 1;
  ((d /= x), (p /= x));
  let m = d * -u + p * f,
    g = 1 / Math.max(0.5, m);
  return [d * g, p * g];
}
var Z9 = {
  A: 4.2,
  B: 3.2,
  L: 0,
  X: 0,
  R: 0,
};
function lg(n, t, e = 6) {
  let i = performance.now(),
    s = R.Q,
    o = Math.floor(n / un),
    r = Math.floor(t / un),
    a = Math.ceil(s.lod / un),
    l = Math.ceil(s.view / un),
    f = [];
  for (let c = -a; c <= a; c++)
    for (let h = -a; h <= a; h++) {
      let d = o + c,
        p = r + h,
        x = (d + 0.5) * un,
        m = (p + 0.5) * un,
        g = Math.hypot(x - n, m - t);
      g > s.lod + un * 0.7 || (inBounds(x, m, 900) && f.push([d, p, g, g < s.view + un * 0.4]));
    }
  f.sort((c, h) => c[2] - h[2]);
  let u = new Set();
  for (let [c, h, d, p] of f) {
    let x = Np(c, h);
    u.add(x);
    let m = w0.get(x);
    (m ||
      ((m = {
        cx: c,
        cz: h,
        near: null,
        far: null,
      }),
      w0.set(x, m)),
      p && !m.near && performance.now() - i < e && ((m.near = tR(c, h)), R.scene.add(m.near)),
      !m.far && !(p && m.near) && performance.now() - i < e && ((m.far = Q9(c, h)), R.scene.add(m.far)),
      m.near && (m.near.visible = p),
      m.far && (m.far.visible = !(p && m.near)));
  }
  for (let [c, h] of w0) u.has(c) || (og(h.near), og(h.far), w0.delete(c));
  for (let [c, h] of w0)
    if (h.near && !h.near.visible) {
      let d = (h.cx + 0.5) * un,
        p = (h.cz + 0.5) * un;
      Math.hypot(d - n, p - t) > s.view + un * 1.3 && (og(h.near), (h.near = null));
    }
}
function og(n) {
  if (n) {
    (R.scene.remove(n),
      n.userData.chunk && removeChunkProps(Np(n.userData.chunk[0], n.userData.chunk[1])),
      n.traverse((t) => {
        (t.geometry && t.geometry.dispose(), t.userData && t.userData.tex && (t.userData.tex.dispose(), t.material.dispose()));
      }));
    for (let t = Cf.length - 1; t >= 0; t--) Cf[t].root === n && Cf.splice(t, 1);
  }
}
function Zv() {
  return w0.size;
}
function Q9(n, t) {
  let e = n * un,
    i = t * un,
    s = new THREE.Group(),
    o = new Mt({
      color: !0,
    }),
    r = new Mt({
      color: !0,
      aB: !0,
    });
  e_(o, null, e, i, 16);
  let a = [];
  buildingsInRect(e, i, e + un, i + un, a);
  let l = W.bld;
  for (let c of a) {
    let h = c * 9;
    l[h] < e || l[h] >= e + un || l[h + 1] < i || l[h + 1] >= i + un || l[h + 6] < 14 || n_(r, c, !0);
  }
  if ((o.count && s.add(new THREE.Mesh(o.build(), R.M.ground)), r.count)) {
    let c = new THREE.Mesh(r.build(), R.M.buildingFar);
    s.add(c);
  }
  let f = new Mt({
      color: !1,
    }),
    u = edgesInRect(e, i, e + un, i + un);
  for (let c of u) {
    let h = W.edges[Math.floor(c / 4096)],
      d = c % 4096;
    if (h.kind !== 'X' && h.kind !== 'A') continue;
    let [p, x] = h.pts[d],
      [m, g] = h.pts[d + 1],
      M = (p + m) / 2,
      y = (x + g) / 2;
    if (M < e || M >= e + un || y < i || y >= i + un) continue;
    let _ = h.kind === 'X' ? edgeY(h, h.cum[d]) : 0.06,
      v = h.kind === 'X' ? edgeY(h, h.cum[d + 1]) : 0.06;
    f.ribbon(p, x, m, g, h.hw, h.hw, _, v);
  }
  return (f.count && s.add(new THREE.Mesh(f.build(), R.M.road)), s);
}
function tR(n, t) {
  let e = n * un,
    i = t * un,
    s = e + un,
    o = i + un,
    r = (q, G) => q >= e && q < s && G >= i && G < o,
    a = new THREE.Group();
  ((a.userData.chunk = [n, t]), removeChunkProps(Np(n, t)), propChunk(Np(n, t)));
  let l = new Mt({
      color: !0,
    }),
    f = new Mt(),
    u = new Mt(),
    c = new Mt(),
    h = new Mt(),
    d = new Mt(),
    p = new Mt({
      color: !0,
    }),
    x = new Mt(),
    m = new Mt({
      color: !0,
      aB: !0,
    }),
    g = new Mt({
      color: !0,
    }),
    M = new Mt({
      color: !0,
    }),
    y = new Mt({
      color: !0,
    }),
    _ = new Mt({
      color: !0,
    }),
    v = new Mt(),
    b = new Mt(),
    w = new Mt({
      color: !0,
    }),
    E = new Mt(),
    C = new Mt(),
    S = [],
    T = [],
    D = [],
    O = new Mt();
  e_(l, f, e, i, Je);
  let U = edgesInRect(e, i, s, o),
    B = new Set();
  for (let q of U) {
    let G = Math.floor(q / 4096),
      tt = q % 4096,
      K = W.edges[G],
      [Y, Q] = K.pts[tt],
      [J, ft] = K.pts[tt + 1];
    if ((tt === 0 && r(Y, Q) && B.add(K.a), tt === K.pts.length - 2 && r(J, ft) && B.add(K.b), !r((Y + J) / 2, (Q + ft) / 2))) continue;
    let yt = $v(K, tt),
      zt = $v(K, tt + 1),
      At = K.hw,
      ct = K.cum[tt],
      _W = K.cum[tt + 1],
      Ct = _W - ct,
      Rt = (J - Y) / (Ct || 1),
      wt = (ft - Q) / (Ct || 1),
      Dt = W.nodes[K.a],
      jt = W.nodes[K.b],
      Jt = Math.max(0, Dt.r + 1 - ct),
      X = Math.max(0, jt.r + 1 - (K.len - _W)),
      I = K.kind === 'X' || K.kind === 'R',
      st = I ? edgeY(K, ct) : 0.04,
      pt = I ? edgeY(K, _W) : 0.04,
      ht = (St, Ut, qt, re, j) => [St + qt[0] * re, j, Ut + qt[1] * re];
    if (
      ((I ? c : u).quad(
        ht(Y, Q, yt, -At, st),
        ht(Y, Q, yt, At, st),
        ht(J, ft, zt, At, pt),
        ht(J, ft, zt, -At, pt),
        [0, 1, 0],
        [
          [-At / 8, ct / 8],
          [At / 8, ct / 8],
          [At / 8, _W / 8],
          [-At / 8, _W / 8],
        ],
      ),
      I)
    ) {
      v.quad(ht(Y, Q, yt, At, st - 1.6), ht(Y, Q, yt, -At, st - 1.6), ht(J, ft, zt, -At, pt - 1.6), ht(J, ft, zt, At, pt - 1.6), [0, -1, 0]);
      for (let Ut of [-1, 1]) {
        let qt = At * Ut,
          re = (At + 0.35) * Ut,
          j = ht(Y, Q, yt, qt, st - 1.6),
          bt = ht(J, ft, zt, qt, pt - 1.6),
          ot = ht(Y, Q, yt, re, st + 1.1),
          ut = ht(J, ft, zt, re, pt + 1.1);
        Ut > 0 ? v.quad(bt, j, [ot[0], ot[1], ot[2]], [ut[0], ut[1], ut[2]], null) : v.quad(j, bt, ut, ot, null);
        let kt = ht(Y, Q, yt, qt, st),
          Pt = ht(J, ft, zt, qt, pt),
          ye = ht(Y, Q, yt, qt, st + 1.1),
          Ze = ht(J, ft, zt, qt, pt + 1.1);
        (Ut > 0 ? v.quad(kt, Pt, Ze, ye, null) : v.quad(Pt, kt, ye, Ze, null),
          v.quad(ye, Ze, [ut[0], ut[1], ut[2]], [ot[0], ot[1], ot[2]], [0, 1, 0]));
      }
      for (let Ut = Math.ceil(ct / 34) * 34; Ut < _W; Ut += 34) {
        let qt = (Ut - ct) / (Ct || 1),
          re = Y + (J - Y) * qt,
          j = Q + (ft - Q) * qt,
          bt = st + (pt - st) * qt;
        if (bt < 4 || Lp(re, j, 2.2, K, bt - 2)) continue;
        {
          let ut = [];
          roadsNear(re, j, 26, ut);
          let kt = !1;
          for (let Pt of ut)
            if (
              !Pt.e.elev &&
              Pt.d < Pt.e.hw + 1.2 &&
              (Math.min(Pt.s, Pt.e.len - Pt.s) < W.nodes[Pt.s < Pt.e.len / 2 ? Pt.e.a : Pt.e.b].r + 6 || Pt.d > 0.9 || Pt.e.kind !== 'A')
            ) {
              kt = !0;
              break;
            }
          if (kt) continue;
        }
        let ot = Math.atan2(wt, Rt);
        (v.box(re, 0, j, 1.8, bt - 1.6, 1.8, ot, {
          noTop: !0,
        }),
          addProp(re, j, 1, bt - 1.6),
          v.box(re, bt - 1.6 - 1.2, j, 2.6, 1.2, At * 2 - 1, ot, {}));
      }
      zp(p, K, tt, Y, Q, J, ft, yt, zt, 0, st + 0.03, pt + 0.03, 15790312, 0.15, 'dash');
      for (let Ut of [-1, 1]) zp(p, K, tt, Y, Q, J, ft, yt, zt, (Ut * At) / 2, st + 0.03, pt + 0.03, 15790312, 0.12, 'dash');
      for (let Ut of [-1, 1]) zp(p, K, tt, Y, Q, J, ft, yt, zt, Ut * (At - 0.6), st + 0.03, pt + 0.03, 15790312, 0.15, 'solid');
      if (tt % 2 === 0)
        for (let Ut of [-1, 1]) {
          let re = Y + (J - Y) * 0.5 + yt[0] * Ut * (At + 0.2),
            j = Q + (ft - Q) * 0.5 + yt[1] * Ut * (At + 0.2);
          (S.push([re, (st + pt) / 2 + 9, j, 1, 0.82, 0.55]), M.setColor(8159365).box(re, (st + pt) / 2, j, 0.25, 9.3, 0.25, 0, {}));
        }
      continue;
    }
    let ne = Z9[K.kind],
      Bt = iR(Y, Q, J, ft, yt, zt, At + 2),
      Yt = Math.min(Ct, Jt),
      Oe = Math.max(0, Ct - X),
      Lt = Yt / (Ct || 1),
      Zt = Oe / (Ct || 1),
      Me = (St) => [Y + (J - Y) * St, Q + (ft - Q) * St];
    if (Oe > Yt + 0.5) {
      let St = Me(Lt),
        Ut = Me(Zt),
        qt = Lt > 0 ? [-wt, Rt] : yt,
        re = Zt < 1 ? [-wt, Rt] : zt;
      if (ne > 0 && !Bt)
        for (let bt of [-1, 1]) {
          let ot = At * bt,
            ut = (At + ne) * bt,
            kt = 0.18,
            Pt = ht(St[0], St[1], qt, ot, kt),
            ye = ht(Ut[0], Ut[1], re, ot, kt),
            Ze = ht(Ut[0], Ut[1], re, ut, kt),
            mi = ht(St[0], St[1], qt, ut, kt),
            Ge = [
              [0, (ct + Yt) / 3],
              [0, (ct + Oe) / 3],
              [(ne / 3) * bt, (ct + Oe) / 3],
              [(ne / 3) * bt, (ct + Yt) / 3],
            ];
          bt > 0 ? h.quad(Pt, ye, Ze, mi, [0, 1, 0], Ge) : h.quad(ye, Pt, mi, Ze, [0, 1, 0], [Ge[1], Ge[0], Ge[3], Ge[2]]);
          let xi = ht(St[0], St[1], qt, ot, 0.03),
            Ms = ht(Ut[0], Ut[1], re, ot, 0.03);
          bt > 0 ? d.quad(Ms, xi, Pt, ye, null) : d.quad(xi, Ms, ye, Pt, null);
        }
      if (Bt)
        for (let bt of [-1, 1]) {
          let ot = (At + 0.3) * bt,
            ut = ht(St[0], St[1], qt, ot, 0),
            kt = ht(Ut[0], Ut[1], re, ot, 0);
          (M.setColor(13685976),
            M.quad(ut, kt, [kt[0], 1.1, kt[2]], [ut[0], 1.1, ut[2]], null),
            M.quad(kt, ut, [ut[0], 1.1, ut[2]], [kt[0], 1.1, kt[2]], null),
            v.quad(
              ht(St[0], St[1], qt, At * bt, -1.2),
              ht(Ut[0], Ut[1], re, At * bt, -1.2),
              ht(Ut[0], Ut[1], re, At * bt, 0.04),
              ht(St[0], St[1], qt, At * bt, 0.04),
              null,
            ));
        }
      let j = (bt, ot, ut, kt) => zp(p, K, tt, St[0], St[1], Ut[0], Ut[1], qt, re, bt, 0.07, 0.07, ot, ut, kt, ct + Yt);
      K.kind === 'A'
        ? (j(0.18, 15251747, 0.14, 'solid'),
          j(-0.18, 15251747, 0.14, 'solid'),
          j(At / 2, 15658730, 0.13, 'dash'),
          j(-At / 2, 15658730, 0.13, 'dash'),
          j(At - 0.6, 15658730, 0.15, 'solid'),
          j(-(At - 0.6), 15658730, 0.15, 'solid'))
        : K.kind === 'B'
          ? (j(0, 15658730, 0.14, 'dash'), j(At - 0.5, 15658730, 0.14, 'solid'), j(-(At - 0.5), 15658730, 0.14, 'solid'))
          : (j(At - 0.45, 15658730, 0.12, 'solid'), j(-(At - 0.45), 15658730, 0.12, 'solid'));
    }
    let _e = (St, Ut) => [Rt * 0, -wt * Ut * St, Rt * Ut * St];
    if ((K.kind === 'A' || K.kind === 'B') && !Bt) {
      for (let St = Math.ceil(ct / 30) * 30; St < _W; St += 30) {
        let Ut = Math.round(St / 30) % 2 ? 1 : -1,
          qt = (St - ct) / (Ct || 1),
          re = Y + (J - Y) * qt,
          j = Q + (ft - Q) * qt;
        if (St < Dt.r + 4 || St > K.len - jt.r - 4) continue;
        let bt = re - wt * Ut * (At + 0.7),
          ot = j + Rt * Ut * (At + 0.7);
        !S0(bt, ot) ||
          Lp(bt, ot) ||
          (M.setColor(8159365).box(bt, 0.18, ot, 0.22, 8.6, 0.22, 0, {
            noTop: !1,
          }),
          addProp(bt, ot, 0.18, 8.6),
          M.box(bt + wt * Ut * 1, 8.5, ot - Rt * Ut * 1, 0.14, 0.14, 2, Math.atan2(wt, Rt) + Math.PI / 2, {}),
          w.setColor([1, 0.95, 0.85]).box(bt + wt * Ut * 1.9, 8.35, ot - Rt * Ut * 1.9, 0.5, 0.15, 0.9, Math.atan2(wt, Rt), {}),
          S.push([bt + wt * Ut * 1.9, 8.2, ot - Rt * Ut * 1.9, K.kind === 'A' ? 0.9 : 1, K.kind === 'A' ? 0.94 : 0.8, K.kind === 'A' ? 1 : 0.55]));
      }
      if (K.kind === 'A' && R.Q.trees > 0)
        for (let St = Math.ceil(ct / 13) * 13 + 6; St < _W; St += 13) {
          if (St < Dt.r + 8 || St > K.len - jt.r - 8) continue;
          let Ut = (St - ct) / (Ct || 1),
            qt = Y + (J - Y) * Ut,
            re = Q + (ft - Q) * Ut;
          for (let j of [-1, 1]) {
            let bt = qt - wt * j * (At + ne - 1.1),
              ot = re + Rt * j * (At + ne - 1.1);
            S0(bt, ot) && Re(St * 7, j + G) < 0.85 * R.Q.trees && ag(M, _, bt, ot, 0.9 + Re(St, G) * 0.4, Re(G, St) < 0.15 ? 13152826 : null);
          }
        }
    }
    if (K.kind === 'L' && !Bt) {
      for (let St = Math.ceil(ct / 36) * 36; St < _W; St += 36) {
        if (St < Dt.r + 3 || St > K.len - jt.r - 3) continue;
        let Ut = (St - ct) / (Ct || 1),
          qt = Y + (J - Y) * Ut,
          re = Q + (ft - Q) * Ut,
          j = G % 2 ? 1 : -1,
          bt = qt - wt * j * (At + 0.5),
          ot = re + Rt * j * (At + 0.5);
        !S0(bt, ot) ||
          Lp(bt, ot) ||
          (y.setColor(11118238).cyl(bt, 0, ot, 0.17, 11.5, 6, !0),
          addProp(bt, ot, 0.2, 11.5),
          y.setColor(7170660).box(bt, 10.6, ot, 1.7, 0.12, 0.12, Math.atan2(wt, Rt) + Math.PI / 2, {}),
          Re(St, G * 3) < 0.3 && y.setColor(8422794).cyl(bt + 0.4, 8.6, ot, 0.32, 0.9, 6, !0),
          S.push([bt - wt * j * 0.8, 7.5, ot + Rt * j * 0.8, 1, 0.85, 0.6]),
          w.setColor([1, 0.95, 0.85]).box(bt - wt * j * 0.8, 7.5, ot + Rt * j * 0.8, 0.3, 0.12, 0.5, 0, {}),
          T.push([bt, ot, St]));
      }
      if (Re(G * 13, tt) < 0.12 && Ct > 12) {
        let Ut = Y + (J - Y) * 0.5,
          qt = Q + (ft - Q) * 0.5,
          re = Re(tt, G) < 0.5 ? 1 : -1,
          j = Ut - wt * re * (At + 0.6),
          bt = qt + Rt * re * (At + 0.6),
          ot = Math.atan2(wt, Rt);
        if (S0(j, bt) && sR(j, bt, 1)) {
          let ut = wt * re,
            kt = -Rt * re;
          for (let Pt = 0; Pt < 2; Pt++) {
            let ye = Rt * Pt * 1.05,
              Ze = wt * Pt * 1.05;
            (y.setColor([14211282, 13111342, 1793983][(G + Pt) % 3]).box(j + ye, 0, bt + Ze, 1, 1.85, 0.75, ot, {}),
              E.vplane(j + ye + ut * 0.39, 0.55, bt + Ze + kt * 0.39, 0.86, 1.25, ut, kt),
              S.push([j + ye + ut * 0.6, 1.2, bt + Ze + kt * 0.6, 0.85, 0.92, 1, 0.5]));
          }
        }
      }
    }
  }
  T.length > 1 && T.sort((q, G) => q[2] - G[2]);
  for (let q of B) {
    let G = W.nodes[q];
    if (G.edges.length < 2 && G.y < 1) {
      u.disc(G.x, 0.045, G.z, G.r - 0.5, 12);
      continue;
    }
    if (G.y > 1) {
      (c.disc(G.x, G.y, G.z, G.r - 1, 16), v.discDown(G.x, G.y - 1.6, G.z, G.r - 0.5, 16));
      continue;
    }
    (u.disc(G.x, 0.05, G.z, G.r, 18), G.sig && oR(G, x, p, M, y, D), bR(G, O));
  }
  let _R2 = [];
  buildingsInRect(e, i, s, o, _R2);
  let k = W.bld;
  for (let q of _R2) {
    let G = q * 9;
    r(k[G], k[G + 1]) && dR(q, m, g, M, y, b, w, C, S);
  }
  for (let q of W.cleared) r(q.x, q.z) && nR(q, y, f, M, _);
  let P = [];
  if ((buildRailChunk(e, i, s, o, v, M, y, w, S, P), P.length && a.add(MR(P)), R.Q.trees > 0))
    for (let q = e + 5; q < s; q += 11)
      for (let G = i + 5; G < o; G += 11) {
        let tt = maskQ(q, G);
        if (
          (tt !== M_PARK && tt !== M_FOREST && tt !== M_PALACE) ||
          Re(q * 3, G * 7) > (tt === M_FOREST ? 0.9 : tt === M_PALACE ? 0.45 : 0.55) * R.Q.trees
        )
          continue;
        let Y = q + (Re(q, G) - 0.5) * 8,
          Q = G + (Re(G, q) - 0.5) * 8;
        roadsNear(Y, Q, 9, Qv).length ||
          treeBlocked(Y, Q) ||
          ag(M, _, Y, Q, 1 + Re(Y, Q) * 0.9, tt === M_PALACE ? 2902570 : tt === M_FOREST ? 3101991 : null, tt === M_PALACE);
      }
  let H = R.M,
    Z = (q, G, tt, K) => {
      if (!q.count) return null;
      let Y = new THREE.Mesh(q.build(), G);
      return ((Y.castShadow = !!tt), (Y.receiveShadow = !!K), a.add(Y), Y);
    };
  if (
    (Z(l, H.ground, 0, 1),
    Z(f, H.grass, 0, 1),
    Z(u, H.road, 0, 1),
    Z(c, H.express, 1, 1),
    Z(h, H.walk, 0, 1),
    Z(d, H.curb, 0, 1),
    Z(p, H.mark, 0, 1),
    Z(x, H.cross, 0, 1),
    Z(m, H.building, 1, 1),
    Z(g, H.roof, 1, 1),
    Z(M, H.metal, 1, 0),
    Z(y, H.paint, 1, 1),
    Z(_, H.leaf, 1, 0),
    Z(v, H.concrete, 1, 1),
    Z(b, H.sign, 0, 0),
    Z(w, H.glow, 0, 0),
    Z(E, H.vend, 0, 0),
    Z(C, H.billboard, 0, 0),
    O.count)
  ) {
    let q = new THREE.Mesh(O.build(), yR());
    ((q.receiveShadow = !0), a.add(q));
  }
  if ((S.length && a.add(mR(S)), T.length > 1 && a.add(xR(T)), D.length)) {
    let q = aR(D, a);
    a.add(q);
  }
  return a;
}
function eR(n, t, e) {
  for (let i of W.lmCol) {
    if (Math.abs(i.x - n) > i.rad + e || Math.abs(i.z - t) > i.rad + e) continue;
    let s = Math.cos(i.rot || 0),
      o = Math.sin(i.rot || 0),
      r = n - i.x,
      a = t - i.z,
      l = r * s + a * o,
      f = -r * o + a * s;
    if (Math.abs(l) < i.w / 2 + e && Math.abs(f) < i.d / 2 + e) return !0;
  }
  return !1;
}
var Yv = [];
function Lp(n, t, e = 1.2, i = null, s = 9) {
  roadsNear(n, t, 24, Yv);
  for (let o of Yv) if (!(!o.e.elev || o.e === i) && o.d < o.e.hw + e && edgeY(o.e, o.s) < s) return !0;
  return !1;
}
function nR(n, t, e, i, s) {
  if (n.done === !1) return;
  let o = Math.cos(n.rot),
    r = Math.sin(n.rot),
    a = n.w,
    l = n.d;
  if (
    n.done === void 0 &&
    ((n.done = !(eR(n.x, n.z, 2) || roadHits(n.x, n.z, a, l, n.rot, 0.3) || railHits(n.x, n.z, a, l, n.rot, 3) || !S0(n.x, n.z))), !n.done)
  )
    return;
  let f = (c, h) => [n.x + o * c - r * h, n.z + r * c + o * h];
  t.setColor(11841188).box(n.x, 0.1, n.z, a, 0.09, l, n.rot, {});
  let u = Math.floor(n.x * 7 + n.z * 13);
  if (a > 8 && l > 8) {
    let c = a * 0.45,
      h = l * 0.45;
    t.setColor(9341570).box(n.x, 0.19, n.z, c + 0.4, 0.42, h + 0.4, n.rot, {});
    let d = [f(-c / 2, -h / 2), f(c / 2, -h / 2), f(c / 2, h / 2), f(-c / 2, h / 2)];
    e.setColor(6261317).quad([d[0][0], 0.62, d[0][1]], [d[3][0], 0.62, d[3][1]], [d[2][0], 0.62, d[2][1]], [d[1][0], 0.62, d[1][1]], [0, 1, 0]);
  }
  if (R.Q.trees > 0)
    for (let c = -a / 2 + 3; c <= a / 2 - 3; c += 7)
      for (let h = -l / 2 + 3; h <= l / 2 - 3; h += 7) {
        if (Re(u + Math.round(c), Math.round(h)) > 0.7) continue;
        let [d, p] = f(c, h);
        ag(i, s, d, p, 0.9 + Re(d, p) * 0.6, [4946483, 5603128, 4156206][Math.floor(Re(p, d) * 3)]);
      }
  if (a > 6)
    for (let c of [-1, 1]) {
      let [h, d] = f(c * a * 0.3, l / 2 - 1.2);
      t.setColor(8018490).box(h, 0.19, d, 1.8, 0.45, 0.5, n.rot, {});
    }
}
var Qv = [];
function S0(n, t) {
  let e = maskQ(n, t);
  return e === M_LAND || e === M_AIR;
}
function iR(n, t, e, i, s, o, r) {
  let a = (n + e) / 2,
    l = (t + i) / 2,
    f = maskQ(a, l);
  return f === M_WATER || f === M_MOAT;
}
var Kv = [];
function sR(n, t, e) {
  buildingsInRect(n - 40, t - 40, n + 40, t + 40, Kv);
  let i = W.bld;
  for (let s of Kv) {
    let o = s * 9,
      r = Math.cos(i[o + 2]),
      a = Math.sin(i[o + 2]),
      l = n - i[o],
      f = t - i[o + 1],
      u = l * r + f * a,
      c = -l * a + f * r;
    if (Math.abs(u) < i[o + 3] / 2 + e && Math.abs(c) < i[o + 4] / 2 + e) return !1;
  }
  return !0;
}
function zp(n, t, e, i, s, o, r, a, l, f, u, c, h, d, p, x) {
  n.setColor(h);
  let m = Math.hypot(o - i, r - s);
  if (m < 0.2) return;
  let g = x ?? t.cum[e],
    M = (b, w) => {
      let E = [i + (o - i) * b, s + (r - s) * b],
        C = [i + (o - i) * w, s + (r - s) * w],
        S = b === 0 ? a : [-(r - s) / m, (o - i) / m],
        T = w === 1 ? l : [-(r - s) / m, (o - i) / m],
        D = u + (c - u) * b,
        O = u + (c - u) * w;
      n.quad(
        [E[0] + S[0] * (f - d / 2), D, E[1] + S[1] * (f - d / 2)],
        [E[0] + S[0] * (f + d / 2), D, E[1] + S[1] * (f + d / 2)],
        [C[0] + T[0] * (f + d / 2), O, C[1] + T[1] * (f + d / 2)],
        [C[0] + T[0] * (f - d / 2), O, C[1] + T[1] * (f - d / 2)],
        [0, 1, 0],
      );
    };
  if (p === 'solid') {
    M(0, 1);
    return;
  }
  let y = 10,
    _ = 5,
    v = Math.floor(g / y) * y;
  for (; v < g + m; v += y) {
    let b = Math.max(v, g),
      w = Math.min(v + _, g + m);
    w > b && M((b - g) / m, (w - g) / m);
  }
}
function oR(n, t, e, i, s, o) {
  n.edges.forEach((r, a) => {
    let l = W.edges[r];
    if (l.kind === 'X' || l.kind === 'R') return;
    let f = l.a === n.i ? l.pts[1] : l.pts[l.pts.length - 2],
      u = f[0] - n.x,
      c = f[1] - n.z,
      h = Math.hypot(u, c) || 1;
    ((u /= h), (c /= h));
    let d = l.hw,
      p = Math.atan2(c, u),
      x = n.x + u * (n.r + 2.4),
      m = n.z + c * (n.r + 2.4),
      g = -c,
      M = u,
      y = d * 2 - 0.8;
    t.quad(
      [x - (g * y) / 2 - u * 2, 0.08, m - (M * y) / 2 - c * 2],
      [x + (g * y) / 2 - u * 2, 0.08, m + (M * y) / 2 - c * 2],
      [x + (g * y) / 2 + u * 2, 0.08, m + (M * y) / 2 + c * 2],
      [x - (g * y) / 2 + u * 2, 0.08, m - (M * y) / 2 + c * 2],
      [0, 1, 0],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    );
    let _ = -u,
      v = -c,
      b = v,
      w = -_,
      E = n.x + u * (n.r + 5.4),
      C = n.z + c * (n.r + 5.4);
    e.setColor(15658730).quad(
      [E + b * 0.2 - u * 0.25, 0.075, C + w * 0.2 - c * 0.25],
      [E + b * (d - 0.6) - u * 0.25, 0.075, C + w * (d - 0.6) - c * 0.25],
      [E + b * (d - 0.6) + u * 0.25, 0.075, C + w * (d - 0.6) + c * 0.25],
      [E + b * 0.2 + u * 0.25, 0.075, C + w * 0.2 + c * 0.25],
      [0, 1, 0],
    );
    let S = n.x + u * (n.r + 1.2) + b * (d + 1.4),
      T = n.z + c * (n.r + 1.2) + w * (d + 1.4);
    if (!S0(S, T) || Lp(S, T)) return;
    (i.setColor(9080467).box(S, 0.18, T, 0.28, 6.2, 0.28, 0, {}), addProp(S, T, 0.2, 6.2));
    let D = d + 1.4 - d * 0.45;
    i.box(S - (b * D) / 2, 5.9, T - (w * D) / 2, D, 0.16, 0.16, Math.atan2(-w, b), {});
    let O = S - b * D,
      U = T - w * D;
    (s.setColor(5922662).box(O, 5.45, U, 1.55, 0.48, 0.34, Math.atan2(-w, b), {}), s.setColor(5067351).box(S, 2.6, T, 0.4, 0.8, 0.3, p, {}));
    for (let B = 0; B < 3; B++)
      o.push({
        x: O + b * (0.48 - B * 0.48) + u * 0.18,
        y: 5.69,
        z: U + w * (0.48 - B * 0.48) + c * 0.18,
        fx: u,
        fz: c,
        n,
        ei: r,
        q: B,
      });
  });
}
var rR = new THREE.CircleGeometry(0.17, 12);
function aR(n, t) {
  let e = new THREE.InstancedMesh(
      rR,
      new THREE.MeshBasicMaterial({
        toneMapped: !1,
      }),
      n.length,
    ),
    i = new THREE.Object3D(),
    s = new THREE.Color(2236962);
  return (
    n.forEach((o, r) => {
      (i.position.set(o.x, o.y, o.z), i.rotation.set(0, Math.atan2(o.fx, o.fz), 0), i.updateMatrix(), e.setMatrixAt(r, i.matrix), e.setColorAt(r, s));
    }),
    (e.frustumCulled = !1),
    Cf.push({
      m: e,
      sigs: n,
      root: t,
      st: [],
    }),
    e
  );
}
var lR = [new THREE.Color(1700020), new THREE.Color(16757504), new THREE.Color(16722456)],
  cR = [new THREE.Color(1454121), new THREE.Color(2892816), new THREE.Color(3019796)];
function t_(n) {
  for (let t of Cf) {
    let e = !1;
    (t.sigs.forEach((i, s) => {
      let o = sigState(i.n, i.ei, n),
        r = o === i.q ? 1 : 0;
      t.st[s] !== r && ((t.st[s] = r), t.m.setColorAt(s, r ? lR[i.q] : cR[i.q]), (e = !0));
    }),
      e && (t.m.instanceColor.needsUpdate = !0));
  }
}
function e_(n, t, e, i, s) {
  for (let o = i; o < i + un; o += s) {
    let r = null,
      a = -1,
      l = (f) => {
        if (r === null || a === M_WATER || a === M_MOAT || a < 0) return;
        let u = (a === M_PARK || a === M_FOREST || a === M_PALACE || a === M_AIR) && t ? t : n,
          c =
            a === M_AIR
              ? [0.5, 0.56, 0.36]
              : a === M_PARK || a === M_FOREST
                ? [0.36, 0.48, 0.26]
                : a === M_PALACE
                  ? [0.42, 0.46, 0.33]
                  : [0.52, 0.505, 0.48];
        (u.c && u.setColor(c),
          u.quad(
            [r, 0, o + s],
            [f, 0, o + s],
            [f, 0, o],
            [r, 0, o],
            [0, 1, 0],
            [
              [r / 8, (o + s) / 8],
              [f / 8, (o + s) / 8],
              [f / 8, o / 8],
              [r / 8, o / 8],
            ],
          ));
      };
    for (let f = e; f < e + un; f += s) {
      let u = maskQ(f + s / 2, o + s / 2);
      u !== a && (l(f), (r = f), (a = u));
    }
    l(e + un);
  }
}
var fR = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(),
  bo = fR.attributes.position.array;
function ag(n, t, e, i, s, o, r) {
  let a = (2.6 + Re(e, i) * 1.2) * s;
  (n.setColor(5981750).cyl(e, 0.15, i, 0.16 * s, a, 6, !1), addProp(e, i, 0.22 * s, a));
  let l = o ?? [4156206, 4946483, 3563306, 5603128, 3101991][Math.floor(Re(i, e) * 5)],
    f = new THREE.Color(l),
    u = (r ? 3 : 2.2) * s,
    c = (r ? 1.3 : 1.9) * s,
    h = 0.15 + a + c * 0.55,
    d =
      r || R.Q.trees < 1
        ? [[0, 0, 0, 1]]
        : [
            [0, 0, 0, 1],
            [0.45, 0.35, 0.2, 0.7],
            [-0.4, 0.25, -0.3, 0.72],
          ];
  for (let [p, x, m, g] of d) {
    let M = 0.82 + Re(e * 2 + p, i + m) * 0.32;
    t.setColor([f.r * M, f.g * M, f.b * M]);
    let y = e + p * u,
      _ = h + x * c,
      v = i + m * u;
    for (let b = 0; b < bo.length; b += 9) {
      let w = [y + bo[b] * u * g, _ + bo[b + 1] * c * g, v + bo[b + 2] * u * g],
        E = [y + bo[b + 3] * u * g, _ + bo[b + 4] * c * g, v + bo[b + 5] * u * g],
        C = [y + bo[b + 6] * u * g, _ + bo[b + 7] * c * g, v + bo[b + 8] * u * g];
      t.tri(w, E, C, hR(w, E, C));
    }
  }
}
function hR(n, t, e) {
  let i = t[0] - n[0],
    s = t[1] - n[1],
    o = t[2] - n[2],
    r = e[0] - n[0],
    a = e[1] - n[1],
    l = e[2] - n[2],
    f = [s * l - o * a, o * r - i * l, i * a - s * r],
    u = Math.hypot(...f) || 1;
  return f.map((c) => c / u);
}
var uR = [0, 1, 2, 3, 4, 5];
function n_(n, t, e) {
  let i = W.bld,
    s = t * 9,
    o = i[s],
    r = i[s + 1],
    a = i[s + 2],
    l = i[s + 3],
    f = i[s + 4],
    u = i[s + 5],
    c = i[s + 6],
    h = i[s + 7];
  if (c < 1) return;
  let d = u === 0 ? no.house : u === 1 ? no.apt : u === 4 ? no.tower : u === 3 ? no.off : no.mid;
  (n.setColor(Ip(d[h % d.length], (Re(h, 3) - 0.5) * 0.12)),
    (n.bv = [uR[u], (h % 97) * 0.37, u === 0 || u === 1 ? 2.9 : u === 4 ? 3.9 : 3.5, u === 4 ? 0.55 : 0.5]),
    n.box(o, 0, r, l, c, f, a, {
      base: 0,
    }));
}
function dR(n, t, e, i, s, o, r, a, l) {
  let f = W.bld,
    u = n * 9,
    c = f[u],
    h = f[u + 1],
    d = f[u + 2],
    p = f[u + 3],
    x = f[u + 4],
    m = f[u + 5],
    g = f[u + 6],
    M = f[u + 7],
    y = f[u + 8];
  if (g < 1) return;
  let _ = Math.cos(d),
    v = Math.sin(d);
  if (m === 4 && p * x > 700 && Re(M, 1) < 0.6) {
    let b = Math.min(24, g * 0.18);
    (t.setColor(Ip(no.off[M % no.off.length])),
      (t.bv = [3, (M % 97) * 0.37, 4.2, 0.55]),
      t.box(c, 0, h, p, b, x, d, {
        base: 0,
      }));
    let w = p * (0.62 + Re(M, 2) * 0.2),
      E = x * (0.62 + Re(M, 4) * 0.2);
    (t.setColor(Ip(no.tower[M % no.tower.length])),
      (t.bv = [4, (M % 97) * 0.37, 3.9, 0.55]),
      t.box(c, b, h, w, g - b, E, d, {
        base: 0,
      }),
      t.box(c, g, h, w * 0.7, Math.min(10, g * 0.05), E * 0.7, d, {
        base: 0,
      }),
      jv(i, c, g + Math.min(10, g * 0.05), h, w * 0.7, E * 0.7, d, M, !0, l));
  } else
    (n_(t, n, !1),
      m === 0
        ? (e.setColor(Ip(no.roof[M % no.roof.length], (Re(M, 5) - 0.5) * 0.1)),
          p >= x
            ? e.gable(c, g, h, p + 0.6, x + 0.6, 1.6 + Re(M, 7) * 1, d)
            : e.gable(c, g, h, x + 0.6, p + 0.6, 1.6 + Re(M, 7) * 1, d + Math.PI / 2))
        : jv(i, c, g, h, p, x, d, M, m === 4, l));
  if (m === 2 || m === 5 || (m === 3 && y > 0.3)) {
    let b = null;
    for (let w of [-1, 1]) {
      let E = -v * w,
        C = _ * w,
        S = c + E * (x / 2 + 6),
        T = h + C * (x / 2 + 6);
      roadsNear(S, T, 7, Qv).length && !b && (b = [E, C, w]);
    }
    if (b) {
      let [w, E] = b,
        C = c + w * (x / 2),
        S = h + E * (x / 2);
      if (Re(M, 11) < 0.55 + y * 0.4) {
        let T = Math.floor(Re(M, 12) * 8),
          D = Math.floor(Re(M, 13) * 8),
          O = Math.min(p - 0.6, 3.5 + Re(M, 14) * 5);
        rg(o, C + w * 0.06, 3.4, S + E * 0.06, O, 1, w, E, T / 8, 0.4375 - D / 16, 1 / 8, 1 / 16);
      }
      {
        let T = Math.min(p - 1, 9);
        if (
          (r.setColor(Re(M, 21) < 0.5 ? [0.98, 0.92, 0.78] : [0.85, 0.93, 1]).vplane(C + w * 0.05, 0.25, S + E * 0.05, T, 2.6, w, E),
          Re(M, 22) < 0.45)
        ) {
          let D = [11740702, 2058810, 1789864, 3816512, 13214522][Math.floor(Re(M, 23) * 5)],
            O = C + w * 0.6,
            U = S + E * 0.6;
          s.setColor(D);
          let B = [C - (_ * T) / 2 + w * 0.02, 3.05, S - (v * T) / 2 + E * 0.02],
            R = [C + (_ * T) / 2 + w * 0.02, 3.05, S + (v * T) / 2 + E * 0.02],
            k = [O + (_ * T) / 2 + w * 0.6, 2.55, U + (v * T) / 2 + E * 0.6],
            P = [O - (_ * T) / 2 + w * 0.6, 2.55, U - (v * T) / 2 + E * 0.6];
          (s.quad(B, R, k, P, null), s.quad(P, k, R, B, null));
        }
      }
      if (g > 10 && Re(M, 15) < 0.25 + y * 0.7) {
        let T = Math.min(g - 5.5, 4 + Re(M, 16) * 7),
          D = Math.floor(Re(M, 17) * 32),
          O = (Re(M, 18) < 0.5 ? -1 : 1) * (p / 2 - 1),
          U = C + _ * O + w * 0.7,
          B = S + v * O + E * 0.7,
          R = _,
          k = v;
        (rg(o, U, 4.4, B, 1.1, T, R, k, D / 32, 0.5, 1 / 32, 0.5), rg(o, U, 4.4, B, 1.1, T, -R, -k, D / 32, 0.5, 1 / 32, 0.5));
      }
      if (g > 14 && g < 60 && y > 0.35 && Re(M, 19) < 0.25) {
        let T = Math.min(p, 12),
          D = T * 0.5,
          O = Math.floor(Re(M, 20) * 8);
        (a.vplane(c + w * (x / 2 - 1), g + 1.5, h + E * (x / 2 - 1), T, D, w, E, [
          [(O % 4) / 4, 1 - (Math.floor(O / 4) + 1) / 2],
          [((O % 4) + 1) / 4, 1 - (Math.floor(O / 4) + 1) / 2],
          [((O % 4) + 1) / 4, 1 - Math.floor(O / 4) / 2],
          [(O % 4) / 4, 1 - Math.floor(O / 4) / 2],
        ]),
          i.setColor(5593696).box(c + w * (x / 2 - 1.3), g, h + E * (x / 2 - 1.3), T, 1.5, 0.3, d, {}));
      }
    }
  }
}
function rg(n, t, e, i, s, o, r, a, l, f, u, c) {
  n.vplane(t, e, i, s, o, r, a, [
    [l, f],
    [l + u, f],
    [l + u, f + c],
    [l, f + c],
  ]);
}
function jv(n, t, e, i, s, o, r, a, l, f) {
  let u = Math.cos(r),
    c = Math.sin(r);
  if (l) {
    (n.setColor(7040885).box(t, e, i, s * 0.45, 3 + Re(a, 21) * 4, o * 0.45, r, {}),
      e > 100 &&
        (f.push([t + u * s * 0.35, e + 0.5, i + c * s * 0.35, 1, 0.1, 0.06, 2.5, 1]),
        f.push([t - u * s * 0.35, e + 0.5, i - c * s * 0.35, 1, 0.1, 0.06, 2.5, 1])));
    return;
  }
  let h = Math.floor(Re(a, 22) * 4);
  for (let d = 0; d < h; d++) {
    let p = (Re(a, 30 + d) - 0.5) * s * 0.6,
      x = (Re(a, 40 + d) - 0.5) * o * 0.6;
    n.setColor(10132895).box(
      t + u * p - c * x,
      e,
      i + c * p + u * x,
      1.2 + Re(a, 50 + d) * 1.4,
      0.9 + Re(a, 60 + d) * 0.8,
      1.2 + Re(a, 70 + d),
      r,
      {},
    );
  }
  Re(a, 23) < 0.35 && s > 6 && n.setColor(12106944).cyl(t + u * s * 0.2, e, i + c * s * 0.2, 1.1, 2.6, 8, !0);
}
var Pp = null;
function pR() {
  if (Pp) return Pp;
  let n = document.createElement('canvas');
  n.width = n.height = 64;
  let t = n.getContext('2d'),
    e = t.createRadialGradient(32, 32, 0, 32, 32, 32);
  return (
    e.addColorStop(0, 'rgba(255,255,255,1)'),
    e.addColorStop(0.25, 'rgba(255,255,255,0.5)'),
    e.addColorStop(1, 'rgba(255,255,255,0)'),
    (t.fillStyle = e),
    t.fillRect(0, 0, 64, 64),
    (Pp = new THREE.CanvasTexture(n)),
    Pp
  );
}
var Dp = [];
function mR(n) {
  let t = new THREE.BufferGeometry(),
    e = [],
    i = [];
  for (let r of n) (e.push(r[0], r[1], r[2]), i.push(r[3], r[4], r[5]));
  (t.setAttribute('position', new THREE.Float32BufferAttribute(e, 3)), t.setAttribute('color', new THREE.Float32BufferAttribute(i, 3)));
  let s = new THREE.PointsMaterial({
    size: 5,
    map: pR(),
    vertexColors: !0,
    transparent: !0,
    depthWrite: !1,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    sizeAttenuation: !0,
    fog: !0,
    toneMapped: !1,
  });
  (Dp.push(s), Dp.length > 400 && Dp.shift());
  let o = new THREE.Points(t, s);
  return ((o.frustumCulled = !1), (o.renderOrder = 3), o);
}
function xR(n) {
  let t = [];
  for (let i = 0; i + 1 < n.length; i++) {
    let s = n[i],
      o = n[i + 1];
    if (!(Math.hypot(s[0] - o[0], s[1] - o[1]) > 45))
      for (let [r, a] of [
        [10.5, -0.6],
        [10.5, 0.6],
        [9.6, 0],
      ]) {
        let l = (s[0] + o[0]) / 2,
          f = (s[1] + o[1]) / 2;
        t.push(s[0], r, s[1], l, r - 0.6, f, l, r - 0.6, f, o[0], r, o[1]);
      }
  }
  let e = new THREE.BufferGeometry();
  return (e.setAttribute('position', new THREE.Float32BufferAttribute(t, 3)), new THREE.LineSegments(e, gR));
}
var gR = new THREE.LineBasicMaterial({
  color: 1710618,
  transparent: !0,
  opacity: 0.7,
});
function i_(n) {
  for (let t of Dp) t.opacity = Math.min(1, n * 1.1);
  (R.M.lamp.color.setScalar(0.5 + n * 0.5), (R.M.sign.emissiveIntensity = 0.25 + n * 1.1), (R.M.billboard.emissiveIntensity = 0.2 + n * 0.9));
}
var ja = 512,
  tr = 128;
function MR(n) {
  let t = n.slice(0, 48),
    e = Math.ceil(t.length / 2),
    i = e * tr,
    [s, o] = Ne(ja * 2, i);
  t.forEach((f, u) => {
    let c = (u % 2) * ja,
      h = Math.floor(u / 2) * tr;
    if ((o.save(), o.translate(c, h), f.station)) {
      let [d, p, x, m] = f.station,
        g = typeof m == 'number' ? '#' + m.toString(16).padStart(6, '0') : m;
      ((o.fillStyle = '#fbfbf8'),
        o.fillRect(0, 0, ja, tr),
        (o.fillStyle = g),
        o.fillRect(0, tr - 22, ja, 12),
        (o.fillStyle = '#fff'),
        (o.strokeStyle = g),
        (o.lineWidth = 7),
        o.beginPath(),
        o.arc(52, 50, 32, 0, 7),
        o.fill(),
        o.stroke(),
        (o.fillStyle = '#111'),
        (o.textAlign = 'center'),
        (o.textBaseline = 'middle'),
        (o.font = '900 21px Arial,sans-serif'),
        o.fillText(x, 52, 51));
      let M = 54;
      for (o.font = `900 ${M}px ${ce}`; o.measureText(d).width > 360 && M > 24;) ((M -= 4), (o.font = `900 ${M}px ${ce}`));
      (o.fillText(d, 300, 44), (o.font = '700 19px Arial,sans-serif'), (o.fillStyle = '#333'), o.fillText(String(p).toUpperCase(), 300, 84));
    } else {
      ((o.fillStyle = f.bg || '#1d4fa6'),
        o.fillRect(0, 0, ja, tr),
        (o.fillStyle = f.fg || '#fff'),
        (o.textAlign = 'center'),
        (o.textBaseline = 'middle'));
      let d = f.lines.length;
      f.lines.forEach((p, x) => {
        let m = Math.min(54, (tr - 20) / d);
        for (o.font = `900 ${m}px ${ce}`; o.measureText(p).width > ja - 30 && m > 12;) ((m -= 2), (o.font = `900 ${m}px ${ce}`));
        o.fillText(p, ja / 2, 10 + ((x + 0.5) * (tr - 20)) / d);
      });
    }
    o.restore();
  });
  let r = new THREE.CanvasTexture(s);
  ((r.colorSpace = THREE.SRGBColorSpace), (r.anisotropy = 4), (r.generateMipmaps = !0), (r.onUpdate = P2));
  let a = new Mt();
  t.forEach((f, u) => {
    let c = (u % 2) * 0.5,
      h = c + 0.5,
      d = 1 - (Math.floor(u / 2) * tr) / i,
      p = d - tr / i,
      x = [
        [c, p],
        [h, p],
        [h, d],
        [c, d],
      ];
    (a.vplane(f.x + f.nx * 0.03, f.y, f.z + f.nz * 0.03, f.w, f.h, f.nx, f.nz, x),
      f.both && a.vplane(f.x - f.nx * 0.03, f.y, f.z - f.nz * 0.03, f.w, f.h, -f.nx, -f.nz, x));
  });
  let l = new THREE.Mesh(
    a.build(),
    new THREE.MeshBasicMaterial({
      map: r,
      color: 14211288,
      fog: !0,
    }),
  );
  return ((l.userData.tex = r), l);
}
var kp = null;
function yR() {
  if (kp) return kp;
  let n = document.createElement('canvas');
  ((n.width = 1024), (n.height = 256));
  let t = n.getContext('2d');
  (t.clearRect(0, 0, 1024, 256),
    (t.fillStyle = '#fff'),
    t.save(),
    t.translate(128, 128),
    t.scale(1, 2.2),
    (t.font = '900 70px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif'),
    (t.textAlign = 'center'),
    (t.textBaseline = 'middle'),
    t.fillText('\u6B62\u307E\u308C', 0, 0),
    t.restore());
  let e = (s, o) => {
    (t.save(),
      t.translate(s, 236),
      t.fillRect(-9, -150, 18, 150),
      t.translate(0, -150),
      o && (t.rotate((o * Math.PI) / 4), t.fillRect(-9, -70, 18, 72), t.translate(0, -70)),
      t.beginPath(),
      t.moveTo(-32, 4),
      t.lineTo(32, 4),
      t.lineTo(0, -60),
      t.closePath(),
      t.fill(),
      t.restore());
  };
  (e(384, 0), e(640, -1.2), e(896, 1.2));
  let i = new THREE.CanvasTexture(n);
  return (
    (i.colorSpace = THREE.SRGBColorSpace),
    (i.anisotropy = 8),
    (kp = new THREE.MeshStandardMaterial({
      map: i,
      transparent: !0,
      alphaTest: 0.4,
      roughness: 0.7,
      color: 15263970,
      polygonOffset: !0,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    })),
    kp
  );
}
function bR(n, t) {
  if (n.edges.length < 3) return;
  let e = n.edges.some((i) => W.edges[i].kind === 'A' || W.edges[i].kind === 'B');
  for (let i of n.edges) {
    let s = W.edges[i];
    if (s.elev) continue;
    let o = s.a === n.i,
      r = o ? s.pts[1] : s.pts[s.pts.length - 2],
      a = Math.hypot(r[0] - n.x, r[1] - n.z) || 1,
      l = (r[0] - n.x) / a,
      f = (r[1] - n.z) / a,
      u = -f,
      c = l,
      h = -f,
      d = l;
    if (s.kind === 'L' && e && !n.sig && s.len > 20) {
      let p = n.r + 6.5,
        x = n.x + l * p + h * s.hw * 0.48,
        m = n.z + f * p + d * s.hw * 0.48,
        g = Math.min(2.6, s.hw * 0.9);
      Jv(t, x, m, -l, -f, g, 4.2, [0, 0, 0.25, 1]);
    } else if ((s.kind === 'A' || s.kind === 'B') && n.sig && s.len > 50) {
      let p = s.lanes,
        x = Math.min(3.4, s.hw / p);
      for (let m = 0; m < p; m++) {
        let g = (m + 0.5) * x + (s.kind === 'A' ? 0.45 : 0),
          M = n.r + 16,
          y = n.x + l * M + h * g,
          _ = n.z + f * M + d * g,
          v = p > 1 ? (m === 0 ? 2 : m === p - 1 ? 1 : 0) : 0,
          b = 0.25 + v * 0.25;
        Jv(t, y, _, -l, -f, 1.4, 5, [b, 0, b + 0.25, 1]);
      }
    }
  }
}
function Jv(n, t, e, i, s, o, r, a) {
  let l = -s,
    f = i,
    u = 0.078,
    [c, h, d, p] = a,
    x = [t - (l * o) / 2 - (i * r) / 2, u, e - (f * o) / 2 - (s * r) / 2],
    m = [t + (l * o) / 2 - (i * r) / 2, u, e + (f * o) / 2 - (s * r) / 2],
    g = [t + (l * o) / 2 + (i * r) / 2, u, e + (f * o) / 2 + (s * r) / 2],
    M = [t - (l * o) / 2 + (i * r) / 2, u, e - (f * o) / 2 + (s * r) / 2];
  n.quad(
    m,
    x,
    M,
    g,
    [0, 1, 0],
    [
      [d, h],
      [c, h],
      [c, p],
      [d, p],
    ],
  );
}
var AC = {};
vi(AC, {
  AIRLINES: () => AIRLINES,
  HND: () => HND,
  TERMS: () => TERMS,
  flyHeli: () => flyHeli,
  flyPlane: () => flyPlane,
  gatePositions: () => gatePositions,
  groundUnder: () => groundUnder,
  heliGeo: () => heliGeo,
  initAircraft: () => initAircraft,
  onRunway: () => onRunway,
  runwayEnds: () => runwayEnds,
  startHeli: () => startHeli,
  startPlane: () => startPlane,
  updAircraft: () => updAircraft,
  vMat: () => vMat,
});
var s_ = Math.PI / 180,
  HND = (() => {
    let n = 337 * s_,
      t = Math.sin(n),
      e = -Math.cos(n),
      i = (c, h, d, p, x) => {
        let [m, g] = fe(c, h),
          M = Math.sin(x),
          y = -Math.cos(x);
        return {
          x: m,
          z: g,
          len: d,
          w: p,
          ux: M,
          uz: y,
          head: x,
        };
      },
      s = i(35.549, 139.7718, 3e3, 60, n),
      o = i(35.5465, 139.7995, 3360, 60, n),
      r = i(35.532, 139.8175, 2500, 60, 50 * s_),
      a = fe(35.5494, 139.7835),
      l = fe(35.5507, 139.7905),
      f = fe(35.5455, 139.7655),
      u = fe(35.553, 139.7865);
    return {
      A: s,
      C: o,
      D: r,
      T1: a,
      T2: l,
      T3: f,
      tower: u,
      ux: t,
      uz: e,
    };
  })(),
  TERMS = (() => {
    let n = -HND.uz,
      t = HND.ux;
    return [
      [HND.T1, 760, 70, -1, [-280, 0, 280], 'T1'],
      [HND.T2, 760, 70, 1, [-280, 0, 280], 'T2'],
      [HND.T3, 560, 80, 1, [-180, 180], 'T3'],
    ].map(([e, i, s, o, r, a]) => ({
      T: e,
      L: i,
      Wd: s,
      side: o,
      piers: r,
      id: a,
      c: [e[0] - n * o * 40, e[1] - t * o * 40],
    }));
  })(),
  E0 = null;
function gatePositions() {
  if (E0) return E0;
  E0 = [];
  let n = HND.ux,
    t = HND.uz,
    e = -t,
    i = n;
  for (let s of TERMS) {
    let o = s.side,
      r = Math.atan2(-e * o, -i * o),
      a = (f, u) => [s.c[0] + n * f + e * o * u, s.c[1] + t * f + i * o * u],
      l = [];
    for (let f = -s.L / 2 + 50; f <= s.L / 2 - 50; f += 60) s.piers.every((u) => Math.abs(f - u) >= 50) && l.push(f);
    for (let f of l) {
      let [u, c] = a(f, s.Wd / 2 + 40),
        [h, d] = a(f - 16, s.Wd / 2);
      E0.push({
        T: s.T,
        id: s.id,
        x: u,
        z: c,
        yaw: r,
        fx: h,
        fz: d,
        pier: !1,
      });
    }
    for (let f of s.piers) {
      let [u, c] = a(f, s.Wd / 2 + 180),
        [h, d] = a(f, s.Wd / 2 + 140);
      E0.push({
        T: s.T,
        id: s.id,
        x: u,
        z: c,
        yaw: r,
        fx: h,
        fz: d,
        pier: !0,
      });
    }
  }
  return E0;
}
function runwayEnds(n) {
  return [
    [n.x - (n.ux * n.len) / 2, n.z - (n.uz * n.len) / 2],
    [n.x + (n.ux * n.len) / 2, n.z + (n.uz * n.len) / 2],
  ];
}
function onRunway(n, t) {
  for (let e of [HND.A, HND.C, HND.D]) {
    let i = n - e.x,
      s = t - e.z,
      o = i * e.ux + s * e.uz,
      r = -i * e.uz + s * e.ux;
    if (Math.abs(o) < e.len / 2 + 60 && Math.abs(r) < e.w / 2 + 10) return !0;
  }
  return !1;
}
function vR(n, t = 1) {
  let e = new Mt({
      color: !0,
      mat: !0,
    }),
    i = 15922165,
    s = 13949148,
    o = (f, u = 0) => ((e.mv = u), e.setColor(f), e),
    r = (f, u, c) => {
      let h = [];
      for (let d = 0; d < 12; d++) {
        let p = (d / 12) * Math.PI * 2;
        h.push([Math.cos(p) * u, c + Math.sin(p) * u * 1.05, f]);
      }
      return h;
    },
    a = [
      [22, 0.2, 3.3],
      [21, 1, 3.25],
      [19.5, 1.7, 3.2],
      [17, 2.05, 3.2],
      [-12, 2.05, 3.2],
      [-17, 1.6, 3.5],
      [-21, 0.8, 3.9],
      [-22.5, 0.25, 4.1],
    ];
  for (let f = 0; f + 1 < a.length; f++) {
    let u = r(a[f][0], a[f][1], a[f][2]),
      c = r(a[f + 1][0], a[f + 1][1], a[f + 1][2]);
    for (let h = 0; h < 12; h++) {
      let d = (h + 1) % 12;
      o(i).quad(u[d], u[h], c[h], c[d], null);
    }
  }
  (o(2764856, 1).box(-1.4, 3.75, 2, 0.02, 0.32, 28, 0, {}),
    o(2764856, 1).box(1.4, 3.75, 2, 0.02, 0.32, 28, 0, {}),
    o(2764856, 1).prism(0, 3.9, 4.5, 19.6, 1.3, 1, 1, -0.2, 0.2, -0.4),
    o(n).box(0, 2, 2, 4.15, 0.45, 30, 0, {}));
  for (let f of [-1, 1])
    (o(s).quad([f * 2, 2.2, 6], [f * 2, 2.2, -2], [f * 19, 2.9, -9], [f * 19, 2.9, -6.5], null),
      o(s).quad([f * 2, 2.6, -2], [f * 2, 2.6, 6], [f * 19, 3.1, -6.5], [f * 19, 3.1, -9], null),
      o(n).box(f * 19.2, 3, -8, 0.25, 2.2, 1.6, 0, {}),
      o(10133672).cylZ(f * 7.5, 1.3, 3.8, 1.25, 4.6),
      o(2236962).cylZ(f * 7.5, 1.3, 6.11, 1, 0.04),
      o(s).quad([f * 1.5, 3.8, -16], [f * 1.5, 3.8, -20], [f * 8.5, 4.2, -23], [f * 8.5, 4.2, -21], null),
      o(s).quad([f * 1.5, 4, -20], [f * 1.5, 4, -16], [f * 8.5, 4.4, -21], [f * 8.5, 4.4, -23], null));
  o(n).prism(0, 4.5, 12.5, -18.5, 0.3, 0.2, -15.5, -21.5, -20.5, -23.5);
  for (let [f, u] of [
    [0, 15],
    [-3, -1.5],
    [3, -1.5],
  ])
    o(3355443).box(f, 0, u, 0.35, 1.2, 0.35, 0, {});
  let l = e.build();
  return (t !== 1 && l.scale(t, t, t), l);
}
Mt.prototype.cylZ = function (n, t, e, i, s, o = 12) {
  for (let r = 0; r < o; r++) {
    let a = (r / o) * Math.PI * 2,
      l = ((r + 1) / o) * Math.PI * 2;
    this.quad(
      [n + Math.cos(l) * i, t + Math.sin(l) * i, e - s / 2],
      [n + Math.cos(a) * i, t + Math.sin(a) * i, e - s / 2],
      [n + Math.cos(a) * i, t + Math.sin(a) * i, e + s / 2],
      [n + Math.cos(l) * i, t + Math.sin(l) * i, e + s / 2],
      null,
    );
  }
};
function heliGeo(n) {
  let t = new Mt({
      color: !0,
      mat: !0,
    }),
    e = (i, s = 0) => ((t.mv = s), t.setColor(i), t);
  (e(n).prism(0, 0.6, 2.4, 0.3, 0.75, 0.6, 2.2, -1.8, 1.4, -1.6),
    e(1778219, 1).prism(0, 1.1, 2.3, 1.75, 0.76, 0.6, 2.25, 0.8, 1.45, 0.9),
    e(n).box(0, 1.3, -4, 0.35, 0.45, 4.5, 0, {}),
    e(n).box(0, 1.5, -6.1, 0.12, 1.4, 0.8, 0, {}),
    e(16777215).box(0, 1.8, -6.1, 0.13, 0.25, 0.81, 0, {}),
    e(3355443).box(0, 2.4, 0.2, 0.5, 0.4, 0.8, 0, {}));
  for (let i of [-1, 1])
    (e(3355443).box(i * 0.85, 0, 0.3, 0.08, 0.08, 3, 0, {}),
      e(3355443).box(i * 0.85, 0, 0.9, 0.06, 0.6, 0.06, 0, {}),
      e(3355443).box(i * 0.85, 0, -0.5, 0.06, 0.6, 0.06, 0, {}));
  return t.build();
}
var zf,
  o_,
  er = [];
function vMat() {
  let n = new THREE.MeshStandardMaterial({
    vertexColors: !0,
    roughness: 0.35,
    metalness: 0.35,
  });
  return (
    (n.onBeforeCompile = (t) => {
      ((t.vertexShader = t.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aMat;varying float vMat;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vMat=aMat;`,
        )),
        (t.fragmentShader = t.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
varying float vMat;`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
if(vMat>0.5)roughnessFactor=0.05;`,
          )));
    }),
    n
  );
}
var AIRLINES = [
  [1785748, 'SKY BLUE'],
  [13114923, 'RED CRANE'],
  [949345, 'GREEN WING'],
  [15902976, 'SUN AIR'],
];
function initAircraft() {
  ((zf = vMat()), (o_ = vMat()), (er = AIRLINES.map((p) => vR(p[0]))));
  let n = HND.C,
    t = HND.A,
    e = HND.ux,
    i = HND.uz,
    s = -i,
    o = e,
    r = (p, x, m, g, M) => [p.x + e * x + s * m, g, p.z + i * x + o * m, M],
    a = [
      r(n, -1500, 0, 0.3, 10),
      r(n, -1100, 0, 0.3, 40),
      r(n, -300, 0, 0.3, 72),
      r(n, 300, 0, 8, 80),
      r(n, 2600, 300, 220, 90),
      r(n, 4200, 2200, 420, 100),
      r(n, 2500, 5200, 520, 105),
      r(n, -2e3, 5600, 520, 105),
      r(n, -6e3, 3800, 420, 95),
      r(t, -8600, 400, 300, 85),
      r(t, -6500, 0, 200, 78),
      r(t, -3800, 0, 90, 72),
      r(t, -1650, 0, 8, 68),
      r(t, -1200, 0, 0.3, 50),
      r(t, 400, 0, 0.3, 18),
      r(t, 1100, 120, 0.3, 10),
      r(n, 1200, -250, 0.3, 10),
      r(n, 0, -280, 0.3, 10),
      r(n, -1300, -250, 0.3, 10),
      r(n, -1550, -80, 0.3, 8),
    ],
    l = new THREE.CatmullRomCurve3(
      a.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      !0,
      'centripetal',
    ),
    f = 4e3,
    u = [],
    c = 0,
    h = null;
  for (let p = 0; p <= f; p++) {
    let x = p / f,
      m = l.getPoint(x);
    ((m.y = Math.max(0.3, m.y)), h && (c += m.distanceTo(h)));
    let g = x * a.length,
      M = Math.floor(g) % a.length,
      y = (M + 1) % a.length;
    (u.push({
      s: c,
      x: m.x,
      y: m.y,
      z: m.z,
      v: Ee(a[M][3], a[y][3], g - Math.floor(g)),
    }),
      (h = m));
  }
  for (let p = 0; p < 3; p++) {
    let x = new THREE.Mesh(er[p % er.length], zf);
    ((x.castShadow = !0),
      R.scene.add(x),
      G.aircraft.push({
        kind: 'ai',
        m: x,
        tab: u,
        len: c,
        s: (c * p) / 3,
        roll: 0,
        yaw: 0,
      }));
  }
  for (let p = 0; p < 2; p++) {
    let x = new THREE.Mesh(er[(p + 2) % er.length], zf);
    (x.scale.setScalar(1.2),
      R.scene.add(x),
      G.aircraft.push({
        kind: 'cruise',
        m: x,
        ang: p * 2.6,
        alt: 900 + p * 200,
        r: 6e3,
        spd: 0.014 + p * 0.004,
      }));
  }
  for (let p of gatePositions()) {
    let x = G.aircraft.length % er.length,
      m = new THREE.Mesh(er[x], zf);
    (m.position.set(p.x, 0.25, p.z),
      (m.rotation.y = p.yaw),
      (m.castShadow = !0),
      R.scene.add(m),
      G.aircraft.push({
        kind: 'parked',
        m,
        x: p.x,
        y: 0.25,
        z: p.z,
        yaw: p.yaw,
        tail: x,
      }));
  }
  for (let p of [1, 2]) {
    let x = W.hsites && W.hsites['mjet' + p];
    if (!x) continue;
    let m = Math.atan2(HND.uz, -HND.ux),
      g = (p + 1) % er.length,
      M = new THREE.Mesh(er[g], zf);
    (M.position.set(x[0], 0.25, x[1]),
      (M.rotation.y = m),
      (M.castShadow = !0),
      R.scene.add(M),
      G.aircraft.push({
        kind: 'parked',
        m: M,
        x: x[0],
        y: 0.25,
        z: x[1],
        yaw: m,
        tail: g,
      }));
  }
  let d = [
    [fe(35.6375, 139.8275), 1920934, '\u6771\u4EAC\u30D8\u30EA\u30DD\u30FC\u30C8'],
    [fe(35.556, 139.772), 13114923, '\u7FBD\u7530'],
    [fe(35.6896, 139.6917), 15921904, '\u90FD\u5E81\u30D8\u30EA\u30DD\u30FC\u30C8', 243],
  ];
  for (let [p, x, m, g] of d) {
    let M = new THREE.Group(),
      y = new THREE.Mesh(heliGeo(x), o_);
    ((y.castShadow = !0), M.add(y));
    let _ = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.06, 0.35),
      new THREE.MeshStandardMaterial({
        color: 2236962,
      }),
    );
    ((_.position.y = 2.7), M.add(_));
    let v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.2), _.material);
    (v.position.set(0.2, 1.5, -6.1), M.add(v), M.position.set(p[0], g || 0.3, p[1]), R.scene.add(M));
    {
      let b = document.createElement('canvas');
      b.width = b.height = 256;
      let w = b.getContext('2d');
      ((w.fillStyle = '#4a4e54'),
        w.fillRect(0, 0, 256, 256),
        (w.strokeStyle = '#f2f2f2'),
        (w.lineWidth = 10),
        w.beginPath(),
        w.arc(128, 128, 100, 0, 7),
        w.stroke(),
        (w.fillStyle = '#f2f2f2'),
        (w.font = '900 150px Arial'),
        (w.textAlign = 'center'),
        (w.textBaseline = 'middle'),
        w.fillText('H', 128, 136));
      let E = new THREE.CanvasTexture(b);
      E.colorSpace = THREE.SRGBColorSpace;
      let C = new THREE.Mesh(
        new THREE.CircleGeometry(16, 32).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({
          map: E,
          roughness: 0.8,
        }),
      );
      if ((C.position.set(p[0], (g || 0.3) - 0.22, p[1]), (C.receiveShadow = !0), R.scene.add(C), !g)) {
        let S = new THREE.Mesh(
          new THREE.CylinderGeometry(18, 18, 1.2, 32),
          new THREE.MeshStandardMaterial({
            color: 9211795,
            roughness: 0.9,
          }),
        );
        (S.position.set(p[0], (g || 0.3) - 0.85, p[1]), R.scene.add(S));
      }
    }
    G.aircraft.push({
      kind: 'heli',
      m: M,
      rot: _,
      tr: v,
      x: p[0],
      y: g || 0.3,
      z: p[1],
      yaw: 0,
      name: m,
      home: [p[0], g || 0.3, p[1]],
    });
  }
}
function r_(n, t) {
  let e = 0,
    i = n.length - 1;
  for (; e < i;) {
    let a = (e + i + 1) >> 1;
    n[a].s <= t ? (e = a) : (i = a - 1);
  }
  let s = n[e],
    o = n[Math.min(e + 1, n.length - 1)],
    r = o.s > s.s ? (t - s.s) / (o.s - s.s) : 0;
  return {
    x: Ee(s.x, o.x, r),
    y: Ee(s.y, o.y, r),
    z: Ee(s.z, o.z, r),
    v: Ee(s.v, o.v, r),
  };
}
var ks = new THREE.Vector3();
function updAircraft(n, t) {
  for (let e of G.aircraft) {
    if (e.kind === 'ai') {
      let o = r_(e.tab, e.s);
      e.s = (e.s + o.v * n) % e.len;
      let r = r_(e.tab, (e.s + 8) % e.len),
        a = Math.atan2(r.x - o.x, r.z - o.z),
        l = -Math.atan2(r.y - o.y, Math.hypot(r.x - o.x, r.z - o.z)),
        f = ln(a - e.yaw);
      ((e.roll = Ee(e.roll, It((-f / Math.max(n, 0.001)) * 0.9, -0.5, 0.5), Math.min(1, n * 2))),
        (e.yaw = a),
        e.m.position.set(o.x, o.y, o.z),
        (e.m.rotation.order = 'YXZ'),
        e.m.rotation.set(l, a, o.y > 3 ? e.roll : 0),
        (e.x = o.x),
        (e.y = o.y),
        (e.z = o.z),
        (e.v = o.v));
    } else if (e.kind === 'cruise') {
      e.ang += e.spd * n;
      let o = Math.cos(e.ang) * e.r,
        r = Math.sin(e.ang) * e.r - 2e3;
      (e.m.position.set(o, e.alt, r),
        (e.m.rotation.order = 'YXZ'),
        e.m.rotation.set(0, Math.atan2(-Math.sin(e.ang), Math.cos(e.ang)), 0.2),
        (e.x = o),
        (e.y = e.alt),
        (e.z = r));
    } else e.kind === 'heli' && e.rot && ((e.rot.rotation.y += n * (e.spin || 0)), (e.tr.rotation.x += n * (e.spin || 0) * 1.5));
    if (e.kind === 'parked') continue;
    let i = e.m,
      s = (G.t * 1.3 + i.id) % 1 < 0.08;
    if (e.kind !== 'heli' || e.spin) {
      let o = e.kind === 'heli',
        r = o ? 1.3 : 19;
      (ks
        .set(0, o ? 1.6 : 3.5, o ? -6 : -22)
        .applyQuaternion(i.quaternion)
        .add(i.position),
        t.add(ks.x, ks.y, ks.z, 1, 1, 1, s ? (o ? 3 : 10) : o ? 0.8 : 2.5),
        ks
          .set(r, o ? 0.9 : 3, o ? 0 : -8)
          .applyQuaternion(i.quaternion)
          .add(i.position),
        t.add(ks.x, ks.y, ks.z, 1, 0.15, 0.1, o ? 1.4 : 6),
        ks
          .set(-r, o ? 0.9 : 3, o ? 0 : -8)
          .applyQuaternion(i.quaternion)
          .add(i.position),
        t.add(ks.x, ks.y, ks.z, 0.1, 1, 0.3, o ? 1.4 : 6));
    }
  }
}
function groundUnder(n, t, e) {
  let i = [];
  buildingsNear(n, t, 40, i);
  let s = W.bld,
    o = maskQ(n, t) === M_WATER ? -0.6 : 0.2;
  for (let r of G.aircraft)
    r.home && r.kind === 'heli' && Math.hypot(n - r.home[0], t - r.home[2]) < 22 && r.home[1] > o && r.home[1] <= e + 1.5 && (o = r.home[1]);
  for (let r of i) {
    let a = r * 9,
      l = Math.cos(s[a + 2]),
      f = Math.sin(s[a + 2]),
      u = n - s[a],
      c = t - s[a + 1],
      h = u * l + c * f,
      d = -u * f + c * l;
    if (Math.abs(h) < s[a + 3] / 2 && Math.abs(d) < s[a + 4] / 2) {
      let p = s[a + 6] + 0.2;
      if (p <= e + 1.5 && p > o) o = p;
      else if (p > e + 1.5)
        return {
          g: p,
          inside: !0,
        };
    }
  }
  return {
    g: o,
    inside: !1,
  };
}
function startPlane(n) {
  let t = HND.C,
    [e] = runwayEnds(t),
    i = {
      kind: 'plane',
      m: n.m,
      x: e[0] + t.ux * 60,
      y: 0.25,
      z: e[1] + t.uz * 60,
      yaw: Math.atan2(t.ux, t.uz),
      pitch: 0,
      roll: 0,
      v: 0,
      thr: 0,
      gear: !0,
      crashed: !1,
    };
  return ((n.kind = 'player'), i);
}
function startHeli(n) {
  return {
    kind: 'heliP',
    ref: n,
    m: n.m,
    x: n.x,
    y: n.y,
    z: n.z,
    yaw: n.yaw,
    pitch: 0,
    roll: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    crashed: !1,
  };
}
function flyPlane(n, t) {
  let e = G.input;
  n.thr = It(n.thr + (e.thrUp - e.thrDown) * t * 0.6, 0, 1);
  let i = n.y <= 0.6 && !n.crashed,
    s = e.pitch,
    o = e.roll,
    r = e.yaw;
  i
    ? ((n.v += (n.thr * 14 - 0.02 * n.v - (e.brake ? 8 : 0.4)) * t),
      (n.v = Math.max(0, n.v)),
      (n.yaw += r * t * It(n.v / 10, 0, 1) * 0.7 + o * t * It(n.v / 10, 0, 1) * 0.3),
      (n.roll = Ee(n.roll, 0, t * 4)),
      (n.pitch = n.v > 65 ? It(n.pitch + s * t * 0.6, -0.25, 0) : Ee(n.pitch, 0, t * 3)),
      !onRunway(n.x, n.z) && n.v > 25 && ((n.v *= 1 - t * 1.5), (G.cam.shake = 0.3)))
    : ((n.pitch = It(n.pitch + s * t * 0.75, -1.2, 1.2)),
      (n.roll = It(n.roll + o * t * 1.4, -1.3, 1.3)),
      o || (n.roll = Ee(n.roll, 0, t * 0.4)),
      (n.yaw += ((9.8 * Math.tan(n.roll)) / Math.max(40, n.v)) * t * -1 + r * t * 0.15),
      (n.v += (n.thr * 20 - 0.0014 * n.v * n.v + 9.8 * Math.sin(n.pitch)) * t),
      (n.v = Math.max(20, n.v)));
  let a = n.v < 62,
    l = Math.sin(n.yaw) * Math.cos(n.pitch),
    f = Math.cos(n.yaw) * Math.cos(n.pitch),
    c = -Math.sin(n.pitch) * n.v;
  (a && !i && ((c -= (62 - n.v) * 0.6), (n.pitch = Ee(n.pitch, 0.25, t))),
    i && n.v < 65 && (c = Math.max(0, c)),
    (n.x += l * n.v * t),
    (n.z += f * n.v * t),
    (n.y += c * t));
  let h = groundUnder(n.x, n.z, n.y);
  if (h.inside || n.y < h.g - 0.5) return Pf(n);
  if (n.y < 0.25) {
    if (c < -7 || Math.abs(n.roll) > 0.35 || (!onRunway(n.x, n.z) && n.v > 30) || maskQ(n.x, n.z) === M_WATER) return Pf(n);
    n.y = 0.25;
  }
  (n.m.position.set(n.x, n.y, n.z), (n.m.rotation.order = 'YXZ'), n.m.rotation.set(n.pitch, n.yaw, n.roll), (n.alt = n.y), (n.speedKmh = n.v * 3.6));
}
function flyHeli(n, t) {
  let e = G.input,
    i = n.ref;
  ((n.spin = Ee(n.spin, n.crashed ? 0 : 40, t * 0.8)), (i.spin = n.spin));
  let s = n.spin / 40,
    o = e.thrUp - e.thrDown;
  ((n.vy += (o * 9 * s + (s > 0.9 ? 9.8 : 9.8 * s) - 9.8) * t),
    (n.vy *= 1 - t * 1.2),
    (n.pitch = Ee(n.pitch, -e.pitch * 0.35, t * 3)),
    (n.roll = Ee(n.roll, e.roll * 0.35, t * 3)),
    (n.yaw -= e.yaw * t * 1.4 + e.roll * t * 0.4));
  let r = Math.sin(n.yaw),
    a = Math.cos(n.yaw),
    l = -a,
    f = r;
  ((n.vx += (r * -n.pitch * 30 + l * n.roll * 30) * t * s),
    (n.vz += (a * -n.pitch * 30 + f * n.roll * 30) * t * s),
    (n.vx *= 1 - t * 0.35),
    (n.vz *= 1 - t * 0.35),
    (n.x += n.vx * t),
    (n.z += n.vz * t),
    (n.y += n.vy * t));
  let u = groundUnder(n.x, n.z, n.y);
  if (u.inside) {
    if (((n.x -= n.vx * t * 2), (n.z -= n.vz * t * 2), Math.hypot(n.vx, n.vz) > 12)) return Pf(n);
    ((n.vx *= -0.3), (n.vz *= -0.3));
  }
  if (n.y < u.g && (n.vy < -9 || ((n.y = u.g), (n.vy = Math.max(0, n.vy)), (n.vx *= 1 - t * 3), (n.vz *= 1 - t * 3), u.g < 0))) return Pf(n);
  (n.m.position.set(n.x, n.y, n.z),
    (n.m.rotation.order = 'YXZ'),
    n.m.rotation.set(-n.pitch * 0.6, n.yaw, n.roll * 0.6),
    (i.x = n.x),
    (i.y = n.y),
    (i.z = n.z),
    (i.yaw = n.yaw),
    (n.alt = n.y),
    (n.speedKmh = Math.hypot(n.vx, n.vz) * 3.6));
}
function Pf(n) {
  n.crashed ||
    ((n.crashed = !0),
    xt('explode', {
      x: n.x,
      y: Math.max(0, n.y),
      z: n.z,
      big: !0,
    }),
    xt('wasted', '\u589C\u843D\u3057\u305F'));
}
function vo(n, t, e, i, s, o = 0, r = 0) {
  W.lmCol.push({
    x: n,
    z: t,
    w: e,
    d: i,
    h: s,
    rot: o,
    y0: r,
    rad: Math.hypot(e, i) / 2,
  });
}
var xg = new Map();
function nr(n, t, e, i) {
  let s = n + t + e;
  if (xg.has(s)) return xg.get(s);
  let [o, r] = Ne(512, 80);
  (r.scale(0.5, 0.5), (r.fillStyle = e), r.fillRect(0, 0, 1024, 160), (r.fillStyle = i), (r.textAlign = 'center'), (r.textBaseline = 'middle'));
  let a = 74;
  for (r.font = `900 ${a}px ${ce}`; r.measureText(n).width > 980 && a > 20;) ((a -= 4), (r.font = `900 ${a}px ${ce}`));
  (r.fillText(n, 512, t ? 62 : 82), t && ((r.font = `700 30px ${ce}`), r.fillText(t, 512, 128)));
  let l = Fe(o, {
      rep: !1,
    }),
    f = new THREE.MeshStandardMaterial({
      map: l,
      emissive: 16777215,
      emissiveMap: l,
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
    });
  return (LM.emissive.push([f, 1, 0.35]), xg.set(s, f), f);
}
function ir(n, t, e, i, s, o, r) {
  let a = new THREE.Mesh(new THREE.PlaneGeometry(t, e), n);
  (a.position.set(i, s, o), (a.rotation.y = r), R.scene.add(a), LM.meshes.push(a));
}
var Lf = (n, t) => maskQ(n, t) === M_AIR,
  _o = {};
function l_() {
  ((LM.hsites = _o), (W.hsites = _o));
  let n = LM.meshes.length,
    t = new Mt({
      color: !0,
    }),
    e = new Mt({
      color: !0,
    }),
    i = new Mt({
      color: !0,
    }),
    s = new Mt({
      color: !0,
      aB: !0,
    }),
    o = new Mt({
      color: !0,
    }),
    r = new Mt({
      color: !0,
    }),
    a = new Mt({
      color: !0,
    }),
    l = LM.airLights || (LM.airLights = []),
    f = HND.ux,
    u = HND.uz,
    c = -u,
    h = f,
    d = Math.atan2(u, f),
    p = (R, k, P) => [R[0] + f * k + c * P, R[1] + u * k + h * P],
    x = (R, k, P, H) => {
      (R.setColor(H),
        R.quad([k[3][0], P, k[3][1]], [k[2][0], P, k[2][1]], [k[1][0], P, k[1][1]], [k[0][0], P, k[0][1]], [0, 1, 0]),
        R.quad([k[0][0], P, k[0][1]], [k[1][0], P, k[1][1]], [k[2][0], P, k[2][1]], [k[3][0], P, k[3][1]], [0, 1, 0]));
    },
    m = (R, k, P, H, Z, q, G, tt) => x(R, [p(k, P, Z), p(k, H, Z), p(k, H, q), p(k, P, q)], G, tt),
    g = (R, k) => [R[0], k, R[1]],
    M = [];
  for (let R of [HND.A, HND.C, HND.D]) M.push([R.x, R.z, R.len / 2 + 320, R.w / 2 + 200, R.ux, R.uz]);
  for (let R of TERMS) M.push([...p(R.c, 0, R.side * 60), R.L / 2 + 60, R.Wd / 2 + 260, f, u]);
  let y = (R, k, P = 0) =>
      M.some(([H, Z, q, G, tt, K]) => {
        let Y = R - H,
          Q = k - Z;
        return Math.abs(Y * tt + Q * K) < q + P && Math.abs(-Y * K + Q * tt) < G + P;
      }),
    _ = (R, k, P, H) => {
      for (let [Z, q] of [
        [0, 0],
        [-P / 2, -H / 2],
        [P / 2, -H / 2],
        [P / 2, H / 2],
        [-P / 2, H / 2],
      ]) {
        let [G, tt] = p([R, k], Z, q);
        if (!Lf(G, tt)) return !1;
      }
      return !y(R, k, Math.hypot(P, H) * 0.35) && !roadHits(R, k, P, H, d, 3) && !railHits(R, k, P, H, d, 5);
    },
    v = (R, k, P, H, Z = 700) => {
      if (_(R, k, P, H)) return [R, k];
      for (let q = 30; q <= Z; q += 30)
        for (let G = 0; G < 16; G++) {
          let tt = (G / 16) * Math.PI * 2,
            K = R + Math.cos(tt) * q,
            Y = k + Math.sin(tt) * q;
          if (_(K, Y, P, H)) return [K, Y];
        }
      return null;
    },
    b = (R, k, P, H) => M.push([R, k, P / 2 + 25, H / 2 + 25, f, u]),
    w = (R) =>
      Lf(R[0], R[1]) &&
      !TERMS.some((k) => {
        let P = R[0] - k.c[0],
          H = R[1] - k.c[1],
          Z = P * f + H * u,
          q = (P * c + H * h) * k.side;
        return Math.abs(Z) < k.L / 2 + 40 && q > -k.Wd / 2 - 160 && q < k.Wd / 2 + 250;
      }),
    E = (R, k, P) => {
      let H = (q, G) => [R.x + R.ux * q - R.uz * G, R.z + R.uz * q + R.ux * G],
        Z = Math.atan2(R.uz, R.ux);
      for (let q of P) {
        let G = q * (R.w / 2 + k),
          tt = null,
          K = -R.len / 2 - 120,
          Y = R.len / 2 + 120;
        for (let J = K; J <= Y + 0.1; J += 20) {
          let ft = w(H(J, G)) && J < Y;
          if ((ft && tt === null && (tt = J), !ft && tt !== null)) {
            let yt = J - 20;
            if (yt - tt > 60) {
              (x(t, [H(tt, G - 11.5), H(yt, G - 11.5), H(yt, G + 11.5), H(tt, G + 11.5)], 0.2, 4079684),
                x(i, [H(tt, G - 0.25), H(yt, G - 0.25), H(yt, G + 0.25), H(tt, G + 0.25)], 0.22, 15909424));
              for (let zt of [-11, 11])
                x(i, [H(tt, G + zt - 0.15), H(yt, G + zt - 0.15), H(yt, G + zt + 0.15), H(tt, G + zt + 0.15)], 0.22, 15909424);
              for (let zt = tt; zt <= yt; zt += 50)
                for (let At of [-12.5, 12.5]) {
                  let ct = H(zt, G + At);
                  l.push([ct[0], 0.5, ct[1], 0.15, 0.35, 1]);
                }
              for (let zt = tt; zt <= yt; zt += 30) {
                let At = H(zt, G);
                l.push([At[0], 0.35, At[1], 0.2, 0.95, 0.35]);
              }
            }
            tt = null;
          }
        }
        let Q = (J, ft) => {
          let yt = q * (R.w / 2 - 2),
            zt = G,
            At = H((J + ft) / 2, (yt + zt) / 2);
          if (!w(At) || !w(H(ft, zt))) return;
          (x(t, [H(J - 11.5, yt), H(J + 11.5, yt), H(ft + 11.5, zt), H(ft - 11.5, zt)], 0.205, 4079684),
            x(i, [H(J - 0.25, yt), H(J + 0.25, yt), H(ft + 0.25, zt), H(ft - 0.25, zt)], 0.222, 15909424));
          for (let W = 0; W <= 6; W++) {
            let Ct = H(J + ((ft - J) * W) / 6, yt + ((zt - yt) * W) / 6);
            l.push([Ct[0], 0.35, Ct[1], 0.2, 0.95, 0.35]);
          }
          let ct = H(J + (ft - J) * 0.35 + 16, yt + (zt - yt) * 0.35);
          o.setColor(13114923).box(ct[0], 0, ct[1], 3.2, 1.1, 0.4, Z, {});
        };
        (Q(-R.len / 2 + 40, -R.len / 2 + 40), Q(R.len / 2 - 40, R.len / 2 - 40));
        for (let J = -R.len / 2 + 450; J < R.len / 2 - 300; J += 450) Q(J, J + 140);
      }
    };
  (E(HND.A, 170, [-1, 1]), E(HND.C, 170, [-1, 1]), E(HND.D, 150, [-1, 1]));
  for (let R of [HND.A, HND.C, HND.D]) {
    let [k, P] = runwayEnds(R),
      H = Math.atan2(R.uz, R.ux);
    for (let [Z, q] of [
      [k, -1],
      [P, 1],
    ])
      for (let G = -7; G <= 7; G++) {
        let tt = Z[0] + R.ux * q * 280 - R.uz * G * 3.2,
          K = Z[1] + R.uz * q * 280 + R.ux * G * 3.2;
        Lf(tt, K) &&
          (o.setColor(G % 2 ? 14172202 : 15921902).box(tt, 0, K, 0.3, 2.6, 0.3, 0, {}), o.setColor(15921902).box(tt, 2.6, K, 0.12, 0.12, 2.6, H, {}));
      }
    for (let Z of [-1, 1]) {
      let q = -Z * (R.len / 2 - 330),
        G = R.x + R.ux * q + R.uz * 130,
        tt = R.z + R.uz * q - R.ux * 130;
      Lf(G, tt) && (o.setColor(14172202).box(G, 0, tt, 1.2, 9, 1.2, H, {}), o.setColor(15921902).box(G, 9, tt, 2.6, 1.4, 0.4, H, {}));
      for (let K = 0; K < 4; K++)
        l.push([
          R.x + R.ux * q - R.uz * (R.w / 2 + 12 + K * 9),
          0.6,
          R.z + R.uz * q + R.ux * (R.w / 2 + 12 + K * 9),
          1,
          K < 2 ? 1 : 0.2,
          K < 2 ? 1 : 0.15,
        ]);
    }
  }
  for (let R of TERMS) {
    let k = R.side;
    m(t, R.c, -R.L / 2 - 60, R.L / 2 + 60, k > 0 ? R.Wd / 2 : -R.Wd / 2 - 245, k > 0 ? R.Wd / 2 + 245 : -R.Wd / 2, 0.215, 7238262);
    let P = k * (R.Wd / 2 + 108);
    for (let H = -R.L / 2 - 40; H < R.L / 2 + 40; H += 12) m(i, R.c, H, H + 6, P - 0.2, P + 0.2, 0.245, 15921902);
    m(a, R.c, -R.L / 2 - 20, R.L / 2 + 20, k > 0 ? -R.Wd / 2 - 75 : R.Wd / 2, k > 0 ? -R.Wd / 2 : R.Wd / 2 + 75, 0.035, 10657688);
  }
  for (let R of TERMS) {
    let k = R.side,
      P = k * (R.Wd / 2 + 238);
    for (let H = -R.L / 2 - 40; H <= R.L / 2 + 40; H += 130) {
      let [Z, q] = p(R.c, H, P);
      (o.setColor(10133670).cyl(Z, 0, q, 0.45, 26, 8, !0), o.setColor(5922918).box(Z, 26, q, 4.2, 1.2, 1.2, d, {}), vo(Z, q, 1, 1, 26));
      for (let G of [-1.4, 0, 1.4]) l.push([Z + f * G, 25.6, q + u * G, 1, 0.95, 0.85, 12]);
    }
  }
  for (let R of gatePositions()) {
    let k = Math.sin(R.yaw),
      P = Math.cos(R.yaw);
    (x(
      i,
      [
        [R.x - P * 0.3 - k * 60, R.z + k * 0.3 - P * 60],
        [R.x + P * 0.3 - k * 60, R.z - k * 0.3 - P * 60],
        [R.x + P * 0.3 + k * 24, R.z - k * 0.3 + P * 24],
        [R.x - P * 0.3 + k * 24, R.z + k * 0.3 + P * 24],
      ],
      0.245,
      15909424,
    ),
      x(
        i,
        [
          [R.x - P * 3 + k * 21, R.z + k * 3 + P * 21],
          [R.x + P * 3 + k * 21, R.z - k * 3 + P * 21],
          [R.x + P * 3 + k * 21.6, R.z - k * 3 + P * 21.6],
          [R.x - P * 3 + k * 21.6, R.z + k * 3 + P * 21.6],
        ],
        0.245,
        15909424,
      ));
    let H = [R.x + k * 15 + P * 2.9, R.z + P * 15 - k * 2.9],
      Z = H[0] - R.fx,
      q = H[1] - R.fz,
      G = Math.hypot(Z, q);
    if (G > 6 && G < 70) {
      let Y = R.fx + Z / 2,
        Q = R.fz + q / 2,
        J = Math.atan2(q, Z);
      (r.setColor(12633804).box(Y, 3.4, Q, G, 2.9, 3.2, J, {}), o.setColor(4870232).box(Y, 3.35, Q, G + 0.2, 0.1, 3.3, J, {}));
      let ft = H[0] - (Z / G) * 3,
        yt = H[1] - (q / G) * 3;
      (o.setColor(6975606).box(ft, 0, yt, 0.8, 3.4, 0.8, 0, {}),
        o.setColor(2764340).box(ft, 0, yt, 2.6, 0.9, 1.2, J, {}),
        o.setColor(8028294).box(R.fx + (Z / G) * 2, 0, R.fz + (q / G) * 2, 3, 7.5, 3, J, {}),
        l.push([ft, 6.6, yt, 1, 0.85, 0.5]));
    }
    let tt = R.x - P * 15 - k * 8,
      K = R.z + k * 15 - P * 8;
    o.setColor(15909424).box(tt, 0.2, K, 2, 1.3, 3.4, -R.yaw, {});
    for (let Y = 1; Y <= 3; Y++) o.setColor(10133670).box(tt - k * Y * 3.6, 0.2, K - P * Y * 3.6, 1.6, 1.4, 2.8, -R.yaw, {});
  }
  let C = new THREE.MeshStandardMaterial({
      color: 13160148,
      metalness: 0.55,
      roughness: 0.35,
    }),
    S = 0;
  for (let _R3 of TERMS) {
    let k = _R3.side,
      P = Math.atan2(-c * k, -h * k),
      H = Math.atan2(c * k, h * k),
      Z = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, _R3.L + 14, 32, 1, !1, 0, Math.PI), C);
    (Z.rotation.set(0, 0, Math.PI / 2), Z.scale.set(8, 1, _R3.Wd / 2 + 8), (Z.castShadow = !0));
    let q = new THREE.Group();
    (q.add(Z), q.position.set(_R3.c[0], 23.4, _R3.c[1]), (q.rotation.y = -d), R.scene.add(q), LM.meshes.push(q));
    for (let K of [-1, 1]) {
      let [Y, Q] = p(_R3.c, 0, K * (_R3.Wd / 2 + 0.25));
      e.setColor(9418448).box(Y, 0.5, Q, _R3.L - 6, 21, 0.3, d, {});
      for (let J = -_R3.L / 2 + 8; J < _R3.L / 2; J += 16) o.setColor(14869734).box(Y + f * J, 0, Q + u * J, 0.6, 22, 0.7, d, {});
      o.setColor(14869734).box(Y, 10.5, Q, _R3.L - 4, 0.5, 0.8, d, {});
    }
    let G = -k * (_R3.Wd / 2 + 17);
    for (let K = -_R3.L / 2 + 30; K <= _R3.L / 2 - 30; K += 45) {
      let [Y, Q] = p(_R3.c, K, G);
      roadHits(Y, Q, 2, 2, d, 1.5) || (a.setColor(12105908).box(Y, 0, Q, 1.6, 7, 1.6, d, {}), vo(Y, Q, 1.6, 1.6, 7, d));
    }
    {
      let [K, Y] = p(_R3.c, 0, G);
      (a.setColor(10790048).box(K, 7, Y, _R3.L - 40, 1.1, 24, d, {}), o.setColor(4869716).box(K, 8.1, Y, _R3.L - 40, 0.06, 22, d, {}));
      for (let ft of [-12, 12]) {
        let yt = p(_R3.c, 0, G + ft);
        o.setColor(13158596).box(yt[0], 8.1, yt[1], _R3.L - 40, 1.1, 0.4, d, {});
      }
      let [Q, J] = p(_R3.c, 0, -k * (_R3.Wd / 2 + 6));
      r.setColor(15134450).box(Q, 15.5, J, _R3.L - 50, 0.5, 12, d, {});
      for (let ft = -_R3.L / 2 + 40; ft <= _R3.L / 2 - 40; ft += 40) {
        let yt = p(_R3.c, ft, -k * (_R3.Wd / 2 + 11));
        o.setColor(14211806).box(yt[0], 8.2, yt[1], 0.5, 7.3, 0.5, 0, {});
      }
      for (let ft of [-1, 1]) {
        let yt = ft * (_R3.L / 2 - 20),
          zt = ft * (_R3.L / 2 + 70),
          At = 11,
          ct = p(_R3.c, yt, G - At),
          W = p(_R3.c, yt, G + At),
          Ct = p(_R3.c, zt, G + At),
          Rt = p(_R3.c, zt, G - At);
        (a.setColor(10790048),
          a.quad([ct[0], 8.1, ct[1]], [W[0], 8.1, W[1]], [Ct[0], 0.3, Ct[1]], [Rt[0], 0.3, Rt[1]]),
          a.quad([Rt[0], 0.3, Rt[1]], [Ct[0], 0.3, Ct[1]], [W[0], 8.1, W[1]], [ct[0], 8.1, ct[1]]));
        for (let wt of [-1, 1]) {
          let Dt = p(_R3.c, yt, G + wt * At),
            jt = p(_R3.c, zt, G + wt * At);
          (o.setColor(13158596),
            o.quad([Dt[0], 8.1, Dt[1]], [jt[0], 0.3, jt[1]], [jt[0], 1.3, jt[1]], [Dt[0], 9.1, Dt[1]]),
            o.quad([Dt[0], 9.1, Dt[1]], [jt[0], 1.3, jt[1]], [jt[0], 0.3, jt[1]], [Dt[0], 8.1, Dt[1]]));
        }
      }
      for (let ft = -_R3.L / 2 + 50; ft <= _R3.L / 2 - 50; ft += 30) l.push([...g(p(_R3.c, ft, -k * (_R3.Wd / 2 + 6)), 15.1), 1, 0.9, 0.75]);
    }
    let tt = {
      T1: ['\u7FBD\u7530\u7A7A\u6E2F \u7B2C1\u30BF\u30FC\u30DF\u30CA\u30EB', 'HANEDA AIRPORT TERMINAL 1  \u56FD\u5185\u7DDA'],
      T2: ['\u7FBD\u7530\u7A7A\u6E2F \u7B2C2\u30BF\u30FC\u30DF\u30CA\u30EB', 'HANEDA AIRPORT TERMINAL 2  \u56FD\u5185\u7DDA\u30FB\u56FD\u969B\u7DDA'],
      T3: ['\u7FBD\u7530\u7A7A\u6E2F \u7B2C3\u30BF\u30FC\u30DF\u30CA\u30EB', 'HANEDA AIRPORT TERMINAL 3  INTERNATIONAL'],
    }[_R3.id];
    {
      let [K, Y] = p(_R3.c, 0, -k * (_R3.Wd / 2 + 0.7));
      ir(nr(tt[0], tt[1], '#0b2a52', '#ffffff'), 44, 6.9, K, 19.6, Y, P);
    }
    for (let K of [-1, 1]) {
      let [Y, Q] = p(_R3.c, K * _R3.L * 0.3, -k * (_R3.Wd / 2 + 0.7));
      ir(nr(K < 0 ? '\u51FA\u767A DEPARTURES' : '\u5230\u7740 ARRIVALS', '', '#f2c230', '#1a1a1a'), 16, 2.5, Y, 12.4, Q, P);
    }
    {
      let [K, Y] = p(_R3.c, 0, k * (_R3.Wd / 2 + 0.7));
      ir(nr(tt[0], '', '#0b2a52', '#ffffff'), 36, 5.6, K, 17, Y, H);
    }
    for (let K of _R3.piers) {
      let [Y, Q] = p(_R3.c, K, k * (_R3.Wd / 2 + 70));
      (s.setColor([0.6, 0.7, 0.78]),
        (s.bv = [4, 5, 5, 0.75]),
        s.box(Y, 0, Q, 26, 12, 140, d, {}),
        o.setColor(13817562).box(Y, 12, Q, 30, 1, 144, d, {}),
        vo(Y, Q, 26, 140, 13, d));
      let [J, ft] = p(_R3.c, K, k * (_R3.Wd / 2 + 140.4));
      ir(nr(`${_R3.id}  GATE ${++S}`, '', '#1a1a1a', '#f2c230'), 10, 1.6, J, 10, ft, H);
    }
  }
  [
    [TERMS[0], -250],
    [TERMS[0], 250],
    [TERMS[1], -250],
    [TERMS[1], 250],
  ].forEach(([R, k], P) => {
    let H = R.side,
      [Z, q] = p(R.c, k, -H * (R.Wd / 2 + 145)),
      G = (Q, J) => [M_AIR, M_LAND].includes(maskQ(Q, J)) && !roadHits(Q, J, 150, 80, d, 3) && !railHits(Q, J, 150, 80, d, 6),
      tt = G(Z, q);
    for (let Q = 20; !tt && Q <= 200; Q += 20)
      for (let [J, ft] of [
        [Q, 0],
        [-Q, 0],
        [0, -H * Q],
        [Q, -H * Q],
        [-Q, -H * Q],
      ]) {
        let yt = p([Z, q], J, ft);
        if (G(yt[0], yt[1])) {
          (([Z, q] = yt), (tt = !0));
          break;
        }
      }
    if (!tt) return;
    _o['P' + (P + 1)] = [Z, q];
    for (let Q = 0; Q < 6; Q++) {
      if ((a.setColor(12105392).box(Z, Q * 3.2, q, 150, 0.45, 80, d, {}), Q))
        for (let J of [-40, 40]) {
          let ft = p([Z, q], 0, J);
          a.setColor(12894908).box(ft[0], Q * 3.2, ft[1], 150, 1.1, 0.3, d, {});
        }
      for (let J = 0; J < 11; J++)
        for (let ft of [-22, 22])
          if ((J * 7 + Q * 3 + P + (ft > 0 ? 5 : 0)) % 4) {
            let [yt, zt] = p([Z, q], -62 + J * 12.4, ft);
            o.setColor([13843247, 15921902, 1710622, 2779832, 10133670, 3038778][(J + Q * 2 + P + (ft > 0 ? 3 : 0)) % 6]).box(
              yt,
              Q * 3.2 + 0.45,
              zt,
              1.8,
              1.35,
              4.3,
              d,
              {},
            );
          }
    }
    for (let Q = -70; Q <= 70; Q += 35)
      for (let J of [-38, 0, 38]) {
        let [ft, yt] = p([Z, q], Q, J);
        a.setColor(11052704).box(ft, 0, yt, 1.1, 16, 1.1, d, {});
      }
    vo(Z, q, 150, 80, 19, d);
    let [K, Y] = p([Z, q], 0, H * 40.4);
    ir(nr(`P${P + 1} \u99D0\u8ECA\u5834`, 'PARKING', '#1b5fbf', '#ffffff'), 18, 2.8, K, 17.8, Y, Math.atan2(c * H, h * H));
  });
  {
    let R = TERMS[2],
      k = R.side,
      [P, H] = p(R.c, 0, -k * (R.Wd / 2 + 150)),
      Z = (G, tt) => [M_AIR, M_LAND].includes(maskQ(G, tt)) && !roadHits(G, tt, 72, 26, d, 3) && !railHits(G, tt, 72, 26, d, 6),
      q = null;
    for (let G = 0; !q && G <= 300; G += 20)
      for (let [tt, K] of [
        [G, 0],
        [-G, 0],
        [0, -k * G],
        [G, -k * G],
        [-G, -k * G],
      ]) {
        let Y = p([P, H], tt, K);
        if (Z(Y[0], Y[1])) {
          q = Y;
          break;
        }
      }
    if (q) {
      let [G, tt] = q;
      ((_o.hotel = q), s.setColor([0.8, 0.76, 0.7]), (s.bv = [3, 17, 3.4, 0.6]), s.box(G, 0, tt, 72, 46, 26, d, {}), vo(G, tt, 72, 26, 46, d));
      let [K, Y] = p([G, tt], 0, k * 13.3);
      (ir(
        nr('\u7FBD\u7530\u30A8\u30A2\u30DD\u30FC\u30C8\u30DB\u30C6\u30EB', 'HANEDA AIRPORT HOTEL', '#2a2420', '#f2e6c8'),
        30,
        4.6,
        K,
        42,
        Y,
        Math.atan2(c * k, h * k),
      ),
        b(G, tt, 72, 26));
    }
  }
  let D = new THREE.MeshStandardMaterial({
    color: 15001320,
    metalness: 0.35,
    roughness: 0.5,
  });
  {
    let _R4 = v(...fe(35.556, 139.764), 640, 100, 900);
    if (_R4) {
      ((_o.mnt = _R4), b(_R4[0], _R4[1], 640, 140), m(t, _R4, -320, 320, 45, 150, 0.21, 7238262));
      for (let k = 0; k < 4; k++) {
        let [P, H] = p(_R4, (k - 1.5) * 155, 0);
        (s.setColor([0.86, 0.87, 0.88]), (s.bv = [2, 3, 6, 0.9]), s.box(P, 0, H, 124, 22, 90, d, {}));
        let Z = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 90, 24, 1, !1, 0, Math.PI), D);
        (Z.rotation.set(0, 0, Math.PI / 2), Z.scale.set(13, 1, 62), (Z.castShadow = !0));
        let q = new THREE.Group();
        (q.add(Z), q.position.set(P, 22, H), (q.rotation.y = -d - Math.PI / 2), R.scene.add(q), LM.meshes.push(q), vo(P, H, 124, 90, 35, d));
        let [G, tt] = p([P, H], 0, 45.25);
        o.setColor(7238778).box(G, 0, tt, 108, 20, 0.4, d, {});
        for (let Q = -6; Q <= 6; Q++) o.setColor(5133402).box(G + f * Q * 9, 0, tt + u * Q * 9, 0.3, 20, 0.6, d, {});
        (k === 1 || k === 2) && (_o['mjet' + k] = p([P, H], 0, 92));
        let [K, Y] = p([P, H], 0, 45.6);
        ir(nr(`\u6574\u5099\u30CF\u30F3\u30AC\u30FC ${k + 1}`, 'MAINTENANCE BASE', '#ffffff', '#1d2c4a'), 36, 5.6, K, 24.5, Y, Math.atan2(c, h));
      }
    }
  }
  {
    let R = v(...fe(35.542, 139.763), 520, 70, 900);
    if (R) {
      ((_o.cargo = R), b(R[0], R[1], 520, 130), m(t, R, -270, 270, 30, 110, 0.21, 7238262));
      for (let k = 0; k < 3; k++) {
        let [P, H] = p(R, (k - 1) * 175, 0);
        (s.setColor([0.72, 0.74, 0.76]), (s.bv = [2, 21, 5, 0.85]), s.box(P, 0, H, 160, 15, 60, d, {}), vo(P, H, 160, 60, 15, d));
        for (let G = -6; G <= 6; G++) {
          let [tt, K] = p([P, H], G * 12, 30.25);
          o.setColor(3817286).box(tt, 0, K, 7, 5, 0.4, d, {});
        }
        let [Z, q] = p([P, H], 0, 30.5);
        ir(nr('\u56FD\u969B\u8CA8\u7269\u5730\u533A', 'HANEDA CARGO', '#3a3f46', '#ffd23f'), 26, 4, Z, 11.5, q, Math.atan2(c, h));
        for (let G = 0; G < 8; G++) {
          let [tt, K] = p([P, H], -60 + G * 16, 60 + (G % 2) * 14);
          (o.setColor([12076334, 3043e3, 3836490, 14196784][G % 4]).box(tt, 0.2, K, 12, 2.6, 2.5, d, {}),
            G % 3 === 0 && o.setColor([3043e3, 12076334][G % 2]).box(tt, 2.8, K, 12, 2.6, 2.5, d, {}));
        }
      }
    }
  }
  {
    let R = v(...fe(35.56, 139.769), 140, 100, 900);
    if (R) {
      ((_o.fuel = R), b(R[0], R[1], 140, 100), m(a, R, -75, 75, -55, 55, 0.04, 10131600));
      for (let k = 0; k < 6; k++) {
        let [P, H] = p(R, (k % 3) * 44 - 44, Math.floor(k / 3) * 44 - 22);
        (o.setColor(15658730).cyl(P, 0, H, 15, 14, 28),
          o.setColor(13158596).cyl(P, 14, H, 15.2, 0.6, 28),
          o.setColor(8028294).box(P, 14.6, H, 1.2, 1, 1.2, 0, {}),
          vo(P, H, 30, 30, 15));
      }
      for (let k of [-56, 56]) {
        let P = p(R, 0, k);
        o.setColor(9079430).box(P[0], 0, P[1], 150, 1.4, 0.3, d, {});
      }
    }
  }
  {
    let _R5 = v(...fe(35.5545, 139.788), 14, 14, 500);
    if (_R5) {
      let [k, P] = _R5;
      ((_o.radar = _R5), a.setColor(14211284).cyl(k, 0, P, 3, 26, 12));
      let H = new THREE.Mesh(
        new THREE.SphereGeometry(7.5, 20, 14),
        new THREE.MeshStandardMaterial({
          color: 16053488,
          roughness: 0.6,
        }),
      );
      (H.position.set(k, 32, P), (H.castShadow = !0), R.scene.add(H), LM.meshes.push(H), vo(k, P, 6, 6, 26), LM.av.push([k, 40, P]), b(k, P, 20, 20));
    }
  }
  {
    let R = v(...fe(35.547, 139.776), 64, 30, 700);
    if (R) {
      let [k, P] = R;
      ((_o.fire = R),
        b(k, P, 64, 30),
        s.setColor([0.82, 0.22, 0.18]),
        (s.bv = [2, 9, 4, 0.7]),
        s.box(k, 0, P, 64, 11, 30, d, {}),
        vo(k, P, 64, 30, 11, d));
      for (let q = -2; q <= 2; q++) {
        let [G, tt] = p([k, P], q * 12, 15.25);
        o.setColor(15263972).box(G, 0, tt, 9, 7, 0.4, d, {});
      }
      for (let q = -1; q <= 1; q++) {
        let [G, tt] = p([k, P], q * 14, 28);
        (o.setColor(13901342).box(G, 0.3, tt, 4.2, 3.4, 11, d + Math.PI / 2, {}),
          o.setColor(15921902).box(G, 3.7, tt, 2.2, 0.6, 7, d + Math.PI / 2, {}));
      }
      let [H, Z] = p([k, P], 0, 15.5);
      ir(nr('\u7FBD\u7530\u7A7A\u6E2F \u6D88\u9632\u6240', 'AIRPORT FIRE STATION', '#c81e2b', '#ffffff'), 22, 3.4, H, 9.2, Z, Math.atan2(c, h));
    }
  }
  for (let R of [HND.A, HND.C, HND.D]) {
    let [k] = runwayEnds(R),
      P = k[0] + R.ux * 300 + R.uz * 110,
      H = k[1] + R.uz * 300 - R.ux * 110;
    if (Lf(P, H)) {
      o.setColor(15263972).box(P, 0, H, 0.3, 7, 0.3, 0, {});
      for (let Z = 0; Z < 4; Z++) o.setColor(Z % 2 ? 15921902 : 15751710).box(P + 0.6 + Z * 0.9, 6.2, H, 0.9, 0.9 - Z * 0.12, 0.9 - Z * 0.12, 0, {});
    }
  }
  let O = (_R6, k, P) => {
      if (!_R6.count) return;
      let H = new THREE.Mesh(_R6.build(), k);
      ((H.castShadow = !!P), (H.receiveShadow = !0), R.scene.add(H), LM.meshes.push(H));
    },
    U = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      roughness: 0.15,
      metalness: 0.6,
      emissive: 16772300,
      emissiveIntensity: 0,
    });
  (LM.emissive.push([U, 1.5, 0]),
    O(e, U, !1),
    O(a, R.M.paint, !0),
    O(t, R.M.road, !1),
    O(i, R.M.mark, !1),
    O(s, R.M.building, !0),
    O(o, R.M.paint, !0),
    O(r, R.M.metal, !0));
  let B = 0;
  for (let R of LM.meshes.slice(n))
    R.traverse((k) => {
      k.geometry && (B += k.geometry.attributes.position.count);
    });
  console.log('haneda verts', B);
}
function En(n, t, e, i, s, o = 0, r = 0) {
  W.lmCol.push({
    x: n,
    z: t,
    w: e,
    d: i,
    h: s,
    rot: o,
    y0: r,
    rad: Math.hypot(e, i) / 2,
  });
}
function gg(n, t, e, i, s, o = 0) {
  roadHits(n, t, e, i, o, 0.5) || En(n, t, e, i, s, o);
}
function Za(n, t, e, i, s) {
  let o = [];
  buildingsNear(n, t, Math.hypot(e, i) / 2 + 40, o);
  let r = W.bld,
    a = Math.cos(s),
    l = Math.sin(s);
  for (let f of o) {
    let u = f * 9;
    if (r[u + 6] < 1) continue;
    let c = r[u] - n,
      h = r[u + 1] - t,
      d = c * a + h * l,
      p = -c * l + h * a,
      x = Math.max(r[u + 3], r[u + 4]) / 2;
    Math.abs(d) < e / 2 + x && Math.abs(p) < i / 2 + x && clearBuilding(u);
  }
}
function c_(n, t, e) {
  let i = [];
  buildingsNear(n, t, e + 40, i);
  let s = W.bld;
  for (let o of i) {
    let r = o * 9;
    s[r + 6] >= 1 && Math.hypot(s[r] - n, s[r + 1] - t) < e + Math.max(s[r + 3], s[r + 4]) / 2 && clearBuilding(r);
  }
}
var Mg = new Map();
function Or(n, t, e, i) {
  let s = n + t + e;
  if (Mg.has(s)) return Mg.get(s);
  let [o, r] = Ne(512, 80);
  (r.scale(0.5, 0.5), (r.fillStyle = e), r.fillRect(0, 0, 1024, 160), (r.fillStyle = i), (r.textAlign = 'center'), (r.textBaseline = 'middle'));
  let a = 74;
  for (r.font = `900 ${a}px ${ce}`; r.measureText(n).width > 980 && a > 20;) ((a -= 4), (r.font = `900 ${a}px ${ce}`));
  (r.fillText(n, 512, t ? 62 : 82), t && ((r.font = `700 30px ${ce}`), r.fillText(t, 512, 128)));
  let l = Fe(o, {
      rep: !1,
    }),
    f = new THREE.MeshStandardMaterial({
      map: l,
      emissive: 16777215,
      emissiveMap: l,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    });
  return (LM.emissive.push([f, 1, 0.3]), Mg.set(s, f), f);
}
function Hr(n, t, e, i, s, o, r) {
  let a = new THREE.Mesh(new THREE.PlaneGeometry(t, e), n);
  (a.position.set(i, s, o), (a.rotation.y = r), R.scene.add(a), LM.meshes.push(a));
}
var Bp = (n) => {
    let t = W.landmarks[n];
    return t ? [t.x, t.z] : null;
  },
  _R = (n, t, e, i = 0, s = 160) => {
    let o = W.landmarks[n];
    if (!o) return null;
    let r = freeSpot(o.x, o.z, t, e, i, s, 8);
    return (r && ((o.x = r[0]), (o.z = r[1])), [o.x, o.z]);
  };
function yg(n, t, e = 120) {
  let i = [];
  roadsNear(n, t, e, i);
  let s = null;
  for (let r of i) !r.e.elev && (!s || r.d < s.d) && (s = r);
  if (!s) return 0;
  let o = edgePos(s.e, s.s, {});
  return Math.atan2(o.dz, o.dx);
}
function bg(n) {
  let t = (W.sites || []).find((o) => o.key === n);
  if (!t) return null;
  let e = t.rot,
    i = t.w,
    s = t.d;
  return (
    i < s && ((e += Math.PI / 2), ([i, s] = [s, i])),
    {
      x: t.x,
      z: t.z,
      w: i,
      d: s,
      rot: e,
    }
  );
}
var T0 = (n, t, e, i) => {
    let s = bg(n);
    if (s) return [s.rot, s.x, s.z];
    let o = yg(...Bp(n)),
      r = _R(n, t, e, o, i);
    return [o, r[0], r[1]];
  },
  Df = (n, t) => {
    let e = Math.sin(n * 12.9898 + t * 78.233) * 43758.5453;
    return e - Math.floor(e);
  };
function f_() {
  if (!W.landmarks.landmarkTower) return;
  let n = new Mt({
      color: !0,
      aB: !0,
    }),
    t = new Mt({
      color: !0,
    }),
    e = new Mt({
      color: !0,
    }),
    i = new Mt({
      color: !0,
    }),
    s = new Mt({
      color: !0,
    }),
    o = new Mt({
      color: !0,
    }),
    r = LM.airLights || (LM.airLights = []);
  LM.spin = LM.spin || [];
  let a = (m, g, M) => {
      let y = Math.cos(M),
        _ = Math.sin(M);
      return (v, b) => [m + y * v - _ * b, g + _ * v + y * b];
    },
    l = (m, g, M, y, _, v) => {
      let b = g(-M / 2, -y / 2),
        w = g(M / 2, -y / 2),
        E = g(M / 2, y / 2),
        C = g(-M / 2, y / 2);
      (m.setColor(v), m.quad([C[0], _, C[1]], [E[0], _, E[1]], [w[0], _, w[1]], [b[0], _, b[1]], [0, 1, 0]));
    };
  {
    let [m, g, M] = T0('landmarkTower', 58, 58);
    Za(g, M, 90, 90, m);
    let y = a(g, M, m);
    (n.setColor([0.78, 0.74, 0.66]), (n.bv = [3, 31, 4, 0.55]), n.box(g, 0, M, 88, 16, 72, m, {}), En(g, M, 88, 72, 16, m));
    let _ = [
      [0, 140, 52],
      [140, 215, 48],
      [215, 258, 42],
      [258, 282, 34],
      [282, 296, 24],
    ];
    for (let [w, E, C] of _)
      (n.setColor([0.82, 0.8, 0.74]),
        (n.bv = [4, 17, 4, 0.7]),
        n.box(g, Math.max(w, 16), M, C, E - Math.max(w, 16), C, m, {}),
        t.setColor(6975090).box(g, E - 1.2, M, C + 0.8, 1.2, C + 0.8, m, {}));
    (e.setColor(3817544).box(g, 268, M, 43, 5, 43, m, {}),
      s.setColor(16769184).box(g, 269.5, M, 43.4, 1.2, 43.4, m, {}),
      En(g, M, 52, 52, 296, m),
      LM.av.push([g, 298, M]));
    let [v, b] = y(0, 36.2);
    Hr(
      Or('\u6A2A\u6D5C\u30E9\u30F3\u30C9\u30DE\u30FC\u30AF\u30BF\u30EF\u30FC', 'YOKOHAMA LANDMARK TOWER', '#1d2c4a', '#ffffff'),
      22,
      3.4,
      v,
      11,
      b,
      -m,
    );
  }
  {
    let [m, g, M] = T0('queensSquare', 150, 40);
    Za(g, M, 160, 50, m);
    let y = a(g, M, m);
    (n.setColor([0.66, 0.72, 0.78]),
      (n.bv = [4, 23, 4, 0.75]),
      n.box(g, 0, M, 156, 18, 44, m, {}),
      En(g, M, 156, 44, 18, m),
      [
        [-52, 172],
        [0, 138],
        [52, 110],
      ].forEach(([_, v], b) => {
        let [w, E] = y(_, 0);
        (n.setColor([0.6 + b * 0.03, 0.68, 0.76]),
          (n.bv = [4, 41 + b, 4, 0.8]),
          n.box(w, 18, E, 40, v - 18, 34, m, {}),
          t.setColor(10134702).gable(w, v, E, 40, 34, 9, m),
          En(w, E, 40, 34, v, m));
      }));
  }
  {
    let m = bg('cosmoClock'),
      g,
      M,
      y;
    if (m) ((g = m.x), (M = m.z), (y = m.rot));
    else {
      let [k, P] = Bp('cosmoClock');
      ((g = k), (M = P));
      let H = freeSpot(k, P, 110, 26, 0, 160, 8);
      (H && ((g = H[0]), (M = H[1])), (y = yg(g, M)));
    }
    ((W.landmarks.cosmoClock.x = g), (W.landmarks.cosmoClock.z = M), c_(g, M, 62));
    let _ = y,
      v = Math.cos(_),
      b = Math.sin(_),
      w = 50,
      E = 60;
    for (let k of [-1, 1])
      for (let P of [-1, 1]) {
        let H = g + v * P * 30 - b * k * 7,
          Z = M + b * P * 30 + v * k * 7,
          q = Math.hypot(30, E),
          G = [(H + g - b * k * 4) / 2, (Z + M + v * k * 4) / 2],
          tt = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, q, 2.2),
            new THREE.MeshStandardMaterial({
              color: 14672870,
              metalness: 0.5,
              roughness: 0.4,
            }),
          );
        (tt.position.set(G[0], E / 2, G[1]),
          tt.lookAt(g - b * k * 4, E, M + v * k * 4),
          tt.rotateX(Math.PI / 2),
          R.scene.add(tt),
          LM.meshes.push(tt),
          En(H, Z, 2.5, 2.5, 20));
      }
    let C = new THREE.Group();
    (C.position.set(g, E, M), (C.rotation.y = -_));
    let S = new THREE.Group();
    C.add(S);
    let T = new THREE.MeshStandardMaterial({
      color: 15265007,
      metalness: 0.5,
      roughness: 0.35,
      emissive: 5818623,
      emissiveIntensity: 0,
    });
    LM.emissive.push([T, 1.4, 0]);
    for (let k of [-3.5, 3.5]) {
      let P = new THREE.Mesh(new THREE.TorusGeometry(w, 0.7, 6, 72), T);
      ((P.position.z = k), S.add(P));
    }
    let D = new Mt({
      color: !0,
    });
    for (let k = 0; k < 30; k++) {
      let P = (k / 30) * Math.PI * 2;
      for (let H of [-3.5, 3.5]) {
        D.setColor(14212578);
        let Z = Math.cos(P) * w,
          q = Math.sin(P) * w,
          G = [-Math.sin(P) * 0.15, Math.cos(P) * 0.15];
        (D.quad([G[0], G[1], H], [Z + G[0], q + G[1], H], [Z - G[0], q - G[1], H], [-G[0], -G[1], H], [0, 0, 1]),
          D.quad([-G[0], -G[1], H], [Z - G[0], q - G[1], H], [Z + G[0], q + G[1], H], [G[0], G[1], H], [0, 0, -1]));
      }
    }
    for (let k = 0; k < 60; k++) {
      let P = (k / 60) * Math.PI * 2;
      D.setColor([15921902, 15227530, 5814504, 15909424][k % 4]).box(Math.cos(P) * (w + 1.5), Math.sin(P) * (w + 1.5) - 1.3, 0, 2.2, 2.6, 2.6, P, {});
    }
    let O = new THREE.Mesh(D.build(), R.M.paint);
    S.add(O);
    let U = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 9, 16).rotateX(Math.PI / 2), T);
    (S.add(U), (S.userData.w = 0.025), LM.spin.push(S), R.scene.add(C), LM.meshes.push(C));
    let [B, _R7] = [g - b * 10, M + v * 10];
    Hr(
      Or('\u3088\u3053\u306F\u307E\u30B3\u30B9\u30E2\u30EF\u30FC\u30EB\u30C9', 'COSMO CLOCK 21', '#e85a8a', '#ffffff'),
      14,
      2.2,
      B,
      4,
      _R7,
      Math.atan2(-b, v),
    );
  }
  {
    let [m, g, M] = T0('redBrick', 160, 100, 200);
    Za(g, M, 170, 110, m);
    let y = a(g, M, m);
    l(i, y, 170, 110, 0.07, 12101776);
    for (let b of [-34, 34]) {
      let [w, E] = y(0, b);
      (n.setColor([0.62, 0.3, 0.2]),
        (n.bv = [2, 7, 4.4, 0.35]),
        n.box(w, 0, E, 150, 17, 22, m, {}),
        t.setColor(5922402).gable(w, 17, E, 152, 23, 3, m),
        En(w, E, 150, 22, 18, m));
      for (let C of [-75, 75]) {
        let [S, T] = y(C, b);
        (n.box(S, 0, T, 8, 22, 8, m, {}), t.setColor(4870744).box(S, 22, T, 9, 1.2, 9, m, {}));
      }
      for (let C = -70; C <= 70; C += 14)
        for (let S of [-1, 1]) {
          let [T, D] = y(C, b + S * 11.2);
          s.setColor(16763e3).box(T, 3.5, D, 2, 2.6, 0.1, m, {});
        }
    }
    let [_, v] = y(0, 0);
    Hr(Or('\u6A2A\u6D5C\u8D64\u30EC\u30F3\u30AC\u5009\u5EAB', 'YOKOHAMA RED BRICK WAREHOUSE', '#7a2a1a', '#fff4d8'), 18, 2.8, _, 3.4, v, -m);
    for (let b = -60; b <= 60; b += 30) {
      let [w, E] = y(b, 0);
      (e.setColor(2764340).cyl(w, 0, E, 0.12, 4.5, 6, !1), r.push([w, 4.7, E, 1, 0.85, 0.6, 5]));
    }
  }
  {
    let m = bg('osanbashi'),
      g = fe(35.4505, 139.6458),
      M = fe(35.4544, 139.6512),
      y = m ? Math.min(420, m.w - 10) : 420,
      _ = m ? m.rot : Math.atan2(M[1] - g[1], M[0] - g[0]),
      v = m ? m.x : (g[0] + M[0]) / 2,
      b = m ? m.z : (g[1] + M[1]) / 2,
      w = a(v, b, _);
    (Za(v, b, y, 110, _), (W.landmarks.osanbashi.x = v), (W.landmarks.osanbashi.z = b), l(i, w, y, 110, 0.08, 9079430));
    let E = (G, tt) => {
      for (let K = 30; K < 260; K += 5) {
        let Y = !0;
        for (let Q of [-tt, 0, tt]) isWaterAt(...w(Q, G * K)) || (Y = !1);
        if (Y) return K;
      }
      return null;
    };
    (t.setColor(10133668).box(v, 0, b, y - 20, 8, 60, _, {}), gg(v, b, y - 20, 60, 8, _));
    for (let G = -y / 2 + 20; G < y / 2 - 20; G += 16) {
      let [tt, K] = w(G, 0),
        Y = 8 + Math.sin(G / 30) * 2.2;
      if ((o.setColor(G % 32 ? 10123861 : 9071690).box(tt, 8, K, 16, Y - 8 + 0.6, 58, _, {}), ((G / 16) | 0) % 3 === 0)) {
        let [Q, J] = w(G, 18);
        t.setColor(6986314).box(Q, Y, J, 16, 0.3, 16, _, {});
      }
    }
    for (let G = -y / 2 + 30; G < y / 2 - 20; G += 40)
      for (let tt of [-1, 1]) {
        let [K, Y] = w(G, tt * 29);
        r.push([K, 9.5, Y, 1, 0.9, 0.7, 5]);
      }
    let C = 240,
      S = 32,
      T = E(1, C / 2),
      D = E(-1, C / 2),
      O = T !== null && (D === null || T <= D) ? 1 : -1,
      U = (O > 0 ? T : D) ?? 100,
      B = U + S / 2 + 2,
      [_R8, k] = w(10, O * B),
      P = new Mt({
        color: !0,
      });
    (P.setColor(16053488).box(0, 0, 0, C, 14, S, 0, {}), P.setColor(1915498).box(0, 0, 0, C + 0.4, 3, S + 0.4, 0, {}));
    for (let G = 0; G < 6; G++) {
      P.setColor(G % 2 ? 15265008 : 16316662).box(-10 + G * 2, 14 + G * 4, 0, C * (0.82 - G * 0.08), 4, S - 3 - G * 1.5, 0, {});
      for (let tt of [-1, 1]) P.setColor(3824266).box(-10 + G * 2, 15.2 + G * 4, (tt * (S - 3 - G * 1.5)) / 2, C * (0.8 - G * 0.08), 1.2, 0.2, 0, {});
    }
    (P.setColor(1915498).box(-60, 38, 0, 14, 12, 10, 0, {}), P.setColor(16053488).box(C / 2 - 6, 0, 0, 12, 18, S - 6, 0, {}));
    let H = new THREE.Mesh(P.build(), R.M.paint);
    (H.position.set(_R8, -3, k), (H.rotation.y = -_), (H.castShadow = !0), R.scene.add(H), LM.meshes.push(H), gg(_R8, k, C, S, 50, _));
    for (let G = 0; G < 18; G++) {
      let [tt, K] = w(10 - C / 2 + (G * C) / 17, O * (B - S / 2));
      r.push([tt, 20 + (G % 3) * 4, K, 1, 0.92, 0.75, 4]);
    }
    let [Z, q] = w(-y / 2 + 14, 0);
    Hr(
      Or('\u6A2A\u6D5C\u6E2F\u5927\u3055\u3093\u6A4B\u56FD\u969B\u5BA2\u8239\u30BF\u30FC\u30DF\u30CA\u30EB', 'OSANBASHI PIER', '#1d4f7a', '#ffffff'),
      18,
      2.8,
      Z,
      5,
      q,
      Math.atan2(-Math.cos(_), -Math.sin(_)),
    );
  }
  {
    let m = fe(35.4486, 139.6492),
      g = fe(35.4461, 139.6537),
      M = Math.atan2(g[1] - m[1], g[0] - m[0]),
      y = (m[0] + g[0]) / 2,
      _ = (m[1] + g[1]) / 2,
      v = a(y, _, M),
      b = 163,
      w = 20,
      E = (H) => {
        for (let Z = 8; Z < 200; Z += 4) if ([-b / 2, 0, b / 2].every((q) => isWaterAt(...v(q, H * Z)))) return Z;
        return null;
      },
      C = E(1),
      S = E(-1),
      T = C !== null && (S === null || C <= S) ? 1 : -1,
      D = ((T > 0 ? C : S) ?? 20) + w / 2 + 2,
      [O, U] = v(0, T * D),
      B = new Mt({
        color: !0,
      });
    (B.setColor(1710622).box(0, 0, 0, b, 10, w, 0, {}),
      B.setColor(11545122).box(0, 0, 0, b + 0.3, 2.4, w + 0.3, 0, {}),
      B.setColor(15921902).box(0, 9.6, 0, b + 0.2, 0.5, w + 0.2, 0, {}),
      B.setColor(15921384).box(-6, 10, 0, 70, 5, w - 3, 0, {}),
      B.box(-4, 15, 0, 46, 4, w - 6, 0, {}),
      B.box(2, 19, 0, 16, 4, w - 8, 0, {}),
      B.setColor(15253568).box(-6, 23, 0, 7, 9, 6, 0, {}),
      B.setColor(1710622).box(-6, 32, 0, 7.2, 2, 6.2, 0, {}));
    for (let H of [-50, 40]) B.setColor(9071178).box(H, 10, 0, 0.6, 26, 0.6, 0, {});
    let _R9 = new THREE.Mesh(B.build(), R.M.paint);
    (_R9.position.set(O, -2.5, U), (_R9.rotation.y = -M), (_R9.castShadow = !0), R.scene.add(_R9), LM.meshes.push(_R9), gg(O, U, b, w, 30, M));
    for (let H = 0; H < 14; H++) {
      let Z = H / 13,
        [q, G] = v(-b / 2 + Z * b, T * D);
      r.push([q, 34 - Math.abs(Z - 0.45) * 40, G, 1, 0.9, 0.6, 4]);
    }
    let [k, P] = v(-20, T * (D - w / 2 - 6));
    Hr(Or('\u6C37\u5DDD\u4E38', 'HIKAWA MARU', '#1a1a1e', '#f2f2ee'), 8, 1.4, k, 1.6, P, Math.atan2(T * Math.sin(M), -T * Math.cos(M)));
  }
  {
    let [, m, g] = T0('marineTower', 22, 22, 80);
    c_(m, g, 22);
    let M = wR(),
      y = new THREE.MeshStandardMaterial({
        color: 14212578,
        map: M,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        metalness: 0.4,
        roughness: 0.4,
        emissive: 16734778,
        emissiveIntensity: 0,
      });
    LM.emissive.push([y, 0.9, 0]);
    let _ = new THREE.Group(),
      v = [
        [0, 12],
        [30, 7.5],
        [70, 5],
        [94, 4.2],
      ];
    for (let C = 1; C < v.length; C++) {
      let [S, T] = v[C - 1],
        [D, O] = v[C],
        U = D - S,
        B = new THREE.CylinderGeometry(O, T, U, 10, 1, !0),
        R = B.attributes.uv;
      for (let P = 0; P < R.count; P++) R.setXY(P, R.getX(P) * 10, R.getY(P) * Math.max(1, Math.round(U / 4)));
      let k = new THREE.Mesh(B, y);
      ((k.position.y = S + U / 2), _.add(k));
    }
    let b = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 6.5, 8, 20),
      new THREE.MeshStandardMaterial({
        color: 12572906,
        metalness: 0.6,
        roughness: 0.1,
        emissive: 16769200,
        emissiveIntensity: 0,
      }),
    );
    ((b.position.y = 98), _.add(b), LM.emissive.push([b.material, 0.8, 0]));
    let w = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 8.5, 4, 20),
      new THREE.MeshStandardMaterial({
        color: 13159632,
        metalness: 0.5,
      }),
    );
    ((w.position.y = 104), _.add(w));
    let E = new THREE.Mesh(
      new THREE.BoxGeometry(30, 9, 30),
      new THREE.MeshStandardMaterial({
        color: 14210252,
        roughness: 0.8,
      }),
    );
    ((E.position.y = 4.5),
      _.add(E),
      _.position.set(m, 0, g),
      _.traverse((C) => {
        C.isMesh && (C.castShadow = !0);
      }),
      R.scene.add(_),
      LM.meshes.push(_),
      En(m, g, 30, 30, 9),
      En(m, g, 14, 14, 106),
      LM.av.push([m, 107, g]));
  }
  {
    let [m, g] = Bp('chinatown'),
      M = [
        ['\u5584\u96A3\u9580', 0, -1],
        ['\u671D\u967D\u9580', 230, 0],
        ['\u7384\u6B66\u9580', 0, -170],
        ['\u6731\u96C0\u9580', 40, 150],
        ['\u5EF6\u5E73\u9580', -200, 20],
        ['\u5929\u9577\u9580', 120, -60],
      ];
    for (let [S, T, D] of M) {
      let O = [];
      roadsNear(m + T, g + D, 70, O);
      let U = null;
      for (let q of O) !q.e.elev && q.e.kind !== 'A' && (!U || q.d < U.d) && (U = q);
      if (!U) continue;
      let B = edgePos(U.e, U.s, {}),
        R = B.dz,
        k = -B.dx,
        P = U.e.hw + 1.6,
        H = Math.atan2(k, R);
      for (let q of [-1, 1]) {
        let G = B.x + R * P * q,
          tt = B.z + k * P * q;
        (t.setColor(13114910).box(G, 0, tt, 1.1, 10, 1.1, 0, {}), t.setColor(15253568).box(G, 0, tt, 1.6, 1, 1.6, 0, {}), En(G, tt, 1.2, 1.2, 10));
      }
      (t.setColor(13114910).box(B.x, 7.6, B.z, P * 2 + 2, 1.2, 0.9, H, {}),
        t.setColor(2062922).box(B.x, 8.8, B.z, P * 2 + 3, 1.6, 1.4, H, {}),
        t.setColor(15253568).box(B.x, 10.4, B.z, P * 2 + 4, 0.4, 2.6, H, {}),
        t.setColor(2054714).gable(B.x, 10.8, B.z, P * 2 + 5, 3.4, 1.8, H));
      let Z = Or(S, 'YOKOHAMA CHINATOWN', '#1f5a3a', '#f2d060');
      for (let q of [1, -1]) Hr(Z, 4.2, 1.1, B.x + B.dx * 0.5 * q, 8.3, B.z + B.dz * 0.5 * q, Math.atan2(B.dx * q, B.dz * q));
    }
    let y = [];
    roadsNear(m, g, 190, y);
    let _ = new Set(),
      v = 0;
    for (let S of y)
      if (!(S.e.elev || S.e.kind === 'A' || _.has(S.e))) {
        _.add(S.e);
        for (let T = 8; T < S.e.len - 8 && v < 260; T += 11) {
          let D = edgePos(S.e, T, {});
          if (Math.hypot(D.x - m, D.z - g) > 200) continue;
          let O = D.dz,
            U = -D.dx;
          for (let B of [-1, 1]) {
            let R = D.x + O * (S.e.hw + 0.8) * B,
              k = D.z + U * (S.e.hw + 0.8) * B;
            (t.setColor(14166046).ell(R, 4.6, k, 0.45, 0.6, 0.45, 6, 4), r.push([R, 4.6, k, 1, 0.25, 0.15, 5]), v++);
          }
        }
      }
    let b = yg(m + 30, g + 25),
      w = freeSpot(m + 30, g + 25, 28, 22, b, 80, 8) || [m + 30, g + 25],
      E = w[0],
      C = w[1];
    (Za(E, C, 28, 22, b),
      t.setColor(14209216).box(E, 0, C, 26, 1.6, 20, b, {}),
      t.setColor(13114910).box(E, 1.6, C, 20, 7, 14, b, {}),
      t.setColor(2058826).gable(E, 8.6, C, 24, 18, 4, b),
      t.setColor(15253568).box(E, 12.4, C, 22, 0.6, 1, b, {}),
      En(E, C, 26, 20, 12, b),
      (W.landmarks.chinatown.name = '\u6A2A\u6D5C\u4E2D\u83EF\u8857'));
  }
  {
    let [m, g, M] = T0('yokohamaStadium', 190, 160, 120);
    Za(g, M, 200, 170, m);
    let y = new Mt({
      color: !0,
    });
    (y.setColor(2771594).tube(0, 0, 0, 92, 78, 95, 81, 24, 48, !1), y.setColor(3824288).tube(0, 4, 0, 62, 50, 90, 76, 20, 48, !1));
    let _ = new THREE.Mesh(
      y.build(),
      new THREE.MeshStandardMaterial({
        vertexColors: !0,
        side: THREE.DoubleSide,
        roughness: 0.8,
      }),
    );
    (_.position.set(g, 0, M), (_.rotation.y = -m), (_.castShadow = !0), R.scene.add(_), LM.meshes.push(_));
    let v = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 4885050,
        roughness: 0.9,
      }),
    );
    (v.scale.set(62, 1, 50), v.position.set(g, 0.4, M), (v.rotation.y = -m), R.scene.add(v), LM.meshes.push(v));
    let b = Math.cos(m),
      w = Math.sin(m);
    for (let E = 0; E < 6; E++) {
      let C = (E / 6) * Math.PI * 2 + 0.5,
        S = g + Math.cos(C) * 88 * b - Math.sin(C) * 74 * w,
        T = M + Math.cos(C) * 88 * w + Math.sin(C) * 74 * b;
      (e.setColor(14212320).cyl(S, 0, T, 0.8, 42, 6), e.box(S, 42, T, 7, 4, 1, C, {}), r.push([S, 44, T, 1, 1, 0.95, 14]), En(S, T, 2, 2, 42));
    }
    for (let E = 0; E < 24; E++) {
      let C = (E / 24) * Math.PI * 2,
        S = g + Math.cos(C) * 93 * b - Math.sin(C) * 79 * w,
        T = M + Math.cos(C) * 93 * w + Math.sin(C) * 79 * b;
      En(S, T, 24, 6, 24, C + m + Math.PI / 2);
    }
    Hr(
      Or('\u6A2A\u6D5C\u30B9\u30BF\u30B8\u30A2\u30E0', 'YOKOHAMA STADIUM', '#2a4a8a', '#ffffff'),
      22,
      3.4,
      g - w * 96,
      18,
      M + b * 96,
      Math.atan2(-w, b),
    );
  }
  {
    let [m, g, M] = T0('kawasakiDaishi', 90, 80, 150);
    Za(g, M, 100, 90, m);
    let y = a(g, M, m);
    l(i, y, 100, 90, 0.07, 13156264);
    let [_, v] = y(0, -15);
    (t.setColor(10130568).box(_, 0, v, 42, 1.8, 30, m, {}),
      t.setColor(9054750).box(_, 1.8, v, 34, 9, 22, m, {}),
      t.setColor(4080712).gable(_, 10.8, v, 44, 32, 9, m),
      En(_, v, 42, 30, 20, m));
    let [b, w] = y(32, 12);
    for (let S = 0; S < 5; S++) {
      let T = S * 8.2,
        D = 6.5 - S * 0.6;
      (t.setColor(11545118).cyl(b, T, w, D * 0.62, 6, 8), t.setColor(3817540).tube(b, T + 6, w, D + 2, D + 2, 0.6, 0.6, 2.2, 8, !0));
    }
    (e.setColor(13150272).cyl(b, 41, w, 0.25, 9, 6), En(b, w, 9, 9, 42));
    let [E, C] = y(0, 40);
    for (let S of [-1, 1]) {
      let [T, D] = y(S * 6, 40);
      (t.setColor(11545118).box(T, 0, D, 1.4, 8, 1.4, m, {}), En(T, D, 1.4, 1.4, 8));
    }
    (t.setColor(4080712).gable(E, 8, C, 16, 5, 3, m), (W.landmarks.kawasakiDaishi.name = '\u5DDD\u5D0E\u5927\u5E2B'));
  }
  let f = (m, g, M, y, _) => {
    let v = Bp(m);
    if (!v) return;
    let b = null,
      w = 1e9;
    for (let R of W.edges)
      if (
        !(R.kind !== 'X' || !(W.roadNames[R.road] || '').includes('\u6E7E\u5CB8')) &&
        !(Math.hypot((W.nodes[R.a].x + W.nodes[R.b].x) / 2 - v[0], (W.nodes[R.a].z + W.nodes[R.b].z) / 2 - v[1]) > R.len + 800)
      )
        for (let k = 0; k < R.len; k += 10) {
          let P = edgePos(R, k, {}),
            H = Math.hypot(P.x - v[0], P.z - v[1]);
          H < w &&
            ((w = H),
            (b = {
              e: R,
              s: k,
            }));
        }
    if (!b || w > 300) return;
    let E = b.e,
      C = (R) => {
        let k = Math.max(0, Math.min(E.len, R));
        return {
          p: edgePos(E, k, {}),
          y: edgeY(E, k),
        };
      },
      S = new Mt({
        color: !0,
      }),
      T = [],
      D = E.hw + 2.5;
    for (let _R0 of g) {
      let { p: k, y: P } = C(b.s + _R0),
        H = k.dz,
        Z = -k.dx,
        q = Math.atan2(k.dz, k.dx);
      if (y === 2) {
        for (let G of [-1, 1])
          (S.setColor(15659250).box(k.x + H * G * D, -6, k.z + Z * G * D, 5, M + 6, 6, q, {}), En(k.x + H * G * D, k.z + Z * G * D, 5, 6, M));
        (S.box(k.x, M - 14, k.z, 5, 5, D * 2 + 5, q, {}),
          S.box(k.x, M * 0.55, k.z, 5, 4, D * 2 + 5, q, {}),
          S.box(k.x, P - 5, k.z, 6, 4, D * 2 + 6, q, {}));
      } else {
        let G = [k.x, M, k.z];
        for (let tt of [-1, 1]) {
          let K = k.x + H * tt * (D + 4),
            Y = k.z + Z * tt * (D + 4),
            Q = Math.hypot(D + 4, M),
            J = new THREE.Mesh(
              new THREE.BoxGeometry(5, Q, 6),
              new THREE.MeshStandardMaterial({
                color: 15659250,
                roughness: 0.5,
              }),
            );
          (J.position.set((K + G[0]) / 2, M / 2 - 3, (Y + G[2]) / 2),
            J.lookAt(G[0], M, G[2]),
            J.rotateX(Math.PI / 2),
            (J.castShadow = !0),
            R.scene.add(J),
            LM.meshes.push(J),
            En(K, Y, 5, 6, 30));
        }
        S.setColor(15659250).box(k.x, P - 5, k.z, 6, 4, D * 2 + 10, q, {});
      }
      for (let G of [-1, 1])
        for (let tt = 1; tt <= 14; tt++) {
          let K = (G * tt * _) / 14,
            Y = C(b.s + _R0 + K);
          for (let Q of y === 2 ? [-1, 1] : [0]) {
            let J = k.x + H * Q * D,
              ft = k.z + Z * Q * D,
              yt = M - 18 - tt * 1.6;
            for (let zt of [-1, 1]) {
              let At = Y.p.x + Y.p.dz * zt * (D - 1),
                ct = Y.p.z - Y.p.dx * zt * (D - 1);
              (y === 2 && zt !== Q) || T.push(J, yt, ft, At, Y.y + 1.2, ct);
            }
          }
        }
      (r.push([k.x, M + 1, k.z, 1, 0.15, 0.1, 12]), LM.av.push([k.x, M + 2, k.z]));
    }
    for (let R = -900; R <= 900; R += 30) {
      let k = C(b.s + R);
      for (let P of [-1, 1]) r.push([k.p.x + k.p.dz * P * (D - 0.5), k.y + 2.5, k.p.z - k.p.dx * P * (D - 0.5), 0.9, 0.95, 1, 4]);
    }
    let O = new THREE.BufferGeometry();
    O.setAttribute('position', new THREE.Float32BufferAttribute(T, 3));
    let U = new THREE.LineSegments(
      O,
      new THREE.LineBasicMaterial({
        color: 15265007,
      }),
    );
    (R.scene.add(U), LM.meshes.push(U));
    let B = new THREE.Mesh(
      S.build(),
      new THREE.MeshStandardMaterial({
        vertexColors: !0,
        roughness: 0.5,
      }),
    );
    ((B.castShadow = !0), R.scene.add(B), LM.meshes.push(B));
  };
  (f('bayBridge', [-230, 230], 120, 2, 210), f('tsubasaBridge', [0], 130, 1, 240));
  let u = [
      [
        'refinery',
        [
          [35.5225, 139.77],
          [35.5205, 139.792],
          [35.51, 139.788],
          [35.5085, 139.769],
        ],
      ],
      [
        'plant',
        [
          [35.515, 139.739],
          [35.5135, 139.764],
          [35.506, 139.76],
          [35.503, 139.742],
        ],
      ],
      [
        'plant',
        [
          [35.504, 139.7],
          [35.502, 139.734],
          [35.496, 139.733],
          [35.495, 139.701],
        ],
      ],
      [
        'steel',
        [
          [35.489, 139.701],
          [35.488, 139.735],
          [35.4785, 139.737],
          [35.4775, 139.706],
        ],
      ],
      [
        'logi',
        [
          [35.5, 139.761],
          [35.4975, 139.7895],
          [35.484, 139.785],
          [35.4815, 139.754],
        ],
      ],
      [
        'logi',
        [
          [35.472, 139.678],
          [35.4705, 139.69],
          [35.4565, 139.688],
          [35.4562, 139.675],
        ],
      ],
      [
        'plant',
        [
          [35.4895, 139.67],
          [35.487, 139.68],
          [35.483, 139.676],
          [35.485, 139.666],
        ],
      ],
      [
        'plant',
        [
          [35.5335, 139.745],
          [35.532, 139.762],
          [35.524, 139.795],
          [35.51, 139.8],
          [35.504, 139.77],
          [35.494, 139.74],
          [35.49, 139.695],
          [35.4935, 139.683],
          [35.5, 139.693],
          [35.51, 139.708],
          [35.52, 139.722],
          [35.528, 139.734],
        ],
      ],
      [
        'plant',
        [
          [35.4985, 139.68],
          [35.49, 139.665],
          [35.486, 139.66],
          [35.484, 139.67],
          [35.491, 139.69],
          [35.496, 139.69],
        ],
      ],
      [
        'logi',
        [
          [35.4385, 139.668],
          [35.4305, 139.6835],
          [35.42, 139.68],
          [35.417, 139.665],
          [35.43, 139.66],
        ],
      ],
    ],
    c = new Mt({
      color: !0,
    }),
    h = new Mt({
      color: !0,
    }),
    d = R.qName === 'low' ? 85 : 70,
    p = 0;
  for (let [m, g] of u) {
    let M = g.map((S) => fe(S[0], S[1])),
      y = 1e9,
      _ = 1e9,
      v = -1e9,
      b = -1e9;
    for (let [S, T] of M) ((y = Math.min(y, S)), (v = Math.max(v, S)), (_ = Math.min(_, T)), (b = Math.max(b, T)));
    let w = [];
    buildingsInRect(y, _, v, b, w);
    let E = W.bld,
      C = new Map();
    for (let S of w) {
      let T = S * 9;
      if (E[T + 6] < 1 || !inPoly(E[T], E[T + 1], M)) continue;
      let D = Math.floor(E[T] / d) * 1e5 + Math.floor(E[T + 1] / d),
        O = E[T + 3] * E[T + 4],
        U = C.get(D);
      ((!U || O > U[5]) && C.set(D, [E[T], E[T + 1], E[T + 2], Math.min(40, E[T + 3] * 1.25), Math.min(40, E[T + 4] * 1.25), O]), clearBuilding(T));
    }
    for (let [S, T, D, O, U] of C.values()) {
      p++;
      let B = Df(S, T),
        R = Math.min(O, U),
        k = O * U > 500;
      if (m === 'refinery' || (m === 'plant' && B < 0.3)) {
        let P = R * 0.45,
          H = 8 + B * 12;
        (h.setColor(B < 0.6 ? 15658730 : 13949148).cyl(S, 0, T, P, H, 12),
          En(S, T, P * 1.8, P * 1.8, H),
          B < 0.35 && r.push([S, H + 0.6, T, 1, 0.92, 0.7, 3]));
      } else if (m === 'plant') {
        let P = 12 + B * (k ? 34 : 18);
        (c.setColor(B < 0.6 ? 9080984 : 10127984).box(S, 0, T, O * 0.85, P, U * 0.85, D, {}),
          c.setColor(5133404).box(S, P * 0.5, T, O * 0.85 + 1.2, 0.5, U * 0.85 + 1.2, D, {
            noTop: !1,
          }),
          En(S, T, O * 0.85, U * 0.85, P, D));
        for (let H = 0; H < (k ? 4 : 2); H++)
          r.push([S + (Df(H, S) - 0.5) * O * 0.9, 3 + Df(T, H) * P, T + (Df(S, H + 5) - 0.5) * U * 0.9, 1, 0.9 - (H % 3) * 0.12, 0.55, 3]);
        if (B > 0.9) {
          let H = 50 + Df(T, S) * 60;
          c.setColor(14211284).cyl(S, P, T, 1.8, H - P, 8);
          for (let Z = 0; Z < 3; Z++) c.setColor(Z % 2 ? 15921902 : 13642270).cyl(S, H - 12 + Z * 4, T, 1.9, 4, 8);
          (r.push([S, H + 1, T, 1, 0.1, 0.06, 9]), En(S, T, 3.6, 3.6, H));
        }
      } else if (m === 'steel') {
        let P = 16 + B * 16;
        (c.setColor([8022618, 6970964, 8681066][(B * 3) | 0]).box(S, 0, T, O, P, U, D, {}),
          c.setColor(5918792).gable(S, P, T, O + 0.6, U + 0.6, 3, D),
          En(S, T, O, U, P + 3, D),
          B < 0.25 && r.push([S, P - 2, T, 1, 0.8, 0.45, 3]),
          B > 0.96 &&
            (c.setColor(4867136).cyl(S, 0, T, 8, 62, 12),
            c.setColor(9076856).box(S, 0, T, 22, 72, 1.6, D, {}),
            En(S, T, 18, 18, 72),
            r.push([S, 74, T, 1, 0.15, 0.08, 10])));
      } else {
        (n.setColor([0.78, 0.8, 0.82]), (n.bv = [2, 21 + ((B * 9) | 0), 6, 0.9]));
        let P = 10 + B * 14;
        (n.box(S, 0, T, O, P, U, D, {}), En(S, T, O, U, P, D), B < 0.3 && r.push([S, P - 1, T, 1, 0.95, 0.8, 3]));
      }
    }
  }
  {
    let [m, g] = fe(35.515, 139.78);
    Hr(Or('\u4EAC\u6D5C\u5DE5\u696D\u5730\u5E2F', 'KEIHIN INDUSTRIAL ZONE', '#3a3f46', '#ffd23f'), 18, 2.8, m, 8, g, 0);
  }
  let x = (m, g, M) => {
    if (!m.count) return;
    let y = new THREE.Mesh(m.build(), g);
    ((y.castShadow = !!M), (y.receiveShadow = !0), R.scene.add(y), LM.meshes.push(y));
  };
  (x(i, R.M.paint, !1),
    x(n, R.M.building, !0),
    x(t, R.M.paint, !0),
    x(e, R.M.metal, !0),
    x(s, R.M.glow, !1),
    x(o, R.M.paint, !0),
    x(c, R.M.metal, !0),
    x(h, R.M.paint, !0),
    console.log('yokohama industry cells', p));
}
var Hp = null;
function wR() {
  if (Hp) return Hp;
  let [n, t] = Ne(128, 128);
  return (
    t.clearRect(0, 0, 128, 128),
    (t.strokeStyle = '#fff'),
    (t.lineWidth = 10),
    t.strokeRect(0, 0, 128, 128),
    (t.lineWidth = 6),
    t.beginPath(),
    t.moveTo(0, 0),
    t.lineTo(128, 128),
    t.moveTo(128, 0),
    t.lineTo(0, 128),
    t.stroke(),
    (Hp = Fe(n)),
    Hp
  );
}
var LM = {
    meshes: [],
    emissive: [],
  },
  SR = (n) =>
    new THREE.MeshStandardMaterial(
      Object.assign(
        {
          vertexColors: !0,
          roughness: 0.7,
        },
        n,
      ),
    );
function Tn(n, t, e, i = !0) {
  if (!n.count) return null;
  let s = new THREE.Mesh(n.build(), t);
  return ((s.castShadow = i), (s.receiveShadow = !0), e && s.position.copy(e), R.scene.add(s), LM.meshes.push(s), s);
}
function dn(n, t, e, i, s, o = 0, r = 0) {
  W.lmCol.push({
    x: n,
    z: t,
    w: e,
    d: i,
    h: s,
    rot: o,
    y0: r,
    rad: Math.hypot(e, i) / 2,
  });
}
function ER(n, t, e, i, s) {
  let o = [];
  buildingsNear(n, t, Math.hypot(e, i) / 2 + 40, o);
  let r = W.bld,
    a = Math.cos(s),
    l = Math.sin(s);
  for (let f of o) {
    let u = f * 9,
      c = r[u] - n,
      h = r[u + 1] - t,
      d = c * a + h * l,
      p = -c * l + h * a,
      x = Math.max(r[u + 3], r[u + 4]) / 2;
    Math.abs(d) < e / 2 + x && Math.abs(p) < i / 2 + x && clearBuilding(u);
  }
}
function ds(n, t, e) {
  let i = [];
  buildingsNear(n, t, e + 40, i);
  let s = W.bld;
  for (let o of i) {
    let r = o * 9;
    Math.hypot(s[r] - n, s[r + 1] - t) < e + Math.max(s[r + 3], s[r + 4]) / 2 && clearBuilding(r);
  }
}
var sr = (n) => {
    let t = W.landmarks[n];
    return [t.x, t.z];
  },
  Br = (n, t, e, i = 0, s = 140) => {
    let o = W.landmarks[n],
      r = freeSpot(o.x, o.z, t, e, i, s);
    return (r && ((o.x = r[0]), (o.z = r[1])), [o.x, o.z]);
  };
function _TR_() {
  let [n, t] = Ne(128, 128);
  return (
    t.clearRect(0, 0, 128, 128),
    (t.strokeStyle = '#fff'),
    (t.lineWidth = 10),
    t.strokeRect(0, 0, 128, 128),
    (t.lineWidth = 6),
    t.beginPath(),
    t.moveTo(0, 0),
    t.lineTo(128, 128),
    t.moveTo(128, 0),
    t.lineTo(0, 128),
    t.moveTo(0, 64),
    t.lineTo(128, 64),
    t.stroke(),
    Fe(n, {
      linear: !1,
    })
  );
}
function h_(n, t, e, i, s, o, r) {
  let a = i - e,
    l = new THREE.CylinderGeometry(t, n, a, s, 1, !0);
  (l.rotateY(r || 0), l.translate(0, e + a / 2, 0));
  let f = (n + t) * Math.sin(Math.PI / s),
    u = Math.max(1, Math.round(a / f)),
    c = l.attributes.uv;
  for (let h = 0; h < c.count; h++) c.setXY(h, c.getX(h) * s, c.getY(h) * u);
  return new THREE.Mesh(l, o);
}
var Nf = (n, t) => {
  for (let e = 1; e < n.length; e++)
    if (t <= n[e][0]) {
      let i = (t - n[e - 1][0]) / (n[e][0] - n[e - 1][0]);
      return n[e - 1][1] + (n[e][1] - n[e - 1][1]) * i;
    }
  return n[n.length - 1][1];
};
function d_() {
  let n = _TR_();
  {
    let [e, i] = sr('tokyoTower');
    ds(e, i, 60);
    let s = new THREE.MeshStandardMaterial({
        color: 15750174,
        map: n,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        emissive: 15750174,
        emissiveIntensity: 0,
        roughness: 0.6,
      }),
      o = new THREE.MeshStandardMaterial({
        color: 15921386,
        map: n,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        emissive: 16767392,
        emissiveIntensity: 0,
        roughness: 0.6,
      }),
      r = new THREE.MeshStandardMaterial({
        color: 14178090,
        emissive: 15750174,
        emissiveIntensity: 0,
      });
    LM.emissive.push([s, 0.8], [o, 0.5], [r, 0.6]);
    let a = [
        [0, 36],
        [40, 22],
        [90, 13.5],
        [150, 9.5],
        [250, 4.2],
        [300, 2],
        [333, 0.6],
      ],
      l = new THREE.Group();
    for (let [p, x] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      let m = new THREE.Vector3(p * 34, 0, x * 34),
        g = new THREE.Vector3(p * 19, 48, x * 19),
        M = m.distanceTo(g),
        y = new THREE.BoxGeometry(7, M, 7),
        _ = y.attributes.uv;
      for (let w = 0; w < _.count; w++) _.setXY(w, _.getX(w), (_.getY(w) * M) / 7);
      let v = new THREE.Mesh(y, s);
      (v.position.copy(m).lerp(g, 0.5),
        v.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), g.clone().sub(m).normalize()),
        l.add(v),
        new THREE.Mesh(new THREE.TorusGeometry(19, 1.2, 6, 16, Math.PI), s).position.set(p * 0, 30, 0));
    }
    for (let [p, x, m] of [
      [0, -27, 0],
      [27, 0, Math.PI / 2],
      [0, 27, 0],
      [-27, 0, Math.PI / 2],
    ]) {
      let g = new THREE.Mesh(new THREE.TorusGeometry(21, 1.4, 6, 18, Math.PI), s);
      (g.position.set(p, 20, x), (g.rotation.y = m), (g.scale.y = 1.35), l.add(g));
    }
    for (let p = 46; p < 333; p += 12) {
      let x = Math.min(333, p + 12),
        m = p > 90 ? Math.floor((p - 90) / 30) % 2 : 1;
      (l.add(h_(Nf(a, p), Nf(a, x), p, x, 4, m ? s : o, Math.PI / 4)), l.add(h_(Nf(a, p) * 0.3, Nf(a, x) * 0.3, p, x, 4, r, Math.PI / 4)));
    }
    {
      let p = new THREE.Mesh(new THREE.BoxGeometry(44, 3, 44), s);
      ((p.position.y = 47), l.add(p));
    }
    let f = new THREE.MeshStandardMaterial({
      color: 9279134,
      emissive: 16769448,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.5,
    });
    LM.emissive.push([f, 0.9]);
    let u = new THREE.Mesh(new THREE.BoxGeometry(23, 9, 23), f);
    ((u.position.y = 150), l.add(u));
    let c = new THREE.Mesh(new THREE.BoxGeometry(9.5, 5, 9.5), f);
    ((c.position.y = 250), l.add(c));
    let h = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 85, 6), o);
    ((h.position.y = 292), l.add(h));
    let d = new THREE.Mesh(
      new THREE.BoxGeometry(48, 18, 40),
      new THREE.MeshStandardMaterial({
        color: 12367532,
        roughness: 0.8,
      }),
    );
    ((d.position.y = 9),
      l.add(d),
      l.position.set(e, 0, i),
      l.traverse((p) => {
        p.isMesh && (p.castShadow = !0);
      }),
      R.scene.add(l),
      LM.meshes.push(l),
      dn(e, i, 48, 40, 18));
    for (let [p, x] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ])
      dn(e + p * 33, i + x * 33, 6, 6, 40);
    LM.av = [[e, 334, i]];
  }
  {
    let [e, i] = sr('skytree');
    ds(e, i, 80);
    let s = new THREE.MeshStandardMaterial({
        color: 14674162,
        map: n,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        emissive: 6066152,
        emissiveIntensity: 0,
        roughness: 0.5,
        metalness: 0.3,
      }),
      o = new THREE.MeshStandardMaterial({
        color: 13621214,
        emissive: 3826372,
        emissiveIntensity: 0,
        roughness: 0.5,
      });
    LM.emissive.push([s, 1], [o, 0.35]);
    let r = [
        [0, 32],
        [60, 21],
        [150, 15.5],
        [340, 12.5],
        [445, 9],
        [495, 6.5],
        [634, 1],
      ],
      a = new THREE.Group(),
      l = (p, x, m) => {
        let M = [];
        for (let w = 0; w <= 634; w += 12) M.push(Math.min(634, w));
        let y = [],
          _ = [],
          v = [];
        M.forEach((w, E) => {
          let C = Nf(r, w) * p,
            S = THREE.MathUtils.smoothstep(w, 0, 320);
          for (let T = 0; T <= 36; T++) {
            let D = (T / 36) * Math.PI * 2,
              O = ((D + Math.PI / 6) % ((Math.PI * 2) / 3)) - Math.PI / 3,
              U = (C * 1.25 * Math.cos(Math.PI / 3)) / Math.cos(O),
              B = THREE.MathUtils.lerp(U, C, S);
            (y.push(Math.cos(D) * B, w, Math.sin(D) * B), _.push((T / 36) * m, w / ((2 * Math.PI * C) / m)));
          }
        });
        for (let w = 0; w + 1 < M.length; w++)
          for (let E = 0; E < 36; E++) {
            let C = w * 37 + E,
              S = C + 1,
              T = C + 36 + 1,
              D = T + 1;
            v.push(C, T, S, S, T, D);
          }
        let b = new THREE.BufferGeometry();
        return (
          b.setAttribute('position', new THREE.Float32BufferAttribute(y, 3)),
          b.setAttribute('uv', new THREE.Float32BufferAttribute(_, 2)),
          b.setIndex(v),
          b.computeVertexNormals(),
          new THREE.Mesh(b, x)
        );
      };
    (a.add(l(1, s, 16)), a.add(l(0.55, o, 12)));
    let f = new THREE.MeshStandardMaterial({
      color: 8161170,
      emissive: 15266047,
      emissiveIntensity: 0,
      roughness: 0.2,
      metalness: 0.6,
    });
    LM.emissive.push([f, 0.9]);
    let u = new THREE.Mesh(new THREE.CylinderGeometry(19, 17, 16, 32), f);
    ((u.position.y = 348), a.add(u));
    let c = new THREE.Mesh(new THREE.CylinderGeometry(13, 12.5, 8, 32), f);
    ((c.position.y = 448),
      a.add(c),
      a.position.set(e, 0, i),
      a.traverse((p) => {
        p.isMesh && (p.castShadow = !0);
      }),
      R.scene.add(a),
      LM.meshes.push(a),
      dn(e, i, 22, 22, 634));
    let h = new Mt({
      color: !0,
      aB: !0,
    });
    (h.setColor([0.75, 0.77, 0.79]), (h.bv = [4, 3, 4, 0.5]));
    let d = freeSpot(e, i + 40, 90, 30, 0, 60) || (roadHits(e, i + 40, 90, 30, 0) ? null : [e, i + 40]);
    (d && (h.box(d[0], 0, d[1], 90, 30, 30, 0, {}), Tn(h, R.M.building), dn(d[0], d[1], 90, 30, 30)), LM.av.push([e, 635, i]));
  }
  {
    let [e, i] = sr('tocho');
    ds(e, i, 110);
    let s = new Mt({
      color: !0,
      aB: !0,
    });
    s.setColor([0.78, 0.76, 0.72]);
    let o = 0.2,
      r = Math.cos(o),
      a = Math.sin(o),
      l = (d, p) => [e + r * d - a * p, i + a * d + r * p];
    s.bv = [2, 5, 4, 0.55];
    let [f, u] = l(0, 20);
    (s.box(f, 0, u, 110, 38, 40, o, {}), dn(f, u, 110, 40, 38, o));
    let c = new Mt({
        color: !0,
      }),
      h = new Mt({
        color: !0,
      });
    for (let d of [-1, 1]) {
      let [p, x] = l(d * 26, -12);
      ((s.bv = [2, 7, 4, 0.55]),
        s.box(p, 0, x, 30, 150, 38, o, {}),
        s.box(p, 150, x, 27, 50, 34, o, {}),
        s.box(p, 200, x, 26, 9, 32, o, {}),
        s.box(p, 209, x, 24, 14, 24, o + Math.PI / 4, {}),
        s.box(p, 223, x, 19, 20, 19, o + Math.PI / 4, {}),
        s.box(p, 243, x, 8, 3, 8, o + Math.PI / 4, {}),
        c.setColor(16773320).box(p, 201.5, x, 26.3, 4.5, 32.3, o, {}));
      for (let m = -2; m <= 2; m++) h.setColor(13617597).box(p + Math.cos(o) * m * 5.6, 4, x + Math.sin(o) * m * 5.6, 0.7, 146, 38.4, o, {});
      (dn(p, x, 30, 38, 246, o), d > 0 && LM.av.push([p, 247, x]));
    }
    (Tn(c, R.M.glow, null, !1), Tn(h, R.M.paint), ([f, u] = l(0, -12)), s.box(f, 0, u, 22, 160, 30, o, {}), Tn(s, R.M.building));
  }
  {
    let [e, i] = Br('docomo', 34, 30);
    ds(e, i, 35);
    let s = new Mt({
      color: !0,
      aB: !0,
    });
    (s.setColor([0.62, 0.64, 0.66]),
      (s.bv = [3, 9, 4, 0.5]),
      s.box(e, 0, i, 34, 150, 30, 0, {}),
      s.box(e, 150, i, 28, 30, 24, 0, {}),
      s.box(e, 180, i, 18, 20, 16, 0, {}),
      Tn(s, R.M.building),
      dn(e, i, 34, 30, 200));
    let o = new Mt({
      color: !0,
    });
    o.setColor(10133670).cyl(e, 200, i, 2.2, 40, 8);
    let r = new Mt({
      color: !0,
    });
    for (let [a, l] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ])
      r.setColor(15921904).vplane(e + a * 9.05, 158, i + l * 12.05, 10, 10, a, l);
    (Tn(o, R.M.metal), Tn(r, R.M.glow, null, !1));
  }
  {
    let [e, i] = Br('cocoon', 30, 22);
    ds(e, i, 30);
    let s = [];
    for (let a = 0; a <= 20; a++) {
      let l = a / 20;
      s.push(new THREE.Vector2(12 + 9 * Math.sin(Math.PI * Math.min(1, l * 1.15)) - l * 6, l * 204));
    }
    let o = new THREE.Mesh(
      new THREE.LatheGeometry(s, 32),
      new THREE.MeshStandardMaterial({
        color: 9417928,
        roughness: 0.08,
        metalness: 0.9,
        emissive: 3359829,
        emissiveIntensity: 0,
      }),
    );
    (o.scale.set(1, 1, 0.7), o.position.set(e, 0, i), (o.castShadow = !0), R.scene.add(o), LM.meshes.push(o), LM.emissive.push([o.material, 0.8]));
    let r = new THREE.Mesh(
      new THREE.LatheGeometry(
        s.map((a) => new THREE.Vector2(a.x + 0.3, a.y)),
        24,
      ),
      new THREE.MeshBasicMaterial({
        color: 16777215,
        wireframe: !0,
        transparent: !0,
        opacity: 0.35,
      }),
    );
    (r.scale.copy(o.scale), r.position.copy(o.position), R.scene.add(r), LM.meshes.push(r), dn(e, i, 30, 22, 204));
  }
  let t = (e, i, s, o, r, a, l) => {
    let [f, u] = Br(e, i * 1.8, s * 1.6, r);
    ds(f, u, Math.max(i, s) * 0.7);
    let c = new Mt({
      color: !0,
      aB: !0,
    });
    if ((c.setColor(a), (c.bv = [4, 13, 4.2, 0.6]), l === 'oct'))
      for (let h = 0; h < 4; h++) c.box(f, 0, u, i * (1 - h * 0.04), o * (1 - h * 0.02), s * (1 - h * 0.04), r + (h * Math.PI) / 8, {});
    else if (l === 'taper') for (let h = 0; h < 6; h++) c.box(f, (h * o) / 6, u, i * (1 - h * 0.07), o / 6 + 0.5, s * (1 - h * 0.07), r, {});
    else (c.box(f, 0, u, i, o, s, r, {}), c.box(f, o, u, i * 0.6, o * 0.04, s * 0.6, r, {}));
    ((c.bv = [3, 7, 4.5, 0.5]),
      c.setColor([0.8, 0.78, 0.74]),
      c.box(f, 0, u, i * 1.8, 22, s * 1.6, r, {}),
      Tn(c, R.M.building),
      dn(f, u, i, s, o, r),
      dn(f, u, i * 1.8, s * 1.6, 22, r),
      LM.av.push([f, o + 2, u]));
  };
  (t('roppongiHills', 56, 50, 238, 0.3, [0.42, 0.46, 0.5], 'oct'),
    t('azabudai', 58, 54, 325, 0.1, [0.62, 0.66, 0.7], 'taper'),
    t('sunshine60', 60, 38, 240, 0.35, [0.7, 0.68, 0.64]),
    t('toranomonHills', 50, 46, 255, 0.25, [0.48, 0.55, 0.62], 'taper'));
  {
    let e = 1.43 + Math.PI / 2,
      [i, s] = sr('tokyoStation');
    {
      let f = railFree(i, s, 330, 30, e, 8, 200);
      f && ([i, s] = f);
    }
    ER(i, s, 340, 40, e);
    let o = new Mt({
      color: !0,
      aB: !0,
    });
    (o.setColor([0.62, 0.29, 0.2]), (o.bv = [2, 3, 4.6, 0.7]), o.box(i, 0, s, 330, 22, 22, e, {}), dn(i, s, 330, 22, 22, e));
    let r = Math.cos(e),
      a = Math.sin(e);
    for (let f of [-150, 150]) o.box(i + r * f, 0, s + a * f, 34, 30, 34, e, {});
    (o.box(i, 0, s, 50, 28, 30, e, {}), Tn(o, R.M.building));
    let l = new Mt({
      color: !0,
    });
    for (let f of [-150, 150]) {
      l.setColor(3885636);
      let c = new THREE.SphereGeometry(13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed().attributes.position.array;
      for (let h = 0; h < c.length; h += 9)
        l.tri(
          [i + r * f + c[h], 30 + c[h + 1], s + a * f + c[h + 2]],
          [i + r * f + c[h + 3], 30 + c[h + 4], s + a * f + c[h + 5]],
          [i + r * f + c[h + 6], 30 + c[h + 7], s + a * f + c[h + 8]],
          null,
        );
    }
    for (let f of [-1, 1]) l.setColor(15328214).box(i, 10 + f * 4, s, 331, 0.8, 22.4, e, {});
    Tn(
      l,
      SR({
        roughness: 0.5,
        metalness: 0.3,
      }),
    );
  }
  {
    let [e, i] = sr('scramble'),
      s = [];
    for (let f = 0; f < 4; f++) {
      let [u, c] = Ne(512, 288),
        h = Fe(u, {
          rep: !1,
          dyn: !0,
        });
      ((h.minFilter = THREE.LinearFilter),
        (h.generateMipmaps = !1),
        s.push({
          c: u,
          ctx: c,
          t: h,
        }));
    }
    LM.screens = s;
    {
      let f = new Mt({
        color: !0,
      });
      f.setColor(15921902);
      let u = (g, M, y, _, v) => {
          let b = y - g,
            w = _ - M,
            E = Math.hypot(b, w),
            C = b / E,
            S = w / E,
            T = -S,
            D = C;
          for (let O = 0; O < E; O += 1) {
            let U = [g + C * O, 0.075, M + S * O],
              B = [g + C * (O + 0.5), 0.075, M + S * (O + 0.5)];
            f.quad(
              [U[0] - T * v, 0.075, U[2] - D * v],
              [U[0] + T * v, 0.075, U[2] + D * v],
              [B[0] + T * v, 0.075, B[2] + D * v],
              [B[0] - T * v, 0.075, B[2] - D * v],
              [0, 1, 0],
            );
          }
        },
        c = Math.cos(0.32),
        h = Math.sin(0.32),
        d = (g, M) => [e + c * g - h * M, i + h * g + c * M],
        p = 21,
        x = [d(-p, -p), d(p, -p), d(p, p), d(-p, p)];
      for (let g = 0; g < 4; g++) {
        let M = x[g],
          y = x[(g + 1) % 4];
        u(M[0], M[1], y[0], y[1], 2.6);
      }
      (u(x[0][0], x[0][1], x[2][0], x[2][1], 2.4), u(x[1][0], x[1][1], x[3][0], x[3][1], 2.4));
      let m = new THREE.Mesh(
        f.build(),
        new THREE.MeshStandardMaterial({
          vertexColors: !0,
          roughness: 0.6,
          polygonOffset: !0,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -8,
        }),
      );
      ((m.receiveShadow = !0), R.scene.add(m), LM.meshes.push(m));
    }
    [
      [-48, -42, 0.8, 18, 30],
      [44, -46, -0.8, 16, 26],
      [52, 38, -2.3, 14, 22],
      [-50, 40, 2.3, 14, 24],
    ].forEach(([f, u, c, h, d], p) => {
      let x = new THREE.Mesh(
        new THREE.PlaneGeometry(h, h * 0.56),
        new THREE.MeshBasicMaterial({
          map: s[p].t,
          toneMapped: !1,
        }),
      );
      (x.position.set(e + f, d, i + u), (x.rotation.y = c + Math.PI), R.scene.add(x), LM.meshes.push(x));
    });
    let [r, a] = fe(35.6582, 139.7022);
    {
      let f = freeSpot(r, a, 60, 50, 0.15, 100);
      f && ([r, a] = f);
    }
    ds(r, a, 35);
    let l = new Mt({
      color: !0,
      aB: !0,
    });
    (l.setColor([0.55, 0.62, 0.7]), (l.bv = [4, 21, 4.2, 0.6]));
    for (let f = 0; f < 5; f++) l.box(r, f * 46, a, 60 - f * 4, 46, 50 - f * 3, 0.15 + f * 0.03, {});
    (Tn(l, R.M.building), dn(r, a, 60, 50, 230, 0.15));
  }
  {
    let [e, i] = sr('kaminarimon');
    ds(e, i, 15);
    let s = new Mt({
        color: !0,
      }),
      o = 11740702,
      r = 2829358;
    for (let [v, b] of [
      [-5, -1.6],
      [5, -1.6],
      [-5, 1.6],
      [5, 1.6],
      [-1.8, 0],
      [1.8, 0],
    ])
      s.setColor(o).box(e + v, 0, i + b, 0.8, 7.5, 0.8, 0, {});
    (s.setColor(o).box(e, 7.4, i, 13, 1, 5.6, 0, {}),
      s.setColor(r).gable(e, 8.4, i, 15.5, 8, 2.6, 0),
      Tn(s, R.M.paint),
      dn(e - 5, i, 1.2, 4, 8),
      dn(e + 5, i, 1.2, 4, 8));
    let [a, l] = Ne(256, 128);
    ((l.fillStyle = '#c4261c'),
      l.fillRect(0, 0, 256, 128),
      (l.fillStyle = '#1a1a1a'),
      l.fillRect(0, 0, 256, 10),
      l.fillRect(0, 118, 256, 10),
      (l.font = `900 70px ${ce}`),
      (l.textAlign = 'center'),
      (l.textBaseline = 'middle'),
      l.fillText('\u96F7\u9580', 64, 66),
      l.fillText('\u96F7\u9580', 192, 66));
    let f = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 3.8, 24),
      new THREE.MeshStandardMaterial({
        map: Fe(a, {
          rep: !1,
        }),
        emissive: 5574929,
        emissiveIntensity: 0,
      }),
    );
    (f.position.set(e, 3.6, i), R.scene.add(f), LM.meshes.push(f), LM.emissive.push([f.material, 1]));
    let [u, c] = Br('sensoji', 30, 22, 0, 80);
    ds(u, c, 110);
    let h = new Mt({
        color: !0,
      }),
      d = u - e,
      p = c - i,
      x = Math.hypot(d, p),
      m = d / x,
      g = p / x,
      M = Math.atan2(g, m);
    for (let v = 14; v < x - 50; v += 7)
      for (let b of [-1, 1]) {
        let w = e + m * v - g * b * 6,
          E = i + g * v + m * b * 6;
        roadHits(w, E, 6, 5, M, 0.3) ||
          (h.setColor(15326663).box(w, 0, E, 6, 3.2, 5, M, {}), h.setColor(9120286).gable(w, 3.2, E, 6.4, 5.6, 1.3, M), dn(w, E, 6, 5, 3.4, M));
      }
    (h.setColor(10196362).box(u, 0, c, 30, 1.6, 22, M, {}),
      h.setColor(o).box(u, 1.6, c, 26, 10, 18, M, {}),
      h.setColor(r).gable(u, 11.6, c, 34, 26, 10, M),
      dn(u, c, 30, 22, 22, M));
    let y = u - g * 45,
      _ = c + m * 45;
    for (let v = 0; v < 5; v++) {
      let b = 10 - v * 1.3,
        w = v * 4.6;
      (h.setColor(o).box(y, w, _, b, 3.4, b, M, {}), h.setColor(r).box(y, w + 3.4, _, b + 4, 0.9, b + 4, M, {}));
    }
    (h.setColor(13215048).cyl(y, 23.4, _, 0.45, 10, 8), dn(y, _, 10, 10, 33, M), Tn(h, R.M.paint));
  }
  {
    let [e, i] = Br('fujiTV', 70, 40);
    ds(e, i, 70);
    let s = new Mt({
      color: !0,
      aB: !0,
    });
    (s.setColor([0.82, 0.84, 0.86]), (s.bv = [3, 31, 5, 0.4]));
    for (let r of [-1, 1]) (s.box(e + r * 26, 0, i, 18, 123, 40, 0, {}), dn(e + r * 26, i, 18, 40, 123));
    for (let r of [25, 60, 95]) s.box(e, r, i, 34, 6, 40, 0, {});
    Tn(s, R.M.building);
    let o = new THREE.Mesh(
      new THREE.SphereGeometry(16, 32, 20),
      new THREE.MeshStandardMaterial({
        color: 12634320,
        metalness: 1,
        roughness: 0.15,
      }),
    );
    (o.position.set(e, 104, i), R.scene.add(o), LM.meshes.push(o));
  }
  {
    let [e, i] = Br('bigSight', 150, 120, 0, 160);
    ds(e, i, 120);
    let s = new Mt({
      color: !0,
    });
    for (let o = 0; o < 4; o++) {
      let r = ((o % 2) - 0.5) * 44,
        a = (Math.floor(o / 2) - 0.5) * 44;
      (s.setColor(7108224).prism(e + r, 30, 58, i + a, 10, 26, 10, -10, 26, -26), s.setColor(12106944).cyl(e + r, 0, i + a, 4, 30, 8));
    }
    (s.setColor(13159632).box(e, 0, i, 150, 18, 120, 0, {}), Tn(s, R.M.metal), dn(e, i, 150, 120, 18), dn(e, i, 100, 100, 58, 0, 18));
  }
  {
    let [e, i] = Br('tokyoDome', 200, 200, 0, 180);
    ds(e, i, 130);
    let s = new THREE.Mesh(
      new THREE.SphereGeometry(110, 48, 16, 0, Math.PI * 2, 0, 0.42),
      new THREE.MeshStandardMaterial({
        color: 15790316,
        roughness: 0.4,
      }),
    );
    (s.scale.set(1, 0.55, 1), s.position.set(e, -40, i), (s.castShadow = !0), R.scene.add(s), LM.meshes.push(s));
    let o = new Mt({
      color: !0,
    });
    (o.setColor(14211806).cyl(e, 0, i, 104, 16, 48, !1), Tn(o, R.M.paint), dn(e, i, 200, 200, 22));
  }
  {
    let [e, i] = Br('diet', 206, 88, 0, 140);
    ds(e, i, 100);
    let s = new Mt({
      color: !0,
      aB: !0,
    });
    (s.setColor([0.86, 0.82, 0.74]),
      (s.bv = [0, 41, 4.5, 0.4]),
      s.box(e, 0, i, 206, 20, 88, 0, {}),
      s.box(e, 20, i, 30, 30, 30, 0, {}),
      s.box(e, 50, i, 22, 6, 22, 0, {}),
      Tn(s, R.M.building));
    let o = new Mt({
      color: !0,
    });
    (o.setColor(11972254).prism(e, 56, 66, i, 11, 2, 11, -11, 2, -2), Tn(o, R.M.paint), dn(e, i, 206, 88, 20), dn(e, i, 30, 30, 66));
  }
  {
    let [e, i] = sr('kabukichoGate'),
      [s, o] = Ne(512, 64);
    ((o.fillStyle = '#f6efe0'),
      o.fillRect(0, 0, 512, 64),
      (o.fillStyle = '#d4121f'),
      (o.font = `900 46px ${ce}`),
      (o.textAlign = 'center'),
      (o.textBaseline = 'middle'),
      o.fillText('\u6B4C\u821E\u4F0E\u753A\u4E00\u756A\u8857', 256, 34));
    let r = Fe(s, {
        rep: !1,
      }),
      a = new THREE.MeshStandardMaterial({
        map: r,
        emissive: 16777215,
        emissiveMap: r,
        emissiveIntensity: 0.3,
      });
    LM.emissive.push([a, 1.2, 0.3]);
    let l = new THREE.MeshStandardMaterial({
        color: 10692380,
      }),
      f = new THREE.Group(),
      u = new THREE.Mesh(new THREE.BoxGeometry(14, 1.9, 0.7), [l, l, l, l, a, a]);
    ((u.position.y = 7.4), f.add(u));
    for (let c of [-1, 1]) {
      let h = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.6, 0.8), l);
      (h.position.set(c * 7.2, 3.8, 0), f.add(h), dn(e + c * 7.2, i, 0.8, 0.8, 8));
    }
    (f.position.set(e, 0, i), (f.rotation.y = 0.15), R.scene.add(f), LM.meshes.push(f));
  }
  {
    let [e, i] = sr('palaceKeep'),
      s = new Mt({
        color: !0,
      });
    (s.setColor(9275e3).box(e, 0, i, 44, 11, 40, 0.1, {}),
      s.setColor(8222570).box(e, 0, i + 24, 12, 5, 10, 0.1, {}),
      Tn(s, R.M.paint),
      dn(e, i, 44, 40, 11, 0.1));
  }
  {
    let e = W.edges.filter((a) => a.kind === 'X' && W.roadNames[a.road] && W.roadNames[a.road].includes('\u53F0\u5834')),
      [i, s] = sr('rainbowBridge'),
      o = null,
      r = 1e9;
    for (let a of e)
      for (let l = 0; l < a.len; l += 10) {
        let f = edgePos(a, l, {}),
          u = Math.hypot(f.x - i, f.z - s);
        u < r &&
          ((r = u),
          (o = {
            e: a,
            s: l,
          }));
      }
    if (o) {
      let a = new Mt({
          color: !0,
        }),
        l = [],
        f = [o.s - 290, o.s + 290],
        u = (d) => {
          let p = edgePos(o.e, d, {});
          return 12 + 38 * Math.exp(-((Math.hypot(p.x - i, p.z - s) / 420) ** 2));
        },
        c = [];
      for (let d of f) {
        let p = edgePos(o.e, d, {}),
          x = p.dz,
          m = -p.dx,
          g = u(d);
        for (let M of [-1, 1])
          (a.setColor(15263456).box(p.x + x * M * 13, -2, p.z + m * M * 13, 4, 126, 5, Math.atan2(p.dz, p.dx), {}),
            dn(p.x + x * M * 13, p.z + m * M * 13, 4, 5, 126),
            c.push([p.x + x * M * 13, 124, p.z + m * M * 13, M]));
        (a.box(p.x, 100, p.z, 4, 6, 30, Math.atan2(p.dz, p.dx), {}), a.box(p.x, g - 6, p.z, 4, 4, 30, Math.atan2(p.dz, p.dx), {}));
      }
      for (let d of [-1, 1]) {
        if (c.filter((M) => M[3] === d).length < 2) continue;
        for (let M = 0; M <= 40; M++) {
          let y = o.s - 290 + M * 14.5,
            _ = edgePos(o.e, y, {}),
            v = _.dz,
            b = -_.dx,
            w = M / 40,
            E = u(y) + 2 + (124 - u(y) - 2) * (4 * (w - 0.5) * (w - 0.5));
          l.push([_.x + v * d * 13, E, _.z + b * d * 13]);
        }
        let x = [];
        for (let M = 0; M + 1 < l.length; M++) x.push(...l[M], ...l[M + 1]);
        for (let M = 0; M < l.length; M += 2) {
          let y = l[M];
          x.push(y[0], y[1], y[2], y[0], u(o.s - 290 + M * 14.5) + 1, y[2]);
        }
        let m = new THREE.BufferGeometry();
        m.setAttribute('position', new THREE.Float32BufferAttribute(x, 3));
        let g = new THREE.LineSegments(
          m,
          new THREE.LineBasicMaterial({
            color: 15263456,
          }),
        );
        (R.scene.add(g), LM.meshes.push(g), (l.length = 0));
      }
      Tn(a, R.M.paint);
      let h = [];
      for (let d = o.s - 300; d <= o.s + 300; d += 15) {
        let p = edgePos(o.e, d, {}),
          x = p.dz,
          m = -p.dx;
        for (let g of [-1, 1]) h.push([p.x + x * g * 13, u(d) + 1.5 + Math.sin(d * 0.05) * 0, p.z + m * g * 13, 1, 1, 1]);
      }
      LM.bridgeLights = h;
    }
  }
  AR();
}
function AR() {
  let n = new Mt({
      color: !0,
    }),
    t = new Mt({
      color: !0,
    }),
    e = new Mt({
      color: !0,
      aB: !0,
    }),
    i = new Mt({
      color: !0,
    }),
    s = [];
  for (let x of [HND.A, HND.C, HND.D]) {
    let [m, g] = runwayEnds(x),
      M = -x.uz,
      y = x.ux;
    n.setColor(3421754).quad(
      [m[0] - (M * x.w) / 2, 0.24, m[1] - (y * x.w) / 2],
      [m[0] + (M * x.w) / 2, 0.24, m[1] + (y * x.w) / 2],
      [g[0] + (M * x.w) / 2, 0.24, g[1] + (y * x.w) / 2],
      [g[0] - (M * x.w) / 2, 0.24, g[1] - (y * x.w) / 2],
      null,
    );
    let _ = (v, b, w, E) => {
      let C = [x.x + x.ux * v + M * w, x.z + x.uz * v + y * w],
        S = [x.x + x.ux * b + M * w, x.z + x.uz * b + y * w];
      t.setColor(15921902).quad(
        [C[0] - (M * E) / 2, 0.26, C[1] - (y * E) / 2],
        [C[0] + (M * E) / 2, 0.26, C[1] + (y * E) / 2],
        [S[0] + (M * E) / 2, 0.26, S[1] + (y * E) / 2],
        [S[0] - (M * E) / 2, 0.26, S[1] - (y * E) / 2],
        null,
      );
    };
    for (let v = -x.len / 2 + 120; v < x.len / 2 - 120; v += 60) _(v, v + 35, 0, 0.9);
    for (let v of [-1, 1]) _(-x.len / 2, x.len / 2, v * (x.w / 2 - 1.5), 0.9);
    for (let v of [-1, 1]) {
      for (let b = 0; b < 8; b++) for (let w of [-1, 1]) _(v * (x.len / 2 - 6) - v * 0, v * (x.len / 2 - 50), w * (4 + b * 3), 1.6);
      for (let b of [-1, 1]) _(v * (x.len / 2 - 330), v * (x.len / 2 - 390), b * 9, 9);
    }
    for (let v = -x.len / 2; v <= x.len / 2; v += 60)
      for (let b of [-1, 1]) s.push([x.x + x.ux * v + M * b * (x.w / 2 + 1), 0.6, x.z + x.uz * v + y * b * (x.w / 2 + 1), 1, 0.95, 0.8]);
    for (let v = 1; v <= 12; v++)
      for (let b of [-8, -4, 0, 4, 8]) s.push([m[0] - x.ux * v * 30 + M * b, 1, m[1] - x.uz * v * 30 + y * b, 1, 0.95, 0.85]);
  }
  let o = (HND.A.x + HND.C.x) / 2,
    r = (HND.A.z + HND.C.z) / 2,
    a = HND.ux,
    l = HND.uz,
    f = -l,
    u = a;
  for (let x of [-560, 560]) {
    let m = [o + f * x * 0.1 + a * -1500, r + u * x * 0.1 + l * -1500];
  }
  let c = (x, m, g, M, y) => {
      let _ = Math.cos(y),
        v = Math.sin(y),
        b = (w, E) => [x + _ * w - v * E, 0.23, m + v * w + _ * E];
      n.setColor(8159106).quad(b(-g / 2, -M / 2), b(g / 2, -M / 2), b(g / 2, M / 2), b(-g / 2, M / 2), null);
    },
    h = Math.atan2(l, a);
  for (let x of TERMS) {
    let [m, g] = x.c;
    (e.setColor([0.55, 0.66, 0.74]),
      (e.bv = [4, 3, 6, 0.7]),
      e.box(m, 0, g, x.L, 22, x.Wd, h, {}),
      dn(m, g, x.L, x.Wd, 24, h),
      i.setColor(14211806).box(m, 22, g, x.L + 10, 1.6, x.Wd + 16, h, {}));
  }
  let [d, p] = HND.tower;
  (i.setColor(13948632).cyl(d, 0, p, 7, 105, 16),
    e.setColor([0.25, 0.35, 0.42]),
    (e.bv = [4, 9, 3, 0.9]),
    e.box(d, 105, p, 15, 8, 15, h, {}),
    i.setColor(13948632).box(d, 113, p, 16, 1.2, 16, h, {}),
    dn(d, p, 16, 16, 115, h),
    LM.av.push([d, 116, p]),
    Tn(n, R.M.road, null, !1),
    Tn(t, R.M.mark, null, !1),
    Tn(e, R.M.building),
    Tn(i, R.M.metal),
    (LM.airLights = s),
    l_(),
    f_());
}
var vg = 0,
  _g = [
    ['TOKYO', '\u6E0B\u8C37\u30B9\u30AF\u30E9\u30F3\u30D6\u30EB'],
    ['\u65B0\u767A\u58F2', 'NEW DRINK'],
    ['SALE', '\u6700\u592770%OFF'],
    ['MUSIC', 'NEW SINGLE'],
    ['\u5287\u5834\u7248', 'NOW SHOWING'],
    ['SHUTO', 'OPEN CITY'],
  ];
function p_(n, t, e) {
  for (let [i, s, o] of LM.emissive) i.emissiveIntensity = (o || 0) + t * s;
  if (LM.spin) for (let i of LM.spin) i.rotation.z += n * i.userData.w;
  if (((vg -= n), LM.screens && vg <= 0)) {
    vg = 0.1;
    let i = u_();
    LM.screens.forEach((s, o) => {
      let r = s.ctx,
        a = Math.floor(i / 4 + o * 1.7) % _g.length,
        l = (a * 47 + o * 90) % 360,
        f = r.createLinearGradient(0, 0, 512, 288);
      (f.addColorStop(0, `hsl(${l},85%,55%)`),
        f.addColorStop(1, `hsl(${(l + 60) % 360},80%,22%)`),
        (r.fillStyle = f),
        r.fillRect(0, 0, 512, 288),
        (r.fillStyle = 'rgba(255,255,255,.14)'));
      for (let u = 0; u < 6; u++)
        (r.beginPath(), r.arc(((u * 101 + i * 80) % 600) - 40, 144 + Math.sin(i * 2 + u) * 80, 30 + u * 8, 0, 6.3), r.fill());
      ((r.fillStyle = '#fff'),
        (r.textAlign = 'center'),
        (r.textBaseline = 'middle'),
        (r.font = `900 ${88 + Math.sin(i * 3) * 6}px ${ce}`),
        r.fillText(_g[a][0], 256, 124),
        (r.font = `800 36px ${ce}`),
        r.fillText(_g[a][1], 256, 214),
        (s.t.needsUpdate = !0));
    });
  }
  if (t > 0.1 && u_() % 1.6 < 0.5) for (let s of LM.av) e.add(s[0], s[1], s[2], 1, 0.1, 0.06, 14);
}
var m_ = () => 0;
function x_(n) {
  m_ = n;
}
var u_ = () => m_();
var POL = {};
vi(POL, {
  HELI: () => HELI,
  TIER: () => TIER,
  crime: () => crime,
  forceStars: () => forceStars,
  policeSees: () => policeSees,
  resetPolice: () => resetPolice,
  updatePolice: () => updatePolice,
});
var V = {};
vi(V, {
  CT: () => CT,
  TYPES: () => TYPES,
  aiUpdate: () => aiUpdate,
  carCollisions: () => carCollisions,
  carsNear: () => carsNear,
  clearOcc: () => clearOcc,
  damageCar: () => damageCar,
  freeCar: () => freeCar,
  initVehicles: () => initVehicles,
  isCop: () => isCop,
  laneOff: () => laneOff,
  newCar: () => newCar,
  npcDrive: () => npcDrive,
  obstacleAhead: () => obstacleAhead,
  physCar: () => physCar,
  pickType: () => pickType,
  policeAI: () => policeAI,
  rebuildCarGrid: () => rebuildCarGrid,
  renderCars: () => renderCars,
  setColor: () => setColor,
  spawnAICar: () => spawnAICar,
  surfaceAt: () => surfaceAt,
  toPhys: () => toPhys,
  tryRecover: () => tryRecover,
});
var CT = {
    sedan: {
      L: 4.91,
      W: 1.8,
      H: 1.455,
      wb: 2.92,
      r: 0.33,
      hood: 0.86,
      belt: 0.92,
      ws: [1.55, 2.35],
      rw: [3.75, 4.35],
      deck: 0.95,
      vmax: 50,
      acc: 9,
      w: 18,
      name: '\u30ED\u30A4\u30E4\u30EB\u30BB\u30C0\u30F3',
      col: [15921904, 1447706, 12172480, 8225159, 1911882, 7216162, 3095347],
    },
    hybrid: {
      L: 4.6,
      W: 1.78,
      H: 1.43,
      wb: 2.75,
      r: 0.32,
      hood: 0.84,
      belt: 0.9,
      ws: [1.15, 2.2],
      rw: [3.35, 4.45],
      deck: 1,
      vmax: 48,
      acc: 8.5,
      w: 18,
      name: '\u30A8\u30B3\u30CF\u30A4\u30D6\u30EA\u30C3\u30C9',
      col: [15921904, 13817046, 1447706, 10134443, 9051682, 2837114],
    },
    compact: {
      L: 3.94,
      W: 1.695,
      H: 1.5,
      wb: 2.55,
      r: 0.3,
      hood: 0.86,
      belt: 0.95,
      ws: [0.95, 1.75],
      rw: [3.15, 3.85],
      deck: 1,
      vmax: 44,
      acc: 8,
      w: 16,
      name: '\u30B3\u30F3\u30D1\u30AF\u30C8\u30AB\u30FC',
      col: [15921904, 13111342, 2781109, 15326400, 4014663, 15909424, 7316330],
    },
    kei: {
      L: 3.395,
      W: 1.475,
      H: 1.79,
      wb: 2.52,
      r: 0.28,
      hood: 0.95,
      belt: 1,
      ws: [0.55, 1.15],
      rw: [3.3, 3.39],
      deck: 1,
      vmax: 38,
      acc: 7.5,
      w: 22,
      name: '\u8EFD\u30CF\u30A4\u30C8\u30EF\u30B4\u30F3',
      col: [15921904, 15260072, 10471384, 15775936, 2763566, 13817046, 9417098, 15231511],
    },
    suv: {
      L: 4.74,
      W: 1.855,
      H: 1.66,
      wb: 2.69,
      r: 0.37,
      hood: 1.05,
      belt: 1.1,
      ws: [1.05, 1.95],
      rw: [4.15, 4.6],
      deck: 1.15,
      vmax: 48,
      acc: 8.5,
      w: 10,
      name: '\u30AF\u30ED\u30B9\u30AA\u30FC\u30D0\u30FCSUV',
      col: [15921904, 1447706, 7040626, 3820090, 8006178, 2767450],
    },
    van: {
      L: 4.995,
      W: 1.85,
      H: 1.935,
      wb: 3,
      r: 0.35,
      hood: 1,
      belt: 1.08,
      ws: [0.75, 1.55],
      rw: [4.85, 4.98],
      deck: 1.1,
      vmax: 46,
      acc: 8,
      w: 10,
      name: '\u30E9\u30FC\u30B8\u30DF\u30CB\u30D0\u30F3',
      col: [15921904, 1447706, 12172480, 3882306],
    },
    taxi: {
      L: 4.4,
      W: 1.695,
      H: 1.75,
      wb: 2.75,
      r: 0.31,
      hood: 0.92,
      belt: 1,
      ws: [0.85, 1.7],
      rw: [4.15, 4.38],
      deck: 1,
      vmax: 46,
      acc: 8.5,
      w: 14,
      name: '\u30BF\u30AF\u30B7\u30FC',
      col: [1844032, 1844032, 1447446, 15909424, 3112266, 14209208],
    },
    delivery: {
      L: 4.695,
      W: 1.695,
      H: 1.98,
      wb: 2.57,
      r: 0.33,
      hood: 1,
      belt: 1.1,
      ws: [0.35, 1.05],
      rw: [4.69, 4.69],
      deck: 1.1,
      vmax: 40,
      acc: 7,
      w: 6,
      name: '\u914D\u9001\u30D0\u30F3',
      col: [15921904, 15921904, 16765952, 2779706],
    },
    truck: {
      L: 7,
      W: 2.2,
      H: 3.15,
      wb: 4,
      r: 0.45,
      vmax: 32,
      acc: 5,
      w: 5,
      name: '\u4E2D\u578B\u30C8\u30E9\u30C3\u30AF',
      col: [15921904, 2776232, 3967562, 14211280],
    },
    bus: {
      L: 10.7,
      W: 2.49,
      H: 3.05,
      wb: 5.3,
      r: 0.5,
      vmax: 28,
      acc: 3.8,
      w: 0,
      name: '\u90FD\u55B6\u30D0\u30B9',
      col: [3115598],
    },
    police: {
      L: 4.895,
      W: 1.8,
      H: 1.47,
      wb: 2.92,
      r: 0.33,
      hood: 0.86,
      belt: 0.92,
      ws: [1.55, 2.35],
      rw: [3.75, 4.35],
      deck: 0.95,
      vmax: 58,
      acc: 11,
      w: 2,
      name: '\u30D1\u30C8\u30AB\u30FC',
      col: [16777215],
    },
    riot: {
      L: 7,
      W: 2.1,
      H: 2.7,
      wb: 3.9,
      r: 0.42,
      vmax: 40,
      acc: 6,
      w: 0,
      name: '\u6A5F\u52D5\u968A\u8ECA\u4E21',
      col: [1911898],
    },
    super: {
      L: 4.6,
      W: 2.03,
      H: 1.13,
      wb: 2.7,
      r: 0.36,
      hood: 0.7,
      belt: 0.74,
      ws: [1.45, 2.45],
      rw: [3, 4.45],
      deck: 0.86,
      vmax: 92,
      acc: 21,
      w: 0.6,
      name: '\u30B9\u30FC\u30D1\u30FC\u30AB\u30FC',
      col: [15909424, 13111342, 1447963, 15921904, 3115598, 15231511, 5909130],
    },
    keitora: {
      L: 3.395,
      W: 1.475,
      H: 1.78,
      wb: 1.9,
      r: 0.28,
      vmax: 32,
      acc: 6,
      w: 4,
      name: '\u8EFD\u30C8\u30E9\u30C3\u30AF',
      col: [15921904, 15921904, 13817046, 2781109],
    },
    scooter: {
      L: 1.8,
      W: 0.68,
      H: 1.12,
      wb: 1.27,
      r: 0.26,
      vmax: 16.5,
      acc: 4.6,
      w: 5,
      name: '\u539F\u4ED8\u30B9\u30AF\u30FC\u30BF\u30FC',
      bike: 'scooter',
      col: [15921904, 13111342, 1911882, 15326400, 7316330, 1447706, 15775936],
    },
    moto: {
      L: 2.08,
      W: 0.78,
      H: 1.15,
      wb: 1.42,
      r: 0.31,
      vmax: 68,
      acc: 15,
      w: 2.5,
      name: '\u30B9\u30DD\u30FC\u30C4\u30D0\u30A4\u30AF',
      bike: 'moto',
      col: [13111342, 1447706, 1990574, 15921904, 3115598, 15909424, 15231511],
    },
    polbike: {
      L: 2.2,
      W: 0.85,
      H: 1.3,
      wb: 1.5,
      r: 0.31,
      vmax: 60,
      acc: 13,
      w: 0,
      name: '\u767D\u30D0\u30A4',
      bike: 'moto',
      col: [16777215],
    },
    bicycle: {
      L: 1.75,
      W: 0.55,
      H: 1.05,
      wb: 1.12,
      r: 0.33,
      vmax: 8.5,
      acc: 2.6,
      w: 2,
      name: '\u30DE\u30DE\u30C1\u30E3\u30EA',
      bike: 'cycle',
      col: [15921904, 10134443, 13111342, 2781109, 15909424, 1447706],
    },
    ambulance: {
      L: 5.65,
      W: 1.88,
      H: 2.52,
      wb: 3.1,
      r: 0.36,
      vmax: 44,
      acc: 7,
      w: 0,
      name: '\u6551\u6025\u8ECA',
      col: [16777215],
    },
    fire: {
      L: 7.7,
      W: 2.3,
      H: 3.05,
      wb: 4.2,
      r: 0.45,
      vmax: 34,
      acc: 5,
      w: 0,
      name: '\u6D88\u9632\u8ECA',
      col: [13638684],
    },
    sdf: {
      L: 6.84,
      W: 2.48,
      H: 2.6,
      wb: 4.3,
      r: 0.55,
      vmax: 30,
      acc: 6.5,
      w: 0,
      name: '\u81EA\u885B\u968A \u88C5\u8F2A\u88C5\u7532\u8ECA',
      col: [4870710],
    },
    sport: {
      L: 4.71,
      W: 1.895,
      H: 1.37,
      wb: 2.78,
      r: 0.36,
      hood: 0.78,
      belt: 0.85,
      ws: [1.6, 2.5],
      rw: [3.45, 4.5],
      deck: 0.92,
      vmax: 75,
      acc: 15,
      w: 3,
      name: 'GT\u30B9\u30DD\u30FC\u30C4',
      col: [13111342, 15909424, 1990574, 15921904, 1447963, 15231511],
    },
  },
  TYPES = Object.keys(CT),
  Ce = 0,
  di = 1,
  Gr = 2,
  Fi = 3,
  or = 4,
  Hi = 5,
  Te = 6,
  wg = 7,
  Gp = (n, t, e) => {
    let i = It((e - n) / (t - n), 0, 1);
    return i * i * (3 - 2 * i);
  };
function RR(n, t, e, i) {
  let s = t.L,
    o = t.W / 2,
    r = t.H,
    a = s / 2,
    l = t.r * 0.55,
    f = a - t.ws[0],
    u = a - t.ws[1],
    c = a - t.rw[0],
    h = a - t.rw[1],
    d = (M) =>
      M > f
        ? t.hood + (a - M < 0.25 ? -0.08 * (1 - (a - M) / 0.25) : 0)
        : M > u
          ? Ee(t.hood + 0.04, r, Gp(f, u, M))
          : M > c
            ? r - 0.012 * Math.abs(M - (u + c) / 2)
            : M > h
              ? Ee(r, t.deck, Gp(c, h, M))
              : t.deck - (M - -a < 0.2 ? 0.06 * (1 - (M + a) / 0.2) : 0),
    p = (M) => o * (1 - 0.1 * Gp(a - 0.35, a, M) - 0.08 * Gp(-a + 0.35, -a, M)),
    x = [];
  for (let M of [-a, -a + 0.12, -a + 0.35, h, (h + c) / 2, c, (c + u) / 2, u, (u + f) / 2, f, (f + a) / 2, a - 0.35, a - 0.12, a])
    (!x.length || M > x[x.length - 1] + 0.02) && x.push(M);
  let m = (M) => {
      let y = p(M),
        _ = d(M),
        v = t.belt + (M > f ? -0.02 : 0),
        b = M <= f + 0.01 && M >= h - 0.01,
        w = b ? y * (_ > v + 0.25 ? 0.8 : 0.92) : y * 0.94;
      return [
        [0, l],
        [y - 0.08, l],
        [y, l + 0.16],
        [y, v],
        [b ? w + (y - w) * 0.35 : y * 0.97, Math.min(_, v + (_ - v) * 0.55)],
        [w, _ - 0.03],
        [w * 0.82, _],
        [0, _],
      ];
    },
    g = (M, y) => {
      let _ = y <= f && y >= h;
      return M === 0
        ? Gr
        : M === 1
          ? Te
          : M === 2
            ? Ce
            : M === 3 || M === 4
              ? _ && d(y) > t.belt + 0.3
                ? di
                : Ce
              : (M === 5 || M === 6) && ((y < f && y > u) || (y < c && y > h))
                ? di
                : Ce;
    };
  for (let M = 0; M + 1 < x.length; M++) {
    let y = x[M],
      _ = x[M + 1],
      v = m(y),
      b = m(_),
      w = (y + _) / 2;
    for (let E = 0; E + 1 < v.length; E++) {
      let C = g(E, w);
      ((n.mv = C), n.setColor(C === di ? 1712425 : C === Ce ? (E >= 3 ? e : i) : C === Gr ? 1118740 : 2763566));
      for (let S of [1, -1]) {
        let T = [v[E][0] * S, v[E][1], y],
          D = [v[E + 1][0] * S, v[E + 1][1], y],
          O = [b[E][0] * S, b[E][1], _],
          U = [b[E + 1][0] * S, b[E + 1][1], _];
        S > 0 ? n.quad(T, D, U, O, null) : n.quad(T, O, U, D, null);
      }
    }
  }
  for (let [M, y, _] of [
    [x[0], m(x[0]), -1],
    [x[x.length - 1], m(x[x.length - 1]), 1],
  ]) {
    ((n.mv = Ce), n.setColor(i));
    for (let v = 0; v + 1 < y.length; v++)
      for (let b of [1, -1]) {
        let w = [0, (y[0][1] + y[y.length - 1][1]) / 2, M],
          E = [y[v][0] * b, y[v][1], M],
          C = [y[v + 1][0] * b, y[v + 1][1], M];
        _ * b > 0 ? n.tri(w, E, C, [0, 0, _]) : n.tri(w, C, E, [0, 0, _]);
      }
  }
  return {
    F: a,
    hw: o,
    zW0: f,
    top: d,
    half: p,
  };
}
function CR(n) {
  let t = CT[n],
    e = new Mt({
      color: !0,
      mat: !0,
    }),
    i = t.L,
    s = t.W,
    o = s / 2,
    r = i / 2,
    a = (u, c) => ((e.mv = u), e.setColor(c), e),
    l = (u, c, h, d) => {
      (a(Gr, 1316120).cylX(u, h, c, h, d, 14),
        a(Fi, 11843772).cylX(u + Math.sign(u) * 0.012, h, c, h * 0.62, d + 0.02, 10),
        a(Te, 3816512).cylX(u + Math.sign(u) * 0.02, h, c, h * 0.2, d + 0.03, 8));
    },
    f = (u, c, h) => {
      (a(Te, 15921894).box(0, u, c + h * 0.01, 0.34, 0.17, 0.02, 0, {}), a(Te, 2779706).box(0, u + 0.035, c + h * 0.022, 0.24, 0.04, 0.005, 0, {}));
    };
  if (t.bike) return zR(n, t, e, a, l, f);
  if (n === 'ambulance' || n === 'fire') return PR(n, t, e, a, l, f);
  if (n === 'sdf') {
    let u = t.L,
      c = t.W,
      h = c / 2,
      d = u / 2;
    (a(Ce, 16777215).box(0, 0.75, -0.3, c, 1.25, u - 1.2, 0, {}),
      a(Ce, 16777215).box(0, 0.75, d - 0.9, c - 0.3, 0.9, 1.2, 0, {}),
      a(Ce, 16777215).box(0, 2, -0.4, c - 0.2, 0.25, u - 1.6, 0, {}));
    for (let p = 0; p < 6; p++) a(Ce, 3818032).box(0, 1.35 + (p % 2) * 0.3, -d + 0.8 + p * 0.95, c + 0.02, 0.14, 0.5, 0, {});
    (a(Ce, 16777215).box(0, 2.25, -0.6, 1.5, 0.55, 1.8, 0, {}),
      a(Te, 1710618).box(0, 2.45, 0.9, 0.12, 0.12, 1.6, 0, {}),
      a(di, 1778219).box(0, 1.55, d - 0.35, c - 0.7, 0.35, 0.05, 0, {}));
    for (let p of [-1, 1])
      (a(or, 16774360).box(p * (h - 0.3), 1, d + 0.01, 0.2, 0.12, 0.05, 0, {}),
        a(Hi, 11736092).box(p * (h - 0.25), 1, -d + 0.4, 0.2, 0.12, 0.05, 0, {}));
    for (let p = 0; p < 4; p++) for (let x of [-1, 1]) l(x * (h - 0.22), d - 1 - p * 1.45, t.r, 0.42);
    return e.build();
  }
  if (n === 'keitora') {
    let u = t.L,
      c = t.W,
      h = c / 2,
      d = u / 2;
    (a(Ce, 16777215).box(0, 0.4, d - 0.65, c - 0.04, 1, 1.3, 0, {}),
      a(Ce, 16777215).box(0, 1.4, d - 0.75, c - 0.1, 0.38, 1.1, 0, {}),
      a(di, 1778219).box(0, 1.2, d - 0.04, c - 0.2, 0.55, 0.05, 0, {}));
    for (let p of [-1, 1]) a(di, 1778219).box(p * (h - 0.03), 1.25, d - 0.7, 0.05, 0.45, 0.8, 0, {});
    a(Te, 10132895).box(0, 0.55, -0.55, c - 0.02, 0.06, 2, 0, {});
    for (let p of [-1, 1]) a(Ce, 16777215).box(p * (h - 0.03), 0.58, -0.55, 0.05, 0.38, 2, 0, {});
    (a(Ce, 16777215).box(0, 0.58, -d + 0.03, c - 0.02, 0.38, 0.05, 0, {}), a(Te, 3816512).box(0, 0.9, d - 1.32, c - 0.1, 0.5, 0.05, 0, {}));
    for (let p of [-1, 1])
      (a(or, 16774360).box(p * (h - 0.25), 0.75, d + 0.01, 0.26, 0.14, 0.05, 0, {}),
        a(Hi, 11736092).box(p * (h - 0.15), 0.5, -d - 0.02, 0.14, 0.2, 0.05, 0, {}));
    f(0.45, d + 0.02, 1);
    for (let p of [d - 0.45, d - 0.45 - t.wb]) for (let x of [-1, 1]) l(x * (h - 0.14), p, t.r, 0.2);
    return e.build();
  }
  if (t.ws) {
    let u = n === 'police',
      c = u ? 1447963 : 16777215,
      h = u ? 16053488 : 16777215,
      d = RR(e, t, h, c),
      p = t.hood - 0.12,
      x = t.deck - 0.12;
    for (let M of [-1, 1])
      (a(or, 16774360).box(M * (d.half(r - 0.1) - 0.25), p, r - 0.06, 0.42, 0.11, 0.1, 0, {}),
        a(Hi, 11736092).box(M * (d.half(-r + 0.1) - 0.22), x, -r + 0.05, 0.38, 0.13, 0.1, 0, {}));
    (a(Te, 1908256).box(0, p - 0.1, r - 0.02, s * 0.42, 0.2, 0.06, 0, {}),
      (n === 'sedan' || n === 'police') && a(Fi, 11843772).box(0, p - 0.1, r + 0.005, s * 0.44, 0.03, 0.04, 0, {}),
      a(Te, 2763566).box(0, t.r * 0.85, r - 0.05, s - 0.08, 0.2, 0.12, 0, {}),
      a(Te, 2763566).box(0, t.r * 0.85, -r + 0.05, s - 0.1, 0.2, 0.12, 0, {}),
      f(t.r * 0.95, r, 1),
      f(t.r * 1.25, -r, -1));
    for (let M of [-1, 1]) a(Ce, h).box(M * (o + 0.08), t.belt + 0.1, d.zW0 - 0.15, 0.16, 0.11, 0.16, 0, {});
    for (let M of [d.zW0 - 0.25, (d.zW0 + r - t.rw[0]) / 2])
      for (let y of [-1, 1]) a(Te, 1118481).box(y * (o + 0.004), t.r + 0.25, M, 0.01, t.belt - t.r - 0.2, 0.012, 0, {});
    let m = r - (i - t.wb) / 2 + (n === 'kei' ? 0.05 : 0),
      g = m - t.wb;
    for (let M of [m, g])
      for (let y of [-1, 1]) (a(Te, 921360).box(y * (o - 0.02), t.r * 0.4, M, 0.06, t.r * 1.25, t.r * 2.25, 0, {}), l(y * (o - 0.13), M, t.r, 0.24));
    if (
      (n === 'taxi' &&
        (a(wg, 16771488).box(0, t.H + 0.02, r - t.ws[1] - 0.35, 0.42, 0.2, 0.18, 0, {}),
        a(Te, 15909424).box(0, t.belt - 0.15, 0, s + 0.01, 0.06, 2.2, 0, {})),
      n === 'police')
    ) {
      let M = r - t.ws[1] - 0.45;
      (a(Te, 1710618).box(0, t.H, M, 1.3, 0.06, 0.36, 0, {}),
        a(Hi, 16722464).box(0, t.H + 0.06, M, 1.24, 0.13, 0.3, 0, {}),
        a(Ce, 16053488).box(0, t.belt - 0.28, -0.2, s + 0.012, 0.3, i * 0.48, 0, {}));
    }
    if (n === 'super') {
      for (let M of [-1, 1]) a(Te, 1447963).box(M * (o - 0.05), t.belt - 0.05, -0.2, 0.06, 0.25, 1, 0, {});
      a(Te, 1447963).box(0, t.deck + 0.2, -r + 0.2, s - 0.2, 0.04, 0.35, 0, {});
    }
    if (n === 'sport') {
      a(Te, 1447963).box(0, t.deck + 0.18, -r + 0.25, s - 0.25, 0.05, 0.3, 0, {});
      for (let M of [-0.6, 0.6]) a(Te, 1447963).box(M, t.deck, -r + 0.28, 0.06, 0.2, 0.1, 0, {});
    }
    if (
      (n === 'delivery' &&
        (a(Ce, 16777215).box(0, 1, -0.55, s + 0.012, 0.75, i - 2, 0, {}), a(Ce, 2779706).box(0, 1.05, -0.55, s + 0.02, 0.16, i - 2.1, 0, {})),
      n === 'van' || n === 'kei')
    )
      for (let M of [-1, 1]) a(Fi, 10133154).box(M * (o + 0.005), t.belt - 0.05, -0.3, 0.012, 0.03, i * 0.45, 0, {});
  } else if (n === 'truck') {
    (a(Ce, 16777215).box(0, 0.55, r - 0.95, s - 0.06, 1.75, 1.85, 0, {}),
      a(Ce, 16777215).box(0, 2.3, r - 1.05, s - 0.16, 0.25, 1.6, 0, {}),
      a(di, 1778219).box(0, 1.6, r - 0.02, s - 0.3, 0.75, 0.06, 0, {}));
    for (let u of [-1, 1]) a(di, 1778219).box(u * (o - 0.02), 1.65, r - 0.75, 0.06, 0.6, 0.85, 0, {});
    (a(Te, 15132906).box(0, 0.85, -0.95, s, 2.3, 4.9, 0, {}),
      a(Te, 13159116).box(0, 0.85, -3.42, s - 0.04, 2.3, 0.05, 0, {}),
      a(Te, 2236962).box(0, 0.45, 0, 1.4, 0.35, i - 0.3, 0, {}));
    for (let u of [-1, 1])
      (a(or, 16774360).box(u * (o - 0.3), 0.75, r + 0.01, 0.36, 0.16, 0.06, 0, {}),
        a(Hi, 11736092).box(u * (o - 0.25), 0.7, -r - 0.02, 0.3, 0.16, 0.05, 0, {}),
        a(Ce, 16777215).box(u * (o + 0.12), 1.9, r - 0.25, 0.08, 0.4, 0.08, 0, {}));
    f(0.6, r, 1);
    for (let u of [r - 1.15, r - 1.15 - t.wb, r - 1.15 - t.wb - 1.2]) for (let c of [-1, 1]) l(c * (o - 0.2), u, t.r, 0.34);
  } else {
    let u = n === 'bus';
    if (
      (a(Ce, u ? 15921900 : 16777215).box(0, 0.38, 0, s, 1, i, 0, {}),
      a(Ce, 16777215).box(0, 1.38, 0, s, 0.22, i, 0, {}),
      a(Te, u ? 15921900 : 1911898).box(0, 2.45, 0, s, 0.55, i, 0, {}),
      a(di, 1778219).box(0, 1.6, -0.2, s + 0.02, 0.88, i - 1.6, 0, {}),
      a(di, 1778219).box(0, 0.95, r + 0.01, s - 0.15, 1.9, 0.05, 0, {}),
      a(di, 1778219).box(0, 1.6, -r - 0.01, s - 0.4, 0.8, 0.04, 0, {}),
      u)
    ) {
      (a(wg, 16756736).box(0, 2.62, r + 0.03, 1.7, 0.28, 0.04, 0, {}), a(wg, 16756736).box(-o - 0.01, 2.62, r - 1.6, 0.03, 0.22, 1.4, 0, {}));
      for (let h of [r - 1, -0.6]) a(Te, 2764080).box(o + 0.01, 0.35, h, 0.03, 2.05, 1.05, 0, {});
    }
    a(Te, 14211804).box(0, 3, -0.5, s - 0.3, 0.12, i * 0.45, 0, {});
    for (let h of [-1, 1])
      (a(or, 16774360).box(h * (o - 0.35), 0.62, r + 0.01, 0.34, 0.14, 0.06, 0, {}),
        a(Hi, 11736092).box(h * (o - 0.3), 0.8, -r - 0.01, 0.26, 0.3, 0.05, 0, {}));
    if (!u) {
      a(Hi, 16722464).box(0, 2.78, r - 0.6, 1.2, 0.12, 0.25, 0, {});
      for (let h of [-1, 1]) a(Te, 1118481).box(h * (o + 0.005), 1.6, -0.2, 0.01, 0.9, i - 1.6, 0, {});
    }
    f(0.5, r, 1);
    let c = r - (i - t.wb) / 2 + 0.2;
    for (let h of [c, c - t.wb]) for (let d of [-1, 1]) l(d * (o - 0.22), h, t.r, 0.34);
  }
  return e.build();
}
function zR(n, t, e, i, s, o) {
  let r = t.wb / 2,
    a = t.r,
    l = t.bike,
    f = n === 'polbike',
    u = (c, h) => {
      (i(Gr, 1316120).cylX(0, a, c, a, h, 16),
        i(Fi, l === 'cycle' ? 13159632 : 6975090).cylX(0, a, c, a * (l === 'cycle' ? 0.9 : 0.68), h + 0.012, 12),
        i(Te, 3816512).cylX(0, a, c, a * 0.16, h + 0.04, 8));
    };
  if (l === 'cycle') {
    (u(r, 0.05), u(-r, 0.05));
    for (let c = 0; c <= 6; c++) {
      let h = c / 6;
      i(Ce, 16777215).box(0, Ee(0.45, 0.82, h), Ee(-0.05, r - 0.12, h), 0.045, 0.06, 0.12, 0, {});
    }
    for (let c = 0; c <= 5; c++) {
      let h = c / 5;
      i(Ce, 16777215).box(0, Ee(0.42, 0.88, h), Ee(-0.08, -0.2, h), 0.045, 0.1, 0.05, 0, {});
    }
    return (
      i(Ce, 16777215).box(0, a, -r / 2 - 0.05, 0.12, 0.04, r, 0, {}),
      i(Fi, 11843772).box(0, 0.7, r - 0.08, 0.04, 0.6, 0.04, 0, {}),
      i(Gr, 1907999).box(0, 0.92, -0.22, 0.17, 0.06, 0.24, 0, {}),
      i(Fi, 11843772).box(0, 1, r - 0.12, 0.56, 0.03, 0.03, 0, {}),
      i(Fi, 13159632).box(0, 0.86, r + 0.08, 0.34, 0.24, 0.28, 0, {}),
      i(Te, 2763566).box(0, 0.55, -0.5, 0.2, 0.03, 0.42, 0, {}),
      i(or, 16774360).box(0, 0.76, r + 0.24, 0.07, 0.07, 0.04, 0, {}),
      i(Te, 2763566).box(0, a + 0.02, 0, 0.1, 0.12, 0.2, 0, {}),
      e.build()
    );
  }
  if ((u(r, l === 'scooter' ? 0.11 : 0.14), u(-r, l === 'scooter' ? 0.12 : 0.19), l === 'scooter'))
    return (
      i(Ce, 16777215).box(0, 0.26, 0.08, 0.36, 0.08, 0.78, 0, {}),
      i(Ce, 16777215).box(0, 0.36, -0.46, 0.42, 0.4, 0.78, 0, {}),
      i(Gr, 1907999).box(0, 0.76, -0.4, 0.3, 0.1, 0.62, 0, {}),
      i(Ce, 16777215).box(0, 0.32, 0.55, 0.42, 0.62, 0.14, 0, {}),
      i(Te, 2763566).box(0, 0.72, 0.6, 0.07, 0.42, 0.07, 0, {}),
      i(Ce, 16777215).box(0, 0.98, 0.6, 0.34, 0.12, 0.14, 0, {}),
      i(Te, 2763566).box(0, 1.03, 0.58, 0.62, 0.035, 0.035, 0, {}),
      i(or, 16774360).box(0, 0.99, 0.68, 0.14, 0.08, 0.03, 0, {}),
      i(Hi, 11736092).box(0, 0.52, -0.87, 0.16, 0.06, 0.03, 0, {}),
      i(Te, 2763566).box(0, a, r, 0.06, 0.06, 0.2, 0, {}),
      i(Fi, 9080466).box(0.13, 0.3, -0.55, 0.06, 0.06, 0.35, 0, {}),
      o(0.45, -0.88, -1),
      e.build()
    );
  (i(Te, 2763566).box(0, 0.42, 0.02, 0.28, 0.3, 0.48, 0, {}),
    i(Fi, 9080466).box(0, 0.3, 0.02, 0.2, 0.06, 0.52, 0, {}),
    i(Ce, 16777215).box(0, 0.8, 0.18, 0.32, 0.24, 0.48, 0, {}),
    i(Ce, 16777215).box(0, 0.62, 0.15, 0.36, 0.2, 0.8, 0, {}),
    i(Gr, 1907999).box(0, 0.84, -0.32, 0.26, 0.1, 0.52, 0, {}),
    i(Ce, 16777215).box(0, 0.88, -0.66, 0.2, 0.14, 0.32, 0, {}),
    i(Ce, 16777215).box(0, 0.78, 0.6, 0.38, 0.42, 0.26, 0, {}),
    i(di, 2765888).box(0, 1.06, 0.62, 0.32, 0.22, 0.05, 0, {}));
  for (let c of [-1, 1]) i(Fi, 11843772).box(c * 0.08, 0.6, r - 0.12, 0.04, 0.62, 0.04, 0, {});
  if (
    (i(Te, 2763566).box(0, 0.98, 0.5, 0.66, 0.035, 0.035, 0, {}),
    i(or, 16774360).box(0, 0.8, 0.74, 0.18, 0.1, 0.04, 0, {}),
    i(Hi, 11736092).box(0, 0.86, -0.83, 0.14, 0.06, 0.03, 0, {}),
    i(Fi, 9080466).box(0.17, 0.42, -0.45, 0.09, 0.09, 0.62, 0, {}),
    i(Te, 1447706).box(0, a + 0.2, -r + 0.05, 0.08, 0.06, 0.6, 0, {}),
    o(0.62, -0.86, -1),
    f)
  ) {
    i(Hi, 16722464).box(0, 1.22, 0.55, 0.1, 0.1, 0.06, 0, {});
    for (let c of [-1, 1])
      (i(Ce, 16053488).box(c * 0.32, 0.62, -0.5, 0.18, 0.34, 0.5, 0, {}), i(Hi, 16722464).box(c * 0.25, 0.95, -0.72, 0.06, 0.08, 0.06, 0, {}));
    i(Ce, 16777215).box(0, 0.5, 0.6, 0.4, 0.06, 0.3, 0, {});
  }
  return e.build();
}
function PR(n, t, e, i, s, o) {
  let r = t.L,
    a = t.W,
    l = a / 2,
    f = r / 2,
    u = n === 'ambulance',
    c = u ? 16777215 : 13638684;
  if (u) {
    (i(Ce, c).box(0, 0.42, f - 0.8, a - 0.06, 1, 1.6, 0, {}),
      i(di, 1778219).box(0, 1.42, f - 0.55, a - 0.2, 0.6, 0.9, 0, {}),
      i(Ce, c).box(0, 2, f - 0.9, a - 0.1, 0.12, 1.6, 0, {}),
      i(Ce, c).box(0, 0.42, -0.8, a, 2.08, r - 1.6, 0, {}),
      i(Ce, 13638684).box(0, 1.05, -0.4, a + 0.02, 0.18, r - 0.8, 0, {}),
      i(Te, 15921904).box(0, 2.5, -0.8, a - 0.2, 0.06, r - 1.8, 0, {}));
    for (let d of [-1, 1]) i(di, 1778219).box(d * (l + 0.005), 1.85, -0.5, 0.01, 0.35, 1, 0, {});
    (i(di, 1778219).box(0, 1.6, -f - 0.005, 1, 0.5, 0.01, 0, {}), i(Hi, 16722464).box(0, 2.56, f - 1.5, 1.4, 0.13, 0.25, 0, {}));
    for (let d of [-1, 1]) i(Hi, 16722464).box(d * (l - 0.15), 2.48, -f + 0.15, 0.15, 0.12, 0.12, 0, {});
  } else {
    (i(Ce, c).box(0, 0.5, f - 1, a - 0.06, 1.95, 2, 0, {}), i(di, 1778219).box(0, 1.65, f - 0.02, a - 0.3, 0.75, 0.06, 0, {}));
    for (let d of [-1, 1]) i(di, 1778219).box(d * (l - 0.02), 1.65, f - 0.8, 0.06, 0.6, 1, 0, {});
    (i(Ce, c).box(0, 0.5, -1, a, 1.9, r - 2, 0, {}), i(Fi, 12106944).box(0, 0.9, -1, a + 0.02, 0.5, r - 2.3, 0, {}));
    for (let d = 0; d < 6; d++) i(Te, 9048080).box(l + 0.015, 1.25, -f + 0.8 + d * 0.9, 0.01, 0.9, 0.04, 0, {});
    i(Fi, 14211804).box(0, 2.5, -0.8, 0.6, 0.5, r - 2.6, 0, {});
    for (let d of [-1, 1]) i(Fi, 14211804).box(d * 0.28, 2.75, -0.8, 0.05, 0.05, r - 2.4, 0, {});
    for (let d = 0; d < 7; d++) i(Fi, 14211804).box(0, 2.75, -f + 1.2 + d * 0.75, 0.6, 0.05, 0.05, 0, {});
    (i(Hi, 16722464).box(0, 2.52, f - 1, 1.6, 0.14, 0.3, 0, {}), i(Te, 15921904).box(0, 0.7, f + 0.01, 1.4, 0.18, 0.02, 0, {}));
  }
  for (let d of [-1, 1])
    (i(or, 16774360).box(d * (l - 0.3), 0.75, f + 0.01, 0.36, 0.16, 0.06, 0, {}),
      i(Hi, 11736092).box(d * (l - 0.25), 0.7, -f - 0.02, 0.26, 0.2, 0.05, 0, {}));
  (i(Te, 2763566).box(0, t.r * 0.8, f - 0.05, a - 0.06, 0.22, 0.12, 0, {}), o(0.55, f + 0.06, 1));
  let h = f - (r - t.wb) / 2 + 0.1;
  for (let d of [h, h - t.wb]) for (let p of [-1, 1]) s(p * (l - 0.18), d, t.r, 0.3);
  return e.build();
}
function kR() {
  let n = new Mt({
      color: !0,
      mat: !0,
    }),
    t = (e, i) => ((n.mv = e), n.setColor(i), n);
  (t(Te, 16777215).box(0, 0.86, -0.22, 0.36, 0.5, 0.24, 0, {}),
    t(Te, 16777215).box(0, 1.28, -0.16, 0.4, 0.1, 0.24, 0, {}),
    t(Te, 14727318).box(0, 1.35, -0.14, 0.09, 0.08, 0.09, 0, {}),
    t(Ce, 2105894).ell(0, 1.5, -0.12, 0.14, 0.15, 0.15, 10, 6),
    t(di, 1711910).box(0, 1.5, 0.02, 0.2, 0.08, 0.04, 0, {}));
  for (let e of [-1, 1])
    (t(Te, 16777215).box(e * 0.22, 1.18, 0.14, 0.09, 0.09, 0.62, 0, {}),
      t(Te, 1907999).box(e * 0.24, 1.08, 0.46, 0.08, 0.08, 0.08, 0, {}),
      t(Te, 2764088).box(e * 0.13, 0.72, 0.02, 0.14, 0.14, 0.5, 0, {}),
      t(Te, 2764088).box(e * 0.15, 0.46, 0.24, 0.12, 0.5, 0.12, 0, {}),
      t(Gr, 1118481).box(e * 0.15, 0.22, 0.3, 0.11, 0.08, 0.22, 0, {}));
  return n.build();
}
Mt.prototype.cylX = function (n, t, e, i, s, o = 12) {
  this._cylXSeg && (o = Math.min(o, this._cylXSeg));
  for (let r = 0; r < o; r++) {
    let a = (r / o) * Math.PI * 2,
      l = ((r + 1) / o) * Math.PI * 2,
      f = Math.cos(a) * i,
      u = Math.sin(a) * i,
      c = Math.cos(l) * i,
      h = Math.sin(l) * i;
    (this.quad([n - s / 2, t + f, e + u], [n - s / 2, t + c, e + h], [n + s / 2, t + c, e + h], [n + s / 2, t + f, e + u], null),
      this.tri([n + s / 2, t, e], [n + s / 2, t + f, e + u], [n + s / 2, t + c, e + h], [1, 0, 0]),
      this.tri([n - s / 2, t, e], [n - s / 2, t + c, e + h], [n - s / 2, t + f, e + u], [-1, 0, 0]));
  }
};
function IR() {
  let n = new THREE.MeshStandardMaterial({
    vertexColors: !0,
    roughness: 0.5,
    metalness: 0.3,
  });
  return (
    (n.onBeforeCompile = (t) => {
      ((t.uniforms.uNight = rn.uNight),
        (t.vertexShader = t.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
attribute float aMat;varying float vMat;`,
          )
          .replace(
            '#include <color_vertex>',
            `#include <color_vertex>
vMat=aMat;
#ifdef USE_INSTANCING_COLOR
vColor=color.xyz; if(color.r+color.g+color.b>2.95) vColor=instanceColor.xyz;
#endif`,
          )),
        (t.fragmentShader = t.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
uniform float uNight;varying float vMat;`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
float mt=floor(vMat+0.5);
if(mt<0.5)roughnessFactor=0.28;else if(mt<1.5)roughnessFactor=0.04;else if(mt<2.5)roughnessFactor=0.92;else if(mt<3.5)roughnessFactor=0.18;else roughnessFactor=0.5;`,
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `#include <metalnessmap_fragment>
if(mt<0.5)metalnessFactor=0.55;else if(mt<1.5)metalnessFactor=0.9;else if(mt<2.5)metalnessFactor=0.0;else if(mt<3.5)metalnessFactor=1.0;else metalnessFactor=0.0;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
if(mt>3.5&&mt<4.5)totalEmissiveRadiance+=vec3(1.0,0.95,0.85)*(0.15+uNight*2.2);
if(mt>4.5&&mt<5.5)totalEmissiveRadiance+=vec3(1.0,0.06,0.04)*(0.25+uNight*1.3);
if(mt>6.5)totalEmissiveRadiance+=diffuseColor.rgb*(0.3+uNight*1.5);`,
          )));
    }),
    n
  );
}
var Vr = {},
  LR = 1,
  Ai = new THREE.Object3D(),
  Wp = new THREE.Color();
function initVehicles() {
  let n = IR();
  for (let t of TYPES) {
    let e =
        t === 'police'
          ? 40
          : t === 'riot'
            ? 8
            : t === 'sport' || t === 'super'
              ? 20
              : t === 'ambulance' || t === 'fire'
                ? 6
                : t === 'sdf'
                  ? 10
                  : t === 'polbike'
                    ? 12
                    : CT[t].bike
                      ? 40
                      : Math.ceil(R.Q.cars * 0.45) + 40,
      i = new THREE.InstancedMesh(CR(t), n, e);
    (i.instanceMatrix.setUsage(THREE.DynamicDrawUsage), (i.frustumCulled = !1), (i.castShadow = !0), Ai.scale.set(0, 0, 0), Ai.updateMatrix());
    for (let s = 0; s < e; s++) (i.setMatrixAt(s, Ai.matrix), i.setColorAt(s, Wp.set(16777215)));
    ((i.count = 0),
      R.scene.add(i),
      (Vr[t] = {
        m: i,
        cap: e,
        free: [...Array(e).keys()].reverse(),
        hi: 0,
      }));
  }
  ((Oi = new THREE.InstancedMesh(kR(), n, 140)), Oi.instanceMatrix.setUsage(THREE.DynamicDrawUsage), (Oi.frustumCulled = !1), (Oi.castShadow = !0));
  for (let t = 0; t < 140; t++) Oi.setColorAt(t, Wp.set(16777215));
  ((Oi.count = 0), R.scene.add(Oi), Ai.scale.set(1, 1, 1));
}
var Oi = null,
  isCop = (n) => n.t === 'police' || n.t === 'riot' || n.t === 'polbike' || n.t === 'sdf';
function newCar(n, t, e, i, s, o) {
  let r = Vr[n];
  if (!r.free.length) return null;
  let a = r.free.pop();
  ((r.hi = Math.max(r.hi, a + 1)), (r.m.count = r.hi));
  let l = {
    id: LR++,
    t: n,
    td: CT[n],
    slot: a,
    x: t,
    z: e,
    y: 0,
    vy: 0,
    yaw: i,
    v: 0,
    vx: 0,
    vz: 0,
    mode: s,
    ctl: null,
    hp: 100,
    burn: 0,
    dead: !1,
    e: null,
    dir: 1,
    s: 0,
    lane: 0,
    jc: null,
    stopT: 0,
    stuck: 0,
    ghost: 0,
    siren: !1,
    brake: 0,
    pitch: 0,
    roll: 0,
    honk: 0,
    driver: !0,
    parked: !1,
    elev: !1,
  };
  return (
    l.td.bike && (l.riderCol = n === 'polbike' ? 15921904 : Be([1911882, 1447706, 7216162, 3095347, 10134443, 13219994, 2781109])),
    setColor(l, o ?? Be(l.td.col)),
    G.cars.push(l),
    l
  );
}
function setColor(n, t) {
  let e = Vr[n.t];
  (e.m.setColorAt(n.slot, Wp.set(t)), (e.m.instanceColor.needsUpdate = !0), (n.color = t));
}
function freeCar(n) {
  clearOcc(n);
  let t = Vr[n.t];
  (Ai.position.set(0, -100, 0),
    Ai.scale.set(0, 0, 0),
    Ai.updateMatrix(),
    t.m.setMatrixAt(n.slot, Ai.matrix),
    Ai.scale.set(1, 1, 1),
    t.free.push(n.slot),
    (n.removed = !0));
}
function pickType() {
  let n = 0;
  for (let e of TYPES) n += CT[e].w;
  let t = Math.random() * n;
  for (let e of TYPES) if (((t -= CT[e].w), t <= 0)) return e;
  return 'sedan';
}
var A0 = 30,
  Vp = new Map(),
  DR = (n, t) => (Math.floor(n / A0) + 2e3) * 8192 + Math.floor(t / A0) + 2e3;
G.carsNear = (n, t, e) => carsNear(n, t, e, []);
function rebuildCarGrid() {
  Vp.clear();
  for (let n of G.cars) {
    if (n.removed) continue;
    let t = DR(n.x, n.z),
      e = Vp.get(t);
    (e || Vp.set(t, (e = [])), e.push(n));
  }
}
function carsNear(n, t, e, i) {
  i.length = 0;
  for (let s = Math.floor((n - e) / A0); s <= Math.floor((n + e) / A0); s++)
    for (let o = Math.floor((t - e) / A0); o <= Math.floor((t + e) / A0); o++) {
      let r = Vp.get((s + 2e3) * 8192 + o + 2e3);
      if (r) for (let a of r) i.push(a);
    }
  return i;
}
var NR = (n) => Math.min(3.4, n.hw / n.lanes);
function laneOff(n, t, e) {
  let i = NR(n);
  return t * ((Math.min(e, n.lanes - 1) + 0.5) * i + (n.kind === 'A' ? 0.45 : 0));
}
var Is = {
  x: 0,
  z: 0,
  dx: 1,
  dz: 0,
};
function Xp(n, t, e, i, s) {
  return (edgePos(n, t, Is), (s.x = Is.x + Is.dz * i), (s.z = Is.z - Is.dx * i), (s.dx = Is.dx * e), (s.dz = Is.dz * e), s);
}
function y_(n, t, e, i, s) {
  return Xp(n, t, e, laneOff(n, e, i), s);
}
var Ve = {},
  Kn = {};
function UR(n, t, e, i) {
  ((n.e = t), (n.dir = e), (n.lane = Math.min(i, t.lanes - 1)));
  let s = W.nodes[t.a],
    o = W.nodes[t.b];
  ((n.s = e > 0 ? Math.min(s.r, t.len * 0.45) : Math.max(t.len - o.r, t.len * 0.55)),
    (n.stopT = 0),
    (n.stopDone = !1),
    (n.nx = null),
    (n.yieldT = 0),
    (n.lo = laneOff(t, e, n.lane)),
    (n.pass = 0));
}
function Eg(n) {
  let t = n.e;
  return n.dir > 0 ? Math.max(t.len - W.nodes[t.b].r, t.len * 0.55) : Math.min(W.nodes[t.a].r, t.len * 0.45);
}
function Tg(n, t) {
  let e = n.pts,
    i = e.length;
  return t > 0 ? Math.atan2(e[i - 1][1] - e[i - 2][1], e[i - 1][0] - e[i - 2][0]) : Math.atan2(e[0][1] - e[1][1], e[0][0] - e[1][0]);
}
function b_(n) {
  let t = n.e,
    e = W.nodes[n.dir > 0 ? t.b : t.a],
    i = [],
    s = Tg(t, n.dir);
  for (let a of e.edges) {
    let l = W.edges[a];
    if (l === t && e.edges.length > 1) continue;
    let f = l.a === e.i ? 1 : -1,
      u = f > 0 ? l.pts[0] : l.pts[l.pts.length - 1],
      c = f > 0 ? l.pts[1] : l.pts[l.pts.length - 2],
      h = Math.atan2(c[1] - u[1], c[0] - u[0]),
      d = ln(h - s),
      p = Math.abs(d) < 0.5 ? 3 : Math.abs(d) < 2.4 ? 1.2 : 0.02;
    (l.kind === 'L' && t.kind !== 'L' && (p *= 0.35),
      l.kind === 'R' && t.kind === 'X' && (p *= 0.3),
      l.kind === 'X' && (p *= 1.5),
      (n.t === 'bus' || n.t === 'truck') && l.kind === 'L' && (p *= 0.15),
      l.len < 8 && e.edges.length > 2 && (p *= 0.05),
      i.push([l, f, p, d]));
  }
  if (n.wantDir && i.length > 1) {
    let a = n.wantDir(n, e, i);
    if (a) return a;
  }
  if (!i.length) return [t, -n.dir, 1, Math.PI];
  let o = 0;
  for (let a of i) o += a[2];
  let r = Math.random() * o;
  for (let a of i) if (((r -= a[2]), r <= 0)) return a;
  return i[0];
}
var Uf = new Map();
function FR(n, t) {
  let e = Uf.get(n);
  (e || Uf.set(n, (e = [])), e.push(t));
}
function v_(n, t) {
  let e = Uf.get(n);
  if (!e) return;
  let i = e.indexOf(t);
  (i >= 0 && e.splice(i, 1), e.length || Uf.delete(n));
}
function clearOcc(n) {
  n.jc && v_(n.jc.node, n);
}
function OR(n, t, e) {
  if (t === n || t.removed || !t.jc || t.jc.from === n.e) return !1;
  let i = t.jc,
    s = Math.abs(ln(Tg(i.from, i.fd) - Tg(n.e, n.dir))) > 2.6;
  return !((s && Math.abs(i.turn) < 0.5 && Math.abs(e) < 0.5) || (s && i.turn > 0.6 && e > 0.6) || i.t > 0.85);
}
function HR(n) {
  let [t, e, , i] = n.nx || b_(n);
  ((n.nx = null), Xp(n.e, Eg(n), n.dir, n.lo ?? laneOff(n.e, n.dir, n.lane), Ve));
  let s = i > 0.6 ? 0 : i < -0.6 ? t.lanes - 1 : Math.min(n.lane, t.lanes - 1),
    o = W.nodes[t.a],
    r = W.nodes[t.b],
    a = e > 0 ? Math.min(o.r, t.len * 0.45) : Math.max(t.len - r.r, t.len * 0.55);
  y_(t, a, e, s, Kn);
  let l = (Ve.x + Kn.x) / 2,
    f = (Ve.z + Kn.z) / 2,
    u = Ve.dx * Kn.dz - Ve.dz * Kn.dx;
  if (Math.abs(u) > 0.15) {
    let m = ((Kn.x - Ve.x) * Kn.dz - (Kn.z - Ve.z) * Kn.dx) / u;
    m > 0 && m < 60 && ((l = Ve.x + Ve.dx * m), (f = Ve.z + Ve.dz * m));
  } else Math.abs(i) > 2.5 && ((l = (Ve.x + Kn.x) / 2 + Ve.dx * 6), (f = (Ve.z + Kn.z) / 2 + Ve.dz * 6));
  let c = 0,
    h = Ve.x,
    d = Ve.z;
  for (let m = 1; m <= 8; m++) {
    let g = m / 8,
      M = 1 - g,
      y = M * M * Ve.x + 2 * M * g * l + g * g * Kn.x,
      _ = M * M * Ve.z + 2 * M * g * f + g * g * Kn.z;
    ((c += Math.hypot(y - h, _ - d)), (h = y), (d = _));
  }
  let p = n.dir > 0 ? n.e.b : n.e.a,
    x = W.nodes[p];
  ((n.jc = {
    ax: Ve.x,
    az: Ve.z,
    cx: l,
    cz: f,
    bx: Kn.x,
    bz: Kn.z,
    len: Math.max(1, c),
    t: 0,
    f: t,
    d2: e,
    lane2: s,
    y: x.y,
    turn: i,
    from: n.e,
    fd: n.dir,
    node: p,
  }),
    n.onTurn && n.onTurn(n, t, e, p),
    FR(p, n));
}
var wo = [];
function obstacleAhead(n, t = 45, e = 0) {
  let i = Math.sin(n.yaw),
    s = Math.cos(n.yaw),
    o = -s,
    r = i,
    a = 99;
  ((n.obst = null), carsNear(n.x + i * t * 0.5, n.z + s * t * 0.5, t * 0.6, wo));
  for (let f of wo) {
    if (f === n || f.removed || Math.abs(f.y - n.y) > 3) continue;
    let u = f.x - n.x,
      c = f.z - n.z,
      h = u * i + c * s;
    if (h <= 0 || h > t) continue;
    let d = i * Math.sin(f.yaw) + s * Math.cos(f.yaw),
      p = Math.abs(u * o + c * r - e),
      x = (n.td.W + f.td.W) / 2 + 0.25 + (d < -0.5 ? -0.2 : 0);
    if (p < x) {
      let m = h - (n.td.L + f.td.L) / 2;
      m < a && ((a = m), (n.obst = f));
    }
  }
  if (G.pedObstacle) {
    let f = G.pedObstacle(n, i, s, o, r);
    f < a && ((a = f), (n.obst = null));
  }
  let l = G.player;
  if (l && l.mode === 'foot' && !l.interior && Math.abs(l.y - n.y) < 2) {
    let f = l.x - n.x,
      u = l.z - n.z,
      c = f * i + u * s;
    c > 0 &&
      c < 25 &&
      Math.abs(f * o + u * r) < 1.8 &&
      ((a = Math.min(a, c - n.td.L / 2 - 1)), c < 12 && n.v < 1 && (n.honk = Math.max(n.honk, 0.6)));
  }
  return a;
}
function BR(n, t) {
  (Xp(n.e, n.s, n.dir, t, Kn), carsNear(Kn.x, Kn.z, 18, wo));
  let e = Math.sin(n.yaw),
    i = Math.cos(n.yaw);
  for (let s of wo) {
    if (s === n || s.removed) continue;
    let o = s.x - Kn.x,
      r = s.z - Kn.z,
      a = o * e + r * i;
    if (Math.abs(o * -i + r * e) < 2 && a > -12 && a < 16) return !1;
  }
  return !0;
}
function aiUpdate(n, t) {
  n.why = '';
  let e = n.e,
    s =
      (e.kind === 'X' ? 24 : e.kind === 'R' ? 14 : e.kind === 'A' ? 15.5 : e.kind === 'B' ? 12 : 8.5) *
      (n.t === 'bus' || n.t === 'truck' ? 0.82 : 1) *
      (n.temper || 1) *
      (rn.uRain.value > 0.4 ? 0.85 : 1);
  if ((n.lo === void 0 && (n.lo = laneOff(e, n.dir, n.lane)), n.jc)) {
    let c = n.jc;
    s = Math.abs(c.turn) < 0.5 ? s * 0.9 : Math.abs(c.turn) > 2.4 ? 4 : c.turn > 0 ? 5.5 : 7;
  } else {
    let c = Eg(n),
      h = (c - n.s) * n.dir,
      d = n.dir > 0 ? e.b : e.a,
      p = W.nodes[d];
    h < 40 && !n.nx && (n.nx = b_(n));
    let x = n.nx ? n.nx[3] : 0,
      m = -99;
    if (((n.yieldT = n.yieldT || 0), p.sig && p.y < 1)) {
      let g = sigState(p, e.i, G.t);
      (g === 2 || (g === 1 && h > 12)) && (m = h - 4.5);
    } else
      e.kind === 'L' &&
        p.edges.length >= 3 &&
        !n.stopDone &&
        p.edges.some((g) => W.edges[g].kind === 'A' || W.edges[g].kind === 'B') &&
        (m = h - 3.5);
    if (m === -99 && h < 14 && p.y < 1) {
      let g = Uf.get(d);
      g && n.yieldT < 6 && g.some((M) => OR(n, M, x)) && ((m = h - 3), (n.yieldT += t));
    }
    if (m === -99 && x < -0.6 && h < 10 && e.lanes >= 1 && n.yieldT < 5) {
      let g = -Math.sin(n.yaw),
        M = -Math.cos(n.yaw);
      (carsNear(p.x, p.z, 40, wo),
        wo.some(
          (y) =>
            y !== n &&
            y.mode === 'ai' &&
            !y.jc &&
            y.e !== e &&
            Math.hypot(y.x - p.x, y.z - p.z) < 36 &&
            y.v > 3 &&
            Math.sin(y.yaw) * g + Math.cos(y.yaw) * M > 0.85 &&
            (y.x - p.x) * Math.sin(y.yaw) + (y.z - p.z) * Math.cos(y.yaw) < 0,
        ) && ((m = h - 1), (n.yieldT += t)));
    }
    if (n.hook) {
      let g = n.hook(n, h, t);
      g != null && (m === -99 || g < m) && (m = g);
    }
    if (m > -2.5) {
      n.why = 'stop' + (p.sig ? 'S' : 'L') + (n.yieldT > 0 ? 'Y' : '');
      let g = Math.max(0, m);
      ((s = Math.min(s, Math.sqrt(2 * 4.2 * g))),
        g < 0.5 && (s = 0),
        !p.sig && n.v < 0.4 && g < 1.5 && ((n.stopT += t), n.stopT > 1 && (n.stopDone = !0)));
    }
    Math.abs(x) > 0.5 && h < 30 && (s = Math.min(s, (Math.abs(x) > 2.4 ? 4 : x > 0 ? 5.5 : 7) + h * 0.45));
  }
  if (n.ghost > 0) n.ghost -= t;
  else {
    let c = obstacleAhead(n);
    if (c < 45) {
      let h = n.obst,
        d = h ? (h.mode === 'ai' ? h.v : Math.hypot(h.vx, h.vz)) : 0,
        p = Math.max(0, c - 2.2),
        x = h ? Math.max(0, d) + (p - 1.2 * n.v) * 0.6 : 0,
        m = s;
      if (
        ((s = Math.min(s, Math.sqrt(2 * 6 * p), h ? Math.max(0, x + 0.5 * p) : 99)),
        c < 2.2 && (s = 0),
        s < m && (n.why = 'ob:' + (h ? h.mode : 'ped') + (c | 0)),
        !n.jc && h && e.lanes > 1 && d < n.v + 1 && c < 25 && (n.lcT || 0) <= 0)
      ) {
        for (let g of [n.lane - 1, n.lane + 1])
          if (!(g < 0 || g >= e.lanes) && BR(n, laneOff(e, n.dir, g))) {
            ((n.lane = g), (n.lcT = 4), (n.blink = g > n.lane ? -1 : 1));
            break;
          }
      }
      !n.jc &&
        h &&
        h.mode === 'phys' &&
        d < 0.5 &&
        c < 9 &&
        n.v < 1 &&
        e.lanes === 1 &&
        ((n.passWait = (n.passWait || 0) + t), n.passWait > 1.5 && ((n.pass = 26), (n.passWait = 0)));
    }
  }
  if ((n.lcT > 0 && (n.lcT -= t), (n.pull = 0), G.sirens && G.sirens.length && !n.jc))
    for (let c of G.sirens) {
      let h = c.x - n.x,
        d = c.z - n.z;
      if (h * h + d * d > 1600) continue;
      let p = Math.sin(n.yaw),
        x = Math.cos(n.yaw);
      if (h * p + d * x < 0 && Math.sin(c.yaw) * p + Math.cos(c.yaw) * x > 0.6) {
        ((n.pull = 1), (s = Math.min(s, 3)));
        break;
      }
    }
  n.vt = s;
  let o = n.v;
  if (
    ((n.v =
      n.v < s
        ? Math.min(s, n.v + (n.t === 'bus' || n.t === 'truck' ? 2.2 : 3) * (n.temper || 1) * t)
        : Math.max(s, n.v - (s < 0.1 && n.v < 4 ? 6 : 8.5) * t)),
    (n.brake = n.v < o - 0.05 * t || (s < 0.5 && n.v < 1) ? 1 : 0),
    n.v < 0.1 && !n.dwell)
  ) {
    n.stuck += t;
    let c = n.obst && (n.obst.stuck > 3 || n.obst.mode === 'phys');
    n.stuck > (c ? 7 : 16) && ((n.ghost = 2.5), (n.stuck = 0));
  } else n.stuck = 0;
  if (((n.blinkOn = n.nx && Math.abs(n.nx[3]) > 0.6 ? Math.sign(n.nx[3]) : n.jc && Math.abs(n.jc.turn) > 0.6 ? Math.sign(n.jc.turn) : 0), n.jc)) {
    let c = n.jc;
    if (((c.t += (n.v * t) / c.len), c.t >= 1)) (v_(c.node, n), UR(n, c.f, c.d2, c.lane2), (n.jc = null));
    else {
      let h = c.t,
        d = 1 - h;
      ((n.x = d * d * c.ax + 2 * d * h * c.cx + h * h * c.bx), (n.z = d * d * c.az + 2 * d * h * c.cz + h * h * c.bz));
      let p = 2 * d * (c.cx - c.ax) + 2 * h * (c.bx - c.cx),
        x = 2 * d * (c.cz - c.az) + 2 * h * (c.bz - c.cz);
      (p * p + x * x > 1e-6 && (n.yaw = g_(n.yaw, Math.atan2(p, x), t * 8)), (n.y = c.y));
      return;
    }
  }
  n.s += n.dir * n.v * t;
  let r = Eg(n);
  (r - n.s) * n.dir <= 0 && ((n.s = r), HR(n));
  let a = laneOff(n.e, n.dir, n.lane);
  n.pass > 0 ? ((n.pass -= n.v * t), (a = -Math.sign(a) * 0.4)) : (n.pull || n.kerb) && (a = Math.sign(a) * (n.e.hw - n.td.W / 2 - 0.25));
  let l = a - n.lo,
    f = Math.min(Math.abs(l), (1.1 + n.v * 0.04) * t);
  ((n.lo += Math.sign(l) * f), Xp(n.e, n.s, n.dir, n.lo, Ve), (n.x = Ve.x), (n.z = Ve.z));
  let u = Math.atan2(Ve.dx, Ve.dz);
  (f > 1e-4 && n.v > 0.5 && (u += Math.atan2(-Math.sign(l) * n.dir * (f / t), n.v) * 0.9),
    (n.yaw = g_(n.yaw, u, t * 10)),
    (n.y = n.e.elev ? edgeY(n.e, n.s) : 0.04));
}
function g_(n, t, e) {
  return n + ln(t - n) * Math.min(1, e);
}
function spawnAICar(n, t, e) {
  let i = [];
  if ((roadsNear(n, t, 60, i), !i.length)) return null;
  let s = Be(i),
    o = s.e;
  if (o.len < 20) return null;
  let r = W.nodes[o.a],
    a = W.nodes[o.b],
    l = It(s.s, r.r + 3, o.len - a.r - 3);
  if (l <= r.r || l >= o.len - a.r) return null;
  let f = Math.random() < 0.5 ? 1 : -1,
    u = Math.floor(Math.random() * o.lanes);
  (y_(o, l, f, u, Ve), carsNear(Ve.x, Ve.z, 14, wo));
  for (let h of wo) if (Math.hypot(h.x - Ve.x, h.z - Ve.z) < 11) return null;
  if (!inBounds(Ve.x, Ve.z, 50)) return null;
  let c = newCar(e || pickType(), Ve.x, Ve.z, Math.atan2(Ve.dx, Ve.dz), 'ai');
  return c
    ? ((c.e = o),
      (c.dir = f),
      (c.lane = u),
      (c.s = l),
      (c.lo = laneOff(o, f, u)),
      (c.v = rt(5, 11)),
      (c.temper = rt(0.88, 1.12)),
      (c.y = o.elev ? edgeY(o, l) : 0.04),
      c)
    : null;
}
function toPhys(n) {
  n.mode !== 'phys' &&
    (clearOcc(n),
    (n.mode = 'phys'),
    (n.vx = Math.sin(n.yaw) * n.v),
    (n.vz = Math.cos(n.yaw) * n.v),
    (n.jc = null),
    (n.nx = null),
    (n.elev = n.y > 1.5),
    (n.recT = 0));
}
function tryRecover(n, t) {
  if (n.mode !== 'phys' || n.ctl || !n.driver || n.dead || n.burn > 0 || n.sink || (n.keep && !n.passenger) || n.parked) return;
  if (Math.hypot(n.vx, n.vz) > 1.2) {
    n.recT = 0;
    return;
  }
  if (((n.recT = (n.recT || 0) + t), n.recT < 2.5)) return;
  roadsNear(n.x, n.z, 14, Qa);
  let e = Math.sin(n.yaw),
    i = Math.cos(n.yaw),
    s = null,
    o = 0;
  for (let h of Qa) {
    let d = h.e;
    if (h.d > d.hw + 0.5 || Math.abs((d.elev ? edgeY(d, h.s) : 0.04) - n.y) > 1.5) continue;
    let [p, x] = d.pts[h.j],
      [m, g] = d.pts[h.j + 1],
      M = Math.hypot(m - p, g - x) || 1,
      y = ((m - p) * e + (g - x) * i) / M;
    Math.abs(y) > o &&
      Math.abs(y) > 0.6 &&
      ((o = Math.abs(y)),
      (s = {
        r: h,
        dir: y > 0 ? 1 : -1,
      }));
  }
  if (!s) {
    n.recT > 20 && (n.parked = !0);
    return;
  }
  let r = s.r.e,
    a = W.nodes[r.a],
    l = W.nodes[r.b];
  if (s.r.s < a.r + 1 || s.r.s > r.len - l.r - 1) return;
  edgePos(r, s.r.s, Is);
  let f = (n.x - Is.x) * Is.dz - (n.z - Is.z) * Is.dx;
  ((n.mode = 'ai'),
    (n.e = r),
    (n.dir = s.dir),
    (n.s = s.r.s),
    (n.lo = f),
    (n.v = 0),
    (n.vx = n.vz = 0),
    (n.jc = null),
    (n.nx = null),
    (n.stopT = 0),
    (n.stuck = 0),
    (n.pass = 0),
    (n.yieldT = 0));
  let u = 0,
    c = 1e9;
  for (let h = 0; h < r.lanes; h++) {
    let d = Math.abs(laneOff(r, n.dir, h) - f);
    d < c && ((c = d), (u = h));
  }
  n.lane = u;
}
var Qa = [];
function surfaceAt(n, t, e) {
  roadsNear(n, t, 14, Qa);
  let i = null;
  for (let s of Qa) {
    if (!s.e.elev || s.d > s.e.hw + 0.6) continue;
    let o = edgeY(s.e, s.s),
      r = Math.abs(o - e);
    if (r >= 3.2) continue;
    let a = s.d / s.e.hw + r * 0.35;
    (!i || a < i.sc) &&
      (i = {
        y: o,
        r: s,
        sc: a,
      });
  }
  return i;
}
function physCar(n, t) {
  let e = n.td,
    i = 0,
    s = 0,
    o = 0,
    r = 0;
  if (n.ctl === 'player') {
    let y = G.input;
    ((i = y.thr), (s = y.steer), (o = y.brake), (r = y.hand));
  } else if (n.ctl === 'police') {
    let y = policeAI(n, t);
    ((i = y[0]), (s = y[1]), (o = y[2]));
  } else if (n.ctl === 'npc') {
    let y = (n.ai || npcDrive)(n, t);
    ((i = y[0]), (s = y[1]), (o = y[2]));
  } else o = -1;
  (n.dead || n.hp <= 0 || n.sink) && ((i = 0), (s = 0), (o = -1));
  let a = Math.sin(n.yaw),
    l = Math.cos(n.yaw),
    f = -l,
    u = a,
    c = n.vx * a + n.vz * l,
    h = n.vx * f + n.vz * u,
    d = e.vmax * (n.hp < 30 ? 0.65 : 1) * (n.boost || 1) * (n.eng ? 1 + (n.eng - 1) * 0.6 : 1);
  (n.air && (i *= 0),
    i > 0 && (c < -0.5 ? (c += 18 * t * i) : (c += e.acc * (n.eng || 1) * i * Math.max(0, 1 - Math.max(0, c) / d) * t * (c < 8 ? 1.35 : 1))),
    o < 0
      ? ((o = 0.6), (c -= Math.sign(c) * Math.min(Math.abs(c), 14 * t)))
      : o > 0 && (c > 0.4 ? (c = Math.max(0, c - 22 * o * t)) : (c = Math.max(-14, c - 7 * o * t))),
    (c -= c * 0.08 * t),
    !i && !o && (c -= Math.sign(c) * Math.min(Math.abs(c), 0.8 * t)));
  let p = n.air ? 0 : r ? 1 : (n.ctl ? 7 : 9) * (1 - rn.uRain.value * 0.35);
  ((h *= Math.exp(-p * t)), r && !n.air && (c -= Math.sign(c) * Math.min(Math.abs(c), 5 * t)), (n.vx = a * c + f * h), (n.vz = l * c + u * h));
  let x = Math.abs(c),
    m = Ee(2.1, 0.75, It(x / 50, 0, 1));
  (n.air || (n.yaw -= s * m * It(c / 6, -1, 1) * (r ? 1.5 : 1) * t),
    (n.x += n.vx * t),
    (n.z += n.vz * t),
    (n.v = c),
    (n.lat = h),
    (n.brake = o > 0 && c > 0.5 ? 1 : 0));
  let g = surfaceAt(n.x, n.z, n.y),
    M = 0.04;
  if (g) {
    M = g.y;
    let y = g.r,
      _ = y.e.hw - e.W / 2 - 0.15,
      v = Math.min(y.s, y.e.len - y.s) < W.nodes[y.s < y.e.len / 2 ? y.e.a : y.e.b].r + 6,
      b = !1;
    if (y.d > _) {
      for (let w of Qa)
        if (!(w === y || !w.e.elev) && w.d <= w.e.hw - e.W / 2 - 0.15 && Math.abs(edgeY(w.e, w.s) - M) < 1.2) {
          b = !0;
          break;
        }
    }
    if (y.d > _ && !v && !b) {
      let w = (n.x - y.x) / (y.d || 1),
        E = (n.z - y.z) / (y.d || 1);
      ((n.x -= w * (y.d - _)), (n.z -= E * (y.d - _)));
      let C = n.vx * w + n.vz * E;
      C > 0 && ((n.vx -= w * C * 1.3), (n.vz -= E * C * 1.3), C > 4 && Sg(n, C));
    }
  }
  if (
    (n.y > M + 0.35
      ? ((n.vy -= 20 * t), (n.y += n.vy * t), (n.air = !0), n.y <= M && (n.vy < -6 && Sg(n, -n.vy * 0.6), (n.y = M), (n.vy = 0), (n.air = !1)))
      : ((n.y = n.y < M - 0.5 ? n.y + Math.min(0.5, M - n.y) : M), (n.vy = 0), (n.air = !1)),
    n.y < 30)
  ) {
    let y = e.L / 2 - e.W / 2,
      _ = e.W / 2 + 0.05,
      v = 0;
    for (let b of [1, -1]) {
      let w = {
          x: n.x + a * y * b,
          z: n.z + l * y * b,
        },
        E = w.x,
        C = w.z,
        S = collideBuildings(w, _, n.y, !!g);
      if (S) {
        ((n.x += w.x - E), (n.z += w.z - C));
        let T = n.vx * S.nx + n.vz * S.nz;
        T < 0 &&
          ((n.vx -= S.nx * T * 1.35),
          (n.vz -= S.nz * T * 1.35),
          (v = Math.max(v, -T)),
          (n.yaw += b * (S.nx * l - S.nz * a) * 0.05 * Math.min(8, -T)));
      }
    }
    v > 3 && Sg(n, v);
  }
  !n.sink && n.y < 1 && isWaterAt(n.x, n.z) && !GR(n) && ((n.sink = 1), n.ctl === 'player' && xt('splash'));
}
function GR(n) {
  roadsNear(n.x, n.z, 16, Qa);
  for (let t of Qa) if (t.d < t.e.hw + 1) return !0;
  return !1;
}
function Sg(n, t) {
  (damageCar(n, t * (n.ctl === 'player' ? 1.2 : 1.5)),
    n.ctl === 'player' &&
      (xt('crash', {
        x: n.x,
        y: n.y + 0.6,
        z: n.z,
        p: t,
      }),
      n.td.bike &&
        t > 7 &&
        xt('bikeCrash', {
          c: n,
          v: t,
        })));
}
function damageCar(n, t) {
  n.dead || n.invuln || ((n.hp -= t * (1 - (n.armor || 0))), n.hp <= 0 && !n.burn && ((n.hp = 0), (n.burn = 4.5), xt('carFire', n)));
}
function carCollisions(n) {
  let t = n.td,
    e = Math.sin(n.yaw),
    i = Math.cos(n.yaw),
    s = t.L / 2 - t.W / 2,
    o = t.W / 2 + 0.05;
  carsNear(n.x, n.z, 14, wo);
  for (let r of wo) {
    if (r === n || r.removed || Math.abs(r.y - n.y) > 2.2 || (r.mode === 'phys' && r.collDone)) continue;
    let a = r.x - n.x,
      l = r.z - n.z;
    if (a * a + l * l > (t.L + r.td.L) ** 2 / 4 + 4) continue;
    let f = Math.sin(r.yaw),
      u = Math.cos(r.yaw),
      c = r.td.L / 2 - r.td.W / 2,
      h = r.td.W / 2 + 0.05;
    for (let d of [1, -1])
      for (let p of [1, -1]) {
        let x = n.x + e * s * d,
          m = n.z + i * s * d,
          g = r.x + f * c * p,
          M = r.z + u * c * p,
          y = x - g,
          _ = m - M,
          v = Math.hypot(y, _);
        if (v >= o + h || v < 1e-4) continue;
        let b = y / v,
          w = _ / v,
          E = o + h - v;
        if (r.mode === 'ai') {
          let S = Math.sin(r.yaw) * r.v,
            T = Math.cos(r.yaw) * r.v,
            D = (n.vx - S) * b + (n.vz - T) * w;
          if (r.passenger || Math.abs(D) < 2.5) {
            ((n.x += b * E),
              (n.z += w * E),
              D < 0 && ((n.vx -= b * D * 1.2), (n.vz -= w * D * 1.2), -D > 3 && damageCar(n, -D)),
              (r.stopT = Math.max(r.stopT || 0, 1.2)),
              r.driver && n.ctl === 'player' && (r.honk = 1.5));
            continue;
          }
          (toPhys(r), (r.ctl = null), r.driver && (r.honk = 2));
        }
        (n.ctl === 'player' &&
          r.driver &&
          !r.ctl &&
          !r.angry &&
          r.t !== 'bus' &&
          Math.abs((n.vx - r.vx) * b + (n.vz - r.vz) * w) > 5 &&
          Math.random() < 0.35 &&
          ((r.angry = !0), xt('angry', r)),
          (n.x += b * E * 0.5),
          (n.z += w * E * 0.5),
          (r.x -= b * E * 0.5),
          (r.z -= w * E * 0.5));
        let C = (n.vx - r.vx) * b + (n.vz - r.vz) * w;
        if (C < 0) {
          let S = (-1.3 * C) / 2;
          if (((n.vx += b * S), (n.vz += w * S), (r.vx -= b * S), (r.vz -= w * S), -C > 3)) {
            (damageCar(n, -C * 1.1),
              damageCar(r, -C * 1.4),
              (n.ctl === 'player' || r.ctl === 'player') &&
                xt('crash', {
                  x: (x + g) / 2,
                  y: n.y + 0.8,
                  z: (m + M) / 2,
                  p: -C,
                }));
            for (let T of [n, r])
              T.ctl === 'player' &&
                T.td.bike &&
                -C > 6 &&
                xt('bikeCrash', {
                  c: T,
                  v: -C,
                });
            n.ctl === 'player' &&
              (isCop(r)
                ? xt('crime', {
                    amt: 1.5,
                    why: '\u30D1\u30C8\u30AB\u30FC\u306B\u885D\u7A81',
                  })
                : -C > 9 &&
                  xt('crime', {
                    amt: 0.5,
                    why: '\u4EA4\u901A\u4E8B\u6545',
                    minor: !0,
                  }));
          }
        }
      }
  }
  n.collDone = !0;
}
function policeAI(n, t) {
  let e = G.player,
    i = e.mode === 'car' && e.car ? e.car : e,
    s = G.polTier || {},
    o = Math.hypot(i.x - n.x, i.z - n.z),
    r = i === e ? [0, 0] : [i.vx || 0, i.vz || 0],
    a = s.ram ? It(o / 30, 0, 1.2) : 0,
    l = i.x + r[0] * a,
    f = i.z + r[1] * a;
  n.pt = (n.pt || 0) - t;
  let u = l,
    c = f;
  if (
    o > 45 &&
    ((n.pt <= 0 || !n.path) &&
      ((n.pt = 1 + Math.random() * 0.4),
      (n.path = route(
        nearestNode(n.x, n.z, (y) => !y.elev || n.y > 2),
        nearestNode(i.x, i.z),
      )),
      (n.pi = 1)),
    n.path && n.path.length > 1)
  ) {
    for (; n.pi < n.path.length - 1 && Math.hypot(W.nodes[n.path[n.pi]].x - n.x, W.nodes[n.path[n.pi]].z - n.z) < 14;) n.pi++;
    let y = W.nodes[n.path[Math.min(n.pi, n.path.length - 1)]];
    ((u = y.x), (c = y.z));
  }
  let h = obstacleAhead(n, 22),
    d = 0;
  if (h < 14 && n.obst && n.obst !== i) {
    let y = n.obst;
    d = ((y.x - n.x) * Math.cos(n.yaw) - (y.z - n.z) * Math.sin(n.yaw) > 0 ? 1 : -1) * 0.7;
  }
  let p = Math.atan2(u - n.x, c - n.z),
    x = ln(p - n.yaw);
  if (n.rev > 0) return ((n.rev -= t), [0, x > 0 ? 1 : -1, 1]);
  let m = Math.abs(n.v);
  m < 1.2 && o > 8 ? ((n.stk = (n.stk || 0) + t), n.stk > 1.6 && ((n.stk = 0), (n.rev = 1.3))) : (n.stk = 0);
  let g = 1,
    M = 0;
  return (
    Math.abs(x) > 1 && m > 13 && ((g = 0), (M = 0.8)),
    !s.ram && o < 16 ? ((g = m > 6 ? 0 : 0.35), (M = m > 6 ? 0.7 : 0)) : o < 9 && ((g = s.ram ? 1 : 0.3), !s.ram && m > 8 && (M = 0.5)),
    [g, It(-x * 2.4 + d, -1, 1), M]
  );
}
function npcDrive(n, t) {
  let e = n.goal;
  if (!e) return [0, 0, 1];
  let i = Math.hypot(e.x - n.x, e.z - n.z),
    s = e.x,
    o = e.z;
  if (
    ((n.pt = (n.pt || 0) - t),
    i > 30 &&
      ((n.pt <= 0 || !n.path) &&
        ((n.pt = 2.5),
        (n.path = route(
          nearestNode(n.x, n.z, (h) => !h.elev),
          nearestNode(e.x, e.z, (h) => !h.elev),
        )),
        (n.pi = 1)),
      n.path && n.path.length > 1))
  ) {
    for (; n.pi < n.path.length - 1 && Math.hypot(W.nodes[n.path[n.pi]].x - n.x, W.nodes[n.path[n.pi]].z - n.z) < 14;) n.pi++;
    let h = W.nodes[n.path[Math.min(n.pi, n.path.length - 1)]];
    ((s = h.x), (o = h.z));
  }
  let r = obstacleAhead(n, 18),
    a = 0;
  if (r < 12 && n.obst) {
    let h = n.obst;
    a = ((h.x - n.x) * Math.cos(n.yaw) - (h.z - n.z) * Math.sin(n.yaw) > 0 ? 1 : -1) * 0.6;
  }
  let l = ln(Math.atan2(s - n.x, o - n.z) - n.yaw),
    f = Math.abs(n.v);
  if (n.rev > 0) return ((n.rev -= t), [0, l > 0 ? 1 : -1, 1]);
  if (((n.pgT = (n.pgT || 0) + t), n.pgT > 1.5)) {
    let h = n.pgX === void 0 ? 9 : Math.hypot(n.x - n.pgX, n.z - n.pgZ);
    ((n.pgX = n.x), (n.pgZ = n.z), (n.pgT = 0), h < 2.5 && i > 12 && ((n.rev = 1.3), (n.path = null), (n.pt = 0)));
  }
  if (i < (n.arriveR || 10)) return ((n.arrived = !0), [0, 0, 1]);
  r < 14 && n.obst && (a *= 1.4);
  let u = Math.min(1, 0.45 + i / 80),
    c = 0;
  return (Math.abs(l) > 0.9 && f > 10 && ((u = 0), (c = 0.7)), r < 4 && ((u = 0.2), (c = f > 3 ? 0.6 : 0)), [u, It(-l * 2.2 + a, -1, 1), c]);
}
function renderCars(n, t) {
  let e = R.camera.position;
  for (let s of TYPES) Vr[s].dirty = !1;
  let i = 0;
  for (let s of G.cars) {
    if (s.removed) continue;
    let o = Vr[s.t],
      r = s.pv !== void 0 ? (s.v - s.pv) / Math.max(n, 0.001) : 0;
    if (((s.pv = s.v), s.td.bike)) {
      let x = s.pyaw !== void 0 ? ln(s.yaw - s.pyaw) / Math.max(n, 0.001) : 0;
      s.pyaw = s.yaw;
      let m = s.mode === 'ai' ? s.v : Math.hypot(s.vx, s.vz);
      ((s.pitch = Ee(s.pitch, It(r * 0.004, -0.05, 0.05), Math.min(1, n * 6))),
        (s.roll = Ee(
          s.roll,
          !s.driver && s.ctl !== 'player' && s.mode === 'phys' && m < 0.5 ? 0.22 : It(-x * m * 0.055, -0.5, 0.5),
          Math.min(1, n * 5),
        )));
    } else
      ((s.pitch = Ee(s.pitch, It(r * 0.006, -0.05, 0.05), Math.min(1, n * 6))),
        (s.roll = Ee(s.roll, It((s.lat || 0) * 0.02, -0.07, 0.07), Math.min(1, n * 6))));
    if (
      (Ai.position.set(s.x, s.y + (s.sink ? -s.sink * 0.8 : 0), s.z),
      Ai.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ'),
      Ai.updateMatrix(),
      o.m.setMatrixAt(s.slot, Ai.matrix),
      (o.dirty = !0),
      s.td.bike &&
        Oi &&
        i < 140 &&
        !s.dead &&
        (s.ctl === 'player' || s.ctl === 'police' || (s.driver && (s.mode === 'ai' || !s.parked))) &&
        ((Ai.position.y += s.td.bike === 'scooter' ? -0.06 : s.td.bike === 'cycle' ? 0.08 : 0),
        Ai.updateMatrix(),
        Oi.setMatrixAt(i, Ai.matrix),
        Oi.setColorAt(i, Wp.set(s.ctl === 'player' ? (G.playerColor ?? 2842528) : s.riderCol || 3355443)),
        i++),
      Math.hypot(s.x - e.x, s.z - e.z) > 450 || s.dead)
    )
      continue;
    let l = Math.sin(s.yaw),
      f = Math.cos(s.yaw),
      u = Math.cos(s.yaw),
      c = -Math.sin(s.yaw),
      h = s.td.L / 2 + 0.1,
      d = s.td.W / 2 - 0.3,
      p = s.y + 0.72;
    if (s.td.bike) {
      ((R.night > 0.25 || s.t === 'polbike') && t.add(s.x + l * h, s.y + 0.85, s.z + f * h, 1, 0.92, 0.75, 2.6),
        s.siren && Math.floor(G.t * 7) % 2 && t.add(s.x + l * 0.5, s.y + 1.25, s.z + f * 0.5, 1, 0.1, 0.08, 4));
      continue;
    }
    if (R.night > 0.25) for (let x of [-1, 1]) t.add(s.x + l * h + u * d * x, p, s.z + f * h + c * d * x, 1, 0.92, 0.75, 3.2);
    if (s.brake || R.night > 0.25)
      for (let x of [-1, 1]) t.add(s.x - l * h + u * d * x, p + 0.04, s.z - f * h + c * d * x, 1, 0.08, 0.05, s.brake ? 2.2 : 1.1);
    if (s.siren) {
      let x = Math.floor(G.t * 7) % 2,
        m = s.y + s.td.H + 0.15,
        g = s.t === 'fire' || s.t === 'ambulance' ? s.td.L / 2 - 1.2 : -0.25;
      t.add(s.x + u * 0.4 * (x ? 1 : -1) + l * g, m, s.z + c * 0.4 * (x ? 1 : -1) + f * g, 1, 0.1, 0.08, 6);
    }
  }
  for (let s of TYPES) Vr[s].dirty && (Vr[s].m.instanceMatrix.needsUpdate = !0);
  Oi && ((Oi.count = i), (Oi.instanceMatrix.needsUpdate = !0), Oi.instanceColor && (Oi.instanceColor.needsUpdate = !0));
}
var PD = {};
vi(PD, {
  PED_KINDS: () => PED_KINDS,
  initPeds: () => initPeds,
  knockPed: () => knockPed,
  makePlayerMesh: () => makePlayerMesh,
  managePeds: () => managePeds,
  pedGeo: () => pedGeo,
  pedMaterial: () => pedMaterial,
  pedsNear: () => pedsNear,
  rebuildPedGrid: () => rebuildPedGrid,
  renderPeds: () => renderPeds,
  scarePeds: () => scarePeds,
  spawnPed: () => spawnPed,
  spawnPedAt: () => spawnPedAt,
  updPed: () => updPed,
});
var VR = H2.map((n) => {
  let [t, e] = fe(n[0], n[1]);
  return [t, e, n[2], n[3]];
});
G.densityAt = (n, t) => {
  let e = 0.15;
  for (let i of VR) {
    let s = ((n - i[0]) ** 2 + (t - i[1]) ** 2) / (i[3] * i[3]);
    s < 6 && (e = Math.max(e, i[2] * Math.exp(-s)));
  }
  return e;
};
var WR = [15254690, 14463114, 15782064],
  S_ = 1775122,
  PED_KINDS = 12;
function pedGeo(n) {
  let t = new Mt({
      color: !0,
      mat: !0,
    }),
    e = (v, b) => ((t.mv = v), t.setColor(b), t),
    i = n === 10,
    s = n === 11,
    o = n === 1 || n === 5 || n === 7,
    r = n === 6,
    a = n === 4,
    l = n === 2 || n === 7,
    f = n === 3,
    u = n === 8,
    c = n === 9,
    h = WR[n % 3],
    d = i ? 2898514 : s ? 5200442 : a ? 8826582 : f ? 2042436 : 16777215,
    p = i ? 2898514 : s ? 5200442 : a ? 1844024 : n === 7 ? 2237739 : l ? 16777215 : f ? 3816772 : r ? 6119267 : c ? 13218442 : 16711935,
    x = d,
    m = n === 0 || a || c,
    g = o ? 0.155 : 0.175,
    M = o ? 0.2 : 0.225;
  for (let v of [-1, 1]) {
    let b = v * (o ? 0.075 : 0.085);
    (n === 1 || n === 7
      ? e(v, n === 7 ? 3813418 : h).tube(b, 0.08, 0, 0.042, 0.045, 0.058, 0.062, 0.62, 6, !1)
      : e(v, p).tube(b, 0.08, 0, 0.055, 0.06, 0.075, 0.08, 0.8, 6, !1),
      e(v, n === 0 || f || u || c ? 15921904 : o ? 2759960 : 1118481).box(b, 0, 0.035, 0.11, 0.085, 0.25, 0, {}),
      (u || c || n === 0) && e(v, 2764083).box(b, 0.002, 0.035, 0.115, 0.03, 0.255, 0, {}));
  }
  if (
    (n === 1
      ? e(0, 16711935).tube(0, 0.6, 0, 0.21, 0.17, g, 0.11, 0.42, 9, !0)
      : n === 7
        ? e(0, 2237739).tube(0, 0.58, 0, 0.18, 0.14, g, 0.11, 0.44, 9, !0)
        : e(0, p).tube(0, 0.84, 0, g, 0.11, g, 0.115, 0.18, 9, !0),
    !o && n !== 6 && e(0, 1907223).tube(0, 0.97, 0, g + 0.004, 0.115, g + 0.004, 0.12, 0.04, 9, !1),
    n === 5 || r
      ? e(0, d).tube(0, 0.62, 0, g + 0.035, 0.135, M + 0.01, 0.13, 0.82, 9, !0)
      : e(0, d).tube(0, 0.98, 0, g, 0.115, M, 0.125, 0.45, 9, !0),
    e(0, d).ell(0, 1.41, 0, M - 0.015, 0.06, 0.12, 9, 3, 0.5, 1),
    i)
  ) {
    for (let v of [1.05, 1.3]) e(0, 15263850).tube(0, v, 0, g + 0.012, 0.118, M + 0.006, 0.128, 0.035, 9, !1);
    for (let v of [-1, 1]) e(v, 15263850).tube(v * 0.085, 0.3, 0, 0.078, 0.083, 0.078, 0.083, 0.035, 6, !1);
    e(0, 9080726).box(0, 1.1, -0.17, 0.26, 0.42, 0.14, 0, {});
  }
  if (
    (s &&
      (e(0, 3818544).box(0, 1.15, 0, g * 2 + 0.06, 0.4, 0.29, 0, {}),
      e(-2, 1710618).box(-(M + 0.04), 0.62, 0.08, 0.05, 0.62, 0.08, 0, {}),
      e(-2, 1710618).box(-(M + 0.04), 0.72, 0.16, 0.04, 0.12, 0.08, 0, {})),
    l && n === 2)
  ) {
    (e(0, 16053488).box(0, 1.2, 0.112, 0.12, 0.22, 0.02, 0, {}),
      e(0, Be([8002594, 1915499, 2894892])).box(0, 1.08, 0.124, 0.045, 0.32, 0.012, 0, {}));
    for (let v of [-1, 1]) e(0, 16777215).box(v * 0.05, 1.28, 0.118, 0.04, 0.16, 0.015, v * 0.3, {});
  }
  if ((n === 7 && e(0, 16053488).box(0, 1.24, 0.11, 0.1, 0.14, 0.02, 0, {}), u || c)) {
    e(0, u ? 1908002 : 3824186).box(0, 1.1, -0.19, 0.3, 0.4, 0.16, 0, {});
    for (let v of [-1, 1]) e(0, 1118481).box(v * 0.11, 1.18, -0.1, 0.03, 0.4, 0.03, 0, {});
  }
  (c && e(0, 1118481).box(0.05, 1.1, 0.14, 0.1, 0.07, 0.06, 0, {}),
    a && (e(0, 1118481).box(0, 0.98, 0, g * 2 + 0.02, 0.06, 0.25, 0, {}), e(0, 14202186).box(-0.09, 1.3, 0.123, 0.05, 0.06, 0.01, 0, {})),
    f && e(0, 16777215).box(0, 1.08, -0.18, 0.3, 0.38, 0.13, 0, {}),
    e(0, h).tube(0, 1.43, 0, 0.048, 0.05, 0.045, 0.048, 0.09, 6, !1),
    e(0, h).ell(0, 1.62, 0.005, 0.098, 0.12, 0.108, 10, 7),
    e(0, h).box(0, 1.6, 0.104, 0.024, 0.04, 0.03, 0, {}));
  for (let v of [-1, 1])
    (e(0, 16053490).box(v * 0.035, 1.64, 0.098, 0.026, 0.016, 0.008, 0, {}),
      e(0, 1380879).box(v * 0.035, 1.64, 0.103, 0.012, 0.014, 0.006, 0, {}),
      e(0, 2760728).box(v * 0.037, 1.666, 0.1, 0.03, 0.007, 0.01, 0, {}),
      e(0, h).ell(v * 0.1, 1.615, -0.005, 0.018, 0.032, 0.022, 5, 3));
  if (
    (e(0, 11565674).box(0, 1.565, 0.1, 0.034, 0.008, 0.008, 0, {}),
    (n === 7 || (n === 2 && Math.random() < 0.5)) && e(0, 16185076).box(0, 1.575, 0.093, 0.13, 0.065, 0.03, 0, {}),
    r || (n === 2 && Math.random() < 0.4))
  ) {
    for (let v of [-1, 1]) e(0, 1118481).box(v * 0.035, 1.64, 0.11, 0.04, 0.03, 0.006, 0, {});
    e(0, 1118481).box(0, 1.645, 0.11, 0.03, 0.006, 0.006, 0, {});
  }
  let _ = r ? 12170928 : n === 1 && Math.random() < 0.3 ? 5913124 : S_;
  i
    ? (e(0, 12633288).ell(0, 1.67, 0, 0.13, 0.12, 0.14, 9, 5, 0.5, 1), e(0, 12633288).tube(0, 1.6, -0.02, 0.15, 0.16, 0.14, 0.15, 0.05, 10, !0))
    : s
      ? (e(0, 4016686).ell(0, 1.67, 0, 0.125, 0.12, 0.135, 9, 5, 0.5, 1), e(0, 4016686).tube(0, 1.6, 0, 0.14, 0.15, 0.135, 0.145, 0.04, 10, !0))
      : a
        ? (e(0, 1844024).tube(0, 1.66, 0, 0.11, 0.12, 0.115, 0.125, 0.09, 9, !0),
          e(0, 1118481).box(0, 1.665, 0.11, 0.2, 0.02, 0.08, 0, {}),
          e(0, 14202186).box(0, 1.71, 0.122, 0.035, 0.035, 0.01, 0, {}))
        : r && Math.random() < 0.5
          ? e(0, 7035462).tube(0, 1.68, 0, 0.13, 0.14, 0.11, 0.12, 0.08, 9, !0)
          : u
            ? (e(0, S_).ell(0, 1.63, -0.005, 0.106, 0.118, 0.116, 8, 3, 0.45, 1),
              e(0, 1915499).ell(0, 1.68, -0.005, 0.11, 0.07, 0.118, 9, 3, 0.5, 1),
              e(0, 1915499).box(0, 1.69, 0.12, 0.17, 0.02, 0.1, 0, {}))
            : c
              ? (e(0, 9071178).ell(0, 1.63, -0.005, 0.106, 0.12, 0.116, 8, 3, 0.45, 1),
                e(0, 15260856).tube(0, 1.7, 0, 0.21, 0.21, 0.2, 0.2, 0.015, 12, !0),
                e(0, 15260856).tube(0, 1.71, 0, 0.11, 0.115, 0.1, 0.11, 0.08, 10, !0))
              : (e(0, _).ell(0, 1.63, -0.005, 0.106, 0.125, 0.116, 8, 3, 0.45, 1),
                n === 7
                  ? e(0, _).ell(0, 1.6, -0.12, 0.05, 0.06, 0.05, 6, 4)
                  : o && e(0, _).tube(0, 1.34, -0.04, 0.1, 0.07, 0.105, 0.085, 0.32, 8, !1, -0.02, 0));
  for (let v of [-1, 1]) {
    let b = v * (M + 0.035);
    (e(2 * v, x).tube(b, 1.12, 0, 0.047, 0.05, 0.055, 0.058, 0.3, 6, !1),
      e(2 * v, m ? h : x).tube(b, 0.84, 0, 0.04, 0.042, 0.046, 0.048, 0.29, 6, !1),
      e(2 * v, h).ell(b, 0.79, 0, 0.04, 0.06, 0.045, 5, 3));
  }
  return (
    l && e(-2, 2759956).box(-(M + 0.04), 0.5, 0, 0.08, 0.28, 0.38, 0, {}),
    n === 5 && e(2, 16777215).box(M + 0.08, 0.95, 0, 0.06, 0.3, 0.3, 0, {}),
    n === 7 && e(2, 5911332).box(M + 0.06, 0.62, 0, 0.07, 0.22, 0.3, 0, {}),
    n === 1 && e(0, 5911332).box(g + 0.02, 0.98, 0, 0.05, 0.2, 0.24, 0, {}),
    t.build()
  );
}
function pedMaterial() {
  let n = new THREE.MeshStandardMaterial({
    vertexColors: !0,
    roughness: 0.85,
  });
  return (
    (n.onBeforeCompile = (t) => {
      ((t.uniforms.uTime = rn.uTime),
        (t.vertexShader = t.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
attribute float aMat;attribute vec4 aWalk;uniform float uTime;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
{float lb=aMat;float sw=sin(uTime*aWalk.z+aWalk.x)*aWalk.y;
if(abs(lb)>0.5){float sg=sign(lb);float arm=step(1.5,abs(lb));float piv=mix(0.88,1.42,arm);
float ang=sw*sg*mix(1.0,-0.85,arm);
if(arm>0.5&&sg<0.0&&aWalk.w>0.0)ang=-1.6*aWalk.w;
if(arm>0.5&&aWalk.w<0.0)ang=-2.6;
if(arm>0.5&&aWalk.w>1.5)ang=sg<0.0?-1.5:-1.25;
vec3 p=transformed;p.y-=piv;float cs=cos(ang),sn=sin(ang);transformed=vec3(p.x,p.y*cs-p.z*sn,p.y*sn+p.z*cs);transformed.y+=piv;}
transformed.y+=abs(sw)*0.06;}`,
          )
          .replace(
            '#include <color_vertex>',
            `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor=color.xyz;
if(color.r+color.g+color.b>2.95)vColor=instanceColor.xyz;
if(color.r>0.99&&color.g<0.01&&color.b>0.99){float pk=fract(instanceColor.r*7.31+instanceColor.g*3.17+instanceColor.b*1.9);
vColor=pk<0.25?vec3(0.12,0.15,0.25):pk<0.5?vec3(0.08,0.08,0.09):pk<0.72?vec3(0.22,0.32,0.5):pk<0.86?vec3(0.36,0.37,0.39):vec3(0.6,0.55,0.45);}
#endif`,
          )));
    }),
    n
  );
}
var A_ = [15921904, 2764083, 2042436, 7040626, 13219994, 11546666, 15247544, 5929546, 1579291, 10272988, 13214522, 14605008, 3948358, 8018570],
  P0 = [],
  Ng,
  Ls = new THREE.Object3D(),
  Kp = new THREE.Color();
function initPeds() {
  Ng = pedMaterial();
  let n = Math.ceil(R.Q.peds * 0.45) + 30;
  P0 = [...Array(PED_KINDS).keys()].map((t) => {
    let e = pedGeo(t),
      i = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    (i.setUsage(THREE.DynamicDrawUsage), e.setAttribute('aWalk', i));
    let s = new THREE.InstancedMesh(e, Ng, n);
    (s.instanceMatrix.setUsage(THREE.DynamicDrawUsage), (s.frustumCulled = !1), (s.castShadow = !0));
    for (let o = 0; o < n; o++) s.setColorAt(o, Kp.set(16777215));
    return (
      (s.count = 0),
      R.scene.add(s),
      {
        m: s,
        w: i,
        cap: n,
        free: [...Array(n).keys()].reverse(),
        hi: 0,
      }
    );
  });
}
function makePlayerMesh() {
  let n = pedGeo(0),
    t = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
  (t.setUsage(THREE.DynamicDrawUsage), n.setAttribute('aWalk', t));
  let e = new THREE.InstancedMesh(n, Ng, 1);
  return ((e.frustumCulled = !1), (e.castShadow = !0), e.setColorAt(0, Kp.set(2842528)), R.scene.add(e), (e.userData.w = t), e);
}
var XR = (n) => (n.kind === 'L' ? n.hw - 0.55 : n.hw + (n.kind === 'A' ? 2.1 : 1.6)),
  Bg = (n) => !n.elev && n.kind !== 'X',
  el = {
    x: 0,
    z: 0,
    dx: 1,
    dz: 0,
  };
function z0(n, t, e, i) {
  edgePos(n, t, el);
  let s = XR(n) * e;
  return ((i.x = el.x + el.dz * s), (i.z = el.z - el.dx * s), (i.dx = el.dx), (i.dz = el.dz), i);
}
function spawnPed(n, t, e) {
  let i = [];
  roadsNear(n, t, 50, i);
  let s = i.filter((M) => Bg(M.e) && M.e.len > 10);
  if (!s.length) return null;
  let o = Be(s),
    r = o.e,
    a = Math.random() < 0.5 ? 1 : -1,
    l = {};
  z0(r, o.s, a, l);
  let f = maskQ(l.x, l.z);
  if (f !== M_LAND && f !== M_PARK && f !== M_AIR) return null;
  let u = G.densityAt ? G.densityAt(l.x, l.z) : 0.5;
  if (Math.random() > 0.25 + u) return null;
  let c = (G.t * 0.06 + n * 7e-4) % 1,
    h = u > 0.6 ? 0.3 : 0.12,
    d = Math.random(),
    p =
      d < h * 0.7
        ? 2
        : d < h
          ? 7
          : d < h + 0.18
            ? 1
            : d < h + 0.3
              ? 5
              : d < h + 0.38
                ? 3
                : d < h + 0.45
                  ? 6
                  : d < h + 0.56
                    ? 8
                    : d < h + 0.62
                      ? 9
                      : 0,
    x = P0[p];
  if (!x.free.length) return null;
  let m = x.free.pop();
  ((x.hi = Math.max(x.hi, m + 1)), (x.m.count = x.hi));
  let g = {
    kind: p,
    slot: m,
    e: r,
    s: o.s,
    side: a,
    dir: Math.random() < 0.5 ? 1 : -1,
    v: p === 6 ? rt(0.8, 1.1) : p === 9 ? rt(0.9, 1.25) : rt(1.15, 1.6),
    lo: rt(-0.5, 0.5),
    x: l.x,
    y: 0.18,
    z: l.z,
    yaw: 0,
    state: 'walk',
    t: 0,
    ph: Math.random() * 6,
    sc: rt(0.94, 1.05) * (p === 1 || p === 5 || p === 7 ? 0.95 : p === 6 ? 0.93 : 1),
    vx: 0,
    vy: 0,
    vz: 0,
    phone: Math.random() < 0.18,
  };
  if (
    (Math.random() < 0.08 && ((g.state = 'idle'), (g.t = rt(3, 12))),
    x.m.setColorAt(
      m,
      Kp.set(p === 2 || p === 7 ? Be([2764083, 2042436, 3948358, 1579291, 4869458]) : p === 6 ? Be([12167050, 8022616, 6055024]) : Be(A_)),
    ),
    (x.m.instanceColor.needsUpdate = !0),
    e !== 'pair' && Math.random() < 0.15)
  ) {
    let M = spawnPed(n, t, 'pair');
    M &&
      ((M.e = g.e),
      (M.s = g.s - g.dir * 0.9),
      (M.side = g.side),
      (M.dir = g.dir),
      (M.v = g.v),
      (M.lo = g.lo > 0 ? g.lo - 0.65 : g.lo + 0.65),
      (M.state = g.state),
      (M.t = g.t),
      (M.phone = !1));
  }
  return (G.peds.push(g), g);
}
function spawnPedAt(n, t, e = 'flee', i = 0) {
  let s = P0[i];
  if (!s.free.length) return null;
  let o = s.free.pop();
  ((s.hi = Math.max(s.hi, o + 1)), (s.m.count = s.hi));
  let r = {
    kind: i,
    slot: o,
    e: null,
    s: 0,
    side: 1,
    dir: 1,
    v: 1.3,
    lo: 0,
    x: n,
    y: 0.18,
    z: t,
    yaw: 0,
    state: e,
    t: 6,
    ph: 1,
    sc: 1,
    vx: 0,
    vy: 0,
    vz: 0,
  };
  return (s.m.setColorAt(o, Kp.set(Be(A_))), (s.m.instanceColor.needsUpdate = !0), G.peds.push(r), r);
}
function qR(n) {
  let t = P0[n.kind];
  (Ls.position.set(0, -100, 0),
    Ls.scale.set(0, 0, 0),
    Ls.updateMatrix(),
    t.m.setMatrixAt(n.slot, Ls.matrix),
    Ls.scale.set(1, 1, 1),
    t.free.push(n.slot));
}
var C0 = 16,
  Yp = new Map();
function rebuildPedGrid() {
  Yp.clear();
  for (let n of G.peds) {
    let t = (Math.floor(n.x / C0) + 4e3) * 16384 + Math.floor(n.z / C0) + 4e3,
      e = Yp.get(t);
    (e || Yp.set(t, (e = [])), e.push(n));
  }
}
function pedsNear(n, t, e, i) {
  i.length = 0;
  for (let s = Math.floor((n - e) / C0); s <= Math.floor((n + e) / C0); s++)
    for (let o = Math.floor((t - e) / C0); o <= Math.floor((t + e) / C0); o++) {
      let r = Yp.get((s + 4e3) * 16384 + o + 4e3);
      if (r) for (let a of r) i.push(a);
    }
  return i;
}
var k0 = [];
G.pedObstacle = (n, t, e, i, s) => {
  let o = 99;
  pedsNear(n.x + t * 12, n.z + e * 12, 14, k0);
  for (let r of k0) {
    if (r.state === 'down' || Math.abs(r.y - n.y) > 2) continue;
    let a = r.x - n.x,
      l = r.z - n.z,
      f = a * t + l * e;
    if (f <= 0 || f > 22) continue;
    Math.abs(a * i + l * s) < n.td.W / 2 + (r.state === 'cross' || r.state === 'flee' || r.state === 'fireman' ? 0.9 : 0.12) &&
      (o = Math.min(o, f - n.td.L / 2 - 0.8));
  }
  return o;
};
var cn = {};
function Ug(n, t, e, i) {
  let s = (n + e) / 2,
    o = (t + i) / 2,
    r = Math.hypot(e - n, i - t) || 1,
    a = (e - n) / r,
    l = (i - t) / r,
    f = G.carsNear ? G.carsNear(s, o, 30) : [];
  for (let u of f) {
    if (u.removed || u.y > 2) continue;
    let c = u.mode === 'ai' ? u.v : Math.hypot(u.vx, u.vz);
    if (c < 0.8) continue;
    let h = u.x - s,
      d = u.z - o,
      p = h * a + d * l,
      x = h * -l + d * a;
    if (Math.abs(p) > r / 2 + 2) continue;
    let m = Math.sin(u.yaw),
      g = Math.cos(u.yaw);
    if ((-(x * (m * -l + g * a)) > 0 && Math.abs(x) < 4 + c * 2.5) || Math.abs(x) < 3) return !0;
  }
  return !1;
}
function $R(n) {
  let t = n.e,
    e = n.dir > 0 ? t.b : t.a,
    i = W.nodes[e],
    s = i.edges.map((d) => W.edges[d]).filter((d) => Bg(d) && (d !== t || i.edges.length === 1));
  if (!s.length) {
    n.dir *= -1;
    return;
  }
  let o = n.pref && s.includes(n.pref) ? n.pref : Be(s),
    r = o.a === e ? 1 : -1,
    a = r > 0 ? Math.min(i.r + 1, o.len / 2) : Math.max(o.len - i.r - 1, o.len / 2);
  z0(o, a, 1, cn);
  let l = Math.hypot(cn.x - n.x, cn.z - n.z);
  z0(o, a, -1, cn);
  let f = Math.hypot(cn.x - n.x, cn.z - n.z),
    u = l < f ? 1 : -1;
  (Math.random() < 0.3 && (u = -u), z0(o, a, u, cn));
  let c = Math.hypot(cn.x - n.x, cn.z - n.z),
    h = {
      f: o,
      d2: r,
      s2: a,
      side: u,
      bx: cn.x,
      bz: cn.z,
    };
  if (c > 5) {
    if (i.sig) {
      if (sigState(i, o.i, G.t) !== 2) {
        ((n.state = 'wait'), (n.t = 0.5), (n.pend = h));
        return;
      }
    } else if (Ug(n.x, n.z, cn.x, cn.z)) {
      ((n.state = 'wait'), (n.t = 0.5), (n.pend = h));
      return;
    }
  }
  ((n.state = 'cross'),
    (n.cr = {
      ax: n.x,
      az: n.z,
      bx: cn.x,
      bz: cn.z,
      len: Math.max(0.5, c),
      t: 0,
      f: o,
      d2: r,
      s2: a,
      side: u,
    }));
}
function Dg(n) {
  let t = [];
  roadsNear(n.x, n.z, 40, t);
  let e = t.find((i) => Bg(i.e));
  if (!e) {
    n.dead = !0;
    return;
  }
  ((n.e = e.e),
    (n.s = e.s),
    (n.side = Math.random() < 0.5 ? 1 : -1),
    (n.dir = Math.random() < 0.5 ? 1 : -1),
    z0(n.e, n.s, n.side, cn),
    (n.cr = {
      ax: n.x,
      az: n.z,
      bx: cn.x,
      bz: cn.z,
      len: Math.max(0.5, Math.hypot(cn.x - n.x, cn.z - n.z)),
      t: 0,
      f: n.e,
      d2: n.dir,
      s2: n.s,
      side: n.side,
    }),
    (n.state = 'cross'));
}
function Of(n, t, e, i, s) {
  let o = t - n.x,
    r = e - n.z,
    a = Math.hypot(o, r) || 1;
  ((o /= a), (r /= a));
  let l = n.x,
    f = n.z,
    u = Math.min(a, i * s);
  return (
    (n.x += o * u),
    (n.z += r * u),
    (n.yaw = n.yaw + ln(Math.atan2(o, r) - n.yaw) * Math.min(1, s * 10)),
    collideBuildings(n, 0.3, 0),
    isWaterAt(n.x, n.z) && ((n.x = l), (n.z = f)),
    a
  );
}
function updPed(n, t) {
  n.punchT > 0 && (n.punchT -= t);
  let e = G.player;
  switch (n.state) {
    case 'down': {
      if (
        ((n.vy -= 20 * t),
        (n.x += n.vx * t),
        (n.z += n.vz * t),
        (n.y += n.vy * t),
        n.y <= 0.05 && ((n.y = 0.05), (n.vy = 0), (n.vx *= 0.8), (n.vz *= 0.8)),
        collideBuildings(n, 0.3, n.y),
        (n.t -= t),
        n.killed)
      ) {
        n.t <= 0 && (n.dead = !0);
        return;
      }
      n.t <= 0 &&
        ((n.y = 0.18),
        n.kind === 4 || n.kind === 11
          ? ((n.state = 'cop'), (n.t = 30))
          : n.kind === 10
            ? (n.state = 'fireman')
            : n.grudge
              ? ((n.state = 'attack'), (n.t = 20))
              : ((n.state = 'flee'), (n.t = rt(4, 7))));
      return;
    }
    case 'flee': {
      let u = n.x - e.x,
        c = n.z - e.z,
        h = Math.hypot(u, c) || 1;
      (Of(n, n.x + (u / h) * 10, n.z + (c / h) * 10, 4.4, t), (n.t -= t), n.t <= 0 && Dg(n));
      return;
    }
    case 'fireman':
      G.firemanAI && G.firemanAI(n, t);
      return;
    case 'attack':
    case 'cop': {
      n.t -= t;
      let u = e.mode === 'foot' && !e.interior,
        c = Math.hypot(e.x - n.x, e.z - n.z);
      if ((n.state === 'cop' && G.heat < 1 && (n.t = Math.min(n.t, 0)), n.t <= 0 || c > 120 || (!u && n.state === 'attack' && c > 25))) {
        n.home && n.home.driver === !1 && !n.home.removed && !n.home.dead ? ((n.state = 'board'), (n.t = 25)) : Dg(n);
        return;
      }
      if (n.flinch > 0) {
        n.flinch -= t;
        return;
      }
      if (n.state === 'cop' && G.copShoot && Ke() >= 3 && (u || e.mode === 'car')) {
        let h = e.mode === 'car' && e.car ? e.car : e,
          d = Math.hypot(h.x - n.x, h.z - n.z);
        if (
          d < 34 &&
          ((n.losT = (n.losT || 0) - t),
          n.losT <= 0 && ((n.losT = 0.5), (n.los = rayBuildings(n.x, n.y + 1.5, n.z, h.x, (h.y || 0) + 1.2, h.z) >= 1)),
          n.los)
        ) {
          ((n.yaw += ln(Math.atan2(h.x - n.x, h.z - n.z) - n.yaw) * Math.min(1, t * 8)),
            (n.aim = 0.6),
            d > 16 && Of(n, h.x, h.z, 2.2, t),
            (n.shootT = (n.shootT ?? rt(0.4, 1.2)) - t),
            n.shootT <= 0 && ((n.shootT = rt(0.8, 1.5) * (Ke() >= 5 ? 0.7 : 1)), G.copShoot(n)));
          return;
        }
      }
      if ((n.aim > 0 && (n.aim -= t), !u)) {
        ((n.yaw += ln(Math.atan2(e.x - n.x, e.z - n.z) - n.yaw) * Math.min(1, t * 6)),
          n.state === 'cop' && c > 4 && Of(n, e.car ? e.car.x : e.x, e.car ? e.car.z : e.z, 5, t));
        return;
      }
      (c > 1.1
        ? Of(n, e.x, e.z, n.state === 'cop' ? 5.6 : 5, t)
        : (n.punchT || 0) <= 0 &&
          e.down <= 0 &&
          ((n.punchT = n.state === 'cop' ? 1.4 : 1.1), (n.swing = 0.4), G.hitPlayer && G.hitPlayer(n, n.state === 'cop' ? 7 : 5)),
        n.swing > 0 && (n.swing -= t));
      return;
    }
    case 'board': {
      let u = n.home;
      if (!u || u.removed || u.dead) {
        Dg(n);
        return;
      }
      let c = Of(n, u.x, u.z, 2.2, t);
      ((n.t -= t), (c < 2 || n.t <= 0) && ((u.driver = !0), (u.recT = 0), (u.honk = 0), (n.dead = !0)));
      return;
    }
    case 'idle':
      ((n.t -= t),
        e &&
          Math.hypot(e.x - n.x, e.z - n.z) < 3 &&
          e.mode === 'foot' &&
          (n.yaw += ln(Math.atan2(e.x - n.x, e.z - n.z) - n.yaw) * Math.min(1, t * 3)),
        n.t <= 0 && (n.state = 'walk'));
      return;
    case 'wait': {
      if (((n.t -= t), n.t <= 0)) {
        n.t = 0.5;
        let u = n.pend,
          c = u.f,
          h = c.a === (n.dir > 0 ? n.e.b : n.e.a) ? c.a : c.b,
          d = W.nodes[h],
          p = d.sig ? sigState(d, c.i, G.t) === 2 && !Ug(n.x, n.z, u.bx, u.bz) : !Ug(n.x, n.z, u.bx, u.bz);
        ((n.waitT = (n.waitT || 0) + 0.5),
          (p || n.waitT > (d.sig ? 60 : 25)) &&
            ((n.waitT = 0),
            (n.state = 'cross'),
            (n.cr = {
              ax: n.x,
              az: n.z,
              bx: u.bx,
              bz: u.bz,
              len: Math.max(0.5, Math.hypot(u.bx - n.x, u.bz - n.z)),
              t: 0,
              ...u,
            })));
      }
      return;
    }
    case 'cross': {
      let u = n.cr,
        c = u.len > 6 ? 1.35 : 1.1;
      u.t += n.v * c * t;
      let h = Math.min(1, u.t / u.len);
      ((n.x = Ee(u.ax, u.bx, h)),
        (n.z = Ee(u.az, u.bz, h)),
        u.len > 0.6 && (n.yaw = n.yaw + ln(Math.atan2(u.bx - u.ax, u.bz - u.az) - n.yaw) * Math.min(1, t * 10)),
        (n.y = u.len > 6 && h > 0.1 && h < 0.9 ? 0.04 : 0.18),
        h >= 1 && ((n.e = u.f), (n.dir = u.d2), (n.s = u.s2), (n.side = u.side), (n.state = 'walk')));
      return;
    }
  }
  let i = n.e;
  n.s += n.dir * n.v * (n.slow || 1) * t;
  let s = W.nodes[i.a],
    o = W.nodes[i.b];
  if ((n.dir > 0 && n.s > i.len - o.r - 1) || (n.dir < 0 && n.s < s.r + 1)) {
    $R(n);
    return;
  }
  (z0(i, n.s, n.side, cn), (n.slow = 1), pedsNear(n.x, n.z, 1.6, k0));
  for (let u of k0) {
    if (u === n || u.state === 'down') continue;
    let c = u.x - n.x,
      h = u.z - n.z,
      d = Math.hypot(c, h);
    if (d > 1.5 || d < 0.001) continue;
    let p = Math.sin(n.yaw),
      x = Math.cos(n.yaw);
    if (c * p + h * x < 0) continue;
    let g = c * -x + h * p;
    ((n.lo = It(n.lo + (g > 0 ? 1 : -1) * t * 0.9 * n.side, -0.9, 0.9)), u.dir === n.dir && u.e === n.e && d < 0.9 && (n.slow = 0.5));
  }
  let r = cn.x + cn.dz * n.lo * n.side,
    a = cn.z - cn.dx * n.lo * n.side;
  ((n.x = r),
    (n.z = a),
    (n.yaw = n.yaw + ln(Math.atan2(cn.dx * n.dir, cn.dz * n.dir) - n.yaw) * Math.min(1, t * 8)),
    (n.y = i.kind === 'L' ? 0.04 : 0.18));
  let l = n.x,
    f = n.z;
  (collideBuildings(n, 0.32, 0) && (n.lo = It(n.lo + ((n.x - l) * cn.dz - (n.z - f) * cn.dx) * n.side, -1.2, 1.2)),
    Math.random() < t * 0.012 && ((n.state = 'idle'), (n.t = rt(2, 7))),
    e &&
      e.mode === 'car' &&
      e.car &&
      Math.abs(e.car.v) > 14 &&
      Math.hypot(e.car.x - n.x, e.car.z - n.z) < 9 &&
      Math.random() < t * 3 &&
      ((n.state = 'flee'), (n.t = rt(1.5, 3))));
}
function knockPed(n, t, e, i, s, o) {
  return n.killed
    ? ((n.vx = t * 0.5), (n.vy = Math.min(e, 2)), (n.vz = i * 0.5), !1)
    : (n.hp === void 0 && (n.hp = n.kind === 4 ? 120 : 80),
      (n.hp -= o ?? s * s * 0.5),
      (n.state = 'down'),
      (n.vx = t),
      (n.vy = e),
      (n.vz = i),
      (n.t = rt(3, 5)),
      (n.y += 0.2),
      (n.aim = 0),
      n.hp <= 0 && ((n.killed = !0), (n.t = 50), xt('pedKilled', n)),
      xt('pedhit', {
        x: n.x,
        z: n.z,
        v: s,
      }),
      scarePeds(n.x, n.z, 14),
      !!n.killed);
}
function scarePeds(n, t, e) {
  pedsNear(n, t, e, k0);
  for (let i of k0)
    i.state !== 'down' &&
      i.state !== 'cop' &&
      i.state !== 'attack' &&
      i.state !== 'fireman' &&
      Math.hypot(i.x - n, i.z - t) < e &&
      ((i.state = 'flee'), (i.t = rt(4, 8)));
}
function managePeds(n, t, e, i, s) {
  for (let r = G.peds.length - 1; r >= 0; r--) {
    let a = G.peds[r];
    (a.dead || Math.hypot(a.x - n, a.z - t) > e + 40) && (qR(a), (G.peds[r] = G.peds[G.peds.length - 1]), G.peds.pop());
  }
  let o = 0;
  for (; G.peds.length < i && o++ < 30;) {
    let r = Math.random() * Math.PI * 2,
      a = s ? rt(10, e) : rt(e * 0.6, e);
    spawnPed(n + Math.cos(r) * a, t + Math.sin(r) * a);
  }
}
function renderPeds() {
  for (let n of G.peds) {
    let t = P0[n.kind];
    (Ls.position.set(n.x, n.y + (n.state === 'down' ? 0.12 : 0), n.z),
      n.state === 'down' ? Ls.rotation.set(-Math.PI / 2, n.yaw, 0, 'YXZ') : Ls.rotation.set(0, n.yaw, 0, 'XYZ'),
      Ls.scale.setScalar(n.sc),
      Ls.updateMatrix(),
      t.m.setMatrixAt(n.slot, Ls.matrix));
    let e = n.state === 'walk' || n.state === 'cross' || n.state === 'board' || (n.state === 'fireman' && !n.spray),
      i = n.state === 'flee' || n.state === 'attack' || n.state === 'cop',
      s = t.w.array,
      o = n.slot * 4;
    ((s[o] = n.ph),
      (s[o + 1] = i ? 0.85 : e ? 0.5 * (n.slow || 1) : 0),
      (s[o + 2] = i ? 11 : e ? n.v * 5.2 : 0),
      (s[o + 3] = n.spray
        ? 2
        : n.aim > 0
          ? n.kind === 11
            ? 2
            : 1
          : n.swing > 0
            ? Math.sin(((0.4 - n.swing) / 0.4) * Math.PI)
            : rn.uRain.value > 0.3 && !i && n.kind !== 4
              ? -1
              : n.phone && (e || n.state === 'idle' || n.state === 'wait')
                ? 0.85
                : 0));
  }
  Ls.scale.set(1, 1, 1);
  for (let n of P0) ((n.m.instanceMatrix.needsUpdate = !0), (n.w.needsUpdate = !0));
}
var gt = {
  ctx: null,
  on: !0,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    let n = this.ctx;
    ((this.master = n.createGain()), (this.master.gain.value = 0.8), this.master.connect(n.destination));
    let t = n.createBuffer(1, n.sampleRate * 2, n.sampleRate),
      e = t.getChannelData(0),
      i = 0;
    for (let b = 0; b < e.length; b++) {
      let w = Math.random() * 2 - 1;
      ((i = (i + 0.02 * w) / 1.02), (e[b] = w * 0.6 + i * 3));
    }
    this.noise = t;
    let s = (b, w, E) => {
      let C = n.createBufferSource();
      ((C.buffer = t), (C.loop = !0));
      let S = n.createBiquadFilter();
      ((S.type = E || 'lowpass'), (S.frequency.value = b), (S.Q.value = w || 0.7));
      let T = n.createGain();
      return (
        (T.gain.value = 0),
        C.connect(S),
        S.connect(T),
        T.connect(this.master),
        C.start(),
        {
          g: T,
          fl: S,
        }
      );
    };
    ((this.amb = s(700, 0.5, 'bandpass')),
      (this.rumble = s(160, 0.8)),
      (this.wind = s(900, 0.4)),
      (this.jet = s(420, 0.6)),
      (this.rain = s(2500, 0.3, 'highpass')),
      (this.rotor = s(120, 1.2)));
    let o = (b, w) => {
        let E = n.createOscillator();
        return ((E.type = b), (E.frequency.value = w), E.start(), E);
      },
      r = o('sawtooth', 50),
      a = o('square', 25),
      l = n.createBiquadFilter();
    ((l.type = 'lowpass'), (l.frequency.value = 600));
    let f = n.createGain();
    f.gain.value = 0;
    let u = n.createGain();
    ((u.gain.value = 0.35),
      r.connect(l),
      a.connect(u),
      u.connect(l),
      l.connect(f),
      f.connect(this.master),
      (this.eng = {
        o: r,
        o2: a,
        f: l,
        g: f,
      }));
    let c = o('triangle', 700),
      h = n.createGain();
    ((h.gain.value = 0),
      c.connect(h),
      h.connect(this.master),
      (this.sir = {
        o: c,
        g: h,
      }));
    let d = o('square', 350),
      p = o('square', 440),
      x = n.createBiquadFilter();
    ((x.type = 'lowpass'), (x.frequency.value = 1400));
    let m = n.createGain();
    ((m.gain.value = 0), d.connect(x), p.connect(x), x.connect(m), m.connect(this.master), (this.hornG = m));
    let g = o('sine', 9),
      M = n.createGain();
    ((M.gain.value = 0), g.connect(M), M.connect(this.rotor.g.gain), (this.rotorLfo = M), (this.radioT = 0), (this.radioStep = 0));
    let y = o('sawtooth', 400),
      _ = n.createBiquadFilter();
    ((_.type = 'bandpass'), (_.frequency.value = 900), (_.Q.value = 6));
    let v = n.createGain();
    ((v.gain.value = 0),
      y.connect(_),
      _.connect(v),
      v.connect(this.master),
      (this.vvvf = {
        o: y,
        f: _,
        g: v,
      }),
      (this.crowd = s(1100, 1.4, 'bandpass')),
      (this.crackle = s(3e3, 0.6, 'highpass')),
      (this.boatEng = s(220, 2.5, 'lowpass')),
      (this.T = {
        clack: 0,
        step: 0,
        sig: 0,
        bird: 4,
        cricket: 0,
        bell: 0,
        amb: 0,
        fireBell: 0,
        voice: 2,
        crack: 0,
      }));
  },
  chimeStore() {
    [
      [880, 0],
      [698, 0.18],
      [587, 0.36],
      [698, 0.54],
      [880, 0.72],
      [784, 0.9],
    ].forEach(([n, t]) => this.tone(n, 0.35, 0.09, 'sine', null, t));
  },
  doorClose() {
    ([
      [1175, 0],
      [988, 0.35],
    ].forEach(([n, t]) => this.tone(n, 0.5, 0.1, 'sine', null, t)),
      this.burst(600, 0.25, 0.12, 'lowpass'));
  },
  announce() {
    (this.tone(659, 0.25, 0.08, 'sine'), this.tone(523, 0.4, 0.08, 'sine', null, 0.22));
  },
  resume() {
    this.ctx && this.ctx.state !== 'running' && this.ctx.resume();
  },
  burst(n, t, e, i) {
    if (!this.ctx || !this.on) return;
    let s = this.ctx,
      o = s.createBufferSource();
    o.buffer = this.noise;
    let r = s.createBiquadFilter();
    ((r.type = i || 'lowpass'), (r.frequency.value = n));
    let a = s.createGain(),
      l = s.currentTime;
    (a.gain.setValueAtTime(e, l),
      a.gain.exponentialRampToValueAtTime(0.001, l + t),
      o.connect(r),
      r.connect(a),
      a.connect(this.master),
      o.start(l, Math.random()),
      o.stop(l + t + 0.05));
  },
  tone(n, t, e, i, s, o = 0) {
    if (!this.ctx || !this.on) return;
    let r = this.ctx,
      a = r.createOscillator();
    a.type = i || 'sine';
    let l = r.createGain(),
      f = r.currentTime + o;
    (a.frequency.setValueAtTime(n, f),
      s && a.frequency.exponentialRampToValueAtTime(s, f + t),
      l.gain.setValueAtTime(1e-4, f),
      l.gain.linearRampToValueAtTime(e, f + 0.01),
      l.gain.exponentialRampToValueAtTime(0.001, f + t),
      a.connect(l),
      l.connect(this.master),
      a.start(f),
      a.stop(f + t + 0.05));
  },
  crash(n) {
    (this.burst(900, 0.35 + Math.min(0.5, n * 0.02), Math.min(0.9, 0.15 + n * 0.04)), this.tone(70, 0.3, Math.min(0.5, n * 0.03), 'sine', 40));
  },
  gun(n, t) {
    let e = Math.max(0.03, 1 - (t || 0) / 320);
    n === 'shotgun'
      ? (this.burst(900, 0.45, e), this.tone(70, 0.3, e * 0.6, 'sine', 35))
      : n === 'rifle'
        ? (this.burst(1500, 0.22, e * 0.85), this.tone(110, 0.14, e * 0.5, 'square', 45))
        : n === 'smg'
          ? (this.burst(2200, 0.1, e * 0.6), this.tone(160, 0.06, e * 0.35, 'square', 70))
          : (this.burst(1700, 0.16, e * 0.7), this.tone(140, 0.1, e * 0.45, 'square', 55));
  },
  thud() {
    (this.tone(110, 0.18, 0.5, 'sine', 50), this.burst(500, 0.12, 0.25));
  },
  swing() {
    this.burst(2500, 0.12, 0.12, 'highpass');
  },
  door() {
    (this.tone(180, 0.08, 0.3, 'square', 90), this.burst(1200, 0.06, 0.15));
  },
  splash() {
    this.burst(700, 1.4, 0.6);
  },
  boom(n) {
    let t = Math.max(0.05, 1 - n / 400);
    (this.burst(400, 1.8, t), this.tone(55, 1.2, t * 0.8, 'sine', 30));
  },
  melody() {
    [659, 784, 880, 1047, 988, 880, 784, 880].forEach((t, e) => this.tone(t, 0.32, 0.12, 'triangle', null, e * 0.2));
  },
  chime() {
    [
      [988, 0],
      [784, 0.35],
    ].forEach(([n, t]) => this.tone(n, 0.9, 0.16, 'sine', null, t));
  },
  blip() {
    this.tone(880, 0.12, 0.15, 'triangle', 1320);
  },
  cash() {
    (this.tone(1046, 0.1, 0.18, 'square'), this.tone(1568, 0.25, 0.18, 'square', null, 0.09));
  },
  mission() {
    [523, 659, 784, 1047].forEach((n, t) => this.tone(n, 0.5, 0.14, 'triangle', null, t * 0.12));
  },
  fail() {
    [392, 330, 262].forEach((n, t) => this.tone(n, 0.5, 0.14, 'sawtooth', null, t * 0.18));
  },
  station: 1,
  radio(n) {
    if (!this.ctx || !this.on || !G.settings.music) return;
    let t = this.station;
    if (!t || t === 6) {
      t === 6 && ((this.radioT -= n), this.radioT <= 0 && ((this.radioT = 2.4), Math.random() < 0.3 && this.burst(3e3, 0.4, 0.008, 'bandpass')));
      return;
    }
    if (((this.radioT -= n), this.radioT > 0)) return;
    let e = this.radioStep++,
      i = e % 8,
      s = Math.floor(e / 8);
    if (t === 1) {
      let o = [
          [262, 330, 392],
          [196, 247, 294],
          [220, 262, 330],
          [175, 220, 262],
        ],
        r = o[s % 4];
      ((this.radioT = 0.22),
        i % 2 === 0 && this.tone(55, 0.12, 0.07, 'sine', 40),
        i % 4 === 2 && this.burst(5e3, 0.07, 0.025, 'highpass'),
        i === 0 && r.forEach((l) => this.tone(l, 1.6, 0.022, 'triangle')),
        this.tone(r[0] / 2, 0.18, 0.05, 'sawtooth'));
      let a = [0, 2, 1, 2, 0, 1, 2, 1];
      Math.random() < 0.75 && this.tone(r[a[i]] * 2, 0.18, 0.03, 'square');
    } else if (t === 2) {
      let o = [
          [147, 175, 220, 262],
          [196, 247, 294, 349],
          [131, 165, 196, 247],
          [220, 277, 330, 392],
        ],
        r = o[Math.floor(e / 4) % 4];
      ((this.radioT = i % 2 ? 0.2 : 0.34),
        this.tone((r[0] / 2) * [1, 1.125, 1.25, 1.5][e % 4], 0.3, 0.06, 'triangle'),
        this.burst(7e3, 0.12, 0.012, 'highpass'),
        e % 4 === 0 && r.forEach((a) => this.tone(a, 0.9, 0.016, 'sine')),
        Math.random() < 0.4 && this.tone(r[Math.floor(Math.random() * 4)] * 2, 0.25, 0.022, 'sine'));
    } else if (t === 3) {
      let o = [165, 196, 147, 220],
        r = o[s % 4];
      ((this.radioT = 0.18),
        i % 4 === 0 && this.tone(60, 0.18, 0.09, 'sine', 40),
        i % 4 === 2 && this.burst(1800, 0.14, 0.05),
        this.burst(9e3, 0.03, 0.012, 'highpass'),
        this.tone(r, 0.17, 0.035, 'sawtooth'),
        this.tone(r * 1.5, 0.17, 0.025, 'sawtooth'),
        i === 7 && Math.random() < 0.5 && this.tone(r * 4, 0.3, 0.02, 'sawtooth', r * 3));
    } else if (t === 4) {
      let o = [
          [220, 262, 330, 440],
          [175, 220, 262, 349],
          [196, 247, 294, 392],
          [165, 196, 247, 330],
        ],
        r = o[Math.floor(e / 16) % 4];
      ((this.radioT = 0.12),
        this.tone(r[e % 4] * 2, 0.14, 0.022, 'sawtooth'),
        e % 8 === 0 && (this.tone(r[0] / 2, 0.9, 0.06, 'sawtooth'), this.tone(55, 0.2, 0.08, 'sine', 35)),
        e % 8 === 4 && this.burst(3e3, 0.2, 0.04, 'bandpass'));
    } else if (t === 5) {
      let o = [220, 262, 294, 330, 392, 440, 523];
      ((this.radioT = 0.55), i % 4 === 0 && this.tone(110, 1.8, 0.035, 'triangle'));
      let r = o[(e * 3 + s) % o.length];
      (this.tone(r, 0.6, 0.035, 'triangle', r * (Math.random() < 0.3 ? 0.97 : 1)), i === 0 && this.burst(1200, 0.08, 0.02));
    }
  },
  update(n, t) {
    if (!this.ctx) return;
    let e = this.ctx,
      i = e.currentTime,
      s = this.on ? 1 : 0,
      o = t.carSpeed || 0,
      r = t.inCar,
      a = Math.min(4, Math.floor(o / 13)),
      l = 0.25 + ((o - a * 13) / 13) * 0.75 + (G.input.thr > 0 ? 0.12 : 0);
    (this.eng.o.frequency.setTargetAtTime(40 + l * 110 + a * 8, i, 0.05),
      this.eng.o2.frequency.setTargetAtTime(20 + l * 55 + a * 4, i, 0.05),
      this.eng.f.frequency.setTargetAtTime(400 + l * 900 + G.input.thr * 500, i, 0.05),
      this.eng.g.gain.setTargetAtTime(r ? (0.05 + G.input.thr * 0.06) * s : 0, i, 0.08),
      this.amb.g.gain.setTargetAtTime((t.indoor ? 0.01 : 0.05 - 0.02 * t.night) * s, i, 0.3),
      this.wind.g.gain.setTargetAtTime(Math.min(0.14, (o + (t.airSpeed || 0) * 0.3) * 0.002) * s, i, 0.2),
      this.sir.o.frequency.setTargetAtTime(640 + 260 * Math.sin(G.t * 2.6), i, 0.05),
      this.sir.g.gain.setTargetAtTime(t.siren < 400 ? Math.max(0, 0.08 * (1 - t.siren / 400)) * s : 0, i, 0.1),
      this.rumble.g.gain.setTargetAtTime((t.onTrain ? 0.16 : Math.max(0, 0.2 * (1 - t.train / 140))) * s, i, 0.2),
      this.jet.g.gain.setTargetAtTime(Math.max(t.inPlane ? 0.14 : 0, 0.16 * (1 - t.jet / 800)) * s, i, 0.3),
      this.jet.fl.frequency.setTargetAtTime(300 + (t.inPlane ? G.input.thrLevel * 800 : 200), i, 0.3),
      (this.rotor.fl.frequency.value = 120),
      this.rotorLfo.gain.setTargetAtTime(t.inHeli ? 0.12 * s : 0, i, 0.2),
      this.rain.g.gain.setTargetAtTime(t.rain * 0.06 * s, i, 0.5),
      this.hornG.gain.setTargetAtTime(r && G.input.horn ? 0.12 * s : 0, i, 0.02),
      (r || t.radio) && this.radio(n),
      this.extra(n, t, s));
  },
  extra(n, t, e) {
    if (!this.vvvf) return;
    let i = this.ctx,
      s = i.currentTime,
      o = this.T,
      r = t.carType || '',
      a = r === 'scooter' || r === 'moto' || r === 'polbike',
      l = r === 'truck' || r === 'bus' || r === 'fire' || r === 'sdf' || r === 'riot',
      f = r === 'sport' || r === 'super',
      u = a ? 2.1 : l ? 0.62 : f ? 1.25 : r === 'kei' || r === 'keitora' ? 1.35 : r === 'hybrid' ? 0.9 : 1;
    if (t.inCar && !t.boat) {
      let x = this.eng.o.frequency.value;
      (this.eng.o.frequency.setTargetAtTime(x * u, s, 0.05),
        this.eng.o2.frequency.setTargetAtTime(this.eng.o2.frequency.value * u, s, 0.05),
        (f || a) && this.eng.g.gain.setTargetAtTime((0.07 + G.input.thr * 0.08) * e, s, 0.08),
        r === 'hybrid' && (t.carSpeed || 0) < 8 && this.eng.g.gain.setTargetAtTime(0.012 * e, s, 0.1));
    }
    (this.boatEng.g.gain.setTargetAtTime(t.boat ? (0.05 + G.input.thr * 0.08) * e : 0, s, 0.1),
      t.boat && this.boatEng.fl.frequency.setTargetAtTime(180 + (t.carSpeed || 0) * 14, s, 0.1),
      t.boat && this.eng.g.gain.setTargetAtTime(0, s, 0.05));
    let c = t.trainV || 0,
      h = t.onTrain ? 1 : Math.max(0, 1 - (t.train || 1e9) / 110),
      d = c < 12 ? c / 12 : 1;
    if (
      (this.vvvf.o.frequency.setTargetAtTime(c < 12 ? 280 + c * 95 : 520 + (c - 12) * 18, s, 0.1),
      this.vvvf.f.frequency.setTargetAtTime(c < 12 ? 500 + c * 120 : 900, s, 0.1),
      this.vvvf.g.gain.setTargetAtTime((c > 0.5 && (t.trainAcc || 0) > -0.2 ? 0.035 * (1 - d * 0.5) : 0) * h * e, s, 0.15),
      (o.clack -= n),
      c > 2 && h > 0.05 && o.clack <= 0)
    ) {
      o.clack = 20 / c;
      let x = 0.05 + 0.1 * h;
      (this.burst(2200, 0.05, x, 'bandpass'),
        this.burst(2400, 0.05, x * 0.9, 'bandpass'),
        setTimeout(
          () => {
            this.burst(2e3, 0.05, x * 0.85, 'bandpass');
          },
          Math.max(30, (2.5 / c) * 1e3),
        ));
    }
    let p = t.siren;
    if (p < 400) {
      let x = Math.max(0, 0.08 * (1 - p / 400)) * e;
      if (t.sirenType === 'ambulance') {
        let m = Math.floor(G.t / 0.65) % 2;
        (this.sir.o.frequency.setTargetAtTime(m ? 960 : 770, s, 0.01), this.sir.g.gain.setTargetAtTime(x, s, 0.05));
      } else
        t.sirenType === 'fire' &&
          (this.sir.o.frequency.setTargetAtTime(520 + 300 * Math.abs(Math.sin(G.t * 0.9)), s, 0.1),
          this.sir.g.gain.setTargetAtTime(x * 0.8, s, 0.05),
          (o.fireBell -= n),
          o.fireBell <= 0 && ((o.fireBell = 0.32), this.tone(1600, 0.25, x * 0.8, 'triangle')));
    }
    if (
      ((o.step -= n),
      t.onFoot &&
        t.footSpeed > 0.5 &&
        o.step <= 0 &&
        ((o.step = t.footSpeed > 4 ? 0.29 : 0.5), this.burst(t.indoor ? 1600 : 900, 0.05, 0.035 + Math.min(0.03, t.footSpeed * 0.004), 'lowpass')),
      this.crowd.g.gain.setTargetAtTime(t.onFoot && !t.indoor ? Math.min(0.06, (t.density || 0) * 0.05) * (1 - t.night * 0.6) * e : 0, s, 0.5),
      (o.voice -= n),
      t.onFoot && !t.indoor && o.voice <= 0 && ((o.voice = 1.5 + (Math.random() * 4) / Math.max(0.2, t.density || 0.2)), (t.density || 0) > 0.4))
    ) {
      let x = 180 + Math.random() * 160;
      (this.tone(x, 0.12, 0.012, 'sawtooth', x * (Math.random() < 0.5 ? 1.2 : 0.85)), this.tone(x * 1.1, 0.1, 0.01, 'sawtooth', null, 0.13));
    }
    if (
      ((o.sig -= n),
      t.walkSig &&
        o.sig <= 0 &&
        (t.walkSig === 1
          ? ((o.sig = 0.55), this.tone(2700, 0.07, 0.03, 'sine', 2300), this.tone(2700, 0.07, 0.03, 'sine', 2300, 0.14))
          : ((o.sig = 0.9), this.tone(1150, 0.16, 0.035, 'sine'), this.tone(860, 0.22, 0.035, 'sine', null, 0.2))),
      (o.bird -= n),
      !t.indoor && t.night < 0.3 && (t.park || (t.density || 1) < 0.35) && o.bird <= 0)
    ) {
      o.bird = 1.5 + Math.random() * 5;
      let x = 2800 + Math.random() * 1600;
      for (let m = 0; m < 2 + Math.floor(Math.random() * 3); m++) this.tone(x + Math.random() * 300, 0.07, 0.02, 'sine', x * 0.8, m * 0.11);
    }
    if (((o.cricket -= n), !t.indoor && t.night > 0.5 && (t.park || (t.density || 1) < 0.5) && o.cricket <= 0)) {
      o.cricket = 0.6 + Math.random() * 1.2;
      for (let x = 0; x < 6; x++) this.tone(4200 + Math.random() * 200, 0.025, 0.012, 'square', null, x * 0.045);
    }
    if (
      (this.crackle.g.gain.setTargetAtTime(t.fire < 80 ? 0.05 * (1 - t.fire / 80) * e : 0, s, 0.2),
      (o.crack -= n),
      t.fire < 60 &&
        o.crack <= 0 &&
        ((o.crack = 0.05 + Math.random() * 0.25), this.burst(1800 + Math.random() * 2e3, 0.03, 0.06 * (1 - t.fire / 60), 'highpass')),
      (o.bell -= n),
      t.crossing && o.bell <= 0)
    ) {
      o.bell = 0.36;
      let x = Math.floor(G.t / 0.36) % 2;
      this.tone(x ? 760 : 640, 0.3, 0.05 * e, 'square');
    }
  },
};
var TIER = [
    {
      cars: 0,
    },
    {
      cars: 2,
      boost: 0.9,
      ram: !1,
      foot: 2,
      heli: !1,
      block: !1,
      see: 70,
      lose: 10,
    },
    {
      cars: 4,
      boost: 1,
      ram: !1,
      foot: 3,
      heli: !1,
      block: !1,
      see: 95,
      lose: 14,
    },
    {
      cars: 6,
      boost: 1.08,
      ram: !0,
      foot: 4,
      heli: !1,
      block: !0,
      see: 120,
      lose: 18,
    },
    {
      cars: 8,
      boost: 1.15,
      ram: !0,
      foot: 5,
      heli: !0,
      block: !0,
      see: 150,
      lose: 22,
    },
    {
      cars: 11,
      boost: 1.22,
      ram: !0,
      foot: 6,
      heli: !0,
      block: !0,
      see: 180,
      lose: 26,
    },
  ],
  I0 = [],
  jp = {},
  R_ = 0,
  C_ = [],
  z_ = [];
function il() {
  let n = G.player;
  return n.mode === 'car' && n.car ? n.car : (n.mode === 'plane' || n.mode === 'heli') && n.air ? n.air : n.mode === 'boat' && n.boat ? n.boat : n;
}
function policeSees(n) {
  let t = il(),
    e = (t.y || 0) + 1.5;
  if (G.boatPoliceSees && G.boatPoliceSees(t, n)) return !0;
  for (let i of G.cars) {
    if (!isCop(i) || i.removed || i.dead) continue;
    let s = Math.hypot(i.x - t.x, i.z - t.z);
    if (s < 12 || (s < n && rayBuildings(i.x, i.y + 1.8, i.z, t.x, e, t.z) >= 1)) return !0;
  }
  for (let i of G.peds) {
    if ((i.kind !== 4 && i.kind !== 11) || i.state === 'down') continue;
    let s = Math.hypot(i.x - t.x, i.z - t.z);
    if (s < 8 || (s < n * 0.6 && rayBuildings(i.x, 1.6, i.z, t.x, e, t.z) >= 1)) return !0;
  }
  return !!(HELI.on && HELI.track && Math.hypot(HELI.x - t.x, HELI.z - t.z) < 260);
}
function crime(n, t, e) {
  if (G.noCrime) return;
  let i = G.player,
    s = Ke(),
    o = jp[t] || -99;
  if (G.t - o < 4) return;
  if (((jp[t] = G.t), policeSees(Math.max(70, TIER[s].see || 70)))) {
    let l = s;
    ((G.heat = Math.min(5.99, Math.max(G.heat, s >= 1 ? G.heat : 0) + n)),
      G.heat >= 1 && l === 0 && (G.heat = Math.max(G.heat, 1)),
      (G.evade = 0),
      Jg(),
      Ke() > l && k_(l, t));
    return;
  }
  if (e) return;
  if (s > 0) {
    G.heat = Math.min(5.99, G.heat + n * 0.5);
    return;
  }
  pedsNear(i.x, i.z, 30, C_);
  let a = C_.filter((l) => l.state !== 'down' && l.kind !== 4);
  a.length &&
    (I0.push({
      t: rt(5, 9),
      amt: Math.min(n >= 1.2 ? 2.3 : 1.2, n + 0.4),
      why: t,
      x: i.x,
      z: i.z,
      wit: a[0],
    }),
    Math.random() < 0.7 && xt('toast', '\u76EE\u6483\u8005\u304C\u901A\u5831\u3057\u3088\u3046\u3068\u3057\u3066\u3044\u308B\u2026'));
}
function k_(n, t) {
  let e = Ke();
  (n === 0 ? xt('toast', `\u624B\u914D\u3055\u308C\u307E\u3057\u305F\uFF1A${t}`) : xt('toast', `\u624B\u914D\u5EA6 ${'\u2605'.repeat(e)}`),
    gt.blip());
}
function Jg() {
  let n = il();
  for (let t of G.cars)
    isCop(t) &&
      !t.removed &&
      !t.block &&
      Math.hypot(t.x - n.x, t.z - n.z) < 220 &&
      (t.mode === 'ai' && toPhys(t), (t.ctl = 'police'), (t.siren = !0));
}
G.policeSeesNow = () => policeSees(Math.max(70, TIER[Ke()].see || 70));
G.forceStars = (n) => forceStars(n);
function forceStars(n) {
  ((G.heat = Math.max(G.heat, n + 0.01)), (G.evade = 0), Jg());
}
function YR(n = 'police', t = !1) {
  let e = il();
  for (let i = 0; i < 12; i++) {
    let s = Math.random() * Math.PI * 2,
      o = t ? rt(90, 150) : rt(150, 260),
      r = e.x + Math.cos(s) * o,
      a = e.z + Math.sin(s) * o,
      l = [];
    roadsNear(r, a, 50, l);
    let f = l.find((c) => !c.e.elev || (e.y || 0) > 3);
    if (!f || (carsNear(f.x, f.z, 10, z_), z_.length) || Math.hypot(R.camera.position.x - f.x, R.camera.position.z - f.z) < 70) continue;
    let u = newCar(n, f.x, f.z, Math.atan2(e.x - f.x, e.z - f.z), 'phys');
    return u ? ((u.y = f.e.elev ? 12 : 0.04), (u.ctl = 'police'), (u.siren = !0), (u.cops = 0), u) : null;
  }
  return null;
}
var $g = 0;
function KR() {
  let n = il(),
    t = Math.hypot(n.vx || 0, n.vz || 0);
  if (t < 8) return;
  let e = (n.vx || 0) / t,
    i = (n.vz || 0) / t,
    s = n.x + e * 230,
    o = n.z + i * 230,
    r = [];
  roadsNear(s, o, 40, r);
  let a = r.filter((h) => !h.e.elev && h.e.kind !== 'L').sort((h, d) => h.d - d.d)[0];
  if (!a) return;
  let l = a.e,
    f = edgePos(l, a.s, {}),
    u = f.dz,
    c = -f.dx;
  for (let h of [-1, 1]) {
    let d = newCar('police', f.x + u * h * l.hw * 0.45, f.z + c * h * l.hw * 0.45, Math.atan2(u, c) + (h > 0 ? 0 : Math.PI), 'phys');
    if (!d) continue;
    ((d.y = 0.04), (d.ctl = null), (d.parked = !0), (d.keep = !1), (d.siren = !0), (d.block = 40), (d.driver = !1));
    let p = spawnPedAt(d.x - f.dx * 4, d.z - f.dz * 4, 'cop', 4);
    p && ((p.t = 40), (p.home = null));
  }
  xt('toast', '\u524D\u65B9\u306B\u691C\u554F\uFF01');
}
var HELI = {
  on: !1,
  m: null,
  x: 0,
  y: 90,
  z: 0,
  yaw: 0,
  track: !0,
  light: null,
};
function jR() {
  if (HELI.m) return;
  let n = new THREE.Group(),
    t = new THREE.Mesh(heliGeo(1911898), vMat());
  n.add(t);
  let e = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.06, 0.35),
    new THREE.MeshStandardMaterial({
      color: 2236962,
    }),
  );
  ((e.position.y = 2.7), n.add(e), (HELI.rot = e));
  let i = new THREE.Mesh(
    new THREE.ConeGeometry(14, 90, 24, 1, !0),
    new THREE.MeshBasicMaterial({
      color: 16774872,
      transparent: !0,
      opacity: 0.08,
      depthWrite: !1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  ((i.position.y = -45),
    n.add(i),
    (HELI.cone = i),
    (HELI.spot = new THREE.SpotLight(16774365, 0, 220, 0.18, 0.5, 1.2)),
    HELI.spot.position.set(0, -1, 0),
    n.add(HELI.spot),
    n.add(HELI.spot.target),
    (n.visible = !1),
    R.scene.add(n),
    (HELI.m = n));
}
function P_(n, t) {
  jR();
  let e = il();
  if (t && !HELI.on) {
    HELI.on = !0;
    let p = Math.random() * 6.28;
    ((HELI.x = e.x + Math.cos(p) * 500),
      (HELI.z = e.z + Math.sin(p) * 500),
      (HELI.y = 95),
      xt('toast', '\u8B66\u5BDF\u30D8\u30EA\u304C\u51FA\u52D5\u3057\u305F'));
  }
  if (
    (!t && HELI.on ? ((HELI.leave = (HELI.leave || 0) + n), HELI.leave > 15 && ((HELI.on = !1), (HELI.leave = 0))) : (HELI.leave = 0),
    (HELI.m.visible = HELI.on),
    !HELI.on)
  )
    return;
  let i = G.t * 0.25,
    s = t ? e.x + Math.cos(i) * 45 : HELI.x + 40,
    o = t ? e.z + Math.sin(i) * 45 : HELI.z + 40,
    r = s - HELI.x,
    a = o - HELI.z,
    l = Math.hypot(r, a),
    f = Math.min(l, 38 * n);
  (l > 0.1 && ((HELI.x += (r / l) * f), (HELI.z += (a / l) * f), (HELI.yaw = Math.atan2(r, a))),
    (HELI.y += ((e.y || 0) + 85 - HELI.y) * Math.min(1, n * 0.5)),
    (HELI.track =
      Math.hypot(HELI.x - e.x, HELI.z - e.z) < 260 &&
      !G.player.interior &&
      !(G.player.mode === 'train' && G.player.train && G.player.train.r.kind === 'sub')),
    HELI.m.position.set(HELI.x, HELI.y, HELI.z),
    HELI.m.rotation.set(0.12, HELI.yaw, 0),
    (HELI.rot.rotation.y += n * 40));
  let u = e.x - HELI.x,
    c = (e.y || 0) - HELI.y,
    h = e.z - HELI.z;
  ((HELI.cone.visible = R.night > 0.3 && HELI.track),
    (HELI.spot.intensity = R.night > 0.3 && HELI.track ? 900 : 0),
    HELI.spot.target.position.set(u, c, h).applyAxisAngle(new THREE.Vector3(0, 1, 0), -HELI.yaw));
  let d = Math.hypot(u, c, h);
  (HELI.cone.scale.set(1, d / 90, 1),
    HELI.cone.position.set(0, 0, 0),
    HELI.cone.lookAt(e.x, e.y || 0, e.z),
    HELI.cone.rotateX(-Math.PI / 2),
    HELI.cone.translateY(-d / 2));
}
var Yg = 0;
var Kg = !1;
function updatePolice(n) {
  let t = G.player;
  for (let d = I0.length - 1; d >= 0; d--) {
    let p = I0[d];
    if (((p.t -= n), p.wit && (p.wit.state === 'down' || p.wit.dead))) {
      I0.splice(d, 1);
      continue;
    }
    if (p.t <= 0) {
      I0.splice(d, 1);
      let x = Ke();
      ((G.heat = Math.min(5.99, Math.max(G.heat + p.amt, Ke() === 0 ? Math.min(1.3, G.heat + p.amt) : 0))),
        Ke() > x && (k_(x, p.why + '\uFF08\u901A\u5831\uFF09'), Jg()));
    }
  }
  let e = Ke(),
    i = TIER[e];
  if (
    ((G.polTier = i),
    (G.sirens = G.cars.filter((d) => d.siren && !d.removed && d.mode === 'phys' && (Math.hypot(d.vx, d.vz) > 4 || d.resp))),
    e !== R_)
  ) {
    R_ = e;
    for (let d of G.cars) isCop(d) && d.ctl === 'police' && (d.boost = i.boost || 1);
  }
  if (e === 0) {
    G.heat > 0 && (G.heat = Math.max(0, G.heat - n * 0.08));
    for (let d of G.cars) d.ctl === 'police' && ((d.ctl = null), (d.siren = !1));
    (P_(n, !1), (G.bust = 0));
    return;
  }
  let s = G.cars.filter((d) => isCop(d) && d.ctl === 'police' && !d.removed && !d.dead);
  if (((Yg -= n), Yg <= 0 && s.length < i.cars && t.mode !== 'plane' && t.mode !== 'boat')) {
    Yg = e >= 4 ? 1.2 : 2;
    let d = YR(
      e >= 5 && Math.random() < 0.45 ? 'sdf' : e >= 5 && Math.random() < 0.35 ? 'riot' : e <= 3 && Math.random() < 0.3 ? 'polbike' : 'police',
    );
    (d && d.t === 'sdf' && ((d.hp = 320), (d.armor = 0.45), Kg || ((Kg = !0), xt('toast', '\u81EA\u885B\u968A\u304C\u51FA\u52D5\u3057\u305F\uFF01'))),
      e < 5 && (Kg = !1),
      d && (d.boost = i.boost));
  }
  (i.block && (($g -= n), $g <= 0 && t.mode === 'car' && (($g = 28), KR())),
    P_(n, i.heli),
    HELI.on &&
      HELI.track &&
      e >= 4 &&
      G.npcShoot &&
      ((HELI.shootT = (HELI.shootT || 3) - n),
      HELI.shootT <= 0 &&
        ((HELI.shootT = rt(2.2, 3.5)),
        G.npcShoot(HELI.x, HELI.y - 2, HELI.z, 0.22, 10, '\u8B66\u5BDF\u30D8\u30EA\u306E\u72D9\u6483\u624B\u306B\u6483\u305F\u308C\u305F'))));
  let o = il(),
    r = t.mode === 'foot' && !t.interior,
    a = G.peds.filter((d) => (d.kind === 4 || d.kind === 11) && (d.state === 'cop' || d.state === 'down')).length;
  for (let d of s) {
    if (a >= i.foot) break;
    let p = Math.hypot(d.x - o.x, d.z - o.z),
      x = Math.hypot(d.vx, d.vz);
    if ((r || (t.mode === 'car' && Math.abs(t.car.v) < 2)) && p < 22 && x < 2.5 && (d.cops || 0) < 2) {
      let m = -Math.cos(d.yaw),
        g = Math.sin(d.yaw),
        M = spawnPedAt(d.x + m * 1.6, d.z + g * 1.6, 'cop', d.t === 'sdf' ? 11 : 4);
      M && ((M.t = 40), (M.hp = d.t === 'sdf' ? 160 : 120), (d.cops = (d.cops || 0) + 1), a++);
    }
  }
  let l = policeSees(i.see);
  ((G.searchR = i.see),
    (G.loseT = i.lose),
    l
      ? ((G.evade = 0), (G.lastSeen = [o.x, o.z]))
      : ((G.evade += n),
        G.evade > i.lose && ((G.heat = 0.6), (G.evade = 0), xt('toast', '\u9003\u3052\u5207\u3063\u305F\uFF01'), xt('evaded'), gt.chime())));
  let f = il(),
    u = t.mode === 'car' ? Math.abs(t.car.v) < 2.2 : t.mode === 'boat' ? Math.abs(t.boat.v) < 2 : t.speed < 2.4 || t.down > 0,
    c = s.some((d) => Math.hypot(d.x - f.x, d.z - f.z) < 7.5 && Math.abs(d.y - (f.y || 0)) < 2),
    h = r && G.peds.some((d) => (d.kind === 4 || d.kind === 11) && d.state === 'cop' && Math.hypot(d.x - t.x, d.z - t.z) < 1.8);
  (c || h || G.bustBoat) && u && t.mode !== 'train' && t.mode !== 'plane' && t.mode !== 'heli'
    ? ((G.bust += n * (h ? 1.3 : 1)), G.bust > 3 && xt('busted'))
    : (G.bust = Math.max(0, G.bust - n * 0.7));
}
function resetPolice() {
  for (let n in jp) delete jp[n];
  ((G.heat = 0), (G.evade = 0), (G.bust = 0), (I0.length = 0));
  for (let n of G.peds) n.kind === 4 && n.state === 'cop' && (n.t = 0);
}
var TRN = {};
vi(TRN, {
  RIDE: () => RIDE,
  ROUTES: () => ROUTES,
  STOPS: () => STOPS,
  busDestinations: () => busDestinations,
  callBus: () => callBus,
  hailTaxi: () => hailTaxi,
  manageBuses: () => manageBuses,
  nearStop: () => nearStop,
  placeBefore: () => placeBefore,
  placeOnEdge: () => placeOnEdge,
  releaseTaxi: () => releaseTaxi,
  setupTransit: () => setupTransit,
  skipBus: () => skipBus,
  spawnBus: () => spawnBus,
  taxiFare: () => taxiFare,
  taxiPlaces: () => taxiPlaces,
  taxiTo: () => taxiTo,
  updStops: () => updStops,
});
var n3 = (n, t) => fe(n, t),
  t3 = {
    yokohama: ['\u6A2A\u6D5C\u99C5\u6771\u53E3', 35.465, 139.6262],
    minatomirai: ['\u307F\u306A\u3068\u307F\u3089\u3044', 35.4568, 139.6335],
    yamashita: ['\u5C71\u4E0B\u516C\u5712\u524D', 35.4458, 139.6488],
    chukagai: ['\u4E2D\u83EF\u8857', 35.4432, 139.6478],
    kawasaki: ['\u5DDD\u5D0E\u99C5\u6771\u53E3', 35.5318, 139.7012],
    daishi: ['\u5DDD\u5D0E\u5927\u5E2B', 35.5336, 139.7282],
    kosugi: ['\u6B66\u8535\u5C0F\u6749\u99C5\u524D', 35.5762, 139.6612],
    futako: ['\u4E8C\u5B50\u7389\u5DDD\u99C5\u524D', 35.6118, 139.6282],
    ogikubo: ['\u837B\u7AAA\u99C5\u524D', 35.704, 139.6212],
    shimokita: ['\u4E0B\u5317\u6CA2', 35.6612, 139.6688],
    shibuya: ['\u6E0B\u8C37\u99C5\u524D', 35.658, 139.7016],
    shinjukuW: ['\u65B0\u5BBF\u99C5\u897F\u53E3', 35.6905, 139.6975],
    shinjuku3: ['\u65B0\u5BBF\u4E09\u4E01\u76EE', 35.6905, 139.7055],
    tokyo: ['\u6771\u4EAC\u99C5\u4E38\u306E\u5185\u5357\u53E3', 35.68, 139.765],
    shimbashi: ['\u65B0\u6A4B\u99C5\u524D', 35.666, 139.7585],
    shinagawa: ['\u54C1\u5DDD\u99C5\u9AD8\u8F2A\u53E3', 35.6285, 139.739],
    ikebukuro: ['\u6C60\u888B\u99C5\u6771\u53E3', 35.73, 139.712],
    ueno: ['\u4E0A\u91CE\u5E83\u5C0F\u8DEF', 35.708, 139.773],
    roppongi: ['\u516D\u672C\u6728\u99C5\u524D', 35.663, 139.732],
    hills: ['\u516D\u672C\u6728\u30D2\u30EB\u30BA', 35.66, 139.73],
    tower: ['\u6771\u4EAC\u30BF\u30EF\u30FC', 35.6575, 139.747],
    hamamatsucho: ['\u6D5C\u677E\u753A\u99C5\u524D', 35.6555, 139.757],
    odaiba: ['\u304A\u53F0\u5834\u6D77\u6D5C\u516C\u5712\u99C5\u524D', 35.629, 139.778],
    bigsight: ['\u6771\u4EAC\u30D3\u30C3\u30B0\u30B5\u30A4\u30C8', 35.63, 139.793],
    asakusa: ['\u6D45\u8349\u96F7\u9580', 35.7105, 139.7965],
    kinshicho: ['\u9326\u7CF8\u753A\u99C5\u524D', 35.6965, 139.814],
    ginza: ['\u9280\u5EA7\u56DB\u4E01\u76EE', 35.6715, 139.765],
    harajuku: ['\u539F\u5BBF\u99C5\u524D', 35.67, 139.7027],
    meguro: ['\u76EE\u9ED2\u99C5\u524D', 35.6335, 139.7155],
    tamachi: ['\u7530\u753A\u99C5\u524D', 35.6455, 139.748],
    iidabashi: ['\u98EF\u7530\u6A4B\u99C5\u524D', 35.702, 139.745],
    kasuga: ['\u6625\u65E5\u99C5\u524D\uFF08\u6771\u4EAC\u30C9\u30FC\u30E0\uFF09', 35.708, 139.7525],
    otsuka: ['\u5927\u585A\u99C5\u524D', 35.731, 139.729],
    takadanobaba: ['\u9AD8\u7530\u99AC\u5834\u99C5\u524D', 35.7125, 139.7035],
    yotsuya: ['\u56DB\u8C37\u99C5\u524D', 35.686, 139.73],
    kokkai: ['\u56FD\u4F1A\u8B70\u4E8B\u5802\u524D', 35.674, 139.744],
    toranomon: ['\u864E\u30CE\u9580\u30D2\u30EB\u30BA', 35.667, 139.75],
    kachidoki: ['\u52DD\u3069\u304D\u99C5\u524D', 35.6585, 139.777],
    harumi: ['\u6674\u6D77\u4E09\u4E01\u76EE', 35.653, 139.782],
    toyosu: ['\u8C4A\u6D32\u99C5\u524D', 35.6545, 139.796],
    tsukiji: ['\u7BC9\u5730\u99C5\u524D', 35.667, 139.771],
    teleport: ['\u6771\u4EAC\u30C6\u30EC\u30DD\u30FC\u30C8\u99C5\u524D', 35.627, 139.779],
    ebisu: ['\u6075\u6BD4\u5BFF\u99C5\u524D', 35.6467, 139.7101],
    hiroo: ['\u5E83\u5C3E\u99C5\u524D', 35.651, 139.722],
    akabanebashi: ['\u8D64\u7FBD\u6A4B', 35.655, 139.744],
    nippori: ['\u65E5\u66AE\u91CC\u99C5\u524D', 35.728, 139.771],
    akihabara: ['\u79CB\u8449\u539F\u99C5\u524D', 35.6985, 139.774],
    kanda: ['\u795E\u7530\u99C5\u524D', 35.6915, 139.771],
    waseda: ['\u65E9\u7A32\u7530', 35.709, 139.7205],
    sendagaya: ['\u5343\u99C4\u30F6\u8C37\u99C5\u524D', 35.681, 139.7115],
    monzen: ['\u9580\u524D\u4EF2\u753A', 35.672, 139.796],
    kameido: ['\u4E80\u6238\u99C5\u524D', 35.6975, 139.8265],
    ryogoku: ['\u4E21\u56FD\u99C5\u524D', 35.6955, 139.7935],
    hanzomon: ['\u534A\u8535\u9580', 35.6855, 139.7415],
    hibiya: ['\u65E5\u6BD4\u8C37', 35.674, 139.759],
    nihonbashi: ['\u65E5\u672C\u6A4B', 35.683, 139.774],
    tsukishima: ['\u6708\u5CF6\u99C5\u524D', 35.664, 139.784],
    ariake: ['\u6709\u660E', 35.634, 139.792],
    tennozu: ['\u5929\u738B\u6D32\u30A2\u30A4\u30EB', 35.6225, 139.7505],
    gotanda: ['\u4E94\u53CD\u7530\u99C5\u524D', 35.626, 139.7235],
    osaki: ['\u5927\u5D0E\u99C5\u524D', 35.6195, 139.7285],
    oimachi: ['\u5927\u4E95\u753A\u99C5\u524D', 35.6065, 139.734],
    oirace: ['\u5927\u4E95\u7AF6\u99AC\u5834\u524D', 35.595, 139.742],
    shinagawaE: ['\u54C1\u5DDD\u99C5\u6E2F\u5357\u53E3', 35.6285, 139.7425],
    komagome: ['\u99D2\u8FBC\u99C5\u524D', 35.7365, 139.747],
    tokyoN: ['\u6771\u4EAC\u99C5\u516B\u91CD\u6D32\u53E3', 35.6815, 139.7695],
    kiba: ['\u6728\u5834', 35.6695, 139.807],
    kudan: ['\u4E5D\u6BB5\u4E0B', 35.6955, 139.751],
    ochanomizu: ['\u5FA1\u8336\u30CE\u6C34\u99C5\u524D', 35.6995, 139.765],
    yoyogi: ['\u4EE3\u3005\u6728\u99C5\u524D', 35.683, 139.702],
    nakameguro: ['\u4E2D\u76EE\u9ED2\u99C5\u524D', 35.644, 139.699],
    azabujuban: ['\u9EBB\u5E03\u5341\u756A', 35.6555, 139.7365],
    shirokane: ['\u767D\u91D1\u9AD8\u8F2A', 35.6425, 139.734],
    oshiage: ['\u62BC\u4E0A\uFF08\u30B9\u30AB\u30A4\u30C4\u30EA\u30FC\u524D\uFF09', 35.71, 139.8125],
    kuramae: ['\u8535\u524D', 35.7035, 139.7905],
    aoyama: ['\u9752\u5C71\u4E00\u4E01\u76EE', 35.6725, 139.724],
    shibuyaE: ['\u6E0B\u8C37\u99C5\u6771\u53E3', 35.659, 139.704],
    kanamecho: ['\u65B0\u5BBF\u99C5\u6771\u53E3', 35.6915, 139.7015],
    nishishinjuku5: ['\u897F\u65B0\u5BBF\u4E94\u4E01\u76EE', 35.6895, 139.687],
    nakanosakaue: ['\u4E2D\u91CE\u5742\u4E0A', 35.697, 139.6828],
    kagurazaka: ['\u795E\u697D\u5742\u4E0A', 35.703, 139.735],
    sugamo: ['\u5DE3\u9D28\u99C5\u524D', 35.7333, 139.7393],
    tabata: ['\u7530\u7AEF\u99C5\u524D', 35.7378, 139.761],
    minowa: ['\u4E09\u30CE\u8F2A', 35.729, 139.7915],
    kiyosumi: ['\u6E05\u6F84\u767D\u6CB3', 35.682, 139.799],
    toyocho: ['\u6771\u967D\u753A\u99C5\u524D', 35.6698, 139.8172],
    tatsumi: ['\u8FB0\u5DF3', 35.6455, 139.8103],
    shinonome: ['\u6771\u96F2', 35.6412, 139.8045],
  },
  JR = [
    [
      '\u6A2A\u6D5C100',
      '\u6A2A\u6D5C\u99C5 \u2194 \u5C71\u4E0B\u516C\u5712\u30FB\u4E2D\u83EF\u8857',
      1927864,
      ['yokohama', 'minatomirai', 'yamashita', 'chukagai'],
    ],
    ['\u5DDD\u5D0E01', '\u5DDD\u5D0E\u99C5 \u2194 \u5DDD\u5D0E\u5927\u5E2B', 3115598, ['kawasaki', 'daishi']],
    ['\u5DDD\u5D0E02', '\u5DDD\u5D0E\u99C5 \u2194 \u6B66\u8535\u5C0F\u6749', 3115598, ['kawasaki', 'kosugi']],
    ['\u738911', '\u4E8C\u5B50\u7389\u5DDD \u2194 \u4E0B\u5317\u6CA2', 3115598, ['futako', 'shimokita']],
    [
      '\u30EA\u30E0\u30B8\u30F31',
      '\u6771\u4EAC\u99C5 \u2194 \u7FBD\u7530\u7A7A\u6E2F\uFF08\u54C1\u5DDD\u7D4C\u7531\uFF09',
      1793983,
      ['tokyo', 'shinagawa', 'hnd2', 'hnd1', 'hnd3'],
    ],
    [
      '\u30EA\u30E0\u30B8\u30F32',
      '\u65B0\u5BBF\u99C5\u897F\u53E3 \u2194 \u7FBD\u7530\u7A7A\u6E2F\uFF08\u6E0B\u8C37\u7D4C\u7531\uFF09',
      1793983,
      ['shinjukuW', 'shibuya', 'hnd3', 'hnd1', 'hnd2'],
    ],
    ['\u90FD01', '\u6E0B\u8C37\u99C5\u524D \u2194 \u65B0\u6A4B\u99C5\u524D', 3115598, ['shibuya', 'hills', 'roppongi', 'toranomon', 'shimbashi']],
    ['\u90FD02', '\u5927\u585A\u99C5\u524D \u2194 \u9326\u7CF8\u753A\u99C5\u524D', 3115598, ['otsuka', 'kasuga', 'ueno', 'kinshicho']],
    [
      '\u90FD05',
      '\u6771\u4EAC\u99C5 \u2194 \u6771\u4EAC\u30D3\u30C3\u30B0\u30B5\u30A4\u30C8',
      3115598,
      ['tokyo', 'ginza', 'kachidoki', 'harumi', 'bigsight'],
    ],
    ['\u54C197', '\u54C1\u5DDD\u99C5 \u2194 \u65B0\u5BBF\u99C5\u897F\u53E3', 3115598, ['shinagawa', 'tamachi', 'roppongi', 'yotsuya', 'shinjukuW']],
    [
      '\u6A4B63',
      '\u65B0\u6A4B\u99C5\u524D \u2194 \u9AD8\u7530\u99AC\u5834\u99C5\u524D',
      3115598,
      ['shimbashi', 'toranomon', 'kokkai', 'iidabashi', 'takadanobaba'],
    ],
    ['\u867901', '\u6D5C\u677E\u753A\u99C5\u524D \u2194 \u6771\u4EAC\u30C6\u30EC\u30DD\u30FC\u30C8', 3115598, ['hamamatsucho', 'odaiba', 'teleport']],
    ['\u677198', '\u6771\u4EAC\u99C5 \u2194 \u76EE\u9ED2\u99C5\u524D', 3115598, ['tokyo', 'tower', 'meguro']],
    ['\u5BBF75', '\u65B0\u5BBF\u99C5\u897F\u53E3 \u2194 \u56FD\u4F1A\u8B70\u4E8B\u5802\u524D', 3115598, ['shinjukuW', 'yotsuya', 'kokkai']],
    [
      '\u6E0B88',
      '\u6E0B\u8C37\u99C5\u524D \u2194 \u65B0\u6A4B\u99C5\u524D\uFF08\u6771\u4EAC\u30BF\u30EF\u30FC\u7D4C\u7531\uFF09',
      3115598,
      ['shibuya', 'hills', 'tower', 'shimbashi'],
    ],
    ['\u4E0A46', '\u4E0A\u91CE\u5E83\u5C0F\u8DEF \u2194 \u6D45\u8349\u96F7\u9580', 3115598, ['ueno', 'asakusa']],
    ['\u696D10', '\u65B0\u6A4B\u99C5\u524D \u2194 \u8C4A\u6D32\u99C5\u524D', 3115598, ['shimbashi', 'tsukiji', 'kachidoki', 'toyosu']],
    [
      '\u6C6086',
      '\u6C60\u888B\u99C5\u6771\u53E3 \u2194 \u6E0B\u8C37\u99C5\u524D',
      3115598,
      ['ikebukuro', 'takadanobaba', 'shinjuku3', 'harajuku', 'shibuya'],
    ],
    [
      '\u90FD03',
      '\u56DB\u8C37\u99C5 \u2194 \u6674\u6D77\u4E09\u4E01\u76EE',
      3115598,
      ['yotsuya', 'hanzomon', 'hibiya', 'ginza', 'kachidoki', 'harumi'],
    ],
    ['\u90FD04', '\u6771\u4EAC\u99C5 \u2194 \u6708\u5CF6\u99C5\u524D', 3115598, ['tokyo', 'ginza', 'tsukiji', 'kachidoki', 'tsukishima']],
    [
      '\u90FD06',
      '\u6E0B\u8C37\u99C5\u6771\u53E3 \u2194 \u65B0\u6A4B\u99C5\u524D\uFF08\u5E83\u5C3E\u7D4C\u7531\uFF09',
      3115598,
      ['shibuyaE', 'hiroo', 'azabujuban', 'akabanebashi', 'shimbashi'],
    ],
    ['\u90FD07', '\u9326\u7CF8\u753A\u99C5\u524D \u2194 \u9580\u524D\u4EF2\u753A', 3115598, ['kinshicho', 'kiba', 'monzen']],
    [
      '\u90FD08',
      '\u65E5\u66AE\u91CC\u99C5\u524D \u2194 \u9326\u7CF8\u753A\u99C5\u524D',
      3115598,
      ['nippori', 'ueno', 'kuramae', 'ryogoku', 'kinshicho'],
    ],
    ['\u54C193', '\u54C1\u5DDD\u99C5\u6E2F\u5357\u53E3 \u2194 \u5927\u4E95\u7AF6\u99AC\u5834\u524D', 3115598, ['shinagawaE', 'tennozu', 'oirace']],
    ['\u54C198', '\u54C1\u5DDD\u99C5\u9AD8\u8F2A\u53E3 \u2194 \u5927\u4E95\u753A\u99C5\u524D', 3115598, ['shinagawa', 'gotanda', 'osaki', 'oimachi']],
    ['\u65E977', '\u65E9\u7A32\u7530 \u2194 \u65B0\u5BBF\u99C5\u897F\u53E3', 3115598, ['waseda', 'takadanobaba', 'shinjukuW']],
    ['\u833651', '\u99D2\u8FBC\u99C5\u524D \u2194 \u79CB\u8449\u539F\u99C5\u524D', 3115598, ['komagome', 'ochanomizu', 'akihabara']],
    ['\u4E0A26', '\u4E0A\u91CE\u5E83\u5C0F\u8DEF \u2194 \u4E80\u6238\u99C5\u524D', 3115598, ['ueno', 'oshiage', 'kameido']],
    [
      '\u9ED277',
      '\u76EE\u9ED2\u99C5\u524D \u2194 \u5343\u99C4\u30F6\u8C37\u99C5\u524D',
      3115598,
      ['meguro', 'hiroo', 'roppongi', 'aoyama', 'sendagaya'],
    ],
    ['\u753087', '\u6E0B\u8C37\u99C5\u6771\u53E3 \u2194 \u7530\u753A\u99C5\u524D', 3115598, ['shibuyaE', 'ebisu', 'shirokane', 'tamachi']],
    [
      '\u677142',
      '\u6771\u4EAC\u99C5\u516B\u91CD\u6D32\u53E3 \u2194 \u6D45\u8349\u96F7\u9580',
      3115598,
      ['tokyoN', 'nihonbashi', 'kuramae', 'asakusa'],
    ],
    ['\u932613', '\u9326\u7CF8\u753A\u99C5\u524D \u2194 \u6674\u6D77\u4E09\u4E01\u76EE', 3115598, ['kinshicho', 'monzen', 'tsukishima', 'harumi']],
    ['\u6D7701', '\u9580\u524D\u4EF2\u753A \u2194 \u6771\u4EAC\u30C6\u30EC\u30DD\u30FC\u30C8', 3115598, ['monzen', 'toyosu', 'ariake', 'teleport']],
    ['\u53CD96', '\u4E94\u53CD\u7530\u99C5\u524D \u2194 \u516D\u672C\u6728\u99C5\u524D', 3115598, ['gotanda', 'shirokane', 'azabujuban', 'roppongi']],
    ['\u79CB26', '\u79CB\u8449\u539F\u99C5\u524D \u2194 \u4E5D\u6BB5\u4E0B', 3115598, ['akihabara', 'kanda', 'kudan']],
    [
      '\u65B0\u5BBFWE',
      '\u65B0\u5BBF\u99C5\u897F\u53E3 \u2194 \u65B0\u5BBF\u99C5\u6771\u53E3 \u2194 \u4EE3\u3005\u6728',
      14942335,
      ['shinjukuW', 'kanamecho', 'yoyogi'],
    ],
    ['\u5BBF91', '\u65B0\u5BBF\u99C5\u897F\u53E3 \u2194 \u4E2D\u91CE\u5742\u4E0A', 3115598, ['shinjukuW', 'nishishinjuku5', 'nakanosakaue']],
    [
      '\u98EF62',
      '\u98EF\u7530\u6A4B\u99C5\u524D \u2194 \u65E9\u7A32\u7530\uFF08\u795E\u697D\u5742\u7D4C\u7531\uFF09',
      3115598,
      ['iidabashi', 'kagurazaka', 'waseda'],
    ],
    [
      '\u834964',
      '\u6C60\u888B\u99C5\u6771\u53E3 \u2194 \u6D45\u8349\u96F7\u9580',
      3115598,
      ['ikebukuro', 'otsuka', 'sugamo', 'tabata', 'minowa', 'asakusa'],
    ],
    [
      '\u677122',
      '\u6771\u4EAC\u99C5\u516B\u91CD\u6D32\u53E3 \u2194 \u6771\u967D\u753A\u99C5\u524D',
      3115598,
      ['tokyoN', 'nihonbashi', 'kiyosumi', 'kiba', 'toyocho'],
    ],
    ['\u932618', '\u9326\u7CF8\u753A\u99C5\u524D \u2194 \u6771\u96F2', 3115598, ['kinshicho', 'toyocho', 'tatsumi', 'shinonome']],
    [
      '\u90FD09',
      '\u54C1\u5DDD\u99C5\u9AD8\u8F2A\u53E3 \u2194 \u6E0B\u8C37\u99C5\u524D\uFF08\u76EE\u9ED2\u7D4C\u7531\uFF09',
      3115598,
      ['shinagawa', 'gotanda', 'meguro', 'ebisu', 'shibuya'],
    ],
    [
      '\u6A4B86',
      '\u65B0\u6A4B\u99C5\u524D \u2194 \u76EE\u9ED2\u99C5\u524D\uFF08\u767D\u91D1\u7D4C\u7531\uFF09',
      3115598,
      ['shimbashi', 'akabanebashi', 'shirokane', 'meguro'],
    ],
    ['\u6025\u884C05', '\u6025\u884C \u6771\u4EAC\u99C5 \u2194 \u6771\u4EAC\u30D3\u30C3\u30B0\u30B5\u30A4\u30C8', 13898271, ['tokyo', 'bigsight']],
    [
      '\u6025\u884C06',
      '\u6025\u884C \u6E0B\u8C37\u99C5\u524D \u2194 \u6771\u4EAC\u99C5\uFF08\u516D\u672C\u6728\u7D4C\u7531\uFF09',
      13898271,
      ['shibuya', 'roppongi', 'tokyo'],
    ],
    ['\u6025\u884C24', '\u6025\u884C \u6C60\u888B\u99C5\u6771\u53E3 \u2194 \u6771\u4EAC\u99C5', 13898271, ['ikebukuro', 'iidabashi', 'tokyo']],
  ],
  STOPS = {},
  ROUTES = [],
  ZR = 0,
  I_ = ['\u4E00\u4E01\u76EE', '\u4E8C\u4E01\u76EE', '\u4E09\u4E01\u76EE', '\u56DB\u4E01\u76EE', '\u4E94\u4E01\u76EE', '\u516D\u4E01\u76EE'];
function QR(n, t) {
  let e = null,
    i = 330;
  for (let u of W.stations) {
    let c = Math.hypot(u.x - n, u.z - t);
    c < i && ((i = c), (e = u));
  }
  let s = null,
    o = 220;
  for (let u in W.landmarks) {
    let c = W.landmarks[u];
    if (!c.name) continue;
    let h = Math.hypot(c.x - n, c.z - t);
    h < o && ((o = h), (s = c));
  }
  let r = Math.abs(Math.floor(n * 0.013 + t * 0.007)) % I_.length,
    a = districtAt(n, t).n;
  if (/湾|川|運河|濠/.test(a)) {
    let u = null,
      c = 1500;
    for (let h of W.stations) {
      let d = Math.hypot(h.x - n, h.z - t);
      d < c && ((c = d), (u = h));
    }
    a = u ? u.ja : '\u81E8\u6D77';
  }
  let l = s ? `${s.name}\u524D` : e ? `${e.ja}\u99C5\u5165\u53E3` : `${a}${I_[r]}`,
    f = new Set(Object.values(STOPS).map((u) => u.name));
  if (f.has(l)) {
    for (let u of ['\u5317', '\u5357', '\u6771', '\u897F', '\u4E2D\u592E', '\u5165\u53E3'])
      if (!f.has(l + u)) {
        l = l + u;
        break;
      }
  }
  return l;
}
function tC(n, t, e) {
  let i = n.hw + 1.6,
    s = 'x' + ZR++,
    o = {
      id: s,
      name: QR(e.x, e.z),
      e: n,
      s: t,
      x: e.x,
      z: e.z,
      dx: e.dx,
      dz: e.dz,
      sides: [
        [e.x + e.dz * i, e.z - e.dx * i],
        [e.x - e.dz * i, e.z + e.dx * i],
      ],
      routes: [],
      extra: !0,
    };
  return ((STOPS[s] = o), o);
}
var eC = {
    X: 50,
    R: 50,
    A: 0.8,
    B: 1,
    L: 4,
  },
  L_ = (n) => !n.elev && (n.kind === 'A' || n.kind === 'B');
function setupTransit() {
  for (let n of TERMS) {
    let t = n.Wd / 2 + 45;
    t3['hnd' + n.id.slice(1)] = [
      `\u7FBD\u7530\u7A7A\u6E2F\u7B2C${n.id.slice(1)}\u30BF\u30FC\u30DF\u30CA\u30EB`,
      n.c[0] + HND.uz * n.side * t,
      n.c[1] - HND.ux * n.side * t,
      !0,
    ];
  }
  for (let n in t3) {
    let [t, e, i, s] = t3[n],
      [o, r] = s ? [e, i] : n3(e, i),
      a = [];
    roadsNear(o, r, 260, a);
    let l = a.filter((x) => L_(x.e) && x.e.len > 40).sort((x, m) => x.d - m.d)[0] || a.filter((x) => !x.e.elev).sort((x, m) => x.d - m.d)[0];
    if (!l) continue;
    let f = l.e,
      u = W.nodes[f.a],
      c = W.nodes[f.b],
      h = It(l.s, u.r + 14, f.len - c.r - 14),
      d = edgePos(f, h, {}),
      p = f.hw + 1.6;
    STOPS[n] = {
      id: n,
      name: t,
      e: f,
      s: h,
      x: d.x,
      z: d.z,
      dx: d.dx,
      dz: d.dz,
      sides: [
        [d.x + d.dz * p, d.z - d.dx * p],
        [d.x - d.dz * p, d.z + d.dx * p],
      ],
      routes: [],
    };
  }
  for (let [n, t, e, i] of JR) {
    let s = i.map((p) => STOPS[p]).filter(Boolean);
    if (s.length < 2) continue;
    let o = [...s, ...s.slice(1, -1).reverse()],
      r = o.length,
      a = new Map(),
      l = (p, x, m, g) => {
        let M = p + ',' + x + ',' + m + ',' + g;
        if (a.has(M)) return a.get(M);
        let y = route(p, x, 8e4, eC, m, g),
          _ = 1e12;
        if (y) {
          _ = 0;
          for (let b = 1; b < y.length; b++) _ += Math.hypot(W.nodes[y[b]].x - W.nodes[y[b - 1]].x, W.nodes[y[b]].z - W.nodes[y[b - 1]].z);
          (y.length > 1 && y[1] === m && (_ += 4e3), y.length > 1 && y[y.length - 2] === g && (_ += 4e3), p === x && (_ += 4e3));
        }
        let v = [y, _];
        return (a.set(M, v), v);
      },
      f = (p, x) => (x ? [p.e.b, p.e.a] : [p.e.a, p.e.b]),
      u = null,
      c = 1e18;
    for (let p = 0; p < 1 << r; p++) {
      let x = 0;
      for (let m = 0; m < r && x < c; m++) {
        let g = o[m],
          M = o[(m + 1) % r],
          [y, _] = f(g, (p >> m) & 1),
          [v, b] = f(M, (p >> ((m + 1) % r)) & 1);
        x += l(_, v, y, b)[1];
      }
      x < c && ((c = x), (u = p));
    }
    let h = [];
    for (let p = 0; p < r; p++) {
      let x = o[p],
        m = o[(p + 1) % r],
        [g, M] = f(x, (u >> p) & 1),
        [y, _] = f(m, (u >> ((p + 1) % r)) & 1);
      (h.length || h.push(g), h[h.length - 1] !== M && h.push(M));
      let v = l(M, y, g, _)[0];
      if (v) for (let b of v.slice(1)) h.push(b);
      else h.push(y);
    }
    for (; h.length > 2 && h[h.length - 1] === h[0];) h.pop();
    {
      let p = 1e9,
        x = null,
        m = new Set(s);
      for (let g = 0; g < h.length; g++) {
        let M = h[g],
          y = h[(g + 1) % h.length],
          _ = edgeBetween(M, y);
        if (!_) continue;
        let v = s.find((T) => T.e === _);
        if (v) {
          ((p = 0), (x = v));
          continue;
        }
        if (((p += _.len), p < 420 || !L_(_) || _.len < 70)) continue;
        let b = W.nodes[_.a],
          w = W.nodes[_.b],
          E = It(_.len / 2, b.r + 14, _.len - w.r - 14),
          C = edgePos(_, E, {}),
          S = Object.values(STOPS).find((T) => T.e === _ || Math.hypot(T.x - C.x, T.z - C.z) < 140);
        if (S && s.includes(S)) {
          p = 0;
          continue;
        }
        (S || (S = tC(_, E, C)), s.push(S), (p = 0));
      }
      m || (x = null);
    }
    let d = {
      code: n,
      title: t,
      color: e,
      stops: s,
      path: h,
      marks: [],
    };
    ROUTES.push(d);
    for (let p = 0; p < h.length; p++) {
      let x = h[p],
        m = h[(p + 1) % h.length],
        g = edgeBetween(x, m);
      if (g) {
        for (let M of s)
          if (M.e === g) {
            let y = g.a === x ? 1 : -1;
            d.marks.push({
              k: p,
              s: M.s,
              dir: y,
              stop: M,
            });
          }
      }
    }
    for (let p of s) p.routes.push(d);
  }
}
function U_(n, t, e, i = 0) {
  ((n.path = t),
    (n.loop = e),
    (n.pe = i),
    (n.wantDir = (s, o, r) => {
      let a = s.path,
        l = a.length,
        f = a[(s.pe + 2) % l];
      if (!s.loop && s.pe + 2 >= l) return null;
      for (let u of r) {
        let c = u[0];
        if ((u[1] > 0 ? c.b : c.a) === f && c.a !== c.b) return u;
      }
      return null;
    }),
    (n.onTurn = (s, o, r, a) => {
      let l = s.path,
        f = l.length,
        u = r > 0 ? o.b : o.a;
      if (l[(s.pe + 1) % f] === a && l[(s.pe + 2) % f] === u) {
        s.pe = (s.pe + 1) % f;
        return;
      }
      let c = l.indexOf(a);
      if (c >= 0 && l[(c + 1) % f] === u) {
        s.pe = c;
        return;
      }
      s.replan && s.replan(s, u, a);
    }));
}
function nC(n, t) {
  let e = n.path,
    i = e[t],
    s = e[(t + 1) % e.length],
    o = edgeBetween(i, s);
  if (!o) return !1;
  let r = o.a === i ? 1 : -1;
  ((n.e = o), (n.dir = r), (n.lane = 0));
  let a = W.nodes[o.a],
    l = W.nodes[o.b];
  ((n.s = r > 0 ? Math.min(a.r + 2, o.len * 0.4) : Math.max(o.len - l.r - 2, o.len * 0.6)),
    (n.lo = laneOff(o, r, 0)),
    (n.pe = t),
    (n.jc = null),
    (n.nx = null));
  let f = edgePos(o, n.s, {});
  return ((n.x = f.x + f.dz * n.lo), (n.z = f.z - f.dx * n.lo), (n.yaw = Math.atan2(f.dx * r, f.dz * r)), (n.y = 0.04), !0);
}
var L0 = [];
function iC(n, t, e) {
  let i = n.route,
    s = i.marks[n.mi % i.marks.length];
  if (!s) return null;
  if (s.k !== n.pe || s.dir !== n.dir) return ((n.kerb = !1), null);
  let o = (s.s - n.s) * n.dir;
  return o < -3
    ? ((n.mi = (n.mi + 1) % i.marks.length), (n.kerb = !1), null)
    : ((n.kerb = o < 45),
      o < 1.2 && n.v < 0.3
        ? ((n.dwell = (n.dwell || 0) + e),
          (n.atStop = s.stop),
          n.dwell > (n.hold ? 1e9 : 9) ? ((n.dwell = 0), (n.atStop = null), (n.mi = (n.mi + 1) % i.marks.length), xt('busDepart', n), null) : 0)
        : Math.max(0, o - 0.5));
}
function spawnBus(n, t, e) {
  let i = newCar('bus', 0, 0, 0, 'ai', n.color);
  if (!i) return null;
  if ((U_(i, n.path, !0, t), !nC(i, t))) return (freeCar(i), null);
  ((i.route = n), (i.v = e ? 0 : 6), (i.temper = 1), (i.hook = iC), (i.isBus = !0));
  let s = 0,
    o = 1e9;
  return (
    n.marks.forEach((r, a) => {
      let l = (r.k - t + n.path.length) % n.path.length;
      l < o && ((o = l), (s = a));
    }),
    (i.mi = s),
    L0.push(i),
    i
  );
}
var e3 = 0;
function manageBuses(n, t, e) {
  for (let u = L0.length - 1; u >= 0; u--) L0[u].removed && L0.splice(u, 1);
  if (((e3 -= n), e3 > 0)) return;
  e3 = 2.5;
  let i = Math.min(7, Math.round((R.Q.cars || 60) / 10));
  if (L0.filter((u) => Math.hypot(u.x - t, u.z - e) < R.Q.view * 0.5).length >= i) return;
  let s = R.Q.view * 0.42,
    o = [];
  for (let u of ROUTES)
    for (let c = 0; c < u.path.length; c += 2) {
      let h = W.nodes[u.path[c]],
        d = Math.hypot(h.x - t, h.z - e);
      d > s * 0.55 && d < s && o.push([u, c]);
    }
  if (!o.length) return;
  let [r, a] = Be(o),
    l = W.nodes[r.path[a]];
  if (Math.hypot(R.camera.position.x - l.x, R.camera.position.z - l.z) < 90) return;
  let f = [];
  (carsNear(l.x, l.z, 20, f), !f.length && spawnBus(r, a, !1));
}
function placeBefore(n, t, e) {
  let i = n.route,
    s = i.path[t.k],
    o = i.path[(t.k + 1) % i.path.length],
    r = edgeBetween(s, o);
  if (!r) return;
  let a = W.nodes[r.a],
    l = W.nodes[r.b],
    f = t.dir;
  ((n.e = r),
    (n.dir = f),
    (n.pe = t.k),
    (n.jc = null),
    (n.nx = null),
    (n.lane = 0),
    (n.s = It(t.s - f * e, a.r + 2, r.len - l.r - 2)),
    (n.lo = laneOff(r, f, 0)));
  let u = edgePos(r, n.s, {});
  ((n.x = u.x + u.dz * n.lo),
    (n.z = u.z - u.dx * n.lo),
    (n.yaw = Math.atan2(u.dx * f, u.dz * f)),
    (n.v = 8),
    (n.dwell = 0),
    (n.stuck = 0),
    (n.ghost = 1.5));
}
function skipBus(n) {
  let t = n.route;
  if (!t) return null;
  n.atStop && ((n.dwell = 0), (n.atStop = null), (n.mi = (n.mi + 1) % t.marks.length));
  let e = t.marks[n.mi % t.marks.length];
  if (!e) return null;
  let i = t.path[e.k],
    s = t.path[(e.k + 1) % t.path.length],
    o = edgeBetween(i, s);
  if (!o) return null;
  let r = W.nodes[o.a],
    a = W.nodes[o.b],
    l = e.dir;
  ((n.e = o),
    (n.dir = l),
    (n.pe = e.k),
    (n.jc = null),
    (n.nx = null),
    (n.lane = 0),
    (n.s = It(e.s - l * 22, r.r + 2, o.len - a.r - 2)),
    (n.lo = laneOff(o, l, 0)));
  let f = edgePos(o, n.s, {});
  return (
    (n.x = f.x + f.dz * n.lo),
    (n.z = f.z - f.dx * n.lo),
    (n.yaw = Math.atan2(f.dx * l, f.dz * l)),
    (n.v = 4),
    (n.dwell = 0),
    (n.stuck = 0),
    (n.ghost = 2),
    e.stop
  );
}
var D_ = new Map(),
  N_ = null;
function sC(n) {
  let t = new THREE.Group(),
    e = new Mt({
      color: !0,
    });
  for (let [i, s] of n.sides) {
    let o = i - n.x,
      r = s - n.z,
      a = Math.hypot(o, r) || 1,
      l = o / a,
      f = r / a,
      u = Math.atan2(-f, l);
    if (
      (e.setColor(9080726).cyl(i, 0, s, 0.05, 2.7, 8),
      e.setColor(15921904).cyl(i, 2.35, s, 0.32, 0.06, 16),
      e.setColor(3115598).cyl(i, 2.36, s, 0.27, 0.07, 16),
      e.setColor(14211804).box(i, 0.9, s, 0.38, 0.9, 0.06, u + Math.PI / 2, {}),
      n.routes.length > 1)
    ) {
      let c = i + l * 1.2,
        h = s + f * 1.2;
      e.setColor(10133928).box(c, 2.45, h, 4.2, 0.08, 1.6, u + Math.PI / 2, {});
      for (let d of [-1.9, 1.9]) e.setColor(6975606).box(c + f * d, 0, h - l * d, 0.08, 2.45, 0.08, 0, {});
      e.setColor(8358546).box(c + l * 0.75, 0.45, h + f * 0.75, 3.8, 0.06, 0.4, u + Math.PI / 2, {});
    }
  }
  t.add(
    new THREE.Mesh(
      e.build(),
      N_ ||
        (N_ = new THREE.MeshStandardMaterial({
          vertexColors: !0,
          roughness: 0.5,
          metalness: 0.3,
        })),
    ),
  );
  for (let [i, s] of n.sides) {
    let o = wv([n.name, n.routes.map((a) => a.code).join(' \u30FB ')], 512, 160, '#2f8a4e', '#ffffff'),
      r = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.24),
        new THREE.MeshBasicMaterial({
          map: o,
          side: THREE.DoubleSide,
        }),
      );
    (r.position.set(i, 2, s), (r.rotation.y = Math.atan2(n.dx, n.dz) + Math.PI / 2), t.add(r));
  }
  return (R.scene.add(t), t);
}
function updStops(n, t) {
  for (let e in STOPS) {
    let i = STOPS[e],
      s = Math.hypot(i.x - n, i.z - t),
      o = D_.get(i);
    (s < 450 && !o && i.routes.length && ((o = sC(i)), D_.set(i, o)), o && (o.visible = s < 450));
  }
}
function nearStop(n, t, e = 5) {
  for (let i in STOPS) {
    let s = STOPS[i];
    if (s.routes.length) {
      for (let [o, r] of s.sides) if (Math.hypot(o - n, r - t) < e) return s;
    }
  }
  return null;
}
var RIDE = {
  car: null,
  kind: null,
};
function callBus(n, t, e) {
  let i = t.marks.findIndex((r) => r.stop === n && oC(t, r, e)),
    s = t.marks[i];
  if (!s) return null;
  let o = L0.find((r) => !r.removed && r.route === t && r.mi === i && Math.hypot(r.x - n.x, r.z - n.z) < 160);
  if (!o) {
    let r = (s.k - 1 + t.path.length) % t.path.length;
    ((o = spawnBus(t, r, !1)), o && ((o.mi = i), placeBefore(o, s, 80)));
  }
  return o
    ? ((RIDE.wait = {
        bus: o,
        S: n,
        D: e,
        Rt: t,
        mi: i,
      }),
      o)
    : null;
}
function oC(n, t, e) {
  let i = n.marks.length,
    s = n.marks.indexOf(t);
  for (let o = 1; o < i; o++) {
    let r = n.marks[(s + o) % i];
    if (r.stop === e) return o;
    if (r.stop === t.stop) return 0;
  }
  return 0;
}
function busDestinations(n) {
  let t = [];
  for (let e of n.routes)
    for (let i of e.marks) {
      if (i.stop !== n) continue;
      let s = e.marks.length,
        o = e.marks.indexOf(i),
        r = [];
      for (let a = 1; a < s; a++) {
        let l = e.marks[(o + a) % s];
        if (l.stop === n) break;
        r.includes(l.stop) || r.push(l.stop);
      }
      r.length &&
        t.push({
          Rt: e,
          m: i,
          toward: r[r.length - 1],
          list: r,
        });
    }
  return t;
}
function hailTaxi(n, t) {
  let e = [];
  roadsNear(n, t, 60, e);
  let i = e.filter((r) => !r.e.elev && r.e.kind !== 'X').sort((r, a) => r.d - a.d)[0];
  if (!i) return null;
  let s = [];
  carsNear(n, t, 90, s);
  let o = s
    .filter(
      (r) => r.t === 'taxi' && r.mode === 'ai' && r.driver && !r.fare && r.v > 0 && (n - r.x) * Math.sin(r.yaw) + (t - r.z) * Math.cos(r.yaw) > 0,
    )
    .sort((r, a) => Math.hypot(r.x - n, r.z - t) - Math.hypot(a.x - n, a.z - t))[0];
  if (!o) {
    if (((o = spawnAICar(i.x, i.z, 'taxi')), !o)) return null;
    placeOnEdge(o, i.e, i.s, 60);
  }
  return (
    (o.pick = {
      e: i.e,
      s: i.s,
      x: n,
      z: t,
    }),
    i1(o, i.e, i.s, () => {
      o.waiting = !0;
    }),
    o
  );
}
function placeOnEdge(n, t, e, i) {
  let s = W.nodes[t.a],
    o = W.nodes[t.b],
    r = e - i > s.r + 2 ? 1 : -1;
  (r < 0 && e + i > t.len - o.r - 2 && (r = e > t.len / 2 ? 1 : -1),
    (n.e = t),
    (n.dir = r),
    (n.jc = null),
    (n.nx = null),
    (n.lane = 0),
    (n.s = It(e - r * i, s.r + 2, t.len - o.r - 2)),
    (n.lo = laneOff(t, r, 0)));
  let a = edgePos(t, n.s, {});
  ((n.x = a.x + a.dz * n.lo), (n.z = a.z - a.dx * n.lo), (n.yaw = Math.atan2(a.dx * r, a.dz * r)), (n.v = 8), (n.stuck = 0), (n.ghost = 1.5));
}
function i1(n, t, e, i, s, o) {
  s === void 0 && ((s = n.dir > 0 ? n.e.a : n.e.b), (o = n.dir > 0 ? n.e.b : n.e.a));
  let r = (t.a === s && t.b === o) || (t.b === s && t.a === o),
    a = t.a === s ? e : t.len - e,
    l = s === (n.dir > 0 ? n.e.a : n.e.b) && n.e === t ? (n.dir > 0 ? n.s : t.len - n.s) : 0,
    f;
  if (r && a - l > 15) f = [s, o];
  else {
    let u = e < t.len / 2 ? t.a : t.b,
      c = u === t.a ? t.b : t.a,
      h = route(o, u, 8e4, null, s, c) || route(o, u) || [o];
    (h[h.length - 1] !== c && (h = [...h, c]), (f = [s, ...h]));
  }
  (U_(n, f, !1, 0),
    (n.nx = null),
    (n.goal = {
      e: t,
      s: e,
      onArrive: i,
    }),
    (n.hook = rC),
    (n.replan = (u, c, h) => i1(u, t, e, i, h, c)));
}
function rC(n, t, e) {
  let i = n.goal;
  if (!i) return null;
  if (n.e !== i.e) return ((n.kerb = !1), null);
  let s = (i.s - n.s) * n.dir;
  if (((n.kerb = s < 40), s < -6)) {
    n.goal = null;
    let o = n.dir > 0 ? n.e.a : n.e.b,
      r = n.dir > 0 ? n.e.b : n.e.a;
    return (i1(n, i.e, i.s, i.onArrive, o, r), null);
  }
  return s < 1.5 && n.v < 0.4 ? (n.arrived || ((n.arrived = !0), i.onArrive && i.onArrive()), (n.dwell = 1), 0) : Math.max(0, s - 0.5);
}
function taxiTo(n, t, e, i) {
  let s = [];
  roadsNear(t, e, 150, s);
  let o = s.filter((r) => !r.e.elev && r.e.kind !== 'X').sort((r, a) => r.d - a.d)[0];
  return o
    ? ((n.arrived = !1),
      (n.dwell = 0),
      (n.waiting = !1),
      (n.fare = {
        start: G.stats.distance,
        x0: n.x,
        z0: n.z,
        meter: 0,
      }),
      i1(n, o.e, o.s, i),
      !0)
    : !1;
}
function releaseTaxi(n) {
  ((n.hook = null),
    (n.wantDir = null),
    (n.onTurn = null),
    (n.path = null),
    (n.goal = null),
    (n.fare = null),
    (n.pick = null),
    (n.kerb = !1),
    (n.dwell = 0),
    (n.arrived = !1),
    (n.waiting = !1),
    (n.replan = null));
}
function taxiFare(n) {
  return n <= 1096 ? 500 : 500 + Math.ceil((n - 1096) / 255) * 100;
}
function taxiPlaces() {
  return [
    ['\u6E0B\u8C37\u99C5', 'shibuya'],
    ['\u65B0\u5BBF\u99C5\u897F\u53E3', 'shinjukuW'],
    ['\u6C60\u888B\u99C5', 'ikebukuro'],
    ['\u6771\u4EAC\u99C5', 'tokyo'],
    ['\u9280\u5EA7\u56DB\u4E01\u76EE', 'ginza'],
    ['\u516D\u672C\u6728\u30D2\u30EB\u30BA', 'hills'],
    ['\u6771\u4EAC\u30BF\u30EF\u30FC', 'tower'],
    ['\u6D45\u8349\u96F7\u9580', 'asakusa'],
    ['\u304A\u53F0\u5834', 'odaiba'],
    ['\u54C1\u5DDD\u99C5', 'shinagawa'],
    ['\u4E0A\u91CE', 'ueno'],
    ['\u7FBD\u7530\u7A7A\u6E2F \u7B2C1\u30BF\u30FC\u30DF\u30CA\u30EB', 'hnd1'],
    ['\u7FBD\u7530\u7A7A\u6E2F \u7B2C3\u30BF\u30FC\u30DF\u30CA\u30EB', 'hnd3'],
    ['\u6A2A\u6D5C\u99C5', 'yokohama'],
    ['\u307F\u306A\u3068\u307F\u3089\u3044', 'minatomirai'],
    ['\u6A2A\u6D5C\u4E2D\u83EF\u8857', 'chukagai'],
    ['\u5DDD\u5D0E\u99C5', 'kawasaki'],
    ['\u6B66\u8535\u5C0F\u6749', 'kosugi'],
    ['\u4E8C\u5B50\u7389\u5DDD', 'futako'],
  ].map(([t, e]) =>
    e && STOPS[e]
      ? {
          name: t,
          x: STOPS[e].x,
          z: STOPS[e].z,
        }
      : {
          name: t,
          x: n3(35.549, 139.784)[0],
          z: n3(35.549, 139.784)[1],
        },
  );
}
var aC = [
    ['ginzaClock', '\u9280\u5EA7 \u548C\u660C\uFF08\u6642\u8A08\u5854\uFF09', 'clock', 35.67195, 139.7649, 34, 34, 40, 0.7, 14273976, '#2a2a2a'],
    ['ginzaMitsu', '\u9280\u5EA7 \u4E09\u8D77\u8D8A', 'dept', 35.6711, 139.7659, 70, 60, 46, 0.7, 14209216, '#b4122e'],
    ['ginzaSeven', 'GINZA SEVEN', 'mall', 35.66975, 139.764, 110, 90, 56, 0.7, 10134443, '#111111'],
    ['isetan', '\u65B0\u5BBF \u4F0A\u52E2\u65E6', 'dept', 35.69185, 139.7044, 90, 70, 40, 0.15, 13616304, '#c8102e'],
    [
      'takashima',
      '\u9DF9\u5CF6\u5C4B\u30BF\u30A4\u30E0\u30BA\u30B9\u30AF\u30A8\u30A2',
      'dept',
      35.6877,
      139.7024,
      90,
      80,
      75,
      0.1,
      13222582,
      '#1f6a3a',
    ],
    ['shibuya108', 'SHIBUYA 108', 'mall', 35.65962, 139.69872, 22, 22, 46, 0, 14211806, '#111111'],
    ['seibuIkebukuro', '\u897F\u90E8\u767E\u8CA8\u5E97 \u6C60\u888B', 'dept', 35.7295, 139.7113, 160, 60, 45, 0.25, 12564650, '#123a7a'],
    ['diverMall', '\u30C0\u30A4\u30D0\u30FC\u30E2\u30FC\u30EB\u6771\u4EAC', 'mall', 35.6253, 139.7756, 170, 110, 32, 0.6, 12107460, '#1b5fbf'],
    ['aquaMall', '\u30A2\u30AF\u30A2\u30E2\u30FC\u30EB\u53F0\u5834', 'mall', 35.6278, 139.7738, 120, 80, 28, 0.6, 12897490, '#0b8f8a'],
    ['midtown', '\u6771\u4EAC\u30DF\u30C3\u30C9\u30BF\u30A6\u30F3', 'tower', 35.6656, 139.731, 60, 50, 248, 0.2, 9412780, '#333333'],
    ['yodoAkiba', '\u30E8\u30C9\u30AC\u30EFAkiba', 'elec', 35.6985, 139.7745, 110, 70, 40, 0.2, 2764083, '#d4121f'],
    [
      'yodoShinjuku',
      '\u30AB\u30E1\u30E9\u306E\u30E8\u30C9\u30AC\u30EF \u65B0\u5BBF\u897F\u53E3',
      'elec',
      35.6914,
      139.6972,
      70,
      40,
      34,
      0.2,
      2764083,
      '#d4121f',
    ],
    [
      'donAkiba',
      '\u6FC0\u5B89\u306E\u6BBF\u5802\u30C9\u30F3\u30C9\u30F3 \u79CB\u8449\u539F',
      'disc',
      35.7,
      139.7713,
      30,
      30,
      36,
      0.2,
      15909424,
      '#1b4fa8',
    ],
    [
      'donShibuya',
      '\u6FC0\u5B89\u306E\u6BBF\u5802\u30C9\u30F3\u30C9\u30F3 \u6E0B\u8C37',
      'disc',
      35.661,
      139.6978,
      40,
      34,
      34,
      0.1,
      15909424,
      '#1b4fa8',
    ],
    [
      'pachiKabuki',
      '\u30D1\u30C1\u30F3\u30B3 \u307E\u308B\u306F\u3061 \u6B4C\u821E\u4F0E\u753A',
      'pachinko',
      35.6941,
      139.7008,
      24,
      22,
      26,
      0.15,
      2236968,
      '#ff3c3c',
    ],
    [
      'pachiIkebukuro',
      '\u30D1\u30C1\u30F3\u30B3 \u30ED\u30A4\u30E4\u30EB \u6C60\u888B',
      'pachinko',
      35.7301,
      139.7136,
      26,
      24,
      28,
      0.25,
      2236968,
      '#ffd23f',
    ],
    [
      'pachiShimbashi',
      '\u30D1\u30C1\u30F3\u30B3 \u30CB\u30E5\u30FC\u9280\u6CB3 \u65B0\u6A4B',
      'pachinko',
      35.6671,
      139.7574,
      22,
      22,
      24,
      0.7,
      2236968,
      '#43c6ff',
    ],
    ['pachiAkiba', '\u30B9\u30ED\u30C3\u30C8 \u30AE\u30AC \u79CB\u8449\u539F', 'pachinko', 35.6978, 139.7723, 22, 20, 30, 0.2, 2236968, '#ff4fc3'],
    [
      'pachiShibuya',
      '\u30D1\u30C1\u30F3\u30B3 \u30DF\u30E9\u30AF\u30EB \u6E0B\u8C37\u30BB\u30F3\u30BF\u30FC\u8857',
      'pachinko',
      35.6603,
      139.6987,
      20,
      20,
      24,
      0.1,
      2236968,
      '#7dff5a',
    ],
    [
      'oiRace',
      '\u5927\u4E95\u7AF6\u99AC\u5834\uFF08\u30C8\u30A5\u30A4\u30F3\u30AF\u30EB\u30EC\u30FC\u30B9\uFF09',
      'race',
      35.5928,
      139.74,
      300,
      520,
      30,
      0.25,
      14211280,
      '#0b5fa8',
    ],
    ['heiwajima', '\u30DC\u30FC\u30C8\u30EC\u30FC\u30B9\u5E73\u548C\u5CF6', 'boat', 35.5858, 139.7428, 90, 60, 24, 0.3, 14211280, '#0a6fb5'],
    ['wins', 'WINS \u5F8C\u697D\u5712\uFF08\u5834\u5916\u99AC\u5238\uFF09', 'wins', 35.7045, 139.7533, 50, 40, 36, 0.3, 12564650, '#0b5fa8'],
  ],
  Gf = [],
  p3 = {
    dept: 'mall',
    mall: 'mall',
    disc: 'mall',
    elec: 'mall',
    pachinko: 'pachinko',
    race: 'race',
    boat: 'race',
    wins: 'race',
    clock: 'mall',
  };
function lC(n, t, e, i, s) {
  let o = [];
  buildingsNear(n, t, Math.max(e, i) / 2 + 40, o);
  let r = W.bld,
    a = Math.cos(s),
    l = Math.sin(s);
  for (let f of o) {
    let u = f * 9,
      c = r[u] - n,
      h = r[u + 1] - t,
      d = c * a + h * l,
      p = -c * l + h * a;
    Math.abs(d) < e / 2 + r[u + 3] / 2 + 2 && Math.abs(p) < i / 2 + r[u + 4] / 2 + 2 && clearBuilding(u);
  }
}
function Bf(n, t, e, i, s, o = 0, r = 0) {
  W.lmCol.push({
    x: n,
    z: t,
    w: e,
    d: i,
    h: s,
    rot: o,
    y0: r,
    rad: Math.hypot(e, i) / 2,
  });
}
function qr(n, t, e, i = 1024, s = 192, o = !1) {
  let [r, a] = Ne(o ? s : i, o ? i : s);
  if (((a.fillStyle = t), a.fillRect(0, 0, r.width, r.height), (a.fillStyle = e), (a.textAlign = 'center'), (a.textBaseline = 'middle'), o)) {
    let l = [...n],
      f = Math.min(s * 0.8, (i - 20) / l.length);
    ((a.font = `900 ${f}px ${ce}`), l.forEach((u, c) => a.fillText(u, r.width / 2, 10 + f * (c + 0.5))));
  } else {
    let l = s * 0.62;
    for (a.font = `900 ${l}px ${ce}`; a.measureText(n).width > i - 40 && l > 16;) ((l -= 4), (a.font = `900 ${l}px ${ce}`));
    a.fillText(n, i / 2, s / 2 + 4);
  }
  return Fe(r, {
    rep: !1,
  });
}
function $r(n, t, e, i, s, o, r, a = 0.8) {
  let l = new THREE.Mesh(
    new THREE.PlaneGeometry(t, e),
    new THREE.MeshStandardMaterial({
      map: n,
      emissive: 16777215,
      emissiveMap: n,
      emissiveIntensity: a * 0.4,
      roughness: 0.5,
    }),
  );
  return (l.position.set(i, s, o), (l.rotation.y = r), R.scene.add(l), LM.meshes.push(l), LM.emissive.push([l.material, a * 1.4, a * 0.25]), l);
}
function cC(n, t, e, i, s) {
  let o = Math.cos(s),
    r = Math.sin(s),
    a = [-r, o, i / 2],
    l = 1e9;
  for (let [f, u, c] of [
    [-r, o, i / 2],
    [r, -o, i / 2],
    [o, r, e / 2],
    [-o, -r, e / 2],
  ]) {
    let h = n + f * (c + 12),
      d = t + u * (c + 12),
      p = [];
    roadsNear(h, d, 30, p);
    let x = p.length ? Math.min(...p.map((m) => m.d)) : 1e9;
    x < l && ((l = x), (a = [f, u, c]));
  }
  return a;
}
function O_() {
  let n = new Mt({
      color: !0,
      aB: !0,
    }),
    t = new Mt({
      color: !0,
    }),
    e = new Mt({
      color: !0,
    });
  for (let [s, o, r, a, l, f, u, c, h, d, p] of aC) {
    let [x, m] = fe(a, l);
    if (r !== 'race') {
      let D = freeSpot(x, m, f, u, h, 140) || railFree(x, m, f, u, h, 6, 120);
      if (!D) continue;
      [x, m] = D;
    }
    lC(x, m, f, u, h);
    let g = Math.cos(h),
      M = Math.sin(h),
      [y, _, v] = cC(x, m, f, u, h),
      b = Math.atan2(y, _),
      w = Math.abs(y * g + _ * M) > 0.7 ? u : f,
      E = new THREE.Color(d),
      C = [E.r, E.g, E.b];
    if (r === 'race') {
      let D = new Mt({
          color: !0,
        }),
        O = f * 0.42,
        U = u * 0.42;
      for (let G = 0; G < 48; G++) {
        let tt = (G / 48) * Math.PI * 2,
          K = ((G + 1) / 48) * Math.PI * 2,
          Y = (Q, J) => {
            let ft = Math.cos(Q) * O * J,
              yt = Math.sin(Q) * U * J;
            return [x + ft * g - yt * M, 0.08, m + ft * M + yt * g];
          };
        if (
          (D.setColor(11967082).quad(Y(tt, 1), Y(K, 1), Y(K, 0.86), Y(tt, 0.86), [0, 1, 0]),
          D.setColor(5212730).quad(Y(tt, 0.86), Y(K, 0.86), Y(K, 0.8), Y(tt, 0.8), [0, 1, 0]),
          D.setColor(6265416).tri([x, 0.07, m], Y(K, 0.8), Y(tt, 0.8), [0, 1, 0]),
          G % 2 === 0)
        ) {
          let Q = Y(tt, 1.01);
          t.setColor(15921904).box(Q[0], 0, Q[2], 0.15, 1.1, 0.15, 0, {});
        }
      }
      let B = x + y * (v - 20),
        _R1 = m + _ * (v - 20);
      (n.setColor(C),
        (n.bv = [3, 9, 4, 0.5]),
        n.box(B, 0, _R1, w * 0.55, c, 40, Math.atan2(-y, _), {}),
        Bf(B, _R1, w * 0.55, 40, c, Math.atan2(-y, _)),
        t.setColor(10134443).box(B - y * 12, c, _R1 - _ * 12, w * 0.56, 1.2, 30, Math.atan2(-y, _), {}));
      let k = x - y * (v * 0.4),
        P = m - _ * (v * 0.4);
      (e.setColor(1710618).box(k, 4, P, 40, 14, 1.5, Math.atan2(-y, _), {}),
        $r(qr(o, '#ffffff', p), w * 0.5, w * 0.05, B + y * 20.2, c - 5, _R1 + _ * 20.2, b));
      let H = B + y * 21.5,
        Z = _R1 + _ * 21.5;
      Gf.push({
        x: H,
        z: Z,
        type: p3[r],
        label: o,
        venue: s,
        vtype: r,
      });
      let q = new THREE.Mesh(
        D.build(),
        new THREE.MeshStandardMaterial({
          vertexColors: !0,
          roughness: 0.95,
        }),
      );
      ((q.receiveShadow = !0), R.scene.add(q), LM.meshes.push(q));
      continue;
    }
    if ((n.setColor(C), r === 'tower')) {
      ((n.bv = [4, 13, 4.2, 0.62]),
        n.box(x, 0, m, f, c * 0.55, u, h, {}),
        n.box(x, c * 0.55, m, f * 0.86, c * 0.45, u * 0.86, h, {}),
        n.setColor([0.8, 0.78, 0.74]),
        (n.bv = [3, 7, 4.5, 0.5]),
        n.box(x, 0, m, f * 2, 26, u * 1.8, h, {}),
        Bf(x, m, f, u, c, h),
        Bf(x, m, f * 2, u * 1.8, 26, h),
        LM.av.push([x, c + 2, m]));
      continue;
    }
    if (r === 'clock') {
      ((n.bv = [0, 41, 4.2, 0.45]),
        n.box(x, 0, m, f, c - 8, u, h, {}),
        t.setColor(13221544).cyl(x, c - 8, m, f * 0.3, 8, 16, !1),
        t.setColor(3820100).cyl(x, c, m, f * 0.32, 3, 16, !0));
      let [D, O] = Ne(256, 256);
      ((O.fillStyle = '#f4f0e6'),
        O.beginPath(),
        O.arc(128, 128, 120, 0, 7),
        O.fill(),
        (O.strokeStyle = '#222'),
        (O.lineWidth = 6),
        O.stroke(),
        (O.fillStyle = '#222'));
      for (let B = 0; B < 12; B++) {
        let R = (B / 12) * Math.PI * 2;
        O.fillRect(128 + Math.sin(R) * 100 - 4, 128 - Math.cos(R) * 100 - 8, 8, 16);
      }
      let U = new THREE.Mesh(
        new THREE.CircleGeometry(3.4, 32),
        new THREE.MeshStandardMaterial({
          map: Fe(D, {
            rep: !1,
          }),
          emissive: 16772829,
          emissiveIntensity: 0.2,
        }),
      );
      (U.position.set(x + y * (f * 0.3 + 0.05), c - 4, m + _ * (f * 0.3 + 0.05)),
        (U.rotation.y = b),
        R.scene.add(U),
        LM.meshes.push(U),
        LM.emissive.push([U.material, 0.8, 0.2]),
        (LM.clocks = (LM.clocks || []).concat([
          {
            x: U.position.x + y * 0.05,
            y: c - 4,
            z: U.position.z + _ * 0.05,
            ry: b,
          },
        ])));
    } else if (r === 'mall' && s === 'shibuya108') {
      (t.setColor(14211806).cyl(x, 0, m, f / 2, c, 24, !0), (n.bv = [0, 1, 1, 0]));
      for (let D of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        let O = Math.sin(D + 0.6),
          U = Math.cos(D + 0.6);
        $r(qr('108', '#e9ecef', '#111', 192, 1024, !0), 3.2, 17, x + O * (f / 2 + 0.1), c - 11, m + U * (f / 2 + 0.1), Math.atan2(O, U), 1);
      }
      (Bf(x, m, f * 0.75, f * 0.75, c),
        Gf.push({
          x: x + y * (f / 2 + 1),
          z: m + _ * (f / 2 + 1),
          type: 'mall',
          label: o,
          venue: s,
          vtype: r,
        }));
      continue;
    } else {
      let D = r === 'dept' ? [0, 41, 4.4, 0.4] : r === 'pachinko' ? [5, 3, 4, 0.2] : r === 'elec' ? [4, 7, 4.2, 0.5] : [3, 11, 4.3, 0.5];
      ((n.bv = D), n.box(x, 0, m, f, c, u, h, {}), t.setColor(r === 'dept' ? 9077880 : 3816512).box(x, c, m, f + 0.6, 1.2, u + 0.6, h, {}));
    }
    Bf(x, m, f, u, c, h);
    let S = x + y * (v + 0.15),
      T = m + _ * (v + 0.15);
    if (
      ((r === 'dept' || r === 'clock') &&
        ($r(
          qr(o.replace(/^[^ ]+ /, ''), p, '#ffffff', 192, 1024, !0),
          3.4,
          Math.min(c * 0.6, 22),
          S + _ * w * 0.38 + y * 1.2,
          c * 0.55,
          T - y * w * 0.38 + _ * 1.2,
          b,
        ),
        e.setColor(16774360).box(S, 0.2, T, w * 0.7, 4.2, 0.3, Math.atan2(-y, _), {})),
      r === 'mall' &&
        ($r(qr(o, '#ffffff', p), Math.min(w * 0.7, 46), Math.min(w * 0.7, 46) * 0.19, S, c - 6, T, b),
        e.setColor(14413567).box(S, 0.2, T, w * 0.8, 6, 0.3, Math.atan2(-y, _), {})),
      r === 'elec' || r === 'disc')
    ) {
      $r(qr(o.split(' ')[0], p, r === 'disc' ? '#ffe600' : '#ffffff'), w * 0.85, w * 0.85 * 0.19, S, c - 7, T, b, 1.2);
      for (let D = 0; D < 3; D++) e.setColor([13898271, 16777215, 1789864][D]).box(S, 8 + D * 6, T, w * 0.95, 0.6, 0.35, Math.atan2(-y, _), {});
    }
    if (r === 'pachinko') {
      ($r(qr(o.split(' ').slice(0, 2).join(' '), '#111111', p), w * 0.9, w * 0.9 * 0.19, S, c - 5, T, b, 1.6),
        $r(
          qr(
            r === 'pachinko' && o.startsWith('\u30B9\u30ED\u30C3\u30C8') ? '\u30B9\u30ED\u30C3\u30C8' : '\u30D1\u30C1\u30F3\u30B3',
            p,
            '#ffffff',
            192,
            1024,
            !0,
          ),
          2.6,
          14,
          S + _ * w * 0.42 + y * 1.5,
          c * 0.5,
          T - y * w * 0.42 + _ * 1.5,
          b,
          1.8,
        ));
      for (let D = 0; D <= 24; D++) {
        let O = D / 24 - 0.5,
          U = S + _ * w * O * 0.95,
          B = T - y * w * O * 0.95;
        e.setColor(D % 2 ? 16773754 : 16732240).box(U + y * 0.2, c - 11, B + _ * 0.2, 0.35, 0.35, 0.35, 0, {});
      }
      e.setColor(16769696).box(S, 0.2, T, w * 0.7, 3.6, 0.3, Math.atan2(-y, _), {});
    }
    ((r === 'boat' || r === 'wins') && $r(qr(o, '#ffffff', p), w * 0.85, w * 0.85 * 0.19, S, c - 6, T, b),
      p3[r] &&
        Gf.push({
          x: x + y * (v + 1.3),
          z: m + _ * (v + 1.3),
          type: p3[r],
          label: o,
          venue: s,
          vtype: r,
        }));
  }
  let i = (s, o, r) => {
    if (!s.count) return;
    let a = new THREE.Mesh(s.build(), o);
    ((a.castShadow = !!r), (a.receiveShadow = !0), R.scene.add(a), LM.meshes.push(a));
  };
  (i(n, R.M.building, !0), i(t, R.M.paint, !0), i(e, R.M.glow, !1));
}
var o1 = [],
  H_ = {
    todai: 1,
    waseda: 1,
    keio: 1,
    rikkyo: 1,
    gakushuin: 1,
    geidai: 1,
  };
function io(n, t, e, i, s, o = 0, r = 0) {
  W.lmCol.push({
    x: n,
    z: t,
    w: e,
    d: i,
    h: s,
    rot: o,
    y0: r,
    rad: Math.hypot(e, i) / 2,
  });
}
var m3 = new Map();
function x3(n, t, e, i) {
  let s = n + t + e + i;
  if (m3.has(s)) return m3.get(s);
  let [o, r] = Ne(320, 80);
  (r.scale(0.625, 0.625), (r.fillStyle = e), r.fillRect(0, 0, 512, 128), (r.fillStyle = i), (r.textAlign = 'center'), (r.textBaseline = 'middle'));
  let a = 50;
  for (r.font = `900 ${a}px ${ce}`; r.measureText(n).width > 490 && a > 18;) ((a -= 3), (r.font = `900 ${a}px ${ce}`));
  (r.fillText(n, 256, t ? 48 : 64), t && ((r.font = `700 22px ${ce}`), r.fillText(t, 256, 104)));
  let l = Fe(o, {
      rep: !1,
    }),
    f = new THREE.MeshStandardMaterial({
      map: l,
      emissive: 16777215,
      emissiveMap: l,
      emissiveIntensity: 0.35,
    });
  return (m3.set(s, f), f);
}
function fC(n, t, e, i, s, o, r) {
  let a = new THREE.Mesh(new THREE.PlaneGeometry(t, e), n);
  return (a.position.set(i, s, o), (a.rotation.y = r), R.scene.add(a), LM.meshes.push(a), a);
}
function hC(n, t, e, i, s) {
  let o = [];
  buildingsNear(n, t, Math.hypot(e, i) / 2 + 30, o);
  let r = W.bld,
    a = Math.cos(s),
    l = Math.sin(s);
  for (let f of o) {
    let u = f * 9,
      c = r[u] - n,
      h = r[u + 1] - t,
      d = c * a + h * l,
      p = -c * l + h * a,
      x = Math.max(r[u + 3], r[u + 4]) / 2;
    Math.abs(d) < e / 2 + x && Math.abs(p) < i / 2 + x && clearBuilding(u);
  }
}
function uC(n) {
  let t = Math.cos(n.rot),
    e = Math.sin(n.rot);
  return [
    [-e, t, n.d / 2],
    [e, -t, n.d / 2],
    [t, e, n.w / 2],
    [-t, -e, n.w / 2],
  ];
}
var dC = new Set(['landmarkTower', 'queensSquare', 'cosmoClock', 'redBrick', 'osanbashi', 'yokohamaStadium', 'marineTower', 'kawasakiDaishi']);
function B_() {
  let n = new Mt({
      color: !0,
      aB: !0,
    }),
    t = new Mt({
      color: !0,
    }),
    e = new Mt({
      color: !0,
    }),
    i = new Mt({
      color: !0,
    }),
    s = new Mt({
      color: !0,
    }),
    o = [],
    r = (l, f) => {
      roadsNear(l, f, 40, o);
      let u = 99;
      for (let c of o) c.e.elev || (u = Math.min(u, c.d - c.e.hw));
      return u;
    };
  for (let l of W.sites || []) {
    let f = 0,
      u = 1e9;
    for (let U = 0; U < 4; U++) {
      let B = l.rot + (U * Math.PI) / 2,
        R = U & 1 ? l.w : l.d,
        k = r(l.x - Math.sin(B) * (R / 2 + 4), l.z + Math.cos(B) * (R / 2 + 4));
      k < u - 0.5 && ((u = k), (f = U));
    }
    let c = Object.assign(
        l,
        f & 1
          ? {
              w: l.d,
              d: l.w,
            }
          : {},
        {
          rot: l.rot + (f * Math.PI) / 2,
        },
      ),
      { x: h, z: d, w: p, d: x, rot: m, type: g, key: M, name: y } = c,
      _ = Math.cos(m),
      v = Math.sin(m),
      b = (U, B) => [h + _ * U - v * B, d + v * U + _ * B];
    hC(h, d, p, x, m);
    let w = uC(c)[0],
      E = w[0],
      C = w[1],
      S = g === 'elem' || g === 'jhs' || g === 'high',
      T = g === 'univ',
      D = T ? 7311186 : S ? 12165754 : 11578016,
      O = [b(-p / 2, -x / 2), b(p / 2, -x / 2), b(p / 2, x / 2), b(-p / 2, x / 2)];
    if (
      (s.setColor(D).quad([O[0][0], 0.06, O[0][1]], [O[3][0], 0.06, O[3][1]], [O[2][0], 0.06, O[2][1]], [O[1][0], 0.06, O[1][1]], [0, 1, 0]), T || S)
    ) {
      for (let [k, P, H, Z] of [
        [-p / 2, -x / 2, p / 2, -x / 2],
        [p / 2, -x / 2, p / 2, x / 2],
        [p / 2, x / 2, -p / 2, x / 2],
        [-p / 2, x / 2, -p / 2, -x / 2],
      ]) {
        let q = Math.hypot(H - k, Z - P),
          G = Math.max(1, Math.round(q / 6));
        for (let tt = 0; tt < G; tt++) {
          let K = tt / G,
            Y = (tt + 1) / G,
            Q = k + ((H - k) * (K + Y)) / 2,
            J = P + ((Z - P) * (K + Y)) / 2;
          if (Math.abs(J - x / 2) < 1 && Math.abs(Q) < 6) continue;
          let [ft, yt] = b(Q, J);
          t.setColor(T ? (H_[M] ? 9062964 : 10132898) : 6982234).box(
            ft,
            0,
            yt,
            q / G,
            T ? 1.8 : 1.6,
            0.25,
            Math.atan2(v * (H - k) + _ * (Z - P), _ * (H - k) - v * (Z - P)),
            {},
          );
        }
      }
      let [U, B] = b(0, x / 2),
        R = Math.atan2(E, C);
      for (let k of [-1, 1]) {
        let [P, H] = b(k * 6, x / 2);
        t.setColor(T ? 5920080 : 9079428).box(P, 0, H, 0.8, T ? 3.6 : 2.2, 0.8, m, {});
      }
      (fC(
        x3(
          y,
          T ? 'UNIVERSITY' : g === 'high' ? '\u4E2D\u5B66\u6821\u30FB\u9AD8\u7B49\u5B66\u6821' : '',
          T ? '#1d2c4a' : '#f4f2ec',
          T ? '#ffffff' : '#1d2b1d',
        ),
        T ? 6 : 4,
        T ? 1.5 : 1,
        U + E * 0.6 + _ * 8.5,
        T ? 2.8 : 1.9,
        B + C * 0.6 + v * 8.5,
        R,
      ),
        o1.push({
          x: U + E * 1.5,
          z: B + C * 1.5,
          type: T ? 'univ' : 'school',
          label: y,
          site: c,
        }));
      for (let k = 0; k < Math.floor((p + x) / 14); k++) {
        let P = k / Math.floor((p + x) / 14),
          H = P < 0.5 ? (P * 2 - 0.5) * p : (p / 2 - 3) * (k % 2 ? 1 : -1),
          Z = P < 0.5 ? -x / 2 + 3 : ((P - 0.5) * 2 - 0.5) * x,
          [q, G] = b(H * 0.94, Z * 0.94);
        G_(t, i, q, G, T ? 1.4 : 1.1);
      }
    }
    if (T) {
      let U = !!H_[M],
        B = U ? [0.6, 0.36, 0.26] : [0.78, 0.78, 0.76],
        _R10 = Math.max(3, Math.min(8, Math.round((p * x) / 9e3)));
      for (let q = 0; q < _R10; q++) {
        let G = (q / _R10) * Math.PI * 2,
          tt = 36 + (q % 3) * 8,
          K = 18,
          Y = 14 + ((q * 7) % 4) * 5,
          Q = Math.cos(G) * (p / 2 - tt / 2 - 6),
          J = Math.sin(G) * (x / 2 - K / 2 - 6);
        if (J > x / 2 - 30 && Math.abs(Q) < 20) continue;
        let [ft, yt] = b(Q, J),
          zt = m + (Math.abs(Math.cos(G)) > 0.7 ? Math.PI / 2 : 0);
        (n.setColor(B), (n.bv = [U ? 2 : 3, q * 3.1, 3.8, 0.55]), n.box(ft, 0, yt, tt, Y, K, zt, {}), io(ft, yt, tt, K, Y, zt));
      }
      let [k, P] = b(0, -x * 0.1);
      if (M === 'todai' || M === 'waseda' || M === 'keio' || M === 'rikkyo') {
        (n.setColor(B),
          (n.bv = [2, 9, 4, 0.5]),
          n.box(k, 0, P, 44, 18, 26, m, {}),
          n.box(k, 18, P, 12, 22, 12, m, {}),
          t.setColor(3820100).prism(k, 40, 47, P, 7, 7, 7, -7, 7, -7),
          io(k, P, 44, 26, 40, m));
        let q = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), x3('', '', '#f4f0e6', '#222'));
        (q.position.set(k + E * 6.05, 33, P + C * 6.05), (q.rotation.y = Math.atan2(E, C)), R.scene.add(q), LM.meshes.push(q));
      } else
        (n.setColor([0.62, 0.68, 0.74]), (n.bv = [4, 13, 4, 0.6]), n.box(k, 0, P, 34, 60 + (M.length % 3) * 20, 26, m, {}), io(k, P, 34, 26, 100, m));
      let [H, Z] = b(0, x * 0.2);
      if ((t.setColor(13156528).box(H, 0.04, Z, 6, 0.06, x * 0.55, m, {}), p > 200)) {
        let [q, G] = b(p * 0.28, x * 0.15);
        (t.setColor(10506298).box(q, 0.05, G, 70, 0.05, 44, m, {}), t.setColor(6261317).box(q, 0.07, G, 56, 0.05, 30, m, {}));
      }
    } else if (S) {
      let U = g === 'elem' ? 12.5 : 15.5,
        B = p * 0.7,
        [_R11, k] = b(-p * 0.08, -x / 2 + 9);
      (n.setColor([0.9, 0.89, 0.85]),
        (n.bv = [2, 11, 3.6, 0.65]),
        n.box(_R11, 0, k, B, U, 12, m, {}),
        io(_R11, k, B, 12, U, m),
        t.setColor(4869458).box(_R11, U, k, B + 0.4, 0.5, 12.4, m, {}));
      let [P, H] = b(-p * 0.08, -x / 2 + 15.1),
        Z = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), x3('', '', '#ffffff', '#222'));
      (Z.position.set(P, U - 2, H), (Z.rotation.y = Math.atan2(E, C)), R.scene.add(Z), LM.meshes.push(Z));
      let [q, G] = b(p / 2 - 14, -x / 2 + 14);
      if (
        (t.setColor(14210768).box(q, 0, G, 22, 8, 24, m, {}),
        t.setColor(6978186).box(q, 8, G, 23, 1.2, 25, m, {}),
        io(q, G, 22, 24, 9, m),
        g === 'elem')
      ) {
        let [Y, Q] = b(p / 2 - 14, x / 2 - 12);
        (t.setColor(15263972).box(Y, 0, Q, 18, 0.5, 10, m, {}), e.setColor(4894944).box(Y, 0.5, Q, 16, 0.02, 8, m, {}));
      }
      let [tt, K] = b(-p * 0.15, x * 0.18);
      for (let Y of [-1, 1]) {
        let [Q, J] = b(-p * 0.15 + Y * p * 0.25, x * 0.18);
        (t.setColor(13159632).box(Q, 0, J, 0.15, 3, 0.15, m, {}), t.setColor(15921904).box(Q, 2.6, J, 0.1, 1, 1.6, m, {}));
      }
      t.setColor(15921902).box(tt, 0.07, K, p * 0.5, 0.02, 0.15, m, {});
    } else dC.has(M) || pC(c, n, t, e, i, b, E, C);
    if (
      ((W.landmarks[M] = {
        x: h,
        z: d,
        name: y,
        site: !0,
        lm: g === 'lm',
        univ: T,
      }),
      g === 'lm' && s1[M])
    ) {
      let [U, B] = b(0, x / 2 + 2);
      o1.push({
        x: U,
        z: B,
        type: s1[M][0],
        label: y,
        site: c,
        show: s1[M][1],
        fee: s1[M][2],
      });
    }
  }
  let a = (l, f, u) => {
    if (!l.count) return;
    let c = new THREE.Mesh(l.build(), f);
    ((c.castShadow = !!u), (c.receiveShadow = !0), R.scene.add(c), LM.meshes.push(c));
  };
  (a(s, R.M.paint, !1), a(n, R.M.building, !0), a(t, R.M.paint, !0), a(e, R.M.glow, !1), a(i, R.M.leaf, !0));
}
var s1 = {
  budokan: ['hall', '\u30E9\u30A4\u30D6', 6500],
  kabukiza: ['hall', '\u6B4C\u821E\u4F0E', 4e3],
  kokugikan: ['hall', '\u5927\u76F8\u64B2', 3800],
  stadium: ['hall', '\u30B5\u30C3\u30AB\u30FC\u306E\u8A66\u5408', 3500],
  forum: ['hall', '\u30B3\u30F3\u30B5\u30FC\u30C8', 5e3],
  tnm: ['museum', '\u56FD\u5B9D\u306E\u5C55\u793A', 1e3],
  miraikan: ['museum', '\u79D1\u5B66\u5C55\u793A', 630],
  nact: ['museum', '\u4F01\u753B\u5C55', 1800],
  jingu: ['hall', '\u30D7\u30ED\u91CE\u7403\u89B3\u6226', 2400],
  kaigakan: ['museum', '\u660E\u6CBB\u5929\u7687\u306E\u58C1\u753B\u5C55\u793A', 500],
};
function G_(n, t, e, i, s) {
  (n.setColor(5981750).cyl(e, 0.05, i, 0.18 * s, 2.6 * s, 6, !1),
    t.setColor([0.27, 0.42, 0.22]).ell(e, 2.6 * s + 1.2 * s, i, 1.6 * s, 1.5 * s, 1.6 * s, 7, 5));
}
function pC(n, t, e, i, s, o, r, a) {
  let { x: l, z: f, w: u, d: c, rot: h, key: d } = n,
    p = Math.cos(h),
    x = Math.sin(h),
    m = (M, y, _, v, b, w, E, C, S = 0) => {
      let [T, D] = o(_, v);
      M.setColor(y).box(T, b, D, w, E, C, h + S, {});
    },
    g = (M, y, _, v, b, w = 0) => {
      let [E, C] = o(M, y);
      io(E, C, _, v, b, h, w);
    };
  if (d === 'budokan') {
    for (let _ = 0; _ < 8; _++) m(e, 14209732, 0, 0, 0, 52, 14, 22, (_ * Math.PI) / 8);
    let M = new THREE.Mesh(
      new THREE.ConeGeometry(40, 18, 8, 1),
      new THREE.MeshStandardMaterial({
        color: 5925468,
        roughness: 0.6,
        metalness: 0.3,
      }),
    );
    (M.position.set(l, 23, f), (M.rotation.y = h + Math.PI / 8), R.scene.add(M), LM.meshes.push(M));
    let y = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 14202186,
        metalness: 1,
        roughness: 0.3,
      }),
    );
    (y.position.set(l, 33, f), R.scene.add(y), LM.meshes.push(y), g(0, 0, 58, 58, 32));
  } else if (d === 'kabukiza') {
    m(e, 15789282, 0, 6, 0, 56, 14, 26);
    for (let _ of [-18, 0, 18]) {
      let [v, b] = o(_, 6);
      e.setColor(2829102).gable(v, 14, b, _ ? 16 : 22, 28, 5, h);
    }
    for (let _ = -3; _ <= 3; _++) {
      let [v, b] = o(_ * 6, 19.3);
      i.setColor(16728096).box(v, 7.5, b, 0.8, 1.4, 0.8, 0, {});
    }
    (t.setColor([0.55, 0.58, 0.62]), (t.bv = [4, 21, 4, 0.6]));
    let [M, y] = o(0, -14);
    (t.box(M, 0, y, 34, 140, 22, h, {}), g(0, 6, 56, 26, 20), g(0, -14, 34, 22, 140));
  } else if (d === 'kokugikan') {
    m(e, 14209212, 0, 0, 0, 92, 18, 78);
    let M = new THREE.Mesh(
      new THREE.ConeGeometry(68, 22, 4, 1),
      new THREE.MeshStandardMaterial({
        color: 4155994,
        roughness: 0.55,
      }),
    );
    (M.position.set(l, 29, f), (M.rotation.y = h + Math.PI / 4), M.scale.set(1, 1, 0.85), R.scene.add(M), LM.meshes.push(M), g(0, 0, 92, 78, 40));
  } else if (d === 'stadium') {
    let M = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(u, c) * 0.4, 18, 6, 48),
      new THREE.MeshStandardMaterial({
        color: 13156528,
        roughness: 0.8,
      }),
    );
    ((M.rotation.x = Math.PI / 2),
      M.scale.set(u / Math.min(u, c), c / Math.min(u, c), 1),
      M.position.set(l, 12, f),
      (M.rotation.z = h),
      R.scene.add(M),
      LM.meshes.push(M));
    let y = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(u, c) * 0.43, 4, 4, 48),
      new THREE.MeshStandardMaterial({
        color: 9071170,
        roughness: 0.9,
      }),
    );
    ((y.rotation.x = Math.PI / 2),
      y.scale.copy(M.scale),
      y.position.set(l, 30, f),
      (y.rotation.z = h),
      R.scene.add(y),
      LM.meshes.push(y),
      m(e, 5212730, 0, 0, 0.1, u * 0.42, 0.1, c * 0.32));
    for (let _ = 0; _ < 24; _++) {
      let v = (_ / 24) * Math.PI * 2,
        [b, w] = o(Math.cos(v) * u * 0.48, Math.sin(v) * c * 0.48);
      G_(e, s, b, w, 1.3);
    }
    for (let _ = 0; _ < 16; _++) {
      let v = (_ / 16) * Math.PI * 2;
      g(Math.cos(v) * u * 0.4, Math.sin(v) * c * 0.4, 30, 30, 30);
    }
  } else if (d === 'forum') {
    let M = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshStandardMaterial({
        color: 10469592,
        roughness: 0.05,
        metalness: 0.85,
        transparent: !0,
        opacity: 0.85,
      }),
    );
    M.scale.set(u * 0.48, 30, 14);
    let [y, _] = o(0, -c * 0.22);
    (M.position.set(y, 28, _),
      (M.rotation.y = -h),
      R.scene.add(M),
      LM.meshes.push(M),
      m(e, 13157560, 0, -c * 0.22, 0, u * 0.9, 6, 22),
      m(t, [0.75, 0.74, 0.7], 0, c * 0.25, 0, u * 0.85, 34, 36),
      g(0, -c * 0.22, u * 0.95, 26, 58),
      g(0, c * 0.25, u * 0.85, 36, 34));
  } else if (d === 'zojoji') {
    m(e, 11740702, 0, c / 2 - 12, 0, 22, 9, 10);
    let [M, y] = o(0, c / 2 - 12);
    (e.setColor(2829358).gable(M, 9, y, 26, 14, 4, h),
      e.setColor(11740702).box(M, 13, y, 18, 5, 8, h, {}),
      e.setColor(2829358).gable(M, 18, y, 24, 13, 5, h),
      m(e, 9071178, 0, -12, 0, 50, 12, 32));
    let [_, v] = o(0, -12);
    (e.setColor(2829358).gable(_, 12, v, 58, 40, 12, h), g(0, c / 2 - 12, 22, 10, 23), g(0, -12, 50, 32, 24));
  } else if (d === 'honganji') {
    m(e, 13616302, 0, 0, 0, 70, 18, 44);
    for (let M of [-24, 0, 24]) {
      let [y, _] = o(M, 0);
      e.setColor(12103062).ell(y, 18, _, M ? 6 : 12, M ? 7 : 14, M ? 6 : 12, 12, 6, 0.5, 1);
    }
    g(0, 0, 70, 44, 32);
  } else if (d === 'yasukuni') {
    let [M, y] = o(0, c / 2 - 10);
    for (let b of [-1, 1]) {
      let [w, E] = o(b * 9, c / 2 - 10);
      (e.setColor(8027778).cyl(w, 0, E, 1.2, 25, 12, !0), io(w, E, 2.4, 2.4, 25));
    }
    (e.setColor(8027778).box(M, 22.5, y, 26, 1.6, 1.8, h, {}),
      e.setColor(8027778).box(M, 25, y, 30, 1.4, 2.2, h, {}),
      m(e, 13156528, 0, 0, 0.05, 8, 0.05, c * 0.9),
      m(e, 15261900, 0, -c / 2 + 18, 0, 34, 8, 20));
    let [_, v] = o(0, -c / 2 + 18);
    (e.setColor(7035461).gable(_, 8, v, 40, 26, 8, h), g(0, -c / 2 + 18, 34, 20, 16));
  } else if (d === 'geihinkan') {
    m(e, 15262420, 0, -c * 0.2, 0, u * 0.7, 18, 26);
    for (let b of [-1, 1]) m(e, 15262420, b * u * 0.32, 0, 0, 22, 16, c * 0.6);
    let [M, y] = o(0, -c * 0.2);
    e.setColor(5929578).gable(M, 18, y, u * 0.72, 28, 6, h);
    let [_, v] = o(0, c * 0.25);
    (e.setColor(13159632).cyl(_, 0, v, 7, 0.8, 24, !0), i.setColor(7319776).cyl(_, 0.8, v, 6.4, 0.05, 24, !0), g(0, -c * 0.2, u * 0.7, 26, 24));
    for (let b of [-1, 1]) g(b * u * 0.32, 0, 22, c * 0.6, 16);
  } else if (d === 'tnm') {
    m(e, 13617336, 0, -c * 0.15, 0, u * 0.8, 16, 40);
    let [M, y] = o(0, -c * 0.15);
    (e.setColor(4869198).gable(M, 16, y, u * 0.85, 48, 10, h),
      e.setColor(4869198).gable(M, 20, y, 30, 30, 8, h),
      m(e, 8034922, 0, c * 0.25, 0.08, 40, 0.05, 30),
      g(0, -c * 0.15, u * 0.8, 40, 26));
  } else if (d === 'miraikan') {
    m(t, [0.7, 0.76, 0.8], 0, 0, 0, u * 0.85, 30, c * 0.7);
    let M = new THREE.Mesh(
        new THREE.SphereGeometry(7, 32, 20),
        new THREE.MeshStandardMaterial({
          color: 3828400,
          emissive: 2775712,
          emissiveIntensity: 0.6,
        }),
      ),
      [y, _] = o(0, c * 0.36 + 1);
    (M.position.set(y, 22, _), R.scene.add(M), LM.meshes.push(M), LM.emissive.push([M.material, 1.4, 0.6]), g(0, 0, u * 0.85, c * 0.7, 30));
  } else if (d === 'nact') {
    let M = new Mt({
      color: !0,
    });
    for (let y = 0; y < 40; y++) {
      let _ = -u * 0.45 + (y / 40) * u * 0.9,
        v = -u * 0.45 + ((y + 1) / 40) * u * 0.9,
        b = c * 0.3 + Math.sin((y / 40) * Math.PI * 3) * 6,
        w = c * 0.3 + Math.sin(((y + 1) / 40) * Math.PI * 3) * 6,
        [E, C] = o(_, b),
        [S, T] = o(v, w);
      (M.setColor(6262704).quad([E, 0, C], [S, 0, T], [S, 22, T], [E, 22, C], null), M.quad([S, 0, T], [E, 0, C], [E, 22, C], [S, 22, T], null));
    }
    (R.scene.add(
      new THREE.Mesh(
        M.build(),
        new THREE.MeshStandardMaterial({
          vertexColors: !0,
          roughness: 0.08,
          metalness: 0.8,
          side: THREE.DoubleSide,
        }),
      ),
    ),
      m(t, [0.8, 0.8, 0.78], 0, -c * 0.1, 0, u * 0.9, 22, c * 0.6),
      g(0, 0, u * 0.9, c * 0.8, 22));
  } else if (d === 'seiroka') {
    for (let [M, y] of [
      [-14, 220],
      [14, 175],
    ]) {
      let [_, v] = o(M, 0);
      (t.setColor([0.78, 0.76, 0.72]),
        (t.bv = [4, 17, 4, 0.55]),
        t.box(_, 0, v, 22, y, 22, h, {}),
        e.setColor(9080466).cyl(_, y, v, 0.6, 18, 6, !0),
        io(_, v, 22, 22, y, h));
    }
    m(e, 10133670, 0, 0, 120, 8, 3, 4);
  } else if (d === 'jingu') {
    let M = Math.min(u, c) * 0.5 - 6;
    m(e, 5212730, 0, 0, 0.08, u * 0.9, 0.05, c * 0.9);
    for (let w = 0; w < 28; w++) {
      let E = -Math.PI * 0.25 + (w / 27) * Math.PI * 1.5,
        C = Math.cos(E) * M,
        S = Math.sin(E) * M,
        [T, D] = o(C, S),
        O = h + E + Math.PI / 2;
      for (let U = 0; U < 4; U++) {
        let B = M - 2 - U * 4,
          [R, k] = o(Math.cos(E) * B, Math.sin(E) * B);
        e.setColor(U % 2 ? 1915514 : 2771594).box(R, 0, k, 7.2, 3 + (3 - U) * 3, 4, O, {});
      }
      (e.setColor(14211284).box(T, 0, D, 7.4, 16, 1.2, O, {}), io(T, D, 8, 16, 16, O));
    }
    let [y, _] = o(0, -M * 0.45);
    (e.setColor(9071178).box(y, 0.1, _, 30, 0.05, 30, h + Math.PI / 4, {}), e.setColor(5212730).box(y, 0.15, _, 20, 0.05, 20, h + Math.PI / 4, {}));
    for (let [w, E] of [
      [0, -14],
      [14, 0],
      [0, 14],
      [-14, 0],
    ]) {
      let C = Math.cos(h + Math.PI / 4),
        S = Math.sin(h + Math.PI / 4);
      i.setColor(16777215).box(y + C * w - S * E, 0.2, _ + S * w + C * E, 0.6, 0.08, 0.6, h, {});
    }
    for (let w = 0; w < 6; w++) {
      let E = -Math.PI * 0.2 + (w / 5) * Math.PI * 1.4,
        [C, S] = o(Math.cos(E) * (M + 4), Math.sin(E) * (M + 4));
      (e.setColor(10133670).box(C, 0, S, 1.2, 38, 1.2, h, {}),
        i.setColor(16775400).box(C, 38, S, 6, 3, 1, h + E + Math.PI / 2, {}),
        io(C, S, 1.4, 1.4, 41));
    }
    let [v, b] = o(0, M * 0.62);
    (i.setColor(1063456).box(v, 14, b, 26, 9, 0.6, h, {}), e.setColor(2763306).box(v, 0, b, 1.5, 14, 1.5, h, {}));
  } else if (d === 'kaigakan') {
    (m(e, 13616302, 0, 0, 0, u * 0.95, 13, c * 0.7), m(e, 12432028, 0, 0, 0, 26, 18, c * 0.78));
    let M = new THREE.Mesh(
      new THREE.SphereGeometry(10, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 6982266,
        roughness: 0.5,
        metalness: 0.3,
      }),
    );
    (M.position.set(l, 24, f), R.scene.add(M), LM.meshes.push(M), e.setColor(12432028).cyl(l, 18, f, 10.5, 6, 20));
    for (let v = -4; v <= 4; v++) m(e, 14867147, v * 2.6, c * 0.39, 0, 0.9, 11, 0.9);
    g(0, 0, u * 0.95, c * 0.78, 34);
    let [y, _] = o(0, c / 2 + 18);
    (e.setColor(12104356).box(y, 0, _, 40, 0.5, 14, h, {}), i.setColor(5937864).box(y, 0.5, _, 38, 0.02, 12, h, {}));
  } else if (d === 'liberty')
    (e.setColor(9077880).box(l, 0, f, 6, 4, 6, 0, {}),
      e.setColor(6989198).tube(l, 4, f, 1.4, 1.4, 0.9, 0.9, 7, 10, !0),
      e.setColor(6989198).ell(l, 11.8, f, 0.9, 1.1, 0.9, 10, 6),
      e.setColor(6989198).box(l + 0.9, 11, f, 0.4, 3.8, 0.4, 0, {}),
      e.setColor(14202186).cyl(l + 0.9, 12.9, f, 0.35, 0.8, 8, !0),
      io(l, f, 6, 6, 13));
  else if (d === 'toyosuMkt') {
    for (let M of [-u * 0.25, u * 0.25]) (m(e, 15263972, M, 0, 0, u * 0.45, 22, c * 0.8), g(M, 0, u * 0.45, c * 0.8, 22));
    for (let M = 0; M < 6; M++) m(i, 10473727, -u * 0.45 + M * u * 0.18, c * 0.4 + 0.1, 12, u * 0.12, 6, 0.05);
  } else (m(t, [0.75, 0.75, 0.73], 0, 0, 0, u * 0.8, 20, c * 0.8), g(0, 0, u * 0.8, c * 0.8, 20));
}
var To = [],
  Vf = [],
  y3 = [],
  Ci = (n, t) => fe(n, t);
var An = (n, t) => {
  let e = Math.sin(n * 12.9898 + t * 78.233) * 43758.5453;
  return e - Math.floor(e);
};
function Cn(n, t, e, i, s, o = 0, r = 0) {
  W.lmCol.push({
    x: n,
    z: t,
    w: e,
    d: i,
    h: s,
    rot: o,
    y0: r,
    rad: Math.hypot(e, i) / 2,
  });
}
var g3 = new Map();
function Kr(n, t, e, i) {
  let s = n + t + e + i;
  if (g3.has(s)) return g3.get(s);
  let [o, r] = Ne(320, 80);
  (r.scale(0.625, 0.625), (r.fillStyle = e), r.fillRect(0, 0, 512, 128), (r.fillStyle = i), (r.textAlign = 'center'), (r.textBaseline = 'middle'));
  let a = 56;
  for (r.font = `900 ${a}px ${ce}`; r.measureText(n).width > 490 && a > 16;) ((a -= 3), (r.font = `900 ${a}px ${ce}`));
  (r.fillText(n, 256, t ? 50 : 64), t && ((r.font = `700 22px ${ce}`), r.fillText(t, 256, 104)));
  let l = Fe(o, {
      rep: !1,
    }),
    f = new THREE.MeshStandardMaterial({
      map: l,
      emissive: 16777215,
      emissiveMap: l,
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
    });
  return (LM.emissive.push([f, 0.8, 0.25]), g3.set(s, f), f);
}
function jr(n, t, e, i, s, o, r) {
  let a = new THREE.Mesh(new THREE.PlaneGeometry(t, e), n);
  return (a.position.set(i, s, o), (a.rotation.y = r), R.scene.add(a), LM.meshes.push(a), a);
}
function l1(n, t, e, i = 1, s) {
  let o = 3 * i;
  (n.wood.setColor(5981750).cyl(t, 0, e, 0.2 * i, o, 6, !1),
    n.leaf.setColor(s ?? [4156206, 4946483, 3563306, 5603128][Math.floor(An(t, e) * 4)]).ell(t, o + 1.4 * i, e, 2.1 * i, 1.9 * i, 2.1 * i, 7, 5),
    addProp(t, e, 0.3 * i, o));
}
function mC(n, t, e, i = 1) {
  let s = 2.6 * i;
  n.wood.setColor(4864556).cyl(t, 0, e, 0.22 * i, s + 1.2 * i, 6, !1);
  let o = 2770470;
  for (let r = 0; r < 3; r++)
    n.leaf
      .setColor(o)
      .ell(
        t + (An(t + r, e) - 0.5) * 1.6 * i,
        s + r * 0.9 * i,
        e + (An(e, t + r) - 0.5) * 1.6 * i,
        (2.4 - r * 0.5) * i,
        0.55 * i,
        (2.2 - r * 0.5) * i,
        8,
        4,
      );
  addProp(t, e, 0.3 * i, s);
}
function xC(n, t, e) {
  n.wood.setColor(5917242).cyl(t, 0, e, 0.26, 3.2, 6, !1);
  let s = [15254058, 14463518, 15780922, 13154362][Math.floor(An(t, e) * 4)];
  (n.leaf.setColor(s).ell(t, 3.2 + 3.4, e, 2.5, 4.8, 2.5, 8, 6), addProp(t, e, 0.35, 3.2));
}
function b3(n, t, e, i) {
  let s = Math.cos(i),
    o = Math.sin(i);
  (n.wood.setColor(9067058).box(t, 0.42, e, 1.8, 0.08, 0.5, -i, {}), n.wood.box(t - o * -0.22, 0.5, e + s * -0.22, 1.8, 0.45, 0.06, -i, {}));
  for (let r of [-0.75, 0.75]) n.metal.setColor(3816770).box(t + s * r, 0, e - o * r, 0.08, 0.42, 0.5, -i, {});
}
function gC(n, t, e) {
  (n.metal.setColor(3093046).cyl(t, 0, e, 0.08, 3.8, 6, !1), n.glow.setColor(16773576).ell(t, 4, e, 0.32, 0.32, 0.32, 8, 5), addProp(t, e, 0.15, 4));
}
function r1(n, t, e, i, s, o, r = 9071176, a = null) {
  let l = 4.4 * o,
    f = 10 * o,
    u = 0.5 * o,
    c = Math.atan2(s, i);
  for (let h of [-1, 1]) {
    let d = t + i * l * h,
      p = e + s * l * h;
    (n.wood.setColor(r).cyl(d, 0, p, u, f, 12), n.stone.setColor(3815994).cyl(d, 0, p, u * 1.25, 0.8 * o, 12), Cn(d, p, u * 2, u * 2, f));
  }
  (n.wood.setColor(a ?? r).box(t, f, e, l * 2 + 3.4 * o, 0.75 * o, 1.1 * o, c, {}),
    n.wood.setColor(r).box(t, f - 0.4 * o, e, l * 2 + 2.6 * o, 0.4 * o, 0.9 * o, c, {}),
    n.wood.box(t, f - 2.2 * o, e, l * 2 + 1 * o, 0.55 * o, 0.6 * o, c, {}));
}
function M3(n, t, e, i, s = 1) {
  (n.stone.setColor(9275258).box(t, 0, e, 20 * s, 6 * s, 15 * s, i, {}),
    n.white.setColor(15855592).box(t, 6 * s, e, 15 * s, 5 * s, 10 * s, i, {}),
    n.roof.setColor(5002328).gable(t, 11 * s, e, 18 * s, 13 * s, 3 * s, i),
    n.white.setColor(15855592).box(t, 12.4 * s, e, 9 * s, 3.6 * s, 6.5 * s, i, {}),
    n.roof.setColor(5002328).gable(t, 16 * s, e, 11.5 * s, 9 * s, 2.6 * s, i),
    Cn(t, e, 20 * s, 15 * s, 19 * s, i));
}
function ar(n, t, e, i) {
  n.setColor(i);
  for (let s = 1; s + 1 < t.length; s++) n.tri([t[0][0], e, t[0][1]], [t[s + 1][0], e, t[s + 1][1]], [t[s][0], e, t[s][1]], [0, 1, 0]);
}
function Yr(n, t, e, i, s, o, r, a) {
  let l = i - t,
    f = s - e,
    u = Math.hypot(l, f) || 1,
    c = ((-f / u) * o) / 2,
    h = ((l / u) * o) / 2;
  n.setColor(a).quad([t - c, r, e - h], [t + c, r, e + h], [i + c, r, s + h], [i - c, r, s - h], [0, 1, 0]);
}
function MC(n) {
  let t = yp.map((v) => Ci(v[0], v[1])),
    e = t.length,
    i = gp.map((v) => Ci(v[0], v[1])),
    [s] = Ci(35.68, 139.7575);
  for (let v = 0; v < e; v++) {
    let b = t[v],
      w = t[(v + 1) % e],
      E = w[0] - b[0],
      C = w[1] - b[1],
      S = Math.hypot(E, C),
      T = Math.atan2(C, E),
      D = (b[0] + w[0]) / 2,
      O = (b[1] + w[1]) / 2,
      U = D > s;
    for (let B = 0; B < Math.ceil(S / 60); B++) {
      let R = B / Math.ceil(S / 60),
        k = (B + 1) / Math.ceil(S / 60),
        P = b[0] + (E * (R + k)) / 2,
        H = b[1] + (C * (R + k)) / 2;
      n.stone.setColor(B % 2 ? 9275258 : 8748914).box(P, -2.5, H, S / Math.ceil(S / 60) + 0.5, U ? 3.4 : 8.5, 3.4, T, {});
    }
  }
  let o = Mp.map((v) => Ci(v[0], v[1]));
  for (let v = 0; v + 1 < o.length; v++) {
    let b = o[v],
      w = o[v + 1],
      E = w[0] - b[0],
      C = w[1] - b[1],
      S = Math.hypot(E, C),
      T = -C / S,
      D = E / S,
      O = Math.atan2(C, E);
    for (let U of [-1, 1]) {
      let B = T * U * 17.5,
        R = D * U * 17.5,
        k = b[0] + B < b[0];
      n.stone.setColor(k ? 9275258 : 10130568).box((b[0] + w[0]) / 2 + B, -2.5, (b[1] + w[1]) / 2 + R, S + 4, k ? 9.5 : 3.3, 3, O, {});
    }
  }
  let [r, a] = Ci(35.6797, 139.7555),
    l = o[1],
    f = o[3],
    u = f[0] - l[0],
    c = f[1] - l[1],
    h = Math.hypot(u, c),
    d = c / h,
    p = -u / h,
    x = Math.atan2(p, d),
    m = -p,
    g = d;
  n.stone.setColor(12104356).box(r, 0.9, a, 46, 0.9, 8.5, x, {});
  for (let v of [-1, 1]) n.stone.setColor(12893872).box(r + m * v * 4, 1.8, a + g * v * 4, 46, 0.9, 0.5, x, {});
  for (let v of [-14, 0, 14]) n.stone.setColor(10788496).box(r + d * v, -3, a + p * v, 3, 4, 8.4, x, {});
  let M = new THREE.MeshStandardMaterial({
    color: 11578012,
    roughness: 0.9,
  });
  for (let v of [-7, 7])
    for (let b of [-1, 1]) {
      let w = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.9, 6, 18, Math.PI), M);
      (w.position.set(r + d * v + m * b * 4.1, -4.4, a + p * v + g * b * 4.1), (w.rotation.y = -x), R.scene.add(w), LM.meshes.push(w));
    }
  for (let v of [-22, 22])
    for (let b of [-1, 1]) {
      let w = r + d * v + m * b * 4,
        E = a + p * v + g * b * 4;
      n.metal.setColor(2237480).cyl(w, 2.2, E, 0.14, 3.6, 8, !1);
      for (let C of [
        [0, 0],
        [0.45, 0],
        [-0.45, 0],
        [0, 0.45],
        [0, -0.45],
      ])
        n.glow.setColor(16773576).ell(w + C[0], 5.9 + (C[0] || C[1] ? -0.3 : 0.2), E + C[1], 0.26, 0.3, 0.26, 8, 5);
    }
  let [y, _] = [r + d * 32, a + p * 32];
  (To.push({
    x: y,
    z: _,
    type: 'view',
    label: '\u4E8C\u91CD\u6A4B',
    act: '\u4E8C\u91CD\u6A4B\u3092\u773A\u3081\u308B\uFF08\u8A18\u5FF5\u64AE\u5F71\uFF09',
  }),
    jr(Kr('\u7687\u5C45\u5916\u82D1', 'KOKYO GAIEN', '#2a2a2a', '#f2e6c8'), 4, 1, y + d * 6 + m * 8, 1.6, _ + p * 6 + g * 8, Math.atan2(-d, -p)),
    M3(n, ...Ci(35.6808, 139.7531), x, 1),
    M3(n, ...Ci(35.6842, 139.7553), x + 0.4, 0.9),
    M3(n, ...Ci(35.6776, 139.7537), x - 0.3, 0.85));
  {
    let [v, b] = Ci(35.6828, 139.7506);
    (n.white.setColor(14209216).box(v, 0, b, 100, 8, 28, 0, {}),
      n.roof.setColor(6130298).prism(v, 8, 12, b, 54, 46, 17, -17, 6, -6),
      Cn(v, b, 100, 28, 12));
    for (let w of [-1, 1])
      (n.white.setColor(14209216).box(v + w * 62, 0, b + 18, 26, 7, 70, 0, {}),
        n.roof.setColor(6130298).prism(v + w * 62, 7, 10.5, b + 18, 16, 6, 38, -38, 30, -30),
        Cn(v + w * 62, b + 18, 26, 70, 10.5));
    (ar(
      n.ground,
      [
        [v - 48, b + 16],
        [v + 48, b + 16],
        [v + 48, b + 56],
        [v - 48, b + 56],
      ],
      0.07,
      14209732,
    ),
      treeFree(v, b + 20, 75));
  }
  (treeFreePoly(i), Yr(n.ground, r + d * 22, a + p * 22, r + d * 160, a + p * 160, 34, 0.06, 14077885));
  {
    let [v, b] = Ci(35.6842, 139.7592),
      [w, E] = Ci(35.677, 139.757);
    Yr(n.ground, v, b, w, E, 26, 0.055, 14077885);
  }
  for (let v = Math.min(...i.map((b) => b[0])); v < Math.max(...i.map((b) => b[0])); v += 17)
    for (let b = Math.min(...i.map((w) => w[1])); b < Math.max(...i.map((w) => w[1])); b += 17) {
      let w = v + (An(v, b) - 0.5) * 9,
        E = b + (An(b, v) - 0.5) * 9;
      if (!inPoly(w, E, i) || maskQ(w, E) !== M_PARK || roadsNear(w, E, 8, []).length) continue;
      let C = (w - r) * d + (E - a) * p,
        S = Math.abs((w - r) * m + (E - a) * g);
      (C > 15 && S < 22) || An(w * 3, E) < 0.35 || mC(n, w, E, 1 + An(E, w) * 0.5);
    }
  {
    let [v, b] = Ci(35.6786, 139.7578);
    (n.stone.setColor(10130568).box(v, 0, b, 6, 3.4, 8, x, {}), Cn(v, b, 6, 8, 9, x));
    let w = 4864552;
    n.metal.setColor(w).box(v, 5, b, 1.4, 1.6, 3.4, x, {});
    for (let [E, C] of [
      [-1.2, -0.5],
      [-1.2, 0.5],
      [1.2, -0.5],
      [1.2, 0.5],
    ])
      n.metal.box(v + d * E + m * C, 3.4, b + p * E + g * C, 0.3, 1.7, 0.3, x, {});
    (n.metal.box(v + d * 2, 6.2, b + p * 2, 0.9, 1.6, 0.7, x, {}),
      n.metal.box(v - d * 0.3, 6.6, b - p * 0.3, 0.8, 1.6, 0.7, x, {}),
      n.metal.setColor(w).ell(v - d * 0.3, 7.7, b - p * 0.3, 0.32, 0.36, 0.32, 8, 5),
      treeFree(v, b, 10));
  }
}
function yC(n) {
  let t = [
      [35.6701, 139.7017],
      [35.6711, 139.7005],
      [35.6726, 139.6995],
      [35.674, 139.6989],
      [35.6752, 139.6991],
    ].map((l) => Ci(l[0], l[1])),
    [e, i] = Ci(35.6764, 139.6993);
  for (let l = 0; l + 1 < t.length; l++) {
    let [f, u] = t[l],
      [c, h] = t[l + 1];
    Yr(n.ground, f, u, c, h, 13, 0.06, 13814196);
    let d = Math.hypot(c - f, h - u);
    for (let p = 0; p <= d; p += 8) treeFree(f + ((c - f) * p) / d, u + ((h - u) * p) / d, 10);
  }
  Yr(n.ground, t[4][0], t[4][1], e, i + 50, 13, 0.06, 13814196);
  let s = (l) => {
    let f = t[Math.max(0, l - 1)],
      u = t[Math.min(t.length - 1, l + 1)],
      c = u[0] - f[0],
      h = u[1] - f[1],
      d = Math.hypot(c, h);
    return [-h / d, c / d];
  };
  (r1(n, t[0][0], t[0][1], ...s(0), 1),
    r1(n, t[2][0], t[2][1], ...s(2), 1.25),
    r1(n, t[4][0], t[4][1], ...s(4), 0.95),
    jr(Kr('\u660E\u6CBB\u795E\u5BAE', 'MEIJI JINGU', '#3a2e22', '#f2e6c8'), 3.6, 0.9, t[0][0] + 4, 1.4, t[0][1] + 8, 0.6));
  {
    let [l, f] = t[1],
      [u, c] = t[2],
      h = u - l,
      d = c - f,
      p = Math.hypot(h, d),
      x = h / p,
      m = d / p,
      g = -m,
      M = x,
      y = l + h * 0.4 + g * 10,
      _ = f + d * 0.4 + M * 10,
      v = Math.atan2(m, x);
    (n.wood.setColor(5916214).box(y, 0, _, 24, 0.5, 2.2, v, {}), Cn(y, _, 24, 2.2, 4, v));
    for (let b = 0; b < 3; b++)
      for (let w = 0; w < 18; w++) {
        let E = -11 + w * 1.3,
          C = y + x * E,
          S = _ + m * E,
          T = 0.5 + b * 1.05;
        (n.white.setColor(15921126).cyl(C, T, S, 0.6, 1, 10),
          n.paint.setColor([13111342, 1915530, 13214522, 1710618, 2779706][(w * 3 + b) % 5]).cyl(C, T + 0.35, S, 0.62, 0.32, 10));
      }
  }
  let o = 120,
    r = 100;
  (treeFreePoly([
    [e - o / 2 - 8, i - r / 2 - 8],
    [e + o / 2 + 8, i - r / 2 - 8],
    [e + o / 2 + 8, i + r / 2 + 8],
    [e - o / 2 - 8, i + r / 2 + 8],
  ]),
    ar(
      n.ground,
      [
        [e - o / 2, i - r / 2],
        [e + o / 2, i - r / 2],
        [e + o / 2, i + r / 2],
        [e - o / 2, i + r / 2],
      ],
      0.065,
      14538438,
    ));
  let a = (l, f, u, c) => {
    let h = Math.hypot(u - l, c - f),
      d = Math.atan2(c - f, u - l),
      p = (l + u) / 2,
      x = (f + c) / 2;
    (n.wood.setColor(8018494).box(p, 0, x, h, 4.4, 4, d, {}), n.roof.setColor(5209966).box(p, 4.4, x, h + 1, 0.9, 6, d, {}), Cn(p, x, h, 4, 5.3, d));
  };
  (a(e - o / 2, i - r / 2, e + o / 2, i - r / 2),
    a(e - o / 2, i - r / 2, e - o / 2, i + r / 2),
    a(e + o / 2, i - r / 2, e + o / 2, i + r / 2),
    a(e - o / 2, i + r / 2, e - 9, i + r / 2),
    a(e + 9, i + r / 2, e + o / 2, i + r / 2));
  for (let l of [-6, 6])
    for (let f of [-3, 3]) (n.wood.setColor(8018494).cyl(e + l, 0, i + r / 2 + f, 0.45, 6.5, 10), Cn(e + l, i + r / 2 + f, 0.9, 0.9, 6.5));
  (n.roof.setColor(5209966).prism(e, 6.5, 10, i + r / 2, 11, 7, 6, -6, 1.5, -1.5),
    n.wood.setColor(8018494).box(e, 0.4, i - 8, 36, 7, 15, 0, {}),
    n.stone.setColor(12104356).box(e, 0, i - 8, 40, 0.4, 19, 0, {}),
    n.roof.setColor(5209966).prism(e, 7.4, 14, i - 8, 23, 15, 11, -11, 1.5, -1.5),
    Cn(e, i - 8, 40, 19, 14),
    n.wood.setColor(6965808).box(e, 0.4, i - 34, 28, 7, 12, 0, {}),
    n.roof.setColor(5209966).prism(e, 7.4, 13, i - 34, 18, 11, 9, -9, 1, -1),
    Cn(e, i - 34, 30, 14, 13));
  for (let l of [-1, 1]) {
    n.wood.setColor(4864554).cyl(e + l * 26, 0, i + 22, 0.9, 6, 8, !1);
    for (let f = 0; f < 3; f++) n.leaf.setColor(3103274).ell(e + l * 26 + (f - 1) * 2.4, 9 + f * 0.8, i + 22 + (f % 2) * 2, 6 - f, 4, 6 - f, 9, 6);
    Cn(e + l * 26, i + 22, 1.8, 1.8, 9);
  }
  (n.wood.setColor(5913122).box(e, 0, i + 1.5, 4, 1, 1.4, 0, {}),
    Cn(e, i + 1.5, 4, 1.4, 1),
    To.push({
      x: e,
      z: i + 4.2,
      type: 'omairi',
      label: '\u660E\u6CBB\u795E\u5BAE',
      act: '\u660E\u6CBB\u795E\u5BAE\u306B\u304A\u53C2\u308A\u3059\u308B\uFF08\u8CFD\u92AD \xA5100\u30FB\u304A\u307F\u304F\u3058\uFF09',
      big: !0,
    }));
}
function bC(n) {
  let t = W.edges.filter((s) => W.roadNames[s.road] === '\u3044\u3061\u3087\u3046\u4E26\u6728'),
    e = null,
    i = 0;
  for (let s of t)
    for (let o = 6; o < s.len - 6; o += 9) {
      let r = edgePos(s, o, {});
      e || (e = r);
      for (let a of [-1, 1])
        for (let l of [s.hw + 2.4, s.hw + 7]) {
          let f = r.x + r.dz * l * a,
            u = r.z - r.dx * l * a;
          roadsNear(f, u, 4, []).some((h) => h.e !== s && h.d < h.e.hw + 1) || (xC(n, f, u), i++);
        }
    }
  return (
    e &&
      jr(
        Kr('\u795E\u5BAE\u5916\u82D1 \u3044\u3061\u3087\u3046\u4E26\u6728', 'JINGU GAIEN', '#2a2a2a', '#f2c230'),
        4.4,
        1.1,
        e.x + e.dz * 10,
        1.8,
        e.z - e.dx * 10,
        Math.atan2(-e.dx, -e.dz),
      ),
    i
  );
}
function vC(n) {
  let [t, e] = Ci(35.6764, 139.6993);
  for (let i of bp) {
    let s = i.p.map((u) => Ci(u[0], u[1])),
      o = 0,
      r = 0,
      a = 0;
    for (let u = 0, c = s.length - 1; u < s.length; c = u++) {
      let h = s[c][0] * s[u][1] - s[u][0] * s[c][1];
      ((o += h), (r += (s[c][0] + s[u][0]) * h), (a += (s[c][1] + s[u][1]) * h));
    }
    ((o /= 2), (r /= 6 * o), (a /= 6 * o), (o = Math.abs(o)), i.forest && ((r = t - 398), (a = e + 521)));
    let l = (u, c) =>
        (i.forest || inPoly(u, c, s)) && (maskQ(u, c) === M_PARK || maskQ(u, c) === M_FOREST) && !roadsNear(u, c, 5, []).length && !treeBlocked(u, c),
      f = Math.sqrt(o) * (i.forest ? 0.35 : 0.55);
    for (let [u, c] of [
      [1, 0],
      [0, 1],
    ]) {
      let h = null;
      for (let d = -f; d <= f; d += 3) {
        let p = r + u * d,
          x = a + c * d,
          m = l(p, x);
        (m &&
          (h || (h = [p, x, 0]),
          h[2]++,
          h[2] % 8 === 0 && b3(n, p + c * 3.4, x - u * 3.4, Math.atan2(c, u) + Math.PI / 2),
          h[2] % 11 === 5 && gC(n, p - c * 3.2, x + u * 3.2),
          treeFree(p, x, 4.5)),
          (!m || d + 3 > f) && h && (h[2] > 2 && Yr(n.ground, h[0], h[1], p - u * 3, x - c * 3, 4.5, 0.055, 13616294), (h = null)));
      }
    }
    if (o > 15e3 && l(r, a)) {
      (n.stone.setColor(12104356).cyl(r, 0, a, 8, 0.6, 24),
        n.water.setColor(4884648).disc(r, 0.62, a, 7.2, 24),
        n.stone.setColor(10788496).cyl(r, 0, a, 0.7, 1.8, 10),
        Cn(r, a, 15, 15, 0.7),
        treeFree(r, a, 14));
      let u = new THREE.Mesh(
        new THREE.ConeGeometry(2, 5, 16, 1, !0),
        new THREE.MeshStandardMaterial({
          color: 15398655,
          transparent: !0,
          opacity: 0.45,
          depthWrite: !1,
          roughness: 0.1,
        }),
      );
      (u.position.set(r, 4.2, a), (u.rotation.x = Math.PI), R.scene.add(u), LM.meshes.push(u), y3.push(u));
    }
    if (o > 5e4) {
      let u = Math.min(70, Math.sqrt(o) * 0.13),
        c = null,
        h = null;
      for (let [d, p] of [
        [0.32, 0.3],
        [-0.32, 0.3],
        [0.32, -0.3],
        [-0.32, -0.3],
      ]) {
        let x = r + d * f * 1.4,
          m = a + p * f * 1.4,
          g = !0;
        for (let M = 0; M < 6.28; M += 0.8) l(x + Math.cos(M) * u, m + Math.sin(M) * u * 0.7) || (g = !1);
        if (g) {
          ((c = x), (h = m));
          break;
        }
      }
      if (c !== null) {
        let p = [];
        for (let x = 0; x < 28; x++) {
          let m = (x / 28) * Math.PI * 2,
            g = u * (0.85 + An(x, u) * 0.3);
          p.push([c + Math.cos(m) * g, h + Math.sin(m) * g * 0.7]);
        }
        ar(n.water, [[c, h], ...p, p[0]], 0.08, 4026244);
        for (let x of p) n.stone.setColor(9077880).box(x[0], 0, x[1], 2.2, 0.4, 1.6, Math.atan2(x[1] - h, x[0] - c), {});
        treeFree(c, h, u + 5);
      }
    }
    if (o > 8e3 && o < 26e4)
      for (let [u, c] of [
        [-0.25, -0.28],
        [0.25, 0.28],
        [0.28, -0.25],
      ]) {
        let h = r + u * f * 1.3,
          d = a + c * f * 1.3;
        if (l(h, d) && l(h + 10, d + 8) && l(h - 10, d - 8)) {
          q_(n, h, d, 0, i.n);
          break;
        }
      }
    {
      let u = r + f * 0.45,
        c = a - f * 0.1;
      l(u, c) &&
        (n.white.setColor(14210252).box(u, 0, c, 5, 3, 4, 0, {}),
        n.roof.setColor(5922660).box(u, 3, c, 5.6, 0.3, 4.6, 0, {}),
        Cn(u, c, 5, 4, 3.3),
        treeFree(u, c, 5));
    }
    {
      let u = r,
        c = a;
      for (let h = 0; h < f && l(r, a + h); h += 4) c = a + h;
      (jr(Kr(i.n, 'PARK', '#2f5a2a', '#ffffff'), 3, 0.75, u + 3.5, 1.4, c, 0),
        n.wood.setColor(5916214).box(u + 2.2, 0, c, 0.15, 1.8, 0.15, 0, {}),
        n.wood.box(u + 4.8, 0, c, 0.15, 1.8, 0.15, 0, {}));
    }
  }
}
function q_(n, t, e, i, s) {
  let o = Math.cos(i),
    r = Math.sin(i),
    a = (l, f) => [t + o * l - r * f, e + r * l + o * f];
  (ar(n.ground, [a(-11, -8), a(11, -8), a(11, 8), a(-11, 8)], 0.07, 14207136), treeFree(t, e, 15));
  {
    let [l, f] = a(-6, -4);
    for (let u of [-2.4, 2.4])
      for (let c of [-0.9, 0.9]) {
        let [h, d] = a(-6 + u, -4 + c);
        n.metal.setColor(14172202).cyl(h, 0, d, 0.08, 2.7, 6, !1);
      }
    n.metal.setColor(14172202).box(l, 2.6, f, 5.2, 0.14, 0.14, i, {});
    for (let u of [-1.1, 1.1]) {
      let [c, h] = a(-6 + u, -4);
      (n.metal.setColor(9080726).box(c, 0.75, h, 0.03, 1.85, 0.03, i, {}), n.wood.setColor(2779832).box(c, 0.55, h, 0.6, 0.06, 0.3, i, {}));
    }
    (Cn(l, f, 5.4, 2.2, 2.8, i),
      To.push({
        x: l + o * 0,
        z: f + 2.2,
        type: 'swing',
        label: '\u30D6\u30E9\u30F3\u30B3',
        act: '\u30D6\u30E9\u30F3\u30B3\u3092\u3053\u3050',
      }));
  }
  {
    let [l, f] = a(5, -3.5);
    n.metal.setColor(15909424).box(l - o * 1.6, 0, f - r * 1.6, 1.2, 2.2, 1.2, i, {});
    let [u, c] = a(6.4, -3.5),
      [h, d] = a(10, -3.5);
    (n.paint
      .setColor(3971666)
      .quad(
        [u - r * 0.5, 2.2, c + o * 0.5],
        [u + r * 0.5, 2.2, c - o * 0.5],
        [h + r * 0.5, 0.25, d - o * 0.5],
        [h - r * 0.5, 0.25, d + o * 0.5],
        null,
      ),
      n.paint.quad(
        [h - r * 0.5, 0.25, d + o * 0.5],
        [h + r * 0.5, 0.25, d - o * 0.5],
        [u + r * 0.5, 2.2, c - o * 0.5],
        [u - r * 0.5, 2.2, c + o * 0.5],
        null,
      ),
      Cn(l, f, 5, 1.4, 2.2, i));
  }
  {
    let [l, f] = a(1, 4);
    for (let u = 0; u <= 3; u++)
      for (let c = 0; c <= 3; c++) {
        let [h, d] = a(-0.5 + u * 1, 3 + c * 0 + c * 0.7);
        n.metal.setColor([2783936, 14172202, 15909424][(u + c) % 3]).box(h, 0, d, 0.07, 2.1, 0.07, i, {});
      }
    for (let u of [0.7, 1.4, 2.1]) n.metal.setColor(2783936).box(l, u, f + 0.05, 3.1, 0.06, 2.2, i, {});
    Cn(l, f, 3.2, 2.4, 2.2, i);
  }
  {
    let [l, f] = a(-6, 4.5);
    for (let [u, c, h, d] of [
      [0, -1.6, 3.4, 0.2],
      [0, 1.6, 3.4, 0.2],
      [-1.6, 0, 0.2, 3.4],
      [1.6, 0, 0.2, 3.4],
    ]) {
      let [p, x] = a(-6 + u, 4.5 + c);
      n.wood.setColor(9071178).box(p, 0, x, h, 0.35, d, i, {});
    }
    ar(n.ground, [a(-7.5, 3), a(-4.5, 3), a(-4.5, 6), a(-7.5, 6)], 0.09, 15260856);
  }
  (b3(n, ...a(9, 6), i + Math.PI), l1(n, ...a(-10, 7), 1.1));
}
var V_ = [
  '\u516B\u5E61\u795E\u793E',
  '\u7A32\u8377\u795E\u793E',
  '\u5929\u7956\u795E\u793E',
  '\u6C37\u5DDD\u795E\u793E',
  '\u718A\u91CE\u795E\u793E',
  '\u767D\u5C71\u795E\u793E',
  '\u65E5\u679D\u795E\u793E',
  '\u5929\u795E\u793E',
  '\u8ACF\u8A2A\u795E\u793E',
  '\u5FA1\u5DBD\u795E\u793E',
];
function $_(n, t, e, i) {
  let s = [];
  buildingsNear(n, t, e, s);
  let o = W.bld,
    r = null,
    a = 1e9;
  for (let l of s) {
    let f = l * 9;
    if (o[f + 6] < 1 || o[f + 6] > i || o[f + 3] < 12 || o[f + 4] < 12 || o[f + 3] > 36 || o[f + 4] > 36) continue;
    let u = Math.hypot(o[f] - n, o[f + 1] - t);
    if (u >= a) continue;
    let c = Math.cos(o[f + 2]),
      h = Math.sin(o[f + 2]),
      d = null;
    for (let [p, x, m, g] of [
      [-h, c, o[f + 4] / 2, 0],
      [h, -c, o[f + 4] / 2, Math.PI],
      [c, h, o[f + 3] / 2, -Math.PI / 2],
      [-c, -h, o[f + 3] / 2, Math.PI / 2],
    ])
      if (roadsNear(o[f] + p * (m + 5), o[f + 1] + x * (m + 5), 9, []).some((y) => !y.e.elev)) {
        d = {
          nx: p,
          nz: x,
          ang: g,
        };
        break;
      }
    d &&
      ((a = u),
      (r = {
        k: f,
        x: o[f],
        z: o[f + 1],
        rot: o[f + 2],
        w: o[f + 3],
        d: o[f + 4],
        front: d,
      }));
  }
  return r;
}
function v3(n, t) {
  let e = [];
  buildingsNear(n, t, 90, e);
  let i = W.bld,
    s = 0,
    o = 0;
  for (let r of e) {
    let a = i[r * 9 + 6];
    a > 0 && ((s += a), o++);
  }
  return o < 6 ? 99 : s / o;
}
function a1(n) {
  clearBuilding(n.k);
  let t = W.cleared[W.cleared.length - 1];
  t && (t.done = !1);
}
function _C(n, t, e) {
  let i = t.rot + t.front.ang,
    s = Math.cos(i),
    o = Math.sin(i),
    r = t.front.ang % Math.PI ? t.d : t.w,
    a = t.front.ang % Math.PI ? t.w : t.d,
    l = (g, M) => [t.x + s * g - o * M, t.z + o * g + s * M];
  (ar(n.ground, [l(-r / 2, -a / 2), l(r / 2, -a / 2), l(r / 2, a / 2), l(-r / 2, a / 2)], 0.07, 13156264),
    treeFree(t.x, t.z, Math.max(r, a) / 2 + 2));
  let [f, u] = l(0, a / 2 - 1.5);
  (r1(n, f, u, s, o, 0.42, 14172191, 1710618), Yr(n.ground, ...l(0, a / 2 - 1), ...l(0, -a / 2 + 6), 2.2, 0.085, 12103840));
  let c = Math.min(r * 0.5, 9),
    h = Math.min(a * 0.32, 7),
    [d, p] = l(0, -a / 2 + h / 2 + 1.5);
  (n.stone.setColor(10130568).box(d, 0, p, c + 1, 0.5, h + 1, i, {}),
    n.wood.setColor(8018494).box(d, 0.5, p, c, 2.8, h, i, {}),
    n.roof.setColor(An(t.x, t.z) < 0.5 ? 5209966 : 4080712).gable(d, 3.3, p, c + 2.4, h + 2.2, 2.2, i),
    Cn(d, p, c + 1, h + 1, 5.5, i));
  {
    let [g, M] = l(0, -a / 2 + h + 2.6);
    n.wood.setColor(5913122).box(g, 0, M, 1.6, 0.8, 0.8, i, {});
  }
  for (let g of [-1, 1]) {
    let [M, y] = l(g * 2.2, -a / 2 + h + 5);
    (n.stone.setColor(10130568).box(M, 0, y, 0.7, 0.9, 0.7, i, {}), n.stone.setColor(11051668).ell(M, 1.25, y, 0.38, 0.45, 0.42, 7, 5));
    let [_, v] = l(g * 3.2, a / 2 - 4);
    (n.stone.setColor(10788496).box(_, 0, v, 0.5, 1.2, 0.5, i, {}),
      n.stone.box(_, 1.2, v, 0.9, 0.5, 0.9, i, {}),
      n.glow.setColor(16767136).box(_, 1.25, v, 0.42, 0.35, 0.42, i, {}),
      n.stone.setColor(6973022).box(_, 1.7, v, 1.1, 0.25, 1.1, i, {}),
      addProp(_, v, 0.5, 2));
  }
  for (let [g, M] of [
    [-r / 2 + 2.5, -a / 2 + 2.5],
    [r / 2 - 2.5, -a / 2 + 2.5],
    [-r / 2 + 2.2, a / 2 - 6],
  ]) {
    let [y, _] = l(g, M);
    l1(n, y, _, 1.3, 3101991);
  }
  let [x, m] = l(0, -a / 2 + h + 4.2);
  if (
    (To.push({
      x,
      z: m,
      type: 'omairi',
      label: e,
      act: `${e}\u306B\u304A\u53C2\u308A\u3059\u308B\uFF08\u8CFD\u92AD \xA5100\u30FB\u304A\u307F\u304F\u3058\uFF09`,
    }),
    Vf.push({
      x: f,
      z: u,
      col: '#d8401f',
      ch: '\u26E9',
      name: e,
      small: !0,
    }),
    An(t.z, t.x) < 0.45)
  ) {
    let [g, M] = l(r / 2 - 2.5, a / 2 - 3.5),
      y = [15245392, 5921374, 15921386, 2763306][Math.floor(An(g, M) * 4)];
    (n.paint.setColor(y).ell(g, 0.25, M, 0.28, 0.2, 0.4, 7, 5), n.paint.setColor(y).ell(g + o * 0, 0.48, M - 0.32, 0.17, 0.16, 0.16, 7, 5));
    for (let _ of [-0.08, 0.08]) n.paint.setColor(y).box(g + _, 0.6, M - 0.33, 0.06, 0.1, 0.04, 0, {});
    To.push({
      x: g,
      z: M,
      type: 'cat',
      label: '\u732B',
      act: '\u732B\u3092\u306A\u3067\u308B',
    });
  }
}
function wC(n) {
  let t = xn.x0,
    e = xn.x1,
    i = xn.z0,
    s = xn.z1,
    o = 0,
    r = 0,
    a = R.qName === 'low' ? 900 : 760;
  for (let l = t; l < e; l += a)
    for (let f = i; f < s; f += a) {
      let u = An(l * 0.013, f * 0.017),
        c = l + (An(f, l) - 0.5) * 300,
        h = f + (An(l + 7, f) - 0.5) * 300;
      if (
        u > 0.82 ||
        maskQ(c, h) !== M_LAND ||
        (W.sites || []).some((x) => Math.hypot(x.x - c, x.z - h) < Math.max(x.w, x.d) / 2 + 80) ||
        W.stations.some((x) => Math.hypot(x.x - c, x.z - h) < 110) ||
        v3(c, h) > 15
      )
        continue;
      let p = $_(c, h, 110, 14);
      if (p)
        if (u < 0.42) (a1(p), _C(n, p, V_[Math.floor(An(c, h * 3) * V_.length)]), o++);
        else {
          a1(p);
          let x = p.rot + p.front.ang,
            m = districtAt(p.x, p.z).n + '\u5150\u7AE5\u904A\u5712';
          (SC(n, p, x, m), r++);
        }
    }
  return [o, r];
}
function SC(n, t, e, i) {
  let s = Math.cos(e),
    o = Math.sin(e),
    r = t.front.ang % Math.PI ? t.d : t.w,
    a = t.front.ang % Math.PI ? t.w : t.d,
    l = (f, u) => [t.x + s * f - o * u, t.z + o * f + s * u];
  for (let [f, u, c, h] of [
    [-r / 2, -a / 2, r / 2, -a / 2],
    [r / 2, -a / 2, r / 2, a / 2],
    [-r / 2, -a / 2, -r / 2, a / 2],
    [-r / 2, a / 2, -2, a / 2],
    [2, a / 2, r / 2, a / 2],
  ]) {
    let [d, p] = l(f, u),
      [x, m] = l(c, h),
      g = Math.hypot(x - d, m - p);
    n.metal.setColor(3963466).box((d + x) / 2, 0, (p + m) / 2, g, 0.9, 0.06, Math.atan2(m - p, x - d), {});
  }
  if (r >= 22 && a >= 16) q_(n, t.x, t.z, e, i);
  else {
    (ar(n.ground, [l(-r / 2, -a / 2), l(r / 2, -a / 2), l(r / 2, a / 2), l(-r / 2, a / 2)], 0.07, 14207136), treeFree(t.x, t.z, Math.max(r, a) / 2));
    let [f, u] = l(-r / 4, -a / 4);
    for (let c of [-1.6, 1.6]) {
      let [h, d] = l(-r / 4 + c, -a / 4);
      n.metal.setColor(14172202).cyl(h, 0, d, 0.07, 2.4, 6, !1);
    }
    (n.metal.setColor(14172202).box(f, 2.35, u, 3.4, 0.12, 0.12, e, {}),
      n.wood.setColor(2779832).box(f, 0.5, u, 0.6, 0.06, 0.3, e, {}),
      Cn(f, u, 3.6, 1, 2.4, e),
      To.push({
        x: f + s * 0 - o * 1.6,
        z: u + o * 0 + s * 1.6,
        type: 'swing',
        label: '\u30D6\u30E9\u30F3\u30B3',
        act: '\u30D6\u30E9\u30F3\u30B3\u3092\u3053\u3050',
      }),
      b3(n, ...l(r / 4, a / 4), e),
      l1(n, ...l(r / 2 - 2, -a / 2 + 2), 1));
  }
  jr(Kr('\u5150\u7AE5\u904A\u5712', '', '#f4f2ec', '#2a5a2a'), 2.4, 0.6, ...((f) => [f[0], 1.3, f[1]])(l(-3.4, a / 2 + 0.1)), Math.atan2(-o, s) + 0);
}
var W_ = [15921902, 1710622, 12106946, 13843247, 2771594, 9080726, 15261896, 3824186];
function EC(n, t, e, i, s) {
  let o = W_[s % W_.length],
    r = Math.cos(i),
    a = Math.sin(i);
  (n.metal.setColor(1447962).box(t, 0, e, 1.6, 0.35, 3.9, i, {
    noTop: !0,
  }),
    n.paint.setColor(o).box(t, 0.3, e, 1.7, 0.72, 4.3, i, {}),
    n.metal.setColor(2238510).box(t - a * 0.25, 1.02, e + r * 0.25, 1.5, 0.55, 2.2, i, {}),
    Cn(t, e, 1.8, 4.4, 1.5, i));
}
function TC(n, t, e) {
  let i = t.rot + t.front.ang,
    s = Math.cos(i),
    o = Math.sin(i),
    r = t.front.ang % Math.PI ? t.d : t.w,
    a = t.front.ang % Math.PI ? t.w : t.d,
    l = (g, M) => [t.x + s * g - o * M, t.z + o * g + s * M];
  (ar(n.ground, [l(-r / 2, -a / 2), l(r / 2, -a / 2), l(r / 2, a / 2), l(-r / 2, a / 2)], 0.07, 4869200), treeFree(t.x, t.z, Math.max(r, a) / 2 + 1));
  let f = Math.max(2, Math.floor((r - 1) / 2.7)),
    u = a >= 22 ? 2 : 1,
    c = (r - 1) / f,
    h = 0;
  for (let g = 0; g < u; g++) {
    let M = u === 2 && g ? a / 2 - 5.6 : -a / 2 + 0.4,
      y = M + 5.2;
    for (let _ = 0; _ <= f; _++) {
      let v = -r / 2 + 0.5 + _ * c;
      Yr(n.ground, ...l(v, M), ...l(v, y), 0.12, 0.08, 15921902);
    }
    for (let _ = 0; _ < f; _++) {
      let v = -r / 2 + 0.5 + (_ + 0.5) * c,
        b = Math.floor(An(t.x + _, t.z + g) * 100),
        w = g && u === 2 ? y - 0.5 : M + 0.5;
      if ((Yr(n.ground, ...l(v - 0.55, w), ...l(v + 0.55, w), 0.22, 0.1, 15909424), b % 10 < 6 && h++ < 4)) {
        let [E, C] = l(v, (M + y) / 2);
        EC(n, E, C, i + (g && u === 2 ? Math.PI : 0), b);
      }
    }
  }
  let [d, p] = l(r / 2 - 0.8, a / 2 - 1.2);
  (n.paint.setColor(15263972).box(d, 0, p, 0.6, 1.5, 0.45, i, {}),
    n.glow.setColor(8376575).box(d - o * 0.23, 1.05, p + s * 0.23, 0.3, 0.2, 0.02, i, {}),
    Cn(d, p, 0.7, 0.6, 1.5, i));
  let [x, m] = l(-r / 2 + 0.8, a / 2 - 0.6);
  (n.metal.setColor(10133670).cyl(x, 0, m, 0.06, 3.8, 6, !1),
    addProp(x, m, 0.12, 3.8),
    n.paint.setColor(15909424).box(x, 3, m, 1.4, 1.4, 0.12, i, {}),
    n.paint.setColor(1785748).box(x - o * 0.07, 3.15, m + s * 0.07, 0.8, 1, 0.02, i, {}),
    jr(
      Kr(e, '30\u5206 \xA5220\u300024\u6642\u9593\u6700\u5927 \xA51,600', '#f2c230', '#1b3f94'),
      2.6,
      0.55,
      x - o * 0.09,
      2.4,
      m + s * 0.09,
      Math.atan2(-o, s),
    ));
  for (let g of [-1, 1]) {
    let [M, y] = l(g * (r / 2 - 0.15), a / 2 - 0.15);
    n.metal.setColor(14211284).cyl(M, 0, y, 0.05, 0.7, 5, !1);
  }
  Vf.push({
    x: t.x,
    z: t.z,
    col: '#f2c230',
    ch: 'P',
    name: e,
    small: !0,
    tiny: !0,
  });
}
var X_ = [
  [5933626, 0.35],
  [4094514, 0.55],
  [8034874, 0.28],
  [4880938, 0.75],
];
function _AC_(n, t) {
  let e = t.rot + t.front.ang,
    i = Math.cos(e),
    s = Math.sin(e),
    o = t.front.ang % Math.PI ? t.d : t.w,
    r = t.front.ang % Math.PI ? t.w : t.d,
    a = (d, p) => [t.x + i * d - s * p, t.z + s * d + i * p];
  (ar(n.ground, [a(-o / 2, -r / 2), a(o / 2, -r / 2), a(o / 2, r / 2), a(-o / 2, r / 2)], 0.07, 6966836), treeFree(t.x, t.z, Math.max(o, r) / 2 + 1));
  let l = X_[Math.floor(An(t.x, t.z) * X_.length)];
  for (let d = -o / 2 + 1.2; d < o / 2 - 4; d += 1.2) {
    let [p, x] = a(d, -0.6);
    n.leaf.setColor(l[0]).gable(p, 0.05, x, r - 4.4, 0.7, l[1], e + Math.PI / 2);
  }
  let [f, u] = a(o / 2 - 2.2, -r / 2 + 2);
  (n.metal.setColor(10134696).box(f, 0, u, 2.6, 2.1, 2, e, {}),
    n.roof.setColor(5925498).gable(f, 2.1, u, 2.9, 2.3, 0.5, e),
    Cn(f, u, 2.6, 2, 2.6, e));
  {
    let [d, p] = a(o / 2 - 2.2, r / 2 - 4.5);
    l1(n, d, p, 1.1, 4876842);
    for (let x = 0; x < 3; x++) n.paint.setColor(15763998).ell(d + Math.cos(x * 2) * 1.2, 3.4, p + Math.sin(x * 2) * 1.2, 0.16, 0.16, 0.16, 4, 2);
  }
  for (let [d, p, x, m] of [
    [-o / 2, r / 2, o / 2, r / 2],
    [-o / 2, -r / 2, -o / 2, r / 2],
    [o / 2, -r / 2, o / 2, r / 2],
  ]) {
    let [g, M] = a(d, p),
      [y, _] = a(x, m),
      v = Math.hypot(y - g, _ - M);
    n.metal.setColor(6982234).box((g + y) / 2, 0, (M + _) / 2, v, 0.8, 0.04, Math.atan2(_ - M, y - g), {});
  }
  let [c, h] = a(-o / 2 + 1.6, r / 2 + 0.1);
  if (
    (n.wood.setColor(9080726).box(c, 0, h, 0.08, 1.1, 0.08, e, {}),
    jr(Kr('\u751F\u7523\u7DD1\u5730\u5730\u533A', '', '#2a6a3a', '#ffffff'), 1.6, 0.42, c, 1.25, h, Math.atan2(-s, i)),
    An(t.z, t.x * 3) < 0.5)
  ) {
    let [d, p] = a(-o / 2 + 3.6, r / 2 - 0.6);
    (n.wood.setColor(10123850).box(d, 0, p, 1.6, 0.9, 0.7, e, {}), n.roof.setColor(8018490).box(d, 1.6, p, 1.8, 0.08, 0.9, e, {}));
    for (let x of [-0.75, 0.75]) n.wood.setColor(10123850).box(d + i * x, 0.9, p + s * x, 0.06, 0.7, 0.06, e, {});
    for (let x = 0; x < 3; x++)
      n.paint.setColor([14172202, 15900702, 6986298][x]).box(d + i * (x - 1) * 0.45, 0.9, p + s * (x - 1) * 0.45, 0.3, 0.16, 0.3, e, {
        noTop: !1,
      });
    (Cn(d, p, 1.6, 0.7, 1.6, e),
      To.push({
        x: d - s * 1,
        z: p + i * 1,
        type: 'veg',
        label: '\u7121\u4EBA\u8CA9\u58F2\u6240',
        act: '\u91CE\u83DC\u3092\u8CB7\u3046\uFF08\xA5100\u30FB\u4F53\u529B\u56DE\u5FA9\uFF09',
      }));
  }
}
function RC(n) {
  let t = 0,
    e = 0,
    i = R.qName === 'low' ? 900 : 760;
  for (let s = xn.x0; s < xn.x1; s += i)
    for (let o = xn.z0; o < xn.z1; o += i) {
      let r = s + 290 + (An(o + 3, s) - 0.5) * 340,
        a = o + 290 + (An(s + 11, o) - 0.5) * 340,
        l = An(r * 0.011, a * 0.019);
      if (
        l > 0.72 ||
        maskQ(r, a) !== M_LAND ||
        (W.sites || []).some((c) => Math.hypot(c.x - r, c.z - a) < Math.max(c.w, c.d) / 2 + 60) ||
        W.stations.some((c) => Math.hypot(c.x - r, c.z - a) < 90)
      )
        continue;
      let f = v3(r, a);
      if (f > 24) continue;
      let u = $_(r, a, 120, f > 13 ? 30 : 14);
      u &&
        (f > 11 || l < 0.36
          ? (a1(u),
            TC(
              n,
              u,
              [
                '\u30BF\u30A4\u30E0\u30BA\u30D1\u30FC\u30AF',
                '\u30D1\u30FC\u30AF\u30EF\u30F3',
                '\u30EA\u30D1\u30FC\u30AF24',
                '\u30CA\u30D3\u30D1\u30FC\u30AF',
              ][Math.floor(An(u.x, u.z) * 4)],
            ),
            t++)
          : (a1(u), _AC_(n, u), e++));
    }
  return [t, e];
}
function CC(n) {
  let t = 0;
  return (
    W.stations.forEach((e, i) => {
      if (e.lines.length > 2 || An(i, e.x) > 0.55 || v3(e.x, e.z) > 20) return;
      let o = roadsNear(e.x, e.z, 200, [])
        .filter((f) => !f.e.elev && (f.e.kind === 'L' || f.e.kind === 'B') && f.e.len > 70 && f.e.len < 260 && Math.hypot(f.x - e.x, f.z - e.z) > 50)
        .sort((f, u) => f.d - u.d)[0];
      if (!o) return;
      let r = o.e,
        a = `${e.ja.replace(/駅$/, '')}\u9280\u5EA7\u5546\u5E97\u8857`,
        l = [8, r.len - 8];
      for (let f of l) {
        let u = edgePos(r, f, {}),
          c = u.dz,
          h = -u.dx,
          d = r.hw + 1.6,
          p = Math.atan2(h, c);
        for (let m of [-1, 1])
          (n.metal.setColor(9050650).box(u.x + c * d * m, 0, u.z + h * d * m, 0.35, 6.2, 0.35, p, {}),
            addProp(u.x + c * d * m, u.z + h * d * m, 0.3, 6.2));
        n.metal.setColor(9050650).box(u.x, 6.2, u.z, d * 2 + 0.6, 0.35, 0.35, p, {});
        let x = Kr(a, 'SHOPPING STREET', '#b3261e', '#fff4d8');
        for (let m of [1, -1]) jr(x, Math.min(d * 2 - 0.4, 9), 1.3, u.x + u.dx * 0.2 * m, 5.4, u.z + u.dz * 0.2 * m, Math.atan2(u.dx * m, u.dz * m));
      }
      for (let f = 14; f < r.len - 14; f += 11) {
        let u = edgePos(r, f, {}),
          c = u.dz,
          h = -u.dx;
        for (let d of [-1, 1]) {
          let p = u.x + c * (r.hw + 1.2) * d,
            x = u.z + h * (r.hw + 1.2) * d;
          (n.metal.setColor(9080726).cyl(p, 0, x, 0.07, 4.4, 6, !1),
            addProp(p, x, 0.12, 4.4),
            n.paint
              .setColor([14172202, 15909424, 2783936, 3971666, 15231672][(Math.floor(f / 11) + (d > 0 ? 2 : 0)) % 5])
              .box(p - c * 0.45 * d, 2.6, x - h * 0.45 * d, 0.85, 1.4, 0.03, Math.atan2(h, c), {}),
            n.glow.setColor(16734762).ell(p, 4.6, x, 0.25, 0.32, 0.25, 7, 5));
        }
      }
      (Vf.push({
        x: edgePos(r, r.len / 2, {}).x,
        z: edgePos(r, r.len / 2, {}).z,
        col: '#b3261e',
        ch: '\u5546',
        name: a,
        small: !0,
      }),
        t++);
    }),
    t
  );
}
function Y_() {
  let n = {
    stone: new Mt({
      color: !0,
    }),
    white: new Mt({
      color: !0,
    }),
    roof: new Mt({
      color: !0,
    }),
    wood: new Mt({
      color: !0,
    }),
    leaf: new Mt({
      color: !0,
    }),
    glow: new Mt({
      color: !0,
    }),
    metal: new Mt({
      color: !0,
    }),
    paint: new Mt({
      color: !0,
    }),
    ground: new Mt({
      color: !0,
    }),
    water: new Mt({
      color: !0,
    }),
  };
  (MC(n), yC(n));
  let t = bC(n);
  vC(n);
  let [e, i] = wC(n),
    s = CC(n),
    o = () => Object.values(n).reduce((h, d) => h + d.count, 0),
    r = o(),
    [a, l] = RC(n);
  console.log('suburb verts', o() - r, 'scenery verts', o());
  let f = (h, d, p) => {
      if (!h.count) return;
      let x = new THREE.Mesh(h.build(), d);
      ((x.castShadow = !!p), (x.receiveShadow = !0), R.scene.add(x), LM.meshes.push(x));
    },
    u = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      roughness: 0.12,
      metalness: 0.2,
      side: THREE.DoubleSide,
    }),
    c = new THREE.MeshStandardMaterial({
      vertexColors: !0,
      roughness: 0.95,
      side: THREE.DoubleSide,
      polygonOffset: !0,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
  (f(n.ground, c, !1),
    f(n.water, u, !1),
    f(n.stone, R.M.paint, !0),
    f(n.white, R.M.paint, !0),
    f(n.roof, R.M.paint, !0),
    f(n.wood, R.M.paint, !0),
    f(n.paint, R.M.paint, !0),
    f(n.metal, R.M.metal, !0),
    f(n.leaf, R.M.leaf, !0),
    f(n.glow, R.M.glow, !1),
    console.log('scenery', {
      coinParking: a,
      farms: l,
      ginkgo: t,
      shrines: e,
      playgrounds: i,
      shotengai: s,
      doors: To.length,
    }));
}
function K_(n, t) {
  for (let e = 0; e < y3.length; e++)
    y3[e].scale.set(1 + Math.sin(t * 3 + e) * 0.06, 1 + Math.sin(t * 2.3 + e * 2) * 0.12, 1 + Math.cos(t * 3 + e) * 0.06);
}
var lr = null,
  Ao = null,
  Nt = null,
  sl = null;
function j_(n) {
  (lr ||
    ((lr = document.createElement('div')),
    (lr.className = 'ov tap'),
    (lr.style.cssText = 'background:rgba(4,5,9,.94);flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px'),
    (Ao = document.createElement('canvas')),
    (Ao.style.cssText =
      'width:min(92vw,880px);aspect-ratio:16/9;max-height:62vh;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.15);background:#0a0c12'),
    (sl = document.createElement('div')),
    (sl.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:880px;font:800 13px var(--f-b)'),
    lr.appendChild(Ao),
    lr.appendChild(sl),
    document.body.appendChild(lr),
    (Nt = Ao.getContext('2d'))),
    (lr.hidden = !1),
    (sl.innerHTML = ''));
  let t = Ao.getBoundingClientRect();
  return (
    (Ao.width = Math.round(t.width * Math.min(2, devicePixelRatio || 1))),
    (Ao.height = Math.round((Ao.width * 9) / 16)),
    {
      W: Ao.width,
      H: Ao.height,
    }
  );
}
function cr(n, t, e) {
  let i = document.createElement('button');
  return (
    (i.textContent = n),
    (i.style.cssText = `padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:${e ? '#ffd23f' : 'rgba(255,255,255,.07)'};color:${e ? '#111' : '#f4f0e6'};font:800 13px var(--f-b);cursor:pointer`),
    (i.onclick = t),
    sl.appendChild(i),
    i
  );
}
function _3(n) {
  ((lr.hidden = !0), n && n());
}
var F0 = (n) => '\xA5' + Math.round(n).toLocaleString('ja-JP');
function J_(n, t) {
  let { W: e, H: i } = j_(),
    s = [],
    o = 0,
    r = 0,
    a = 0,
    l = 'idle',
    f = [7, 3, 5],
    u = 0,
    c = performance.now(),
    h = 0,
    d = [];
  for (let M = 0; M < 9; M++) for (let y = 0; y < 13; y++) d.push([e * 0.12 + y * e * 0.032 + (M % 2) * e * 0.016, i * 0.18 + M * i * 0.07]);
  let p = () => {
    ((sl.innerHTML = ''),
      cr(
        '\u7389\u3092\u8CB7\u3046 \xA51,000\uFF08250\u7389\uFF09',
        () => {
          G.money < 1e3 || ((G.money -= 1e3), (r += 1e3), (o += 250), gt.cash(), p());
        },
        !0,
      ),
      cr(l === 'auto' ? '\u6253\u3064\u306E\u3092\u3084\u3081\u308B' : '\u6253\u3064\uFF08\u81EA\u52D5\uFF09', () => {
        ((l = l === 'auto' ? 'idle' : 'auto'), p());
      }),
      cr(`\u7CBE\u7B97\u3057\u3066\u51FA\u308B\uFF08\u6301\u3061\u7389 ${o} \u7389 = ${F0(o * 4)}\uFF09`, () => {
        ((G.money += o * 4), (a = o * 4 - r), cancelAnimationFrame(x), _3(() => t && t(a)));
      }));
  };
  p();
  let x = 0,
    m = 0,
    g = (M) => {
      x = requestAnimationFrame(g);
      let y = Math.max(0, Math.min(0.2, (M - c) / 1e3));
      ((c = M),
        l === 'auto' &&
          o > 0 &&
          ((m -= y),
          m <= 0 &&
            ((m = 0.18),
            o--,
            s.push({
              x: e * 0.1,
              y: i * 0.9,
              vx: rt(e * 0.5, e * 0.62),
              vy: -rt(i * 1.25, i * 1.4),
            }),
            Math.random() < 0.3 && gt.tone(1800, 0.03, 0.03, 'square'))));
      let _ = Math.max(1, Math.ceil(y / 0.016)),
        v = y / _;
      for (let w = 0; w < _; w++)
        for (let E of s) {
          ((E.vy += i * 1.6 * v),
            (E.x += E.vx * v),
            (E.y += E.vy * v),
            E.x > e * 0.56 && ((E.x = e * 0.56), (E.vx = -Math.abs(E.vx) * 0.5)),
            E.y < i * 0.08 && ((E.y = i * 0.08), (E.vy = Math.abs(E.vy) * 0.3), (E.vx = -Math.abs(E.vx) * 0.6)));
          for (let C of d) {
            let S = E.x - C[0],
              T = E.y - C[1],
              D = Math.hypot(S, T);
            if (D < e * 0.008) {
              ((E.x = C[0] + (S / D) * e * 0.008), (E.y = C[1] + (T / D) * e * 0.008));
              let O = (E.vx * S) / D + (E.vy * T) / D;
              ((E.vx -= (1.6 * O * S) / D), (E.vy -= (1.6 * O * T) / D), (E.vx += rt(-20, 20)));
            }
          }
          E.y > i * 0.82 &&
            !E.done &&
            ((E.done = !0),
            Math.abs(E.x - e * 0.33) < e * 0.018 && ((o += 3), gt.tone(1200, 0.06, 0.06, 'triangle'), u <= 0 && Math.random() < 0.35 && (u = 2.2)));
        }
      if (((s = s.filter((w) => w.y < i * 1.05 && w.x > -10)), u > 0))
        if (((u -= y), u <= 0)) {
          let w = Math.random();
          if (w < 0.04) ((f = [7, 7, 7]), (o += 1500), (h = 4), gt.mission());
          else if (w < 0.16) {
            let E = Math.floor(rt(1, 9));
            ((f = [E, E, E]), (o += 300), (h = 2), gt.cash());
          } else
            ((f = [Math.floor(rt(1, 9)), Math.floor(rt(1, 9)), Math.floor(rt(1, 9))]), f[0] === f[1] && f[1] === f[2] && (f[2] = (f[2] % 9) + 1));
          p();
        } else f = f.map(() => Math.floor(rt(1, 10)));
      (h > 0 && (h -= y), (Nt.fillStyle = '#0a0c12'), Nt.fillRect(0, 0, e, i));
      let b = Nt.createLinearGradient(0, 0, 0, i);
      (b.addColorStop(0, h > 0 ? '#3a0a3a' : '#1a2a4a'),
        b.addColorStop(1, '#0b1020'),
        (Nt.fillStyle = b),
        Nt.beginPath(),
        Nt.arc(e * 0.33, i * 0.5, i * 0.46, 0, 7),
        Nt.fill(),
        (Nt.strokeStyle = '#c9a548'),
        (Nt.lineWidth = e * 0.006),
        Nt.stroke(),
        (Nt.fillStyle = '#d8dce0'));
      for (let w of d) (Nt.beginPath(), Nt.arc(w[0], w[1], e * 0.003, 0, 7), Nt.fill());
      ((Nt.fillStyle = '#111'),
        Nt.fillRect(e * 0.25, i * 0.38, e * 0.16, i * 0.16),
        (Nt.strokeStyle = h > 0 ? `hsl(${(M / 5) % 360},90%,60%)` : '#ffd23f'),
        (Nt.lineWidth = 4),
        Nt.strokeRect(e * 0.25, i * 0.38, e * 0.16, i * 0.16),
        (Nt.fillStyle = '#fff'),
        (Nt.font = `900 ${i * 0.1}px Anton, Impact, sans-serif`),
        (Nt.textAlign = 'center'),
        (Nt.textBaseline = 'middle'),
        f.forEach((w, E) => Nt.fillText(String(w), e * (0.28 + E * 0.05), i * 0.465)),
        (Nt.fillStyle = '#ff5050'),
        Nt.fillRect(e * 0.315, i * 0.82, e * 0.03, i * 0.012),
        (Nt.fillStyle = '#c0c4c8'));
      for (let w of s) (Nt.beginPath(), Nt.arc(w.x, w.y, e * 0.0045, 0, 7), Nt.fill());
      ((Nt.textAlign = 'left'),
        (Nt.fillStyle = '#ffd23f'),
        (Nt.font = `800 ${i * 0.05}px "M PLUS 1p", sans-serif`),
        Nt.fillText(n, e * 0.66, i * 0.14),
        (Nt.fillStyle = '#fff'),
        (Nt.font = `800 ${i * 0.045}px "M PLUS 1p", sans-serif`),
        Nt.fillText(`\u6301\u3061\u7389  ${o} \u7389`, e * 0.66, i * 0.3),
        Nt.fillText(`\u6295\u8CC7  ${F0(r)}`, e * 0.66, i * 0.4),
        Nt.fillText(`\u6240\u6301\u91D1  ${F0(G.money)}`, e * 0.66, i * 0.5),
        (Nt.fillStyle = '#9aa3ab'),
        (Nt.font = `500 ${i * 0.032}px "M PLUS 1p", sans-serif`),
        Nt.fillText('\u4E2D\u592E\u306E\u8D64\u3044\u30C1\u30E3\u30C3\u30AB\u30FC\u306B\u5165\u308B\u3068\u62BD\u9078', e * 0.66, i * 0.64),
        Nt.fillText('3\u3064\u63C3\u3048\u3070\u5927\u5F53\u305F\u308A\uFF01\uFF081\u7389 = \xA54\uFF09', e * 0.66, i * 0.7),
        h > 0 &&
          ((Nt.fillStyle = `hsl(${(M / 3) % 360},90%,60%)`),
          (Nt.font = `900 ${i * 0.09}px Anton, Impact, sans-serif`),
          (Nt.textAlign = 'center'),
          Nt.fillText('\u5927\u5F53\u305F\u308A\uFF01', e * 0.33, i * 0.27)));
    };
  x = requestAnimationFrame(g);
}
var zC = [
    '\u30B5\u30AF\u30E9\u30B9\u30D7\u30EA\u30F3\u30C8',
    '\u30C8\u30A6\u30AD\u30E7\u30A6\u30D6\u30EA\u30FC\u30BA',
    '\u30DF\u30C3\u30C9\u30CA\u30A4\u30C8\u30E9\u30F3',
    '\u30B4\u30FC\u30EB\u30C9\u30B7\u30C3\u30D7\u30B9',
    '\u30CF\u30CD\u30C0\u30A8\u30AF\u30B9\u30D7\u30EC\u30B9',
    '\u30AE\u30F3\u30B6\u30CE\u30D2\u30AB\u30EA',
    '\u30B7\u30D6\u30E4\u30D5\u30E9\u30C3\u30B7\u30E5',
    '\u30A2\u30B5\u30AF\u30B5\u30A4\u30CA\u30BA\u30DE',
  ],
  PC = [
    '1\u53F7\u8247\uFF08\u767D\uFF09',
    '2\u53F7\u8247\uFF08\u9ED2\uFF09',
    '3\u53F7\u8247\uFF08\u8D64\uFF09',
    '4\u53F7\u8247\uFF08\u9752\uFF09',
    '5\u53F7\u8247\uFF08\u9EC4\uFF09',
    '6\u53F7\u8247\uFF08\u7DD1\uFF09',
  ];
function Z_(n, t, e) {
  let i = n === 'boat',
    s = i ? PC : zC,
    o = s.length,
    { W: r, H: a } = j_(),
    l = s.map(() => rt(0.85, 1.15)),
    f = l.reduce((E, C) => E + C ** 6, 0),
    u = l.map((E) => Math.max(1.4, Math.round((f / E ** 6) * 0.8 * 10) / 10)),
    c = -1,
    h = 1e3,
    d = 'bet',
    p = s.map(() => 0),
    x = 0,
    m = performance.now(),
    g = null,
    M = 0,
    y = i
      ? ['#f2f2f0', '#222', '#d4121f', '#1b4fa8', '#f2c230', '#2f8a4e']
      : ['#e86a17', '#1b4fa8', '#d4121f', '#2f8a4e', '#f2c230', '#8a4ea8', '#f2f2f0', '#222'],
    _ = () => {
      if (((sl.innerHTML = ''), d === 'bet')) {
        s.forEach((E, C) => {
          let S = cr(
            `${C + 1} ${E}  ${u[C].toFixed(1)}\u500D`,
            () => {
              ((c = C), _());
            },
            c === C,
          );
          S.style.borderLeft = `6px solid ${y[C]}`;
        });
        for (let E of [1e3, 5e3, 1e4])
          cr(
            `${F0(E)}`,
            () => {
              ((h = E), _());
            },
            h === E,
          );
        (cr(
          '\u30B9\u30BF\u30FC\u30C8\uFF01',
          () => {
            c < 0 || G.money < h || ((G.money -= h), (d = 'run'), (x = 0), gt.blip(), _());
          },
          !0,
        ),
          cr('\u3084\u3081\u308B', () => {
            (cancelAnimationFrame(v), _3(() => e && e(0)));
          }));
      } else
        d === 'done' &&
          (cr(
            '\u3082\u3046\u4E00\u5EA6\u8CED\u3051\u308B',
            () => {
              ((d = 'bet'), (p = s.map(() => 0)), (g = null), _());
            },
            !0,
          ),
          cr('\u51FA\u308B', () => {
            (cancelAnimationFrame(v), _3(() => e && e(M)));
          }));
    };
  _();
  let v = 0,
    b = (E) => a * 0.16 + E * ((a * 0.66) / o),
    w = (E) => {
      v = requestAnimationFrame(w);
      let C = Math.max(0, Math.min(0.2, (E - m) / 1e3));
      if (((m = E), d === 'run')) {
        x += C;
        for (let T = 0; T < o; T++) p[T] += C * (0.075 * l[T] + 0.02 * Math.sin(x * (1.3 + T * 0.37) + T) + rt(-0.01, 0.012)) * (x < 1 ? x : 1);
        Math.random() < C * 6 && gt.burst(300, 0.05, 0.03);
        let S = p.indexOf(Math.max(...p));
        p[S] >= 1 && ((g = S), (d = 'done'), (M = g === c ? Math.round(h * u[c]) : 0), M ? ((G.money += M), gt.mission()) : gt.fail(), (M -= h), _());
      }
      ((Nt.fillStyle = i ? '#0e3a5a' : '#2c5a2a'), Nt.fillRect(0, 0, r, a));
      for (let S = 0; S < o; S++)
        ((Nt.fillStyle = i ? (S % 2 ? '#124a72' : '#0f4266') : S % 2 ? '#a88a5a' : '#b4966a'),
          Nt.fillRect(r * 0.05, b(S) - a * 0.035, r * 0.9, a * 0.07));
      ((Nt.fillStyle = '#fff'), Nt.fillRect(r * 0.93, a * 0.1, r * 0.006, a * 0.75));
      for (let S = 0; S < o; S++) {
        let T = r * 0.06 + p[S] * r * 0.87,
          D = b(S),
          O = Math.sin(E / 70 + S) * a * 0.006;
        ((Nt.fillStyle = y[S]),
          (Nt.strokeStyle = '#000'),
          (Nt.lineWidth = 2),
          i
            ? (Nt.beginPath(),
              Nt.moveTo(T + r * 0.03, D),
              Nt.lineTo(T - r * 0.02, D - a * 0.022),
              Nt.lineTo(T - r * 0.02, D + a * 0.022),
              Nt.closePath(),
              Nt.fill(),
              Nt.stroke(),
              (Nt.fillStyle = 'rgba(255,255,255,.5)'),
              Nt.fillRect(T - r * 0.06, D - 2, r * 0.04, 4))
            : (Nt.beginPath(),
              Nt.ellipse(T, D + O, r * 0.025, a * 0.018, 0, 0, 7),
              Nt.fill(),
              Nt.stroke(),
              Nt.beginPath(),
              Nt.ellipse(T + r * 0.024, D - a * 0.015 + O, r * 0.01, a * 0.012, -0.5, 0, 7),
              Nt.fill(),
              Nt.stroke()),
          (Nt.fillStyle = '#fff'),
          (Nt.font = `800 ${a * 0.032}px "M PLUS 1p", sans-serif`),
          (Nt.textAlign = 'left'),
          Nt.fillText(`${S + 1} ${s[S]}`, r * 0.06, D - a * 0.04 + a * 0.012));
      }
      ((Nt.fillStyle = 'rgba(0,0,0,.55)'),
        Nt.fillRect(0, 0, r, a * 0.09),
        (Nt.fillStyle = '#ffd23f'),
        (Nt.font = `800 ${a * 0.045}px "M PLUS 1p", sans-serif`),
        (Nt.textAlign = 'left'),
        (Nt.textBaseline = 'middle'),
        Nt.fillText(t, r * 0.02, a * 0.045),
        (Nt.textAlign = 'right'),
        (Nt.fillStyle = '#fff'),
        Nt.fillText(
          d === 'bet'
            ? c >= 0
              ? `${c + 1}\u756A\u306B ${F0(h)}`
              : '\u8CED\u3051\u308B\u756A\u53F7\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044'
            : d === 'run'
              ? '\u30EC\u30FC\u30B9\u4E2D\u2026'
              : g === c
                ? `\u7684\u4E2D\uFF01 +${F0(M + h)}`
                : `${g + 1}\u756A\u306E\u52DD\u3061\u3000\u306F\u305A\u308C`,
          r * 0.98,
          a * 0.045,
        ),
        (Nt.textBaseline = 'alphabetic'));
    };
  v = requestAnimationFrame(w);
}
var PL = {};
vi(PL, {
  P: () => player_P,
  blowUp: () => blowUp,
  boardTrain: () => boardTrain,
  carEffects: () => carEffects,
  carPedHits: () => carPedHits,
  crime: () => player_crime,
  doPunch: () => doPunch,
  groundAt: () => groundAt,
  initPlayer: () => initPlayer,
  knockPlayer: () => knockPlayer,
  leaveTrain: () => leaveTrain,
  managePolice: () => managePolice,
  managePopulation: () => managePopulation,
  nearPolice: () => nearPolice,
  nearestStation: () => nearestStation,
  placeNearRoad: () => placeNearRoad,
  renderPlayer: () => renderPlayer,
  setPlayerColor: () => setPlayerColor,
  tryEnter: () => tryEnter,
  updCamera: () => updCamera,
  updFoot: () => updFoot,
});
var IC = `attribute vec3 aCol;attribute float aSize;uniform float uScale,uFar;varying vec3 vC;varying float vA;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float z=max(-mv.z,1.0);
gl_PointSize=clamp(aSize*uScale/z,0.0,200.0);vC=aCol;vA=1.0-smoothstep(uFar*0.6,uFar,z);}`,
  LC =
    'uniform float uI;varying vec3 vC;varying float vA;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=max(0.0,1.0-d);a=a*a*(0.55+0.45*a);gl_FragColor=vec4(vC*a*uI*vA,1.0);}',
  w3 = [],
  c1 = class {
    constructor(t, e = 1500) {
      ((this.max = t), (this.n = 0), (this.pos = new Float32Array(t * 3)), (this.col = new Float32Array(t * 3)), (this.size = new Float32Array(t)));
      let i = new THREE.BufferGeometry();
      ((this.aP = new THREE.BufferAttribute(this.pos, 3)),
        (this.aC = new THREE.BufferAttribute(this.col, 3)),
        (this.aS = new THREE.BufferAttribute(this.size, 1)));
      for (let s of [this.aP, this.aC, this.aS]) s.setUsage(THREE.DynamicDrawUsage);
      (i.setAttribute('position', this.aP),
        i.setAttribute('aCol', this.aC),
        i.setAttribute('aSize', this.aS),
        (this.u = {
          uScale: {
            value: 600,
          },
          uI: {
            value: 1,
          },
          uFar: {
            value: e,
          },
        }),
        (this.mat = new THREE.ShaderMaterial({
          uniforms: this.u,
          vertexShader: IC,
          fragmentShader: LC,
          transparent: !0,
          depthWrite: !1,
          blending: THREE.AdditiveBlending,
        })),
        (this.pts = new THREE.Points(i, this.mat)),
        (this.pts.frustumCulled = !1),
        (this.pts.renderOrder = 5),
        (this.g = i),
        R.scene.add(this.pts),
        w3.push(this));
    }
    add(t, e, i, s, o, r, a) {
      if (this.n >= this.max) return;
      let l = this.n++;
      ((this.pos[l * 3] = t),
        (this.pos[l * 3 + 1] = e),
        (this.pos[l * 3 + 2] = i),
        (this.col[l * 3] = s),
        (this.col[l * 3 + 1] = o),
        (this.col[l * 3 + 2] = r),
        (this.size[l] = a));
    }
    commit() {
      (this.g.setDrawRange(0, this.n), (this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = !0));
    }
  },
  DC = `attribute vec4 aCol;attribute float aSize;uniform float uScale;varying vec4 vC;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uScale/max(-mv.z,1.0),0.0,260.0);vC=aCol;}`,
  NC = 'varying vec4 vC;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=smoothstep(1.0,0.25,d);gl_FragColor=vec4(vC.rgb,vC.a*a);}',
  f1 = class {
    constructor(t, e) {
      ((this.max = t), (this.P = []), (this.pos = new Float32Array(t * 3)), (this.col = new Float32Array(t * 4)), (this.size = new Float32Array(t)));
      let i = new THREE.BufferGeometry();
      ((this.aP = new THREE.BufferAttribute(this.pos, 3)),
        (this.aC = new THREE.BufferAttribute(this.col, 4)),
        (this.aS = new THREE.BufferAttribute(this.size, 1)),
        i.setAttribute('position', this.aP),
        i.setAttribute('aCol', this.aC),
        i.setAttribute('aSize', this.aS),
        (this.u = {
          uScale: {
            value: 600,
          },
        }),
        (this.mat = new THREE.ShaderMaterial({
          uniforms: this.u,
          vertexShader: DC,
          fragmentShader: NC,
          transparent: !0,
          depthWrite: !1,
          blending: e ? THREE.AdditiveBlending : THREE.NormalBlending,
        })),
        (this.pts = new THREE.Points(i, this.mat)),
        (this.pts.frustumCulled = !1),
        (this.pts.renderOrder = 6),
        (this.g = i),
        R.scene.add(this.pts),
        w3.push(this));
    }
    spawn(t, e, i, s, o, r, a, l, f, u, c, h, d, p) {
      this.P.length >= this.max ||
        this.P.push({
          x: t,
          y: e,
          z: i,
          vx: s,
          vy: o,
          vz: r,
          t: 0,
          life: a,
          s0: l,
          s1: f,
          r: u,
          g: c,
          b: h,
          a: d,
          grav: p || 0,
        });
    }
    update(t) {
      let e = 0,
        i = this.P;
      for (let s = i.length - 1; s >= 0; s--) {
        let o = i[s];
        if (((o.t += t), o.t >= o.life)) {
          ((i[s] = i[i.length - 1]), i.pop());
          continue;
        }
        ((o.vy -= o.grav * t), (o.x += o.vx * t), (o.y += o.vy * t), (o.z += o.vz * t), (o.vx *= 0.985), (o.vz *= 0.985));
        let r = o.t / o.life;
        ((this.pos[e * 3] = o.x),
          (this.pos[e * 3 + 1] = o.y),
          (this.pos[e * 3 + 2] = o.z),
          (this.col[e * 4] = o.r),
          (this.col[e * 4 + 1] = o.g),
          (this.col[e * 4 + 2] = o.b),
          (this.col[e * 4 + 3] = o.a * (1 - r)),
          (this.size[e] = o.s0 + (o.s1 - o.s0) * r),
          e++);
      }
      (this.g.setDrawRange(0, e), (this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = !0));
    }
  },
  We = {
    smoke: null,
    fire: null,
    dyn: null,
    stat: null,
    rain: null,
  };
function Q_() {
  ((We.smoke = new f1(700, !1)), (We.fire = new f1(700, !0)), (We.dyn = new c1(4e3, R.Q.lod)), (We.stat = new c1(3e4, R.Q.view * 1.4)));
  let n = 5e3,
    t = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    let s = rt(-60, 60),
      o = rt(0, 60),
      r = rt(-60, 60);
    t.set([s, o, r, s + 0.05, o - 0.9, r], i * 6);
  }
  let e = new THREE.BufferGeometry();
  (e.setAttribute('position', new THREE.BufferAttribute(t, 3)),
    (We.rain = new THREE.LineSegments(
      e,
      new THREE.LineBasicMaterial({
        color: 11188424,
        transparent: !0,
        opacity: 0,
        depthWrite: !1,
      }),
    )),
    (We.rain.frustumCulled = !1),
    R.scene.add(We.rain));
}
function Wf() {
  let n = R.renderer.domElement.height / (2 * Math.tan((R.camera.fov * Math.PI) / 360));
  for (let t of w3) t.u.uScale.value = n;
}
function Ro(n, t, e, i) {
  for (let s = 0; s < Math.min(20, i * 1.5); s++)
    We.fire.spawn(n, t, e, rt(-4, 4), rt(1, 5), rt(-4, 4), rt(0.25, 0.6), 0.25, 0.05, 1, 0.75, 0.3, 1, 14);
}
function O0(n, t, e, i) {
  We.smoke.spawn(n, t, e, rt(-0.4, 0.4), rt(1.2, 2.2), rt(-0.4, 0.4), rt(1.2, 2.2), 0.6, 2.6, i ? 0.2 : 0.55, i ? 0.2 : 0.55, i ? 0.2 : 0.55, 0.55);
}
function h1(n, t, e) {
  We.fire.spawn(
    n + rt(-0.5, 0.5),
    t,
    e + rt(-0.5, 0.5),
    rt(-0.3, 0.3),
    rt(1.5, 3),
    rt(-0.3, 0.3),
    rt(0.4, 0.8),
    1.3,
    0.3,
    1,
    rt(0.4, 0.65),
    0.1,
    1,
    -1,
  );
}
function t6(n, t, e, i) {
  let s = i ? 2.2 : 1;
  for (let o = 0; o < 70 * s; o++)
    We.fire.spawn(n, t + 1, e, rt(-10, 10) * s, rt(2, 13) * s, rt(-10, 10) * s, rt(0.5, 1.4), rt(2, 4) * s, 0.5, 1, rt(0.35, 0.6), 0.1, 1, 6);
  for (let o = 0; o < 45 * s; o++)
    We.smoke.spawn(n + rt(-2, 2), t + 1, e + rt(-2, 2), rt(-3, 3), rt(2, 6), rt(-3, 3), rt(2.5, 5), 2 * s, 8 * s, 0.18, 0.17, 0.16, 0.75);
}
function e6(n, t) {
  for (let e = 0; e < 40; e++) We.smoke.spawn(n, 0, t, rt(-3, 3), rt(2, 6), rt(-3, 3), rt(0.6, 1.2), 0.6, 1.8, 0.85, 0.9, 0.95, 0.7, 9);
}
function n6(n, t, e, i) {
  if (((We.rain.material.opacity = i * 0.45), (We.rain.visible = i > 0.02), !We.rain.visible)) return;
  We.rain.position.set(n, t - 25 - ((G.t * 30) % 1) * 0, e);
  let s = We.rain.geometry.attributes.position,
    o = s.array;
  for (let r = 0; r < o.length; r += 6) ((o[r + 1] -= 0.9), (o[r + 4] -= 0.9), o[r + 4] < 0 && ((o[r + 1] += 60), (o[r + 4] += 60)));
  s.needsUpdate = !0;
}
var WP = {};
vi(WP, {
  INV: () => INV,
  ORDER: () => ORDER,
  WPN: () => WPN,
  aimingNow: () => aimingNow,
  curW: () => curW,
  cycle: () => cycle,
  damagePed: () => damagePed,
  damagePlayer: () => damagePlayer,
  dropCash: () => dropCash,
  dropPickup: () => dropPickup,
  giveWeapon: () => giveWeapon,
  hudInfo: () => hudInfo,
  initWeapons: () => initWeapons,
  isGun: () => isGun,
  loadInv: () => loadInv,
  loseWeapons: () => loseWeapons,
  melee: () => melee,
  npcShoot: () => npcShoot,
  owned: () => owned,
  pedKilledByPlayer: () => pedKilledByPlayer,
  reloadNow: () => reloadNow,
  renderHand: () => renderHand,
  saveInv: () => saveInv,
  select: () => select,
  totalAmmo: () => totalAmmo,
  updWeapons: () => updWeapons,
  weaponGlows: () => weaponGlows,
});
var WPN = {
    fist: {
      name: '\u7D20\u624B',
      slot: 1,
      melee: !0,
      dmg: 6,
      range: 1.5,
      pose: 0,
    },
    bat: {
      name: '\u91D1\u5C5E\u30D0\u30C3\u30C8',
      slot: 2,
      melee: !0,
      dmg: 42,
      range: 2.1,
      price: 1800,
      pose: 0,
    },
    pistol: {
      name: '\u30D4\u30B9\u30C8\u30EB',
      slot: 3,
      dmg: 34,
      rate: 0.28,
      spread: 0.012,
      mag: 12,
      range: 110,
      price: 9e3,
      pack: 36,
      packPrice: 900,
      reload: 1.2,
      pose: 1,
      snd: 'pistol',
    },
    smg: {
      name: '\u30B5\u30D6\u30DE\u30B7\u30F3\u30AC\u30F3',
      slot: 4,
      dmg: 19,
      rate: 0.085,
      auto: !0,
      spread: 0.035,
      mag: 30,
      range: 80,
      price: 24e3,
      pack: 90,
      packPrice: 1800,
      reload: 1.6,
      pose: 2,
      snd: 'smg',
    },
    shotgun: {
      name: '\u30B7\u30E7\u30C3\u30C8\u30AC\u30F3',
      slot: 5,
      dmg: 15,
      pellets: 8,
      rate: 0.85,
      spread: 0.075,
      mag: 6,
      range: 38,
      price: 3e4,
      pack: 24,
      packPrice: 1500,
      reload: 2.2,
      pose: 2,
      snd: 'shotgun',
    },
    rifle: {
      name: '\u30A2\u30B5\u30EB\u30C8\u30E9\u30A4\u30D5\u30EB',
      slot: 6,
      dmg: 30,
      rate: 0.11,
      auto: !0,
      spread: 0.016,
      mag: 30,
      range: 170,
      price: 52e3,
      pack: 90,
      packPrice: 2400,
      reload: 1.9,
      pose: 2,
      snd: 'rifle',
    },
    grenade: {
      name: '\u30B0\u30EC\u30CD\u30FC\u30C9',
      slot: 7,
      throw: !0,
      rate: 0.9,
      price: 3e3,
      pack: 3,
      packPrice: 3e3,
      pose: 0,
    },
  },
  ORDER = Object.keys(WPN),
  INV = {
    cur: 'fist',
    own: {
      fist: 1,
    },
    ammo: {},
    clip: {},
  },
  jn = {
    cool: 0,
    reload: 0,
    aimT: 0,
    fired: !1,
  };
function owned(n) {
  return !!INV.own[n];
}
function curW() {
  return WPN[INV.cur];
}
function isGun(n = INV.cur) {
  let t = WPN[n];
  return !!(t && !t.melee && !t.throw);
}
function totalAmmo(n) {
  return (INV.clip[n] || 0) + (INV.ammo[n] || 0);
}
function giveWeapon(n, t) {
  let e = WPN[n];
  if (!e) return;
  let i = INV.own[n];
  ((INV.own[n] = 1),
    e.throw ? (INV.ammo[n] = (INV.ammo[n] || 0) + (t ?? e.pack)) : e.melee || ((INV.ammo[n] = (INV.ammo[n] || 0) + (t ?? e.pack)), i || s6(n)),
    i || select(n, !0));
}
function s6(n) {
  let t = WPN[n],
    e = t.mag - (INV.clip[n] || 0),
    i = Math.min(e, INV.ammo[n] || 0);
  ((INV.clip[n] = (INV.clip[n] || 0) + i), (INV.ammo[n] -= i));
}
function select(n, t) {
  return INV.own[n]
    ? ((INV.cur = n),
      (jn.reload = 0),
      (jn.cool = Math.max(jn.cool, 0.2)),
      t ||
        xt(
          'toast',
          `${WPN[n].name}${isGun(n) ? `\uFF08${INV.clip[n] || 0} / ${INV.ammo[n] || 0}\uFF09` : WPN[n].throw ? `\uFF08\u6B8B\u308A ${INV.ammo[n] || 0}\uFF09` : ''}`,
        ),
      gt.tone(600, 0.05, 0.08, 'square'),
      !0)
    : !1;
}
function cycle(n) {
  let t = ORDER.filter((i) => INV.own[i]),
    e = t.indexOf(INV.cur);
  select(t[(e + n + t.length) % t.length]);
}
function saveInv() {
  return {
    cur: INV.cur,
    own: {
      ...INV.own,
    },
    ammo: {
      ...INV.ammo,
    },
    clip: {
      ...INV.clip,
    },
    armor: G.player.armor || 0,
  };
}
function loadInv(n) {
  ((INV.own = {
    fist: 1,
  }),
    (INV.ammo = {}),
    (INV.clip = {}),
    (INV.cur = 'fist'),
    n &&
      (Object.assign(INV.own, n.own || {}),
      Object.assign(INV.ammo, n.ammo || {}),
      Object.assign(INV.clip, n.clip || {}),
      INV.own[n.cur] && (INV.cur = n.cur),
      (G.player.armor = n.armor || 0)));
}
function loseWeapons() {
  ((INV.own = {
    fist: 1,
  }),
    (INV.ammo = {}),
    (INV.clip = {}),
    (INV.cur = 'fist'));
}
var ol = null,
  G0 = [],
  Xf = [],
  Vi = null,
  H0 = [],
  o6 = [];
function FC() {
  let n = new THREE.BufferGeometry();
  (n.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3)),
    n.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 6), 3)),
    (ol = new THREE.LineSegments(
      n,
      new THREE.LineBasicMaterial({
        vertexColors: !0,
        transparent: !0,
        blending: THREE.AdditiveBlending,
        depthWrite: !1,
      }),
    )),
    (ol.frustumCulled = !1),
    (ol.renderOrder = 7),
    R.scene.add(ol));
  let t = new THREE.MeshStandardMaterial({
      color: 1710878,
      roughness: 0.45,
      metalness: 0.7,
    }),
    e = new THREE.MeshStandardMaterial({
      color: 5913122,
      roughness: 0.7,
    }),
    i = new THREE.MeshStandardMaterial({
      color: 13159634,
      roughness: 0.3,
      metalness: 0.9,
    }),
    s = new THREE.MeshStandardMaterial({
      color: 4016682,
      roughness: 0.8,
    }),
    o = (l) => {
      let f = new THREE.Group();
      for (let [u, c, h, d, p, x, m] of l) {
        let g = new THREE.Mesh(new THREE.BoxGeometry(u, c, h), m);
        (g.position.set(d, p, x), (g.castShadow = !0), f.add(g));
      }
      return ((f.visible = !1), f);
    };
  ((Vi = new THREE.Group()),
    R.scene.add(Vi),
    (Vi.userData = {
      pistol: o([
        [0.035, 0.05, 0.19, 0, 0.02, 0.06, t],
        [0.03, 0.1, 0.045, 0, -0.04, -0.01, t],
      ]),
      smg: o([
        [0.045, 0.07, 0.34, 0, 0.02, 0.1, t],
        [0.03, 0.14, 0.04, 0, -0.07, 0.06, t],
        [0.03, 0.09, 0.04, 0, -0.05, -0.05, t],
      ]),
      shotgun: o([
        [0.045, 0.06, 0.62, 0, 0.02, 0.2, t],
        [0.05, 0.08, 0.3, 0, -0.01, -0.1, e],
        [0.04, 0.035, 0.32, 0, -0.025, 0.28, e],
      ]),
      rifle: o([
        [0.045, 0.08, 0.7, 0, 0.02, 0.18, s],
        [0.035, 0.16, 0.05, 0, -0.08, 0.14, t],
        [0.04, 0.09, 0.22, 0, 0, -0.18, s],
        [0.02, 0.02, 0.2, 0, 0.03, 0.6, t],
      ]),
      bat: o([
        [0.05, 0.05, 0.8, 0, 0, 0.36, i],
        [0.035, 0.035, 0.18, 0, 0, -0.08, t],
      ]),
      grenade: o([[0.07, 0.09, 0.07, 0, 0, 0, s]]),
    }));
  for (let l in Vi.userData) Vi.add(Vi.userData[l]);
  let r = new THREE.SphereGeometry(0.06, 8, 6),
    a = new THREE.MeshStandardMaterial({
      color: 4016682,
      roughness: 0.6,
    });
  for (let l = 0; l < 8; l++) {
    let f = new THREE.Mesh(r, a);
    ((f.visible = !1), R.scene.add(f), o6.push(f));
  }
}
function r6(n, t, e, i, s, o, r = [1, 0.85, 0.5]) {
  (G0.length > 60 && G0.shift(),
    G0.push({
      a: [n, t, e],
      b: [i, s, o],
      t: 0.06,
      col: r,
    }));
}
function a6(n, t, e, i = 1) {
  Xf.push({
    x: n,
    y: t,
    z: e,
    t: 0.05,
    s: i,
  });
}
function OC(n, t, e) {
  for (let i = 0; i < 6; i++) We.smoke.spawn(n, t, e, rt(-1, 1), rt(0, 1.5), rt(-1, 1), rt(0.3, 0.6), 0.12, 0.35, 0.45, 0.04, 0.04, 0.9, 9);
}
function weaponGlows(n) {
  for (let t of Xf) n.add(t.x, t.y, t.z, 1, 0.8, 0.4, 2.2 * t.s);
  for (let t of H0) n.add(t.x, t.y + 0.1, t.z, 1, 0.2, 0.1, Math.sin(G.t * 20) > 0 ? 0.6 : 0.1);
  for (let t of B0) t.on && t.near && n.add(t.x, 0.9, t.z, ...t.glow, 1.4);
}
function HC(n) {
  for (let s = Xf.length - 1; s >= 0; s--) (Xf[s].t -= n) <= 0 && Xf.splice(s, 1);
  let t = ol.geometry.attributes.position,
    e = ol.geometry.attributes.color,
    i = 0;
  for (let s = G0.length - 1; s >= 0; s--) {
    let o = G0[s];
    if (((o.t -= n), o.t <= 0)) {
      G0.splice(s, 1);
      continue;
    }
    if (i >= 64) continue;
    let r = o.t / 0.06;
    (t.array.set([...o.a, ...o.b], i * 6),
      e.array.set([o.col[0] * r * 0.3, o.col[1] * r * 0.3, o.col[2] * r * 0.3, o.col[0] * r, o.col[1] * r, o.col[2] * r], i * 6),
      i++);
  }
  (ol.geometry.setDrawRange(0, i * 2), (t.needsUpdate = e.needsUpdate = !0));
}
function renderHand() {
  let n = G.player;
  if (!Vi) return;
  let t = n.mode === 'foot' && !n.interior && n.down <= 0 && !G.cam.fp && INV.cur !== 'fist';
  for (let l in Vi.userData) Vi.userData[l].visible = t && l === INV.cur;
  if (!t) return;
  let e = curW(),
    i = n.aimPose > 0,
    s = Math.sin(n.yaw),
    o = Math.cos(n.yaw),
    r = -o,
    a = s;
  if (i) (Vi.position.set(n.x + r * 0.24 + s * 0.6, n.y + 1.36, n.z + a * 0.24 + o * 0.6), Vi.rotation.set(0, n.yaw, 0));
  else if (e.melee) {
    let l = n.punch > 0 ? Math.sin(((0.4 - n.punch) / 0.4) * Math.PI) : 0;
    (Vi.position.set(n.x + r * 0.27 + s * (0.05 + l * 0.4), n.y + 0.8 + l * 0.5, n.z + a * 0.27 + o * (0.05 + l * 0.4)),
      Vi.rotation.set(-1.2 + l * 1.6 - (1 - l) * 0.2, n.yaw, 0, 'YXZ'));
  } else (Vi.position.set(n.x + r * 0.27, n.y + 0.78, n.z + a * 0.27), Vi.rotation.set(1.35, n.yaw, 0, 'YXZ'));
}
var d1 = [];
function C3(n, t, e, i, s, o, r, a) {
  let l = Math.min(r, rayBuildings(n, t, e, n + i * r, t + s * r, e + o * r) * r),
    f = {
      kind: 'world',
    },
    u = i * i + o * o;
  for (let c of G.peds) {
    if (c.dead) continue;
    let h = c.x - n,
      d = c.z - e;
    if (Math.abs(h) > l + 2 || Math.abs(d) > l + 2) continue;
    let p = c.state === 'down',
      x = p ? 0.55 : 0.32,
      m = u > 1e-6 ? (h * i + d * o) / u : 0;
    if (m < 0 || m > l + 1) continue;
    let g = n + i * m - c.x,
      M = e + o * m - c.z,
      y = g * g + M * M;
    if (y > x * x) continue;
    let _ = Math.max(0, m - Math.sqrt(x * x - y) / Math.sqrt(Math.max(u, 1e-6))),
      v = t + s * _,
      b = c.y - 0.1,
      w = p ? c.y + 0.5 : c.y + 1.8 * (c.sc || 1);
    v < b ||
      v > w ||
      _ >= l ||
      ((l = _),
      (f = {
        kind: 'ped',
        p: c,
        head: !p && v > w - 0.25,
      }));
  }
  carsNear(n + i * l * 0.5, e + o * l * 0.5, l * 0.5 + 8, d1);
  for (let c of d1) {
    if (c.removed) continue;
    let h = Math.cos(c.yaw),
      d = Math.sin(c.yaw),
      p = n - c.x,
      x = e - c.z,
      m = p * h - x * d,
      g = p * d + x * h,
      M = i * h - o * d,
      y = i * d + o * h,
      _ = t - c.y,
      v = c.td.W / 2,
      b = c.td.L / 2,
      w = c.td.H,
      E = 0,
      C = l;
    for (let [S, T, D, O] of [
      [m, M, -v, v],
      [_, s, 0.15, w],
      [g, y, -b, b],
    ]) {
      if (Math.abs(T) < 1e-6) {
        if (S < D || S > O) {
          E = 1e9;
          break;
        }
        continue;
      }
      let U = (D - S) / T,
        B = (O - S) / T;
      if ((U > B && ([U, B] = [B, U]), (E = Math.max(E, U)), (C = Math.min(C, B)), E > C)) break;
    }
    E <= C &&
      E < l &&
      E > 0.05 &&
      ((l = E),
      (f = {
        kind: 'car',
        c,
      }));
  }
  if (!a) {
    let c = G.player,
      h = c.mode === 'car' && c.car ? null : c.mode === 'foot' && !c.interior ? c : null;
    if (h) {
      let d = h.x - n,
        p = h.z - e,
        x = u > 1e-6 ? (d * i + p * o) / u : 0;
      if (x > 0 && x < l) {
        let m = n + i * x - h.x,
          g = e + o * x - h.z;
        if (m * m + g * g < 0.12) {
          let M = t + s * x;
          M > h.y - 0.1 &&
            M < h.y + 1.85 &&
            ((l = x),
            (f = {
              kind: 'player',
            }));
        }
      }
    }
  }
  return ((f.t = l), (f.x = n + i * l), (f.y = t + s * l), (f.z = e + o * l), f);
}
function damagePed(n, t, e, i, s, o) {
  if (n.dead || n.killed) return !1;
  if (
    (n.hp === void 0 && (n.hp = n.kind === 4 ? 120 : n.kind === 11 ? 160 : 80),
    (n.hp -= t * (o ? 2.5 : 1)),
    OC(n.x, n.y + (n.state === 'down' ? 0.3 : 1.2), n.z),
    n.hp <= 0)
  ) {
    let r = knockPed(n, e, 1.2, i, 0, 999);
    return (s && pedKilledByPlayer(n), r);
  }
  return (n.kind === 4 || n.kind === 11) && n.state === 'cop'
    ? ((n.flinch = 0.25), !1)
    : (n.state !== 'down' && knockPed(n, e * 0.4, 1.5, i * 0.4, 0, 0), s && n.kind !== 4 && (n.grudge = n.grudge || Math.random() < 0.08), !1);
}
function pedKilledByPlayer(n) {
  ((G.stats.kills = (G.stats.kills || 0) + 1),
    xt(
      'crime',
      n.kind === 4 || n.kind === 11
        ? {
            amt: 2.2,
            why: n.kind === 11 ? '\u968A\u54E1\u6BBA\u5BB3' : '\u8B66\u5B98\u6BBA\u5BB3',
          }
        : {
            amt: 1.3,
            why: '\u6BBA\u4EBA',
          },
    ),
    Math.random() < 0.55 && dropCash(n.x, n.z, Math.round(rt(20, 300)) * 10),
    n.kind === 4 && Math.random() < 0.6 && dropPickup(n.x + 0.6, n.z, 'pistol', 12));
}
function damagePlayer(n, t) {
  let e = G.player;
  if (e.dead || G.dying || G.god) return;
  if (((n *= 1 - Math.min(0.3, ((G.stats && G.stats.fit) || 0) * 0.03)), e.mode === 'car' && e.car)) (damageCar(e.car, n * 0.7), (n *= 0.25));
  else if (e.mode !== 'foot' || e.interior) return;
  let i = Math.min(e.armor || 0, n * 0.7);
  ((e.armor = (e.armor || 0) - i),
    (e.hp -= n - i),
    (G.cam.shake = Math.max(G.cam.shake, 0.18)),
    (G.hurtT = 0.35),
    e.hp <= 0 && xt('wasted', t || '\u6483\u305F\u308C\u305F'));
}
var so = new THREE.Vector3();
function l6(n) {
  let t = Math.sin(n.yaw),
    e = Math.cos(n.yaw),
    i = -e,
    s = t;
  return [n.x + i * 0.24 + t * 0.75, n.y + 1.4, n.z + s * 0.24 + e * 0.75];
}
function BC(n, t) {
  let e = G.cam.yaw,
    i = Math.sin(e),
    s = Math.cos(e),
    o = null,
    r = 1e9;
  for (let a of G.peds) {
    if (a.dead || a.killed) continue;
    let l = a.x - n.x,
      f = a.z - n.z,
      u = Math.hypot(l, f);
    if (u > t || u < 0.5) continue;
    let c = Math.acos(It((l * i + f * s) / u, -1, 1));
    if (c > 0.42) continue;
    let h = a.state === 'cop' || a.state === 'attack' ? 0.35 : 1,
      d = (u + c * 40) * h * (a.state === 'down' ? 3 : 1);
    d < r && rayBuildings(n.x, n.y + 1.4, n.z, a.x, a.y + 1.2, a.z) >= 1 && ((r = d), (o = a));
  }
  return o;
}
function GC(n, t) {
  let [e, i, s] = l6(n);
  if (!G.input.aim || G.touchAim) {
    let c = BC(n, Math.min(t.range, 45));
    if (c) {
      let h = c.state === 'down' ? c.y + 0.25 : c.y + 1.25,
        d = c.x - e,
        p = h - i,
        x = c.z - s,
        m = Math.hypot(d, p, x) || 1;
      return ((G.lockT = c), [d / m, p / m, x / m]);
    }
  }
  ((G.lockT = null), R.camera.getWorldDirection(so));
  let o = R.camera.position,
    r = C3(o.x, o.y, o.z, so.x, so.y, so.z, t.range + 10, !0),
    a = r.x - e,
    l = r.y - i,
    f = r.z - s,
    u = Math.hypot(a, l, f) || 1;
  return r.t < 2 ? [so.x, so.y, so.z] : [a / u, l / u, f / u];
}
function i6(n, t, e, i) {
  if ((INV.clip[e] || 0) <= 0) {
    (INV.ammo[e] || 0) > 0 ? S3(e) : (gt.tone(300, 0.04, 0.08, 'square'), (jn.cool = 0.3));
    return;
  }
  (INV.clip[e]--, (jn.cool = t.rate), (jn.aimT = 2.2), (n.aimPose = t.pose));
  let [s, o, r] = GC(n, t);
  i || (n.yaw = Math.atan2(s, r));
  let [a, l, f] = i ? [n.car.x + s * 1.2, n.car.y + 1.25, n.car.z + r * 1.2] : l6(n);
  (a6(a, l, f, t.pellets ? 1.6 : 1), gt.gun(t.snd, 0), (G.cam.shake = Math.max(G.cam.shake, t.pellets ? 0.25 : 0.08)));
  let u = t.pellets || 1,
    c = n.speed > 3 ? 1.8 : 1;
  for (let h = 0; h < u; h++) {
    let d = t.spread * c,
      p = s + rt(-d, d),
      x = o + rt(-d, d) * 0.7,
      m = r + rt(-d, d),
      g = Math.hypot(p, x, m),
      M = C3(a, l, f, p / g, x / g, m / g, t.range, !0);
    if ((h < 3 && r6(a, l, f, M.x, M.y, M.z), M.kind === 'ped')) {
      let y = M.t < 12 ? 1 : 0.5;
      (damagePed(M.p, t.dmg * (1 - (M.t / t.range) * 0.4), (p / g) * 3 * y, (m / g) * 3 * y, !0, M.head),
        (M.p.kind === 4 || M.p.kind === 11) &&
          xt('crime', {
            amt: 1.6,
            why: '\u8B66\u5B98\u3092\u6483\u3063\u305F',
          }));
    } else if (M.kind === 'car') {
      let y = M.c;
      if (
        (damageCar(y, t.dmg * 0.35),
        Ro(M.x, M.y, M.z, 3),
        isCop(y) &&
          xt('crime', {
            amt: 1.2,
            why: '\u30D1\u30C8\u30AB\u30FC\u3092\u9283\u6483',
          }),
        y.mode === 'ai' && y.driver && Math.random() < 0.35)
      ) {
        (toPhys(y), (y.driver = !1));
        let _ = spawnPedAt(y.x - Math.cos(y.yaw) * (y.td.W / 2 + 0.8), y.z + Math.sin(y.yaw) * (y.td.W / 2 + 0.8));
        _ && ((_.state = 'flee'), (_.t = 8));
      }
    } else M.t < t.range - 0.5 && Ro(M.x, M.y, M.z, 1);
  }
  (xt('crime', {
    amt: 0.9,
    why: '\u767A\u7832',
  }),
    scarePeds(n.x, n.z, 45),
    INV.clip[e] <= 0 && (INV.ammo[e] || 0) > 0 && S3(e));
}
function S3(n) {
  jn.reload > 0 || ((jn.reload = WPN[n].reload), (jn.rid = n), gt.tone(900, 0.04, 0.08, 'square'), gt.tone(500, 0.06, 0.08, 'square', null, 0.5));
}
function reloadNow() {
  let n = INV.cur;
  isGun(n) && (INV.clip[n] || 0) < WPN[n].mag && (INV.ammo[n] || 0) > 0 && S3(n);
}
function VC(n) {
  if ((INV.ammo.grenade || 0) <= 0) {
    (xt('toast', '\u30B0\u30EC\u30CD\u30FC\u30C9\u304C\u306A\u3044'), select('fist', !0));
    return;
  }
  (INV.ammo.grenade--, (jn.cool = 0.9), (n.punch = 0.4), gt.swing(), R.camera.getWorldDirection(so));
  let t = Math.sin(n.yaw),
    e = Math.cos(n.yaw),
    i = 15;
  (H0.push({
    x: n.x + t * 0.5,
    y: n.y + 1.6,
    z: n.z + e * 0.5,
    vx: so.x * i,
    vy: so.y * i + 4.5,
    vz: so.z * i,
    t: 2.6,
  }),
    INV.ammo.grenade <= 0 &&
      setTimeout(() => {
        (INV.ammo.grenade || 0) <= 0 && INV.cur === 'grenade' && select('fist', !0);
      }, 300));
}
function WC(n) {
  for (let t = H0.length - 1; t >= 0; t--) {
    let e = H0[t];
    ((e.t -= n),
      (e.vy -= 20 * n),
      (e.x += e.vx * n),
      (e.y += e.vy * n),
      (e.z += e.vz * n),
      e.y < 0.08 &&
        ((e.y = 0.08),
        isWaterAt(e.x, e.z) && (e.t = Math.min(e.t, 0.05)),
        (e.vy = Math.abs(e.vy) * 0.35),
        (e.vx *= 0.6),
        (e.vz *= 0.6),
        e.vy < 1 && (e.vy = 0)));
    let i = e.x,
      s = e.z,
      o = collideBuildings(e, 0.1, e.y);
    if (o) {
      let r = e.vx * o.nx + e.vz * o.nz;
      r < 0 && ((e.vx -= o.nx * r * 1.6), (e.vz -= o.nz * r * 1.6));
    }
    e.t <= 0 &&
      (H0.splice(t, 1),
      xt('explode', {
        x: e.x,
        y: e.y,
        z: e.z,
        byPlayer: !0,
      }));
  }
  o6.forEach((t, e) => {
    let i = H0[e];
    ((t.visible = !!i), i && t.position.set(i.x, i.y, i.z));
  });
}
function melee(n) {
  let t = curW(),
    e = Math.sin(n.yaw),
    i = Math.cos(n.yaw),
    s = [];
  pedsNear(n.x, n.z, 3, s);
  let o = !1;
  for (let r of s) {
    if (r.state === 'down' || r.dead) continue;
    let a = r.x - n.x,
      l = r.z - n.z,
      f = a * e + l * i,
      u = Math.abs(-a * i + l * e);
    f > 0 &&
      f < t.range &&
      u < 0.85 &&
      ((o = !0),
      !damagePed(r, t.dmg * (r.kind === 4 && t.dmg < 10 ? 0.5 : 1), e * (t.dmg > 20 ? 4 : 3), i * (t.dmg > 20 ? 4 : 3), !0) &&
        r.state !== 'down' &&
        knockPed(r, e * 3, 2.5, i * 3, 0, 0));
  }
  if (t.dmg > 20) {
    carsNear(n.x, n.z, 4, d1);
    for (let r of d1) {
      let a = r.x - n.x,
        l = r.z - n.z;
      a * e + l * i > 0 &&
        Math.hypot(a, l) < r.td.L / 2 + 1.2 &&
        (damageCar(r, 6),
        Ro(n.x + e * 1.2, n.y + 1, n.z + i * 1.2, 2),
        (o = !0),
        r.mode === 'ai' && r.driver && !r.angry && Math.random() < 0.4 && ((r.angry = !0), xt('angry', r)));
    }
  }
  return o;
}
function npcShoot(n, t, e, i, s, o) {
  let r = G.player,
    a = r.mode === 'car' && r.car ? r.car : r,
    l = (a.y || 0) + (a === r ? 1.2 : 0.9),
    f = a.x - n,
    u = l - t,
    c = a.z - e,
    h = Math.hypot(f, u, c) || 1;
  ((f /= h), (u /= h), (c /= h));
  let d = Math.random() < i,
    p = d ? 0.004 : 0.06,
    x = f + rt(-p, p),
    m = u + rt(-p, p),
    g = c + rt(-p, p),
    M = C3(n, t, e, x, m, g, h + 6, a !== r);
  (a6(n, t, e, 0.8),
    r6(n, t, e, M.x, M.y, M.z, [1, 0.7, 0.4]),
    gt.gun('pistol', Math.hypot(n - r.x, e - r.z)),
    M.kind === 'player' || (M.kind === 'car' && M.c === r.car)
      ? damagePlayer(s, o || '\u8B66\u5B98\u306B\u6483\u305F\u308C\u305F')
      : M.kind === 'ped'
        ? damagePed(M.p, s, x * 2, g * 2, !1)
        : M.kind === 'car'
          ? (damageCar(M.c, s * 0.3), Ro(M.x, M.y, M.z, 2))
          : Ro(M.x, M.y, M.z, 1));
}
G.npcShoot = npcShoot;
G.copShoot = (n) => {
  let t = G.player,
    e = Math.sin(n.yaw),
    i = Math.cos(n.yaw),
    s = Math.hypot(t.x - n.x, t.z - n.z),
    o = t.mode === 'car' && t.car ? Math.abs(t.car.v) : t.speed;
  npcShoot(
    n.x + e * 0.6 - i * 0.2,
    n.y + 1.4,
    n.z + i * 0.6 + e * 0.2,
    It((n.kind === 11 ? 0.72 : 0.62) - s * 0.014 - o * 0.03, 0.08, 0.7),
    (n.kind === 11 ? 11 : 7) + Ke(),
    n.kind === 11 ? '\u81EA\u885B\u968A\u54E1\u306B\u6483\u305F\u308C\u305F' : '\u8B66\u5B98\u306B\u6483\u305F\u308C\u305F',
  );
};
G.damagePlayer = (n, t) => damagePlayer(n, t);
var XC = (n, t) => fe(n, t),
  qC = [
    [35.6655, 139.6985, 'health'],
    [35.6735, 139.6955, 'bat'],
    [35.6588, 139.7016, 'armor'],
    [35.6945, 139.702, 'pistol', 24],
    [35.693, 139.7005, 'health'],
    [35.711, 139.7725, 'armor'],
    [35.7135, 139.7735, 'bat'],
    [35.6995, 139.7735, 'smg', 60],
    [35.729, 139.7145, 'health'],
    [35.727, 139.7105, 'pistol', 24],
    [35.6735, 139.756, 'health'],
    [35.656, 139.748, 'armor'],
    [35.628, 139.776, 'shotgun', 16],
    [35.629, 139.773, 'health'],
    [35.6205, 139.784, 'grenade', 3],
    [35.682, 139.768, 'health'],
    [35.6665, 139.777, 'armor'],
    [35.6475, 139.7095, 'pistol', 24],
    [35.639, 139.739, 'health'],
    [35.6, 139.734, 'rifle', 60],
    [35.552, 139.765, 'armor'],
    [35.7105, 139.7965, 'health'],
    [35.687, 139.722, 'health'],
    [35.6655, 139.7295, 'armor'],
    [35.645, 139.698, 'health'],
    [35.7, 139.759, 'grenade', 3],
    [35.658, 139.727, 'health'],
    [35.72, 139.783, 'pistol', 24],
    [35.61, 139.748, 'smg', 60],
    [35.6715, 139.702, 'armor'],
  ],
  B0 = [],
  qf = null,
  u1 = {
    health: [3134314, [0.2, 1, 0.4]],
    armor: [3836927, [0.3, 0.6, 1]],
    cash: [5824634, [0.4, 1, 0.5]],
    bat: [13159634, [1, 1, 1]],
    pistol: [16756784, [1, 0.7, 0.2]],
    smg: [16756784, [1, 0.7, 0.2]],
    shotgun: [16756784, [1, 0.7, 0.2]],
    rifle: [16756784, [1, 0.7, 0.2]],
    grenade: [16734778, [1, 0.35, 0.2]],
  };
function $C() {
  qf = {
    geo: {
      health: new THREE.BoxGeometry(0.45, 0.45, 0.45),
      armor: new THREE.OctahedronGeometry(0.32),
      cash: new THREE.BoxGeometry(0.4, 0.12, 0.25),
      gun: new THREE.BoxGeometry(0.12, 0.2, 0.55),
      grenade: new THREE.SphereGeometry(0.18, 10, 8),
    },
    mats: {},
  };
  for (let t in u1)
    qf.mats[t] = new THREE.MeshStandardMaterial({
      color: u1[t][0],
      emissive: u1[t][0],
      emissiveIntensity: 0.45,
      roughness: 0.4,
    });
  for (let [t, e, i, s] of qC) {
    let [o, r] = XC(t, e),
      a = [];
    roadsNear(o, r, 40, a);
    let l = o,
      f = r,
      u = a.filter((c) => !c.e.elev).sort((c, h) => c.d - h.d)[0];
    if (u && !isWaterAt(u.x, u.z)) {
      let c = u.e,
        [h, d] = c.pts[u.j],
        [p, x] = c.pts[u.j + 1],
        m = Math.hypot(p - h, x - d) || 1;
      ((l = u.x - ((x - d) / m) * (c.hw + 1.2)), (f = u.z + ((p - h) / m) * (c.hw + 1.2)));
    }
    I3(l, f, i, s, !0);
  }
}
function I3(n, t, e, i, s) {
  let o = e === 'health' || e === 'armor' || e === 'cash' || e === 'grenade' ? qf.geo[e] : qf.geo.gun,
    r = new THREE.Mesh(o, qf.mats[e]);
  (r.position.set(n, 0.7, t), (r.castShadow = !0), (r.visible = !1), R.scene.add(r));
  let a = {
    x: n,
    z: t,
    kind: e,
    amt: i,
    fixed: s,
    on: !0,
    m: r,
    t: 0,
    life: s ? 0 : 60,
    glow: u1[e][1],
  };
  return (B0.push(a), a);
}
function dropCash(n, t, e) {
  I3(n + rt(-0.4, 0.4), t + rt(-0.4, 0.4), 'cash', e, !1);
}
function dropPickup(n, t, e, i) {
  I3(n, t, e, i, !1);
}
function YC(n) {
  let t = G.player,
    e = t.x,
    i = t.z,
    s = t.mode === 'foot' && !t.interior;
  for (let o = B0.length - 1; o >= 0; o--) {
    let r = B0[o];
    if (!r.on) {
      ((r.t -= n), r.t <= 0 && (r.on = !0), (r.m.visible = !1));
      continue;
    }
    if (!r.fixed && ((r.life -= n), r.life <= 0)) {
      (R.scene.remove(r.m), B0.splice(o, 1));
      continue;
    }
    let a = Math.hypot(r.x - e, r.z - i);
    ((r.near = a < 160),
      (r.m.visible = r.near && !t.interior),
      r.near && ((r.m.rotation.y = G.t * 2), (r.m.position.y = 0.7 + Math.sin(G.t * 3 + o) * 0.1)),
      s && a < 1.4 && Math.abs(t.y - 0.2) < 2 && KC(r) && (r.fixed ? ((r.on = !1), (r.t = 240)) : (R.scene.remove(r.m), B0.splice(o, 1))));
  }
}
function KC(n) {
  let t = G.player,
    e = n.kind;
  if (e === 'health') {
    if (t.hp >= 100) return !1;
    ((t.hp = 100), xt('toast', '\u4F53\u529B\u304C\u56DE\u5FA9\u3057\u305F'));
  } else if (e === 'armor') {
    if ((t.armor || 0) >= 100) return !1;
    ((t.armor = 100), xt('toast', '\u30DC\u30C7\u30A3\u30A2\u30FC\u30DE\u30FC\u3092\u88C5\u7740\u3057\u305F'));
  } else {
    if (e === 'cash') return ((G.money += n.amt), gt.cash(), xt('toast', `+\xA5${n.amt.toLocaleString('ja-JP')}`), !0);
    (giveWeapon(e, n.amt), xt('toast', `${WPN[e].name}\u3092\u62FE\u3063\u305F`));
  }
  return (gt.blip(), !0);
}
function initWeapons() {
  (FC(), $C());
}
function updWeapons(n) {
  let t = G.player,
    e = G.input;
  ((jn.cool -= n),
    (G.hurtT = Math.max(0, (G.hurtT || 0) - n)),
    jn.reload > 0 && ((jn.reload -= n), jn.reload <= 0 && (s6(jn.rid), gt.tone(700, 0.05, 0.1, 'square'))),
    (jn.aimT -= n));
  let i = INV.cur,
    s = WPN[i],
    o = t.mode === 'foot' && !t.interior && t.down <= 0 && !G.dying && !G.noWeapons,
    r = t.mode === 'car' && t.car && !G.dying && (i === 'pistol' || i === 'smg') && e.aim;
  ((t.aimPose = o && isGun(i) && (e.aim || jn.aimT > 0) ? s.pose : 0), o && e.aim && isGun(i) && (t.yaw = G.cam.yaw));
  let a = s.auto ? e.fireHeld : e.firePressed;
  (jn.cool <= 0 && jn.reload <= 0 && a && (o ? (isGun(i) ? i6(t, s, i, !1) : s.throw && VC(t)) : r && i6(t, s, i, !0)), WC(n), YC(n), HC(n));
}
function hudInfo() {
  let n = INV.cur,
    t = WPN[n];
  return n === 'fist'
    ? null
    : {
        name: t.name,
        ammo: isGun(n) ? `${INV.clip[n] || 0}<small> / ${INV.ammo[n] || 0}</small>` : t.throw ? `\xD7${INV.ammo[n] || 0}` : '',
        reload: jn.reload > 0,
      };
}
function aimingNow() {
  return G.player.aimPose > 0;
}
var player_P = {
  x: 0,
  y: 0.18,
  z: 0,
  vy: 0,
  yaw: 0,
  mode: 'foot',
  car: null,
  hp: 100,
  armor: 0,
  down: 0,
  punch: 0,
  onGround: !0,
  speed: 0,
  dead: 0,
  train: null,
  trainCar: 1,
  air: null,
  interior: null,
  walkAmp: 0,
  walkFreq: 7,
};
G.player = player_P;
var hr = null;
function initPlayer() {
  hr = makePlayerMesh();
}
function setPlayerColor(n) {
  hr && (hr.setColorAt(0, new THREE.Color(n)), (hr.instanceColor.needsUpdate = !0), (G.playerColor = n));
}
var W0 = [],
  X0 = [];
function updFoot(n) {
  let t = G.input;
  if (player_P.down > 0) {
    ((player_P.down -= n),
      (player_P.vy -= 20 * n),
      (player_P.x += player_P.vx * n),
      (player_P.z += player_P.vz * n),
      (player_P.y += player_P.vy * n),
      player_P.y < 0.18 && ((player_P.y = 0.18), (player_P.vy = 0), (player_P.vx *= 0.8), (player_P.vz *= 0.8)),
      collideBuildings(player_P, 0.35, player_P.y),
      (player_P.speed = 0));
    return;
  }
  let e = G.cam.yaw,
    i = Math.sin(e),
    s = Math.cos(e),
    o = -s,
    r = i,
    a = i * t.my + o * t.mx,
    l = s * t.my + r * t.mx,
    f = Math.min(1, Math.hypot(a, l)),
    u = t.sprint || f > 0.95,
    c = f * (u ? 6.6 : 2.8),
    h = Math.hypot(a, l) || 1;
  ((a /= h), (l /= h));
  let d = player_P.x,
    p = player_P.z;
  (f > 0.05 && ((player_P.x += a * c * n), (player_P.z += l * c * n), (player_P.yaw += ln(Math.atan2(a, l) - player_P.yaw) * Math.min(1, n * 12))),
    player_P.punch > 0 && (player_P.punch -= n),
    !player_P.interior && !player_P.deck && collideBuildings(player_P, 0.35, player_P.y - 0.18),
    !player_P.interior &&
      !player_P.deck &&
      (isWaterAt(player_P.x, player_P.z) && !JC(player_P.x, player_P.z) && ((player_P.x = d), (player_P.z = p)),
      (player_P.x = It(player_P.x, xn.x0, xn.x1)),
      (player_P.z = It(player_P.z, xn.z0, xn.z1))),
    (player_P.vy -= 22 * n),
    (player_P.y += player_P.vy * n));
  let x = player_P.interior ? player_P.interior.by : player_P.deck ? player_P.deck.y : groundAt(player_P.x, player_P.z);
  (player_P.y <= x ? ((player_P.y = x), (player_P.vy = 0), (player_P.onGround = !0)) : (player_P.onGround = !1),
    t.jump && player_P.onGround && ((player_P.vy = 6.6), (player_P.onGround = !1)),
    (player_P.speed = f * c),
    (player_P.walkAmp = f > 0.05 && player_P.onGround ? (u ? 0.85 : 0.5) : 0),
    (player_P.walkFreq = u ? 11 : 6.5),
    pedsNear(player_P.x, player_P.z, 1.2, X0));
  for (let m of X0) {
    let g = m.x - player_P.x,
      M = m.z - player_P.z,
      y = Math.hypot(g, M);
    y < 0.6 && y > 0.01 && m.state !== 'down' && ((m.x += (g / y) * (0.6 - y)), (m.z += (M / y) * (0.6 - y)));
  }
  carsNear(player_P.x, player_P.z, 8, W0);
  for (let m of W0) {
    if (Math.abs(m.y - player_P.y) > 2 || player_P.deck) continue;
    let g = Math.sin(m.yaw),
      M = Math.cos(m.yaw),
      y = player_P.x - m.x,
      _ = player_P.z - m.z,
      v = y * g + _ * M,
      b = y * -M + _ * g,
      w = m.td.W / 2 + 0.35,
      E = m.td.L / 2 + 0.35;
    if (Math.abs(b) < w && Math.abs(v) < E && player_P.y < m.y + m.td.H) {
      let C = w - Math.abs(b),
        S = E - Math.abs(v);
      if (C < S) {
        let T = Math.sign(b) || 1;
        ((player_P.x += -M * T * C), (player_P.z += g * T * C));
      } else {
        let T = Math.sign(v) || 1;
        ((player_P.x += g * T * S), (player_P.z += M * T * S));
      }
    }
  }
}
function JC(n, t) {
  let e = [];
  roadsNear(n, t, 16, e);
  for (let i of e) if (!i.e.elev && i.d < i.e.hw + 4) return !0;
  return !1;
}
function groundAt(n, t) {
  let e = [];
  roadsNear(n, t, 14, e);
  let i = !1;
  for (let s of e)
    if (!s.e.elev && s.d < s.e.hw) {
      i = !0;
      break;
    }
  return i ? 0.04 : 0.18;
}
function doPunch() {
  player_P.punch > 0 ||
    player_P.down > 0 ||
    ((player_P.punch = 0.4),
    gt.swing(),
    setTimeout(() => {
      if (player_P.mode !== 'foot') return;
      melee(player_P) &&
        (gt.thud(),
        xt('crime', {
          amt: 0.55,
          why: '\u66B4\u884C',
        }),
        scarePeds(player_P.x, player_P.z, 18),
        xt('punchHit'));
    }, 160));
}
function knockPlayer(n, t, e, i) {
  player_P.down > 0 ||
    player_P.dead ||
    ((player_P.down = 2.2),
    (player_P.vx = n),
    (player_P.vy = t),
    (player_P.vz = e),
    (player_P.hp -= i),
    gt.thud(),
    (G.cam.shake = 0.5),
    player_P.hp <= 0 && xt('wasted', '\u306F\u306D\u3089\u308C\u305F'));
}
function tryEnter() {
  if (player_P.mode === 'foot' && player_P.down <= 0) {
    for (let i of G.aircraft) {
      if (i.kind === 'parked' && Math.hypot(i.x - player_P.x, i.z - player_P.z) < 30)
        return (
          (player_P.air = startPlane(i)),
          (player_P.mode = 'plane'),
          gt.door(),
          xt(
            'toast',
            '\u6A5F\u9577\u3068\u3057\u3066\u642D\u4E57\uFF1AShift \u3067\u30B9\u30ED\u30C3\u30C8\u30EB\u3001W/S \u3067\u6A5F\u9996\u3001A/D \u3067\u65CB\u56DE',
          ),
          G.stats.flights++,
          xt('enterPlane'),
          !0
        );
      if (i.kind === 'heli' && !i.crashed && Math.hypot(i.x - player_P.x, i.z - player_P.z) < 6 && Math.abs(i.y - player_P.y) < 3)
        return (
          (player_P.air = startHeli(i)),
          (player_P.mode = 'heli'),
          gt.door(),
          xt('toast', '\u30D8\u30EA\u306B\u642D\u4E57\uFF1AShift \u4E0A\u6607 / Ctrl \u4E0B\u964D\u3001W/S/A/D \u3067\u79FB\u52D5'),
          xt('enterHeli'),
          !0
        );
    }
    carsNear(player_P.x, player_P.z, 7, W0);
    let n = null,
      t = 5;
    for (let i of W0) {
      if (i.dead || i.sink || i.burn || Math.abs(i.y - player_P.y) > 2) continue;
      let s = Math.hypot(i.x - player_P.x, i.z - player_P.z) - i.td.L * 0.25;
      s < t && ((t = s), (n = i));
    }
    if (!n) return !1;
    let e = n;
    if (e.mode === 'ai' && e.driver) {
      let i = -Math.cos(e.yaw),
        s = Math.sin(e.yaw),
        o = spawnPedAt(e.x + i * (e.td.W / 2 + 0.8), e.z + s * (e.td.W / 2 + 0.8));
      (o && ((o.state = 'flee'), (o.t = 6)),
        xt(
          'crime',
          isCop(e)
            ? {
                amt: 2.2,
                why: '\u30D1\u30C8\u30AB\u30FC\u5F37\u596A',
              }
            : {
                amt: 1,
                why: '\u8ECA\u4E21\u5F37\u596A',
                minor: !0,
              },
        ));
    }
    return (
      gt.door(),
      (e.driver = !1),
      toPhys(e),
      (e.ctl = 'player'),
      (e.siren = !1),
      (e.parked = !1),
      (player_P.car = e),
      (player_P.mode = 'car'),
      xt('toast', `${e.td.name}\u306B\u4E57\u3063\u305F`),
      xt('enterCar', e),
      !0
    );
  }
  if (player_P.mode === 'car') {
    let n = player_P.car;
    if (Math.abs(n.v) > 9) return (xt('toast', '\u901F\u3059\u304E\u3066\u964D\u308A\u3089\u308C\u307E\u305B\u3093'), !0);
    let t = -Math.cos(n.yaw),
      e = Math.sin(n.yaw),
      i = n.x + t * (n.td.W / 2 + 0.7),
      s = n.z + e * (n.td.W / 2 + 0.7);
    return (
      (rayBuildings(n.x, n.y + 1, n.z, i, n.y + 1, s) < 1 || isWaterAt(i, s)) &&
        ((i = n.x - t * (n.td.W / 2 + 0.7)), (s = n.z - e * (n.td.W / 2 + 0.7))),
      (n.ctl = null),
      (player_P.car = null),
      (player_P.mode = 'foot'),
      (player_P.x = i),
      (player_P.z = s),
      (player_P.y = n.y + 0.15),
      (player_P.yaw = n.yaw),
      gt.door(),
      xt('exitCar', n),
      !0
    );
  }
  if (player_P.mode === 'plane' || player_P.mode === 'heli') {
    let n = player_P.air;
    if ((player_P.mode === 'plane' ? n.v : Math.hypot(n.vx, n.vz)) > 3 || (player_P.mode === 'heli' && n.y - groundUnder(n.x, n.z, n.y).g > 1))
      return (xt('toast', '\u7740\u5730\u3057\u3066\u6B62\u307E\u3063\u3066\u304B\u3089\u964D\u308A\u3089\u308C\u307E\u3059'), !0);
    if (player_P.mode === 'plane') {
      let e = G.aircraft.find((i) => i.m === n.m);
      e && ((e.kind = 'parked'), (e.x = n.x), (e.z = n.z), (e.y = n.y));
    }
    return (
      (player_P.x = n.x + Math.cos(n.yaw) * 5),
      (player_P.z = n.z - Math.sin(n.yaw) * 5),
      (player_P.y = n.y + 0.2),
      (player_P.mode = 'foot'),
      (player_P.air = null),
      gt.door(),
      !0
    );
  }
  return !1;
}
function boardTrain(n, t, e) {
  let i = nearestStation();
  if (!i) return !1;
  let s = i.st.complex.lines.find((a) => a.rail === n);
  if (!s) return !1;
  let o = s.st,
    r =
      G.trains
        .filter((a) => a.r === n && a.dir === t && (a.type || null) === (e || null) && !a.drive)
        .sort((a, l) => Math.abs(a.s - o.s) - Math.abs(l.s - o.s))[0] ||
      G.trains.filter((a) => a.r === n && a.dir === t && !a.drive).sort((a, l) => Math.abs(a.s - o.s) - Math.abs(l.s - o.s))[0];
  return (
    r || (r = G.trains.find((a) => a.r === n)),
    r
      ? ((r.dir = t),
        (r.s = o.s),
        (r.state = 'dwell'),
        (r.dwell = 6),
        (r.cur = o),
        (r.v = 0),
        (r.atEnd = !1),
        (player_P.mode = 'train'),
        (player_P.train = r),
        (player_P.trainCar = Math.min(2, r.cars - 1)),
        G.stats.rides++,
        gt.melody(),
        xt('boardTrain', {
          tr: r,
          st: o,
        }),
        xt(
          'toast',
          `${n.ja} ${terminusName(r)} \u306B\u4E57\u8ECA\u3002F \u3067\u6B21\u306E\u99C5\u3078\u3001\u505C\u8ECA\u4E2D\u306B F \u3067\u4E0B\u8ECA`,
        ),
        !0)
      : !1
  );
}
function leaveTrain() {
  let n = player_P.train;
  if (!n) return;
  if (n.state !== 'dwell') {
    xt('toast', '\u99C5\u306B\u505C\u8ECA\u4E2D\u306E\u307F\u964D\u308A\u3089\u308C\u307E\u3059');
    return;
  }
  ((n.drive = !1), (n.doors = !1));
  let t = n.cur,
    e = t && t.complex ? t.complex : null;
  (hideInterior(), (player_P.mode = 'foot'), (player_P.train = null));
  let i = e && e.entrances[0];
  (i ? ((player_P.x = i.x + 2), (player_P.z = i.z + 2)) : ((player_P.x = t.x + 12), (player_P.z = t.z + 12)),
    (player_P.y = 0.2),
    gt.chime(),
    xt('alight', {
      st: t,
      S: e,
    }),
    xt('toast', `${t.ja}\u99C5\u3067\u4E0B\u8ECA`));
}
function nearestStation(n = 26) {
  let t = null,
    e = n;
  for (let i of W.stations)
    for (let s of i.entrances || []) {
      let o = Math.hypot(s.x - player_P.x, s.z - player_P.z);
      o < e &&
        ((e = o),
        (t = {
          S: i,
          en: s,
          st: i.lines[0].st,
        }));
    }
  return t;
}
var V0 = new THREE.Vector3();
function updCamera(n) {
  let t = G.cam,
    e = R.camera,
    i,
    s,
    o,
    r,
    a = 0;
  if (t.free) {
    (e.position.set(t.free[0], t.free[1], t.free[2]), e.lookAt(t.free[3], t.free[4], t.free[5]));
    return;
  }
  let l = G.t - t.lastDrag > 1.5 && G.settings.autoCam !== !1;
  if (
    ((t.zoomT = It((t.zoomT || 1) + G.input.zoom * 0.1 + (G.input.zoomK || 0) * n * 1.2, 0.35, 3.2)),
    (t.dist = Ee(t.dist || 1, t.zoomT, Math.min(1, n * 8))),
    t.fp && ((player_P.mode === 'foot' && !player_P.interior && !player_P.deck && player_P.down <= 0) || (player_P.mode === 'car' && player_P.car)))
  ) {
    let y, _, v, b;
    if (player_P.mode === 'car') {
      let C = player_P.car,
        S = Math.sin(C.yaw),
        T = Math.cos(C.yaw);
      (t.lastYawFp !== void 0 && (t.fpYaw = It((t.fpYaw || 0) + ln(t.yaw - t.lastYawFp), -2.6, 2.6)),
        (t.lastYawFp = t.yaw),
        (t.fpYaw = l ? Ee(t.fpYaw || 0, 0, Math.min(1, n * 2)) : t.fpYaw || 0),
        (y = C.x - T * -0.36 + S * (0.05 - C.td.L * 0.04)),
        (v = C.z + S * -0.36 + T * (0.05 - C.td.L * 0.04)),
        (_ = C.y + Math.min(C.td.H - 0.3, 1.18) + (C.t === 'bus' || C.t === 'truck' ? 0.9 : 0)),
        (b = C.yaw + (t.fpYaw || 0)));
    } else
      ((y = player_P.x + Math.sin(player_P.yaw) * 0.12),
        (v = player_P.z + Math.cos(player_P.yaw) * 0.12),
        (_ = player_P.y + 1.64 + Math.sin(G.t * player_P.walkFreq) * 0.03 * player_P.walkAmp),
        (b = t.yaw));
    let w = It(t.pitch - 0.25, -1.2, 1.2);
    (e.position.set(y, _, v),
      V0.set(y + Math.sin(b) * Math.cos(w), _ - Math.sin(w), v + Math.cos(b) * Math.cos(w)),
      e.lookAt(V0),
      (t.x = y),
      (t.y = _),
      (t.z = v));
    let E = (G.settings.fov || 60) + 10 + (innerHeight > innerWidth ? 12 : 0);
    Math.abs(E - e.fov) > 0.2 && ((e.fov = Ee(e.fov, E, Math.min(1, n * 4))), e.updateProjectionMatrix(), Wf());
    return;
  }
  if (player_P.interior) ((i = player_P.x), (s = player_P.y + 1.55), (o = player_P.z), (r = 3.2));
  else if (player_P.deck) ((i = player_P.x), (s = player_P.y + 1.6), (o = player_P.z), (r = 3.4 * Math.min(1.3, t.dist)));
  else if (player_P.mode === 'boat' && player_P.boat) {
    let y = player_P.boat;
    ((i = y.x),
      (o = y.z),
      (s = y.y + 1.6 + y.td.L * 0.06),
      (a = Math.abs(y.v)),
      (r = (5 + y.td.L * 0.7 + Math.min(4, a * 0.1)) * t.dist),
      l && a > 1.5 && ((t.yaw += ln(y.yaw - t.yaw) * Math.min(1, n * 1.8)), (t.pitch = Ee(t.pitch, 0.22, Math.min(1, n)))));
  } else if ((player_P.mode === 'car' || player_P.mode === 'ride') && player_P.car) {
    let y = player_P.car;
    ((i = y.x),
      (o = y.z),
      (s = y.y + 1.3 + y.td.L * 0.07),
      (a = Math.abs(y.v)),
      (r = (5.6 + y.td.L * 0.75 + Math.min(5, a * 0.06)) * t.dist),
      l && a > 2 && ((t.yaw += ln(y.yaw - t.yaw) * Math.min(1, n * 2.4)), (t.pitch = Ee(t.pitch, 0.2, Math.min(1, n * 1.2)))));
  } else if (player_P.mode === 'train' && player_P.train && player_P.train.drive && t.inside) {
    let y = player_P.train,
      _ = y.carPos[0],
      v = Math.sin(_.yaw),
      b = Math.cos(_.yaw),
      w = y.spec.carL / 2 - 1.4,
      E = _.x + v * w,
      C = _.z + b * w,
      S = _.y + 2.45,
      T = _.yaw + It(ln(t.yaw - _.yaw), -1.2, 1.2) * (l ? 0 : 1);
    (l && (t.yaw = _.yaw),
      e.position.set(E, S, C),
      V0.set(E + Math.sin(T) * 10, S - 0.6 - (t.pitch - 0.25) * 4, C + Math.cos(T) * 10),
      e.lookAt(V0),
      (t.x = E),
      (t.y = S),
      (t.z = C),
      cabMode(y));
    return;
  } else if (player_P.mode === 'train' && player_P.train) {
    let y = player_P.train.carPos[player_P.trainCar] || player_P.train.carPos[0];
    t.inside
      ? ((i = y.x), (o = y.z), (s = y.y + 2.6), (r = 0.01))
      : ((i = y.x), (o = y.z), (s = y.y + 3), (r = 26 * t.dist), l && (t.yaw += ln(y.yaw - t.yaw) * Math.min(1, n * 0.8)));
  } else if ((player_P.mode === 'plane' || player_P.mode === 'heli') && player_P.air) {
    let y = player_P.air;
    ((i = y.x),
      (s = y.y + (player_P.mode === 'plane' ? 6 : 2.5)),
      (o = y.z),
      (r = (player_P.mode === 'plane' ? 55 : 16) * t.dist),
      (a = player_P.mode === 'plane' ? y.v * 0.2 : 0),
      l &&
        ((t.yaw += ln(y.yaw - t.yaw) * Math.min(1, n * 2)),
        (t.pitch = Ee(t.pitch, player_P.mode === 'plane' ? 0.18 - y.pitch * 0.4 : 0.3, Math.min(1, n * 1.5)))));
  } else if (player_P.aimPose > 0 && G.input.aim) {
    let y = -Math.cos(t.yaw),
      _ = Math.sin(t.yaw);
    ((i = player_P.x + y * 0.62), (o = player_P.z + _ * 0.62), (s = player_P.y + 1.6), (r = 2.3 * Math.min(1.4, t.dist)));
  } else
    ((i = player_P.x),
      (o = player_P.z),
      (s = player_P.y + 1.6),
      (r = 4.8 * t.dist),
      (a = player_P.speed),
      l && G.input.my > 0.4 && (t.yaw += ln(player_P.yaw - t.yaw) * Math.min(1, n * 0.9)));
  let f = Math.cos(t.pitch),
    u = Math.sin(t.pitch),
    c = Math.sin(t.yaw),
    h = Math.cos(t.yaw),
    d = i - c * r * f,
    p = s + r * u,
    x = o - h * r * f;
  if (!player_P.interior && !player_P.deck && r > 1) {
    let y = rayBuildings(i, s, o, d, p, x);
    if (y < 1) {
      let _ = Math.max(0.08, y - 0.06);
      ((d = i + (d - i) * _), (p = s + (p - s) * _), (x = o + (x - o) * _));
    }
    p = Math.max(p, player_P.y > 3 ? 0.4 : 0.6);
  }
  if (player_P.interior) {
    let y = player_P.interior;
    ((d = It(d, y.bx0 + 0.4, y.bx1 - 0.4)), (x = It(x, y.bz0 + 0.4, y.bz1 - 0.4)), (p = Math.min(p, y.by + 2.8)));
  }
  let m = 1 - Math.exp(-n * (player_P.mode === 'plane' ? 8 : 16));
  ((t.x = Ee(t.x, d, m)),
    (t.y = Ee(t.y, p, m)),
    (t.z = Ee(t.z, x, m)),
    (Math.hypot(t.x - d, t.z - x) > 40 || t.snap) && ((t.x = d), (t.y = p), (t.z = x), (t.snap = !1)),
    (t.shake = Math.max(0, (t.shake || 0) - n * 1.8)));
  let g = t.shake * 0.35;
  (e.position.set(t.x + (Math.random() - 0.5) * g, t.y + (Math.random() - 0.5) * g, t.z + (Math.random() - 0.5) * g),
    r < 0.05
      ? (e.position.set(i, s, o),
        V0.set(i + Math.sin(t.yaw) * Math.cos(t.pitch), s - Math.sin(t.pitch) * 0.5, o + Math.cos(t.yaw) * Math.cos(t.pitch)),
        e.lookAt(V0))
      : e.lookAt(i, s, o));
  let M = (G.settings.fov || 60) + Math.min(16, a * 0.22) + (innerHeight > innerWidth ? 12 : 0);
  Math.abs(M - e.fov) > 0.2 && ((e.fov = Ee(e.fov, M, Math.min(1, n * 3))), e.updateProjectionMatrix(), Wf());
}
function renderPlayer() {
  if (!hr) return;
  let n = player_P.mode === 'foot' && !(G.cam.fp && !player_P.interior),
    t = new THREE.Object3D();
  (t.position.set(player_P.x, player_P.y + (player_P.down > 0 ? 0.12 : 0), player_P.z),
    player_P.down > 0 ? t.rotation.set(-Math.PI / 2, player_P.yaw, 0, 'YXZ') : t.rotation.set(0, player_P.yaw, 0),
    t.scale.setScalar(n ? 1 : 0),
    t.updateMatrix(),
    hr.setMatrixAt(0, t.matrix),
    (hr.instanceMatrix.needsUpdate = !0));
  let e = hr.userData.w.array;
  ((e[0] = 0),
    (e[1] = player_P.down > 0 ? 0 : player_P.walkAmp),
    (e[2] = player_P.walkFreq),
    (e[3] =
      player_P.aimPose === 2
        ? 2
        : player_P.aimPose === 1
          ? 1
          : player_P.punch > 0
            ? Math.sin(((0.4 - player_P.punch) / 0.4) * Math.PI)
            : rn.uRain.value > 0.3 && player_P.speed < 3
              ? -1
              : 0),
    (hr.userData.w.needsUpdate = !0));
}
function nearPolice(n) {
  return G.cars.some((t) => isCop(t) && !t.removed && !t.dead && Math.hypot(t.x - player_P.x, t.z - player_P.z) < n);
}
function player_crime(n, t, e) {
  crime(n, t, e);
}
function managePolice(n) {
  updatePolice(n);
}
G.hitPlayer = (n, t) => {
  if (player_P.mode !== 'foot' || player_P.interior || player_P.dead) return;
  t *= 1 - Math.min(0.3, ((G.stats && G.stats.fit) || 0) * 0.03);
  let e = Math.min(player_P.armor || 0, t * 0.5);
  ((player_P.armor = (player_P.armor || 0) - e), (player_P.hp -= t - e), gt.thud(), (G.hurtT = 0.3), (G.cam.shake = Math.max(G.cam.shake, 0.3)));
  let i = player_P.x - n.x,
    s = player_P.z - n.z,
    o = Math.hypot(i, s) || 1;
  ((player_P.x += (i / o) * 0.4),
    (player_P.z += (s / o) * 0.4),
    Math.random() < 0.25 && knockPlayer((i / o) * 3, 2.5, (s / o) * 3, 0),
    player_P.hp <= 0 && xt('wasted', n.kind === 4 ? '\u8B66\u5B98\u306B\u5236\u5727\u3055\u308C\u305F' : '\u55A7\u5629\u306B\u8CA0\u3051\u305F'));
};
function managePopulation(n, t) {
  let e = R.Q,
    i = e.view * 0.42,
    s = 0;
  for (let h = G.cars.length - 1; h >= 0; h--) {
    let d = G.cars[h];
    if (d.removed) {
      G.cars.splice(h, 1);
      continue;
    }
    if (d === player_P.car) continue;
    let p = Math.hypot(d.x - player_P.x, d.z - player_P.z),
      x = d.ctl === 'police' || d.keep ? 360 : i + 90;
    if (p > x || d.sink > 4 || (d.mode === 'phys' && !d.ctl && p > 220 && !d.keep)) {
      (freeCar(d), G.cars.splice(h, 1));
      continue;
    }
    d.mode === 'ai' && s++;
  }
  let o = R.tod,
    r = o < 5 ? 0.35 : o < 6.5 || o > 23 ? 0.55 : o > 21 ? 0.8 : (o > 7 && o < 9.5) || (o > 17 && o < 19.5) ? 1.15 : 1,
    a = G.densityAt ? G.densityAt(player_P.x, player_P.z) : 0.6,
    l = It(0.4 + a * 0.85, 0.4, 1.25),
    f = 0,
    u = (player_P.mode === 'plane' || player_P.mode === 'heli' ? e.cars * 0.5 : e.cars) * r * l;
  for (; s < u && f++ < (t ? 400 : 6);) {
    let h = Math.random() * Math.PI * 2,
      d = t ? rt(20, i) : rt(i * 0.55, i),
      p = player_P.x + Math.cos(h) * d,
      x = player_P.z + Math.sin(h) * d,
      m = G.densityAt ? G.densityAt(p, x) : 0.6;
    if (Math.random() > 0.35 + m * 0.8) continue;
    spawnAICar(p, x, Math.random() < 0.03 ? 'police' : null) && s++;
  }
  let c =
    (player_P.mode === 'plane' || player_P.mode === 'heli' ? 0 : e.peds) *
    (o < 5 ? 0.3 : o < 6.5 ? 0.5 : o > 23 ? 0.6 : 1) *
    It(0.55 + a * 0.6, 0.5, 1.2);
  managePeds(player_P.x, player_P.z, Math.min(220, e.view * 0.3), c, t);
}
function carEffects(n, t) {
  let e = Math.sin(n.yaw),
    i = Math.cos(n.yaw),
    s = n.x + e * n.td.L * 0.32,
    o = n.z + i * n.td.L * 0.32;
  (n.hp < 40 && !n.dead && Math.random() < t * (n.hp < 20 ? 14 : 6) && O0(s, n.y + 1.1, o, n.hp < 20),
    n.burn > 0 &&
      ((n.burn -= t),
      Math.random() < t * 30 && h1(s, n.y + 1.1, o),
      n.burn <= 0 &&
        ((n.dead = !0),
        setColor(n, 1907997),
        xt('explode', {
          x: n.x,
          y: n.y,
          z: n.z,
        }),
        player_P.car === n && xt('wasted', '\u8ECA\u304C\u7206\u767A\u3057\u305F'))),
    n.sink && ((n.sink += t), n.sink > 3.5 && player_P.car === n && xt('wasted', '\u6C34\u6CA1\u3057\u305F')),
    n.honk > 0 &&
      ((n.honk -= t), Math.random() < t * 2 && Math.hypot(n.x - player_P.x, n.z - player_P.z) < 60 && gt.tone(380, 0.25, 0.05, 'square')));
}
function carPedHits(n) {
  let t = Math.hypot(n.vx, n.vz),
    e = n.mode === 'ai' ? n.v : t;
  if (e < 2.5) return;
  let i = Math.sin(n.yaw),
    s = Math.cos(n.yaw),
    o = -s,
    r = i,
    a = n.td.W / 2 + 0.35,
    l = n.td.L / 2 + 0.35;
  pedsNear(n.x, n.z, n.td.L, X0);
  for (let f of X0) {
    if (f.state === 'down' || Math.abs(f.y - n.y) > 2) continue;
    let u = f.x - n.x,
      c = f.z - n.z,
      h = u * i + c * s,
      d = u * o + c * r;
    if (Math.abs(d) < a && Math.abs(h) < l) {
      let p = n.mode === 'ai' ? i * n.v : n.vx,
        x = n.mode === 'ai' ? s * n.v : n.vz,
        m = knockPed(f, p * 0.85, Math.min(9, e * 0.45), x * 0.85, e);
      n.ctl === 'player'
        ? (m
            ? pedKilledByPlayer(f)
            : xt('crime', {
                amt: 0.8,
                why: '\u6B69\u884C\u8005\u3092\u306F\u306D\u305F',
              }),
          gt.thud())
        : n.mode === 'ai' && (n.v *= 0.5);
    }
  }
  if (player_P.mode === 'foot' && player_P.down <= 0 && !player_P.interior) {
    let f = player_P.x - n.x,
      u = player_P.z - n.z,
      c = f * i + u * s,
      h = f * o + u * r;
    if (Math.abs(h) < a && Math.abs(c) < l && e > 4 && Math.abs(player_P.y - n.y) < 1.4) {
      let d = n.mode === 'ai' ? i * n.v : n.vx,
        p = n.mode === 'ai' ? s * n.v : n.vz;
      (knockPlayer(d * 0.8, Math.min(8, e * 0.4), p * 0.8, e * 2.2), n.mode === 'ai' && (n.v *= 0.4));
    }
  }
}
function blowUp(n, t, e, i, s) {
  (t6(n, t, e, i),
    gt.boom(Math.hypot(n - player_P.x, e - player_P.z)),
    (G.cam.shake = Math.max(G.cam.shake, Math.max(0, 1.4 - Math.hypot(n - player_P.x, e - player_P.z) / 60))),
    carsNear(n, e, 14, W0));
  for (let o of W0) {
    let r = Math.hypot(o.x - n, o.z - e);
    r < 10 && r > 0.1 && (toPhys(o), (o.vx += ((o.x - n) / r) * (10 - r)), (o.vz += ((o.z - e) / r) * (10 - r)), damageCar(o, (10 - r) * 6));
  }
  pedsNear(n, e, 12, X0);
  for (let o of X0) {
    let r = Math.hypot(o.x - n, o.z - e) || 1;
    r < 10 && !o.killed && knockPed(o, ((o.x - n) / r) * 8, 7, ((o.z - e) / r) * 8, 10, (10 - r) * 22) && s && pedKilledByPlayer(o);
  }
  if (
    (s &&
      xt('crime', {
        amt: 1.2,
        why: '\u7206\u767A',
      }),
    scarePeds(n, e, 40),
    player_P.mode === 'foot' && !player_P.interior)
  ) {
    let o = Math.hypot(player_P.x - n, player_P.z - e) || 1;
    if (o < 9) {
      let r = (9 - o) * 14,
        a = Math.min(player_P.armor || 0, r * 0.5);
      ((player_P.armor = (player_P.armor || 0) - a),
        knockPlayer(((player_P.x - n) / o) * 8, 7, ((player_P.z - e) / o) * 8, r - a),
        player_P.hp <= 0 && xt('wasted', '\u7206\u767A\u306B\u5DFB\u304D\u8FBC\u307E\u308C\u305F'));
    }
  }
}
function placeNearRoad(n, t) {
  let e = [];
  roadsNear(n, t, 150, e);
  let i = e.filter((s) => !s.e.elev && s.e.kind !== 'X').sort((s, o) => s.d - o.d)[0];
  if (i) {
    let s = i.e,
      o = i.j,
      [r, a] = s.pts[o],
      [l, f] = s.pts[o + 1],
      u = Math.hypot(l - r, f - a) || 1;
    ((player_P.x = i.x - ((f - a) / u) * (s.hw + 1.5)), (player_P.z = i.z + ((l - r) / u) * (s.hw + 1.5)));
  } else ((player_P.x = n), (player_P.z = t));
  ((player_P.y = 0.2), (player_P.vy = 0), (player_P.down = 0), (G.cam.snap = !0));
}
var INT = {};
vi(INT, {
  DOORS: () => DOORS,
  enter: () => enter,
  exit: () => exit,
  nearDoor: () => nearDoor,
  setupDoors: () => setupDoors,
  updFronts: () => updFronts,
  updInterior: () => updInterior,
  updMarkers: () => updMarkers,
});
var DOORS = [],
  K3 = {},
  S1 = -600,
  QC = [
    ['\u30BB\u30D6\u30F3\u30C7\u30A4\u30BA', '#f26b1d', '#1a9a47'],
    ['\u30D5\u30A1\u30DF\u30EA\u30FC\u30DD\u30FC\u30C8', '#0a8f4a', '#2d6fd0'],
    ['\u30ED\u30FC\u30BD\u30AF', '#2d6fd0', '#ffffff'],
  ];
function setupDoors() {
  let n = W.bld,
    t = [];
  W.stations.forEach((s, o) => {
    buildingsNear(s.x, s.z, 160, t);
    let r = null,
      a = 1e9;
    for (let M of t) {
      let y = M * 9,
        _ = n[y + 5];
      if (n[y + 6] < 4 || (_ !== 2 && _ !== 5) || n[y + 3] < 7) continue;
      let v = Math.hypot(n[y] - s.x, n[y + 1] - s.z);
      v > 60 && v < a && ((a = v), (r = M));
    }
    if (r === null) return;
    let l = r * 9,
      f = n[l],
      u = n[l + 1],
      c = n[l + 2],
      h = n[l + 3],
      d = n[l + 4],
      p = Math.cos(c),
      x = Math.sin(c),
      m = null;
    for (let M of [-1, 1]) {
      let y = -x * M,
        _ = p * M,
        v = [];
      (roadsNear(f + y * (d / 2 + 6), u + _ * (d / 2 + 6), 8, v), v.length && !m && (m = [y, _]));
    }
    if (!m) return;
    let g = QC[o % 3];
    DOORS.push({
      x: f + m[0] * (d / 2 + 1.2),
      z: u + m[1] * (d / 2 + 1.2),
      type: 'store',
      label: g[0],
      brand: g,
      face: m,
      bx: f,
      bz: u,
      bw: h,
      bd: d,
      brot: c,
    });
  });
  for (let s of W.stations)
    for (let o of s.entrances)
      DOORS.push({
        x: o.x,
        z: o.z,
        type: 'station',
        label: s.ja + '\u99C5',
        S: s,
        en: o,
      });
  for (let s of TERMS) {
    let o = -HND.uz,
      r = HND.ux,
      a = s.Wd / 2 + 10,
      l = {
        T1: '\u7B2C1\u30BF\u30FC\u30DF\u30CA\u30EB',
        T2: '\u7B2C2\u30BF\u30FC\u30DF\u30CA\u30EB',
        T3: '\u7B2C3\u30BF\u30FC\u30DF\u30CA\u30EB',
      }[s.id],
      f = W.stations
        .filter((c) => /羽田空港/.test(c.ja))
        .map((c) => [c, Math.hypot(c.x - s.c[0], c.z - s.c[1])])
        .filter((c) => c[1] < 2200)
        .sort((c, h) => c[1] - h[1]),
      u = new Map();
    for (let [c] of f) {
      let h = c.lines[0]?.rail?.ja || c.ja;
      u.has(h) || u.set(h, c);
    }
    DOORS.push({
      x: s.c[0] - o * s.side * a,
      z: s.c[1] - r * s.side * a,
      type: 'terminal',
      label: '\u7FBD\u7530\u7A7A\u6E2F ' + l,
      T: s.T,
      tid: s.id,
      stations: [...u.values()],
      S: [...u.values()][0],
    });
  }
  let [e, i] = fe(35.6628, 139.696);
  DOORS.push({
    x: e,
    z: i,
    type: 'home',
    label: '\u81EA\u5B85\uFF08\u30BB\u30FC\u30D6\uFF09',
  });
}
var Qf = 40,
  Mn = {
    ring: null,
    chev: null,
    near: [],
    t: 0,
  },
  tz = {
    store: 4054148,
    station: 3123455,
    terminal: 3123455,
    home: 4054148,
    mall: 16752410,
    pachinko: 16732099,
    race: 4432127,
    gun: 16734778,
    univ: 11832575,
    school: 8248426,
    hall: 16765503,
    museum: 16765503,
    deck: 6080767,
    property: 4054148,
  },
  w1 = new THREE.Color(),
  b1 = new THREE.Matrix4(),
  v1 = new THREE.Quaternion(),
  j3 = new THREE.Vector3(),
  u6 = new THREE.Vector3();
function ez() {
  let n = new THREE.RingGeometry(0.85, 1.15, 28);
  (n.rotateX(-Math.PI / 2),
    (Mn.ring = new THREE.InstancedMesh(
      n,
      new THREE.MeshBasicMaterial({
        transparent: !0,
        opacity: 0.7,
        depthWrite: !1,
        toneMapped: !1,
        side: THREE.DoubleSide,
      }),
      Qf,
    )));
  let t = new THREE.ConeGeometry(0.3, 0.5, 4);
  (t.rotateX(Math.PI),
    (Mn.chev = new THREE.InstancedMesh(
      t,
      new THREE.MeshBasicMaterial({
        toneMapped: !1,
      }),
      Qf,
    )));
  for (let e of [Mn.ring, Mn.chev]) {
    ((e.frustumCulled = !1), (e.count = 0));
    for (let i = 0; i < Qf; i++) e.setColorAt(i, w1.set(16777215));
    R.scene.add(e);
  }
}
function updMarkers(n, t, e, i) {
  if ((Mn.ring || ez(), (Mn.t += n), !i)) {
    Mn.ring.count = Mn.chev.count = 0;
    return;
  }
  if ((Mn.scan = (Mn.scan || 0) - n) <= 0) {
    ((Mn.scan = 0.4), (Mn.near.length = 0));
    for (let o of DOORS) {
      let r = Math.abs(o.x - t) + Math.abs(o.z - e);
      r < 90 && Mn.near.push([r, o]);
    }
    (Mn.near.sort((o, r) => o[0] - r[0]), Mn.near.length > Qf && (Mn.near.length = Qf));
  }
  let s = 0;
  for (let [, o] of Mn.near) {
    let r = Math.hypot(o.x - t, o.z - e);
    if (r > 75) continue;
    let a = Mn.t * 2.2 + o.x * 0.1,
      l = 1 + (Math.sin(a) * 0.5 + 0.5) * 0.25,
      f = o.y || 0;
    (v1.identity(),
      b1.compose(j3.set(o.x, f + 0.07, o.z), v1, u6.set(l, 1, l)),
      Mn.ring.setMatrixAt(s, b1),
      v1.setFromAxisAngle(j3.set(0, 1, 0), Mn.t * 1.6));
    let u = r < 8 ? 0.8 : 1 + Math.min(1.2, r / 50);
    (b1.compose(j3.set(o.x, f + 2.7 + Math.sin(a * 1.3) * 0.18 + (u - 1) * 0.8, o.z), v1, u6.set(u, u, u)),
      Mn.chev.setMatrixAt(s, b1),
      w1.set(tz[o.type] || 16765503),
      Mn.ring.setColorAt(s, w1),
      Mn.chev.setColorAt(s, w1),
      s++);
  }
  Mn.ring.count = Mn.chev.count = s;
  for (let o of [Mn.ring, Mn.chev]) ((o.instanceMatrix.needsUpdate = !0), o.instanceColor && (o.instanceColor.needsUpdate = !0));
}
var d6 = new Map();
function updFronts(n, t) {
  for (let e of DOORS) {
    if (e.type !== 'store') continue;
    let i = Math.hypot(e.x - n, e.z - t),
      s = d6.get(e);
    (i < 320 && !s && ((s = nz(e)), d6.set(e, s), R.scene.add(s)), s && (s.visible = i < 320));
  }
}
function nz(n) {
  let t = new THREE.Group(),
    [e, i] = n.face,
    s = Math.atan2(e, i),
    [o, r, a] = n.brand,
    [l, f] = Ne(512, 64);
  ((f.fillStyle = '#fff'),
    f.fillRect(0, 0, 512, 64),
    (f.fillStyle = r),
    f.fillRect(0, 0, 512, 10),
    (f.fillStyle = a),
    f.fillRect(0, 54, 512, 10),
    (f.fillStyle = r),
    (f.font = `900 36px ${ce}`),
    (f.textAlign = 'center'),
    (f.textBaseline = 'middle'),
    f.fillText(o, 256, 33));
  let u = Fe(l, {
      rep: !1,
    }),
    c = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(n.bw - 0.5, 9), 1.1),
      new THREE.MeshStandardMaterial({
        map: u,
        emissive: 16777215,
        emissiveMap: u,
        emissiveIntensity: 0.6,
      }),
    );
  (c.position.set(n.x - e * 1.1, 3.4, n.z - i * 1.1), (c.rotation.y = s), t.add(c));
  let h = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(n.bw - 0.8, 8.5), 2.6),
    new THREE.MeshStandardMaterial({
      color: 16774877,
      emissive: 16773840,
      emissiveIntensity: 0.55,
      roughness: 0.1,
      metalness: 0.2,
    }),
  );
  return (h.position.set(n.x - e * 1.15, 1.5, n.z - i * 1.15), (h.rotation.y = s), t.add(h), t);
}
function _1(n, t, e, i, s, o, r = 1024, a = 128) {
  let [l, f] = Ne(r, a);
  n.userData.banner = {
    cv: l,
    x: f,
    t: Fe(l, {
      rep: !1,
      dyn: !0,
    }),
  };
  let u = new THREE.Mesh(
    new THREE.PlaneGeometry(t, e),
    new THREE.MeshBasicMaterial({
      map: n.userData.banner.t,
      toneMapped: !1,
    }),
  );
  (u.position.set(i, s, o), n.add(u));
}
function iz(n, t) {
  let e = n.g.userData.banner;
  if (!e) return;
  let i = e.x,
    s = e.cv.width,
    o = e.cv.height,
    r = n.type,
    a =
      {
        univ: '#1d2c4a',
        school: '#f4f2ec',
        hall: '#0a0a14',
        museum: '#2a2420',
      }[r] || '#111',
    l =
      {
        school: '#1d2b1d',
        museum: '#f2e6c8',
      }[r] || '#ffffff';
  if (((i.fillStyle = a), i.fillRect(0, 0, s, o), r === 'hall')) {
    let c = i.createLinearGradient(0, 0, s, o);
    (c.addColorStop(0, '#3a0a4a'), c.addColorStop(0.5, '#0a1a5a'), c.addColorStop(1, '#4a0a2a'), (i.fillStyle = c), i.fillRect(0, 0, s, o));
    for (let h = 0; h < 40; h++)
      ((i.fillStyle = `hsla(${(h * 37) % 360},90%,70%,.5)`), i.beginPath(), i.arc((h * 97) % s, (h * 53) % o, 3 + (h % 5), 0, 7), i.fill());
  }
  ((i.fillStyle = l), (i.textAlign = 'center'), (i.textBaseline = 'middle'));
  let f = r === 'hall' ? t.show || 'LIVE' : t.label,
    u = o * (r === 'hall' ? 0.3 : 0.5);
  for (i.font = `900 ${u}px ${ce}`; i.measureText(f).width > s - 40 && u > 14;) ((u -= 3), (i.font = `900 ${u}px ${ce}`));
  (i.fillText(f, s / 2, r === 'hall' ? o * 0.42 : o * 0.5),
    r === 'hall' && ((i.font = `700 ${o * 0.1}px ${ce}`), i.fillText(t.label, s / 2, o * 0.72)),
    (e.t.needsUpdate = !0));
}
var J3 = new Map();
function p6(n) {
  if (J3.has(n)) return J3.get(n);
  let [t, e] = Ne(256, 174),
    i = n * 9301 + 49297,
    s = () => (i = (i * 9301 + 49297) % 233280) / 233280,
    o = e.createLinearGradient(0, 0, 0, 174);
  if (
    (o.addColorStop(0, `hsl(${200 + ((n * 23) % 60)},45%,${55 + (n % 3) * 8}%)`),
    o.addColorStop(1, `hsl(${30 + ((n * 17) % 40)},40%,80%)`),
    (e.fillStyle = o),
    e.fillRect(0, 0, 256, 174),
    n % 3 === 0)
  ) {
    e.fillStyle = `hsl(${210 + ((n * 7) % 30)},50%,35%)`;
    for (let a = 0; a < 4; a++) {
      (e.beginPath(), e.moveTo(0, 174));
      for (let l = 0; l <= 256; l += 16) e.lineTo(l, 110 + a * 16 + Math.sin(l / 20 + a + n) * 10);
      (e.lineTo(256, 174), e.fill(), (e.fillStyle = `hsla(${200 + a * 8},50%,${45 + a * 8}%,.9)`));
    }
  } else if (n % 3 === 1)
    ((e.fillStyle = '#3a4a3a'),
      e.beginPath(),
      e.moveTo(0, 140),
      e.lineTo(90 + s() * 40, 50 + s() * 30),
      e.lineTo(256, 140),
      e.lineTo(256, 174),
      e.lineTo(0, 174),
      e.fill(),
      (e.fillStyle = '#f4f4f0'),
      e.beginPath(),
      e.arc(200, 40, 14, 0, 7),
      e.fill(),
      (e.fillStyle = '#5a7a3a'),
      e.fillRect(0, 140, 256, 34));
  else {
    e.fillStyle = `hsl(${(n * 47) % 360},55%,45%)`;
    for (let a = 0; a < 7; a++)
      ((e.globalAlpha = 0.75),
        e.fillRect(s() * 200, s() * 130, 20 + s() * 60, 14 + s() * 50),
        (e.fillStyle = `hsl(${(n * 47 + a * 50) % 360},55%,${40 + a * 5}%)`));
    e.globalAlpha = 1;
  }
  ((e.strokeStyle = '#5a4020'), (e.lineWidth = 6), e.strokeRect(0, 0, 256, 174));
  let r = Fe(t, {
    rep: !1,
  });
  return (J3.set(n, r), r);
}
function sz() {
  let [n, t] = Ne(1024, 192),
    e = t.createLinearGradient(0, 0, 0, 192);
  (e.addColorStop(0, '#3a8ad8'),
    e.addColorStop(1, '#bfe4f8'),
    (t.fillStyle = e),
    t.fillRect(0, 0, 1024, 192),
    (t.fillStyle = '#3a5a9a'),
    t.beginPath(),
    t.moveTo(220, 150),
    t.lineTo(500, 30),
    t.lineTo(560, 30),
    t.lineTo(860, 150),
    t.fill(),
    (t.fillStyle = '#f8f8f8'),
    t.beginPath(),
    t.moveTo(440, 56),
    t.lineTo(500, 30),
    t.lineTo(560, 30),
    t.lineTo(620, 56),
    t.lineTo(590, 64),
    t.lineTo(560, 54),
    t.lineTo(530, 66),
    t.lineTo(500, 54),
    t.lineTo(470, 64),
    t.fill(),
    (t.fillStyle = '#1f5aa8'),
    t.fillRect(0, 140, 1024, 52),
    (t.fillStyle = 'rgba(255,255,255,.6)'));
  for (let i = 0; i < 30; i++) t.fillRect((i * 71) % 1024, 150 + ((i * 13) % 36), 26, 3);
  t.fillStyle = '#2a5a2a';
  for (let i of [60, 130, 930, 980])
    (t.fillRect(i - 3, 100, 6, 50),
      t.beginPath(),
      t.ellipse(i, 96, 34, 14, 0, 0, 7),
      t.fill(),
      t.beginPath(),
      t.ellipse(i + 10, 80, 24, 10, 0, 0, 7),
      t.fill());
  return Fe(n, {
    rep: !1,
  });
}
function oz(n) {
  if (K3[n]) return K3[n];
  let t = new THREE.Group(),
    e = new Mt({
      color: !0,
    }),
    i = new Mt({
      color: !0,
    }),
    s = {
      store: 0,
      station: 200,
      terminal: 400,
      home: 600,
      mall: 800,
      pachinko: 1e3,
      race: 1200,
      gun: 1400,
      cafe: 1600,
      ramen: 1800,
      karaoke: 2e3,
      arcade: 2200,
      drug: 2400,
      univ: 2600,
      school: 2800,
      hall: 3e3,
      museum: 3200,
      izakaya: 3400,
      sento: 3600,
      capsule: 3800,
      book: 4e3,
      gym: 4200,
    }[n];
  t.position.set(s, S1, -2e4);
  let o = [],
    r = [],
    a = (u, c, h, d, p, x, m, g) => {
      u.setColor(c).box(h, d, p, x, m, g, 0, {});
    },
    l = (u, c, h, d, p, x) => {
      (e.setColor(d).quad([-u, 0, c], [u, 0, c], [u, 0, -c], [-u, 0, -c], [0, 1, 0]),
        e.setColor(x).quad([-u, h, -c], [u, h, -c], [u, h, c], [-u, h, c], [0, -1, 0]),
        e.setColor(p).quad([u, 0, -c], [-u, 0, -c], [-u, h, -c], [u, h, -c], [0, 0, 1]),
        e.setColor(p).quad([-u, 0, c], [u, 0, c], [u, h, c], [-u, h, c], [0, 0, -1]),
        e.setColor(p).quad([-u, 0, -c], [-u, 0, c], [-u, h, c], [-u, h, -c], [1, 0, 0]),
        e.setColor(p).quad([u, 0, c], [u, 0, -c], [u, h, -c], [u, h, c], [-1, 0, 0]));
    },
    f;
  if (n === 'store') {
    (l(7, 9, 3.2, 14474454, 15921902, 16185074), (f = [-6.6, -8.6, 6.6, 8.6]));
    for (let h = 0; h < 3; h++) {
      let d = -3.5 + h * 3.5;
      (a(e, 15263972, d, 0, -1, 1.1, 1.6, 9), r.push([d, -1, 1.1, 9]));
      for (let p = 0; p < 4; p++)
        for (let x = 0; x < 14; x++)
          for (let m of [-1, 1])
            a(
              e,
              [13843247, 2783936, 15909424, 3971666, 15231511, 15921906, 9064104][(h * 5 + p * 3 + x) % 7],
              d + m * 0.45,
              0.2 + p * 0.38,
              -5.2 + x * 0.62,
              0.18,
              0.26,
              0.5,
            );
    }
    for (let h = 0; h < 7; h++) {
      a(i, 15922943, -6.9, 0.2, -8 + h * 1.3 + 0.6, 0.15, 2.2, 1.15);
      for (let d = 0; d < 5; d++) a(e, [2783936, 13843247, 15909424, 3971666][(h + d) % 4], -6.6, 0.4 + d * 0.42, -8 + h * 1.3 + 0.6, 0.3, 0.3, 1);
    }
    (r.push([-6.5, -3.5, 1, 9]),
      a(e, 13152906, 4.5, 0, 6.2, 4.5, 1.05, 1.2),
      a(e, 3355443, 3.6, 1.05, 6.2, 0.5, 0.35, 0.4),
      r.push([4.5, 6.2, 4.5, 1.2]),
      a(e, 9071178, 5.8, 0, 3, 1.2, 1.4, 2.8),
      o.push({
        x: 4.5,
        z: 5.2,
        r: 1.8,
        label: 'F\uFF1A\u8CB7\u3044\u7269\u3059\u308B',
        id: 'buy',
      }));
    for (let h = 0; h < 6; h++) a(i, 16777215, -4 + (h % 3) * 4, 3.15, -5 + Math.floor(h / 3) * 7, 0.4, 0.05, 3);
    o.push({
      x: 0,
      z: 8.2,
      r: 1.6,
      label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
      id: 'exit',
    });
    let u = new THREE.PointLight(16777215, 18, 26, 1.6);
    (u.position.set(0, 3, 0), t.add(u));
    let c = new THREE.PointLight(16777215, 10, 20, 1.6);
    (c.position.set(0, 3, -6), t.add(c));
  } else if (n === 'station') {
    (l(16, 12, 4.5, 12565168, 15000284, 15790058), (f = [-15.5, -11.5, 15.5, 11.5]));
    for (let x = -3; x <= 3; x++)
      (a(e, 10133670, x * 1.6, 0, -2, 0.25, 1, 1.6), a(i, 2271999, x * 1.6, 1, -2.75, 0.24, 0.06, 0.1), r.push([x * 1.6, -2, 0.25, 1.6]));
    (a(e, 2764083, 0, 2.6, -11.8, 10, 1.4, 0.2),
      o.push({
        x: 0,
        z: -5,
        r: 3,
        label: 'F\uFF1A\u6539\u672D\u3092\u901A\u3063\u3066\u96FB\u8ECA\u306B\u4E57\u308B',
        id: 'trains',
      }),
      a(e, 8028038, -12, 0, 6, 5, 1.1, 2),
      a(i, 16771504, -12, 1.1, 6, 5, 0.6, 2),
      r.push([-12, 6, 5, 2]),
      a(e, 8028038, 11, 0, 7, 4, 2.2, 3),
      a(i, 12644607, 9, 0.6, 7, 0.1, 1.5, 2.6),
      r.push([11, 7, 4, 3]),
      o.push({
        x: 8.3,
        z: 7,
        r: 1.5,
        label: 'F\uFF1A\u58F2\u5E97\uFF08\u304A\u306B\u304E\u308A \xA5150\uFF09',
        id: 'buy',
      }));
    for (let x = 0; x < 8; x++) a(i, 16777215, -12 + x * 3.4, 4.45, 0, 0.4, 0.04, 18);
    for (let x of [-8, 8])
      for (let m of [-6, 4]) (a(e, 14210252, x, 0, m, 0.9, 4.5, 0.9), a(i, 16777215, x, 2.6, m + 0.46, 0.7, 0.9, 0.02), r.push([x, m, 0.9, 0.9]));
    for (let x = 0; x < 6; x++)
      (a(e, 9080982, -14.4, 0, -9 + x * 1.3, 1, 1.5, 1.1),
        a(i, 8376575, -13.88, 1, -9 + x * 1.3, 0.02, 0.35, 0.6),
        a(i, 16756736, -13.88, 1.4, -9 + x * 1.3, 0.02, 0.08, 0.8));
    (r.push([-14.4, -5.75, 1, 8]),
      a(e, 2764083, -14.9, 1.8, -5.75, 0.2, 1.4, 8),
      a(i, 15921906, -14.78, 2, -5.75, 0.02, 1, 7.6),
      a(e, 15255594, 0, 0.004, 3, 0.3, 0.01, 16),
      a(e, 15255594, -6, 0.004, -4.5, 12, 0.01, 0.3),
      a(e, 15255594, 6, 0.004, -4.5, 12, 0.01, 0.3));
    for (let x of [1, 5]) (a(e, 6975608, 13.5, 0, x, 1, 0.45, 2.6), a(e, 3817286, 13.95, 0.45, x, 0.1, 0.5, 2.6), r.push([13.5, x, 1, 2.6]));
    let u = [8438337, 16157470, 42971, 15013663, 10190006, 44457];
    for (let x = 0; x < 6; x++) (a(i, u[x], -7.5 + x * 3, 3.3, -11.7, 2.6, 0.5, 0.05), a(e, 1908516, -7.5 + x * 3, 3.85, -11.7, 2.6, 0.5, 0.05));
    (a(e, 692042, 11, 2.2, 7, 4.1, 0.35, 3.1), a(i, 16777215, 11, 2.25, 5.44, 3.4, 0.25, 0.02));
    for (let x = 0; x < 3; x++) (a(e, 15328732, -4 + x * 4, 0, 9.5, 1.6, 0.9, 0.6), a(i, 3134314, -4 + x * 4, 0.95, 9.2, 0.3, 0.2, 0.02));
    o.push({
      x: 0,
      z: 11.2,
      r: 2,
      label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
      id: 'exit',
    });
    let c = new THREE.PointLight(16777215, 30, 40, 1.4);
    (c.position.set(0, 4, 0), t.add(c));
    let [h, d] = Ne(1024, 140);
    t.userData.board = {
      cv: h,
      x: d,
      t: Fe(h, {
        rep: !1,
        dyn: !0,
      }),
    };
    let p = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 1.3),
      new THREE.MeshBasicMaterial({
        map: t.userData.board.t,
        toneMapped: !1,
      }),
    );
    (p.position.set(0, 2.6, -11.65), t.add(p));
  } else if (n === 'terminal') {
    (l(40, 25, 14, 13617858, 14673642, 16053490), (f = [-39, -24, 39, 24]));
    for (let x = -4; x <= 4; x++)
      (a(e, 3956618, x * 8, 0, -8, 5, 1.1, 1.2), a(i, 10473727, x * 8, 2.6, -9, 4.6, 0.8, 0.1), r.push([x * 8, -8, 5, 1.2]));
    (a(e, 1119256, 0, 6, -24.8, 26, 4, 0.2),
      o.push({
        x: 0,
        z: -14,
        r: 6,
        label: 'F\uFF1A\u642D\u4E57\u624B\u7D9A\u304D\uFF08\u98DB\u884C\u6A5F\u306B\u4E57\u308B\uFF09',
        id: 'fly',
      }),
      o.push(
        {
          x: -30,
          z: 14,
          r: 4,
          label: 'F\uFF1A\u9244\u9053\u306E\u308A\u3070\uFF08\u4EAC\u6025\u7DDA\u30FB\u6771\u4EAC\u30E2\u30CE\u30EC\u30FC\u30EB\uFF09',
          id: 'trains',
        },
        {
          x: 30,
          z: 14,
          r: 4,
          label: 'F\uFF1A\u30EA\u30E0\u30B8\u30F3\u30D0\u30B9\u306E\u308A\u3070',
          id: 'limo',
        },
        {
          x: 14,
          z: 20,
          r: 3,
          label: 'F\uFF1A\u30BF\u30AF\u30B7\u30FC\u306E\u308A\u3070',
          id: 'taxistand',
        },
      ),
      a(e, 15024171, -30, 0, 18, 6, 2.6, 0.4),
      a(e, 1793983, 30, 0, 18, 6, 2.6, 0.4),
      a(e, 15909424, 14, 0, 22.5, 4, 2.2, 0.4));
    for (let x = 0; x < 10; x++) a(i, 16777215, -36 + x * 8, 13.9, 0, 1, 0.05, 40);
    o.push({
      x: 0,
      z: 24,
      r: 3,
      label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
      id: 'exit',
    });
    let u = new THREE.PointLight(16777215, 80, 90, 1.2);
    (u.position.set(0, 12, 0), t.add(u));
    let [c, h] = Ne(1024, 160);
    ((h.fillStyle = '#05070a'),
      h.fillRect(0, 0, 1024, 160),
      (h.fillStyle = '#ffb000'),
      (h.font = `800 30px ${ce}`),
      h.fillText('\u51FA\u767A DEPARTURES', 20, 40),
      [
        ['08:15', 'SB 101', '\u672D\u5E4C', '\u642D\u4E57\u4E2D'],
        ['08:40', 'RC 225', '\u5927\u962A', '\u5B9A\u523B'],
        ['09:05', 'GW 330', '\u798F\u5CA1', '\u5B9A\u523B'],
        ['09:30', 'SA 412', '\u90A3\u8987', '\u5B9A\u523B'],
      ].forEach((x, m) => {
        ((h.fillStyle = '#fff'), (h.font = `700 24px ${ce}`), h.fillText(x.join('    '), 20, 76 + m * 22));
      }));
    let p = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 4),
      new THREE.MeshBasicMaterial({
        map: Fe(c, {
          rep: !1,
        }),
        toneMapped: !1,
      }),
    );
    (p.position.set(0, 8, -24.6), t.add(p));
  } else if (n === 'mall') {
    (l(24, 18, 5, 14209736, 15855336, 16250610), (f = [-23.5, -17.5, 23.5, 17.5]));
    for (let c = 0; c < 4; c++)
      for (let h = 0; h < 3; h++) {
        let d = -19 + h * 5,
          p = -12 + c * 6;
        a(e, 9080726, d, 1.4, p, 3.6, 0.05, 0.05);
        for (let x = 0; x < 9; x++)
          a(e, [13843247, 2783936, 15921902, 1973794, 15247544, 7047754, 13214522][(c + h + x) % 7], d - 1.6 + x * 0.4, 0.55, p, 0.32, 0.85, 0.5);
        r.push([d, p, 3.8, 0.8]);
      }
    for (let c = 0; c < 4; c++)
      (a(e, 15921902, -21 + c * 2.2, 0, 15, 0.4, 1.75, 0.3), a(e, [13843247, 1973794, 2783936, 15247544][c], -21 + c * 2.2, 0.9, 15, 0.5, 0.6, 0.32));
    (a(e, 6975606, 0, 0, -6, 2.4, 0.4, 12), a(e, 10133928, 0, 0.4, -6, 2.2, 0.08, 12));
    for (let c of [-1, 1]) a(i, 12576511, c * 1.25, 0.4, -6, 0.1, 1, 12);
    (r.push([0, -6, 2.6, 12]), a(e, 9071178, 15, 0, 10, 10, 1.1, 1.4), a(i, 16769712, 15, 1.1, 10.5, 9.6, 0.5, 0.2), r.push([15, 10, 10, 1.4]));
    for (let c = 0; c < 6; c++)
      (a(e, 15262422, 10 + (c % 3) * 4, 0, 2 - Math.floor(c / 3) * 5, 1.4, 0.75, 1.4),
        r.push([10 + (c % 3) * 4, 2 - Math.floor(c / 3) * 5, 1.4, 1.4]));
    for (let c = 0; c < 12; c++) a(i, 16777215, -20 + (c % 6) * 8, 4.95, -10 + Math.floor(c / 6) * 16, 3, 0.05, 1);
    (a(i, 1793983, 0, 3.2, -17.8, 16, 1.2, 0.1),
      o.push({
        x: -14,
        z: -2,
        r: 3.5,
        label: 'F\uFF1A\u670D\u3092\u8CB7\u3046\uFF08\u7740\u66FF\u3048\uFF09',
        id: 'clothes',
      }),
      o.push({
        x: 15,
        z: 8.4,
        r: 2.4,
        label: 'F\uFF1A\u30D5\u30FC\u30C9\u30B3\u30FC\u30C8\u3067\u98DF\u3079\u308B\uFF08\xA5800\uFF09',
        id: 'eat',
      }),
      o.push({
        x: 0,
        z: 17,
        r: 2.4,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16777215, 60, 60, 1.3);
    (u.position.set(0, 4.6, 0), t.add(u));
  } else if (n === 'pachinko') {
    (l(16, 14, 3.6, 3808546, 2302763, 1579039), (f = [-15.5, -13.5, 15.5, 13.5]));
    for (let c = 0; c < 4; c++) {
      let h = -10 + c * 6.5;
      (a(e, 2763312, h, 0, -1, 1.2, 1.9, 20), r.push([h, -1, 1.6, 20]));
      for (let d = 0; d < 12; d++)
        for (let p of [-1, 1]) {
          let x = -10 + d * 1.65;
          (a(i, [16732010, 4441855, 16765503, 8257370, 16752410][(c + d) % 5], h + p * 0.62, 0.9, x, 0.06, 0.9, 1.2),
            a(e, 13111342, h + p * 1.25, 0, x, 0.45, 0.5, 0.45));
        }
    }
    for (let c = 0; c < 16; c++) a(i, c % 2 ? 16732010 : 16765503, -15 + c * 2, 3.5, -13.8, 0.8, 0.08, 0.08);
    (a(e, 9071178, 12, 0, 10, 4, 1.1, 2),
      a(i, 16769712, 12, 1.1, 10, 3.8, 0.4, 1.8),
      r.push([12, 10, 4, 2]),
      o.push({
        x: -7.4,
        z: 0,
        r: 3,
        label: 'F\uFF1A\u53F0\u306B\u5EA7\u3063\u3066\u6253\u3064',
        id: 'pachinko',
      }),
      o.push({
        x: 5.6,
        z: 3,
        r: 3,
        label: 'F\uFF1A\u53F0\u306B\u5EA7\u3063\u3066\u6253\u3064',
        id: 'pachinko',
      }),
      o.push({
        x: 0,
        z: 13,
        r: 2.4,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16767208, 40, 40, 1.4);
    (u.position.set(0, 3.4, 0), t.add(u));
  } else if (n === 'race') {
    (l(26, 16, 7, 12104876, 14868698, 15658730), (f = [-25.5, -15.5, 25.5, 15.5]));
    for (let c = -2; c <= 2; c++)
      (a(e, 1119256, c * 9, 3, -15.8, 8, 4.5, 0.2), a(i, [2787898, 1793983, 2787898, 1793983, 2787898][c + 2], c * 9, 3.2, -15.65, 7.6, 4.1, 0.05));
    for (let c = 0; c < 6; c++)
      (a(e, 14209732, -20 + c * 8, 0, 4, 3, 1.1, 0.8), a(i, 10473727, -20 + c * 8, 1.1, 3.7, 2.8, 0.5, 0.05), r.push([-20 + c * 8, 4, 3, 0.8]));
    for (let c = 0; c < 10; c++) a(i, 16777215, -22 + c * 5, 6.95, 0, 1, 0.05, 26);
    (o.push({
      x: -4,
      z: 2.6,
      r: 5,
      label: 'F\uFF1A\u6295\u7968\u3059\u308B\uFF08\u30EC\u30FC\u30B9\u306B\u8CED\u3051\u308B\uFF09',
      id: 'bet',
    }),
      o.push({
        x: 12,
        z: 2.6,
        r: 5,
        label: 'F\uFF1A\u6295\u7968\u3059\u308B\uFF08\u30EC\u30FC\u30B9\u306B\u8CED\u3051\u308B\uFF09',
        id: 'bet',
      }),
      o.push({
        x: 0,
        z: 15,
        r: 3,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16777215, 60, 60, 1.3);
    (u.position.set(0, 6.5, 0), t.add(u));
  } else if (n === 'cafe') {
    (l(7, 8, 3.2, 8018494, 15260872, 15920354),
      (f = [-6.6, -7.6, 6.6, 7.6]),
      a(e, 3811870, 0, 0, -5.5, 8, 1.05, 1.1),
      a(e, 1907999, 0, 1.05, -5.5, 8.2, 0.05, 1.2),
      r.push([0, -5.5, 8, 1.1]),
      a(e, 2763566, -2, 1.1, -5.6, 1.2, 0.6, 0.6),
      a(e, 13159632, 1.5, 1.1, -5.6, 0.7, 0.5, 0.5),
      a(i, 2058810, 0, 2.5, -7.9, 6, 1.2, 0.05));
    for (let c = 0; c < 6; c++) {
      let h = -4.5 + (c % 3) * 4.5,
        d = -0.5 + Math.floor(c / 3) * 4;
      a(e, 7031346, h, 0, d, 1, 0.75, 1);
      for (let p of [-1, 1]) a(e, 3095082, h + p * 0.9, 0, d, 0.5, 0.45, 0.5);
      r.push([h, d, 1, 1]);
    }
    for (let c = 0; c < 5; c++) a(i, 16766362, -4 + c * 2, 3.15, 0, 0.3, 0.05, 0.3);
    (o.push({
      x: 0,
      z: -4.2,
      r: 2,
      label: 'F\uFF1A\u30B3\u30FC\u30D2\u30FC\u3092\u6CE8\u6587\u3059\u308B',
      id: 'coffee',
    }),
      o.push({
        x: 0,
        z: 7.5,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16769720, 16, 22, 1.5);
    (u.position.set(0, 3, 0), t.add(u));
  } else if (n === 'ramen') {
    (l(6, 7, 3, 5913130, 15787730, 15261904),
      (f = [-5.6, -6.6, 5.6, 6.6]),
      a(e, 9067066, 0, 0, -2.5, 9, 1, 1.2),
      a(e, 15260864, 0, 1, -2.5, 9.2, 0.06, 1.3),
      r.push([0, -2.5, 9, 1.2]));
    for (let c = 0; c < 8; c++) a(e, 11740702, -4 + c * 1.15, 0, -1.4, 0.4, 0.7, 0.4);
    (a(e, 13159632, -2, 0, -5.5, 2.5, 1, 1.2),
      a(e, 10133670, -2, 1, -5.5, 2.4, 0.4, 1),
      a(e, 2763566, 2.5, 0, -5.8, 2, 1.8, 0.8),
      a(i, 16773584, 0, 2.2, -6.9, 8, 0.8, 0.05),
      a(e, 1710618, 4.6, 0, 5, 0.8, 1.6, 0.6),
      a(i, 16777215, 4.2, 1.1, 5, 0.02, 0.5, 0.5),
      o.push({
        x: 0,
        z: -0.6,
        r: 2.2,
        label: 'F\uFF1A\u30E9\u30FC\u30E1\u30F3\u3092\u98DF\u3079\u308B\uFF08\xA5900\uFF09',
        id: 'ramen',
      }),
      o.push({
        x: 0,
        z: 6.5,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16773328, 14, 20, 1.5);
    (u.position.set(0, 2.8, 0), t.add(u));
  } else if (n === 'karaoke') {
    (l(6, 7, 2.8, 2759994, 3811930, 1709096),
      (f = [-5.6, -6.6, 5.6, 6.6]),
      a(e, 8002634, -4.8, 0, 0, 1.2, 0.45, 9),
      a(e, 8002634, -5.4, 0.45, 0, 0.3, 0.6, 9),
      r.push([-4.8, 0, 1.2, 9]),
      a(e, 2763566, -2.6, 0, 0, 1.4, 0.5, 4),
      r.push([-2.6, 0, 1.4, 4]),
      a(e, 1118481, 5.7, 0.8, 0, 0.2, 1.6, 3.2),
      a(i, 4885503, 5.58, 0.9, 0, 0.02, 1.4, 3));
    for (let c = 0; c < 10; c++) a(i, [16732064, 4903679, 16765503][c % 3], -5 + c * 1.1, 2.75, -6.9, 0.3, 0.06, 0.06);
    (o.push({
      x: 2.5,
      z: 0,
      r: 2.6,
      label: 'F\uFF1A\u6B4C\u3046\uFF081\u6642\u9593 \xA51,000\uFF09',
      id: 'karaoke',
    }),
      o.push({
        x: 0,
        z: 6.5,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16743120, 12, 18, 1.5);
    (u.position.set(0, 2.6, 0), t.add(u));
  } else if (n === 'arcade') {
    (l(10, 10, 3.4, 2236976, 1842214, 1315868), (f = [-9.5, -9.5, 9.5, 9.5]));
    for (let c = 0; c < 6; c++) {
      let h = -7 + c * 2.8;
      (a(e, 14942335, h, 0, -6, 1.8, 2, 1.8),
        a(i, 12578815, h, 0.8, -5.08, 1.5, 1, 0.02),
        a(i, 16765503, h, 1.9, -5.08, 1.6, 0.15, 0.02),
        r.push([h, -6, 1.8, 1.8]));
    }
    for (let c = 0; c < 8; c++) {
      let h = -7 + (c % 4) * 4.5,
        d = 0 + Math.floor(c / 4) * 3.5;
      (a(e, 1710618, h, 0, d, 0.9, 1.7, 0.8),
        a(i, [4441855, 16732010, 8257370, 16765503][c % 4], h, 1, d + 0.41, 0.7, 0.55, 0.02),
        r.push([h, d, 0.9, 0.8]));
    }
    for (let c = 0; c < 12; c++) a(i, c % 2 ? 16732064 : 4441855, -9 + c * 1.6, 3.35, -9.9, 0.8, 0.05, 0.05);
    (o.push({
      x: -4.2,
      z: -4.2,
      r: 2.6,
      label: 'F\uFF1A\u30AF\u30EC\u30FC\u30F3\u30B2\u30FC\u30E0\uFF081\u56DE \xA5200\uFF09',
      id: 'crane',
    }),
      o.push({
        x: 2.2,
        z: 1.7,
        r: 2.4,
        label: 'F\uFF1A\u683C\u95D8\u30B2\u30FC\u30E0\u3067\u5BFE\u6226\uFF08\xA5100\uFF09',
        id: 'fight',
      }),
      o.push({
        x: 0,
        z: 9.3,
        r: 1.8,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(14207231, 20, 26, 1.4);
    (u.position.set(0, 3.2, 0), t.add(u));
  } else if (n === 'drug') {
    (l(7, 9, 3.2, 14474454, 16316660, 16777215), (f = [-6.6, -8.6, 6.6, 8.6]));
    for (let c = 0; c < 3; c++) {
      let h = -3.5 + c * 3.5;
      (a(e, 15263972, h, 0, -1, 1.1, 1.8, 9), r.push([h, -1, 1.1, 9]));
      for (let d = 0; d < 4; d++)
        for (let p = 0; p < 12; p++)
          for (let x of [-1, 1])
            a(
              e,
              [16770560, 13898271, 2783936, 16777215, 15247544, 3971666][(c * 3 + d * 5 + p) % 6],
              h + x * 0.45,
              0.25 + d * 0.42,
              -5.2 + p * 0.72,
              0.16,
              0.28,
              0.55,
            );
    }
    (a(e, 16770560, 4.5, 0, 6, 4, 1.05, 1.2),
      r.push([4.5, 6, 4, 1.2]),
      a(i, 16770560, 0, 2.6, -8.9, 10, 0.9, 0.05),
      o.push({
        x: 4.5,
        z: 4.9,
        r: 1.8,
        label: 'F\uFF1A\u85AC\u30FB\u30C9\u30EA\u30F3\u30AF\u3092\u8CB7\u3046',
        id: 'drug',
      }),
      o.push({
        x: 0,
        z: 8.2,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16777215, 22, 26, 1.5);
    (u.position.set(0, 3, 0), t.add(u));
  } else if (n === 'gun') {
    (l(9, 8, 3.4, 4867392, 2894376, 1907739),
      (f = [-8.6, -7.6, 8.6, 7.6]),
      a(e, 3811870, 0, 0, -2.5, 12, 1.05, 1.2),
      a(e, 1710618, 0, 1.05, -2.5, 12.2, 0.06, 1.3),
      r.push([0, -2.5, 12, 1.2]));
    for (let c = 0; c < 6; c++) a(i, 16773328, -5 + c * 2, 1.12, -2.5, 1.4, 0.02, 0.9);
    for (let c = 0; c < 3; c++)
      for (let h = 0; h < 9; h++)
        (a(e, 1447448, -6.4 + h * 1.6, 1.2 + c * 0.6, -7.85, 1.2, 0.12, 0.08), a(e, 5913122, -6 + h * 1.6, 1.12 + c * 0.6, -7.85, 0.4, 0.2, 0.09));
    a(e, 6971992, -8.85, 0.6, 0, 0.2, 1.8, 10);
    for (let c = 0; c < 6; c++) a(e, 1447448, -8.7, 1.1 + (c % 2) * 0.5, -3.5 + Math.floor(c / 2) * 2.5, 0.08, 0.15, 0.6);
    (a(e, 3816755, 6.5, 0, 3.5, 2.5, 1.2, 2.5), a(e, 4872762, 6.5, 1.2, 3.5, 2.2, 0.5, 2.2), r.push([6.5, 3.5, 2.5, 2.5]));
    for (let c of [-1, 1]) a(i, 16727082, c * 4, 2.9, -7.9, 3, 0.4, 0.05);
    (a(e, 2237480, -5.5, 0, 5, 1.6, 1.8, 0.6),
      a(e, 2779706, -5.5, 0.9, 4.69, 1.2, 0.5, 0.02),
      o.push({
        x: 0,
        z: -1.2,
        r: 2.6,
        label: 'F\uFF1A\u6B66\u5668\u30FB\u5F3E\u85AC\u3092\u8CB7\u3046',
        id: 'gunshop',
      }),
      o.push({
        x: 0,
        z: 7.5,
        r: 1.8,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16771272, 22, 26, 1.5);
    (u.position.set(0, 3.1, -1), t.add(u));
  } else if (n === 'univ') {
    (l(14, 14, 6, 10123864, 15262420, 16052456),
      (f = [-13.6, -13.6, 13.6, 13.6]),
      a(e, 2375726, 0, 0.9, -13.88, 12, 2.6, 0.1),
      a(e, 13154458, 0, 0.85, -13.78, 12.2, 0.06, 0.25));
    for (let c = 0; c < 6; c++) a(i, 15263968, -4.8 + c * 1.9, 2.9 - (c % 3) * 0.55, -13.82, 0.9 + (c % 3) * 0.5, 0.05, 0.01);
    (a(e, 7031346, 0, 0, -11.2, 1.4, 1.15, 0.8), r.push([0, -11.2, 1.4, 0.8]), a(e, 9075304, 0, 0.005, -11.6, 16, 0.01, 4));
    for (let c = 0; c < 5; c++) {
      let h = -8 + c * 2.4;
      for (let d of [-1, 1])
        (a(e, 9071178, d * 5.6, 0, h, 8, 0.75, 0.6),
          a(e, 5917242, d * 5.6, 0, h + 0.75, 8, 0.45, 0.4),
          a(e, 5917242, d * 5.6, 0.45, h + 0.95, 8, 0.45, 0.08),
          r.push([d * 5.6, h + 0.35, 8, 1.4]));
    }
    for (let c of [5, 7.6, 10.2]) {
      (a(e, 5914152, -9.5, 0, c, 7, 2.3, 0.6), r.push([-9.5, c, 7, 0.6]));
      for (let h = 0; h < 5; h++)
        for (let d = 0; d < 15; d++)
          for (let p of [-1, 1])
            a(
              e,
              [9054762, 2771594, 2779706, 13214522, 5913194, 14209216][(h * 7 + d * 3 + (p > 0 ? 1 : 0)) % 6],
              -12.8 + d * 0.45,
              0.12 + h * 0.44,
              c + p * 0.3,
              0.32,
              0.34 + (d % 3) * 0.03,
              0.08,
            );
    }
    (a(e, 6965808, -9.5, 0, 12.4, 5, 0.75, 1.4), r.push([-9.5, 12.4, 5, 1.4]));
    for (let c = 0; c < 3; c++) a(i, 16773320, -11 + c * 1.5, 0.76, 12.4, 0.3, 0.3, 0.3);
    (a(e, 13159632, 12.4, 0, 8, 1.2, 1.05, 7),
      a(e, 10133670, 12.4, 1.05, 8, 1.3, 0.05, 7.2),
      r.push([12.4, 8, 1.2, 7]),
      a(i, 16773584, 13.88, 1.8, 8, 0.02, 1, 5.6));
    for (let c of [5.5, 8.6])
      for (let h of [5, 8.5, 12])
        (a(e, 15262940, c, 0, h, 2, 0.75, 1.2),
          a(e, 3828392, c, 0, h - 0.9, 1.8, 0.45, 0.4),
          a(e, 3828392, c, 0, h + 0.9, 1.8, 0.45, 0.4),
          r.push([c, h, 2, 2.2]));
    for (let c = 0; c < 12; c++) a(i, 16777215, -10 + (c % 4) * 6.6, 5.95, -9 + Math.floor(c / 4) * 9, 2.4, 0.04, 0.5);
    (o.push({
      x: 0,
      z: -9.6,
      r: 2.2,
      label: 'F\uFF1A\u6388\u696D\u3092\u53D7\u3051\u308B\uFF0890\u5206\uFF09',
      id: 'lecture',
    }),
      o.push({
        x: -5.2,
        z: 8.9,
        r: 2,
        label: 'F\uFF1A\u56F3\u66F8\u9928\u3067\u52C9\u5F37\u3059\u308B\uFF082\u6642\u9593\u30FB\u30BB\u30FC\u30D6\uFF09',
        id: 'library',
      }),
      o.push({
        x: 10.8,
        z: 8,
        r: 1.8,
        label: 'F\uFF1A\u5B66\u98DF\u3067\u98DF\u3079\u308B\uFF08\xA5450\uFF09',
        id: 'gakushoku',
      }),
      o.push({
        x: 0,
        z: 13.2,
        r: 1.8,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }),
      _1(t, 10, 1.3, 0, 4.4, -13.85));
    let u = new THREE.PointLight(16774368, 46, 50, 1.25);
    (u.position.set(0, 5, 0), t.add(u));
  } else if (n === 'school') {
    (l(8, 8, 3.2, 11569754, 15921126, 16184558),
      (f = [-7.6, -7.6, 7.6, 7.6]),
      a(e, 2375726, 0, 0.8, -7.92, 6, 1.4, 0.08),
      a(e, 13154458, 0, 0.78, -7.84, 6.2, 0.05, 0.2));
    for (let c = 0; c < 4; c++) a(i, 15658730, -2 + c * 1.3, 1.9 - (c % 2) * 0.4, -7.86, 0.8, 0.04, 0.01);
    (a(e, 9071178, 0, 0, -5.9, 1.8, 0.8, 0.8), r.push([0, -5.9, 1.8, 0.8]));
    for (let c of [-4.5, -1.5, 1.5, 4.5]) {
      for (let h = 0; h < 6; h++) {
        let d = -3.4 + h * 1.3;
        (a(e, 9080982, c, 0, d, 0.5, 0.7, 0.35),
          a(e, 13150328, c, 0.7, d, 0.66, 0.04, 0.46),
          a(e, 10123864, c, 0, d + 0.48, 0.42, 0.42, 0.38),
          a(e, 10123864, c, 0.42, d + 0.66, 0.42, 0.4, 0.04));
      }
      r.push([c, 0.1, 0.7, 7.4]);
    }
    for (let c = 0; c < 4; c++) (a(i, 13625599, 7.96, 1, -5.2 + c * 3.3, 0.02, 1.5, 2.8), a(e, 13159632, 7.9, 0.95, -5.2 + c * 3.3, 0.1, 0.06, 2.9));
    (a(e, 10133670, -4.2, 0, 7.5, 6, 1.2, 0.6), r.push([-4.2, 7.5, 6, 0.6]));
    for (let c = 0; c < 10; c++) a(e, 8028294, -6.9 + c * 0.6, 0.1, 7.19, 0.02, 1, 0.02);
    (a(e, 13148272, -6.6, 0, 4.4, 1, 0.9, 1.6), r.push([-6.6, 4.4, 1, 1.6]));
    for (let c = 0; c < 4; c++) a(e, [15251576, 14194768, 15784096, 13137984][c], -6.6, 0.9, 3.8 + c * 0.4, 0.6, 0.12, 0.3);
    (a(i, 16777215, 0, 2.6, -7.9, 0.5, 0.5, 0.02), a(e, 2236962, 0, 2.6, -7.88, 0.04, 0.2, 0.01));
    for (let c = 0; c < 4; c++) a(i, 16777215, -4 + (c % 2) * 8, 3.15, -3 + Math.floor(c / 2) * 6, 0.4, 0.04, 3);
    (o.push({
      x: 0,
      z: -4.6,
      r: 1.8,
      label: 'F\uFF1A\u6388\u696D\u3092\u53D7\u3051\u308B\uFF0850\u5206\uFF09',
      id: 'class',
    }),
      o.push({
        x: -5.6,
        z: 4.4,
        r: 1.3,
        label: 'F\uFF1A\u8CFC\u8CB7\u3067\u30D1\u30F3\u3092\u8CB7\u3046\uFF08\xA5200\uFF09',
        id: 'pan',
      }),
      o.push({
        x: 4.5,
        z: 7.2,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }),
      _1(t, 5, 0.7, 0, 2.55, -7.9));
    let u = new THREE.PointLight(16777215, 18, 24, 1.4);
    (u.position.set(0, 3, 0), t.add(u));
  } else if (n === 'hall') {
    (l(22, 22, 13, 2763312, 1842210, 1052692),
      (f = [-21.5, -21.5, 21.5, 21.5]),
      a(e, 3816e3, 0, 0, -18, 26, 1.4, 7),
      r.push([0, -18, 26, 7]),
      a(e, 6953506, 0, 1.4, -21.4, 28, 9, 0.2));
    for (let h = 0; h < 5; h++) a(e, [15263976, 13898271, 2783936, 15909424, 1710618][h], -6 + h * 3, 1.4, -17, 0.6, 1.7, 0.4);
    a(e, 2236966, 0, 10.5, -15, 28, 0.4, 0.4);
    for (let h = 0; h < 9; h++) a(i, [16732064, 4441855, 16765503, 8257370][h % 4], -12 + h * 3, 10.1, -15, 0.5, 0.4, 0.5);
    for (let h = 0; h < 6; h++) {
      for (let d of [-1, 1]) {
        let p = d * 11,
          x = 10 + h * 1.9,
          m = h * 0.6;
        a(e, 5904932, p, 0, x, 17, 0.5 + m, 1.8);
        for (let g = 0; g < 14; g++)
          a(e, [13898271, 15921902, 2763310, 16765503, 2783936][(h + g * 3) % 5], p - 7.8 + g * 1.2, 0.5 + m, x, 0.45, 0.9, 0.35);
      }
      for (let d of [-1, 1]) {
        let p = d * (17 + h * 0.8),
          x = h * 0.6;
        a(e, 5904932, p, 0, -3, 0.8, 0.5 + x, 22);
        for (let m = 0; m < 16; m++) a(e, [13898271, 15921902, 2763310, 16765503][(h + m) % 4], p, 0.5 + x, -13 + m * 1.3, 0.35, 0.9, 0.45);
      }
    }
    (r.push([-11, 14.8, 17.6, 11.6], [11, 14.8, 17.6, 11.6], [-19, -3, 6, 22], [19, -3, 6, 22]),
      a(e, 2763310, -12, 0, 5.6, 3, 1, 1),
      r.push([-12, 5.6, 3, 1]));
    for (let h = 0; h < 4; h++) a(e, [13898271, 15921902, 1710618, 16765503][h], -13.1 + h * 0.7, 1, 5.6, 0.5, 0.1, 0.6);
    (o.push({
      x: 0,
      z: -9,
      r: 5,
      label: 'F\uFF1A\u516C\u6F14\u3092\u89B3\u308B',
      id: 'show',
    }),
      o.push({
        x: -12,
        z: 4.4,
        r: 1.6,
        label: 'F\uFF1A\u30B0\u30C3\u30BA\u3092\u8CB7\u3046\uFF08\xA52,500\uFF09',
        id: 'goods',
      }),
      o.push({
        x: 0,
        z: 21.2,
        r: 2,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }),
      _1(t, 20, 6.25, 0, 7.4, -21.25, 1024, 320));
    let u = new THREE.PointLight(16769264, 90, 70, 1.2);
    (u.position.set(0, 9, -10), t.add(u));
    let c = new THREE.PointLight(8425727, 30, 60, 1.3);
    (c.position.set(0, 11, 10), t.add(c));
  } else if (n === 'museum') {
    (l(16, 12, 5, 9071178, 15921386, 16316660), (f = [-15.6, -11.6, 15.6, 11.6]));
    for (let h = 0; h < 5; h++) {
      a(e, 9071146, -10 + h * 5, 1.2, -11.96, 2.8, 2, 0.06);
      let d = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.7),
        new THREE.MeshBasicMaterial({
          map: p6(h),
          toneMapped: !1,
        }),
      );
      (d.position.set(-10 + h * 5, 2.2, -11.9), t.add(d), a(i, 16774360, -10 + h * 5, 3.6, -11.8, 1.2, 0.06, 0.2));
    }
    for (let h of [-1, 1])
      for (let d = 0; d < 3; d++) {
        a(e, 9071146, h * 15.96, 1.2, -6 + d * 5, 0.06, 2, 2.8);
        let p = new THREE.Mesh(
          new THREE.PlaneGeometry(2.5, 1.7),
          new THREE.MeshBasicMaterial({
            map: p6(5 + d + (h > 0 ? 3 : 0)),
            toneMapped: !1,
          }),
        );
        (p.position.set(h * 15.9, 2.2, -6 + d * 5), (p.rotation.y = (-h * Math.PI) / 2), t.add(p));
      }
    let u = new THREE.MeshStandardMaterial({
      color: 14677247,
      transparent: !0,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.1,
      depthWrite: !1,
    });
    for (let [h, d] of [
      [-8, -4],
      [0, -5],
      [8, -4],
      [-8, 3],
      [8, 3],
    ]) {
      (a(e, 2763310, h, 0, d, 2.2, 0.9, 1.4), r.push([h, d, 2.2, 1.4]));
      let p = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1, 1.3), u);
      (p.position.set(h, 1.4, d),
        t.add(p),
        (h + d) % 2
          ? (e.setColor(13148240).ell(h, 1.3, d, 0.35, 0.4, 0.35, 10, 6), e.setColor(2775690).ell(h + 0.6, 1.2, d, 0.22, 0.3, 0.22, 8, 5))
          : (a(e, 14202186, h, 0.9, d, 0.9, 0.06, 0.5), a(e, 9054762, h - 0.5, 0.9, d, 0.3, 0.5, 0.3)),
        a(i, 16774360, h, 4.95, d, 1.6, 0.04, 0.4));
    }
    (a(e, 6974062, -11, 0, 8, 1.6, 1, 1.6),
      r.push([-11, 8, 1.6, 1.6]),
      e.setColor(6969914).ell(-11, 1.9, 8, 0.45, 0.9, 0.35, 10, 8),
      e.setColor(6969914).ell(-11, 3, 8, 0.28, 0.3, 0.28, 8, 6),
      a(e, 13154458, 10, 0, 9, 4, 1, 1.2),
      r.push([10, 9, 4, 1.2]));
    for (let h = 0; h < 6; h++) a(e, [13898271, 2783936, 15909424, 3971666][h % 4], 8.4 + h * 0.6, 1, 9, 0.4, 0.3 + (h % 2) * 0.2, 0.5);
    for (let h = 0; h < 8; h++) a(i, 16777215, -12 + h * 3.4, 4.95, 6, 2, 0.04, 0.6);
    (o.push({
      x: 0,
      z: -1.2,
      r: 3,
      label: 'F\uFF1A\u5C55\u793A\u3092\u898B\u308B',
      id: 'show',
    }),
      o.push({
        x: 10,
        z: 7.6,
        r: 1.6,
        label: 'F\uFF1A\u30DF\u30E5\u30FC\u30B8\u30A2\u30E0\u30B7\u30E7\u30C3\u30D7\uFF08\xA51,500\uFF09',
        id: 'mshop',
      }),
      o.push({
        x: 0,
        z: 11.2,
        r: 1.8,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }),
      _1(t, 8, 1, 0, 4.2, -11.9));
    let c = new THREE.PointLight(16775406, 40, 44, 1.3);
    (c.position.set(0, 4.5, 0), t.add(c));
  } else if (n === 'izakaya') {
    (l(7, 7, 2.8, 5914152, 14207144, 3811870),
      (f = [-6.6, -6.6, 6.6, 6.6]),
      a(e, 6965808, 0, 0, -3.6, 10, 1.05, 1),
      a(e, 11569754, 0, 1.05, -3.6, 10.2, 0.06, 1.15),
      r.push([0, -3.6, 10, 1]));
    for (let c = 0; c < 8; c++) e.setColor(11740702).cyl(-4 + c * 1.15, 0, -2.6, 0.22, 0.7, 10);
    for (let c = 0; c < 18; c++)
      a(e, [2779706, 6961690, 14209216, 2763370, 13214522][c % 5], -4.6 + (c % 9) * 1.15, 1.3 + Math.floor(c / 9) * 0.55, -6.75, 0.2, 0.45, 0.2);
    (a(e, 5914152, 0, 1.25, -6.75, 11, 0.05, 0.4), a(e, 5914152, 0, 1.8, -6.75, 11, 0.05, 0.4));
    for (let c of [-1, 1]) {
      (a(e, 13156488, c * 3.6, 0.01, 2.6, 3.4, 0.03, 2.8), a(e, 7031346, c * 3.6, 0, 2.6, 2, 0.4, 1.2), r.push([c * 3.6, 2.6, 2, 1.2]));
      for (let h of [-1, 1]) a(e, 9054762, c * 3.6, 0, 2.6 + h * 0.95, 1.6, 0.08, 0.5);
    }
    for (let c = 0; c < 10; c++)
      (a(i, 16314584, -6.95, 1.2, -5 + c * 0.9, 0.02, 1, 0.7), a(e, 1710618, -6.93, 1.2 + 0.1, -5 + c * 0.9, 0.01, 0.8, 0.08));
    for (let [c, h] of [
      [-5, 5.6],
      [5, 5.6],
      [-2.5, -5.8],
      [2.5, -5.8],
    ])
      i.setColor(16734762).ell(c, 2.2, h, 0.32, 0.42, 0.32, 10, 6);
    (o.push({
      x: 0,
      z: -2.2,
      r: 2.2,
      label: 'F\uFF1A\u98F2\u3093\u3067\u98DF\u3079\u308B\uFF08\xA52,500\u30FB2\u6642\u9593\uFF09',
      id: 'izakaya',
    }),
      o.push({
        x: 0,
        z: 6.3,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16756848, 14, 18, 1.5);
    (u.position.set(0, 2.5, 0), t.add(u));
  } else if (n === 'sento') {
    (l(9, 9, 4.5, 10143960, 15266034, 15922936), (f = [-8.6, -8.6, 8.6, 8.6]));
    let u = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 3.2),
      new THREE.MeshBasicMaterial({
        map: sz(),
        toneMapped: !1,
      }),
    );
    (u.position.set(0, 2.85, -8.94),
      t.add(u),
      a(e, 14212576, 0, 0, -6, 15, 0.6, 5),
      r.push([0, -6, 15, 5]),
      a(i, 5945576, 0, 0.56, -6, 14.4, 0.02, 4.4));
    for (let h of [-1, 1])
      for (let d = 0; d < 5; d++) {
        let p = -1.5 + d * 1.8;
        (a(i, 14675958, h * 8.94, 1.1, p, 0.02, 0.8, 0.9),
          a(e, 13159632, h * 8.6, 0.65, p, 0.5, 0.08, 1.2),
          a(e, 15909424, h * 7.9, 0, p, 0.4, 0.3, 0.4),
          a(e, 15909424, h * 8.3, 0.73, p + 0.3, 0.3, 0.18, 0.3));
      }
    (a(e, 15263976, -7.8, 0, 6.2, 1.1, 1.8, 1.1), a(i, 14677247, -7.23, 0.3, 6.2, 0.02, 1.3, 0.9));
    for (let h = 0; h < 6; h++) a(e, h % 2 ? 9067066 : 15921902, -7.22, 0.5 + Math.floor(h / 3) * 0.5, 5.9 + (h % 3) * 0.3, 0.05, 0.3, 0.12);
    r.push([-7.8, 6.2, 1.1, 1.1]);
    for (let h = 0; h < 6; h++) a(i, 16777215, -6 + (h % 3) * 6, 4.45, -2 + Math.floor(h / 3) * 6, 1.2, 0.04, 0.6);
    (o.push({
      x: 0,
      z: -2.8,
      r: 2.6,
      label: 'F\uFF1A\u304A\u6E6F\u306B\u3064\u304B\u308B\uFF08\xA5520\uFF09',
      id: 'sento',
    }),
      o.push({
        x: -6.6,
        z: 6.2,
        r: 1.3,
        label: 'F\uFF1A\u30B3\u30FC\u30D2\u30FC\u725B\u4E73\uFF08\xA5150\uFF09',
        id: 'milk',
      }),
      o.push({
        x: 0,
        z: 8.3,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let c = new THREE.PointLight(16055295, 22, 26, 1.4);
    (c.position.set(0, 4, 0), t.add(c));
  } else if (n === 'capsule') {
    (l(6, 10, 3.4, 5921378, 14211292, 15263978), (f = [-5.6, -9.6, 5.6, 9.6]));
    for (let c of [-1, 1]) {
      for (let h = 0; h < 12; h++)
        for (let d = 0; d < 2; d++) {
          let p = -8.4 + h * 1.2,
            x = d * 1.3;
          (a(e, 15921902, c * 4.6, x, p, 2, 1.2, 1.12),
            a(i, (h + d) % 3 ? 16769712 : 3816004, c * 3.59, x + 0.2, p, 0.02, 0.8, 0.8),
            a(e, 6974066, c * 3.58, x + 0.08, p + 0.5, 0.03, 0.04, 0.1));
        }
      (a(e, 10133670, c * 3.55, 1.22, -1.8, 0.1, 0.06, 14.4), r.push([c * 4.6, -1.8, 2, 14.4]));
    }
    (a(e, 10133670, -2.6, 0, 8.6, 2.4, 1.9, 0.7), r.push([-2.6, 8.6, 2.4, 0.7]));
    for (let c = 0; c < 4; c++) a(e, 8028294, -3.5 + c * 0.6, 0.1, 8.24, 0.02, 1.6, 0.02);
    (a(e, 9071178, 3.4, 0, 7.6, 1.6, 1.05, 2), r.push([3.4, 7.6, 1.6, 2]), a(i, 10473727, 5.56, 1.6, 7.6, 0.02, 0.7, 1.6));
    for (let c = 0; c < 6; c++) a(i, 14674175, 0, 3.35, -8 + c * 3, 0.5, 0.04, 1.6);
    (o.push({
      x: 0,
      z: -3,
      r: 2.4,
      label: 'F\uFF1A\u6CCA\u307E\u308B\uFF08\xA53,500\u30FB\u671D\u307E\u3067\u7720\u3063\u3066\u30BB\u30FC\u30D6\uFF09',
      id: 'capsule',
    }),
      o.push({
        x: 0,
        z: 9.3,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(15659775, 14, 22, 1.4);
    (u.position.set(0, 3, 0), t.add(u));
  } else if (n === 'book') {
    (l(9, 9, 3.2, 9075304, 15789282, 16184558), (f = [-8.6, -8.6, 8.6, 8.6]));
    for (let c of [-6.6, -3.6, 3.6, 6.6]) {
      (a(e, 9071178, c, 0, -2.5, 0.9, 2, 9), r.push([c, -2.5, 0.9, 9]));
      for (let h = 0; h < 5; h++)
        for (let d = 0; d < 18; d++)
          for (let p of [-1, 1])
            a(
              e,
              [9054762, 2771594, 2779706, 13214522, 15262420, 5913194, 15231511][(h * 5 + d * 3 + (c > 0 ? 2 : 0) + (p > 0 ? 1 : 0)) % 7],
              c + p * 0.42,
              0.12 + h * 0.38,
              -6.7 + d * 0.48,
              0.1,
              0.28 + (d % 3) * 0.02,
              0.38,
            );
    }
    (a(e, 6965808, 0, 0, -4, 2.4, 0.8, 1.6), r.push([0, -4, 2.4, 1.6]));
    for (let c = 0; c < 8; c++)
      a(
        e,
        [13898271, 16765503, 2783936, 15921902][c % 4],
        -0.9 + (c % 4) * 0.6,
        0.8 + Math.floor(c / 4) * 0.03,
        -4.4 + Math.floor(c / 4) * 0.8,
        0.5,
        0.03,
        0.7,
      );
    (a(e, 9071178, 5.2, 0, 6.4, 3.4, 1.05, 1.2), r.push([5.2, 6.4, 3.4, 1.2]), a(e, 3355443, 4.5, 1.05, 6.4, 0.5, 0.35, 0.4));
    for (let c = 0; c < 6; c++) a(i, 16777215, -5 + (c % 3) * 5, 3.15, -5 + Math.floor(c / 3) * 7, 0.4, 0.04, 3);
    (o.push({
      x: 0,
      z: -2.4,
      r: 1.8,
      label: 'F\uFF1A\u7ACB\u3061\u8AAD\u307F\u3059\u308B\uFF08\u653B\u7565\u306E\u30D2\u30F3\u30C8\uFF09',
      id: 'book',
    }),
      o.push({
        x: 5.2,
        z: 5.2,
        r: 1.5,
        label: 'F\uFF1A\u6771\u4EAC\u30AC\u30A4\u30C9\u3092\u8CB7\u3046\uFF08\xA51,200\uFF09',
        id: 'guide',
      }),
      o.push({
        x: 0,
        z: 8.3,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16774368, 16, 24, 1.4);
    (u.position.set(0, 3, 0), t.add(u));
  } else if (n === 'gym') {
    (l(10, 9, 3.6, 3816e3, 14737636, 15790322), (f = [-9.6, -8.6, 9.6, 8.6]), a(i, 11057348, 0, 0.3, -8.96, 18, 2.8, 0.02));
    for (let c = 0; c < 6; c++) {
      let h = -7.5 + c * 3;
      (a(e, 2763310, h, 0, -6.4, 1, 0.25, 2),
        a(e, 1118481, h, 0.25, -6.3, 0.8, 0.02, 1.7),
        a(e, 6974066, h, 0, -7.35, 0.9, 1.3, 0.12),
        a(i, 4441855, h, 1.2, -7.28, 0.5, 0.3, 0.02),
        r.push([h, -6.5, 1, 2.1]));
    }
    (a(e, 3355448, -7.6, 0, 3, 1, 1.6, 4), r.push([-7.6, 3, 1, 4]));
    for (let c = 0; c < 5; c++) e.setColor(1710618).cyl(-7, 0.3 + c * 0.28, 1.4 + c * 0.8, 0.22, 0.18, 10);
    (a(e, 2763310, -3.5, 0, 3, 0.6, 0.45, 1.8), a(e, 10133670, -3.5, 1.1, 2.4, 1.8, 0.05, 0.05));
    for (let c of [-1, 1]) e.setColor(1710618).cyl(-3.5 + c * 0.9, 0.85, 2.4, 0.3, 0.06, 12);
    (r.push([-3.5, 3, 0.8, 2]), a(e, 2775690, 5, 0.01, 3, 6, 0.03, 5));
    for (let c = 0; c < 3; c++) e.setColor(3832532).ell(3.5 + c * 1.5, 0.35, 4.6, 0.35, 0.35, 0.35, 10, 6);
    for (let c = 0; c < 6; c++) a(i, 16777215, -6 + (c % 3) * 6, 3.55, -3 + Math.floor(c / 3) * 6, 2.2, 0.04, 0.4);
    (o.push({
      x: 0,
      z: -3.6,
      r: 2.4,
      label: 'F\uFF1A\u30C8\u30EC\u30FC\u30CB\u30F3\u30B0\u3059\u308B\uFF08\xA5800\u30FB1\u6642\u9593\uFF09',
      id: 'gym',
    }),
      o.push({
        x: 0,
        z: 8.3,
        r: 1.6,
        label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
        id: 'exit',
      }));
    let u = new THREE.PointLight(16777215, 22, 28, 1.4);
    (u.position.set(0, 3.4, 0), t.add(u));
  } else if (n === 'home') {
    (l(5, 6, 2.6, 10123866, 15722974, 16052974),
      (f = [-4.6, -5.6, 4.6, 5.6]),
      a(e, 14209732, -3, 0, -3.5, 2.2, 0.5, 3.8),
      a(e, 4026280, -3, 0.5, -3.5, 2.1, 0.15, 3.4),
      r.push([-3, -3.5, 2.2, 3.8]),
      o.push({
        x: -1.6,
        z: -3.5,
        r: 1.4,
        label: 'F\uFF1A\u5BDD\u308B\uFF08\u30BB\u30FC\u30D6\u3057\u3066\u671D\u307E\u3067\uFF09',
        id: 'sleep',
      }),
      a(e, 7031346, 3, 0, -4.5, 3, 0.75, 1),
      a(e, 1118481, 3, 0.75, -4.8, 1.8, 1, 0.1),
      a(i, 7317759, 3, 0.8, -4.74, 1.7, 0.9, 0.02),
      r.push([3, -4.5, 3, 1]),
      a(e, 11569754, 0, 0, 1.5, 1.8, 0.4, 1),
      a(e, 8018490, 3.8, 0, 3, 1.2, 1.8, 3),
      r.push([3.8, 3, 1.2, 3]),
      a(i, 16766362, 0, 2.55, 0, 0.8, 0.04, 0.8),
      a(e, 15262940, -4.3, 0, 2.6, 0.7, 0.9, 3.2),
      a(e, 2763566, -4.3, 0.9, 2.6, 0.72, 0.04, 3.2),
      a(e, 13159632, -4.62, 1.5, 2.6, 0.05, 0.7, 1.6),
      r.push([-4.3, 2.6, 0.7, 3.2]),
      a(e, 4872826, 0.5, 0, -1.4, 2.4, 0.45, 0.9),
      a(e, 4872826, 0.5, 0.45, -1.8, 2.4, 0.45, 0.2),
      r.push([0.5, -1.4, 2.4, 0.9]),
      a(e, 13217930, 0.5, 0.005, 0.6, 2.8, 0.01, 2.2),
      a(e, 3828282, 4.4, 0, -0.5, 0.4, 1, 0.4),
      a(e, 8018490, 4.4, 0, -0.5, 0.45, 0.4, 0.45),
      a(i, 2243178, 0, 1, -5.95, 4, 1.4, 0.02));
    for (let c = 0; c < 14; c++)
      a(i, c % 3 ? 16765562 : 16777215, -1.8 + (c % 7) * 0.6, 1.1 + Math.floor(c / 7) * 0.5, -5.93, 0.08, 0.06 + (c % 4) * 0.08, 0.01);
    (o.push({
      x: 0,
      z: 5.3,
      r: 1.4,
      label: 'F\uFF1A\u5916\u306B\u51FA\u308B',
      id: 'exit',
    }),
      o.push({
        x: 3,
        z: -3.6,
        r: 1.4,
        label: 'F\uFF1A\u30BB\u30FC\u30D6\u3059\u308B',
        id: 'save',
      }));
    let u = new THREE.PointLight(16769720, 9, 14, 1.6);
    (u.position.set(0, 2.3, 0), t.add(u));
  }
  {
    let u =
        {
          cafe: 5,
          ramen: 3,
          izakaya: 5,
          karaoke: 2,
          arcade: 5,
          pachinko: 7,
          race: 8,
          mall: 7,
          drug: 3,
          store: 3,
          station: 8,
          terminal: 10,
          museum: 6,
          univ: 10,
          school: 0,
          gym: 3,
          book: 3,
          hall: 26,
          sento: 2,
          gun: 1,
          capsule: 1,
        }[n] || 0,
      c = s * 7 + 13,
      h = () => (c = (c * 16807) % 2147483647) / 2147483647,
      [d, p, x, m] = f,
      g = [];
    for (let M = 0, y = 0; M < u && y < 400; y++) {
      let _ = d + 1 + h() * (x - d - 2),
        v = p + 1 + h() * (m - p - 2);
      if (
        Math.hypot(_, v - (m - 3.5)) < 3 ||
        ((n === 'univ' || n === 'hall') && Math.abs(_) < 2.2) ||
        o.some((C) => Math.hypot(C.x - _, C.z - v) < C.r + 0.6) ||
        r.some(([C, S, T, D]) => Math.abs(_ - C) < T / 2 + 0.5 && Math.abs(v - S) < D / 2 + 0.5) ||
        g.some((C) => Math.hypot(C[0] - _, C[1] - v) < 1.1)
      )
        continue;
      let b = [2771594, 14172202, 15921902, 3963466, 1710622, 13214522, 15247544, 6965898][Math.floor(h() * 8)],
        w = [1710618, 3811866, 5914672, 9071178][Math.floor(h() * 4)],
        E = 0.92 + h() * 0.16;
      (a(e, 2764346, _, 0, v, 0.38, 0.82 * E, 0.24),
        a(e, b, _, 0.82 * E, v, 0.48, 0.6 * E, 0.28),
        e.setColor(14727318).ell(_, 1.58 * E, v, 0.13, 0.15, 0.13, 8, 5),
        e.setColor(w).ell(_, 1.65 * E, v + 0.02, 0.135, 0.1, 0.14, 8, 4));
      for (let C of [-0.3, 0.3]) a(e, b, _ + C, 0.95 * E, v, 0.11, 0.45 * E, 0.13);
      (r.push([_, v, 0.5, 0.35]), g.push([_, v]), M++);
    }
  }
  for (let u of o)
    if (u.id === 'exit') {
      let c = f[3] + 0.36;
      (a(e, 4869458, u.x, 0, c, 2, 2.35, 0.06),
        a(e, 9080726, u.x, 0, c - 0.02, 1.7, 2.2, 0.04),
        a(i, 1622112, u.x, 2.42, c - 0.04, 0.9, 0.28, 0.02),
        a(e, 2763566, u.x, 0.005, c - 0.9, 1.8, 0.01, 1.2));
    }
  return (
    t.add(
      new THREE.Mesh(
        e.build(),
        new THREE.MeshStandardMaterial({
          vertexColors: !0,
          roughness: 0.6,
          side: THREE.DoubleSide,
        }),
      ),
    ),
    i.count &&
      t.add(
        new THREE.Mesh(
          i.build(),
          new THREE.MeshBasicMaterial({
            vertexColors: !0,
            toneMapped: !1,
          }),
        ),
      ),
    (t.visible = !1),
    R.scene.add(t),
    (K3[n] = {
      g: t,
      ox: s,
      bounds: f,
      actions: o,
      blocks: r,
      type: n,
    })
  );
}
function enter(n) {
  let t = oz(n.type);
  t.g.visible = !0;
  let [e, i, s, o] = t.bounds,
    r = t.g.position;
  ((player_P.interior = {
    room: t,
    door: n,
    back: {
      x: player_P.x,
      y: player_P.y,
      z: player_P.z,
    },
    bx0: r.x + e,
    bz0: r.z + i,
    bx1: r.x + s,
    bz1: r.z + o,
    by: S1,
  }),
    (player_P.x = r.x),
    (player_P.z = r.z + o - 3.5),
    (player_P.y = S1),
    (player_P.yaw = Math.PI),
    (G.cam.yaw = Math.PI),
    (G.cam.snap = !0),
    n.type === 'station' && rz(t, n.S),
    iz(t, n));
  for (let a of t.actions)
    a.id === 'show' &&
      (a.label = n.show
        ? `F\uFF1A${n.show}\u3092${t.type === 'museum' ? '\u898B\u308B' : '\u89B3\u308B'}\uFF08\xA5${(n.fee || 0).toLocaleString('ja-JP')}\uFF09`
        : 'F\uFF1A\u898B\u5B66\u3059\u308B');
  ((R.scene.fog.far = 1e6), xt('enterInterior', n));
}
function exit() {
  let n = player_P.interior;
  n &&
    ((n.room.g.visible = !1),
    (player_P.x = n.back.x),
    (player_P.z = n.back.z),
    (player_P.y = 0.2),
    (player_P.interior = null),
    (G.cam.snap = !0),
    (R.scene.fog.far = R.Q.lod * 1.05),
    xt('exitInterior', n.door));
}
function updInterior(n) {
  let t = player_P.interior;
  if (!t) return null;
  let e = t.room.g.position;
  ((player_P.x = It(player_P.x, t.bx0 + 0.4, t.bx1 - 0.4)),
    (player_P.z = It(player_P.z, t.bz0 + 0.4, t.bz1 - 0.4)),
    (player_P.y = Math.max(player_P.y, S1)));
  for (let [s, o, r, a] of t.room.blocks) {
    let l = player_P.x - e.x - s,
      f = player_P.z - e.z - o,
      u = r / 2 + 0.35,
      c = a / 2 + 0.35;
    if (Math.abs(l) < u && Math.abs(f) < c) {
      let h = u - Math.abs(l),
        d = c - Math.abs(f);
      h < d ? (player_P.x += Math.sign(l) * h) : (player_P.z += Math.sign(f) * d);
    }
  }
  let i = null;
  for (let s of t.room.actions) Math.hypot(player_P.x - e.x - s.x, player_P.z - e.z - s.z) < s.r && (i = s);
  return i;
}
function rz(n, t) {
  let e = n.g.userData.board;
  if (!e) return;
  let i = e.x;
  ((i.fillStyle = '#05070a'),
    i.fillRect(0, 0, 1024, 140),
    (i.font = `800 26px ${ce}`),
    (i.fillStyle = '#ffb000'),
    i.fillText(`${t.ja}\u99C5  ${t.en} STATION`, 20, 36),
    t.lines.slice(0, 4).forEach((s, o) => {
      ((i.fillStyle = s.rail.color),
        i.fillRect(20 + o * 250, 56, 16, 60),
        (i.fillStyle = '#fff'),
        (i.font = `800 22px ${ce}`),
        i.fillText(s.rail.ja.replace('\u6771\u4EAC\u30E1\u30C8\u30ED', '\u30E1\u30C8\u30ED'), 44 + o * 250, 82),
        (i.fillStyle = '#9fd'),
        (i.font = `600 18px ${ce}`),
        i.fillText('\u307E\u3082\u306A\u304F\u5230\u7740', 44 + o * 250, 108));
    }),
    (e.t.needsUpdate = !0));
}
function nearDoor(n, t) {
  let e = null,
    i = 3.2;
  for (let s of DOORS) {
    let o = Math.hypot(s.x - n, s.z - t);
    o < i && ((i = o), (e = s));
  }
  return e;
}
var MI = {};
vi(MI, {
  CAPS: () => CAPS,
  CAST: () => CAST,
  JOB: () => JOB,
  MISSIONS: () => MISSIONS,
  MS: () => MS,
  availableMissions: () => availableMissions,
  fail: () => fail,
  initCapsules: () => initCapsules,
  initMissions: () => initMissions,
  missionEvent: () => missionEvent,
  nearMissionStart: () => nearMissionStart,
  objectiveText: () => objectiveText,
  startJob: () => startJob,
  startMission: () => startMission,
  updCapsules: () => updCapsules,
  updJob: () => updJob,
  updMissions: () => updMissions,
  updRoute: () => updRoute,
});
var si = (n, t) => fe(n, t),
  CAST = {
    saki: '\u4F50\u3005\u6728 \u54B2\uFF08\u4E0D\u52D5\u7523\u5C4B\uFF09',
    ken: '\u5927\u68EE \u5065\uFF08\u30BF\u30AF\u30B7\u30FC\u4F1A\u793E\uFF09',
    hana: '\u82B1\u7530\uFF08\u904B\u9001\u4F1A\u793E\uFF09',
    ryo: '\u9ED2\u5DDD \u30EA\u30E7\u30A6\uFF08\u8D70\u308A\u5C4B\uFF09',
    inspector: '\u771F\u7530 \u5211\u4E8B',
    pilot: '\u9AD8\u5CF0 \u6A5F\u9577',
  },
  MISSIONS = [
    {
      id: 'm1',
      title: '\u4E0A\u4EAC',
      who: 'saki',
      start: si(35.66, 139.7005),
      intro: [
        '\u3088\u3046\u3053\u305D\u6771\u4EAC\u3078\uFF01\u90E8\u5C4B\u306E\u9375\u3092\u6E21\u3059\u306D\u3002',
        '\u307E\u305A\u306F\u8FD1\u304F\u306E\u30B3\u30F3\u30D3\u30CB\u3067\u98F2\u307F\u7269\u3067\u3082\u8CB7\u3063\u3066\u304D\u3066\u3002',
      ],
      steps: [
        {
          t: 'shop',
          text: '\u30B3\u30F3\u30D3\u30CB\u3067\u4F55\u304B\u8CB7\u3046\uFF08\u9EC4\u8272\u306E\u30DE\u30FC\u30AB\u30FC\u4ED8\u8FD1\u306E\u5E97\uFF09',
        },
        {
          t: 'go',
          to: si(35.6628, 139.696),
          r: 12,
          text: '\u81EA\u5B85\u306B\u884C\u304F',
          foot: !0,
        },
      ],
      reward: 1e3,
    },
    {
      id: 'm2',
      title: '\u306F\u3058\u3081\u3066\u306E\u904B\u8EE2',
      who: 'ken',
      start: si(35.6585, 139.704),
      intro: [
        '\u3046\u3061\u306E\u30BF\u30AF\u30B7\u30FC\u3001\u4E00\u53F0\u8CB8\u3057\u3066\u3084\u308B\u3002',
        '\u6B4C\u821E\u4F0E\u753A\u4E00\u756A\u8857\u306E\u30B2\u30FC\u30C8\u524D\u307E\u3067\u8D70\u3063\u3066\u307F\u306A\u3002',
      ],
      steps: [
        {
          t: 'spawn',
          car: 'taxi',
          at: si(35.6588, 139.7046),
          text: '\u30BF\u30AF\u30B7\u30FC\u306B\u4E57\u308B',
        },
        {
          t: 'enter',
          kind: 'car',
          text: '\u30BF\u30AF\u30B7\u30FC\u306B\u4E57\u308B',
        },
        {
          t: 'go',
          to: si(35.6936, 139.7024),
          r: 18,
          text: '\u6B4C\u821E\u4F0E\u753A\u4E00\u756A\u8857\u3078\u5411\u304B\u3046',
          vehicle: !0,
          time: 300,
        },
      ],
      reward: 2500,
    },
    {
      id: 'm3',
      title: '\u5C71\u624B\u7DDA\u3072\u3068\u56DE\u308A',
      who: 'saki',
      start: si(35.6905, 139.7),
      intro: [
        '\u4ECA\u65E5\u306F\u7269\u4EF6\u306E\u5185\u898B\u3002',
        '\u65B0\u5BBF\u99C5\u304B\u3089\u5C71\u624B\u7DDA\u3067\u6771\u4EAC\u99C5\u307E\u3067\u884C\u3063\u3066\u307F\u3066\u3002',
      ],
      steps: [
        {
          t: 'station',
          name: '\u65B0\u5BBF',
          text: '\u65B0\u5BBF\u99C5\u306B\u5165\u308B',
        },
        {
          t: 'ride',
          to: '\u6771\u4EAC',
          text: '\u96FB\u8ECA\u3067\u6771\u4EAC\u99C5\u3078',
        },
      ],
      reward: 3e3,
    },
    {
      id: 'm4',
      title: '\u9280\u5EA7\u306E\u914D\u9054',
      who: 'hana',
      start: si(35.68, 139.769),
      intro: [
        '\u6025\u304E\u306E\u8377\u7269\u304C\u3042\u308B\u3093\u3060\u3002',
        '\u3053\u306E\u30D0\u30F3\u3067\u9280\u5EA7\u306E\u4E2D\u592E\u901A\u308A\u307E\u3067\u30014\u5206\u4EE5\u5185\u306B\u5C4A\u3051\u3066\u304F\u308C\uFF01',
      ],
      steps: [
        {
          t: 'spawn',
          car: 'delivery',
          at: si(35.6796, 139.7695),
          text: '\u914D\u9001\u30D0\u30F3\u306B\u4E57\u308B',
        },
        {
          t: 'enter',
          kind: 'car',
          text: '\u914D\u9001\u30D0\u30F3\u306B\u4E57\u308B',
        },
        {
          t: 'go',
          to: si(35.6717, 139.7652),
          r: 15,
          text: '\u9280\u5EA7\u56DB\u4E01\u76EE\u4EA4\u5DEE\u70B9\u3078',
          vehicle: !0,
          time: 240,
        },
        {
          t: 'go',
          to: si(35.665, 139.77),
          r: 15,
          text: '\u7BC9\u5730\u306E\u5009\u5EAB\u3078',
          vehicle: !0,
          time: 150,
        },
      ],
      reward: 4500,
    },
    {
      id: 'm5',
      title: '\u9996\u90FD\u9AD8\u30D0\u30C8\u30EB',
      who: 'ryo',
      start: si(35.665, 139.759),
      intro: [
        'C1\u3092\u4E00\u5468\u3057\u3066\u307F\u306A\u3002',
        '\u30C1\u30A7\u30C3\u30AF\u30DD\u30A4\u30F3\u30C8\u3092\u5168\u90E8\u901A\u3063\u3066\u3001\u6642\u9593\u5185\u306B\u623B\u3063\u3066\u3053\u3044\u3002',
      ],
      steps: [
        {
          t: 'spawn',
          car: 'sport',
          at: si(35.6655, 139.7586),
          color: 1990574,
          text: '\u30B9\u30DD\u30FC\u30C4\u30AB\u30FC\u306B\u4E57\u308B',
        },
        {
          t: 'enter',
          kind: 'car',
          text: '\u30B9\u30DD\u30FC\u30C4\u30AB\u30FC\u306B\u4E57\u308B',
        },
        {
          t: 'race',
          road: '\u9996\u90FD\u9AD8 \u90FD\u5FC3\u74B0\u72B6\u7DDA',
          cps: 9,
          time: 300,
          text: '\u90FD\u5FC3\u74B0\u72B6\u7DDA\u3092\u4E00\u5468',
        },
      ],
      reward: 8e3,
    },
    {
      id: 'm6',
      title: '\u76D7\u96E3\u8ECA\u3092\u8FFD\u3048',
      who: 'inspector',
      start: si(35.674, 139.76),
      intro: [
        '\u76D7\u96E3\u8ECA\u304C\u6709\u697D\u753A\u65B9\u9762\u3078\u9003\u8D70\u4E2D\u3060\u3002',
        '\u5354\u529B\u3057\u3066\u304F\u308C\u3002\u4F53\u5F53\u305F\u308A\u3067\u6B62\u3081\u308D\uFF01',
      ],
      steps: [
        {
          t: 'enter',
          kind: 'car',
          text: '\u8FD1\u304F\u306E\u8ECA\u306B\u4E57\u308B',
        },
        {
          t: 'chase',
          text: '\u76D7\u96E3\u8ECA\u3092\u6B62\u3081\u308B\uFF08\u4F53\u5F53\u305F\u308A\uFF09',
          time: 240,
        },
      ],
      reward: 7e3,
    },
    {
      id: 'm7',
      title: '\u9003\u8D70',
      who: 'ryo',
      start: si(35.63, 139.779),
      intro: [
        '\u3061\u3087\u3063\u3068\u6D3E\u624B\u306B\u3084\u308A\u3059\u304E\u305F\u3002',
        '\u8B66\u5BDF\u3092\u632F\u308A\u5207\u3063\u3066\u304A\u53F0\u5834\u304B\u3089\u9003\u3052\u308D\uFF01',
      ],
      steps: [
        {
          t: 'enter',
          kind: 'car',
          text: '\u8ECA\u306B\u4E57\u308B',
        },
        {
          t: 'heat',
          stars: 3,
          text: '\u624B\u914D\u5EA6\u26053\u306B\u306A\u308B',
        },
        {
          t: 'evade',
          text: '\u8B66\u5BDF\u3092\u632F\u308A\u5207\u308B',
        },
      ],
      reward: 9e3,
    },
    {
      id: 'm8',
      title: '\u30EC\u30A4\u30F3\u30DC\u30FC\u30D6\u30EA\u30C3\u30B8',
      who: 'saki',
      start: si(35.646, 139.756),
      intro: [
        '\u304A\u53F0\u5834\u306E\u7269\u4EF6\u5199\u771F\u304C\u6B32\u3057\u3044\u306E\u3002',
        '\u30EC\u30A4\u30F3\u30DC\u30FC\u30D6\u30EA\u30C3\u30B8\u3092\u6E21\u3063\u3066\u3001\u30D5\u30B8\u30C6\u30EC\u30D3\u306E\u7403\u4F53\u3092\u64AE\u3063\u3066\u304D\u3066\u3002',
      ],
      steps: [
        {
          t: 'enter',
          kind: 'car',
          text: '\u8ECA\u306B\u4E57\u308B',
        },
        {
          t: 'go',
          to: si(35.629, 139.772),
          r: 40,
          text: '\u30EC\u30A4\u30F3\u30DC\u30FC\u30D6\u30EA\u30C3\u30B8\u3092\u6E21\u3063\u3066\u304A\u53F0\u5834\u3078',
          vehicle: !0,
        },
        {
          t: 'photo',
          at: 'fujiTV',
          r: 260,
          text: '\u30D5\u30B8\u30C6\u30EC\u30D3\u306E\u7403\u4F53\u3092\u64AE\u5F71\uFF08F\uFF09',
        },
      ],
      reward: 6e3,
    },
    {
      id: 'm9',
      title: '\u591C\u9593\u98DB\u884C',
      who: 'pilot',
      start: si(35.638, 139.826),
      intro: [
        '\u6771\u4EAC\u30D8\u30EA\u30DD\u30FC\u30C8\u3078\u3088\u3046\u3053\u305D\u3002',
        '\u6771\u4EAC\u30BF\u30EF\u30FC\u3068\u30B9\u30AB\u30A4\u30C4\u30EA\u30FC\u306E\u4E0A\u7A7A\u306E\u30EA\u30F3\u30B0\u3092\u901A\u904E\u3057\u3066\u304D\u3066\u304F\u308C\u3002',
      ],
      steps: [
        {
          t: 'enter',
          kind: 'heli',
          text: '\u30D8\u30EA\u306B\u4E57\u308B',
        },
        {
          t: 'rings',
          pts: [
            ['tokyoTower', 380],
            ['skytree', 700],
            ['tocho', 300],
          ],
          text: '\u30EA\u30F3\u30B0\u3092\u901A\u904E\u3059\u308B',
        },
        {
          t: 'land',
          to: si(35.6375, 139.8275),
          r: 40,
          text: '\u30D8\u30EA\u30DD\u30FC\u30C8\u306B\u7740\u9678',
        },
      ],
      reward: 12e3,
      night: !0,
    },
    {
      id: 'm10',
      title: '\u7FBD\u7530\u767A',
      who: 'pilot',
      start: si(35.55, 139.784),
      intro: [
        '\u6A5F\u9577\u3001\u51FA\u756A\u3060\u3002',
        'C\u6ED1\u8D70\u8DEF\u304B\u3089\u96E2\u9678\u3057\u3066\u3001\u6E7E\u4E0A\u306E\u30EA\u30F3\u30B0\u3092\u901A\u308A\u3001A\u6ED1\u8D70\u8DEF\u306B\u7740\u9678\u3057\u3066\u304F\u308C\u3002',
      ],
      steps: [
        {
          t: 'enter',
          kind: 'plane',
          text: '\u99D0\u6A5F\u4E2D\u306E\u98DB\u884C\u6A5F\u306B\u4E57\u308B',
        },
        {
          t: 'rings',
          pts: [
            [HND.C.x + HND.ux * 3e3, 250, HND.C.z + HND.uz * 3e3],
            [HND.C.x + 2500, 400, HND.C.z + 3e3],
            [HND.A.x - HND.ux * 5e3, 200, HND.A.z - HND.uz * 5e3],
          ],
          text: '\u30EA\u30F3\u30B0\u3092\u901A\u904E',
        },
        {
          t: 'land',
          to: [HND.A.x, HND.A.z],
          r: 1500,
          plane: !0,
          text: 'A\u6ED1\u8D70\u8DEF\u306B\u7740\u9678\u3057\u3066\u505C\u6B62',
        },
      ],
      reward: 2e4,
    },
  ],
  MS = {
    cur: null,
    step: 0,
    st: {},
    done: new Set(),
    timer: 0,
    marker: null,
    target: null,
    ring: null,
  };
function initMissions(n) {
  if (n && n.done) for (let t of n.done) MS.done.add(t);
  az();
}
var zo,
  ms,
  x6 = [];
function az() {
  zo = new THREE.Group();
  let n = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 80, 24, 1, !0),
    new THREE.MeshBasicMaterial({
      color: 16765503,
      transparent: !0,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: !1,
      side: THREE.DoubleSide,
    }),
  );
  ((n.position.y = 40), zo.add(n));
  let t = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 4.2, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 16765503,
      transparent: !0,
      opacity: 0.85,
      depthWrite: !1,
    }),
  );
  ((t.position.y = 0.3),
    zo.add(t),
    (zo.visible = !1),
    R.scene.add(zo),
    (ms = new THREE.Mesh(
      new THREE.TorusGeometry(40, 2.5, 10, 48),
      new THREE.MeshBasicMaterial({
        color: 16765503,
        transparent: !0,
        opacity: 0.75,
        toneMapped: !1,
      }),
    )),
    (ms.visible = !1),
    R.scene.add(ms));
  for (let e of MISSIONS) {
    let i = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 30, 16, 1, !0),
      new THREE.MeshBasicMaterial({
        color: 4903679,
        transparent: !0,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: !1,
        side: THREE.DoubleSide,
      }),
    );
    (i.position.set(e.start[0], 15, e.start[1]), R.scene.add(i), x6.push([e, i]));
  }
}
function availableMissions() {
  let n = [];
  for (let t = 0; t < MISSIONS.length; t++) {
    let e = MISSIONS[t];
    if (!MS.done.has(e.id) && (n.push(e), n.length >= 3)) break;
  }
  return n;
}
function nearMissionStart(n, t) {
  if (MS.cur) return null;
  for (let e of availableMissions()) if (Math.hypot(e.start[0] - n, e.start[1] - t) < 6) return e;
  return null;
}
function startMission(n) {
  ((MS.cur = n),
    (MS.step = 0),
    (MS.st = {}),
    (MS.timer = 0),
    xt('dialog', {
      who: CAST[n.who],
      lines: n.intro,
      title: n.title,
    }),
    gt.blip(),
    n.night && R.tod > 6 && R.tod < 18.5 && (R.tod = 19.5),
    r5());
}
function r5() {
  let n = MS.cur.steps[MS.step];
  if (((MS.st = {}), (MS.timer = n.time || 0), (MS.target = null), n.t === 'spawn')) {
    let t = newCar(n.car, n.at[0], n.at[1], 0, 'phys', n.color);
    return (t && ((t.driver = !1), (t.parked = !0), (t.keep = !0), (t.y = 0.04), (MS.st.car = t), (MS.target = [n.at[0], n.at[1]])), MS.step++, r5());
  }
  if (((n.t === 'go' || n.t === 'land') && (MS.target = n.to), n.t === 'station')) {
    let t = W.stations.find((e) => e.ja === n.name);
    t && t.entrances[0] && (MS.target = [t.entrances[0].x, t.entrances[0].z]);
  }
  if (n.t === 'photo') {
    let t = W.landmarks[n.at];
    MS.target = [t.x, t.z];
  }
  if (n.t === 'race') {
    let t = W.edges.filter((l) => W.roadNames[l.road] === n.road),
      e = [];
    for (let l of t)
      for (let f = 0; f < l.len; f += 40) {
        let u = edgePos(l, f, {});
        e.push([u.x, u.z]);
      }
    let i = e.reduce((l, f) => l + f[0], 0) / e.length,
      s = e.reduce((l, f) => l + f[1], 0) / e.length;
    e.sort((l, f) => Math.atan2(l[1] - s, l[0] - i) - Math.atan2(f[1] - s, f[0] - i));
    let o = player_P.car ? [player_P.car.x, player_P.car.z] : [player_P.x, player_P.z],
      r = 0,
      a = 1e9;
    (e.forEach((l, f) => {
      let u = Math.hypot(l[0] - o[0], l[1] - o[1]);
      u < a && ((a = u), (r = f));
    }),
      (MS.st.cps = []));
    for (let l = 1; l <= n.cps; l++) MS.st.cps.push(e[(r + Math.round((l * e.length) / n.cps)) % e.length]);
    ((MS.st.ci = 0), (MS.target = MS.st.cps[0]));
  }
  if (n.t === 'chase') {
    let t = [];
    roadsNear(player_P.x + 120, player_P.z + 60, 120, t);
    let e = t.find((i) => !i.e.elev && i.e.kind === 'A') || t[0];
    if (e) {
      let i = spawnAICar(e.x, e.z, 'sport');
      i && (toPhys(i), (i.ctl = 'npc'), (i.keep = !0), (i.hp = 140), (i.ai = lz), setColor(i, 15909424), (MS.st.car = i));
    }
  }
  (n.t === 'rings' &&
    ((MS.st.ri = 0),
    (MS.st.rings = n.pts.map((t) =>
      typeof t[0] == 'string'
        ? (() => {
            let e = W.landmarks[t[0]];
            return [e.x, t[1], e.z];
          })()
        : t,
    ))),
    xt('objective', n.text),
    updRoute());
}
function lz(n, t) {
  if (((n.pt = (n.pt || 0) - t), n.pt <= 0 || !n.goal)) {
    n.pt = 6;
    let o = Math.random() * Math.PI * 2;
    ((n.goal = [n.x + Math.cos(o) * 900, n.z + Math.sin(o) * 900]),
      (n.path = route(
        nearestNode(n.x, n.z, (r) => !r.elev),
        nearestNode(n.goal[0], n.goal[1]),
      )),
      (n.pi = 1));
  }
  let e = n.goal[0],
    i = n.goal[1];
  if (n.path && n.path.length > 1) {
    for (; n.pi < n.path.length - 1 && Math.hypot(W.nodes[n.path[n.pi]].x - n.x, W.nodes[n.path[n.pi]].z - n.z) < 12;) n.pi++;
    let o = W.nodes[n.path[n.pi]];
    ((e = o.x), (i = o.z));
  }
  let s = ((Math.atan2(e - n.x, i - n.z) - n.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return (
    Math.abs(n.v) < 1 && (n.stk = (n.stk || 0) + t) > 1.5 && ((n.stk = 0), (n.rev = 1.2)),
    n.rev > 0 ? ((n.rev -= t), [0, s > 0 ? 1 : -1, 1]) : [Math.abs(s) > 1.1 && Math.abs(n.v) > 14 ? 0.2 : 0.92, It(-s * 2.2, -1, 1), 0]
  );
}
function updRoute() {
  let n = MS.target || G.waypoint;
  if (!n) {
    G.route = null;
    return;
  }
  let t = route(
    nearestNode(player_P.x, player_P.z, (e) => (player_P.y > 3 ? !0 : !e.elev || !0)),
    nearestNode(n[0], n[1]),
  );
  G.route = t;
}
var i5 = 0;
function updMissions(n) {
  for (let [r, a] of x6)
    ((a.visible = !MS.cur && !MS.done.has(r.id) && availableMissions().includes(r)), (a.material.opacity = 0.25 + 0.15 * Math.sin(G.t * 3)));
  ((i5 -= n), i5 <= 0 && ((i5 = 1.5), updRoute()));
  let t = MS.cur;
  if (!t) {
    ((zo.visible = !1), (ms.visible = !1));
    return;
  }
  let e = t.steps[MS.step],
    i =
      (player_P.mode === 'car' || player_P.mode === 'ride') && player_P.car
        ? player_P.car.x
        : player_P.mode === 'plane' || player_P.mode === 'heli'
          ? player_P.air.x
          : player_P.x,
    s =
      (player_P.mode === 'car' || player_P.mode === 'ride') && player_P.car
        ? player_P.car.z
        : player_P.mode === 'plane' || player_P.mode === 'heli'
          ? player_P.air.z
          : player_P.z;
  if (MS.timer > 0 && ((MS.timer -= n), MS.timer <= 0)) return fail('\u6642\u9593\u5207\u308C');
  ((zo.visible = !!MS.target && e.t !== 'rings' && e.t !== 'race'), (ms.visible = !1), MS.target && zo.position.set(MS.target[0], 0, MS.target[1]));
  let o = !1;
  switch (e.t) {
    case 'shop':
      o = MS.st.bought;
      break;
    case 'go':
      o = Math.hypot(i - e.to[0], s - e.to[1]) < e.r && (!e.vehicle || player_P.mode === 'car') && (!e.foot || player_P.mode === 'foot');
      break;
    case 'enter':
      if (((o = e.kind === 'car' ? player_P.mode === 'car' : player_P.mode === e.kind), !o && MS.st.car === void 0)) {
        let r = G.cars.find((a) => a.keep && !a.ctl && !a.removed);
        r && (MS.target = [r.x, r.z]);
      }
      break;
    case 'station':
      o = player_P.interior && player_P.interior.door.type === 'station' && player_P.interior.door.S.ja === e.name;
      break;
    case 'ride':
      o = MS.st.arrived;
      break;
    case 'race': {
      let r = MS.st.cps[MS.st.ci];
      ((ms.visible = !0),
        ms.position.set(r[0], 18, r[1]),
        ms.scale.setScalar(0.35),
        ms.rotation.set(0, G.t, 0),
        (MS.target = r),
        Math.hypot(i - r[0], s - r[1]) < 26 &&
          (MS.st.ci++, gt.blip(), MS.st.ci >= MS.st.cps.length ? (o = !0) : xt('objective', `${e.text}\uFF08${MS.st.ci}/${MS.st.cps.length}\uFF09`)));
      break;
    }
    case 'chase': {
      let r = MS.st.car;
      if (!r || r.removed || ((MS.target = [r.x, r.z]), (r.hp <= 0 || r.dead) && (o = !0), Math.hypot(r.x - i, r.z - s) > 700))
        return fail('\u898B\u5931\u3063\u305F');
      break;
    }
    case 'heat':
      if (player_P.mode !== 'car') break;
      (MS.st.started || ((MS.st.started = 1), forceStars(e.stars)), (o = Ke() >= e.stars));
      break;
    case 'evade':
      o = Ke() === 0;
      break;
    case 'photo':
      MS.st.shot && (o = !0);
      break;
    case 'rings': {
      let r = MS.st.rings[MS.st.ri];
      ((ms.visible = !0),
        ms.position.set(r[0], r[1], r[2]),
        ms.scale.setScalar(1),
        ms.rotation.set(0, Math.atan2(r[0] - i, r[2] - s), 0),
        (MS.target = [r[0], r[2]]));
      let a = player_P.air;
      a &&
        Math.hypot(a.x - r[0], a.y - r[1], a.z - r[2]) < 45 &&
        (MS.st.ri++, gt.blip(), xt('toast', `\u30EA\u30F3\u30B0 ${MS.st.ri}/${MS.st.rings.length}`), MS.st.ri >= MS.st.rings.length && (o = !0));
      break;
    }
    case 'land': {
      let r = player_P.air;
      if (!r) break;
      let a = player_P.mode === 'plane' ? r.v : Math.hypot(r.vx, r.vz);
      o = Math.hypot(r.x - e.to[0], r.z - e.to[1]) < e.r && a < 3 && (player_P.mode === 'plane' ? r.y < 1 : !0);
      break;
    }
  }
  if (o) {
    if ((MS.step++, gt.blip(), MS.step >= t.steps.length)) return cz();
    r5();
  }
}
function missionEvent(n, t) {
  let e = MS.cur;
  if (!e) return;
  let i = e.steps[MS.step];
  if (
    (n === 'buy' && i.t === 'shop' && (MS.st.bought = !0),
    n === 'alight' && i.t === 'ride' && t.st && t.st.ja.startsWith(i.to) && (MS.st.arrived = !0),
    n === 'photo' && i.t === 'photo')
  ) {
    let s = W.landmarks[i.at];
    Math.hypot(player_P.x - s.x, player_P.z - s.z) < i.r || (player_P.car && Math.hypot(player_P.car.x - s.x, player_P.car.z - s.z) < i.r)
      ? (MS.st.shot = !0)
      : xt('toast', '\u3082\u3063\u3068\u8FD1\u3065\u3044\u3066\u64AE\u5F71\u3057\u3088\u3046');
  }
  (n === 'wasted' || n === 'busted') && fail(n === 'wasted' ? '\u3084\u3089\u308C\u305F' : '\u902E\u6355\u3055\u308C\u305F');
}
function cz() {
  let n = MS.cur;
  (MS.done.add(n.id),
    (G.money += n.reward),
    G.stats.missions++,
    gt.mission(),
    xt('big', {
      t: 'MISSION PASSED',
      s: `${n.title}  +\xA5${n.reward.toLocaleString('ja-JP')}`,
      col: '#ffd23f',
    }));
  for (let t of G.cars) t.keep = !1;
  ((MS.cur = null), (MS.target = null), (G.route = null), xt('save'));
}
function fail(n) {
  if (MS.cur) {
    (gt.fail(),
      xt('big', {
        t: 'MISSION FAILED',
        s: n,
        col: '#e5402b',
      }));
    for (let e of G.cars) e.keep = !1;
    ((MS.cur = null), (MS.target = null), (G.route = null));
  }
}
function objectiveText() {
  if (!MS.cur) return null;
  let n = MS.cur.steps[MS.step];
  return {
    title: MS.cur.title,
    text: n
      ? n.t === 'race'
        ? `${n.text}\uFF08${MS.st.ci || 0}/${(MS.st.cps || []).length}\uFF09`
        : n.t === 'rings'
          ? `${n.text}\uFF08${MS.st.ri || 0}/${(MS.st.rings || []).length}\uFF09`
          : n.text
      : '',
    timer: MS.timer,
  };
}
var JOB = {
  active: !1,
};
function startJob() {
  if (JOB.active) {
    xt('toast', '\u4ED5\u4E8B\u4E2D\u3067\u3059');
    return;
  }
  if (player_P.mode !== 'car') {
    xt('toast', '\u4ED5\u4E8B\u306B\u306F\u8ECA\u304C\u5FC5\u8981\u3067\u3059');
    return;
  }
  let n = (s, o, r, a) => {
      for (let l = 0; l < 40; l++) {
        let f = Math.random() * Math.PI * 2,
          u = rt(r, a),
          c = [];
        roadsNear(s + Math.cos(f) * u, o + Math.sin(f) * u, 60, c);
        let h = c.find((d) => !d.e.elev && d.e.kind !== 'L');
        if (h) return [h.x, h.z];
      }
      return [s + 200, o];
    },
    t = n(player_P.car.x, player_P.car.z, 200, 450),
    e = n(t[0], t[1], 800, 1600),
    i = Math.hypot(e[0] - t[0], e[1] - t[1]);
  (Object.assign(JOB, {
    active: !0,
    stage: 1,
    A: t,
    B: e,
    dab: i,
    type: player_P.car.t === 'taxi' ? 'taxi' : 'deliv',
    t: Math.hypot(t[0] - player_P.x, t[1] - player_P.z) / 8 + 45,
    dname: districtAt(e[0], e[1]).n,
  }),
    (MS.target = t),
    updRoute(),
    xt(
      'toast',
      JOB.type === 'taxi'
        ? '\u30BF\u30AF\u30B7\u30FC\uFF1A\u304A\u5BA2\u3055\u3093\u3092\u8FCE\u3048\u306B\u884C\u3053\u3046'
        : '\u914D\u9054\uFF1A\u8377\u7269\u3092\u53D7\u3051\u53D6\u308A\u306B\u884C\u3053\u3046',
    ),
    gt.blip());
}
function updJob(n) {
  if (!JOB.active || MS.cur) return;
  JOB.t -= n;
  let t = JOB.stage === 1 ? JOB.A : JOB.B;
  ((MS.target = t), (zo.visible = !0), zo.position.set(t[0], 0, t[1]));
  let e = player_P.car;
  if (!e) return;
  if (Math.hypot(e.x - t[0], e.z - t[1]) < 12 && Math.abs(e.v) < 5) {
    if (JOB.stage === 1)
      ((JOB.stage = 2),
        (JOB.t = JOB.dab / 10 + 40),
        (MS.target = JOB.B),
        updRoute(),
        xt(
          'toast',
          JOB.type === 'taxi'
            ? `\u304A\u5BA2\u3055\u3093\uFF1A\u300C${JOB.dname}\u307E\u3067\u304A\u9858\u3044\u3057\u307E\u3059\u300D`
            : `\u8377\u7269\u3092\u53D7\u3051\u53D6\u3063\u305F\uFF1A${JOB.dname}\u3078`,
        ),
        gt.blip());
    else {
      let s = Math.round((1200 + JOB.dab * 2.4 + Math.max(0, JOB.t) * 25) / 10) * 10;
      ((G.money += s),
        G.stats.jobs++,
        gt.cash(),
        xt('toast', `\u5B8C\u4E86\uFF01 +\xA5${s.toLocaleString('ja-JP')}`),
        (JOB.active = !1),
        (MS.target = null),
        (G.route = null),
        xt('save'));
    }
  } else JOB.t <= 0 && (xt('toast', '\u6642\u9593\u5207\u308C\u2026'), (JOB.active = !1), (MS.target = null), (G.route = null));
}
var CAPS = [],
  sh;
function initCapsules(n) {
  let t = 777,
    e = () => ((t = (t * 16807) % 2147483647), (t - 1) / 2147483646),
    i = W.edges.filter((s) => s.kind === 'L' && s.len > 30);
  for (let s = 0; s < 50; s++) {
    let o = i[Math.floor(e() * i.length)],
      r = edgePos(o, o.len * (0.3 + e() * 0.4), {}),
      a = e() < 0.5 ? 1 : -1;
    CAPS.push({
      i: s,
      x: r.x + r.dz * (o.hw + 0.6) * a,
      z: r.z - r.dx * (o.hw + 0.6) * a,
      got: n && n.includes(s),
    });
  }
  ((sh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.35, 12, 8),
    new THREE.MeshStandardMaterial({
      color: 16732058,
      emissive: 16732058,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    }),
    50,
  )),
    (sh.frustumCulled = !1),
    R.scene.add(sh));
}
var nh = new THREE.Object3D();
function updCapsules() {
  (CAPS.forEach((n, t) => {
    (nh.position.set(n.x, 0.8 + Math.sin(G.t * 2 + t) * 0.15, n.z),
      (nh.rotation.y = G.t),
      nh.scale.setScalar(n.got ? 0 : 1),
      nh.updateMatrix(),
      sh.setMatrixAt(t, nh.matrix),
      !n.got &&
        player_P.mode === 'foot' &&
        Math.hypot(player_P.x - n.x, player_P.z - n.z) < 1.4 &&
        ((n.got = !0),
        (G.money += 500),
        G.stats.capsules.push(t),
        gt.cash(),
        xt('toast', `\u30AC\u30C1\u30E3\u30AB\u30D7\u30BB\u30EB\u767A\u898B\uFF01 ${G.stats.capsules.length}/50  +\xA5500`),
        xt('save')));
  }),
    (sh.instanceMatrix.needsUpdate = !0));
}
var HUD = {};
vi(HUD, {
  H: () => H,
  big: () => big,
  closeStationMenu: () => closeStationMenu,
  dialog: () => dialog,
  dialogOpen: () => dialogOpen,
  drawBig: () => drawBig,
  drawMini: () => drawMini,
  fillPause: () => fillPause,
  initHUD: () => initHUD,
  listMenu: () => listMenu,
  nextLine: () => nextLine,
  openBigMap: () => openBigMap,
  playerPos: () => playerPos,
  setWaypoint: () => setWaypoint,
  stationMenu: () => stationMenu,
  toast: () => toast,
  updHUD: () => updHUD,
});
var j0 = (n) => document.getElementById(n),
  H = {},
  y6 = null,
  b6 = {
    X: '#f2a33a',
    A: '#e8e6e0',
    B: '#c9c6bf',
    L: '#8f8c86',
    R: '#e0953a',
  },
  v6 = {
    X: 17,
    A: 22,
    B: 15,
    L: 7,
    R: 8,
  },
  J0 = (n) => (typeof n == 'number' ? '#' + n.toString(16).padStart(6, '0') : n);
function initHUD() {
  for (let n of [
    'mini',
    'hpBar',
    'carBarW',
    'carBar',
    'clock',
    'money',
    'stars',
    'obj',
    'area',
    'areaJ',
    'areaE',
    'speed',
    'kmh',
    'gear',
    'inst',
    'iAlt',
    'iSpd',
    'iHdg',
    'thrI',
    'trainP',
    'tpNext',
    'tpSt',
    'tpLine',
    'prompt',
    'toast',
    'dialog',
    'dWho',
    'dTxt',
    'big',
    'bigT',
    'bigS',
    'bigmap',
    'stmenu',
    'stName',
    'stLines',
  ])
    H[n] = j0(n);
  ((H.mctx = H.mini.getContext('2d')), fz(), hz());
}
function fz() {
  let n = W.mask,
    t = Math.ceil(n.W / 2),
    e = Math.ceil(n.H / 2),
    i = document.createElement('canvas');
  ((i.width = t), (i.height = e));
  let s = i.getContext('2d'),
    o = s.createImageData(t, e),
    r = o.data,
    a = {
      [M_WATER]: [22, 52, 82],
      [M_LAND]: [40, 44, 52],
      [M_PARK]: [38, 70, 46],
      [M_PALACE]: [36, 66, 44],
      [M_FOREST]: [33, 62, 40],
      [M_MOAT]: [26, 60, 92],
      [M_AIR]: [52, 56, 64],
    };
  for (let c = 0; c < e; c++)
    for (let h = 0; h < t; h++) {
      let d = c * t + h,
        p = a[n.m[Math.min(n.H - 1, c * 2) * n.W + Math.min(n.W - 1, h * 2)]] || a[M_LAND];
      ((r[d * 4] = p[0]), (r[d * 4 + 1] = p[1]), (r[d * 4 + 2] = p[2]), (r[d * 4 + 3] = 255));
    }
  s.putImageData(o, 0, 0);
  let l = Je * 2,
    f = (c) => (c - n.X0) / l,
    u = (c) => (c - n.Z0) / l;
  {
    let c = (g, M) => {
        ((s.fillStyle = M),
          s.beginPath(),
          g.forEach((y, _) => (_ ? s.lineTo(f(y[0]), u(y[1])) : s.moveTo(f(y[0]), u(y[1])))),
          s.closePath(),
          s.fill());
      },
      h = (g, M, y, _, v, b, w) =>
        c(
          [
            [g - y * v + _ * b, M - _ * v - y * b],
            [g + y * v + _ * b, M + _ * v - y * b],
            [g + y * v - _ * b, M + _ * v + y * b],
            [g - y * v - _ * b, M - _ * v + y * b],
          ],
          w,
        ),
      d = HND.ux,
      p = HND.uz,
      x = -p,
      m = d;
    for (let g of TERMS) {
      let M = g.side * (g.Wd / 2 + 122);
      h(g.c[0] + x * M, g.c[1] + m * M, d, p, g.L / 2 + 60, 124, '#4c5058');
    }
    for (let g of [HND.A, HND.C, HND.D]) h(g.x, g.z, g.ux, g.uz, g.len / 2, Math.max(g.w / 2, l * 0.9), '#9aa0a8');
    for (let g of TERMS) {
      h(g.c[0], g.c[1], d, p, g.L / 2, g.Wd / 2, '#7fb4d8');
      for (let M of g.piers) {
        let y = g.side * (g.Wd / 2 + 70);
        h(g.c[0] + d * M + x * y, g.c[1] + p * M + m * y, d, p, 13, 70, '#7fb4d8');
      }
    }
  }
  ((s.lineCap = 'round'), (s.lineJoin = 'round'));
  for (let c of ['L', 'B', 'A', 'R', 'X']) {
    ((s.strokeStyle = b6[c]),
      (s.globalAlpha = c === 'L' ? 0.55 : 0.95),
      (s.lineWidth = Math.max(0.6, (v6[c] / l) * (c === 'X' ? 0.8 : 1))),
      s.beginPath());
    for (let h of W.edges) h.kind === c && h.pts.forEach((d, p) => (p ? s.lineTo(f(d[0]), u(d[1])) : s.moveTo(f(d[0]), u(d[1]))));
    s.stroke();
  }
  s.globalAlpha = 1;
  for (let c of W.rails)
    ((s.strokeStyle = J0(c.color)),
      (s.globalAlpha = c.kind === 'sub' ? 0.45 : 0.9),
      (s.lineWidth = c.kind === 'sub' ? 0.6 : 1),
      s.setLineDash(c.kind === 'sub' ? [2, 1.5] : []),
      s.beginPath(),
      c.path.forEach((h, d) => (d ? s.lineTo(f(h[0]), u(h[1])) : s.moveTo(f(h[0]), u(h[1])))),
      c.loop && s.closePath(),
      s.stroke());
  (s.setLineDash([]), (s.globalAlpha = 1), (y6 = i));
}
function _6(n) {
  let t = W.mask;
  ((n.imageSmoothingEnabled = !0), n.drawImage(y6, t.X0, t.Z0, t.W * Je, t.H * Je));
}
function w6(n, t, e, i, s, o) {
  let r = edgesInRect(t, e, i, s),
    a = {
      L: [],
      B: [],
      A: [],
      R: [],
      X: [],
    };
  for (let l of r) {
    let f = W.edges[Math.floor(l / 4096)],
      u = l % 4096;
    a[f.kind].push(f.pts[u], f.pts[u + 1]);
  }
  n.lineCap = 'round';
  for (let l of ['L', 'B', 'A', 'R', 'X']) {
    let f = a[l];
    if (f.length) {
      ((n.strokeStyle = b6[l]), (n.lineWidth = Math.max(v6[l] * (l === 'X' ? 0.75 : 1), o)), n.beginPath());
      for (let u = 0; u < f.length; u += 2) (n.moveTo(f[u][0], f[u][1]), n.lineTo(f[u + 1][0], f[u + 1][1]));
      n.stroke();
    }
  }
}
var g6 = null,
  Y0 = [];
function S6() {
  if (G.route === g6) return Y0;
  ((g6 = G.route), (Y0 = []));
  let n = G.route;
  if (!n || n.length < 2) return Y0;
  for (let t = 0; t + 1 < n.length; t++) {
    let e = edgeBetween(n[t], n[t + 1]);
    if (!e) {
      Y0.push([W.nodes[n[t]].x, W.nodes[n[t]].z]);
      continue;
    }
    let i = e.a === n[t] ? e.pts : e.pts.slice().reverse();
    for (let s of i) Y0.push(s);
  }
  return Y0;
}
function playerPos() {
  if (player_P.interior) return [player_P.interior.back.x, player_P.interior.back.z, player_P.yaw];
  if ((player_P.mode === 'car' || player_P.mode === 'ride') && player_P.car) return [player_P.car.x, player_P.car.z, player_P.car.yaw];
  if ((player_P.mode === 'plane' || player_P.mode === 'heli') && player_P.air) return [player_P.air.x, player_P.air.z, player_P.air.yaw];
  if (player_P.mode === 'train' && player_P.train) {
    let n = player_P.train.carPos[player_P.trainCar] || player_P.train.carPos[0];
    return [n.x, n.z, n.yaw];
  }
  return [player_P.x, player_P.z, player_P.yaw];
}
function E6(n, t, e, i, s, o) {
  (n.save(),
    n.translate(t, e),
    n.rotate(-i + Math.PI),
    (n.fillStyle = o),
    (n.strokeStyle = '#000'),
    (n.lineWidth = s * 0.18),
    n.beginPath(),
    n.moveTo(0, -s),
    n.lineTo(s * 0.7, s * 0.75),
    n.lineTo(0, s * 0.35),
    n.lineTo(-s * 0.7, s * 0.75),
    n.closePath(),
    n.fill(),
    n.stroke(),
    n.restore());
}
function xs(n, t, e, i, s, o) {
  (n.beginPath(), n.arc(t, e, i, 0, 7), (n.fillStyle = s), n.fill(), (n.lineWidth = i * 0.35), (n.strokeStyle = o || '#000'), n.stroke());
}
var p5 = 0;
function drawMini(n) {
  if (((p5 -= n), p5 > 0)) return;
  p5 = 1 / 20;
  let t = H.mini,
    e = H.mctx,
    i = t.width,
    s = i / 2,
    [o, r, a] = playerPos(),
    l = player_P.mode === 'car' && player_P.car ? Math.abs(player_P.car.v) : 0,
    f = player_P.mode === 'plane' ? 2600 : player_P.mode === 'heli' ? 1100 : player_P.mode === 'train' ? 900 : 230 + l * 6,
    u = s / f,
    c = Math.PI + G.cam.yaw;
  (e.setTransform(1, 0, 0, 1, 0, 0),
    e.clearRect(0, 0, i, i),
    e.save(),
    e.beginPath(),
    e.arc(s, s, s, 0, 7),
    e.clip(),
    (e.fillStyle = '#16324d'),
    e.fillRect(0, 0, i, i),
    e.translate(s, s),
    e.rotate(c),
    e.scale(u, u),
    e.translate(-o, -r),
    _6(e));
  let h = f * 1.45;
  if ((f < 1200 && w6(e, o - h, r - h, o + h, r + h, 1.6 / u), f < 1500))
    for (let v of W.rails) {
      if (v.kind === 'sub') continue;
      ((e.strokeStyle = J0(v.color)), (e.lineWidth = 3.2 / u), e.beginPath());
      let b = !1;
      for (let w of v.path) {
        if (Math.abs(w[0] - o) > h || Math.abs(w[1] - r) > h) {
          b = !1;
          continue;
        }
        (b ? e.lineTo(w[0], w[1]) : e.moveTo(w[0], w[1]), (b = !0));
      }
      e.stroke();
    }
  if (Ke() > 0 && G.lastSeen && G.evade > 0.3) {
    let [v, b] = G.lastSeen,
      w = (G.searchR || 100) * 1.15;
    (e.beginPath(),
      e.arc(v, b, w, 0, 7),
      (e.fillStyle = Math.floor(G.t * 3) % 2 ? 'rgba(255,50,50,.16)' : 'rgba(60,110,255,.16)'),
      e.fill(),
      (e.lineWidth = 3 / u),
      (e.strokeStyle = 'rgba(255,90,90,.7)'),
      e.stroke());
  }
  let d = S6();
  (d.length > 1 &&
    ((e.strokeStyle = MS.cur || JOB.active ? '#ffd23f' : '#c46cff'),
    (e.lineWidth = 7 / u),
    (e.lineJoin = 'round'),
    e.beginPath(),
    d.forEach((v, b) => (b ? e.lineTo(v[0], v[1]) : e.moveTo(v[0], v[1]))),
    e.stroke()),
    e.restore());
  let p = Math.cos(c),
    x = Math.sin(c),
    m = (v, b) => {
      let w = (v - o) * u,
        E = (b - r) * u;
      return [s + w * p - E * x, s + w * x + E * p];
    },
    g = (v, b = 10) => {
      let w = v[0] - s,
        E = v[1] - s,
        C = Math.hypot(w, E),
        S = s - b;
      return C > S ? [s + (w / C) * S, s + (E / C) * S, !0] : [v[0], v[1], !1];
    };
  if ((e.save(), e.beginPath(), e.arc(s, s, s, 0, 7), e.clip(), f < 1500))
    for (let v of W.stations) {
      if (Math.abs(v.x - o) > f * 1.5 || Math.abs(v.z - r) > f * 1.5) continue;
      let b = m(v.x, v.z);
      ((e.fillStyle = '#fff'),
        (e.strokeStyle = '#111'),
        (e.lineWidth = 2),
        e.beginPath(),
        e.arc(b[0], b[1], 5, 0, 7),
        e.fill(),
        e.stroke(),
        f < 500 &&
          ((e.font = '800 15px "M PLUS 1p",sans-serif'),
          (e.textAlign = 'center'),
          (e.lineWidth = 4),
          e.strokeText(v.ja, b[0], b[1] - 9),
          e.fillText(v.ja, b[0], b[1] - 9)));
    }
  for (let v of G.cars)
    if ((v.t === 'police' || v.t === 'polbike' || v.t === 'riot') && !v.removed && (v.siren || Ke() > 0)) {
      if (Math.hypot(v.x - o, v.z - r) > f * 1.4) continue;
      let w = m(v.x, v.z);
      xs(e, w[0], w[1], 6, Math.floor(G.t * 6) % 2 ? '#2a6dff' : '#ff3030');
    }
  if (f < 700)
    for (let v of G.mapIcons || []) {
      if (Math.abs(v.x - o) > f * 1.3 || Math.abs(v.z - r) > f * 1.3) continue;
      let b = m(v.x, v.z);
      (xs(e, b[0], b[1], 8, v.col, '#000'),
        (e.fillStyle = '#fff'),
        (e.font = '900 10px "M PLUS 1p",sans-serif'),
        (e.textAlign = 'center'),
        (e.textBaseline = 'middle'),
        e.fillText(v.ch, b[0], b[1] + 1));
    }
  if (f < 900)
    for (let v in W.landmarks) {
      let b = W.landmarks[v];
      if (Math.abs(b.x - o) > f * 1.3 || Math.abs(b.z - r) > f * 1.3) continue;
      let w = m(b.x, b.z);
      if (b.site && !b.lm) {
        (xs(e, w[0], w[1], b.univ ? 8 : 6, b.univ ? '#7a4ab8' : '#3f8a3a', '#000'),
          (e.fillStyle = '#fff'),
          (e.font = `900 ${b.univ ? 10 : 8}px "M PLUS 1p",sans-serif`),
          (e.textAlign = 'center'),
          (e.textBaseline = 'middle'),
          e.fillText('\u5B66', w[0], w[1] + 1));
        continue;
      }
      ((e.fillStyle = '#ffd23f'),
        (e.strokeStyle = '#000'),
        (e.lineWidth = 1.5),
        e.beginPath(),
        e.moveTo(w[0], w[1] - 7),
        e.lineTo(w[0] + 6, w[1] + 5),
        e.lineTo(w[0] - 6, w[1] + 5),
        e.closePath(),
        e.fill(),
        e.stroke());
    }
  for (let v of G.blips || []) {
    let b = g(m(v.x, v.z), 12);
    (xs(e, b[0], b[1], 8, v.col, '#fff'),
      v.ch &&
        ((e.fillStyle = '#fff'),
        (e.font = '900 9px "M PLUS 1p",sans-serif'),
        (e.textAlign = 'center'),
        (e.textBaseline = 'middle'),
        e.fillText(v.ch, b[0], b[1] + 1)));
  }
  if (!MS.cur)
    for (let v of availableMissions()) {
      let b = g(m(v.start[0], v.start[1]), 14);
      (xs(e, b[0], b[1], b[2] ? 8 : 10, '#4ad2ff', '#003'),
        (e.fillStyle = '#003'),
        (e.font = '900 13px Anton,sans-serif'),
        (e.textAlign = 'center'),
        (e.textBaseline = 'middle'),
        e.fillText('M', b[0], b[1] + 1));
    }
  let M = MS.target || G.waypoint;
  if (M) {
    let v = g(m(M[0], M[1]), 14);
    xs(e, v[0], v[1], 10, MS.target ? '#ffd23f' : '#c46cff');
  }
  if ((e.restore(), M)) {
    let v = Math.hypot(M[0] - o, M[1] - r),
      b = v >= 1e3 ? (v / 1e3).toFixed(1) + ' km' : Math.round(v / 10) * 10 + ' m';
    ((e.font = '900 15px "M PLUS 1p",sans-serif'),
      (e.textAlign = 'center'),
      (e.textBaseline = 'middle'),
      (e.lineWidth = 4),
      (e.strokeStyle = 'rgba(0,0,0,.85)'),
      e.strokeText(b, s, i - 22),
      (e.fillStyle = MS.target ? '#ffd23f' : '#e2b8ff'),
      e.fillText(b, s, i - 22));
  }
  if (Ke() > 0 && G.evade > 0.3) {
    let v = Math.min(1, G.evade / (G.loseT || 15));
    (e.beginPath(), e.arc(s, s, s - 3, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2), (e.lineWidth = 5), (e.strokeStyle = '#7dff9a'), e.stroke());
  }
  let y = m(o, r - f * 10),
    _ = g(y, 14);
  (xs(e, _[0], _[1], 11, '#111', '#fff'),
    (e.fillStyle = '#fff'),
    (e.font = '900 14px Anton,sans-serif'),
    (e.textAlign = 'center'),
    (e.textBaseline = 'middle'),
    e.fillText('N', _[0], _[1] + 1),
    E6(e, s, s, a - G.cam.yaw + Math.PI, 13, '#fff'));
}
var Ae = {
  cx: 0,
  cz: 0,
  s: 0.05,
  drag: null,
  pts: new Map(),
  moved: 0,
};
function hz() {
  let n = H.bigmap,
    t = (s, o) => {
      let r = n.getBoundingClientRect();
      return [Ae.cx + (s - r.left - r.width / 2) / Ae.s, Ae.cz + (o - r.top - r.height / 2) / Ae.s];
    };
  (n.addEventListener('pointerdown', (s) => {
    if ((n.setPointerCapture(s.pointerId), Ae.pts.set(s.pointerId, [s.clientX, s.clientY]), (Ae.moved = 0), Ae.pts.size === 2)) {
      let [o, r] = [...Ae.pts.values()];
      Ae.pinch = Math.hypot(o[0] - r[0], o[1] - r[1]);
    }
  }),
    n.addEventListener('pointermove', (s) => {
      let o = Ae.pts.get(s.pointerId);
      if (!o) return;
      let r = s.clientX - o[0],
        a = s.clientY - o[1];
      if (
        ((Ae.moved += Math.abs(r) + Math.abs(a)),
        Ae.pts.size === 1 && ((Ae.cx -= r / Ae.s), (Ae.cz -= a / Ae.s)),
        Ae.pts.set(s.pointerId, [s.clientX, s.clientY]),
        Ae.pts.size === 2)
      ) {
        let [l, f] = [...Ae.pts.values()],
          u = Math.hypot(l[0] - f[0], l[1] - f[1]);
        (Ae.pinch && i((l[0] + f[0]) / 2, (l[1] + f[1]) / 2, u / Ae.pinch), (Ae.pinch = u));
      }
      drawBig();
    }));
  let e = (s) => {
    let o = Ae.pts.size;
    if ((Ae.pts.delete(s.pointerId), Ae.pts.size < 2 && (Ae.pinch = 0), o === 1 && Ae.moved < 8)) {
      let r = t(s.clientX, s.clientY);
      (setWaypoint(r), drawBig());
    }
  };
  (n.addEventListener('pointerup', e),
    n.addEventListener('pointercancel', (s) => {
      Ae.pts.delete(s.pointerId);
    }),
    n.addEventListener(
      'wheel',
      (s) => {
        (s.preventDefault(), i(s.clientX, s.clientY, Math.exp(-s.deltaY * 0.0015)), drawBig());
      },
      {
        passive: !1,
      },
    ));
  function i(s, o, r) {
    let a = t(s, o);
    Ae.s = It(Ae.s * r, 0.02, 2.5);
    let l = t(s, o);
    ((Ae.cx += a[0] - l[0]), (Ae.cz += a[1] - l[1]));
  }
}
function setWaypoint(n) {
  if (G.waypoint && Math.hypot(G.waypoint[0] - n[0], G.waypoint[1] - n[1]) < 30 / Ae.s)
    ((G.waypoint = null), toast('\u76EE\u7684\u5730\u3092\u89E3\u9664\u3057\u307E\u3057\u305F'));
  else {
    G.waypoint = n;
    let t = districtAt(n[0], n[1]);
    toast(`\u76EE\u7684\u5730\u3092\u8A2D\u5B9A\uFF1A${t.n}`);
  }
  xt('waypoint');
}
function openBigMap() {
  let [n, t] = playerPos();
  ((Ae.cx = n), (Ae.cz = t), (Ae.s = 0.12), drawBig());
}
function drawBig() {
  let n = H.bigmap,
    t = n.getBoundingClientRect(),
    e = Math.min(2, devicePixelRatio || 1);
  (n.width !== Math.round(t.width * e) || n.height !== Math.round(t.height * e)) &&
    ((n.width = Math.round(t.width * e)), (n.height = Math.round(t.height * e)));
  let i = n.getContext('2d'),
    s = t.width,
    o = t.height,
    r = Ae.s;
  (i.setTransform(e, 0, 0, e, 0, 0),
    (i.fillStyle = '#14304a'),
    i.fillRect(0, 0, s, o),
    i.save(),
    i.translate(s / 2, o / 2),
    i.scale(r, r),
    i.translate(-Ae.cx, -Ae.cz),
    _6(i));
  let a = Ae.cx - s / 2 / r,
    l = Ae.cx + s / 2 / r,
    f = Ae.cz - o / 2 / r,
    u = Ae.cz + o / 2 / r;
  if ((r > 0.18 && w6(i, a, f, l, u, 1.2 / r), r > 0.18))
    for (let v of W.rails)
      ((i.strokeStyle = J0(v.color)),
        (i.globalAlpha = v.kind === 'sub' ? 0.5 : 1),
        i.setLineDash(v.kind === 'sub' ? [10 / r, 6 / r] : []),
        (i.lineWidth = 3 / r),
        i.beginPath(),
        v.path.forEach((b, w) => (w ? i.lineTo(b[0], b[1]) : i.moveTo(b[0], b[1]))),
        v.loop && i.closePath(),
        i.stroke());
  (i.setLineDash([]), (i.globalAlpha = 1));
  let c = S6();
  (c.length > 1 &&
    ((i.strokeStyle = MS.cur || JOB.active ? '#ffd23f' : '#c46cff'),
    (i.lineWidth = 5 / r),
    (i.lineJoin = 'round'),
    i.beginPath(),
    c.forEach((v, b) => (b ? i.lineTo(v[0], v[1]) : i.moveTo(v[0], v[1]))),
    i.stroke()),
    i.restore());
  let h = (v, b) => [s / 2 + (v - Ae.cx) * r, o / 2 + (b - Ae.cz) * r],
    d = (v) => v[0] > -40 && v[0] < s + 40 && v[1] > -40 && v[1] < o + 40;
  if (((i.textAlign = 'center'), (i.textBaseline = 'middle'), (i.lineJoin = 'round'), r < 0.5)) {
    i.font = `800 ${r < 0.08 ? 12 : 15}px "M PLUS 1p",sans-serif`;
    for (let v of W.districts) {
      let b = h(v.x, v.z);
      d(b) &&
        ((i.strokeStyle = 'rgba(0,0,0,.75)'),
        (i.lineWidth = 4),
        i.strokeText(v.n, b[0], b[1]),
        (i.fillStyle = 'rgba(255,255,255,.72)'),
        i.fillText(v.n, b[0], b[1]));
    }
  }
  if (r > 0.07)
    for (let v of W.stations) {
      let b = h(v.x, v.z);
      d(b) &&
        ((i.fillStyle = '#fff'),
        (i.strokeStyle = '#111'),
        (i.lineWidth = 2),
        i.beginPath(),
        i.arc(b[0], b[1], 4.5, 0, 7),
        i.fill(),
        i.stroke(),
        r > 0.16 &&
          ((i.font = '800 12px "M PLUS 1p",sans-serif'),
          (i.lineWidth = 3.5),
          (i.strokeStyle = '#000'),
          i.strokeText(v.ja, b[0], b[1] - 11),
          (i.fillStyle = '#fff'),
          i.fillText(v.ja, b[0], b[1] - 11)));
    }
  if (r > 0.2)
    for (let v of DOORS) {
      if (v.type !== 'store' && v.type !== 'home') continue;
      let b = h(v.x, v.z);
      d(b) && xs(i, b[0], b[1], 6, v.type === 'home' ? '#3ddc84' : '#ff9f1a');
    }
  let p = (v, b, w, E, C = 7) => {
    let S = h(v, b);
    d(S) &&
      (xs(i, S[0], S[1], C, w, '#000'),
      (i.fillStyle = '#fff'),
      (i.font = `900 ${C * 1.3}px Anton, Impact, sans-serif`),
      (i.textAlign = 'center'),
      (i.textBaseline = 'middle'),
      i.fillText(E, S[0], S[1] + 1));
  };
  if (r > 0.09)
    for (let v in STOPS) {
      let b = STOPS[v];
      b.routes.length && p(b.x, b.z, '#2f8a4e', 'B', 6);
    }
  for (let v of DOORS) {
    if (!v.venue) continue;
    let b = v.vtype;
    p(
      v.x,
      v.z,
      b === 'pachinko' ? '#e4007f' : b === 'race' || b === 'boat' || b === 'wins' ? '#0b5fa8' : '#ff9f1a',
      b === 'pachinko' ? 'P' : b === 'race' || b === 'boat' || b === 'wins' ? 'R' : '$',
      7,
    );
  }
  for (let v of G.mapIcons || []) r > (v.small ? 0.22 : 0.06) && p(v.x, v.z, v.col, v.ch, v.small ? 6 : 7);
  for (let v of G.blips || []) {
    let b = h(v.x, v.z);
    xs(i, b[0], b[1], 8, v.col, '#fff');
  }
  if (!MS.cur)
    for (let v of availableMissions()) {
      let b = h(v.start[0], v.start[1]);
      (xs(i, b[0], b[1], 10, '#4ad2ff', '#003'),
        (i.fillStyle = '#003'),
        (i.font = '900 13px Anton,sans-serif'),
        i.fillText('M', b[0], b[1] + 1),
        (i.font = '800 12px "M PLUS 1p",sans-serif'),
        (i.lineWidth = 3.5),
        (i.strokeStyle = '#000'),
        i.strokeText(v.title, b[0], b[1] + 20),
        (i.fillStyle = '#9fe6ff'),
        i.fillText(v.title, b[0], b[1] + 20));
    }
  if (r > 0.05) {
    i.font = '700 11px "M PLUS 1p",sans-serif';
    for (let [v, b] of uz) {
      let w = W.landmarks[v];
      if (!w) continue;
      let E = h(w.x, w.z);
      d(E) &&
        ((i.fillStyle = '#ffd23f'),
        i.beginPath(),
        i.moveTo(E[0], E[1] - 6),
        i.lineTo(E[0] + 5, E[1] + 4),
        i.lineTo(E[0] - 5, E[1] + 4),
        i.closePath(),
        i.fill(),
        r > 0.1 &&
          ((i.lineWidth = 3), (i.strokeStyle = '#000'), i.strokeText(b, E[0], E[1] + 14), (i.fillStyle = '#ffe9a0'), i.fillText(b, E[0], E[1] + 14)));
    }
  }
  for (let v of W.sites || []) {
    let b = W.landmarks[v.key];
    if (!b) continue;
    let w = h(b.x, b.z);
    if (!d(w)) continue;
    let E = v.type === 'univ';
    if (v.type === 'lm') {
      r > 0.05 &&
        ((i.fillStyle = '#ffd23f'),
        i.beginPath(),
        i.moveTo(w[0], w[1] - 6),
        i.lineTo(w[0] + 5, w[1] + 4),
        i.lineTo(w[0] - 5, w[1] + 4),
        i.closePath(),
        i.fill(),
        r > 0.1 &&
          ((i.font = '700 11px "M PLUS 1p",sans-serif'),
          (i.lineWidth = 3),
          (i.strokeStyle = '#000'),
          i.strokeText(v.name, w[0], w[1] + 14),
          (i.fillStyle = '#ffe9a0'),
          i.fillText(v.name, w[0], w[1] + 14)));
      continue;
    }
    let C = E || v.type === 'high';
    r < (C ? 0.05 : 0.14) ||
      (p(b.x, b.z, E ? '#7a4ab8' : '#3f8a3a', '\u5B66', E ? 7 : 5),
      r > (E ? 0.1 : C ? 0.2 : 0.32) &&
        ((i.font = `700 ${E ? 11 : 10}px "M PLUS 1p",sans-serif`),
        (i.textAlign = 'center'),
        (i.lineWidth = 3),
        (i.strokeStyle = '#000'),
        i.strokeText(v.name, w[0], w[1] + 14),
        (i.fillStyle = E ? '#e2c8ff' : '#c8f0c0'),
        i.fillText(v.name, w[0], w[1] + 14)));
  }
  for (let v of G.blips || [])
    if (v.ch === '\u706B') {
      let b = h(v.x, v.z);
      ((i.font = '800 12px "M PLUS 1p",sans-serif'),
        (i.lineWidth = 3),
        (i.strokeStyle = '#000'),
        i.strokeText('\u706B\u707D', b[0], b[1] - 14),
        (i.fillStyle = '#ffb070'),
        i.fillText('\u706B\u707D', b[0], b[1] - 14));
    }
  let x = MS.target || G.waypoint;
  if (x) {
    let v = h(x[0], x[1]);
    xs(i, v[0], v[1], 9, MS.target ? '#ffd23f' : '#c46cff', '#fff');
  }
  let [m, g, M] = playerPos(),
    y = h(m, g);
  E6(i, y[0], y[1], M, 11, '#fff');
  {
    let v = [
      ['#4ad2ff', 'M', '\u30DF\u30C3\u30B7\u30E7\u30F3'],
      ['#2f8a4e', 'B', '\u30D0\u30B9\u505C'],
      ['#ff9f1a', '$', '\u8CB7\u3044\u7269'],
      ['#e4007f', 'P', '\u30D1\u30C1\u30F3\u30B3'],
      ['#0b5fa8', 'R', '\u7AF6\u99AC\u30FB\u7AF6\u8247'],
      ['#ffd23f', '\u25B2', '\u30E9\u30F3\u30C9\u30DE\u30FC\u30AF'],
      ['#e5402b', 'G', '\u6B66\u5668\u5C4B'],
      ['#ffb030', '\u{1F527}', '\u6539\u9020\u30B7\u30E7\u30C3\u30D7'],
      ['#3ddc84', 'H', '\u7269\u4EF6'],
      ['#5cc8ff', '\u5C55', '\u5C55\u671B\u53F0'],
      ['#1f6fb5', '\u2693', '\u6C34\u4E0A\u30D0\u30B9'],
      ['#7a4ab8', '\u5B66', '\u5927\u5B66\u30FB\u5B66\u6821'],
      ['#1f8a4a', 'IC', '\u9996\u90FD\u9AD8\u5165\u53E3'],
      ['#ff6a00', '\u706B', '\u706B\u707D'],
    ];
    ((i.textBaseline = 'middle'),
      v.forEach(([b, w, E], C) => {
        let S = s - 112,
          T = 18 + C * 20;
        ((i.fillStyle = 'rgba(0,0,0,.55)'),
          i.fillRect(S - 12, T - 9, 120, 18),
          xs(i, S, T, 6, b, '#000'),
          (i.fillStyle = '#fff'),
          (i.font = '900 8px Anton, sans-serif'),
          (i.textAlign = 'center'),
          i.fillText(w, S, T + 1),
          (i.textAlign = 'left'),
          (i.font = '700 11px "M PLUS 1p", sans-serif'),
          i.fillText(E, S + 12, T + 1));
      }));
  }
  let _ = [100, 200, 500, 1e3, 2e3, 5e3].find((v) => v * r > 70) || 5e3;
  ((i.fillStyle = '#fff'),
    i.fillRect(16, o - 22, _ * r, 3),
    (i.font = '700 11px sans-serif'),
    (i.textAlign = 'left'),
    i.fillText(_ >= 1e3 ? _ / 1e3 + ' km' : _ + ' m', 16, o - 32));
}
var uz = [
    ['tokyoTower', '\u6771\u4EAC\u30BF\u30EF\u30FC'],
    ['skytree', '\u30B9\u30AB\u30A4\u30C4\u30EA\u30FC'],
    ['tocho', '\u90FD\u5E81'],
    ['scramble', '\u30B9\u30AF\u30E9\u30F3\u30D6\u30EB\u4EA4\u5DEE\u70B9'],
    ['sensoji', '\u6D45\u8349\u5BFA'],
    ['rainbowBridge', '\u30EC\u30A4\u30F3\u30DC\u30FC\u30D6\u30EA\u30C3\u30B8'],
    ['fujiTV', '\u304A\u53F0\u5834'],
    ['bigSight', '\u30D3\u30C3\u30B0\u30B5\u30A4\u30C8'],
    ['tokyoDome', '\u6771\u4EAC\u30C9\u30FC\u30E0'],
    ['diet', '\u56FD\u4F1A\u8B70\u4E8B\u5802'],
    ['meijiShrine', '\u660E\u6CBB\u795E\u5BAE'],
    ['sunshine60', '\u30B5\u30F3\u30B7\u30E3\u30A4\u30F360'],
    ['roppongiHills', '\u516D\u672C\u6728\u30D2\u30EB\u30BA'],
    ['kachidokiBridge', '\u52DD\u9B28\u6A4B'],
    ['heliport', '\u6771\u4EAC\u30D8\u30EA\u30DD\u30FC\u30C8'],
    ['nihonbashi', '\u65E5\u672C\u6A4B'],
    ['ameyoko', '\u30A2\u30E1\u6A2A'],
    ['kabukichoGate', '\u6B4C\u821E\u4F0E\u753A'],
    ['landmarkTower', '\u30E9\u30F3\u30C9\u30DE\u30FC\u30AF\u30BF\u30EF\u30FC'],
    ['cosmoClock', '\u30B3\u30B9\u30E2\u30EF\u30FC\u30EB\u30C9'],
    ['redBrick', '\u8D64\u30EC\u30F3\u30AC\u5009\u5EAB'],
    ['osanbashi', '\u5927\u3055\u3093\u6A4B'],
    ['yamashitaPark', '\u5C71\u4E0B\u516C\u5712'],
    ['marineTower', '\u30DE\u30EA\u30F3\u30BF\u30EF\u30FC'],
    ['chinatown', '\u6A2A\u6D5C\u4E2D\u83EF\u8857'],
    ['yokohamaStadium', '\u6A2A\u6D5C\u30B9\u30BF\u30B8\u30A2\u30E0'],
    ['bayBridge', '\u6A2A\u6D5C\u30D9\u30A4\u30D6\u30EA\u30C3\u30B8'],
    ['tsubasaBridge', '\u9DB4\u898B\u3064\u3070\u3055\u6A4B'],
    ['kawasakiDaishi', '\u5DDD\u5D0E\u5927\u5E2B'],
  ],
  Zi = {},
  bn = (n, t, e, i = 'textContent') => {
    Zi[t] !== e && ((Zi[t] = e), (n[i] = e));
  },
  fl = (n, t, e, i = 'on') => {
    Zi['c' + t] !== e && ((Zi['c' + t] = e), n.classList.toggle(i, e));
  },
  m5 = 0,
  M6 = '';
function updHUD(n, t) {
  (drawMini(n), bn(H.hpBar.style, 'hp', Math.max(0, player_P.hp) + '%', 'width'));
  let e = player_P.mode === 'car' && player_P.car;
  (Zi.carShown !== !!e && ((Zi.carShown = !!e), (H.carBarW.hidden = !e)),
    e && bn(H.carBar.style, 'chp', It(player_P.car.hp / (player_P.car.td.hp || 100), 0, 1) * 100 + '%', 'width'));
  let i = Math.floor(R.tod),
    s = Math.floor((R.tod - i) * 60);
  (bn(H.clock, 'clk', `${String(i).padStart(2, '0')}:${String(s).padStart(2, '0')}`),
    bn(H.money, 'money', '\xA5' + Math.floor(G.money).toLocaleString('ja-JP')));
  let o = Ke();
  (bn(H.stars, 'stars', `<b>${'\u2605'.repeat(o)}</b>${'\u2605'.repeat(5 - o)}`, 'innerHTML'), fl(H.stars, 'sb', o > 0 && G.evade > 0.5, 'blink'));
  let r = objectiveText(),
    a = r
      ? `<small>${r.title}${r.timer > 0 ? ' \u2014 \u6B8B\u308A ' + Math.ceil(r.timer) + '\u79D2' : ''}</small>${r.text}`
      : JOB.active
        ? `<small>${JOB.type === 'taxi' ? '\u30BF\u30AF\u30B7\u30FC' : '\u914D\u9054'} \u2014 \u6B8B\u308A ${Math.max(0, Math.ceil(JOB.t))}\u79D2</small>${JOB.stage === 1 ? (JOB.type === 'taxi' ? '\u304A\u5BA2\u3055\u3093\u3092\u8FCE\u3048\u306B\u884C\u304F' : '\u8377\u7269\u3092\u53D7\u3051\u53D6\u308B') : JOB.dname + '\u3078\u5411\u304B\u3046'}`
        : '';
  Zi.ot !== a && ((Zi.ot = a), (H.obj.innerHTML = a), (H.obj.hidden = !a));
  let [l, f] = playerPos();
  if (((m5 -= n), !player_P.interior && Math.floor(G.t * 2) !== Zi.dq)) {
    Zi.dq = Math.floor(G.t * 2);
    let m = districtAt(l, f);
    m.n !== M6 && ((M6 = m.n), bn(H.areaJ, 'aj', m.n), bn(H.areaE, 'ae', m.e), (m5 = 3.5));
  }
  fl(H.area, 'area', m5 > 0);
  let u = player_P.mode === 'train' && player_P.train && player_P.train.drive ? player_P.train : null,
    c = player_P.mode === 'boat' && player_P.boat && !player_P.boatRide;
  if (
    (fl(H.speed, 'spd', !!e || !!u || !!c),
    c && (bn(H.kmh, 'kmh', String(Math.round(Math.abs(player_P.boat.v) * 1.944))), bn(H.gear, 'gear', 'KT')),
    u && (bn(H.kmh, 'kmh', String(Math.round(u.v * 3.6))), bn(H.gear, 'gear', (u.ats ? 'ATS' : notchName(u.notch || 0)) + (u.tasc ? ' TASC' : ''))),
    e)
  ) {
    let m = Math.round(Math.abs(player_P.car.v) * 3.6);
    (bn(H.kmh, 'kmh', String(m)), bn(H.gear, 'gear', player_P.car.v < -0.5 ? 'R' : m < 2 ? 'N' : String(Math.min(6, 1 + Math.floor(m / 28)))));
  }
  let h = (player_P.mode === 'plane' || player_P.mode === 'heli') && player_P.air;
  if ((fl(H.inst, 'inst', !!h), h)) {
    let m = player_P.air;
    (bn(H.iAlt, 'alt', Math.round(m.y * 3.28) + ' ft'),
      bn(H.iSpd, 'ias', Math.round((m.speedKmh || 0) / 1.852) + ' kt'),
      bn(H.iHdg, 'hdg', String(Math.round(((Math.atan2(Math.sin(m.yaw), -Math.cos(m.yaw)) * 180) / Math.PI + 360) % 360)).padStart(3, '0')),
      bn(H.thrI.style, 'thr', (player_P.mode === 'plane' ? m.thr : It(0.5 + (G.input.thrUp - G.input.thrDown) * 0.5, 0, 1)) * 100 + '%', 'width'));
  }
  let d = (player_P.mode === 'ride' || (player_P.mode === 'boat' && player_P.boatRide)) && G.rideInfo;
  d &&
    (fl(H.trainP, 'tp', !0),
    bn(H.tpNext, 'tpn', d.top),
    bn(H.tpSt, 'tps', d.main),
    bn(H.tpLine, 'tpl', d.sub),
    (H.trainP.style.borderLeftColor = d.color));
  let p = player_P.mode === 'train' && player_P.train;
  d || fl(H.trainP, 'tp', !!p);
  {
    let m = !!(d || p);
    Zi.tpOn !== m && ((Zi.tpOn = m), document.body.classList.toggle('tpOn', m));
  }
  if (p && p.drive) {
    let m = p.dist ?? 0;
    (bn(H.tpNext, 'tpn', p.state === 'dwell' ? (p.doors ? '\u30C9\u30A2\u958B \u2014 F \u3067\u767A\u8ECA' : '\u767A\u8ECA') : '\u6B21\u306F'),
      bn(H.tpSt, 'tps', p.state === 'dwell' && p.cur ? p.cur.ja : p.target ? p.target.ja : ''),
      bn(
        H.tpLine,
        'tpl',
        p.state === 'dwell'
          ? `${p.r.ja}  \u904B\u8EE2\u5831\u916C \u8A08 \xA5${DRV.score.toLocaleString('ja-JP')}`
          : `\u505C\u6B62\u4F4D\u7F6E\u307E\u3067 ${m > 999 ? (m / 1e3).toFixed(1) + ' km' : Math.round(m) + ' m'}\u3000\u5236\u9650 ${Math.round((p.limit || 0) * 3.6)} km/h`,
      ),
      (H.trainP.style.borderLeftColor = J0(p.r.color)));
  } else if (p) {
    let m = nextStation(p);
    (bn(
      H.tpNext,
      'tpn',
      p.state === 'dwell' ? '\u305F\u3060\u3044\u307E \u2014 F \u3067\u4E0B\u8ECA' : '\u6B21\u306F\uFF08F \u3067\u30B9\u30AD\u30C3\u30D7\uFF09',
    ),
      bn(H.tpSt, 'tps', p.state === 'dwell' && p.cur ? p.cur.ja : m ? m.ja : ''),
      bn(H.tpLine, 'tpl', `${p.r.ja}  ${terminusName(p)}`),
      (H.trainP.style.borderLeftColor = J0(p.r.color)));
  }
  let x = t || '';
  (Zi.pt !== x && ((Zi.pt = x), (H.prompt.innerHTML = x)),
    fl(H.prompt, 'pr', !!x),
    K0 > 0 && ((K0 -= n), K0 <= 0 && (H.toast.classList.remove('on'), setTimeout(R6, 380))),
    A1 > 0 && ((A1 -= n), A1 <= 0 && H.big.classList.remove('on')));
}
var ta = [],
  K0 = 0;
function toast(n) {
  (ta.length && ta[ta.length - 1] === n) || (ta.length > 4 && ta.shift(), ta.push(n), K0 <= 0 && R6());
}
function R6() {
  if (K0 > 0 || !ta.length) return;
  let n = ta.shift();
  ((H.toast.textContent = n), H.toast.classList.add('on'), (K0 = 2 + Math.min(1.6, n.length * 0.03)), H.toast.classList.toggle('low', !H.obj.hidden));
}
var A1 = 0;
function big(n, t, e) {
  ((H.bigT.textContent = n), (H.bigS.textContent = t || ''), (H.bigT.style.color = e || '#fff'), H.big.classList.add('on'), (A1 = 3.6));
}
var oh = {
  lines: [],
  who: '',
};
function dialog(n, t) {
  ((oh.who = n), (oh.lines = t.slice()), nextLine());
}
function dialogOpen() {
  return H.dialog.classList.contains('on');
}
function nextLine() {
  if (!oh.lines.length) {
    H.dialog.classList.remove('on');
    return;
  }
  ((H.dWho.textContent = oh.who), (H.dTxt.textContent = oh.lines.shift()), H.dialog.classList.add('on'));
}
function stationMenu(n, t, e) {
  ((H.stName.textContent = `${n.ja}\u99C5  ${n.en}`), (H.stLines.innerHTML = ''));
  for (let i of n.lines) {
    let s = i.rail,
      o = document.createElement('div');
    o.className = 'row';
    let r = s.st[s.st.length - 1].ja,
      a = s.st[0].ja,
      l = s.st.indexOf(i.st);
    o.innerHTML = `<i style="background:${J0(s.color)}"></i><b>${s.ja}<small style="display:block;color:#8a93a3;font-weight:500">${s.en} \u30FB ${s.code}${String(l + 1).padStart(2, '0')}</small></b>`;
    let f = s.loop
      ? [
          [1, '\u5916\u56DE\u308A'],
          [-1, '\u5185\u56DE\u308A'],
        ]
      : [
          [1, r + ' \u65B9\u9762'],
          [-1, a + ' \u65B9\u9762'],
        ];
    for (let [u, c] of f) {
      if (!s.loop && ((u > 0 && l === s.st.length - 1) || (u < 0 && l === 0))) continue;
      let h = document.createElement('button');
      ((h.textContent = c), (h.onclick = () => t(s, u)), o.appendChild(h));
    }
    H.stLines.appendChild(o);
  }
  ((H.stmenu.hidden = !1),
    (j0('stClose').textContent = '\u6539\u672D\u3092\u51FA\u308B'),
    (j0('stClose').onclick = () => {
      ((H.stmenu.hidden = !0), e && e());
    }));
}
function closeStationMenu() {
  H.stmenu.hidden = !0;
}
function listMenu(n, t, e, i) {
  ((H.stName.textContent = n), (H.stLines.innerHTML = ''));
  for (let o of t) {
    let r = document.createElement('div');
    ((r.className = 'row'),
      (r.innerHTML = `<i style="background:${o.color || '#ffd23f'}"></i><b>${o.label}${o.sub ? `<small style="display:block;color:#8a93a3;font-weight:500">${o.sub}</small>` : ''}</b>`));
    for (let a of o.buttons) {
      let l = document.createElement('button');
      ((l.textContent = a.text),
        (l.onclick = () => {
          ((H.stmenu.hidden = !0), a.fn());
        }),
        r.appendChild(l));
    }
    H.stLines.appendChild(r);
  }
  let s = j0('stClose');
  ((s.textContent = e || '\u9589\u3058\u308B'),
    (H.stmenu.hidden = !1),
    (s.onclick = () => {
      ((H.stmenu.hidden = !0), i && i());
    }));
}
function fillPause() {
  let n = j0('pMissions');
  n.innerHTML = MISSIONS.map((e) => `${MS.done.has(e.id) ? '\u2714' : availableMissions().includes(e) ? '\u25CF' : '\u30FB'} <b>${e.title}</b>`).join(
    '<br>',
  );
  let t = G.stats;
  j0('pStats').innerHTML =
    `\u30DF\u30C3\u30B7\u30E7\u30F3 <b>${MS.done.size}/${MISSIONS.length}</b><br>\u4ED5\u4E8B <b>${t.jobs}</b> \u4EF6<br>\u4E57\u8ECA <b>${t.rides}</b> \u56DE \u30FB \u30D5\u30E9\u30A4\u30C8 <b>${t.flights}</b> \u56DE<br>\u30AC\u30C1\u30E3\u30AB\u30D7\u30BB\u30EB <b>${t.capsules.length}/50</b><br>\u8D70\u884C\u8DDD\u96E2 <b>${(t.distance / 1e3).toFixed(1)} km</b>`;
}
var BT = {};
vi(BT, {
  BOATS: () => BOATS,
  BT: () => boats_BT,
  PIERS: () => PIERS,
  board: () => board,
  boatPoliceSees: () => boatPoliceSees,
  initBoats: () => initBoats,
  leave: () => leave,
  lines: () => lines,
  nearBoat: () => nearBoat,
  nearPier: () => nearPier,
  renderBoats: () => renderBoats,
  rideInfo: () => rideInfo,
  updBoats: () => updBoats,
});
var boats_BT = {
    waterbus: {
      L: 33,
      W: 8.6,
      H: 3.2,
      vmax: 9,
      acc: 1.1,
      turn: 0.35,
      name: '\u6C34\u4E0A\u30D0\u30B9\u300C\u30DF\u30E9\u30A4\u30CA\u300D',
    },
    sumida: {
      L: 30,
      W: 7.4,
      H: 4.4,
      vmax: 7.5,
      acc: 1,
      turn: 0.35,
      name: '\u6C34\u4E0A\u30D0\u30B9\u300C\u3059\u307F\u3060\u4E38\u300D',
    },
    yakata: {
      L: 18,
      W: 4.6,
      H: 2.6,
      vmax: 4.5,
      acc: 0.7,
      turn: 0.5,
      name: '\u5C4B\u5F62\u8239',
    },
    cruiser: {
      L: 13.5,
      W: 4,
      H: 2.6,
      vmax: 17,
      acc: 3.2,
      turn: 0.7,
      name: '\u30AF\u30EB\u30FC\u30B6\u30FC',
    },
    motor: {
      L: 7.2,
      W: 2.5,
      H: 1.3,
      vmax: 23,
      acc: 6,
      turn: 1.15,
      name: '\u30E2\u30FC\u30BF\u30FC\u30DC\u30FC\u30C8',
    },
    jetski: {
      L: 3.1,
      W: 1.15,
      H: 1,
      vmax: 27,
      acc: 9,
      turn: 1.9,
      name: '\u6C34\u4E0A\u30D0\u30A4\u30AF',
    },
    police: {
      L: 11,
      W: 3.3,
      H: 2.4,
      vmax: 22,
      acc: 5,
      turn: 0.9,
      name: '\u8B66\u5BDF\u8247',
    },
  },
  PIERS = [
    {
      k: 'asakusa',
      name: '\u6D45\u8349\uFF08\u543E\u59BB\u6A4B\uFF09',
      ll: [35.7108, 139.7972],
    },
    {
      k: 'ryogoku',
      name: '\u4E21\u56FD',
      ll: [35.6962, 139.7922],
    },
    {
      k: 'etchujima',
      name: '\u8D8A\u4E2D\u5CF6',
      ll: [35.669, 139.7905],
    },
    {
      k: 'hamarikyu',
      name: '\u6D5C\u96E2\u5BAE',
      ll: [35.6592, 139.7668],
    },
    {
      k: 'hinode',
      name: '\u65E5\u306E\u51FA\u685F\u6A4B',
      ll: [35.6512, 139.7612],
    },
    {
      k: 'takeshiba',
      name: '\u7AF9\u829D',
      ll: [35.6548, 139.7628],
    },
    {
      k: 'odaiba',
      name: '\u304A\u53F0\u5834\u6D77\u6D5C\u516C\u5712',
      ll: [35.6305, 139.776],
    },
    {
      k: 'toyosu',
      name: '\u8C4A\u6D32',
      ll: [35.6512, 139.788],
    },
    {
      k: 'tennozu',
      name: '\u5929\u738B\u6D32',
      ll: [35.6222, 139.7512],
    },
  ],
  lh = [
    {
      name: '\u9685\u7530\u5DDD\u30E9\u30A4\u30F3',
      t: 'sumida',
      stops: ['asakusa', 'ryogoku', 'hamarikyu', 'hinode'],
    },
    {
      name: '\u6D45\u8349\u30FB\u304A\u53F0\u5834\u76F4\u901A',
      t: 'waterbus',
      stops: ['asakusa', 'hinode', 'odaiba'],
    },
    {
      name: '\u304A\u53F0\u5834\u30FB\u8C4A\u6D32\u30E9\u30A4\u30F3',
      t: 'sumida',
      stops: ['hinode', 'odaiba', 'toyosu', 'etchujima'],
    },
    {
      name: '\u7AF9\u829D\u30FB\u304A\u53F0\u5834\u30E9\u30A4\u30F3',
      t: 'waterbus',
      stops: ['takeshiba', 'odaiba', 'toyosu'],
    },
  ],
  BOATS = [];
G.boats = BOATS;
var R1 = {};
function Po(n, t, e = 9) {
  return isWaterAt(n, t) && isWaterAt(n + e, t) && isWaterAt(n - e, t) && isWaterAt(n, t + e) && isWaterAt(n, t - e);
}
function C6(n, t) {
  if (Po(n, t, 10)) return [n, t];
  for (let e = 6; e < 600; e += 6)
    for (let i = 0; i < 24; i++) {
      let s = n + Math.cos((i / 24) * 6.283) * e,
        o = t + Math.sin((i / 24) * 6.283) * e;
      if (Po(s, o, 10)) return [s, o];
    }
  return [n, t];
}
function P6(n, t) {
  for (let e = 2; e < 300; e += 2)
    for (let i = 0; i < 24; i++) {
      let s = n + Math.cos((i / 24) * 6.283) * e,
        o = t + Math.sin((i / 24) * 6.283) * e,
        r = maskQ(s, o);
      if ((r === M_LAND || r === M_PARK) && !isWaterAt(s + 1.5, o) && !isWaterAt(s - 1.5, o)) return [s, o];
    }
  return [n, t];
}
var k6 = null;
function dz() {
  let n = 1e9,
    t = 1e9,
    e = -1e9,
    i = -1e9;
  for (let u of PIERS) ((n = Math.min(n, u.w[0])), (t = Math.min(t, u.w[1])), (e = Math.max(e, u.w[0])), (i = Math.max(i, u.w[1])));
  let s = 12,
    o = n - 1500,
    r = t - 1500,
    a = Math.ceil((e - n + 3e3) / s),
    l = Math.ceil((i - t + 3e3) / s),
    f = new Uint8Array(a * l);
  for (let u = 0; u < l; u++) for (let c = 0; c < a; c++) f[u * a + c] = Po(o + (c + 0.5) * s, r + (u + 0.5) * s, 5) ? 1 : 0;
  k6 = {
    C: s,
    X0: o,
    Z0: r,
    NX: a,
    NZ: l,
    m: f,
  };
}
function pz(n, t) {
  let { C: e, X0: i, Z0: s, NX: o, NZ: r, m: a } = k6,
    l = (y, _) => {
      let v = It(Math.floor((y - i) / e), 0, o - 1);
      return It(Math.floor((_ - s) / e), 0, r - 1) * o + v;
    },
    f = l(n[0], n[1]),
    u = l(t[0], t[1]),
    c = new Int32Array(o * r).fill(-1);
  c[f] = f;
  let h = new Int32Array(o * r),
    d = 0,
    p = 0;
  for (h[p++] = f, a[f] = 1, a[u] = 1; d < p;) {
    let y = h[d++];
    if (y === u) break;
    let _ = y % o,
      v = (y / o) | 0;
    for (let b = -1; b <= 1; b++)
      for (let w = -1; w <= 1; w++) {
        if (!w && !b) continue;
        let E = _ + w,
          C = v + b;
        if (E < 0 || C < 0 || E >= o || C >= r) continue;
        let S = C * o + E;
        !a[S] || c[S] >= 0 || ((c[S] = y), (h[p++] = S));
      }
  }
  if (c[u] < 0) return [n, t];
  let x = [];
  for (let y = u; x.push([i + ((y % o) + 0.5) * e, s + (((y / o) | 0) + 0.5) * e]), y !== f; y = c[y]);
  (x.reverse(), (x[0] = n), (x[x.length - 1] = t));
  let m = (y, _) => {
      let v = Math.hypot(_[0] - y[0], _[1] - y[1]),
        b = Math.ceil(v / 8);
      for (let w = 1; w < b; w++) {
        let E = Ee(y[0], _[0], w / b),
          C = Ee(y[1], _[1], w / b);
        if (!Po(E, C, 5)) return !1;
      }
      return !0;
    },
    g = [x[0]],
    M = 0;
  for (; M < x.length - 1;) {
    let y = Math.min(x.length - 1, M + 60);
    for (; y > M + 1 && !m(x[M], x[y]);) y--;
    (g.push(x[y]), (M = y));
  }
  return g;
}
function hl(n, t, e, i, s, o) {
  let a = t / 2,
    l = [];
  for (let u = 0; u <= 12; u++) {
    let c = u / 12,
      h = -a + c * t,
      d = Math.max(0, (c - 0.55) / 0.45),
      p = (e / 2) * Math.sqrt(Math.max(0.02, 1 - d * d)) * (c < 0.04 ? 0.92 : 1),
      x = -i * 0.45 * (1 - d * 0.6),
      m = i * 0.55 + d * d * i * 0.25;
    l.push({
      z: h,
      hw: p,
      keel: x,
      top: m,
    });
  }
  for (let u = 0; u < 12; u++) {
    let c = l[u],
      h = l[u + 1];
    for (let d of [1, -1]) {
      n.setColor(s);
      let p = (x, m, g, M) => (d > 0 ? n.quad(x, m, g, M, null) : n.quad(x, M, g, m, null));
      (p([d * c.hw, 0, c.z], [d * h.hw, 0, h.z], [d * h.hw, h.top, h.z], [d * c.hw, c.top, c.z]),
        n.setColor(o),
        p([d * c.hw * 0.6, c.keel, c.z], [d * h.hw * 0.6, h.keel, h.z], [d * h.hw, 0, h.z], [d * c.hw, 0, c.z]));
    }
    n.setColor(12101770).quad([-c.hw, c.top, c.z], [-h.hw, h.top, h.z], [h.hw, h.top, h.z], [c.hw, c.top, c.z], [0, 1, 0]);
  }
  let f = l[0];
  return (n.setColor(s).quad([f.hw, 0, f.z], [f.hw, f.top, f.z], [-f.hw, f.top, f.z], [-f.hw, 0, f.z], [0, 0, -1]), l);
}
function mz(n) {
  let t = boats_BT[n],
    e = new Mt({
      color: !0,
    }),
    i = t.L,
    s = t.W;
  if (n === 'waterbus') {
    hl(e, i, s, 1.6, 13226198, 2764083);
    let o = 14;
    for (let r = 0; r < o; r++) {
      let a = -i * 0.42 + (r / o) * i * 0.8,
        l = -i * 0.42 + ((r + 1) / o) * i * 0.8,
        f = (p) => Math.max(0, Math.sin(((p + i * 0.42) / (i * 0.8)) * Math.PI)),
        u = 0.9 + f(a) * 2.4,
        c = 0.9 + f(l) * 2.4,
        h = s * 0.42 * (0.55 + f(a) * 0.45),
        d = s * 0.42 * (0.55 + f(l) * 0.45);
      for (let p of [1, -1]) {
        e.setColor(7317704);
        let x = [p * h, 0.88, a],
          m = [p * d, 0.88, l],
          g = [p * d * 0.4, 0.88 + c, l],
          M = [p * h * 0.4, 0.88 + u, a];
        p > 0 ? e.quad(x, m, g, M, null) : e.quad(x, M, g, m, null);
      }
      e.setColor(12109004).quad([-h * 0.4, 0.88 + u, a], [-d * 0.4, 0.88 + c, l], [d * 0.4, 0.88 + c, l], [h * 0.4, 0.88 + u, a], [0, 1, 0]);
    }
    e.setColor(14212836).box(0, 0.88, -i * 0.46, s * 0.8, 0.9, 2.2, 0, {});
  } else if (n === 'sumida') {
    (hl(e, i, s, 1.6, 15921902, 2050698),
      e.setColor(15921902).box(0, 0.88, -1, s * 0.86, 2.2, i * 0.7, 0, {}),
      e.setColor(2371644).box(0, 1.6, -1, s * 0.88, 1, i * 0.66, 0, {}),
      e.setColor(15921902).box(0, 3.08, -1, s * 0.8, 0.2, i * 0.6, 0, {}),
      e.setColor(2050698).box(0, 3.1, 7, 3, 1.4, 3, 0, {}),
      e.setColor(2371644).box(0, 3.5, 8.4, 2.6, 0.8, 0.2, 0, {}));
    for (let o = 0; o < 8; o++) e.setColor(13159632).box(s * 0.38, 3.3, -9 + o * 2.4, 0.06, 0.9, 0.06, 0, {});
  } else if (n === 'yakata') {
    (hl(e, i, s, 1.2, 7027234, 3809814), e.setColor(15787724).box(0, 0.66, -0.5, s * 0.86, 1.7, i * 0.78, 0, {}));
    for (let l = 0; l < 14; l++) e.setColor(5911584).box(0, 0.66, -i * 0.38 + l * i * 0.058, s * 0.88, 1.7, 0.12, 0, {});
    let o = -i * 0.42,
      r = i * 0.34,
      a = s * 0.55;
    for (let l of [1, -1]) {
      e.setColor(2829102);
      let f = [l * a, 2.35, o],
        u = [l * a, 2.35, r],
        c = [0, 3.2, r],
        h = [0, 3.2, o];
      l > 0 ? e.quad(f, u, c, h, null) : e.quad(f, h, c, u, null);
    }
  } else
    n === 'cruiser'
      ? (hl(e, i, s, 1.6, 16053488, 1911882),
        e.setColor(16053488).box(0, 0.88, -1, s * 0.7, 1.4, i * 0.45, 0, {}),
        e.setColor(1778219).box(0, 1.4, -1, s * 0.72, 0.6, i * 0.43, 0, {}),
        e.setColor(16053488).box(0, 2.28, -1.5, s * 0.6, 0.6, i * 0.3, 0, {}),
        e.setColor(12106944).box(0, 2.9, -2, 0.1, 1.4, 0.1, 0, {}))
      : n === 'motor'
        ? (hl(e, i, s, 1.2, 15921904, 13111342),
          e.setColor(1778219).box(0, 0.66, 0.6, s * 0.8, 0.5, 0.1, 0, {}),
          e.setColor(2763566).box(0, 0.66, -0.6, s * 0.6, 0.45, 1.3, 0, {}),
          e.setColor(1447706).box(0, 0.1, -i / 2 - 0.25, 0.5, 0.9, 0.5, 0, {}))
        : n === 'jetski'
          ? (hl(e, i, s, 0.8, 16777215, 15909424),
            e.setColor(1447706).box(0, 0.44, -0.3, 0.42, 0.25, 1.3, 0, {}),
            e.setColor(2763566).box(0, 0.75, 0.55, 0.7, 0.08, 0.08, 0, {}),
            e.setColor(15909424).box(0, 0.44, 0.8, 0.8, 0.2, 0.7, 0, {}))
          : n === 'police' &&
            (hl(e, i, s, 1.5, 16053488, 1911898),
            e.setColor(16053488).box(0, 0.82, 0, s * 0.7, 1.6, i * 0.38, 0, {}),
            e.setColor(1778219).box(0, 1.6, 0, s * 0.72, 0.6, i * 0.36, 0, {}),
            e.setColor(1911898).box(0, 0.4, 0, s + 0.02, 0.25, i * 0.7, 0, {}),
            e.setColor(16722464).box(0, 2.5, 0.3, 1, 0.18, 0.3, 0, {}),
            e.setColor(12106944).box(0, 2.6, -1, 0.08, 1.4, 0.08, 0, {}));
  return e.build();
}
function xz(n) {
  R1[n] ||
    (R1[n] = {
      g: mz(n),
      m: new THREE.MeshStandardMaterial({
        vertexColors: !0,
        roughness: 0.45,
        metalness: 0.2,
      }),
    });
  let t = new THREE.Mesh(R1[n].g, R1[n].m);
  if (((t.castShadow = !0), R.scene.add(t), n === 'yakata')) {
    let e = new THREE.SphereGeometry(0.28, 8, 6),
      i = new THREE.MeshStandardMaterial({
        color: 16726560,
        emissive: 16734752,
        emissiveIntensity: 1.2,
      });
    for (let s = 0; s < 8; s++)
      for (let o of [-1, 1]) {
        let r = new THREE.Mesh(e, i);
        (r.position.set(o * boats_BT.yakata.W * 0.55, 2.05, -7 + s * 1.9), (r.scale.y = 1.3), t.add(r));
      }
  }
  return t;
}
function C1(n, t, e, i, s) {
  let o = {
    t: n,
    td: boats_BT[n],
    x: t,
    z: e,
    yaw: i,
    v: 0,
    vl: 0,
    ctl: s,
    y: 0,
    pitch: 0,
    roll: 0,
    m: xz(n),
    hp: 100,
    wi: 0,
  };
  return (BOATS.push(o), o);
}
function gz(n) {
  R.scene.remove(n.m);
  let t = BOATS.indexOf(n);
  t >= 0 && BOATS.splice(t, 1);
}
function Mz(n) {
  let [t, e] = Ne(512, 128);
  ((e.fillStyle = '#123a6a'),
    e.fillRect(0, 0, 512, 128),
    (e.fillStyle = '#fff'),
    (e.font = `900 46px ${ce}`),
    (e.textAlign = 'center'),
    (e.textBaseline = 'middle'),
    e.fillText('\u2693 ' + n.name, 256, 50),
    (e.font = `700 24px ${ce}`),
    e.fillText('\u6C34\u4E0A\u30D0\u30B9 \u306E\u308A\u3070  WATER BUS', 256, 100));
  let i = new THREE.Group(),
    s = Math.atan2(n.w[0] - n.l[0], n.w[1] - n.l[1]),
    o = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.5, 26),
      new THREE.MeshStandardMaterial({
        color: 9077624,
        roughness: 0.9,
      }),
    );
  (o.position.set(0, 0.05, 0), i.add(o));
  let r = new THREE.Mesh(
    new THREE.BoxGeometry(5, 0.2, 8),
    new THREE.MeshStandardMaterial({
      color: 1194602,
    }),
  );
  (r.position.set(0, 3, -6), i.add(r));
  for (let [c, h] of [
    [-2.2, -9.5],
    [2.2, -9.5],
    [-2.2, -2.5],
    [2.2, -2.5],
  ]) {
    let d = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 3, 0.15),
      new THREE.MeshStandardMaterial({
        color: 14540253,
      }),
    );
    (d.position.set(c, 1.5, h), i.add(d));
  }
  let a = Fe(t, {
      rep: !1,
    }),
    l = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 1.2),
      new THREE.MeshStandardMaterial({
        map: a,
        emissive: 16777215,
        emissiveMap: a,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide,
      }),
    );
  (l.position.set(0, 3.8, -6), i.add(l));
  let f = (n.l[0] + n.w[0]) / 2,
    u = (n.l[1] + n.w[1]) / 2;
  (i.position.set(f, 0, u), (i.rotation.y = s), R.scene.add(i), (n.g = i));
}
function initBoats() {
  let n = performance.now();
  for (let i of PIERS) {
    let [s, o] = fe(i.ll[0], i.ll[1]);
    ((i.x = s), (i.z = o), (i.w = C6(s, o)), (i.l = P6(i.w[0], i.w[1])));
  }
  dz();
  let t = Object.fromEntries(PIERS.map((i) => [i.k, i]));
  for (let i of lh) {
    i.legs = [];
    for (let o = 0; o + 1 < i.stops.length; o++) i.legs.push(pz(t[i.stops[o]].w, t[i.stops[o + 1]].w));
    ((i.pts = []),
      (i.stopAt = new Set()),
      i.legs.forEach((o, r) => {
        o.forEach((a, l) => {
          (l === 0 && r > 0) || i.pts.push(a);
        });
      }));
    let s = 0;
    (i.stopAt.add(0),
      i.legs.forEach((o) => {
        ((s += o.length - 1), i.stopAt.add(s));
      }),
      (i.stopIdx = [...i.stopAt]),
      (i.pier = (o) => t[i.stops[i.stopIdx.indexOf(o)]]));
  }
  for (let i of PIERS)
    (Mz(i),
      G.mapIcons.push({
        x: i.l[0],
        z: i.l[1],
        col: '#1f6fb5',
        ch: '\u2693',
        name: '\u6C34\u4E0A\u30D0\u30B9',
      }));
  lh.forEach((i, s) => {
    for (let o = 0; o < 2; o++) {
      let r = o ? i.pts.length - 1 : 0,
        a = i.pts[r],
        l = i.pts[o ? r - 1 : 1],
        f = C1(i.t, a[0], a[1], Math.atan2(l[0] - a[0], l[1] - a[1]), 'line');
      ((f.line = i), (f.wi = r), (f.dirn = o ? -1 : 1), (f.dwell = 4 + o * 25 + s * 8));
    }
  });
  for (let i = 0; i < 5; i++) {
    let s = lh[i % 2 ? 2 : 0],
      o = Math.floor(rt(1, s.pts.length - 1)),
      r = s.pts[o],
      a = C1('yakata', r[0] + rt(-20, 20), r[1] + rt(-20, 20), rt(0, 6), 'cruise');
    ((a.line = s), (a.wi = o), (a.dirn = i % 2 ? 1 : -1), (a.slow = rt(0.6, 0.9)), Po(a.x, a.z, 6) || ((a.x = r[0]), (a.z = r[1])));
  }
  let e = [
    ['hinode', 'motor'],
    ['tennozu', 'motor'],
    ['asakusa', 'motor'],
    ['odaiba', 'jetski'],
    ['toyosu', 'jetski'],
    ['takeshiba', 'cruiser'],
    ['hamarikyu', 'jetski'],
    ['etchujima', 'motor'],
  ];
  for (let [i, s] of e) {
    let o = t[i],
      r = o.w[0] - o.l[0],
      a = o.w[1] - o.l[1],
      l = Math.hypot(r, a) || 1,
      f = a / l,
      u = -r / l,
      c = o.w[0] + f * 18,
      h = o.w[1] + u * 18,
      [d, p] = Po(c, h, 4) ? [c, h] : C6(c, h);
    C1(s, d, p, Math.atan2(f, u), null).moored = !0;
  }
  console.log(
    'boats ms',
    Math.round(performance.now() - n),
    lh.map((i) => i.pts.length),
  );
}
function lines() {
  return lh;
}
function bz(n) {
  let t = Math.sin(n.yaw),
    e = Math.cos(n.yaw),
    i = -e,
    s = t,
    o = n.td.L / 2,
    r = n.td.W / 2;
  for (let [a, l] of [
    [o, 0],
    [o * 0.6, r],
    [o * 0.6, -r],
    [-o, r * 0.8],
    [-o, -r * 0.8],
  ])
    if (!isWaterAt(n.x + t * a + i * l, n.z + e * a + s * l)) return !0;
  return !1;
}
function ch(n, t) {
  let e = Math.sin(n.yaw),
    i = Math.cos(n.yaw),
    s = -i,
    o = e,
    r = n.x,
    a = n.z;
  if (((n.x += (e * n.v + s * n.vl) * t), (n.z += (i * n.v + o * n.vl) * t), bz(n))) {
    ((n.x = r), (n.z = a));
    let l = Math.abs(n.v);
    ((n.v *= -0.25),
      (n.vl *= -0.3),
      l > 4 &&
        n.ctl === 'player' &&
        (Ro(n.x + (e * n.td.L) / 2, 0.5, n.z + (i * n.td.L) / 2, l), gt.crash(l), (G.cam.shake = Math.min(0.6, l * 0.03)), (n.hp -= l * 1.5)));
  }
  for (let l of BOATS) {
    if (l === n) continue;
    let f = n.x - l.x,
      u = n.z - l.z,
      c = Math.hypot(f, u),
      h = (n.td.L + l.td.L) * 0.3;
    if (c < h && c > 0.01) {
      let d = ((h - c) / c) * 0.5;
      ((n.x += f * d), (n.z += u * d), l.line || ((l.x -= f * d), (l.z -= u * d)), (n.v *= 0.97));
    }
  }
}
function A5(n, t) {
  let e = Math.abs(n.v);
  if (e < 2 || Math.random() > t * (8 + e)) return;
  let i = Math.sin(n.yaw),
    s = Math.cos(n.yaw),
    o = n.td.L / 2,
    r = -s,
    a = i;
  for (let l of [-1, 1])
    We.smoke.spawn(
      n.x - i * o + r * l * n.td.W * 0.3,
      0.1,
      n.z - s * o + a * l * n.td.W * 0.3,
      -i * 1 + r * l * 1.2,
      0.6,
      -s * 1 + a * l * 1.2,
      rt(0.8, 1.6),
      0.6,
      2.2 + n.td.W * 0.3,
      0.92,
      0.95,
      0.98,
      0.55,
      2,
    );
}
function E5(n, t, e, i, s) {
  let o = Math.sin(n.yaw),
    r = Math.cos(n.yaw),
    a = 12 + Math.abs(n.v) * 2.2,
    l = Math.atan2(t - n.x, e - n.z);
  if (!Po(n.x + o * a, n.z + r * a, 4)) {
    let u = Po(n.x + Math.sin(n.yaw + 0.7) * a, n.z + Math.cos(n.yaw + 0.7) * a, 4),
      c = Po(n.x + Math.sin(n.yaw - 0.7) * a, n.z + Math.cos(n.yaw - 0.7) * a, 4);
    ((l = n.yaw + (u && !c ? 0.9 : c && !u ? -0.9 : 1.2)), (i *= 0.5));
  }
  let f = ln(l - n.yaw);
  ((n.yaw += It(f, -1, 1) * n.td.turn * It(Math.abs(n.v) / 3 + 0.3, 0.3, 1.2) * s),
    Math.abs(f) > 1.2 && (i *= 0.4),
    (n.v += It(i - n.v, -n.td.acc * 1.5 * s, n.td.acc * s)),
    (n.vl *= Math.exp(-2 * s)));
}
function z6(n, t) {
  let e = n.line;
  if (n.dwell > 0) {
    ((n.dwell -= t), (n.v *= Math.exp(-2 * t)), (n.atPier = n.line.stopAt.has(n.wi) ? e.pier(n.wi) : null));
    return;
  }
  n.atPier = null;
  let i = n.wi + n.dirn;
  (i < 0 || i >= e.pts.length) && ((n.dirn *= -1), (i = n.wi + n.dirn));
  let s = e.pts[i],
    o = Math.hypot(s[0] - n.x, s[1] - n.z),
    r = n.ctl === 'line' && e.stopAt.has(i),
    a = n.td.vmax * (n.slow || 1);
  r && (a = Math.min(a, 0.6 + o * 0.12));
  for (let l of BOATS) {
    if (l === n) continue;
    let f = l.x - n.x,
      u = l.z - n.z,
      c = f * Math.sin(n.yaw) + u * Math.cos(n.yaw),
      h = Math.abs(f * Math.cos(n.yaw) - u * Math.sin(n.yaw));
    c > 0 && c < 45 && h < (n.td.W + l.td.W) * 0.7 && (a = Math.min(a, Math.max(0, (c - 20) * 0.2)));
  }
  (E5(n, s[0], s[1], a, t),
    ch(n, t),
    A5(n, t),
    o < (r ? 9 : 22) && ((n.wi = i), r && ((n.dwell = 22), (i === 0 || i === e.pts.length - 1) && (n.dirn *= -1))));
}
function vz(n, t) {
  let e = G.player,
    i = e.boat || e,
    s = Math.hypot(i.x - n.x, i.z - n.z);
  if (Ke() === 0 || s > 700) {
    ((n.leave = (n.leave || 0) + t), E5(n, n.x + Math.sin(n.yaw) * 50, n.z + Math.cos(n.yaw) * 50, 8, t), ch(n, t), n.leave > 20 && s > 250 && gz(n));
    return;
  }
  n.leave = 0;
  let o = e.boat ? [Math.sin(e.boat.yaw) * e.boat.v, Math.cos(e.boat.yaw) * e.boat.v] : [0, 0];
  (E5(n, i.x + o[0] * 1.2, i.z + o[1] * 1.2, s < 14 ? 2 : n.td.vmax * (0.9 + Ke() * 0.04), t),
    ch(n, t),
    A5(n, t),
    (n.shootT = (n.shootT || 2) - t),
    Ke() >= 3 &&
      s < 45 &&
      n.shootT <= 0 &&
      G.npcShoot &&
      ((n.shootT = rt(1, 1.8)),
      G.npcShoot(
        n.x + Math.sin(n.yaw) * 3,
        2.2,
        n.z + Math.cos(n.yaw) * 3,
        It(0.5 - s * 0.008, 0.1, 0.5),
        8,
        '\u8B66\u5BDF\u8247\u306B\u6483\u305F\u308C\u305F',
      )));
}
var S5 = 0;
function updBoats(n) {
  let t = G.player,
    e = G.input;
  for (let s of BOATS.slice())
    if (s.ctl === 'player') {
      if (t.boatRide) continue;
      let o = s.td,
        r = e.thr,
        a = e.brake,
        l = e.steer;
      (r > 0 && (s.v += o.acc * r * Math.max(0, 1 - s.v / o.vmax) * n),
        a > 0 && (s.v -= o.acc * 0.8 * a * n),
        (s.v -= s.v * 0.22 * n),
        (s.v = It(s.v, -o.vmax * 0.3, o.vmax)));
      let f = o.turn * It(Math.abs(s.v) / 5 + 0.15, 0.15, 1.3);
      ((s.yaw -= l * f * Math.sign(s.v || 1) * n),
        (s.vl += l * s.v * 0.12 * n),
        (s.vl *= Math.exp(-1.6 * n)),
        ch(s, n),
        A5(s, n),
        s.hp <= 0 &&
          !s.sunk &&
          ((s.sunk = !0),
          xt('explode', {
            x: s.x,
            y: 0.5,
            z: s.z,
          }),
          xt('wasted', '\u8239\u304C\u5927\u7834\u3057\u305F')));
    } else
      s.ctl === 'line' || s.ctl === 'cruise'
        ? z6(s, n)
        : s.ctl === 'police'
          ? vz(s, n)
          : ((s.v *= Math.exp(-0.8 * n)), (s.vl *= Math.exp(-0.8 * n)), Math.abs(s.v) > 0.05 && ch(s, n));
  S5 -= n;
  let i = t.mode === 'boat' && !t.boatRide;
  if (i && Ke() >= 1 && S5 <= 0 && ((S5 = 8), BOATS.filter((o) => o.ctl === 'police').length < Math.min(3, Ke())))
    for (let o = 0; o < 10; o++) {
      let r = rt(0, 6.28),
        a = rt(160, 260),
        l = t.x + Math.cos(r) * a,
        f = t.z + Math.sin(r) * a;
      if (Po(l, f, 8)) {
        (C1('police', l, f, Math.atan2(t.x - l, t.z - f), 'police'), xt('toast', '\u8B66\u5BDF\u8247\u304C\u8FFD\u3063\u3066\u304F\u308B\uFF01'));
        break;
      }
    }
  G.bustBoat = i && Math.abs(t.boat.v) < 2 && BOATS.some((s) => s.ctl === 'police' && Math.hypot(s.x - t.x, s.z - t.z) < 12);
}
function boatPoliceSees(n, t) {
  for (let e of BOATS) if (e.ctl === 'police' && Math.hypot(e.x - n.x, e.z - n.z) < t) return !0;
  return !1;
}
function renderBoats(n, t) {
  let e = R.camera.position;
  for (let i of BOATS) {
    let s = Math.hypot(i.x - e.x, i.z - e.z) > 1600;
    if (((i.m.visible = !s && !G.player.interior), s)) continue;
    let o = Math.abs(i.v),
      r = Math.sin(G.t * 1.4 + i.x * 0.05) * (i.td.L < 8 ? 0.08 : 0.04);
    if (
      ((i.pitch = Ee(i.pitch, -It(o / i.td.vmax, 0, 1) * (i.td.L < 8 ? 0.12 : 0.03) + Math.sin(G.t * 1.1 + i.z * 0.03) * 0.015, Math.min(1, n * 3))),
      (i.roll = Ee(i.roll, It(i.vl * 0.05, -0.15, 0.15) + Math.sin(G.t * 0.9 + i.x * 0.02) * 0.02, Math.min(1, n * 3))),
      (i.y = -0.25 + r + It(o / i.td.vmax, 0, 1) * (i.td.L < 8 ? 0.18 : 0)),
      i.m.position.set(i.x, i.y, i.z),
      i.m.rotation.set(i.pitch, i.yaw, i.roll, 'YXZ'),
      R.night > 0.25)
    ) {
      let a = Math.sin(i.yaw),
        l = Math.cos(i.yaw),
        f = -l,
        u = a;
      if (
        (t.add(i.x + a * i.td.L * 0.48, i.y + i.td.H * 0.7, i.z + l * i.td.L * 0.48, 1, 1, 0.9, 2.5),
        t.add(i.x + f * i.td.W * 0.5, i.y + 1.2, i.z + u * i.td.W * 0.5, 1, 0.1, 0.1, 1.6),
        t.add(i.x - f * i.td.W * 0.5, i.y + 1.2, i.z - u * i.td.W * 0.5, 0.1, 1, 0.2, 1.6),
        i.t === 'waterbus' || i.t === 'sumida' || i.t === 'yakata')
      )
        for (let c = -2; c <= 2; c++) t.add(i.x + a * c * i.td.L * 0.15, i.y + 2, i.z + l * c * i.td.L * 0.15, 1, 0.85, 0.6, 2.5);
    }
    i.ctl === 'police' && Math.floor(G.t * 6) % 2 && t.add(i.x, i.y + 2.7, i.z, 1, 0.1, 0.08, 5);
  }
}
function nearBoat(n, t) {
  let e = null,
    i = 1e9;
  for (let s of BOATS) {
    if (s.ctl === 'police' || s.sunk) continue;
    let o = Math.hypot(s.x - n, s.z - t) - s.td.L * 0.5,
      r = s.line ? 10 : 5;
    o < r && o < i && ((i = o), (e = s));
  }
  return e;
}
function nearPier(n, t, e = 40) {
  let i = null,
    s = e;
  for (let o of PIERS) {
    let r = Math.hypot(o.l[0] - n, o.l[1] - t);
    r < s && ((s = r), (i = o));
  }
  return i;
}
function board(n) {
  let t = G.player;
  if (n.line) {
    if (!n.atPier) return '\u505C\u6CCA\u4E2D\u306E\u6C34\u4E0A\u30D0\u30B9\u306B\u306E\u307F\u4E57\u308C\u307E\u3059';
    if (G.money < 860) return '\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093\uFF08\xA5860\uFF09';
    ((G.money -= 860), gt.cash(), (t.boatRide = !0));
  } else ((n.ctl = 'player'), (n.moored = !1), (t.boatRide = !1));
  return ((t.mode = 'boat'), (t.boat = n), (G.cam.snap = !0), gt.door(), null);
}
function leave() {
  let n = G.player,
    t = n.boat;
  if (!t) return '';
  if (n.boatRide) {
    if (!t.atPier) return '\u685F\u6A4B\u306B\u7740\u3044\u3066\u304B\u3089\u964D\u308A\u3089\u308C\u307E\u3059';
    let e = t.atPier;
    ((n.x = e.l[0]), (n.z = e.l[1]));
  } else {
    let [e, i] = P6(t.x, t.z);
    if (Math.hypot(e - t.x, i - t.z) > t.td.W / 2 + 14) return '\u5CB8\u306B\u5BC4\u305B\u3066\u304B\u3089\u964D\u308A\u3066\u304F\u3060\u3055\u3044';
    if (Math.abs(t.v) > 3) return '\u901F\u3059\u304E\u3066\u964D\u308A\u3089\u308C\u307E\u305B\u3093';
    ((t.ctl = null), (n.x = e), (n.z = i));
  }
  return ((n.mode = 'foot'), (n.boat = null), (n.boatRide = !1), (n.y = 0.2), (G.cam.snap = !0), gt.door(), null);
}
function rideInfo() {
  let n = G.player,
    t = n.boat;
  if (!t || !n.boatRide) return null;
  let e = t.line,
    i = t.wi;
  for (let o = 0; o < e.pts.length && ((i += t.dirn), !(i < 0 || i >= e.pts.length || e.stopAt.has(i))); o++);
  let s = t.atPier || (e.stopAt.has(i) ? e.pier(i) : null);
  return {
    top: t.atPier ? '\u505C\u6CCA\u4E2D \u2014 F \u3067\u4E0B\u8239' : '\u6B21\u306F\uFF08Shift \u3067\u65E9\u9001\u308A\uFF09',
    main: s ? s.name : '',
    sub: `${t.td.name}\u3000${e.name}`,
    color: '#1f6fb5',
  };
}
var GTA = {};
vi(GTA, {
  GT: () => GT,
  PROPS: () => PROPS,
  RADIO: () => RADIO,
  debugEvent: () => debugEvent,
  deliverCar: () => deliverCar,
  enterDeck: () => enterDeck,
  exitDeck: () => exitDeck,
  gunShopMenu: () => gunShopMenu,
  initGTA: () => initGTA,
  loadGTA: () => loadGTA,
  nearGarage: () => nearGarage,
  nearProperty: () => nearProperty,
  offerProperty: () => offerProperty,
  onCarFire: () => onCarFire,
  onPedKilled: () => onPedKilled,
  openGarage: () => openGarage,
  resetGTA: () => resetGTA,
  saveGTA: () => saveGTA,
  setRadio: () => setRadio,
  togglePhone: () => togglePhone,
  toggleWheel: () => toggleWheel,
  updDeck: () => updDeck,
  updGTA: () => updGTA,
});
var FIRE = {};
vi(FIRE, {
  FIRES: () => FIRES,
  carFireSpread: () => carFireSpread,
  deployFiremen: () => deployFiremen,
  explosionFire: () => explosionFire,
  fireGlows: () => fireGlows,
  nearestFire: () => nearestFire,
  startFire: () => startFire,
  updFires: () => updFires,
});
var FIRES = [],
  k1 = [],
  I6 = [];
function startFire(n, t, e = 'ground', i = {}) {
  if (isWaterAt(n, t) || FIRES.length > 40) return null;
  for (let r of FIRES) if (Math.hypot(r.x - n, r.z - t) < (e === 'bld' ? 6 : 3)) return ((r.life = Math.max(r.life, e === 'bld' ? 120 : 20)), r);
  let s = e === 'bld' && (i.major ?? Math.random() < 0.55),
    o = {
      x: n,
      z: t,
      kind: e,
      major: s,
      r: e === 'bld' ? (s ? 8 : 5) : 2.6 + rt(0, 1.2),
      life: e === 'bld' ? 140 : rt(16, 26),
      hp: e === 'bld' ? (s ? 320 : 100) : 35,
      y1: i.y1 || (e === 'bld' ? 9 : 1.2),
      t: 0,
      spreadT: rt(2, 4),
      bi: i.bi,
    };
  return (FIRES.push(o), xt('fireStart', o), o);
}
function explosionFire(n, t) {
  startFire(n, t, 'ground');
  for (let r = 0; r < 2; r++) startFire(n + rt(-4, 4), t + rt(-4, 4), 'ground');
  let e = [];
  buildingsNear(n, t, 30, e);
  let i = W.bld,
    s = null,
    o = 9;
  for (let r of e) {
    let a = r * 9;
    if (i[a + 6] < 4) continue;
    let l = Math.cos(i[a + 2]),
      f = Math.sin(i[a + 2]),
      u = n - i[a],
      c = t - i[a + 1],
      h = u * l + c * f,
      d = -u * f + c * l,
      p = Math.max(0, Math.abs(h) - i[a + 3] / 2),
      x = Math.max(0, Math.abs(d) - i[a + 4] / 2),
      m = Math.hypot(p, x);
    m < o &&
      ((o = m),
      (s = {
        i: r,
        lx: It(h, -i[a + 3] / 2, i[a + 3] / 2),
        lz: It(d, -i[a + 4] / 2, i[a + 4] / 2),
        c: l,
        s: f,
        k: a,
      }));
  }
  if (s && Math.random() < 0.7) {
    let { k: r, lx: a, lz: l, c: f, s: u } = s,
      c = i[r] + a * f - l * u,
      h = i[r + 1] + a * u + l * f;
    startFire(c, h, 'bld', {
      y1: Math.min(i[r + 6], 18),
      bi: s.i,
    });
  }
}
function wz(n) {
  let t = [];
  buildingsNear(n.x, n.z, 22, t);
  let e = W.bld,
    i = t.filter((f) => f !== n.bi && e[f * 9 + 6] >= 4);
  if (!i.length) return;
  let s = i[Math.floor(Math.random() * i.length)],
    o = s * 9,
    r = rt(0, 6.283),
    a = e[o] + Math.cos(r) * e[o + 3] * 0.4,
    l = e[o + 1] + Math.sin(r) * e[o + 4] * 0.4;
  FIRES.filter((f) => f.kind === 'bld').length < 6 &&
    startFire(a, l, 'bld', {
      y1: Math.min(e[o + 6], 18),
      bi: s,
    });
}
var D5 = 240;
function Sz(n) {
  if (((D5 -= n), D5 > 0)) return;
  D5 = rt(300, 520);
  let t = G.player;
  if (t.interior || t.mode === 'plane' || FIRES.some((u) => u.major)) return;
  let e = [],
    i = rt(0, 6.283),
    s = rt(120, 260);
  buildingsNear(t.x + Math.cos(i) * s, t.z + Math.sin(i) * s, 60, e);
  let o = W.bld,
    r = e.filter((u) => o[u * 9 + 6] >= 6 && o[u * 9 + 6] < 60);
  if (!r.length) return;
  let a = r[Math.floor(Math.random() * r.length)],
    l = a * 9;
  startFire(o[l] + o[l + 3] * 0.3, o[l + 1], 'bld', {
    y1: Math.min(o[l + 6], 22),
    bi: a,
    major: !0,
  }) &&
    xt(
      'toast',
      '\u{1F525} \u8FD1\u304F\u3067\u706B\u707D\u304C\u767A\u751F\uFF01 \u6D88\u9632\u8ECA\u304C\u5411\u304B\u3063\u3066\u3044\u307E\u3059',
    );
}
function updFires(n) {
  let t = G.player;
  Sz(n);
  for (let e = FIRES.length - 1; e >= 0; e--) {
    let i = FIRES[e];
    if (
      ((i.t += n),
      i.major || (i.life -= n * (i.kind === 'bld' ? 0.5 : 1)),
      i.water > 0 && ((i.hp -= i.water * n), (i.water = 0)),
      i.life <= 0 || i.hp <= 0)
    ) {
      if ((FIRES.splice(e, 1), i.hp <= 0)) for (let o = 0; o < 10; o++) O0(i.x + rt(-i.r, i.r), 0.5 + rt(0, i.y1), i.z + rt(-i.r, i.r), !1);
      continue;
    }
    if (Math.hypot(i.x - t.x, i.z - t.z) < 260) {
      let o = i.major ? 60 : i.kind === 'bld' ? 26 : 14;
      (i.major && Math.random() < n * 14 && O0(i.x + rt(-3, 3), i.y1 + 4 + rt(0, 10), i.z + rt(-3, 3), !0),
        Math.random() < n * o && h1(i.x + rt(-i.r, i.r), rt(0.2, i.y1), i.z + rt(-i.r, i.r)),
        Math.random() < n * (i.kind === 'bld' ? 9 : 4) && O0(i.x + rt(-i.r, i.r), i.y1 + rt(0, 2), i.z + rt(-i.r, i.r), !0));
    }
    if (((i.spreadT -= n), !(i.spreadT > 0))) {
      ((i.spreadT = rt(1.2, 2.2)), carsNear(i.x, i.z, i.r + 5, k1));
      for (let o of k1) {
        if (o.removed || o.dead || o.burn > 0 || o.td.bike === 'cycle') continue;
        Math.hypot(o.x - i.x, o.z - i.z) < i.r + o.td.L * 0.4 &&
          (damageCar(o, 18), Math.random() < 0.25 && o.hp > 0 && ((o.hp = 0), (o.burn = 6), xt('carFire', o)));
      }
      pedsNear(i.x, i.z, i.r + 3, I6);
      for (let o of I6)
        if (!(o.killed || o.kind === 10))
          if (Math.hypot(o.x - i.x, o.z - i.z) < i.r + 0.6) {
            let r = o.x - i.x,
              a = o.z - i.z,
              l = Math.hypot(r, a) || 1;
            knockPed(o, (r / l) * 3, 2, (a / l) * 3, 0, 22);
          } else o.state !== 'down' && o.state !== 'cop' && ((o.state = 'flee'), (o.t = 5));
      (t.mode === 'foot' &&
        !t.interior &&
        Math.hypot(t.x - i.x, t.z - i.z) < i.r + 0.5 &&
        G.damagePlayer &&
        G.damagePlayer(12, '\u708E\u306B\u5DFB\u304D\u8FBC\u307E\u308C\u305F'),
        i.kind === 'ground' &&
          i.t < 10 &&
          Math.random() < 0.12 &&
          FIRES.filter((o) => o.kind === 'ground').length < 12 &&
          startFire(i.x + rt(-5, 5), i.z + rt(-5, 5), 'ground'),
        i.kind === 'bld' && i.t > 25 && Math.random() < (i.major ? 0.08 : 0.05) && wz(i));
    }
  }
}
function carFireSpread(n, t) {
  if (!(!(n.burn > 0) || n.removed) && ((n.fT = (n.fT || 0) - t), !(n.fT > 0))) {
    ((n.fT = 1.8), carsNear(n.x, n.z, 9, k1));
    for (let e of k1)
      e === n ||
        e.removed ||
        e.dead ||
        e.burn > 0 ||
        e.td.bike === 'cycle' ||
        (Math.hypot(e.x - n.x, e.z - n.z) < (n.td.L + e.td.L) * 0.5 + 1.5 && (damageCar(e, 10), e.hp <= 0 && !e.burn && xt('carFire', e)));
  }
}
function fireGlows(n) {
  let t = G.player;
  for (let e of FIRES) {
    if (Math.abs(e.x - t.x) > 400 || Math.abs(e.z - t.z) > 400) continue;
    let i = 0.75 + Math.sin(G.t * 17 + e.x) * 0.15;
    n.add(e.x, 1 + e.y1 * 0.4, e.z, 1, 0.45 * i, 0.1, (e.kind === 'bld' ? 12 : 6) * i);
  }
}
function nearestFire(n, t, e = 300) {
  let i = null,
    s = e;
  for (let o of FIRES) {
    let r = Math.hypot(o.x - n, o.z - t);
    r < s && ((s = r), (i = o));
  }
  return i;
}
G.firemanAI = (n, t) => {
  let e = n.fire;
  if (((!e || !FIRES.includes(e)) && (e = n.fire = nearestFire(n.x, n.z, 220)), !e)) {
    let a = n.home;
    if (!a || a.removed) {
      n.dead = !0;
      return;
    }
    let l = a.x - n.x,
      f = a.z - n.z,
      u = Math.hypot(l, f);
    if (u < 2.5) {
      n.dead = !0;
      return;
    }
    ((n.x += (l / u) * 2.4 * t), (n.z += (f / u) * 2.4 * t), (n.yaw = Math.atan2(l, f)), (n.spray = 0));
    return;
  }
  let i = e.x - n.x,
    s = e.z - n.z,
    o = Math.hypot(i, s),
    r = e.r + (e.kind === 'bld' ? 6 : 4);
  if (((n.yaw += ln(Math.atan2(i, s) - n.yaw) * Math.min(1, t * 6)), o > r)) {
    ((n.x += (i / o) * 3.2 * t), (n.z += (s / o) * 3.2 * t), (n.spray = 0));
    return;
  }
  if (((n.spray = 1), (e.water = (e.water || 0) + (e.kind === 'bld' ? 3.5 : 9)), Math.random() < t * 30)) {
    let a = Math.sin(n.yaw),
      l = Math.cos(n.yaw),
      f = 9 + rt(0, 3);
    We.smoke.spawn(
      n.x + a * 0.6,
      n.y + 1.2,
      n.z + l * 0.6,
      a * f + rt(-0.6, 0.6),
      2.2 + (e.kind === 'bld' ? 3 : 0),
      l * f + rt(-0.6, 0.6),
      0.9,
      0.18,
      0.7,
      0.75,
      0.86,
      1,
      0.75,
      9,
    );
  }
};
function deployFiremen(n) {
  let t = [];
  for (let e = 0; e < 3; e++) {
    let i = -Math.cos(n.yaw),
      s = Math.sin(n.yaw),
      o = spawnPedAt(
        n.x + i * (n.td.W / 2 + 0.8) - Math.sin(n.yaw) * (e - 1) * 1.6,
        n.z + s * (n.td.W / 2 + 0.8) - Math.cos(n.yaw) * (e - 1) * 1.6,
        'fireman',
        10,
      );
    o && ((o.home = n), (o.t = 999), t.push(o));
  }
  return t;
}
var B5 = (n, t) => fe(n, t),
  xe = {},
  GT = {
    radio: 1,
    myCar: null,
    props: {},
    phone: !1,
    deck: null,
  };
G.mapIcons = [];
G.blips = [];
function Ez(n, t) {
  let e = W.bld,
    i = [];
  buildingsNear(n, t, 140, i);
  let s = null,
    o = 1e9;
  for (let r of i) {
    let a = r * 9;
    if (e[a + 6] < 5 || e[a + 3] < 8 || e[a + 4] < 6) continue;
    let l = Math.hypot(e[a] - n, e[a + 1] - t);
    if (l > o) continue;
    let f = e[a],
      u = e[a + 1],
      c = e[a + 2],
      h = e[a + 3],
      d = e[a + 4],
      p = Math.cos(c),
      x = Math.sin(c);
    for (let m of [-1, 1]) {
      let g = -x * m,
        M = p * m,
        y = [];
      if ((roadsNear(f + g * (d / 2 + 6), u + M * (d / 2 + 6), 7, y), y.some((_) => !_.e.elev))) {
        ((o = l),
          (s = {
            x: f + g * (d / 2 + 1.2),
            z: u + M * (d / 2 + 1.2),
            nx: g,
            nz: M,
            w: h,
            h: e[a + 6],
            fx: f + g * (d / 2 + 0.12),
            fz: u + M * (d / 2 + 0.12),
          }));
        break;
      }
    }
  }
  return s;
}
var G5 = new Map();
function hh(n, t, e, i, s, o, r, a, l, f) {
  let u = n + '|' + t + '|' + e + i;
  if (G5.has(u)) {
    let m = new THREE.Mesh(new THREE.PlaneGeometry(s, o), G5.get(u));
    return (m.position.set(r, a, l), (m.rotation.y = f), R.scene.add(m), m);
  }
  let [c, h] = Ne(320, 80);
  (h.scale(0.625, 0.625), (h.fillStyle = e), h.fillRect(0, 0, 512, 128), (h.fillStyle = i), (h.textAlign = 'center'), (h.textBaseline = 'middle'));
  let d = 60;
  for (h.font = `900 ${d}px ${ce}`; h.measureText(n).width > 480 && d > 20;) ((d -= 4), (h.font = `900 ${d}px ${ce}`));
  (h.fillText(n, 256, t ? 50 : 66), t && ((h.font = `700 24px ${ce}`), h.fillText(t, 256, 104)));
  let p = Fe(c, {
      rep: !1,
    }),
    x = new THREE.Mesh(
      new THREE.PlaneGeometry(s, o),
      new THREE.MeshStandardMaterial({
        map: p,
        emissive: 16777215,
        emissiveMap: p,
        emissiveIntensity: 0.5,
      }),
    );
  return (x.position.set(r, a, l), (x.rotation.y = f), R.scene.add(x), LM.emissive.push([x.material, 1.1, 0.3]), G5.set(u, x.material), x);
}
function V5(n, t, e, i, s, o, r, a) {
  let l = Ez(n, t);
  if (!l) return null;
  let f = Math.atan2(l.nx, l.nz),
    u = Math.min(l.w - 1, 11);
  hh(e, i, s, o, u, u * 0.25, l.fx + l.nx * 0.05, Math.min(l.h - 1, 4.6), l.fz + l.nz * 0.05, f);
  let c = Object.assign(
    {
      x: l.x,
      z: l.z,
      type: r,
      label: e,
      face: [l.nx, l.nz],
    },
    a || {},
  );
  return (DOORS.push(c), c);
}
var Tz = [
    [35.7096, 139.7744, '\u30A2\u30E1\u6A2A'],
    [35.7008, 139.7702, '\u79CB\u8449\u539F'],
    [35.6953, 139.703, '\u6B4C\u821E\u4F0E\u753A'],
    [35.6612, 139.6968, '\u6E0B\u8C37'],
    [35.6628, 139.7318, '\u516D\u672C\u6728'],
    [35.7302, 139.7088, '\u6C60\u888B'],
    [35.629, 139.742, '\u54C1\u5DDD'],
  ],
  Az = [
    [35.643, 139.75, '\u829D\u6D66'],
    [35.635, 139.7905, '\u6709\u660E'],
    [35.733, 139.72, '\u6C60\u888B'],
    [35.6603, 139.7352, '\u516D\u672C\u6728'],
    [35.6958, 139.815, '\u9326\u7CF8\u753A'],
    [35.611, 139.73, '\u5927\u4E95'],
    [35.689, 139.7, '\u897F\u65B0\u5BBF'],
  ],
  N6 = [],
  PROPS = [
    {
      k: 'nakameguro',
      name: '\u4E2D\u76EE\u9ED2 \u30C7\u30B6\u30A4\u30CA\u30FC\u30BA\u30DE\u30F3\u30B7\u30E7\u30F3',
      ll: [35.644, 139.699],
      price: 12e4,
      income: 0,
    },
    {
      k: 'shinjukuG',
      name: '\u65B0\u5BBF \u30AC\u30EC\u30FC\u30B8\u4ED8\u304D\u30A2\u30D1\u30FC\u30C8',
      ll: [35.6985, 139.6965],
      price: 22e4,
      income: 0,
      garage: !0,
    },
    {
      k: 'tsukishima',
      name: '\u6708\u5CF6 \u30BF\u30EF\u30FC\u30DE\u30F3\u30B7\u30E7\u30F3 38F',
      ll: [35.6635, 139.782],
      price: 48e4,
      income: 0,
    },
    {
      k: 'akibaBiz',
      name: '\u79CB\u8449\u539F \u96D1\u5C45\u30D3\u30EB\uFF08\u30C6\u30CA\u30F3\u30C8\u53CE\u5165\uFF09',
      ll: [35.6992, 139.7712],
      price: 65e4,
      income: 12e3,
    },
    {
      k: 'roppongiRes',
      name: '\u516D\u672C\u6728 \u30D2\u30EB\u30BA\u30EC\u30B8\u30C7\u30F3\u30B9',
      ll: [35.6598, 139.7282],
      price: 15e5,
      income: 0,
    },
    {
      k: 'odaibaClub',
      name: '\u304A\u53F0\u5834 \u30CA\u30A4\u30C8\u30AF\u30E9\u30D6\uFF08\u7D4C\u55B6\uFF09',
      ll: [35.6268, 139.7758],
      price: 22e5,
      income: 55e3,
    },
    {
      k: 'shirokane',
      name: '\u767D\u91D1\u53F0 \u9AD8\u7D1A\u90B8\u5B85',
      ll: [35.6382, 139.7268],
      price: 38e5,
      income: 0,
      garage: !0,
    },
    {
      k: 'ginzaBar',
      name: '\u9280\u5EA7 \u4F1A\u54E1\u5236\u30D0\u30FC\uFF08\u7D4C\u55B6\uFF09',
      ll: [35.6708, 139.7628],
      price: 12e5,
      income: 28e3,
    },
  ],
  j5 = [];
function Rz() {
  let n = W.landmarks.tokyoTower,
    t = W.landmarks.skytree,
    e = W.landmarks.tocho,
    i = (s, o, r, a, l, f, u, c, h) => {
      let d = new THREE.Group();
      d.position.set(r, l, a);
      let p = new THREE.MeshStandardMaterial({
          color: 7301732,
          roughness: 0.6,
        }),
        x = new THREE.MeshStandardMaterial({
          color: 12572906,
          transparent: !0,
          opacity: 0.16,
          roughness: 0.05,
          metalness: 0.6,
          side: THREE.DoubleSide,
          depthWrite: !1,
        }),
        m = new THREE.MeshBasicMaterial({
          color: 16773584,
        }),
        g = new THREE.MeshStandardMaterial({
          color: 15262940,
          roughness: 0.7,
        });
      if (h) {
        let [y, _, v] = h,
          b = new THREE.Mesh(new THREE.BoxGeometry(y, 0.3, _), p);
        ((b.position.y = -0.15), d.add(b));
        let w = new THREE.Mesh(new THREE.BoxGeometry(y, 4, _), x);
        ((w.position.y = 2), d.add(w));
        let E = new THREE.Mesh(new THREE.BoxGeometry(y, 0.2, _), g);
        ((E.position.y = 4.1), d.add(E));
        let C = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 8), g);
        ((C.position.y = 2), d.add(C), (d.rotation.y = -v));
      } else {
        let y = new THREE.Mesh(new THREE.RingGeometry(f - 0.5, u + 0.3, 48), p);
        ((y.rotation.x = -Math.PI / 2), d.add(y));
        let _ = new THREE.Mesh(new THREE.CylinderGeometry(u + 0.3, u + 0.6, 4.4, 48, 1, !0), x);
        ((_.position.y = 2.2), d.add(_));
        let v = new THREE.Mesh(new THREE.CylinderGeometry(f - 0.4, f - 0.4, 4.4, 24), g);
        ((v.position.y = 2.2), d.add(v));
        let b = new THREE.Mesh(new THREE.RingGeometry(f - 0.5, u + 0.6, 48), g);
        ((b.rotation.x = Math.PI / 2), (b.position.y = 4.4), d.add(b));
        let w = new THREE.Mesh(
          new THREE.TorusGeometry(u - 0.2, 0.05, 4, 48),
          new THREE.MeshStandardMaterial({
            color: 12106944,
            metalness: 0.8,
          }),
        );
        ((w.rotation.x = Math.PI / 2), (w.position.y = 1.05), d.add(w));
        let E = new THREE.Mesh(new THREE.TorusGeometry(f + 0.6, 0.06, 4, 48), m);
        ((E.rotation.x = Math.PI / 2), (E.position.y = 4.3), d.add(E));
        for (let C = 0; C < 6; C++) {
          let S = (C / 6) * Math.PI * 2,
            T = new THREE.Mesh(
              new THREE.BoxGeometry(0.25, 1.3, 0.25),
              new THREE.MeshStandardMaterial({
                color: 2771594,
              }),
            );
          (T.position.set(Math.cos(S) * (u - 0.8), 0.65, Math.sin(S) * (u - 0.8)), d.add(T));
        }
      }
      ((d.visible = !1), R.scene.add(d));
      let M = {
        k: s,
        name: o,
        x: r,
        z: a,
        y: l,
        r0: f,
        r1: u,
        fee: c,
        rect: h,
        g: d,
        exit: h ? [r, a] : [r + f + 0.8, a],
      };
      (j5.push(M),
        DOORS.push({
          x: r + 0,
          z: a + (s === 'skytree' ? 58 : s === 'tocho' ? -26 : s === 'landmark' ? 48 : s === 'marine' ? 18 : 26),
          type: 'deck',
          label: o,
          deck: M,
        }));
    };
  (n && i('tokyoTower', '\u6771\u4EAC\u30BF\u30EF\u30FC \u30E1\u30A4\u30F3\u30C7\u30C3\u30AD\uFF08150m\uFF09', n.x, n.z, 146, 3.6, 10.6, 1200),
    t &&
      (i('skytree', '\u30B9\u30AB\u30A4\u30C4\u30EA\u30FC \u5929\u671B\u30C7\u30C3\u30AD\uFF08350m\uFF09', t.x, t.z, 341, 7.5, 17.2, 2100),
      i('skytreeG', '\u30B9\u30AB\u30A4\u30C4\u30EA\u30FC \u5929\u671B\u56DE\u5ECA\uFF08450m\uFF09', t.x, t.z, 445, 6, 11.8, 1e3),
      DOORS.pop()));
  {
    let s = W.landmarks.landmarkTower,
      o = W.landmarks.marineTower;
    (s &&
      s.x !== void 0 &&
      i(
        'landmark',
        '\u6A2A\u6D5C\u30E9\u30F3\u30C9\u30DE\u30FC\u30AF\u30BF\u30EF\u30FC \u30B9\u30AB\u30A4\u30AC\u30FC\u30C7\u30F3\uFF08273m\uFF09',
        s.x,
        s.z,
        269,
        0,
        0,
        1e3,
        [36, 36, 0],
      ),
      o && i('marine', '\u6A2A\u6D5C\u30DE\u30EA\u30F3\u30BF\u30EF\u30FC \u5C55\u671B\u30D5\u30ED\u30A2\uFF08100m\uFF09', o.x, o.z, 95, 2.8, 8, 1e3));
  }
  if (e) {
    let o = Math.cos(0.2),
      r = Math.sin(0.2),
      a = e.x + o * 26 + r * 12,
      l = e.z + r * 26 - o * 12;
    i('tocho', '\u90FD\u5E81 \u5317\u5C55\u671B\u5BA4\uFF08202m\uFF09', a, l, 202, 0, 0, 0, [24, 30, 0.2]);
  }
}
function enterDeck(n) {
  let t = G.player,
    e = n.deck;
  if (Ke() > 0) {
    xe.toast('\u624B\u914D\u4E2D\u306F\u5165\u308C\u307E\u305B\u3093');
    return;
  }
  let i = (s) => {
    if (G.money < s.fee) {
      xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= s.fee),
      s.fee && gt.cash(),
      (GT.deck = s),
      (t.deck = s),
      (s.g.visible = !0),
      (t.x = s.rect ? s.x + 6 : s.x + (s.r0 + s.r1) / 2),
      (t.z = s.z),
      (t.y = s.y),
      (t.vy = 0),
      (G.cam.snap = !0),
      (G.cam.pitch = 0.05),
      xe.toast(`${s.name}\u3000\u2014 F\uFF08\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC\uFF09\u3067\u964D\u308A\u308B`),
      gt.chime());
  };
  if (e.k === 'skytree') {
    let s = j5.find((o) => o.k === 'skytreeG');
    xe.listMenu(
      '\u6771\u4EAC\u30B9\u30AB\u30A4\u30C4\u30EA\u30FC \u5165\u5834\u5238',
      [
        {
          label: '\u5929\u671B\u30C7\u30C3\u30AD\uFF08350m\uFF09',
          sub: '\xA52,100',
          color: '#5c8fe8',
          buttons: [
            {
              text: '\u4E0A\u308B',
              fn: () => i(e),
            },
          ],
        },
        {
          label: '\u5929\u671B\u30C7\u30C3\u30AD\uFF0B\u5929\u671B\u56DE\u5ECA\uFF08450m\uFF09',
          sub: '\xA53,100',
          color: '#9fc0ff',
          buttons: [
            {
              text: '\u4E0A\u308B',
              fn: () => {
                if (G.money < 3100) {
                  xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
                  return;
                }
                ((G.money -= 1e3),
                  i(
                    Object.assign(s, {
                      fee: 2100,
                    }),
                  ));
              },
            },
          ],
        },
      ],
      '\u3084\u3081\u308B',
    );
    return;
  }
  xe.listMenu(
    e.name,
    [
      {
        label: e.fee ? `\u5165\u5834\u6599 \xA5${e.fee.toLocaleString('ja-JP')}` : '\u5165\u5834\u7121\u6599',
        sub: '\u6771\u4EAC\u306E\u8857\u4E26\u307F\u3092\u4E00\u671B\u3067\u304D\u307E\u3059',
        color: '#ffd23f',
        buttons: [
          {
            text: '\u4E0A\u308B',
            fn: () => i(e),
          },
        ],
      },
    ],
    '\u3084\u3081\u308B',
  );
}
function exitDeck() {
  let n = G.player,
    t = GT.deck;
  if (!t) return;
  ((t.g.visible = !1), (GT.deck = null), (n.deck = null));
  let e = DOORS.find((i) => i.deck && (i.deck === t || (t.k === 'skytreeG' && i.deck.k === 'skytree')));
  ((n.x = e.x), (n.z = e.z + 2), (n.y = 0.2), (G.cam.snap = !0), gt.door());
}
function updDeck() {
  let n = G.player,
    t = GT.deck;
  if (!t) return null;
  if (t.rect) {
    let [i, s, o] = t.rect,
      r = Math.cos(o),
      a = Math.sin(o),
      l = (n.x - t.x) * r + (n.z - t.z) * a,
      f = -(n.x - t.x) * a + (n.z - t.z) * r;
    ((l = It(l, -i / 2 + 0.5, i / 2 - 0.5)),
      (f = It(f, -s / 2 + 0.5, s / 2 - 0.5)),
      Math.abs(l) < 3.4 &&
        Math.abs(f) < 4.4 &&
        (3.4 - Math.abs(l) < 4.4 - Math.abs(f) ? (l = Math.sign(l || 1) * 3.4) : (f = Math.sign(f || 1) * 4.4)),
      (n.x = t.x + l * r - f * a),
      (n.z = t.z + l * a + f * r));
  } else {
    let i = n.x - t.x,
      s = n.z - t.z,
      o = Math.hypot(i, s) || 1,
      r = It(o, t.r0 + 0.35, t.r1 - 0.45);
    ((n.x = t.x + (i / o) * r), (n.z = t.z + (s / o) * r));
  }
  n.y < t.y && ((n.y = t.y), (n.vy = 0), (n.onGround = !0));
  let e = t.rect ? [t.x + 4, t.z] : [t.x + t.r0 + 0.6, t.z];
  return Math.hypot(n.x - e[0], n.z - e[1]) < (t.rect ? 3.5 : 2.2) ? 'exit' : null;
}
var ea = [],
  $5 = 0,
  Y5 = 0,
  L1 = 0;
function K5(n, t, e, i) {
  let s = G.player;
  for (let o = 0; o < 28; o++) {
    let r = rt(0, 6.283),
      a = rt(60, 130),
      l = t + Math.cos(r) * a,
      f = e + Math.sin(r) * a,
      u = [];
    roadsNear(l, f, 40, u);
    let c =
      u.find((x) => !x.e.elev && x.e.kind !== 'L' && x.e.kind !== 'R') || (o > 8 && u.find((x) => !x.e.elev && x.e.kind === 'L' && x.e.len > 25));
    if (!c || Math.hypot(R.camera.position.x - c.x, R.camera.position.z - c.z) < 50) continue;
    let h = edgePos(c.e, c.s, {}),
      d = (t - c.x) * h.dx + (e - c.z) * h.dz >= 0 ? 1 : -1,
      p = newCar(n, c.x, c.z, Math.atan2(h.dx * d, h.dz * d), 'phys');
    return p
      ? ((p.y = 0.04),
        (p.ctl = 'npc'),
        (p.goal = {
          x: t,
          z: e,
        }),
        (p.siren = !0),
        (p.keep = !0),
        (p.arriveR = n === 'fire' ? 26 : 12),
        (p.resp = {
          type: n,
          t: 0,
          target: i,
          life: 0,
        }),
        (p.invuln = !1),
        ea.push(p),
        p)
      : null;
  }
  return null;
}
function onPedKilled(n) {
  $5 > 0 ||
    ea.some((t) => t.resp.type === 'ambulance') ||
    Math.hypot(n.x - G.player.x, n.z - G.player.z) > 250 ||
    (($5 = 35),
    D1.push({
      t: 4,
      p: n,
    }));
}
var D1 = [];
function onCarFire(n) {
  Y5 > 0 ||
    n.dead ||
    ea.some((t) => t.resp.type === 'fire') ||
    Math.hypot(n.x - G.player.x, n.z - G.player.z) > 250 ||
    (K5('fire', n.x, n.z, n) && (Y5 = 30));
}
function Cz(n) {
  if ((($5 -= n), (Y5 -= n), (L1 -= n), L1 <= 0 && !ea.some((t) => t.resp.type === 'fire'))) {
    L1 = 4;
    let t = nearestFire(G.player.x, G.player.z, 260);
    t && K5('fire', t.x, t.z, t) && (L1 = 30);
  }
  for (let t = D1.length - 1; t >= 0; t--) {
    let e = D1[t];
    ((e.t -= n), e.t <= 0 && (D1.splice(t, 1), e.p.dead || K5('ambulance', e.p.x, e.p.z, e.p)));
  }
  for (let t = ea.length - 1; t >= 0; t--) {
    let e = ea[t],
      i = e.resp;
    if (((i.life += n), e.removed || e.dead || i.life > 120)) {
      (e.removed || ((e.keep = !1), (e.ctl = null), (e.siren = !1)), ea.splice(t, 1));
      continue;
    }
    if (e.ctl === 'player') {
      ea.splice(t, 1);
      continue;
    }
    if (
      (!e.arrived &&
        !i.done &&
        ((i.life > (i.type === 'fire' ? 9 : 30) &&
          Math.hypot(e.goal.x - e.x, e.goal.z - e.z) < (i.type === 'fire' ? 115 : 90) &&
          Math.abs(e.v) < 3) ||
          i.life > 45) &&
        (e.arrived = !0),
      e.arrived && !i.done)
    ) {
      if (
        ((e.siren = !1),
        (i.t += n),
        (e.flash = !0),
        i.type === 'ambulance' && i.t > 4 && i.target && i.target.killed && !i.target.dead && Math.hypot(i.target.x - e.x, i.target.z - e.z) < 160)
      ) {
        let s = i.target;
        ((s.killed = !1),
          (s.hp = 40),
          (s.state = 'down'),
          (s.t = 1.5),
          (i.done = !0),
          xt('toast', '\u6551\u6025\u968A\u304C\u8CA0\u50B7\u8005\u3092\u6551\u8B77\u3057\u305F'));
      }
      if (i.type === 'fire') {
        if (
          (i.crew || ((i.crew = deployFiremen(e)), xt('toast', '\u6D88\u9632\u968A\u304C\u6D88\u706B\u306B\u3042\u305F\u3063\u3066\u3044\u308B')),
          i.t > 2)
        ) {
          let s = [];
          carsNear(e.x, e.z, 30, s);
          for (let o of s) o.burn > 0 && !o.dead && ((o.burn = 0), (o.hp = 5));
        }
        if (((i.done = i.t > 8 && !nearestFire(e.x, e.z, 70) && i.crew.every((s) => s.dead)), i.t > 90)) {
          i.done = !0;
          for (let s of i.crew) s.dead = !0;
        }
      }
      i.t > 12 && i.type !== 'fire' && (i.done = !0);
    }
    if (i.done && ((i.leave = (i.leave || 0) + n), !i.left)) {
      ((i.left = !0), (e.arrived = !1));
      let s = rt(0, 6.28);
      ((e.goal = {
        x: e.x + Math.cos(s) * 600,
        z: e.z + Math.sin(s) * 600,
      }),
        (e.siren = !1));
    }
  }
}
var W5 = 0;
function zz(n) {
  if (((W5 -= n), W5 > 0)) return;
  W5 = 1.5;
  let t = G.player;
  if (t.mode === 'plane' || t.mode === 'heli' || t.interior || t.deck) return;
  let e = 0;
  for (let M of G.cars) M.parkedBike && !M.removed && Math.hypot(M.x - t.x, M.z - t.z) < 180 && e++;
  if (e >= 7) return;
  let i = rt(0, 6.283),
    s = rt(50, 150),
    o = t.x + Math.cos(i) * s,
    r = t.z + Math.sin(i) * s,
    a = [];
  roadsNear(o, r, 30, a);
  let l = a.find((M) => !M.e.elev && (M.e.kind === 'L' || M.e.kind === 'B') && M.e.len > 20);
  if (!l) return;
  let f = l.e,
    u = edgePos(f, l.s, {}),
    c = Math.random() < 0.5 ? 1 : -1,
    h = f.hw + 0.7,
    d = u.x + u.dz * h * c,
    p = u.z - u.dx * h * c;
  if (isWaterAt(d, p)) return;
  let x = [];
  if ((carsNear(d, p, 4, x), x.length)) return;
  let m = Be(['scooter', 'scooter', 'bicycle', 'bicycle', 'moto', 'scooter']),
    g = newCar(m, d, p, Math.atan2(u.dx, u.dz) + (Math.random() < 0.5 ? 0 : Math.PI), 'phys');
  g && ((g.y = 0.04), (g.parked = !0), (g.driver = !1), (g.parkedBike = !0));
}
var Xi = {
  t: 90,
  cur: null,
};
function debugEvent() {
  return ((Xi.cur = null), (Xi.t = 0), U6(), Xi.cur && Xi.cur.k);
}
function U6() {
  let n = G.player;
  if (!(Xi.cur || Ke() > 0 || n.interior || n.deck || (n.mode !== 'foot' && n.mode !== 'car') || G.noEvents))
    if (Math.random() < 0.55) {
      let t = G.peds.filter(
        (s) => s.state === 'walk' && s.kind !== 4 && Math.hypot(s.x - n.x, s.z - n.z) > 25 && Math.hypot(s.x - n.x, s.z - n.z) < 70,
      );
      if (!t.length) return;
      let e = Be(t),
        i = spawnPedAt(e.x + 1, e.z + 1, 'flee', 0);
      if (!i) return;
      ((i.thief = !0),
        (i.t = 999),
        (i.v = 1),
        (e.state = 'idle'),
        (e.t = 15),
        (e.yaw = Math.atan2(i.x - e.x, i.z - e.z)),
        (Xi.cur = {
          k: 'thief',
          p: i,
          t: 90,
        }),
        xt(
          'toast',
          '\u300C\u3072\u3063\u305F\u304F\u308A\u3088\uFF01\u8AB0\u304B\u6355\u307E\u3048\u3066\uFF01\u300D\u2014 \u8D64\u3044\u30DE\u30FC\u30AB\u30FC\u306E\u7537\u3092\u6B62\u3081\u308D',
        ),
        gt.blip());
    } else {
      let t = G.cars.filter(
        (o) =>
          o.mode === 'ai' &&
          !o.td.bike &&
          o.t !== 'bus' &&
          !isCop(o) &&
          Math.hypot(o.x - n.x, o.z - n.z) > 60 &&
          Math.hypot(o.x - n.x, o.z - n.z) < 180,
      );
      if (!t.length) return;
      let e = Be(t);
      (toPhys(e), (e.ctl = 'npc'), (e.keep = !0), (e.robber = !0), (e.boost = 1.1));
      let i = rt(0, 6.28);
      e.goal = {
        x: e.x + Math.cos(i) * 1500,
        z: e.z + Math.sin(i) * 1500,
      };
      let s = [];
      for (let o = 0; o < 2; o++) {
        let r = newCar('police', e.x - Math.sin(e.yaw) * (14 + o * 10), e.z - Math.cos(e.yaw) * (14 + o * 10), e.yaw, 'phys');
        r &&
          ((r.y = 0.04),
          (r.ctl = 'npc'),
          (r.siren = !0),
          (r.keep = !0),
          (r.ai = (a, l) => {
            ((a.goal = {
              x: e.x,
              z: e.z,
            }),
              (a.arrived = !1));
            let f = npcDrive(a, l);
            return Math.hypot(e.x - a.x, e.z - a.z) < 12 ? [1, f[1], 0] : f;
          }),
          s.push(r));
      }
      ((Xi.cur = {
        k: 'robber',
        c: e,
        chasers: s,
        t: 150,
      }),
        xt(
          'toast',
          '\u5F37\u76D7\u306E\u9003\u8D70\u8ECA\u304C\u30D1\u30C8\u30AB\u30FC\u306B\u8FFD\u308F\u308C\u3066\u3044\u308B\uFF01\u8ECA\u3092\u6B62\u3081\u308C\u3070\u61F8\u8CDE\u91D1 \xA58,000',
        ),
        gt.blip());
    }
}
function fh(n, t) {
  let e = Xi.cur;
  if (e) {
    if (e.chasers) for (let i of e.chasers) i.removed || ((i.ctl = null), (i.siren = !1), (i.keep = !1), (i.ai = null));
    (e.c && !e.c.removed && ((e.c.keep = !1), e.c.ctl === 'npc' && (e.c.ctl = null)),
      t && ((G.money += t), gt.cash()),
      n && xt('toast', n),
      (Xi.cur = null),
      (Xi.t = rt(150, 260)));
  }
}
function kz(n) {
  ((Xi.t -= n), !Xi.cur && Xi.t <= 0 && ((Xi.t = 30), U6()));
  let t = Xi.cur;
  if (!t) return;
  t.t -= n;
  let e = G.player;
  if (t.k === 'thief') {
    let i = t.p;
    (G.blips.push({
      x: i.x,
      z: i.z,
      col: '#ff3030',
    }),
      i.dead || Math.hypot(i.x - e.x, i.z - e.z) > 220 || t.t <= 0
        ? fh('\u3072\u3063\u305F\u304F\u308A\u72AF\u306B\u9003\u3052\u3089\u308C\u305F\u2026')
        : i.state === 'down'
          ? (dropCash(i.x, i.z, Math.round(rt(150, 400)) * 10),
            (i.thief = !1),
            fh('\u3072\u3063\u305F\u304F\u308A\u72AF\u3092\u6B62\u3081\u305F\uFF01\u843D\u3061\u305F\u30D0\u30C3\u30B0\u3092\u62FE\u304A\u3046'))
          : i.state === 'flee' && (i.t = 999));
  } else if (t.k === 'robber') {
    let i = t.c;
    if (
      (i.removed ||
        G.blips.push({
          x: i.x,
          z: i.z,
          col: '#ff3030',
        }),
      i.removed || t.t <= 0 || Math.hypot(i.x - e.x, i.z - e.z) > 600)
    )
      fh('\u9003\u8D70\u8ECA\u306F\u9003\u3052\u5207\u3063\u3066\u3057\u307E\u3063\u305F\u2026');
    else if (i.ctl === 'player') fh('\u9003\u8D70\u8ECA\u3092\u596A\u3063\u305F\uFF01\uFF08\u61F8\u8CDE\u91D1\u306A\u3057\uFF09');
    else if (i.burn > 0 || i.dead || i.hp < 25)
      ((i.ctl = null), fh('\u9003\u8D70\u8ECA\u3092\u6B62\u3081\u305F\uFF01\u61F8\u8CDE\u91D1 \xA58,000', 8e3));
    else if (i.arrived) {
      let s = rt(0, 6.28);
      ((i.goal = {
        x: i.x + Math.cos(s) * 1500,
        z: i.z + Math.sin(s) * 1500,
      }),
        (i.arrived = !1));
    }
  }
}
function nearGarage() {
  let n = G.player;
  if (n.mode !== 'car' || !n.car || Math.abs(n.car.v) > 3) return null;
  for (let t of N6) if (Math.hypot(t.x - n.car.x, t.z - n.car.z) < 9) return t;
  return null;
}
function openGarage(n) {
  let t = G.player,
    e = t.car;
  if (!e) return;
  let i = Math.round(100 - It(e.hp, 0, 100)),
    s = 200 + i * 30,
    o = (f, u) => (G.money < f ? (xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093'), !1) : ((G.money -= f), gt.cash(), u(), !0)),
    r = [
      ['\u30DB\u30EF\u30A4\u30C8', 15921904],
      ['\u30D6\u30E9\u30C3\u30AF', 1118740],
      ['\u30B7\u30EB\u30D0\u30FC', 12172480],
      ['\u30EC\u30C3\u30C9', 13111342],
      ['\u30D6\u30EB\u30FC', 1990574],
      ['\u30A4\u30A8\u30ED\u30FC', 15909424],
      ['\u30B0\u30EA\u30FC\u30F3', 3115598],
      ['\u30AA\u30EC\u30F3\u30B8', 15231511],
      ['\u30D1\u30FC\u30D7\u30EB', 5909130],
      ['\u30DE\u30C3\u30C8\u30B0\u30EC\u30FC', 4869458],
    ],
    a = [
      {
        label: '\u4FEE\u7406\u30FB\u6D17\u8ECA',
        sub:
          e.hp >= 99
            ? '\u4FEE\u7406\u306E\u5FC5\u8981\u306F\u3042\u308A\u307E\u305B\u3093'
            : `\u640D\u50B7 ${i}% \u30FB \xA5${s.toLocaleString('ja-JP')}`,
        color: '#3ddc84',
        buttons:
          e.hp >= 99
            ? []
            : [
                {
                  text: '\u4FEE\u7406',
                  fn: () =>
                    o(s, () => {
                      ((e.hp = 100), (e.burn = 0), xe.toast('\u4FEE\u7406\u5B8C\u4E86'), l());
                    }),
                },
              ],
      },
      {
        label: '\u5168\u5857\u88C5\uFF08\u624B\u914D\u5EA6\u3082\u6D88\u305B\u308B\uFF09',
        sub: '\xA51,500',
        color: '#ff9f1a',
        buttons: r.slice(0, 5).map(([f, u]) => ({
          text: f,
          fn: () => o(1500, () => L6(e, u)),
        })),
      },
      {
        label: '\u5168\u5857\u88C5\uFF08\u3064\u3065\u304D\uFF09',
        sub: '\xA51,500',
        color: '#ff9f1a',
        buttons: r.slice(5).map(([f, u]) => ({
          text: f,
          fn: () => o(1500, () => L6(e, u)),
        })),
      },
      {
        label: `\u30A8\u30F3\u30B8\u30F3\u30C1\u30E5\u30FC\u30F3\uFF08\u73FE\u5728 Lv${Math.round(((e.eng || 1) - 1) / 0.12)}\uFF09`,
        sub: '\u52A0\u901F\u3068\u6700\u9AD8\u901F\u304C\u4E0A\u304C\u308B',
        color: '#e5402b',
        buttons: [1, 2, 3]
          .filter((f) => f > Math.round(((e.eng || 1) - 1) / 0.12))
          .map((f) => ({
            text: `Lv${f} \xA5${(f * 6e3).toLocaleString('ja-JP')}`,
            fn: () =>
              o(f * 6e3, () => {
                ((e.eng = 1 + f * 0.12), xe.toast(`\u30A8\u30F3\u30B8\u30F3 Lv${f} \u306B\u5F37\u5316`), l());
              }),
          })),
      },
      {
        label: `\u30DC\u30C7\u30A3\u88DC\u5F37\uFF08\u73FE\u5728 Lv${Math.round((e.armor || 0) / 0.15)}\uFF09`,
        sub: '\u885D\u7A81\u3084\u9283\u6483\u306E\u30C0\u30E1\u30FC\u30B8\u3092\u8EFD\u6E1B',
        color: '#4a8bff',
        buttons: [1, 2, 3]
          .filter((f) => f > Math.round((e.armor || 0) / 0.15))
          .map((f) => ({
            text: `Lv${f} \xA5${(f * 5e3).toLocaleString('ja-JP')}`,
            fn: () =>
              o(f * 5e3, () => {
                ((e.armor = f * 0.15), xe.toast(`\u30DC\u30C7\u30A3\u88DC\u5F37 Lv${f}`), l());
              }),
          })),
      },
      {
        label: '\u30DE\u30A4\u30AB\u30FC\u3068\u3057\u3066\u767B\u9332',
        sub: GT.myCar
          ? `\u73FE\u5728\uFF1A${CT[GT.myCar.t].name}`
          : '\u30B9\u30DE\u30DB\u306E\u30E1\u30AB\u30CB\u30C3\u30AF\u3067\u3044\u3064\u3067\u3082\u547C\u3073\u51FA\u305B\u308B',
        color: '#c46cff',
        buttons: [
          {
            text: '\u767B\u9332',
            fn: () => {
              ((GT.myCar = {
                t: e.t,
                color: e.color,
                eng: e.eng || 1,
                armor: e.armor || 0,
              }),
                (e.mine = !0),
                xe.toast(`${e.td.name}\u3092\u30DE\u30A4\u30AB\u30FC\u306B\u767B\u9332\u3057\u305F`),
                xe.save());
            },
          },
        ],
      },
    ],
    l = () => setTimeout(() => openGarage(n), 50);
  xe.listMenu(`${n.name}\uFF08\u8ECA\u306E\u6539\u9020\u30FB\u4FEE\u7406\uFF09`, a, '\u5E97\u3092\u51FA\u308B');
}
function L6(n, t) {
  if ((setColor(n, t), GT.myCar && n.mine && (GT.myCar.color = t), Ke() > 0 && !(G.policeSeesNow && G.policeSeesNow()))) {
    ((G.heat = 0.5),
      (G.evade = 0),
      xe.toast('\u5857\u88C5\u3067\u8DB3\u304C\u3064\u304B\u306A\u304F\u306A\u3063\u305F\uFF08\u624B\u914D\u5EA6\u30AF\u30EA\u30A2\uFF09'));
    return;
  }
  xe.toast('\u5857\u88C5\u5B8C\u4E86');
}
function deliverCar() {
  let n = G.player;
  if (!GT.myCar) {
    xe.toast('\u30DE\u30A4\u30AB\u30FC\u304C\u672A\u767B\u9332\u3067\u3059\uFF08\u6539\u9020\u30B7\u30E7\u30C3\u30D7\u3067\u767B\u9332\uFF09');
    return;
  }
  if (n.mode !== 'foot' || n.interior || n.deck) {
    xe.toast('\u5916\u3092\u6B69\u3044\u3066\u3044\u308B\u3068\u304D\u306B\u547C\u3079\u307E\u3059');
    return;
  }
  let t = G.cars.find((l) => l.mine && !l.removed);
  if (t && !t.dead && Math.hypot(t.x - n.x, t.z - n.z) < 150) {
    xe.toast('\u30DE\u30A4\u30AB\u30FC\u306F\u8FD1\u304F\u306B\u3042\u308A\u307E\u3059');
    return;
  }
  t && ((t.keep = !1), (t.mine = !1));
  let e = [];
  roadsNear(n.x, n.z, 60, e);
  let i = e.filter((l) => !l.e.elev).sort((l, f) => l.d - f.d)[0];
  if (!i) {
    xe.toast('\u8FD1\u304F\u306B\u9053\u8DEF\u304C\u3042\u308A\u307E\u305B\u3093');
    return;
  }
  let s = i.e,
    o = edgePos(s, i.s, {}),
    r = s.hw - 1.3,
    a = newCar(GT.myCar.t, o.x + o.dz * r, o.z - o.dx * r, Math.atan2(o.dx, o.dz), 'phys', GT.myCar.color);
  if (!a) {
    xe.toast('\u3044\u307E\u306F\u547C\u3079\u307E\u305B\u3093');
    return;
  }
  ((a.y = 0.04),
    (a.driver = !1),
    (a.parked = !0),
    (a.keep = !0),
    (a.mine = !0),
    (a.eng = GT.myCar.eng),
    (a.armor = GT.myCar.armor),
    xe.toast('\u30E1\u30AB\u30CB\u30C3\u30AF\u300C\u30DE\u30A4\u30AB\u30FC\u3092\u9053\u8DEF\u8107\u306B\u5C4A\u3051\u307E\u3057\u305F\u3088\u300D'),
    gt.tone(1200, 0.08, 0.1, 'square'));
}
var mr = null,
  Iz = [
    ['\u5730\u56F3', '\u{1F5FA}\uFE0F', 'map'],
    ['\u30BF\u30AF\u30B7\u30FC', '\u{1F695}', 'taxi'],
    ['\u30E1\u30AB\u30CB\u30C3\u30AF', '\u{1F527}', 'mech'],
    ['\u4E0D\u52D5\u7523', '\u{1F3E2}', 'estate'],
    ['\u30E9\u30B8\u30AA', '\u{1F4FB}', 'radio'],
    ['\u9280\u884C', '\u{1F4B4}', 'bank'],
    ['\u6B66\u5668', '\u{1F52B}', 'arms'],
    ['\u30C1\u30FC\u30C8', '\u2328\uFE0F', 'cheat'],
    ['\u30AB\u30E1\u30E9', '\u{1F4F7}', 'camera'],
  ];
function Lz() {
  let n = document.createElement('style');
  ((n.textContent = `#phone{position:fixed;right:calc(24px + env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));width:250px;height:440px;border-radius:30px;background:#0b0d12;border:3px solid #2a2e36;box-shadow:0 18px 50px rgba(0,0,0,.6);z-index:5;padding:14px 12px;box-sizing:border-box;display:flex;flex-direction:column;pointer-events:auto;transition:transform .25s;font-family:var(--f-b)}
#phone[hidden]{display:none}#phone .top{display:flex;justify-content:space-between;font:800 12px var(--f-b);color:#cfd6e0;padding:0 8px 8px}#phone .wall{flex:1;border-radius:18px;background:linear-gradient(160deg,#1b3a6b,#0d1830 60%,#3a1840);padding:14px 10px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px 6px;align-content:start}
#phone .app{display:flex;flex-direction:column;align-items:center;gap:4px;font:800 10px var(--f-b);color:#fff;background:none;border:0;padding:0}#phone .app i{font-style:normal;width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}#phone .app:active i,#phone .app:hover i{background:rgba(255,210,63,.45)}
#phone .home{margin:10px auto 0;width:44px;height:6px;border-radius:3px;background:#555;border:0}body.touch #phone{right:50%;transform:translateX(50%);bottom:calc(8px + env(safe-area-inset-bottom,0px));height:400px}
#wpnHud{position:absolute;right:calc(16px + env(safe-area-inset-right,0px));top:calc(112px + env(safe-area-inset-top,0px));text-align:right;font:22px/1 var(--f-d);text-shadow:0 2px 0 #000;display:none}#wpnHud small{font-size:14px;color:var(--mute)}#wpnHud em{display:block;font:800 12px var(--f-b);font-style:normal;color:#ffd23f;margin-bottom:3px}
body.touch #wpnHud{top:calc(200px + env(safe-area-inset-top,0px))}#xhair{position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none;z-index:2;display:none}#xhair:before,#xhair:after{content:'';position:absolute;background:#fff;box-shadow:0 0 2px #000}#xhair:before{left:10px;top:0;width:2px;height:22px}#xhair:after{top:10px;left:0;height:2px;width:22px}#xhair.lock:before,#xhair.lock:after{background:#ff4040}
.bar.arm i{background:#3a8bff}#hurt{position:fixed;inset:0;pointer-events:none;z-index:2;box-shadow:inset 0 0 120px rgba(200,0,0,.0);transition:box-shadow .2s}
#wheel{position:fixed;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}#wheel[hidden]{display:none}#wheel .ring{position:relative;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(10,12,18,.2) 30%,rgba(10,12,18,.82) 31%);border:2px solid rgba(255,255,255,.15)}
#wheel button{position:absolute;width:92px;height:62px;margin:-31px 0 0 -46px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);font:800 12px/1.25 var(--f-b);color:#fff}#wheel button.sel{border-color:#ffd23f;background:rgba(255,210,63,.25)}#wheel button[disabled]{opacity:.25}#wheel button small{display:block;color:#aab;font-weight:600;font-size:10px}#wheel .mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:800 13px var(--f-b);text-align:center;color:#ffd23f}
#radioHud{position:absolute;left:calc(14px + env(safe-area-inset-left,0px));bottom:calc(260px + env(safe-area-inset-bottom,0px));font:800 14px var(--f-b);background:var(--glass2);border:1px solid var(--rule);padding:6px 14px;border-radius:999px;opacity:0;transition:opacity .4s}#radioHud.on{opacity:1}`),
    document.head.appendChild(n),
    (mr = document.createElement('div')),
    (mr.id = 'phone'),
    (mr.hidden = !0),
    (mr.className = 'tap'),
    (mr.innerHTML = `<div class="top"><span id="phClk">12:00</span><b>iFruit</b><span>\u{1F4F6} \u{1F50B}</span></div><div class="wall">${Iz.map(([u, c, h]) => `<button class="app" data-k="${h}"><i>${c}</i>${u}</button>`).join('')}</div><button class="home" id="phHome" aria-label="\u9589\u3058\u308B"></button>`),
    document.body.appendChild(mr),
    mr.addEventListener('click', (u) => {
      let c = u.target.closest('.app');
      if (c) {
        Dz(c.dataset.k);
        return;
      }
      u.target.id === 'phHome' && togglePhone(!1);
    }));
  let t = document.getElementById('hud'),
    e = document.createElement('div');
  ((e.id = 'wpnHud'), t.appendChild(e));
  let i = document.createElement('div');
  ((i.id = 'xhair'), document.body.appendChild(i));
  let s = document.createElement('div');
  ((s.id = 'hurt'), document.body.appendChild(s));
  let o = document.createElement('div');
  ((o.id = 'radioHud'), t.appendChild(o));
  let r = document.getElementById('mm'),
    a = document.createElement('div');
  ((a.className = 'bar arm'), (a.id = 'armW'), (a.innerHTML = '<i id="armBar"></i>'), r.insertBefore(a, document.getElementById('carBarW')));
  let l = document.createElement('div');
  ((l.id = 'wheel'),
    (l.hidden = !0),
    (l.className = 'tap'),
    (l.innerHTML = '<div class="ring"><div class="mid" id="whMid">\u6B66\u5668</div></div>'),
    document.body.appendChild(l));
  let f = l.querySelector('.ring');
  (ORDER.forEach((u, c) => {
    let h = (c / ORDER.length) * Math.PI * 2 - Math.PI / 2,
      d = document.createElement('button');
    ((d.dataset.id = u), (d.style.left = 170 + Math.cos(h) * 122 + 'px'), (d.style.top = 170 + Math.sin(h) * 122 + 'px'), f.appendChild(d));
  }),
    l.addEventListener('click', (u) => {
      let c = u.target.closest('button');
      (c && !c.disabled && select(c.dataset.id), toggleWheel(!1));
    }));
}
function togglePhone(n) {
  mr && ((GT.phone = n ?? !GT.phone), (mr.hidden = !GT.phone), GT.phone && (gt.tone(1400, 0.05, 0.08, 'sine'), xe.exitLock && xe.exitLock()));
}
function toggleWheel(n) {
  let t = document.getElementById('wheel'),
    e = n ?? t.hidden;
  if (((t.hidden = !e), (GT.wheel = e), !!e)) {
    xe.exitLock && xe.exitLock();
    for (let i of t.querySelectorAll('button')) {
      let s = i.dataset.id,
        o = WPN[s],
        r = owned(s);
      ((i.disabled = !r),
        i.classList.toggle('sel', INV.cur === s),
        (i.innerHTML = `${o.name}<small>${r ? (isGun(s) ? totalAmmo(s) + ' \u767A' : o.throw ? '\xD7' + (INV.ammo[s] || 0) : '\u8FD1\u63A5') : '\u672A\u6240\u6301'}</small>`));
    }
  }
}
function Dz(n) {
  let t = G.player;
  if ((gt.tone(1e3, 0.04, 0.06, 'sine'), n === 'map')) (togglePhone(!1), xe.pause(!0));
  else if (n === 'taxi') (togglePhone(!1), xe.callTaxi());
  else if (n === 'mech') (togglePhone(!1), deliverCar());
  else if (n === 'camera') (togglePhone(!1), xe.photo());
  else if (n === 'radio')
    xe.listMenu(
      '\u30E9\u30B8\u30AA',
      RADIO.map((e, i) => ({
        label: e[0],
        sub: e[1],
        color: e[2],
        buttons: [
          {
            text: GT.radio === i ? '\u518D\u751F\u4E2D' : '\u9078\u3076',
            fn: () => setRadio(i),
          },
        ],
      })),
      '\u9589\u3058\u308B',
    );
  else if (n === 'estate')
    xe.listMenu(
      '\u30C0\u30A4\u30CA\u30DF\u30C3\u30AF8 \u4E0D\u52D5\u7523',
      PROPS.map((e) => ({
        label: e.name,
        sub: GT.props[e.k]
          ? '\u6240\u6709\u4E2D' + (e.income ? `\u3000\u53CE\u5165 \xA5${e.income.toLocaleString('ja-JP')}/\u65E5` : '')
          : `\xA5${e.price.toLocaleString('ja-JP')}${e.income ? `\u3000\u53CE\u5165 \xA5${e.income.toLocaleString('ja-JP')}/\u65E5` : ''}${e.garage ? '\u3000\u30AC\u30EC\u30FC\u30B8\u4ED8\u304D' : ''}`,
        color: GT.props[e.k] ? '#3ddc84' : '#ffd23f',
        buttons: GT.props[e.k]
          ? [
              {
                text: '\u5730\u56F3\u306B\u8868\u793A',
                fn: () => {
                  ((G.waypoint = [e.x, e.z]), xt('waypoint'), xe.toast(`${e.name} \u3092\u76EE\u7684\u5730\u306B\u8A2D\u5B9A`));
                },
              },
            ]
          : [
              {
                text: '\u8CFC\u5165',
                fn: () => O6(e),
              },
              {
                text: '\u898B\u306B\u884C\u304F',
                fn: () => {
                  ((G.waypoint = [e.x, e.z]), xt('waypoint'));
                },
              },
            ],
      })),
      '\u9589\u3058\u308B',
    );
  else if (n === 'bank') {
    let e = PROPS.filter((i) => GT.props[i.k]).reduce((i, s) => i + s.income, 0);
    xe.listMenu(
      '\u30D5\u30EA\u30FC\u30B5\u9280\u884C',
      [
        {
          label: `\u53E3\u5EA7\u6B8B\u9AD8 \xA5${Math.floor(G.money).toLocaleString('ja-JP')}`,
          sub: `\u7269\u4EF6\u53CE\u5165 \xA5${e.toLocaleString('ja-JP')}/\u65E5\uFF08\u6BCE\u671D8\u6642\uFF09`,
          color: '#3ddc84',
          buttons: [],
        },
        {
          label: `\u6240\u6709\u7269\u4EF6 ${Object.keys(GT.props).length} \u4EF6`,
          sub: `\u5012\u3057\u305F\u76F8\u624B ${G.stats.kills || 0} \u4EBA\u30FB\u8D70\u884C ${((G.stats.distance || 0) / 1e3).toFixed(1)} km`,
          color: '#4a8bff',
          buttons: [],
        },
      ],
      '\u9589\u3058\u308B',
    );
  } else
    n === 'arms'
      ? xe.listMenu(
          '\u6B66\u5668\u30FB\u5F3E\u85AC\uFF08\u624B\u6301\u3061\uFF09',
          ORDER.filter((e) => owned(e)).map((e) => ({
            label: WPN[e].name,
            sub: isGun(e) ? `\u5F3E ${totalAmmo(e)}` : WPN[e].throw ? `\xD7${INV.ammo[e] || 0}` : '\u8FD1\u63A5',
            color: '#ff9f1a',
            buttons: [
              {
                text: '\u88C5\u5099',
                fn: () => select(e),
              },
            ],
          })),
          '\u9589\u3058\u308B',
        )
      : n === 'cheat' &&
        xe.listMenu(
          '\u30C1\u30FC\u30C8\u30B3\u30FC\u30C9\uFF08\u904A\u3073\u7528\uFF09',
          [
            {
              label: '\u4F53\u529B\u30FB\u30A2\u30FC\u30DE\u30FC\u5168\u56DE\u5FA9',
              sub: 'TURTLE',
              color: '#3ddc84',
              buttons: [
                {
                  text: '\u5165\u529B',
                  fn: () => {
                    ((t.hp = 100), (t.armor = 100), xe.toast('\u30C1\u30FC\u30C8\u6709\u52B9\uFF1A\u5168\u56DE\u5FA9'));
                  },
                },
              ],
            },
            {
              label: '\u6B66\u5668\u30BB\u30C3\u30C8',
              sub: 'TOOLUP',
              color: '#ff9f1a',
              buttons: [
                {
                  text: '\u5165\u529B',
                  fn: () => {
                    for (let e of ['bat', 'pistol', 'smg', 'shotgun', 'rifle', 'grenade']) giveWeapon(e);
                    xe.toast('\u30C1\u30FC\u30C8\u6709\u52B9\uFF1A\u6B66\u5668\u30BB\u30C3\u30C8');
                  },
                },
              ],
            },
            {
              label: '\u624B\u914D\u5EA6\u3092\u4E0B\u3052\u308B / \u4E0A\u3052\u308B',
              sub: 'LAWYERUP / FUGITIVE',
              color: '#4a8bff',
              buttons: [
                {
                  text: '\u4E0B\u3052\u308B',
                  fn: () => {
                    ((G.heat = 0), xe.toast('\u30C1\u30FC\u30C8\u6709\u52B9\uFF1A\u624B\u914D\u5EA6\u30AF\u30EA\u30A2'));
                  },
                },
                {
                  text: '\u4E0A\u3052\u308B',
                  fn: () => {
                    G.forceStars && G.forceStars(Math.min(5, Ke() + 1));
                  },
                },
              ],
            },
            {
              label: '\u4E57\u308A\u7269\u3092\u51FA\u73FE',
              sub: 'ROCKET / COMET / BUZZOFF',
              color: '#e5402b',
              buttons: [
                {
                  text: '\u30D0\u30A4\u30AF',
                  fn: () => X5('moto'),
                },
                {
                  text: '\u30B9\u30FC\u30D1\u30FC\u30AB\u30FC',
                  fn: () => X5('super'),
                },
                {
                  text: 'GT',
                  fn: () => X5('sport'),
                },
              ],
            },
          ],
          '\u9589\u3058\u308B',
        );
}
function X5(n) {
  let t = G.player;
  if (t.mode !== 'foot' || t.interior || t.deck) return;
  let e = Math.sin(t.yaw),
    i = Math.cos(t.yaw),
    s = newCar(n, t.x + e * 4, t.z + i * 4, t.yaw + Math.PI / 2, 'phys');
  s && ((s.y = 0.04), (s.driver = !1), (s.parked = !0), xe.toast(`${s.td.name}\u304C\u51FA\u73FE`));
}
function O6(n) {
  if (G.money < n.price) {
    xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
    return;
  }
  ((G.money -= n.price),
    (GT.props[n.k] = !0),
    gt.cash(),
    n.door && ((n.door.type = 'home'), (n.door.label = n.name)),
    xe.toast(`${n.name} \u3092\u8CFC\u5165\u3057\u305F\uFF01\u30BB\u30FC\u30D6\u5730\u70B9\u3068\u3057\u3066\u4F7F\u3048\u307E\u3059`),
    xe.save());
}
var RADIO = [
    ['\u30E9\u30B8\u30AA OFF', '\u9759\u304B\u306B\u8D70\u308B', '#555'],
    ['TOKYO HITS 81.3', 'J-POP\u30FB\u30A2\u30A4\u30C9\u30EB', '#ff4fa0'],
    ['\u30B8\u30E3\u30BA\u30FB\u30C8\u30FC\u30AD\u30E7\u30FC 88.1', '\u591C\u306E\u30B9\u30A6\u30A3\u30F3\u30B0', '#c9a33a'],
    ['\u30ED\u30C3\u30AF\u30FB\u30B7\u30E5\u30C8\u30FC 76.5', '\u30AE\u30BF\u30FC\u30ED\u30C3\u30AF', '#e5402b'],
    ['NEON WAVE 90.2', '\u30B7\u30F3\u30BB\u30A6\u30A7\u30FC\u30D6', '#7a5aff'],
    ['\u6F14\u6B4C\u30B9\u30C6\u30FC\u30B7\u30E7\u30F3 79.0', '\u3053\u3076\u3057\u306E\u304D\u3044\u305F\u540D\u66F2', '#2f8a4e'],
    ['\u30B7\u30E5\u30C8\u30FC\u30FB\u30CB\u30E5\u30FC\u30B9 82.5', '\u4EA4\u901A\u60C5\u5831\u30FB\u30CB\u30E5\u30FC\u30B9', '#4a8bff'],
  ],
  uh = 0;
function setRadio(n) {
  ((GT.radio = ((n % RADIO.length) + RADIO.length) % RADIO.length), (G.settings.radio = GT.radio), (gt.station = GT.radio));
  let t = document.getElementById('radioHud');
  t && ((t.textContent = '\u{1F4FB} ' + RADIO[GT.radio][0]), t.classList.add('on'), (uh = 2.5));
}
var Nz = [
    '\u9996\u90FD\u9AD8\u901F \u90FD\u5FC3\u74B0\u72B6\u7DDA\u306F\u5916\u56DE\u308A \u971E\u304C\u95A2\u4ED8\u8FD1\u3067\u6E0B\u6EDE 2\u30AD\u30ED',
    '\u4ECA\u65E5\u306E\u6771\u4EAC\u306F \u304A\u304A\u3080\u306D\u6674\u308C \u591C\u306F\u6240\u306B\u3088\u308A\u96E8',
    '\u6E0B\u8C37\u30B9\u30AF\u30E9\u30F3\u30D6\u30EB\u4EA4\u5DEE\u70B9\u3067 \u8B0E\u306E\u30C9\u30EA\u30D5\u30C8\u8ECA\u4E21\u304C\u76EE\u6483\u3055\u308C\u3066\u3044\u307E\u3059',
    '\u6771\u4EAC\u30B9\u30AB\u30A4\u30C4\u30EA\u30FC \u672C\u65E5\u306E\u5929\u671B\u30C7\u30C3\u30AD\u306F\u898B\u901A\u3057\u826F\u597D',
    '\u6E7E\u5CB8\u7DDA \u53F0\u5834\u4ED8\u8FD1\u3067 \u8B66\u5BDF\u304C\u691C\u554F\u3092\u5B9F\u65BD\u4E2D',
    '\u5927\u4E95\u7AF6\u99AC \u4ECA\u591C\u306E\u30E1\u30A4\u30F3\u30EC\u30FC\u30B9\u306F\u6CE2\u4E71\u306E\u4E88\u611F',
    '\u7FBD\u7530\u7A7A\u6E2F \u56FD\u5185\u7DDA\u306F \u5B9A\u523B\u901A\u308A\u904B\u822A\u3057\u3066\u3044\u307E\u3059',
    '\u79CB\u8449\u539F\u3067 \u9650\u5B9A\u30D5\u30A3\u30AE\u30E5\u30A2\u3092\u6C42\u3081\u308B \u9577\u3044\u884C\u5217',
  ],
  q5 = 8;
function Uz(n) {
  let t = G.player;
  GT.radio !== 6 ||
    !(t.mode === 'car' || t.mode === 'boat') ||
    !G.settings.music ||
    ((q5 -= n), q5 <= 0 && ((q5 = rt(14, 22)), xt('toast', '\u{1F4FB} ' + Be(Nz))));
}
function initGTA(n) {
  ((xe = n), Lz(), Rz());
  for (let [r, a, l] of Tz) {
    let [f, u] = B5(r, a),
      c = V5(f, u, 'ARMS-NATION', `\u30A2\u30FC\u30E0\u30BA\u30FB\u30CD\u30FC\u30B7\u30E7\u30F3 ${l}\u5E97`, '#1a1a1a', '#ff3c2a', 'gun');
    c &&
      G.mapIcons.push({
        x: c.x,
        z: c.z,
        col: '#e5402b',
        ch: 'G',
        name: '\u6B66\u5668\u5C4B',
      });
  }
  for (let [r, a, l] of Az) {
    let [f, u] = B5(r, a),
      c = [];
    roadsNear(f, u, 80, c);
    let h = c.filter((O) => !O.e.elev).sort((O, U) => O.d - U.d)[0];
    if (!h) continue;
    let d = h.e,
      [p, x] = d.pts[h.j],
      [m, g] = d.pts[h.j + 1],
      M = Math.hypot(m - p, g - x) || 1,
      y = -(g - x) / M,
      _ = (m - p) / M,
      v = h.x + y * (d.hw - 1.5),
      b = h.z + _ * (d.hw - 1.5),
      w = {
        x: v,
        z: b,
        name: `\u30C8\u30FC\u30AD\u30E7\u30FC\u30FB\u30AB\u30B9\u30BF\u30E0\u30BA ${l}`,
      };
    N6.push(w);
    let E = h.x + y * (d.hw + 7),
      C = h.z + _ * (d.hw + 7),
      S = Math.atan2(-y, -_);
    if (roadHits(E + y * 3, C + _ * 3, 14, 10, -S, 0.5)) {
      (G.mapIcons.push({
        x: v,
        z: b,
        col: '#ffb030',
        ch: '\u{1F527}',
        name: '\u6539\u9020\u30B7\u30E7\u30C3\u30D7',
      }),
        hh(
          'TOKYO CUSTOMS',
          `\u30C8\u30FC\u30AD\u30E7\u30FC\u30FB\u30AB\u30B9\u30BF\u30E0\u30BA ${l}`,
          '#0d1b3a',
          '#ffb030',
          6,
          1.5,
          v + y * 1.6,
          3.2,
          b + _ * 1.6,
          S,
        ));
      continue;
    }
    let T = new THREE.Mesh(
      new THREE.BoxGeometry(14, 6, 10),
      new THREE.MeshStandardMaterial({
        color: 3816514,
        roughness: 0.8,
      }),
    );
    (T.position.set(E + y * 3, 3, C + _ * 3),
      (T.rotation.y = S),
      R.scene.add(T),
      W.lmCol.push({
        x: E + y * 3,
        z: C + _ * 3,
        w: 14,
        d: 10,
        h: 6,
        rot: -S,
        y0: 0,
        rad: 9,
      }));
    let D = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 4),
      new THREE.MeshStandardMaterial({
        color: 16756784,
        emissive: 16752672,
        emissiveIntensity: 0.4,
      }),
    );
    (D.position.set(E - y * 2.02, 2, C - _ * 2.02),
      (D.rotation.y = S),
      R.scene.add(D),
      hh(
        'TOKYO CUSTOMS',
        `\u30C8\u30FC\u30AD\u30E7\u30FC\u30FB\u30AB\u30B9\u30BF\u30E0\u30BA ${l}`,
        '#0d1b3a',
        '#ffb030',
        10,
        2.5,
        E - y * 2.05,
        5,
        C - _ * 2.05,
        S,
      ),
      G.mapIcons.push({
        x: v,
        z: b,
        col: '#ffb030',
        ch: '\u{1F527}',
        name: '\u6539\u9020\u30B7\u30E7\u30C3\u30D7',
      }));
  }
  let t = [
      ['cafe', '\u30B9\u30BF\u30FC\u30C0\u30C3\u30AF\u30B9', 'COFFEE', '#00704a', '#ffffff', '\u30AB\u30D5\u30A7', '#00704a', 'C'],
      ['cafe', '\u30C9\u30C8\u30FC\u30EA\u73C8\u7432', 'COFFEE SHOP', '#1d2c4a', '#ffd23f', '\u30AB\u30D5\u30A7', '#00704a', 'C'],
      [
        'ramen',
        '\u4E00\u862D\u3005',
        '\u3068\u3093\u3053\u3064\u30E9\u30FC\u30E1\u30F3',
        '#b3261e',
        '#ffffff',
        '\u30E9\u30FC\u30E1\u30F3',
        '#b3261e',
        '\u9EBA',
      ],
      [
        'ramen',
        '\u5929\u4E0B\u4E00\u676F',
        '\u3053\u3063\u3066\u308A\u30E9\u30FC\u30E1\u30F3',
        '#f2c230',
        '#b3261e',
        '\u30E9\u30FC\u30E1\u30F3',
        '#b3261e',
        '\u9EBA',
      ],
      ['karaoke', '\u30D3\u30C3\u30B0\u30A8\u30B3\u30ED', 'KARAOKE', '#e4007f', '#ffffff', '\u30AB\u30E9\u30AA\u30B1', '#e4007f', '\u266A'],
      ['karaoke', '\u30AB\u30E9\u30AA\u30B1\u9928\u3005', 'KARAOKE', '#2a1d6a', '#ffd23f', '\u30AB\u30E9\u30AA\u30B1', '#e4007f', '\u266A'],
      ['arcade', 'GIGOO', '\u30B2\u30FC\u30E0\u30BB\u30F3\u30BF\u30FC', '#1b5fbf', '#ffffff', '\u30B2\u30FC\u30BB\u30F3', '#1b5fbf', 'G'],
      [
        'arcade',
        '\u30BF\u30A4\u30C8\u30EB\u30B9\u30C6\u30FC\u30B7\u30E7\u30F3',
        'AMUSEMENT',
        '#d4121f',
        '#ffffff',
        '\u30B2\u30FC\u30BB\u30F3',
        '#1b5fbf',
        'G',
      ],
      [
        'drug',
        '\u30DE\u30C4\u30E2\u30C8\u30AD\u30E8\u30B3',
        '\u30C9\u30E9\u30C3\u30B0\u30B9\u30C8\u30A2',
        '#ffe600',
        '#1d2c4a',
        '\u30C9\u30E9\u30C3\u30B0\u30B9\u30C8\u30A2',
        '#c9a33a',
        '\u85AC',
      ],
      [
        'drug',
        '\u30A6\u30A8\u30EB\u30B7\u30E3',
        'DRUG STORE',
        '#d4121f',
        '#ffffff',
        '\u30C9\u30E9\u30C3\u30B0\u30B9\u30C8\u30A2',
        '#c9a33a',
        '\u85AC',
      ],
      [
        'izakaya',
        '\u9152\u5834 \u548C\u697D',
        '\u5C45\u9152\u5C4B\u30FB\u713C\u304D\u9CE5',
        '#2a1a10',
        '#ffb070',
        '\u5C45\u9152\u5C4B',
        '#d46a1a',
        '\u9152',
      ],
      ['izakaya', '\u9CE5\u304D\u305E\u304F', '\u3084\u304D\u3068\u308A', '#f2c230', '#5a2a10', '\u5C45\u9152\u5C4B', '#d46a1a', '\u9152'],
      ['sento', '\u677E\u306E\u6E6F', '\u92AD\u6E6F \u2668 \u3086', '#2a5aa8', '#ffffff', '\u92AD\u6E6F', '#3a7ad4', '\u2668'],
      [
        'capsule',
        '\u30CA\u30A4\u30F3\u30BF\u30A4\u30E0\u30BA',
        'CAPSULE HOTEL',
        '#222428',
        '#ffffff',
        '\u30AB\u30D7\u30BB\u30EB\u30DB\u30C6\u30EB',
        '#6a5acd',
        '\u5BBF',
      ],
      ['book', '\u7D00\u30CE\u6D77\u66F8\u5E97', 'BOOKS', '#1f6a3a', '#ffffff', '\u672C\u5C4B', '#2a8a5a', '\u672C'],
      ['gym', '\u30A8\u30D6\u30EA\u30BF\u30A4\u30E024', 'FITNESS 24H', '#6a2ad4', '#ffffff', '\u30B8\u30E0', '#e05a20', '\u7B4B'],
      ['book', '\u30D6\u30C3\u30AF\u30AA\u30F3\u30D5', '\u53E4\u672C\u30FBBOOK', '#ffd23f', '#1d2c4a', '\u672C\u5C4B', '#2a8a5a', '\u672C'],
      ['sento', '\u5BCC\u58EB\u898B\u6E6F', '\u92AD\u6E6F \u2668', '#b3261e', '#ffffff', '\u92AD\u6E6F', '#3a7ad4', '\u2668'],
    ],
    e = 0,
    i = new Mt({
      color: !0,
    }),
    s = new Mt({
      color: !0,
    }),
    o = (r, a, l) => {
      let [f, u] = r.face,
        c = -u,
        h = f,
        d = Math.atan2(u, f) + Math.PI / 2,
        p = parseInt(l.slice(1), 16);
      i.setColor(p).box(r.x - f * 0.4, 2.7, r.z - u * 0.4, 4.2, 0.18, 1.6, d, {});
      for (let x of [-1, 1]) {
        let m = r.x + c * 2.3 * x - f * 0.9,
          g = r.z + h * 2.3 * x - u * 0.9;
        a === 'izakaya' || a === 'ramen'
          ? (s.setColor(16730666).ell(m, 2.1, g, 0.32, 0.45, 0.32, 8, 5), i.setColor(1710618).box(m, 2.55, g, 0.36, 0.08, 0.36, 0, {}))
          : a === 'karaoke' || a === 'arcade'
            ? s.setColor(x > 0 ? 16732099 : 4441855).box(m, 0.4, g, 0.18, 2.4, 0.18, 0, {})
            : a === 'sento'
              ? s.setColor(16774360).box(m, 1.6, g, 0.12, 1.4, 0.6, d, {})
              : s.setColor(16774360).box(m, 2.2, g, 0.12, 0.5, 0.5, d, {});
      }
      if (a === 'izakaya')
        for (let x = -1; x <= 1; x++)
          i.setColor(2763322).box(r.x + c * x * 0.75 - f * 0.35, 1.8, r.z + h * x * 0.75 - u * 0.35, 0.7, 0.9, 0.02, d, {});
    };
  W.stations.forEach((r, a) => {
    let l = r.lines.length >= 2,
      f = l ? 4 : a % 3 ? 1 : 2;
    for (let u = 0; u < f; u++) {
      let c = (a * 2.39 + u * 2.1) % 6.283,
        h = 70 + u * 35,
        d = t[(a * 3 + u * 7) % t.length],
        p = V5(r.x + Math.cos(c) * h, r.z + Math.sin(c) * h, d[1], d[2], d[3], d[4], d[0], {
          brand: d[1],
        });
      p &&
        (G.mapIcons.push({
          x: p.x,
          z: p.z,
          col: d[6],
          ch: d[7],
          name: d[5],
          small: !0,
        }),
        o(p, d[0], d[3]),
        e++);
    }
  });
  {
    let r = new THREE.Mesh(i.build(), R.M.paint);
    if ((R.scene.add(r), s.count)) {
      let a = new THREE.Mesh(s.build(), R.M.glow);
      R.scene.add(a);
    }
  }
  if ((console.log('facilities', e), G.sceneryIcons)) for (let r of G.sceneryIcons) G.mapIcons.push(r);
  {
    let r = new Mt({
        color: !0,
      }),
      a = 0;
    for (let l of W.edges) {
      if (l.kind !== 'R' || l.pts.length < 2) continue;
      let f = W.nodes[l.a],
        u = W.nodes[l.b],
        c = f.y < 1,
        h = u.y < 1;
      if (c === h) continue;
      let d = c ? l.pts[0] : l.pts[l.pts.length - 1],
        p = c ? l.pts[Math.min(2, l.pts.length - 1)] : l.pts[Math.max(0, l.pts.length - 3)],
        x = p[0] - d[0],
        m = p[1] - d[1],
        g = Math.hypot(x, m) || 1,
        M = x / g,
        y = m / g,
        _ = y,
        v = -M,
        b = l.hw + 1.6,
        w = d[0] + M * 6 + _ * b,
        E = d[1] + y * 6 + v * b,
        C = W.roadNames[l.road] || '\u9996\u90FD\u9AD8',
        S = C.replace('\u9996\u90FD\u9AD8 ', '');
      (r.setColor(10133670).box(w, 0, E, 0.2, 4.2, 0.2, 0, {}),
        hh('\u9996\u90FD\u9AD8 \u5165\u53E3', S, '#1f7a3a', '#ffffff', 3.6, 1.1, w - M * 0.12, 4, E - y * 0.12, Math.atan2(-M, -y)));
      let T = c ? l.pts[l.pts.length - 1] : l.pts[0],
        D = c ? u : f,
        O = T[0] - M * 40 + _ * (l.hw + 1.2),
        U = T[1] - y * 40 + v * (l.hw + 1.2);
      (r.setColor(10133670).box(O, D.y, U, 0.2, 3.6, 0.2, 0, {}),
        hh('\u51FA\u53E3 EXIT', '\u4E00\u822C\u9053\u3078', '#1f7a3a', '#ffffff', 2.8, 0.9, O, D.y + 3.4, U, Math.atan2(M, y)),
        G.mapIcons.push({
          x: d[0],
          z: d[1],
          col: '#1f8a4a',
          ch: 'IC',
          name: '\u9996\u90FD\u9AD8\u5165\u53E3 ' + S,
        }),
        a++);
    }
    if (r.count) {
      let l = new THREE.Mesh(r.build(), R.M.paint);
      ((l.castShadow = !0), R.scene.add(l));
    }
    console.log('interchanges', a);
  }
  for (let r of PROPS) {
    let [a, l] = B5(r.ll[0], r.ll[1]),
      f = V5(
        a,
        l,
        r.name.split(' ')[0] + ' \u7269\u4EF6',
        '\u30C0\u30A4\u30CA\u30DF\u30C3\u30AF8 \u4E0D\u52D5\u7523',
        '#0b3d2e',
        '#3ddc84',
        'property',
        {
          prop: r,
        },
      );
    (f ? ((r.door = f), (r.x = f.x), (r.z = f.z)) : ((r.x = a), (r.z = l)),
      G.mapIcons.push({
        x: r.x,
        z: r.z,
        col: '#3ddc84',
        ch: 'H',
        name: '\u7269\u4EF6',
        prop: r,
      }));
  }
  for (let r of j5)
    if (r.k !== 'skytreeG') {
      let a = DOORS.find((l) => l.deck === r);
      a &&
        G.mapIcons.push({
          x: a.x,
          z: a.z,
          col: '#5cc8ff',
          ch: '\u5C55',
          name: '\u5C55\u671B\u53F0',
        });
    }
  (setRadio(G.settings.radio ?? 1), (uh = 0), document.getElementById('radioHud').classList.remove('on'));
}
var D6 = -1;
function updGTA(n) {
  G.blips.length = 0;
  for (let h of FIRES)
    h.major &&
      G.blips.push({
        x: h.x,
        z: h.z,
        col: '#ff6a00',
        ch: '\u706B',
      });
  (Cz(n), zz(n), kz(n), Uz(n));
  let t = G.cars.find((h) => h.mine && !h.removed);
  t &&
    G.player.car !== t &&
    G.blips.push({
      x: t.x,
      z: t.z,
      col: '#c46cff',
      ch: '\u8ECA',
    });
  let e = Math.floor((G.t / 60 + R.tod) / 24),
    i = R.tod;
  if (i >= 8 && i < 8.5 && D6 !== Math.floor(G.t / 600)) {
    let h = PROPS.filter((d) => GT.props[d.k]).reduce((d, p) => d + p.income, 0);
    ((D6 = Math.floor(G.t / 600)), h > 0 && ((G.money += h), xt('toast', `\u7269\u4EF6\u53CE\u5165 +\xA5${h.toLocaleString('ja-JP')}`), gt.cash()));
  }
  uh > 0 && ((uh -= n), uh <= 0 && document.getElementById('radioHud').classList.remove('on'));
  let s = document.getElementById('phClk');
  s && GT.phone && (s.textContent = `${String(Math.floor(R.tod)).padStart(2, '0')}:${String(Math.floor((R.tod % 1) * 60)).padStart(2, '0')}`);
  let o = G.player,
    r = hudInfo(),
    a = document.getElementById('wpnHud'),
    l = !!r && (o.mode === 'foot' || o.mode === 'car') && !o.interior;
  if (a && ((a.style.display = l ? 'block' : 'none'), l)) {
    let h = `<em>${r.name}${r.reload ? ' \u2014 \u30EA\u30ED\u30FC\u30C9\u4E2D' : ''}</em>${r.ammo}`;
    a._h !== h && ((a._h = h), (a.innerHTML = h));
  }
  let f = document.getElementById('xhair');
  if (f) {
    let h = o.aimPose > 0 && (G.input.aim || G.cam.fp) && !o.interior;
    ((f.style.display = h ? 'block' : 'none'), f.classList.toggle('lock', !!G.lockT));
  }
  let u = document.getElementById('hurt');
  if (u) {
    let h = (G.hurtT || 0) > 0 ? 0.55 : o.hp < 25 ? 0.25 + Math.sin(G.t * 5) * 0.1 : 0;
    u._k !== h && ((u._k = h), (u.style.boxShadow = `inset 0 0 140px rgba(200,0,0,${h})`));
  }
  let c = document.getElementById('armW');
  if (c) {
    let h = o.armor || 0;
    ((c.hidden = h <= 0), h > 0 && (document.getElementById('armBar').style.width = h + '%'));
  }
}
function nearProperty(n, t) {
  for (let e of PROPS) if (e.door && Math.hypot(e.door.x - n, e.door.z - t) < 3.2) return e;
  return null;
}
function offerProperty(n) {
  xe.listMenu(
    `${n.name}`,
    [
      {
        label: `\u4FA1\u683C \xA5${n.price.toLocaleString('ja-JP')}`,
        sub:
          (n.income ? `\u6BCE\u671D \xA5${n.income.toLocaleString('ja-JP')} \u306E\u53CE\u5165\u3002` : '') +
          '\u30BB\u30FC\u30D6\u30FB\u7761\u7720\u304C\u3067\u304D\u308B\u96A0\u308C\u5BB6\u306B\u306A\u308A\u307E\u3059',
        color: '#3ddc84',
        buttons: [
          {
            text: '\u8CFC\u5165\u3059\u308B',
            fn: () => O6(n),
          },
        ],
      },
    ],
    '\u3084\u3081\u308B',
  );
}
function saveGTA() {
  return {
    radio: GT.radio,
    myCar: GT.myCar,
    props: {
      ...GT.props,
    },
  };
}
function loadGTA(n) {
  if (n) {
    ((GT.myCar = n.myCar || null), (GT.props = n.props || {}));
    for (let t of PROPS) GT.props[t.k] && t.door && ((t.door.type = 'home'), (t.door.label = t.name));
    n.radio !== void 0 && setRadio(n.radio);
  }
}
function resetGTA() {
  ((GT.myCar = null), (GT.props = {}));
  for (let n of PROPS) n.door && ((n.door.type = 'property'), (n.door.label = n.name.split(' ')[0] + ' \u7269\u4EF6'));
}
function gunShopMenu() {
  let n = [];
  for (let t of ORDER) {
    let e = WPN[t];
    if (!e.price) continue;
    let i = owned(t),
      s = [];
    (i ||
      s.push({
        text: `\u8CFC\u5165 \xA5${e.price.toLocaleString('ja-JP')}`,
        fn: () => {
          if (G.money < e.price) {
            xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
            return;
          }
          ((G.money -= e.price), giveWeapon(t), gt.cash(), xe.toast(`${e.name}\u3092\u8CFC\u5165\u3057\u305F`), gunShopMenu());
        },
      }),
      i &&
        e.pack &&
        s.push({
          text: `\u5F3E\u85AC +${e.pack} \xA5${e.packPrice.toLocaleString('ja-JP')}`,
          fn: () => {
            if (G.money < e.packPrice) {
              xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
              return;
            }
            ((G.money -= e.packPrice),
              (INV.ammo[t] = (INV.ammo[t] || 0) + e.pack),
              isGun(t) && !(INV.clip[t] > 0) && reloadNow(),
              gt.cash(),
              gunShopMenu());
          },
        }),
      n.push({
        label: e.name,
        sub: i
          ? isGun(t)
            ? `\u6240\u6301 \u2014 \u5F3E ${totalAmmo(t)}`
            : e.throw
              ? `\u6240\u6301 \xD7${INV.ammo[t] || 0}`
              : '\u6240\u6301'
          : e.melee
            ? '\u8FD1\u63A5\u6B66\u5668'
            : `\u5A01\u529B ${e.dmg * (e.pellets || 1)}\u30FB\u88C5\u5F3E\u6570 ${e.mag || '-'}`,
        color: i ? '#3ddc84' : '#e5402b',
        buttons: s,
      }));
  }
  (n.push({
    label: '\u30DC\u30C7\u30A3\u30A2\u30FC\u30DE\u30FC',
    sub: `\u73FE\u5728 ${Math.round(G.player.armor || 0)}%\u3000\xA54,000`,
    color: '#3a8bff',
    buttons:
      (G.player.armor || 0) >= 100
        ? []
        : [
            {
              text: '\u8CFC\u5165',
              fn: () => {
                if (G.money < 4e3) {
                  xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
                  return;
                }
                ((G.money -= 4e3), (G.player.armor = 100), gt.cash(), gunShopMenu());
              },
            },
          ],
  }),
    n.push({
      label: '\u6551\u6025\u30AD\u30C3\u30C8',
      sub: '\u4F53\u529B\u3092\u5168\u56DE\u5FA9\u3000\xA51,000',
      color: '#2fd36a',
      buttons:
        G.player.hp >= 100
          ? []
          : [
              {
                text: '\u4F7F\u3046',
                fn: () => {
                  if (G.money < 1e3) {
                    xe.toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
                    return;
                  }
                  ((G.money -= 1e3), (G.player.hp = 100), gt.cash(), gunShopMenu());
                },
              },
            ],
    }),
    xe.listMenu('ARMS-NATION\uFF08\u30A2\u30FC\u30E0\u30BA\u30FB\u30CD\u30FC\u30B7\u30E7\u30F3\uFF09', n, '\u5E97\u3092\u51FA\u308B'));
}
var cM = 'shuto2.diag',
  fM = 'shuto2.diag.prev',
  zn = {
    id: Date.now().toString(36),
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio || 1,
    scr: `${screen.width}x${screen.height}`,
    mem: navigator.deviceMemory || null,
    start: Date.now(),
    stage: '\u8D77\u52D5',
    stages: [],
    hb: [],
    ev: [],
    clean: !1,
    q: null,
  },
  hM = null,
  H6 = 0,
  uM = () => ((Date.now() - zn.start) / 1e3).toFixed(1);
function H1() {
  try {
    localStorage.setItem(cM, JSON.stringify(zn));
  } catch {
    try {
      ((zn.hb = zn.hb.slice(-5)), (zn.ev = zn.ev.slice(-10)), localStorage.setItem(cM, JSON.stringify(zn)));
    } catch {}
  }
  H6 = performance.now();
}
function oo(n, t) {
  (zn.ev.push([uM(), n, String(t).slice(0, 300)]), zn.ev.length > 40 && zn.ev.shift(), H1());
}
function B6(n) {
  (window.gc && window.gc(), (zn.stage = n), zn.stages.push([uM(), n, dM()]), H1());
}
function dM() {
  let n = performance.memory;
  return n ? Math.round(n.usedJSHeapSize / 1e6) : null;
}
function G6(n) {
  hM = n;
}
function V6() {
  try {
    return JSON.parse(localStorage.getItem(fM) || 'null');
  } catch {
    return null;
  }
}
function W6(n) {
  zn.q = n;
  try {
    let t = JSON.parse(localStorage.getItem(cM) || 'null');
    t && !t.clean && t.stages && t.stages.length ? localStorage.setItem(fM, JSON.stringify(t)) : t && t.clean && localStorage.removeItem(fM);
  } catch {}
  (addEventListener('error', (t) => oo('error', `${t.message} @${(t.filename || '').split('/').pop()}:${t.lineno}:${t.colno}`)),
    addEventListener('unhandledrejection', (t) => oo('promise', (t.reason && (t.reason.stack || t.reason.message)) || t.reason)),
    addEventListener('pagehide', () => {
      ((zn.clean = !0), oo('pagehide', ''));
    }),
    addEventListener('pageshow', () => {
      zn.clean && ((zn.clean = !1), oo('pageshow', ''));
    }),
    document.addEventListener('visibilitychange', () => {
      oo('visibility', document.visibilityState);
    }),
    performance.memory &&
      setInterval(() => {
        let t = dM();
        t > (zn.peak || 0) && (zn.peak = t);
      }, 1e3),
    H1());
}
function X6(n) {
  (n.addEventListener('webglcontextlost', () =>
    oo('contextlost', 'WebGL\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u6D88\u5931\uFF08GPU\u30E1\u30E2\u30EA\u4E0D\u8DB3\u306E\u53EF\u80FD\u6027\uFF09'),
  ),
    n.addEventListener('webglcontextrestored', () => oo('contextrestored', '')));
}
var lM = 0,
  O1 = 0;
function q6(n) {
  if ((lM++, (O1 += n), performance.now() - H6 < 2e3)) return;
  let t = hM ? hM() : {};
  ((t.t = uM()),
    (t.fps = O1 > 0 ? Math.round(lM / O1) : 0),
    (t.heap = dM()),
    (lM = 0),
    (O1 = 0),
    zn.hb.push(t),
    zn.hb.length > 30 && zn.hb.shift(),
    H1());
}
function $6() {
  return zn.hb[zn.hb.length - 1] || null;
}
function pM(n) {
  if (!n) return '';
  let t = [],
    e = n.hb.length ? n.hb[n.hb.length - 1].t : n.stages.length ? n.stages[n.stages.length - 1][0] : 0;
  (t.push(`SHUTO \u8A3A\u65AD\u30EC\u30DD\u30FC\u30C8  ${new Date(n.start).toLocaleString('ja-JP')}`),
    t.push(`\u7AEF\u672B: ${n.ua}`),
    t.push(`\u753B\u9762 ${n.scr} DPR ${n.dpr}  \u753B\u8CEA ${n.q}  \u7AEF\u672B\u30E1\u30E2\u30EA ${n.mem || '\u4E0D\u660E'}GB`),
    t.push(
      `\u6700\u5F8C\u306E\u6BB5\u968E: ${n.stage}  \uFF08\u8D77\u52D5\u304B\u3089 ${e} \u79D2\u3067\u8A18\u9332\u304C\u9014\u5207\u308C\u305F\uFF09`,
    ),
    t.push('\u2014 \u8AAD\u307F\u8FBC\u307F\u6BB5\u968E \u2014'));
  for (let [i, s, o] of n.stages) t.push(`${i}s ${s}${o ? `  heap ${o}MB` : ''}`);
  if (n.ev.length) {
    t.push('\u2014 \u30A4\u30D9\u30F3\u30C8 \u2014');
    for (let [i, s, o] of n.ev) t.push(`${i}s [${s}] ${o}`);
  }
  if (n.hb.length) {
    t.push('\u2014 \u76F4\u524D\u306E\u72B6\u614B\uFF082\u79D2\u3054\u3068\uFF09\u2014');
    for (let i of n.hb.slice(-8))
      t.push(
        `${i.t}s fps${i.fps} \u5F62\u72B6${i.geo} \u30C6\u30AF\u30B9\u30C1\u30E3${i.tex} \u63CF\u753B${i.calls}\u56DE ${i.tris}k\u4E09\u89D2 \u30C1\u30E3\u30F3\u30AF${i.chunks} \u8ECA${i.cars} \u4EBA${i.peds} ${i.mode} @${i.x},${i.z}${i.heap ? ` heap${i.heap}MB` : ''}`,
      );
  }
  return t.join(`
`);
}
var KEYS = {},
  ia = new Set(),
  TOUCH = {
    stickId: null,
    ox: 0,
    oy: 0,
    x: 0,
    y: 0,
    camId: null,
    lx: 0,
    ly: 0,
    btn: {},
  },
  oi = 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  B1 = !1,
  mM = 0;
function Y6(n, t) {
  (addEventListener('keydown', (o) => {
    o.repeat ||
      ((KEYS[o.code] = !0),
      ia.add(o.code),
      t && t(o.code, o),
      ['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(o.code) && G.started && o.preventDefault());
  }),
    addEventListener('keyup', (o) => {
      KEYS[o.code] = !1;
    }),
    addEventListener('blur', () => {
      for (let o in KEYS) KEYS[o] = !1;
    }),
    n.addEventListener('mousedown', (o) => {
      if (!(oi && o.pointerType === 'touch') && !(!G.started || G.paused)) {
        if (!B1 && n.requestPointerLock) {
          let r = n.requestPointerLock();
          r && r.catch && r.catch(() => {});
        }
        (o.button === 0 && (ia.add('Mouse0'), (KEYS.Mouse0 = !0)), o.button === 2 && (KEYS.Mouse2 = !0));
      }
    }),
    addEventListener('mouseup', (o) => {
      (o.button === 2 && (KEYS.Mouse2 = !1), o.button === 0 && (KEYS.Mouse0 = !1));
    }),
    n.addEventListener('contextmenu', (o) => o.preventDefault()),
    document.addEventListener('pointerlockchange', () => {
      B1 = document.pointerLockElement === n;
    }),
    addEventListener('mousemove', (o) => {
      if (!B1) return;
      let r = 0.0024 * G.settings.sens;
      ((G.cam.yaw -= o.movementX * r),
        (G.cam.pitch = It(G.cam.pitch + o.movementY * r * (G.settings.invertY ? -1 : 1), -0.35, 1.3)),
        (G.cam.lastDrag = G.t));
    }),
    addEventListener(
      'wheel',
      (o) => {
        mM += Math.sign(o.deltaY);
      },
      {
        passive: !0,
      },
    ));
  let e = document.getElementById('stick'),
    i = document.getElementById('knob');
  (addEventListener(
    'pointerdown',
    (o) => {
      o.pointerType === 'mouse' ||
        !G.started ||
        G.paused ||
        (o.target.closest && (o.target.closest('.tap') || o.target.closest('.ov'))) ||
        (o.clientX < innerWidth * 0.42 && TOUCH.stickId === null
          ? ((TOUCH.stickId = o.pointerId),
            (TOUCH.ox = o.clientX),
            (TOUCH.oy = o.clientY),
            (TOUCH.x = TOUCH.y = 0),
            (e.style.display = 'block'),
            (e.style.left = o.clientX + 'px'),
            (e.style.top = o.clientY + 'px'),
            (i.style.transform = ''))
          : TOUCH.camId === null
            ? ((TOUCH.camId = o.pointerId), (TOUCH.lx = o.clientX), (TOUCH.ly = o.clientY))
            : (TOUCH.pinId === void 0 || TOUCH.pinId === null) &&
              ((TOUCH.pinId = o.pointerId),
              (TOUCH.px = o.clientX),
              (TOUCH.py = o.clientY),
              (TOUCH.pd = Math.hypot(o.clientX - TOUCH.lx, o.clientY - TOUCH.ly))));
    },
    {
      passive: !0,
    },
  ),
    addEventListener(
      'pointermove',
      (o) => {
        if (o.pointerId === TOUCH.stickId) {
          let r = o.clientX - TOUCH.ox,
            a = o.clientY - TOUCH.oy,
            l = Math.hypot(r, a),
            f = 55;
          (l > f && ((r *= f / l), (a *= f / l)), (TOUCH.x = r / f), (TOUCH.y = -a / f), (i.style.transform = `translate(${r}px,${a}px)`));
        } else if (o.pointerId === TOUCH.pinId || (o.pointerId === TOUCH.camId && TOUCH.pinId != null)) {
          o.pointerId === TOUCH.pinId ? ((TOUCH.px = o.clientX), (TOUCH.py = o.clientY)) : ((TOUCH.lx = o.clientX), (TOUCH.ly = o.clientY));
          let r = Math.hypot(TOUCH.px - TOUCH.lx, TOUCH.py - TOUCH.ly);
          (TOUCH.pd && (TOUCH.pinch = (TOUCH.pinch || 0) + (TOUCH.pd - r) * 0.02), (TOUCH.pd = r));
        } else if (o.pointerId === TOUCH.camId) {
          let r = o.clientX - TOUCH.lx,
            a = o.clientY - TOUCH.ly;
          ((TOUCH.lx = o.clientX),
            (TOUCH.ly = o.clientY),
            (G.cam.yaw -= r * 0.0068 * G.settings.sens),
            (G.cam.pitch = It(G.cam.pitch + a * 0.0045 * G.settings.sens, -0.35, 1.3)),
            (G.cam.lastDrag = G.t),
            (TOUCH.dragX = (TOUCH.dragX || 0) + r));
        }
      },
      {
        passive: !0,
      },
    ));
  let s = (o) => {
    (o.pointerId === TOUCH.stickId && ((TOUCH.stickId = null), (TOUCH.x = TOUCH.y = 0), (e.style.display = 'none')),
      o.pointerId === TOUCH.camId &&
        ((TOUCH.camId = TOUCH.pinId ?? null), TOUCH.pinId != null && ((TOUCH.lx = TOUCH.px), (TOUCH.ly = TOUCH.py)), (TOUCH.pinId = null)),
      o.pointerId === TOUCH.pinId && (TOUCH.pinId = null));
  };
  (addEventListener('pointerup', s),
    addEventListener('pointercancel', s),
    document.addEventListener(
      'touchmove',
      (o) => {
        o.target.closest('.scroll') || o.preventDefault();
      },
      {
        passive: !1,
      },
    ),
    document.addEventListener('gesturestart', (o) => o.preventDefault()));
}
function xr(n, t, e) {
  n.addEventListener('pointerdown', (s) => {
    (s.preventDefault(), s.stopPropagation());
    try {
      n.setPointerCapture(s.pointerId);
    } catch {}
    ((TOUCH.btn[t] = !0), n.classList.add('on'), e && e());
  });
  let i = () => {
    ((TOUCH.btn[t] = !1), n.classList.remove('on'));
  };
  (n.addEventListener('pointerup', i), n.addEventListener('pointercancel', i), n.addEventListener('lostpointercapture', i));
}
function Sn(n) {
  return ia.has(n);
}
function dh() {
  (ia.clear(), (mM = 0));
}
function nc() {
  document.exitPointerLock && B1 && document.exitPointerLock();
}
var ec = (n, t = 0.15) => (Math.abs(n) < t ? 0 : (n - Math.sign(n) * t) / (1 - t));
function xM(n) {
  let t = G.input,
    e = KEYS,
    i = TOUCH.btn,
    s = null;
  try {
    let u = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let c of u)
      if (c && c.connected) {
        s = c;
        break;
      }
  } catch {}
  let o = 0,
    r = 0;
  ((e.KeyA || e.ArrowLeft) && (o -= 1),
    (e.KeyD || e.ArrowRight) && (o += 1),
    (e.KeyW || e.ArrowUp) && (r += 1),
    (e.KeyS || e.ArrowDown) && (r -= 1),
    (o += TOUCH.x),
    (r += TOUCH.y));
  let a = 0,
    l = 0;
  if (s) {
    ((o += ec(s.axes[0])), (r -= ec(s.axes[1])));
    let u = ec(s.axes[2] || 0),
      c = ec(s.axes[3] || 0);
    ((u || c) && ((G.cam.yaw -= u * 0.05 * G.settings.sens), (G.cam.pitch = It(G.cam.pitch + c * 0.035, -0.35, 1.3)), (G.cam.lastDrag = G.t)),
      (a = s.buttons[7] ? s.buttons[7].value : 0),
      (l = s.buttons[6] ? s.buttons[6].value : 0));
    let h = (p) => s.buttons[p] && s.buttons[p].pressed;
    t._gp = t._gp || {};
    let d = (p, x) => {
      let m = h(p);
      (m && !t._gp[p] && ia.add(x), (t._gp[p] = m));
    };
    (d(3, 'KeyF'),
      d(1, 'Mouse0'),
      d(9, 'Escape'),
      d(8, 'KeyM'),
      d(2, 'KeyH'),
      d(0, 'GpA'),
      d(12, 'GpUp'),
      d(13, 'GpDown'),
      (t.gpA = h(0)),
      (t.gpX = h(2)),
      (t.gpLB = h(4)),
      (t.gpRB = h(5)));
  }
  ((o = It(o, -1, 1)),
    (r = It(r, -1, 1)),
    (t.mx = o),
    (t.my = r),
    (t.sprint = !!(e.ShiftLeft || e.ShiftRight || i.main || (s && t.gpRB))),
    (t.jump = ia.has('Space') || ia.has('GpA') || !!i.jumpQ),
    (i.jumpQ = !1),
    (t.steer = Math.sign(o) * Math.pow(Math.abs(o), 1.35)),
    (t.thr = It(Math.max(e.KeyW || e.ArrowUp ? 1 : 0, i.main ? 1 : 0, a, TOUCH.y > 0.3 ? (TOUCH.y - 0.3) / 0.6 : 0), 0, 1)),
    (t.brake = It(Math.max(e.KeyS || e.ArrowDown ? 1 : 0, i.sub ? 1 : 0, l, TOUCH.y < -0.35 ? (-TOUCH.y - 0.35) / 0.5 : 0), 0, 1)),
    (t.hand = e.Space || i.act || (s && t.gpA) ? 1 : 0),
    (t.horn = !!(e.KeyH || i.horn || (s && t.gpX))),
    (t.pitch = It((e.KeyW || e.ArrowUp ? 1 : 0) - (e.KeyS || e.ArrowDown ? 1 : 0) + TOUCH.y + (s ? -ec(s.axes[1]) : 0), -1, 1)),
    (t.roll = It((e.KeyD || e.ArrowRight ? 1 : 0) - (e.KeyA || e.ArrowLeft ? 1 : 0) + TOUCH.x + (s ? ec(s.axes[0]) : 0), -1, 1)),
    (t.yaw = It((e.KeyE ? 1 : 0) - (e.KeyQ ? 1 : 0) + (s ? (t.gpRB ? 1 : 0) - (t.gpLB ? 1 : 0) : 0), -1, 1)),
    (t.thrUp = e.ShiftLeft || e.ShiftRight || i.up || a > 0.3 ? 1 : 0),
    (t.thrDown = e.ControlLeft || e.ControlRight || e.KeyZ || i.down || l > 0.3 ? 1 : 0));
  let f = n === 'foot';
  return (
    (t.fireHeld = !!(e.Mouse0 || i.act || (s && f && a > 0.5) || (s && n === 'car' && t.gpLB && a > 0.5))),
    (t.firePressed = ia.has('Mouse0') || !!i.actQ || (s && f && a > 0.5 && !t._rt)),
    (i.actQ = !1),
    s && (t._rt = a > 0.5),
    (t.aim = !!(e.Mouse2 || (s && f && l > 0.5) || (s && n === 'car' && t.gpLB))),
    (t.zoom = mM + (TOUCH.pinch || 0)),
    (TOUCH.pinch = 0),
    (t.zoomK = (e.Equal || e.NumpadAdd || e.BracketRight ? -1 : 0) + (e.Minus || e.NumpadSubtract || e.BracketLeft ? 1 : 0)),
    t
  );
}
var P = player_P,
  $t = (n) => document.getElementById(n),
  Mh = 'shuto2.save',
  gr = 'shuto2.settings',
  Qi = {
    get(n) {
      try {
        return JSON.parse(localStorage.getItem(n));
      } catch {
        return null;
      }
    },
    set(n, t) {
      try {
        localStorage.setItem(n, JSON.stringify(t));
      } catch {}
    },
  },
  zi = (n, t) => fe(n, t),
  Oz = [
    zi(35.6688, 139.7772),
    zi(35.7108, 139.7628),
    zi(35.681, 139.718),
    zi(35.6512, 139.7215),
    zi(35.628, 139.739),
    zi(35.699, 139.7185),
    zi(35.636, 139.79),
    zi(35.56, 139.77),
  ],
  Hz = [
    zi(35.6768, 139.7525),
    zi(35.6577, 139.7032),
    zi(35.6937, 139.696),
    zi(35.672, 139.766),
    zi(35.712, 139.776),
    zi(35.629, 139.74),
    zi(35.73, 139.711),
  ],
  X1 = zi(35.6596, 139.7012),
  ge = Object.assign(
    {
      quality: oi ? 'low' : 'mid',
      sound: !0,
      music: !0,
      weather: 'auto',
      sens: 1,
      fov: 60,
      invertY: !1,
      autoCam: !0,
      camMode: 1,
    },
    Qi.get(gr) || {},
  );
W6(ge.quality);
{
  let n = V6(),
    t = (e) => {
      (($t('diagPre').textContent = e), ($t('diagBox').hidden = !1));
    };
  (n && (($t('tDiag').hidden = !1), ($t('tDiag').onclick = () => t(pM(n)))),
    ($t('diagClose').onclick = () => {
      $t('diagBox').hidden = !0;
    }),
    (window.__diagShow = () => t(pM(JSON.parse(localStorage.getItem('shuto2.diag'))))),
    ($t('diagClear').onclick = () => {
      try {
        localStorage.removeItem('shuto2.diag.prev');
      } catch {}
      (($t('diagBox').hidden = !0), ($t('tDiag').hidden = !0));
    }),
    ($t('diagCopy').onclick = () => {
      let e = $t('diagPre').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(e) : Promise.reject()).then(
        () => {
          $t('diagCopy').textContent = '\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F';
        },
        () => {
          let i = document.createRange();
          i.selectNodeContents($t('diagPre'));
          let s = getSelection();
          (s.removeAllRanges(),
            s.addRange(i),
            document.execCommand('copy'),
            ($t('diagCopy').textContent = '\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F'));
        },
      );
    }));
}
Object.assign(G.settings, ge);
oi && document.body.classList.add('touch');
var ow = $t('qs'),
  rw = () => ow.querySelectorAll('button').forEach((n) => n.classList.toggle('sel', n.dataset.q === ge.quality));
ow.addEventListener('click', (n) => {
  let t = n.target.closest('button');
  t &&
    ((ge.quality = t.dataset.q),
    Qi.set(gr, ge),
    rw(),
    G.booted &&
      (toast,
      ($t('tContinue').querySelector('small').textContent =
        '\u753B\u8CEA\u306E\u5909\u66F4\u306F\u518D\u8D77\u52D5\u5F8C\u306B\u53CD\u6620\u3055\u308C\u307E\u3059')));
});
rw();
var Bz = Qi.get(Mh);
Bz || (($t('tContinue').disabled = !0), $t('tContinue').classList.remove('pri'), $t('tNew').classList.add('pri'));
$t('tContinue').onclick = () => {
  Qi.get(Mh) && aw(!0);
};
var K6 = 0;
$t('tNew').onclick = () => {
  if (Qi.get(Mh) && Date.now() - K6 > 4e3) {
    ((K6 = Date.now()),
      ($t('tNew').querySelector('small').textContent =
        '\u30BB\u30FC\u30D6\u3092\u4E0A\u66F8\u304D\u3057\u307E\u3059\u3002\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068\u958B\u59CB'),
      setTimeout(() => {
        $t('tNew').querySelector('small').textContent = '\u306F\u3058\u3081\u304B\u3089\uFF08\u6E0B\u8C37\u304B\u3089\uFF09';
      }, 4e3));
    return;
  }
  aw(!1);
};
oi &&
  ($t('keys').innerHTML =
    '<b>\u5DE6\u5074</b><span>\u30B9\u30C6\u30A3\u30C3\u30AF\u3067\u79FB\u52D5\u30FB\u904B\u8EE2</span><b>\u53F3\u5074</b><span>\u30C9\u30E9\u30C3\u30B0\u3067\u30AB\u30E1\u30E9\uFF082\u672C\u6307\u3067\u30BA\u30FC\u30E0\uFF09</span><b>\u4E57\u308B</b><span>\u4E57\u308A\u964D\u308A\u30FB\u5165\u308B\u30FB\u30D0\u30B9\u505C\u30FB\u30DF\u30C3\u30B7\u30E7\u30F3</span><b>\u30BF\u30AF\u30B7\u30FC</b><span>\u8FD1\u304F\u306E\u30BF\u30AF\u30B7\u30FC\u3092\u547C\u3076</span><b>\u8996\u70B9</b><span>\u8FD1\u3044\u30FB\u6A19\u6E96\u30FB\u9060\u3044\u30FB\u4E00\u4EBA\u79F0</span><b>\u30E1\u30CB\u30E5\u30FC</b><span>\u5730\u56F3\u30FB\u76EE\u7684\u5730\u30FB\u30BB\u30FC\u30D6\u30FB\u8A2D\u5B9A</span>');
var ph = !1;
async function aw(n) {
  if (ph) return;
  if (((ph = !0), gt.init(), gt.resume(), (gt.on = ge.sound), G.booted)) {
    (($t('title').hidden = !0), ($t('hud').hidden = !1), (G.started = !0), (G.paused = !1), n || j6(), (ph = !1));
    return;
  }
  (($t('title').hidden = !0), ($t('loading').hidden = !1));
  let t = $t('lbar').firstElementChild,
    e = $t('ltxt'),
    i = async (s, o) => {
      (B6(o), (t.style.width = s * 100 + '%'), (e.textContent = o), await new Promise((r) => setTimeout(r, 16)));
    };
  try {
    (await i(0.02, '\u30B0\u30E9\u30D5\u30A3\u30C3\u30AF\u3092\u521D\u671F\u5316\u4E2D\u2026'),
      X6($t('gl')),
      Av($t('gl'), ge.quality),
      await i(0.08, '\u6771\u4EAC\u306E\u5730\u56F3\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026'));
    let s = await kv('data/', (l) => i(0.08 + l * 0.3, '\u6771\u4EAC\u306E\u5730\u56F3\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026'));
    (await i(0.4, '\u9053\u8DEF\u7DB2\u3068\u5EFA\u7269\u3092\u5C55\u958B\u4E2D\u2026'),
      initWorld(s.json, s.bld),
      x_(() => G.t),
      await i(0.5, '\u30E9\u30F3\u30C9\u30DE\u30FC\u30AF\u3092\u5EFA\u8A2D\u4E2D\u2026'),
      d_(),
      G1(),
      O_(),
      B_(),
      Y_(),
      G1(),
      await i(0.58, '\u99C5\u3092\u914D\u7F6E\u4E2D\u2026'),
      setupStations(),
      setupDoors(),
      DOORS.push(...Gf, ...o1, ...To),
      console.log('colliders trimmed', fitColliders()),
      Zz());
    {
      let l = performance.now();
      (setupTransit(), console.log('transit ms', Math.round(performance.now() - l)));
    }
    (await i(0.64, '\u8ECA\u3068\u4EBA\u3092\u6E96\u5099\u4E2D\u2026'),
      Q_(),
      initVehicles(),
      initPeds(),
      initPlayer(),
      await i(0.7, '\u5217\u8ECA\u3068\u822A\u7A7A\u6A5F\u3092\u6E96\u5099\u4E2D\u2026'),
      initTrains(),
      initAircraft());
    for (let l of G.aircraft)
      l.kind === 'parked' &&
        (l.home = {
          x: l.x,
          y: l.y,
          z: l.z,
          yaw: l.yaw,
        });
    let o = n ? Qi.get(Mh) : null;
    (initMissions(o),
      initCapsules(o && o.caps),
      initHUD(),
      initWeapons(),
      initBoats(),
      (G.boatPoliceSees = boatPoliceSees),
      (G.touchAim = oi),
      (G.sceneryIcons = Vf),
      initGTA({
        toast: (l) => toast(l),
        listMenu: (...l) => listMenu(...l),
        pause: (l) => pause(l),
        callTaxi: () => callTaxi(),
        save: () => saveGame(!0),
        photo: () => q1(),
        exitLock: () => nc(),
      }),
      $z(),
      Vz(),
      qz(),
      G1(),
      Y6($t('gl')),
      Yz(),
      jz(),
      o ? Gz(o) : j6(),
      await i(0.78, '\u8857\u3092\u69CB\u7BC9\u4E2D\u2026'));
    let [r, a] = oc();
    for (let l = 0; l < 6; l++) (lg(r, a, 400), G1(), await i(0.78 + l * 0.03, '\u8857\u3092\u69CB\u7BC9\u4E2D\u2026'));
    (N2(0, r, a),
      managePopulation(0, !0),
      await i(1, '\u6E96\u5099\u5B8C\u4E86'),
      G6(() => {
        let l = R.renderer.info;
        return {
          geo: l.memory.geometries,
          tex: l.memory.textures,
          calls: l.render.calls,
          tris: Math.round(l.render.triangles / 1e3),
          chunks: Zv(),
          cars: (G.cars || []).length,
          peds: (G.peds || []).length,
          mode: P.interior ? 'in' : P.mode,
          x: Math.round(P.x),
          z: Math.round(P.z),
        };
      }),
      ($t('loading').hidden = !0),
      ($t('hud').hidden = !1),
      (G.started = !0),
      (G.booted = !0),
      (ph = !1),
      (window.__G = {
        LM: LM,
        FIRE: FIRE,
        WP: WP,
        BT: BT,
        GTA: GTA,
        G: G,
        P: P,
        R: R,
        W: W,
        MS: MS,
        V: V,
        TR: TR,
        AC: AC,
        PL: PL,
        INT: INT,
        MI: MI,
        HUD: HUD,
        THREE: THREE,
        interact: interact,
        doAction: doAction,
        pause: pause,
        saveGame: saveGame,
        KEYS: KEYS,
        TOUCH: TOUCH,
        WD: WD,
        TRN: TRN,
        POL: POL,
        PD: PD,
        RIDE: RIDE,
        callTaxi: callTaxi,
        openBusMenu: openBusMenu,
        sim: (l, f = 1 / 30) => {
          for (let u = 0; u < l; u++) SM(f, !1);
          return G.t;
        },
      }),
      (sc = performance.now()),
      requestAnimationFrame(dw),
      o ||
        setTimeout(
          () =>
            toast(
              oi
                ? '\u9752\u3044\u300CM\u300D\u30DE\u30FC\u30AB\u30FC\u3067\u30DF\u30C3\u30B7\u30E7\u30F3\u958B\u59CB\u3002\u30E1\u30CB\u30E5\u30FC\u304B\u3089\u5730\u56F3\u3067\u76EE\u7684\u5730\u3092\u8A2D\u5B9A\u3067\u304D\u307E\u3059'
                : '\u9752\u3044\u300CM\u300D\u30DE\u30FC\u30AB\u30FC\u3067 F \u3092\u62BC\u3059\u3068\u30DF\u30C3\u30B7\u30E7\u30F3\u958B\u59CB\u3002M \u30AD\u30FC\u3067\u5730\u56F3',
            ),
          1200,
        ));
  } catch (s) {
    (console.error('BOOT', s),
      oo('boot', s && (s.stack || s.message)),
      (e.textContent = '\u8D77\u52D5\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A' + (s.message || s)),
      (ph = !1));
  }
}
function j6() {
  ((G.money = 5e3),
    (G.heat = 0),
    (R.tod = 9.5),
    (G.stats = {
      missions: 0,
      jobs: 0,
      distance: 0,
      rides: 0,
      flights: 0,
      capsules: [],
    }),
    loadInv(null),
    resetGTA(),
    (P.armor = 0),
    (P.mode = 'foot'),
    (P.hp = 100),
    placeNearRoad(X1[0], X1[1]),
    (G.cam.yaw = Math.PI * 0.9),
    (G.cam.pitch = 0.22),
    (G.cam.snap = !0));
}
function Gz(n) {
  ((G.money = n.money ?? 5e3),
    (R.tod = n.tod ?? 10),
    Object.assign(G.stats, n.stats || {}),
    (G.stats.capsules = n.caps || []),
    (P.mode = 'foot'),
    (P.hp = 100),
    placeNearRoad(n.x ?? X1[0], n.z ?? X1[1]),
    (G.cam.snap = !0),
    n.color !== void 0 && setPlayerColor(n.color),
    loadInv(n.inv),
    loadGTA(n.gta));
}
function saveGame(n) {
  let [t, e] = oc();
  (Qi.set(Mh, {
    v: 2,
    color: G.playerColor,
    x: t,
    z: e,
    money: Math.floor(G.money),
    tod: R.tod,
    done: [...MS.done],
    caps: G.stats.capsules,
    stats: G.stats,
    inv: saveInv(),
    gta: saveGTA(),
    t: Date.now(),
  }),
    ($t('tContinue').disabled = !1),
    n || toast('\u30BB\u30FC\u30D6\u3057\u307E\u3057\u305F'));
}
function oc() {
  return P.interior
    ? [P.interior.back.x, P.interior.back.z]
    : (P.mode === 'car' || P.mode === 'ride') && P.car
      ? [P.car.x, P.car.z]
      : (P.mode === 'plane' || P.mode === 'heli') && P.air
        ? [P.air.x, P.air.z]
        : P.mode === 'boat' && P.boat
          ? [P.boat.x, P.boat.z]
          : [P.x, P.z];
}
var Mr = null;
function Vz() {
  let t = new THREE.PlaneGeometry(9e3, 9e3, 1, 1);
  (t.rotateX(-Math.PI / 2),
    (Mr = new THREE.Mesh(t, R.M.water)),
    (Mr.position.y = -0.35),
    (Mr.receiveShadow = !0),
    (Mr.renderOrder = -1),
    R.scene.add(Mr),
    R.M.water.normalMap.repeat.set(9e3 / 50, 9e3 / 50));
}
function Wz(n, t, e) {
  if (!Mr) return;
  ((Mr.position.x = Math.round(t / 50) * 50), (Mr.position.z = Math.round(e / 50) * 50), (Mr.visible = !P.interior));
  let i = R.M.water.normalMap;
  ((i.offset.x = (G.t * 0.006) % 1),
    (i.offset.y = (G.t * 0.004) % 1),
    R.M.water.color.setRGB(0.06 + 0.05 * (1 - R.night), 0.16 + 0.1 * (1 - R.night), 0.24 + 0.12 * (1 - R.night)));
}
function G1() {
  let n = [];
  R.scene.traverse((i) => {
    i.frustumCulled && (i.isMesh || i.isPoints) && ((i.frustumCulled = !1), n.push(i));
  });
  let t = R.scene.overrideMaterial,
    e = R.renderer.shadowMap.autoUpdate;
  ((R.scene.overrideMaterial = Xz), (R.renderer.shadowMap.autoUpdate = !1));
  try {
    R.renderer.render(R.scene, R.camera);
  } catch (i) {
    oo('flush', i.message);
  }
  ((R.scene.overrideMaterial = t), (R.renderer.shadowMap.autoUpdate = e));
  for (let i of n) i.frustumCulled = !0;
}
var Xz = new THREE.MeshBasicMaterial();
function qz() {
  let n = function () {
      this.array = null;
    },
    t = 0;
  for (let e of LM.meshes)
    e.traverse((i) => {
      let s = i.geometry;
      if (!(!s || !s.attributes || i.isInstancedMesh || i.isPoints || i.isLine) && !(!s.attributes.position || !s.attributes.position.array)) {
        s.boundingSphere || s.computeBoundingSphere();
        for (let o in s.attributes) {
          let r = s.attributes[o];
          r.onUploadCallback === n || r.isInterleavedBufferAttribute || (r.onUpload(n), (t += r.count));
        }
        s.index && s.index.onUpload(n);
      }
    });
  console.log('static release', t);
}
function $z() {
  let n = We.stat;
  for (let t of LM.airLights || []) n.add(t[0], t[1], t[2], t[3], t[4], t[5], t[6] || 5);
  for (let t of LM.bridgeLights || []) n.add(t[0], t[1], t[2], t[3], t[4], t[5], 4);
  n.commit();
}
var ao = {};
function Yz() {
  for (let n of ['bMain', 'bSub', 'bAct', 'bEnter', 'bX', 'bUp', 'bDown', 'bWpn']) ao[n] = $t(n);
  (xr(ao.bMain, 'main'),
    xr(ao.bSub, 'sub', () => {
      P.mode === 'foot' && (TOUCH.btn.jumpQ = !0);
    }),
    xr(ao.bAct, 'act', () => {
      P.mode === 'foot' && !P.interior && !$1() && !curW().melee
        ? (TOUCH.btn.actQ = !0)
        : P.mode === 'foot' && !P.interior
          ? lw()
          : P.mode === 'train' && !(P.train && P.train.drive) && (G.cam.inside = !G.cam.inside);
    }),
    xr(ao.bEnter, 'enter', () => interact()),
    xr(ao.bX, 'x', () => {
      if (P.mode === 'train' && P.train && !P.train.drive) {
        let n = skipToNext(P.train);
        n && toast(`${n.ja}\u306B\u5230\u7740`);
        return;
      }
      if (P.mode === 'ride' && Xt.kind === 'bus' && Xt.car) {
        let n = skipBus(Xt.car);
        n && toast(`\u6B21\u306F ${n.name}`);
        return;
      }
      P.mode === 'foot' && !P.interior
        ? callTaxi()
        : P.mode === 'train' &&
          P.train &&
          P.train.drive &&
          P.train.state === 'dwell' &&
          ((P.train.drive = !1), (P.train.dwell = 4), leaveTrain(), (G.cam.inside = !1));
    }),
    xr(ao.bUp, 'up', () => {
      P.mode === 'train' && P.train && P.train.drive && driverInput(P.train, 'tasc');
    }),
    xr(ao.bDown, 'down'),
    xr(ao.bWpn, 'wpn', () => {
      P.mode === 'foot' ? toggleWheel() : (P.mode === 'car' || P.mode === 'boat') && setRadio(GT.radio + 1);
    }),
    $t('phoneBtn').addEventListener('click', () => togglePhone()),
    $t('pauseBtn').addEventListener('click', () => pause(!0)),
    $t('mini').classList.add('tap'),
    ($t('mini').style.cursor = 'pointer'),
    $t('mini').addEventListener('click', (n) => {
      (n.stopPropagation(), pause(!0));
    }),
    $t('dialog').addEventListener('click', () => nextLine()));
}
var J6 = '';
function Kz() {
  let n = P.interior ? 'int' : P.deck ? 'deck' : P.mode === 'boat' && P.boatRide ? 'boatRide' : P.mode,
    t = $1(),
    e = curW().melee ? 'm' : curW().throw ? 't' : 'g',
    i =
      n +
      t +
      e +
      (Xt.kind || '') +
      (Xt.car && Xt.car.atStop ? 1 : 0) +
      (P.train && P.train.drive ? 'd' : '') +
      (P.train && P.train.state === 'dwell' ? 'w' : '');
  if (i === J6) return;
  J6 = i;
  let s =
    {
      foot: [
        '\u30C0\u30C3\u30B7\u30E5',
        '\u30B8\u30E3\u30F3\u30D7',
        t ? '\u64AE\u5F71' : e === 'g' ? '\u6483\u3064' : e === 't' ? '\u6295\u3052\u308B' : '\u30D1\u30F3\u30C1',
        '\u4E57\u308B',
        '\u30BF\u30AF\u30B7\u30FC',
        '',
        '',
        '\u6B66\u5668',
      ],
      deck: ['\u30C0\u30C3\u30B7\u30E5', '\u30B8\u30E3\u30F3\u30D7', '\u64AE\u5F71', '\u964D\u308A\u308B', '', '', ''],
      boat: ['\u30A2\u30AF\u30BB\u30EB', '\u5F8C\u9000', '', '\u964D\u308A\u308B', '', '', '', '\u30E9\u30B8\u30AA'],
      boatRide: ['\u65E9\u9001\u308A', '', '', '\u964D\u308A\u308B', '', '', ''],
      ride: [
        '\u65E9\u9001\u308A',
        '',
        '',
        Xt.kind === 'bus' ? (Xt.car && Xt.car.atStop ? '\u964D\u308A\u308B' : '\u6B21\u306E\u505C\u7559\u6240') : '\u30B9\u30AD\u30C3\u30D7',
        Xt.kind === 'bus' && Xt.car && Xt.car.atStop ? '\u6B21\u306E\u505C\u7559\u6240' : '',
        '',
        '',
      ],
      car: [
        '\u30A2\u30AF\u30BB\u30EB',
        '\u30D6\u30EC\u30FC\u30AD',
        '\u30B5\u30A4\u30C9',
        '\u964D\u308A\u308B',
        '\u30DB\u30FC\u30F3',
        '',
        '',
        '\u30E9\u30B8\u30AA',
      ],
      plane: ['', '\u30D6\u30EC\u30FC\u30AD', '', '\u964D\u308A\u308B', '', '\u63A8\u529B\uFF0B', '\u63A8\u529B\uFF0D'],
      heli: ['', '', '', '\u964D\u308A\u308B', '', '\u4E0A\u6607', '\u4E0B\u964D'],
      train:
        P.train && P.train.drive
          ? [
              '\u529B\u884C',
              '\u30D6\u30EC\u30FC\u30AD',
              '\u975E\u5E38',
              P.train.state === 'dwell' ? '\u767A\u8ECA' : '',
              P.train.state === 'dwell' ? '\u964D\u308A\u308B' : '\u5F8C\u9000',
              'TASC',
              '',
            ]
          : [
              '\u65E9\u9001\u308A',
              '',
              '\u8ECA\u5185',
              P.train && P.train.state === 'dwell' ? '\u964D\u308A\u308B' : '\u6B21\u306E\u99C5',
              P.train && P.train.state === 'dwell' ? '\u6B21\u306E\u99C5' : '',
              '',
              '',
            ],
      int: ['\u30C0\u30C3\u30B7\u30E5', '', '', '\u30A2\u30AF\u30B7\u30E7\u30F3', '', '', ''],
    }[n] || [];
  ['bMain', 'bSub', 'bAct', 'bEnter', 'bX', 'bUp', 'bDown', 'bWpn'].forEach((o, r) => {
    let a = s[r] || '';
    ((ao[o].textContent = a), (ao[o].hidden = !a));
  });
}
function $1() {
  let n = MS.cur;
  return !!(n && n.steps[MS.step] && n.steps[MS.step].t === 'photo');
}
function lw() {
  $1() || P.deck ? q1() : doPunch();
}
var sa = null;
function q1() {
  (sa ||
    ((sa = document.createElement('div')),
    (sa.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .4s;z-index:5'),
    document.body.appendChild(sa)),
    (sa.style.transition = 'none'),
    (sa.style.opacity = 0.85),
    requestAnimationFrame(() => {
      ((sa.style.transition = 'opacity .45s'), (sa.style.opacity = 0));
    }),
    gt.tone(1800, 0.05, 0.12, 'square'),
    gt.burst(3e3, 0.08, 0.1, 'highpass'),
    missionEvent('photo'));
}
var gM = [
  ['\u8FD1\u3044', 0.65, !1],
  ['\u6A19\u6E96', 1, !1],
  ['\u9060\u3044', 1.75, !1],
  ['\u4E00\u4EBA\u79F0', 1, !0],
];
function W1(n, t) {
  ge.camMode = (n + gM.length) % gM.length;
  let e = gM[ge.camMode];
  ((G.cam.zoomT = e[1]), (G.cam.fp = e[2]), (G.cam.fpYaw = 0), (G.cam.snap = !0), Qi.set(gr, ge));
  let i = $t('pCam');
  (i && (i.textContent = '\u8996\u70B9: ' + e[0]), t || toast('\u8996\u70B9\uFF1A' + e[0]));
}
function jz() {
  (($t('pResume').onclick = () => pause(!1)),
    ($t('pClear').onclick = () => {
      ((G.waypoint = null), updRoute(), drawBig());
    }),
    ($t('pJob').onclick = () => {
      (pause(!1), startJob());
    }),
    ($t('pSave').onclick = () => {
      saveGame();
    }));
  let n = () => {
    (($t('pSound').textContent = '\u30B5\u30A6\u30F3\u30C9: ' + (ge.sound ? 'ON' : 'OFF')),
      ($t('pMusic').textContent = '\u30AB\u30FC\u30E9\u30B8\u30AA: ' + (ge.music ? 'ON' : 'OFF')),
      ($t('pWeather').textContent =
        '\u5929\u6C17: ' +
        {
          auto: '\u81EA\u52D5',
          clear: '\u6674\u308C',
          rain: '\u96E8',
        }[ge.weather]));
  };
  (($t('pDiag').onclick = () => {
    ((mh = !mh), ($t('diagLive').hidden = !mh), ($t('pDiag').textContent = '\u8A3A\u65AD\u8868\u793A: ' + (mh ? 'ON' : 'OFF')));
  }),
    ($t('pSound').onclick = () => {
      ((ge.sound = !ge.sound), (gt.on = ge.sound), Qi.set(gr, ge), n());
    }),
    ($t('pMusic').onclick = () => {
      ((ge.music = !ge.music), (G.settings.music = ge.music), Qi.set(gr, ge), n());
    }),
    ($t('pWeather').onclick = () => {
      ((ge.weather = {
        auto: 'clear',
        clear: 'rain',
        rain: 'auto',
      }[ge.weather]),
        Qi.set(gr, ge),
        n());
    }),
    ($t('pTime').onclick = () => {
      ((R.tod = (R.tod + 3) % 24), toast(`\u6642\u523B ${Math.floor(R.tod)}:00`));
    }),
    ($t('pRespawn').onclick = () => {
      if ((pause(!1), P.interior && exit(), P.mode === 'car' || P.mode === 'foot')) {
        (P.car && ((P.car.ctl = null), (P.car = null)), (P.mode = 'foot'));
        let [i, s] = oc();
        placeNearRoad(i, s);
      }
    }),
    ($t('pTitle').onclick = () => {
      (saveGame(!0), pause(!1), (G.started = !1), ($t('hud').hidden = !0), ($t('title').hidden = !1), nc());
    }),
    n());
  let t = (i, s, o, r, a) => {
    let l = $t(i),
      f = $t(s);
    ((l.value = ge[o]),
      (f.textContent = r(ge[o])),
      (l.oninput = () => {
        ((ge[o] = +l.value), (f.textContent = r(ge[o])), a(ge[o]), Qi.set(gr, ge));
      }),
      a(ge[o]));
  };
  (t(
    'pSens',
    'oSens',
    'sens',
    (i) => i.toFixed(1),
    (i) => {
      G.settings.sens = i;
    },
  ),
    t(
      'pFov',
      'oFov',
      'fov',
      (i) => i + '\xB0',
      (i) => {
        G.settings.fov = i;
      },
    ),
    (ge.zoom = ge.zoom || 1),
    t(
      'pZoom',
      'oZoom',
      'zoom',
      (i) => i.toFixed(1),
      (i) => {
        G.cam.zoomT = i;
      },
    ));
  let e = () => {
    (($t('pInv').textContent = '\u4E0A\u4E0B\u53CD\u8EE2: ' + (ge.invertY ? 'ON' : 'OFF')),
      ($t('pAuto').textContent = '\u30AB\u30E1\u30E9\u81EA\u52D5\u8FFD\u5F93: ' + (ge.autoCam ? 'ON' : 'OFF')),
      (G.settings.invertY = ge.invertY),
      (G.settings.autoCam = ge.autoCam));
  };
  (($t('pInv').onclick = () => {
    ((ge.invertY = !ge.invertY), Qi.set(gr, ge), e());
  }),
    ($t('pAuto').onclick = () => {
      ((ge.autoCam = !ge.autoCam), Qi.set(gr, ge), e());
    }),
    e(),
    ($t('pCam').onclick = () => W1(ge.camMode + 1, !0)),
    $t('camBtn').addEventListener('click', () => W1(ge.camMode + 1)),
    W1(ge.camMode, !0),
    addEventListener('resize', () => {
      (Wf(), G.paused && drawBig());
    }),
    document.addEventListener('visibilitychange', () => {
      document.hidden && G.started && !G.paused && pause(!0);
    }));
}
function pause(n) {
  n !== G.paused && ((G.paused = n), ($t('pause').hidden = !n), n ? (nc(), fillPause(), openBigMap()) : ((sc = performance.now()), gt.resume()));
}
function interact() {
  if (!G.started || G.paused || G.dying) return;
  if (dialogOpen()) {
    nextLine();
    return;
  }
  if (!$t('stmenu').hidden) return;
  if (GT.phone) {
    togglePhone(!1);
    return;
  }
  if (GT.wheel) {
    toggleWheel(!1);
    return;
  }
  if (P.deck) {
    exitDeck();
    return;
  }
  if (P.mode === 'boat') {
    let t = leave();
    t && toast(t);
    return;
  }
  if (P.mode === 'car') {
    let t = nearGarage();
    if (t) {
      openGarage(t);
      return;
    }
  }
  if (P.interior) {
    let t = updInterior(0);
    t && doAction(t.id, t);
    return;
  }
  if (P.mode === 'train') {
    if (P.train && P.train.drive) {
      P.train.state === 'dwell' && driverInput(P.train, 'go');
      return;
    }
    if (P.train.state === 'dwell') (leaveTrain(), (G.cam.inside = !1));
    else {
      let t = skipToNext(P.train);
      t && (toast(`\u307E\u3082\u306A\u304F ${t.ja}`), gt.chime());
    }
    return;
  }
  if (P.mode === 'ride') {
    let t = Xt.car;
    if (Xt.kind === 'bus') {
      if (t.atStop) (gt.chime(), gh(`${t.atStop.name}\u3067\u964D\u8ECA`));
      else {
        let e = skipBus(t);
        e && (toast(`\u6B21\u306F ${e.name}`), gt.tone(880, 0.15, 0.1, 'sine'));
      }
    } else Xt.dest ? uw() : hw(t);
    return;
  }
  if (P.mode === 'foot') {
    let t = nearMissionStart(P.x, P.z);
    if (t) {
      startMission(t);
      return;
    }
    let e = nearDoor(P.x, P.z);
    if (e) {
      e.act ? Jz(e) : e.type === 'deck' ? enterDeck(e) : e.type === 'property' ? offerProperty(e.prop) : enter(e);
      return;
    }
    let i = nearStop(P.x, P.z);
    if (i) {
      openBusMenu(i);
      return;
    }
    let s = nearBoat(P.x, P.z);
    if (s) {
      let o = board(s);
      o
        ? toast(o)
        : toast(
            P.boatRide
              ? `${s.td.name}\u306B\u4E57\u8239\uFF08\xA5860\uFF09\u3002\u685F\u6A4B\u3067 F \u3067\u4E0B\u8239\u3001Shift \u3067\u65E9\u9001\u308A`
              : `${s.td.name}\u306B\u4E57\u3063\u305F \u2014 W/S \u3067\u524D\u9032\u30FB\u5F8C\u9000\u3001A/D \u3067\u8235`,
          );
      return;
    }
  }
  let n = P.air;
  tryEnter() && n && P.mode === 'foot' && n.kind === 'heliP' && ((n.ref.spin = 0), (n.ref.x = n.x), (n.ref.y = n.y), (n.ref.z = n.z));
}
function MM(n, t, e, i) {
  if ((exit(), !boardTrain(n, t, i))) {
    toast('\u3053\u306E\u99C5\u304B\u3089\u306F\u4E57\u308C\u307E\u305B\u3093');
    return;
  }
  if (((G.cam.inside = !0), e)) {
    let s = P.train;
    ((s.drive = !0),
      (s.notch = 0),
      (s.doors = !0),
      (s.state = 'dwell'),
      (s.dwell = 2),
      (s.target = null),
      (P.trainCar = 0),
      toast(
        oi
          ? '\u904B\u8EE2\u958B\u59CB\uFF1A\u300C\u767A\u8ECA\u300D\u3067\u30C9\u30A2\u3092\u9589\u3081\u3001\u529B\u884C\uFF0F\u30D6\u30EC\u30FC\u30AD\u3067\u52A0\u6E1B\u901F'
          : '\u904B\u8EE2\u958B\u59CB\uFF1AF \u3067\u30C9\u30A2\u3092\u9589\u3081\u3066\u767A\u8ECA\u3001W/S \u3067\u30CE\u30C3\u30C1\u3001Space \u3067\u975E\u5E38\u30D6\u30EC\u30FC\u30AD\u3001L \u3067\u964D\u8ECA',
      ));
  }
}
function Jz(n) {
  if (n.type === 'omairi') {
    if (G.money < 100) {
      toast('\u304A\u8CFD\u92AD\u304C\u3042\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 100), gt.tone(523, 0.5, 0.12, 'sine'), gt.tone(784, 0.7, 0.1, 'sine', null, 0.25));
    let t = Math.random(),
      e = t < 0.08 ? 0 : t < 0.3 ? 1 : t < 0.55 ? 2 : t < 0.8 ? 3 : t < 0.92 ? 4 : 5,
      i = ['\u5927\u5409', '\u4E2D\u5409', '\u5409', '\u5C0F\u5409', '\u672B\u5409', '\u51F6'],
      s = [
        '\u9858\u3044\u3054\u3068\u53F6\u3046\u3067\u3057\u3087\u3046',
        '\u601D\u308F\u306C\u81E8\u6642\u53CE\u5165\u3042\u308A',
        '\u63A2\u3057\u7269\u898B\u3064\u304B\u308B',
        '\u7126\u3089\u305A\u9032\u3081\u3070\u5409',
        '\u904B\u8EE2\u306B\u306F\u6CE8\u610F\u3059\u3079\u3057',
        '\u304A\u307F\u304F\u3058\u3092\u7D50\u3093\u3067\u5384\u843D\u3068\u3057',
      ];
    (e === 0 && ((G.money += 5e3), (P.hp = 100)),
      e === 1 && (G.money += 1e3),
      (G.stats.omairi = (G.stats.omairi || 0) + 1),
      big(
        i[e],
        `${n.label}\u3000${s[e]}${e === 0 ? '\uFF08+\xA55,000\uFF09' : e === 1 ? '\uFF08+\xA51,000\uFF09' : ''}`,
        e < 2 ? '#ffd23f' : e === 5 ? '#9fb0c0' : '#ffffff',
      ));
    return;
  }
  if (n.type === 'view') {
    (gt.tone(1200, 0.08, 0.1, 'square'),
      toast('\u4E8C\u91CD\u6A4B\u3068\u4F0F\u898B\u6AD3\u3092\u80CC\u666F\u306B\u8A18\u5FF5\u64AE\u5F71\u3057\u305F \u{1F4F8}'),
      (G.stats.photos = (G.stats.photos || 0) + 1));
    return;
  }
  if (n.type === 'swing') {
    (toast(
      Be([
        '\u30D6\u30E9\u30F3\u30B3\u3092\u601D\u3044\u304D\u308A\u3053\u3044\u3060',
        '\u5B50\u3069\u3082\u306E\u9803\u3092\u601D\u3044\u51FA\u3057\u305F\u2026',
        '\u7A7A\u304C\u8FD1\u304F\u611F\u3058\u308B',
      ]),
    ),
      (P.hp = Math.min(100, P.hp + 5)));
    return;
  }
  if (n.type === 'cat') {
    (gt.tone(880, 0.12, 0.08, 'triangle'),
      toast(
        Be([
          '\u732B\u300C\u306B\u3083\u30FC\u300D\uFF08\u30B4\u30ED\u30B4\u30ED\u2026\uFF09',
          '\u732B\u306F\u305D\u3063\u307D\u3092\u5411\u3044\u305F',
          '\u732B\u304C\u8DB3\u306B\u3059\u308A\u5BC4\u3063\u3066\u304D\u305F',
          '\u732B\u306F\u7720\u305D\u3046\u306B\u3042\u304F\u3073\u3092\u3057\u305F',
        ]),
      ));
    return;
  }
  if (n.type === 'veg') {
    if (G.money < 100) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 100),
      (P.hp = Math.min(100, P.hp + 20)),
      gt.cash(),
      toast(
        Be([
          '\u63A1\u308C\u305F\u3066\u306E\u30C8\u30DE\u30C8\u3092\u8CB7\u3063\u305F',
          '\u304D\u3085\u3046\u308A\u30923\u672C\u8CB7\u3063\u305F',
          '\u671D\u63A1\u308A\u306E\u30CA\u30B9\u3092\u8CB7\u3063\u305F',
          '\u5C0F\u677E\u83DC\u3092\u4E00\u675F\u8CB7\u3063\u305F',
        ]) + '\uFF08\u4F53\u529B\u56DE\u5FA9\uFF09 \u2212\xA5100',
      ));
    return;
  }
}
function Zz() {
  let n = W.bld,
    t = 0,
    e = 0,
    i = (s, o) =>
      W.lmCol.some((r) => {
        if (Math.abs(r.x - s) > r.rad + 2 || Math.abs(r.z - o) > r.rad + 2 || (r.y0 || 0) > 2) return !1;
        let a = Math.cos(r.rot || 0),
          l = Math.sin(r.rot || 0),
          f = s - r.x,
          u = o - r.z;
        return Math.abs(f * a + u * l) < r.w / 2 + 0.4 && Math.abs(-f * l + u * a) < r.d / 2 + 0.4;
      });
  for (let s of DOORS) {
    if (s.y > 2 || s.type === 'deck') continue;
    let o = [];
    buildingsNear(s.x, s.z, 40, o);
    for (let r of o) {
      let a = r * 9;
      if (n[a + 6] < 1) continue;
      let l = Math.cos(n[a + 2]),
        f = Math.sin(n[a + 2]),
        u = s.x - n[a],
        c = s.z - n[a + 1];
      if (Math.abs(u * l + c * f) < n[a + 3] / 2 - 0.2 && Math.abs(-u * f + c * l) < n[a + 4] / 2 - 0.2) {
        if (s.brand || s.venue || s.type === 'property') continue;
        (clearBuilding(a), e++);
      }
    }
    if (i(s.x, s.z) || isWaterAt(s.x, s.z))
      t: for (let r = 1.5; r <= 30; r += 1.5)
        for (let a = 0; a < 16; a++) {
          let l = (a / 16) * Math.PI * 2,
            f = s.x + Math.cos(l) * r,
            u = s.z + Math.sin(l) * r;
          if (!i(f, u) && !isWaterAt(f, u)) {
            ((s.x = f), (s.z = u), t++);
            break t;
          }
        }
  }
  console.log('doors fixed', t, e);
}
var ro = (n) => (G.money < n ? (toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093'), !1) : ((G.money -= n), gt.cash(), !0)),
  oa = (n) => {
    R.tod = (R.tod + n) % 24;
  };
function doAction(n, t) {
  let e = P.interior;
  if (n === 'exit') exit();
  else if (n === 'save') saveGame();
  else if (n === 'buy') {
    if (G.money < 150) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 150),
      (P.hp = 100),
      gt.cash(),
      toast('\u304A\u306B\u304E\u308A\u3092\u8CB7\u3063\u305F\uFF08\u4F53\u529B\u56DE\u5FA9\uFF09 \u2212\xA5150'),
      missionEvent('buy'));
  } else if (n === 'gunshop') gunShopMenu();
  else if (n === 'coffee') {
    if (G.money < 450) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 450),
      (P.hp = Math.min(100, P.hp + 30)),
      gt.cash(),
      toast(
        Be([
          '\u30AB\u30D5\u30A7\u30E9\u30C6',
          '\u30C9\u30EA\u30C3\u30D7\u30B3\u30FC\u30D2\u30FC',
          '\u62B9\u8336\u30E9\u30C6',
          '\u30AD\u30E3\u30E9\u30E1\u30EB\u30D5\u30E9\u30DA\u30C1\u30FC\u30CE',
        ]) + '\u3092\u98F2\u3093\u3060\uFF08\u4F53\u529B +30\uFF09 \u2212\xA5450',
      ));
  } else if (n === 'ramen') {
    if (G.money < 900) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 900),
      (P.hp = 100),
      gt.cash(),
      toast(
        Be([
          '\u3068\u3093\u3053\u3064\u30E9\u30FC\u30E1\u30F3',
          '\u91A4\u6CB9\u30E9\u30FC\u30E1\u30F3',
          '\u5473\u564C\u30E9\u30FC\u30E1\u30F3',
          '\u3064\u3051\u9EBA',
        ]) + '\u3092\u98DF\u3079\u305F\uFF08\u4F53\u529B\u56DE\u5FA9\uFF09 \u2212\xA5900',
      ));
  } else if (n === 'karaoke') {
    if (G.money < 1e3) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 1e3),
      gt.cash(),
      [523, 587, 659, 784, 659, 587, 523, 659, 784, 880].forEach((s, o) => gt.tone(s, 0.3, 0.12, 'triangle', null, o * 0.28)),
      (R.tod = (R.tod + 1) % 24));
    let i = Math.round(70 + Math.random() * 30);
    (toast(
      `\u71B1\u5531\u3057\u305F\uFF01 \u63A1\u70B9 ${i} \u70B9${i >= 95 ? '\uFF08\u5E97\u5185\u30E9\u30F3\u30AD\u30F3\u30B01\u4F4D\uFF01 +\xA53,000\uFF09' : ''}`,
    ),
      i >= 95 && (G.money += 3e3));
  } else if (n === 'crane') {
    if (G.money < 200) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 200),
      gt.tone(600, 0.4, 0.08, 'square', 300),
      Math.random() < 0.22
        ? ((G.stats.prizes = (G.stats.prizes || 0) + 1),
          toast(
            `${Be(['\u306C\u3044\u3050\u308B\u307F', '\u30D5\u30A3\u30AE\u30E5\u30A2', '\u304A\u83D3\u5B50\u306E\u8A70\u3081\u5408\u308F\u305B', '\u30AF\u30C3\u30B7\u30E7\u30F3'])}\u3092\u30B2\u30C3\u30C8\uFF01\uFF08\u666F\u54C1 ${G.stats.prizes} \u500B\uFF09`,
          ),
          gt.mission())
        : toast(
            Be(['\u60DC\u3057\u3044\uFF01', '\u30A2\u30FC\u30E0\u304C\u5F31\u3044\u2026', '\u3082\u3046\u5C11\u3057\u3067\u53D6\u308C\u305D\u3046']) +
              ' \u2212\xA5200',
          ));
  } else if (n === 'fight') {
    if (G.money < 100) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    G.money -= 100;
    let i = Math.random() < 0.45;
    (toast(i ? '\u5BFE\u6226\u306B\u52DD\u5229\uFF01 \u4E71\u5165\u8005\u3092\u6483\u7834\u3057\u305F' : '\u8CA0\u3051\u305F\u2026 \u2212\xA5100'),
      gt.tone(i ? 880 : 220, 0.4, 0.1, 'square'));
  } else if (n === 'drug')
    listMenu(
      '\u30C9\u30E9\u30C3\u30B0\u30B9\u30C8\u30A2',
      [
        {
          label: '\u6804\u990A\u30C9\u30EA\u30F3\u30AF',
          sub: '\u4F53\u529B +40\u3000\xA5300',
          color: '#ffe600',
          buttons: [
            {
              text: '\u8CB7\u3046',
              fn: () => {
                if (G.money < 300) return toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
                ((G.money -= 300), (P.hp = Math.min(100, P.hp + 40)), gt.cash());
              },
            },
          ],
        },
        {
          label: '\u6551\u6025\u30BB\u30C3\u30C8',
          sub: '\u4F53\u529B \u5168\u56DE\u5FA9\u3000\xA51,200',
          color: '#d4121f',
          buttons: [
            {
              text: '\u8CB7\u3046',
              fn: () => {
                if (G.money < 1200) return toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
                ((G.money -= 1200), (P.hp = 100), gt.cash());
              },
            },
          ],
        },
        {
          label: '\u30B5\u30F3\u30B0\u30E9\u30B9\uFF06\u30DE\u30B9\u30AF',
          sub: '\u5909\u88C5\uFF08\u624B\u914D\u5EA6 \u22121\uFF09\u3000\xA53,000',
          color: '#1d2c4a',
          buttons: [
            {
              text: '\u8CB7\u3046',
              fn: () => {
                if (G.money < 3e3) return toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
                ((G.money -= 3e3), (G.heat = Math.max(0, G.heat - 1)), gt.cash(), toast('\u5909\u88C5\u3057\u305F'));
              },
            },
          ],
        },
      ],
      '\u9589\u3058\u308B',
    );
  else if (n === 'lecture') {
    (oa(1.5), (G.stats.study = (G.stats.study || 0) + 1));
    let i = Be([
      '\u7D4C\u6E08\u5B66',
      '\u6CD5\u5B66',
      '\u60C5\u5831\u5DE5\u5B66',
      '\u65E5\u672C\u6587\u5B66',
      '\u7269\u7406\u5B66',
      '\u5FC3\u7406\u5B66',
      '\u5EFA\u7BC9\u5B66',
      '\u7D71\u8A08\u5B66',
    ]);
    (toast(`${i}\u306E\u8B1B\u7FA9\u3092\u53D7\u3051\u305F\uFF08\u53D7\u8B1B ${G.stats.study} \u56DE\uFF09`),
      G.stats.study % 5 === 0 &&
        ((G.money += 1e4),
        big('\u5358\u4F4D\u53D6\u5F97\uFF01', '\u6210\u7E3E\u512A\u79C0\u3067\u5968\u5B66\u91D1 +\xA510,000', '#b48cff'),
        gt.mission()));
  } else if (n === 'library')
    (oa(2),
      (G.stats.study = (G.stats.study || 0) + 1),
      saveGame(!0),
      toast('\u9759\u304B\u306A\u56F3\u66F8\u9928\u3067\u52C9\u5F37\u3057\u305F\uFF08\u30BB\u30FC\u30D6\u3057\u307E\u3057\u305F\uFF09'));
  else if (n === 'gakushoku') {
    if (!ro(450)) return;
    ((P.hp = 100),
      toast(
        Be([
          '\u30AB\u30C4\u30AB\u30EC\u30FC',
          '\u65E5\u66FF\u308F\u308A\u5B9A\u98DF',
          '\u304D\u3064\u306D\u3046\u3069\u3093',
          '\u5510\u63DA\u3052\u4E3C',
        ]) + '\u3092\u98DF\u3079\u305F\uFF08\u4F53\u529B\u56DE\u5FA9\uFF09 \u2212\xA5450',
      ));
  } else if (n === 'class')
    (oa(0.9),
      (G.stats.study = (G.stats.study || 0) + 1),
      toast(
        Be(['\u56FD\u8A9E', '\u6570\u5B66', '\u82F1\u8A9E', '\u7406\u79D1', '\u793E\u4F1A', '\u97F3\u697D', '\u4F53\u80B2']) +
          '\u306E\u6388\u696D\u3092\u53D7\u3051\u305F',
      ),
      gt.chime());
  else if (n === 'pan') {
    if (!ro(200)) return;
    ((P.hp = Math.min(100, P.hp + 40)),
      toast(
        Be([
          '\u713C\u304D\u305D\u3070\u30D1\u30F3',
          '\u30E1\u30ED\u30F3\u30D1\u30F3',
          '\u30AB\u30EC\u30FC\u30D1\u30F3',
          '\u30B3\u30ED\u30C3\u30B1\u30D1\u30F3',
        ]) + '\u3092\u8CB7\u3063\u305F\uFF08\u4F53\u529B +40\uFF09 \u2212\xA5200',
      ));
  } else if (n === 'show') {
    let i = e.door,
      s = i.fee || 0;
    if (s && !ro(s)) return;
    (oa(e.room.type === 'hall' ? 2.5 : 1.2),
      (P.hp = 100),
      (G.stats.shows = (G.stats.shows || 0) + 1),
      e.room.type === 'hall'
        ? [392, 523, 659, 784, 1046, 784, 1046].forEach((o, r) => gt.tone(o, 0.35, 0.1, 'triangle', null, r * 0.22))
        : gt.chime(),
      big(i.show || '\u898B\u5B66', `${i.label} \u3092\u697D\u3057\u3093\u3060\uFF08\u4F53\u529B\u56DE\u5FA9\uFF09`, '#ffd23f'));
  } else if (n === 'goods') {
    if (!ro(2500)) return;
    toast(
      Be([
        '\u516C\u5F0F\u30BF\u30AA\u30EB',
        '\u30C4\u30A2\u30FCT\u30B7\u30E3\u30C4',
        '\u30DA\u30F3\u30E9\u30A4\u30C8',
        '\u30A2\u30AF\u30EA\u30EB\u30B9\u30BF\u30F3\u30C9',
      ]) + '\u3092\u8CB7\u3063\u305F \u2212\xA52,500',
    );
  } else if (n === 'mshop') {
    if (!ro(1500)) return;
    toast(
      Be([
        '\u56F3\u9332',
        '\u30DD\u30B9\u30C8\u30AB\u30FC\u30C9\u30BB\u30C3\u30C8',
        '\u9650\u5B9A\u30C8\u30FC\u30C8\u30D0\u30C3\u30B0',
        '\u30DF\u30CB\u30C1\u30E5\u30A2',
      ]) + '\u3092\u8CB7\u3063\u305F \u2212\xA51,500',
    );
  } else if (n === 'izakaya') {
    if (!ro(2500)) return;
    (oa(2),
      (P.hp = 100),
      toast(
        Be([
          '\u713C\u304D\u9CE5\u3068\u751F\u30D3\u30FC\u30EB',
          '\u523A\u8EAB\u76DB\u308A\u5408\u308F\u305B\u3068\u30CF\u30A4\u30DC\u30FC\u30EB',
          '\u3082\u3064\u716E\u8FBC\u307F\u3068\u30EC\u30E2\u30F3\u30B5\u30EF\u30FC',
          '\u5510\u63DA\u3052\u3068\u65E5\u672C\u9152',
        ]) + '\u3092\u697D\u3057\u3093\u3060\uFF08\u4F53\u529B\u56DE\u5FA9\uFF09 \u2212\xA52,500',
      ));
  } else if (n === 'sento') {
    if (!ro(520)) return;
    (oa(1),
      (P.hp = 100),
      (P.armor = Math.max(P.armor || 0, 10)),
      toast('\u3044\u3044\u6E6F\u3060\u3063\u305F\u2026\uFF08\u4F53\u529B\u5168\u56DE\u5FA9\uFF09 \u2212\xA5520'));
  } else if (n === 'milk') {
    if (!ro(150)) return;
    ((P.hp = Math.min(100, P.hp + 15)),
      toast('\u8170\u306B\u624B\u3092\u5F53\u3066\u3066\u30B3\u30FC\u30D2\u30FC\u725B\u4E73\u3092\u98F2\u3093\u3060 \u2212\xA5150'));
  } else if (n === 'capsule') {
    if (!ro(3500)) return;
    ((R.tod = 8),
      (P.hp = 100),
      saveGame(!0),
      big(
        '\u7FCC\u671D',
        '08:00 \u2014 \u30AB\u30D7\u30BB\u30EB\u30DB\u30C6\u30EB\u3067\u4E00\u6CCA\uFF08\u30BB\u30FC\u30D6\u3057\u307E\u3057\u305F\uFF09',
        '#b8b0ff',
      ));
  } else if (n === 'book')
    (oa(0.5),
      toast(
        Be([
          '\u30D2\u30F3\u30C8\uFF1A\u6D88\u9632\u8ECA\u304C\u6765\u306A\u3044\u5927\u706B\u707D\u306F\u653E\u6C34\u3067\u3057\u304B\u6D88\u3048\u306A\u3044\u3002\u8FD1\u3065\u304D\u3059\u304E\u306B\u6CE8\u610F',
          '\u30D2\u30F3\u30C8\uFF1A\u96FB\u8ECA\u30FB\u30D0\u30B9\u306F F \u3067\u4E00\u99C5\uFF08\u4E00\u505C\u7559\u6240\uFF09\u305A\u3064\u5148\u3078\u9032\u3081\u308B',
          '\u30D2\u30F3\u30C8\uFF1A\u30BF\u30AF\u30B7\u30FC\u3067\u76EE\u7684\u5730\u3092\u9078\u3076\u3068\u30B9\u30AD\u30C3\u30D7\u3067\u79FB\u52D5\u3067\u304D\u308B',
          '\u30D2\u30F3\u30C8\uFF1A\u5857\u88C5\u30B7\u30E7\u30C3\u30D7\u3067\u8ECA\u306E\u8272\u3092\u5909\u3048\u308B\u3068\u624B\u914D\u5EA6\u304C\u6D88\u3048\u308B',
          '\u30D2\u30F3\u30C8\uFF1A\u30DF\u30CB\u30DE\u30C3\u30D7\u3092\u30BF\u30C3\u30D7\uFF08M \u30AD\u30FC\uFF09\u3067\u5168\u4F53\u5730\u56F3\u3001\u5730\u56F3\u4E0A\u3067\u76EE\u7684\u5730\u3092\u8A2D\u5B9A',
          '\u30D2\u30F3\u30C8\uFF1A\u5927\u5B66\u3067\u8B1B\u7FA9\u30925\u56DE\u53D7\u3051\u308B\u3068\u5968\u5B66\u91D1\u304C\u3082\u3089\u3048\u308B',
          '\u30D2\u30F3\u30C8\uFF1A\u30B8\u30E0\u3067\u935B\u3048\u308B\u3068\u53D7\u3051\u308B\u30C0\u30E1\u30FC\u30B8\u304C\u6E1B\u308B',
          '\u30D2\u30F3\u30C8\uFF1A\u30AB\u30D7\u30BB\u30EB\u30DB\u30C6\u30EB\u3084\u81EA\u5B85\u3067\u7720\u308B\u3068\u30BB\u30FC\u30D6\u3067\u304D\u308B',
          '\u30D2\u30F3\u30C8\uFF1A\u9996\u90FD\u9AD8\u306E\u5165\u53E3\u30E9\u30F3\u30D7\u306F\u4E00\u822C\u9053\u306E\u8107\u304B\u3089\u3086\u308B\u3084\u304B\u306B\u4E0A\u3063\u3066\u3044\u308B',
          '\u30D2\u30F3\u30C8\uFF1A\u624B\u914D\u4E2D\u306F\u5730\u56F3\u306E\u8D64\u3044\u5186\u306E\u5916\u3078\u9003\u3052\u3066\u8EAB\u3092\u96A0\u305D\u3046',
        ]),
      ));
  else if (n === 'guide') {
    if (!ro(1200)) return;
    let i = Object.values(W.landmarks).filter((o) => o.name && Math.hypot(o.x - e.back.x, o.z - e.back.z) > 600),
      s = Be(i.length ? i : Object.values(W.landmarks).filter((o) => o.name));
    s &&
      ((G.waypoint = [s.x, s.z]),
      toast(`\u304A\u3059\u3059\u3081\u30B9\u30DD\u30C3\u30C8\uFF1A${s.name}\uFF08\u76EE\u7684\u5730\u306B\u8A2D\u5B9A\uFF09`));
  } else if (n === 'gym') {
    if (!ro(800)) return;
    (oa(1),
      (G.stats.fit = Math.min(10, (G.stats.fit || 0) + 1)),
      (P.hp = 100),
      toast(
        `\u30C8\u30EC\u30FC\u30CB\u30F3\u30B0\u5B8C\u4E86\uFF01 \u4F53\u529B\u30EC\u30D9\u30EB ${G.stats.fit}\uFF08\u88AB\u30C0\u30E1\u30FC\u30B8 \u2212${G.stats.fit * 3}%\uFF09`,
      ));
  } else if (n === 'sleep')
    ((R.tod = 8), (P.hp = 100), saveGame(!0), big('\u7FCC\u671D', '08:00 \u2014 \u30BB\u30FC\u30D6\u3057\u307E\u3057\u305F', '#ffd23f'));
  else if (n === 'trains') {
    let i = (e.door.stations || [e.door.S]).filter(Boolean);
    if (!i.length) {
      toast('\u8FD1\u304F\u306B\u99C5\u304C\u3042\u308A\u307E\u305B\u3093');
      return;
    }
    let s = (o) =>
      stationMenu(o, (r, a) => {
        closeStationMenu();
        let l = o.lines.find((u) => u.rail === r)?.st,
          f = [
            {
              label: '\u5404\u99C5\u505C\u8ECA\u306B\u4E57\u308B',
              sub: 'F \u3067\u4E00\u99C5\u305A\u3064\u9032\u3081\u308B\u30FBShift \u3067\u65E9\u9001\u308A',
              color: '#80c241',
              buttons: [
                {
                  text: '\u4E57\u308B',
                  fn: () => MM(r, a, !1, null),
                },
              ],
            },
          ];
        (r.expSt &&
          l &&
          r.expSt.has(l) &&
          f.push({
            label: `${r.expName}\u306B\u4E57\u308B`,
            sub: `\u505C\u8ECA\u99C5\uFF1A${[...r.expSt]
              .map((u) => u.ja)
              .slice(0, 8)
              .join('\u30FB')}`,
            color: '#e5402b',
            buttons: [
              {
                text: '\u4E57\u308B',
                fn: () => MM(r, a, !1, r.expName),
              },
            ],
          }),
          listMenu(
            `${r.ja}`,
            [
              ...f,
              {
                label: '\u904B\u8EE2\u58EB\u3068\u3057\u3066\u904B\u8EE2\u3059\u308B',
                sub: 'W/S \u3067\u30CE\u30C3\u30C1\u3001Space \u3067\u975E\u5E38\u30D6\u30EC\u30FC\u30AD\u3001\u505C\u6B62\u4F4D\u7F6E\u306B\u5408\u308F\u305B\u3066\u6B62\u3081\u308B\u3068\u5831\u916C',
                color: '#ffd23f',
                buttons: [
                  {
                    text: '\u904B\u8EE2\u3059\u308B',
                    fn: () => MM(r, a, !0),
                  },
                ],
              },
            ],
            '\u623B\u308B',
          ));
      });
    i.length === 1
      ? s(i[0])
      : listMenu(
          '\u9244\u9053\u306E\u308A\u3070',
          i.map((o) => ({
            label: o.ja + '\u99C5',
            sub: o.lines.map((r) => r.rail.ja).join('\u30FB'),
            color: '#e5402b',
            buttons: [
              {
                text: '\u9078\u3076',
                fn: () => s(o),
              },
            ],
          })),
          '\u623B\u308B',
        );
  } else if (n === 'limo' || n === 'taxistand') {
    let i = TERMS.find((s) => s.id === e.door.tid) || TERMS[0];
    if ((exit(), n === 'limo')) {
      let s = STOPS['hnd' + i.id.slice(1)];
      if (s) {
        let [o, r] = s.sides[0];
        ((P.x = o), (P.z = r), (P.yaw = Math.atan2(s.dx, s.dz)), openBusMenu(s));
      } else toast('\u30EA\u30E0\u30B8\u30F3\u30D0\u30B9\u306F\u904B\u4F11\u4E2D\u3067\u3059');
    } else callTaxi();
  } else if (n === 'clothes') {
    let i = [
      ['\u30CD\u30A4\u30D3\u30FC\u306E\u30B8\u30E3\u30B1\u30C3\u30C8', 2042436],
      ['\u767D\u3044\u30B7\u30E3\u30C4', 15921902],
      ['\u9ED2\u306E\u30D1\u30FC\u30AB\u30FC', 1710622],
      ['\u8D64\u3044\u30B9\u30BF\u30B8\u30E3\u30F3', 11740702],
      ['\u30D9\u30FC\u30B8\u30E5\u306E\u30B3\u30FC\u30C8', 13219994],
      ['\u30B0\u30EA\u30FC\u30F3\u306E\u30D6\u30EB\u30BE\u30F3', 4876858],
      ['\u30D4\u30F3\u30AF\u306E\u30CB\u30C3\u30C8', 15247544],
      ['\u30A4\u30A8\u30ED\u30FC\u306ET\u30B7\u30E3\u30C4', 15909424],
    ];
    listMenu(
      `${e.door.label}\u3000\u6D0B\u670D\u58F2\u308A\u5834`,
      i.map(([s, o]) => ({
        label: s,
        sub: '\xA53,000',
        color: '#' + o.toString(16).padStart(6, '0'),
        buttons: [
          {
            text: '\u8CB7\u3063\u3066\u7740\u308B',
            fn: () => {
              if (G.money < 3e3) {
                toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
                return;
              }
              ((G.money -= 3e3), setPlayerColor(o), gt.cash(), toast(`${s}\u306B\u7740\u66FF\u3048\u305F \u2212\xA53,000`), saveGame(!0));
            },
          },
        ],
      })),
      '\u9589\u3058\u308B',
    );
  } else if (n === 'eat') {
    if (G.money < 800) {
      toast('\u304A\u91D1\u304C\u8DB3\u308A\u307E\u305B\u3093');
      return;
    }
    ((G.money -= 800),
      (P.hp = 100),
      gt.cash(),
      toast(
        Be([
          '\u30E9\u30FC\u30E1\u30F3\u3092\u98DF\u3079\u305F',
          '\u30AB\u30EC\u30FC\u3092\u98DF\u3079\u305F',
          '\u725B\u4E3C\u3092\u98DF\u3079\u305F',
          '\u30D1\u30B9\u30BF\u3092\u98DF\u3079\u305F',
        ]) + '\uFF08\u4F53\u529B\u56DE\u5FA9\uFF09 \u2212\xA5800',
      ));
  } else if (n === 'pachinko')
    ((G.minigame = !0),
      nc(),
      J_(e.door.label, (i) => {
        ((G.minigame = !1),
          (sc = performance.now()),
          toast(
            i > 0
              ? `+\xA5${i.toLocaleString('ja-JP')} \u306E\u52DD\u3061\uFF01`
              : i < 0
                ? `\xA5${(-i).toLocaleString('ja-JP')} \u8CA0\u3051\u305F\u2026`
                : '\u307E\u305F\u3069\u3046\u305E',
          ),
          saveGame(!0));
      }));
  else if (n === 'bet') {
    let i = e.door.vtype;
    ((G.minigame = !0),
      nc(),
      Z_(i === 'boat' ? 'boat' : 'horse', e.door.label, (s) => {
        ((G.minigame = !1),
          (sc = performance.now()),
          s &&
            toast(
              s > 0 ? `+\xA5${s.toLocaleString('ja-JP')} \u306E\u52DD\u3061\uFF01` : `\xA5${(-s).toLocaleString('ja-JP')} \u8CA0\u3051\u305F\u2026`,
            ),
          saveGame(!0));
      }));
  } else if (n === 'fly') {
    let i = e.door.T;
    exit();
    let s = null,
      o = 1e9;
    for (let r of G.aircraft)
      if (r.kind === 'parked') {
        let a = Math.hypot(r.x - i[0], r.z - i[1]);
        a < o && ((o = a), (s = r));
      }
    s
      ? ((P.x = s.x + 4), (P.z = s.z), (P.y = 0.2), tryEnter())
      : toast('\u642D\u4E57\u3067\u304D\u308B\u6A5F\u4F53\u304C\u3042\u308A\u307E\u305B\u3093');
  }
}
var Xt = RIDE,
  fw = (n) => (/リムジン/.test(n.code) ? 1e3 : 210);
function openBusMenu(n) {
  let t = busDestinations(n).map((e) => ({
    label: `${e.Rt.code}  ${e.toward.name} \u884C\u304D`,
    sub: e.Rt.title,
    color: '#' + (e.Rt.color || 3115598).toString(16).padStart(6, '0'),
    buttons: e.list.slice(0, 6).map((i) => ({
      text: i.name.replace(/駅前$/, ''),
      fn: () => {
        callBus(n, e.Rt, i)
          ? toast(
              `${e.Rt.code} ${e.toward.name}\u884C\u304D\u3092\u5F85\u3063\u3066\u3044\u307E\u3059\uFF08${i.name}\u307E\u3067 \xA5${fw(e.Rt).toLocaleString('ja-JP')}\uFF09`,
            )
          : toast('\u3044\u307E\u306F\u30D0\u30B9\u304C\u6765\u307E\u305B\u3093');
      },
    })),
  }));
  listMenu(`\u30D0\u30B9\u505C\u300C${n.name}\u300D`, t, '\u9589\u3058\u308B');
}
function callTaxi() {
  if (Xt.taxiWait && !Xt.taxiWait.removed) {
    toast('\u30BF\u30AF\u30B7\u30FC\u3092\u547C\u3093\u3067\u3044\u307E\u3059\u2026');
    return;
  }
  let n = hailTaxi(P.x, P.z);
  n
    ? ((Xt.taxiWait = n),
      toast('\u30BF\u30AF\u30B7\u30FC\u3092\u547C\u3073\u307E\u3057\u305F\u3002\u9053\u8DEF\u8107\u3067\u5F85\u3061\u307E\u3057\u3087\u3046'),
      gt.tone(1200, 0.08, 0.1, 'square'))
    : toast('\u8FD1\u304F\u306B\u30BF\u30AF\u30B7\u30FC\u304C\u3044\u307E\u305B\u3093');
}
function Z6(n, t) {
  ((P.mode = 'ride'), (P.car = n), (Xt.car = n), (Xt.kind = t), (n.keep = !0), (n.passenger = !0), (G.cam.snap = !0), gt.door());
}
function gh(n) {
  let t = Xt.car;
  if (!t) return;
  let e = -Math.cos(t.yaw),
    i = Math.sin(t.yaw),
    s =
      Math.sign(
        laneOff(
          t.e || {
            hw: 4,
            lanes: 1,
            kind: 'B',
          },
          t.dir || 1,
          0,
        ),
      ) || 1;
  ((P.x = t.x + e * (t.td.W / 2 + 0.9)),
    (P.z = t.z + i * (t.td.W / 2 + 0.9)),
    (P.y = 0.2),
    (P.mode = 'foot'),
    (P.car = null),
    (t.keep = !1),
    (t.passenger = !1),
    Xt.kind === 'taxi' ? releaseTaxi(t) : (t.hold = !1),
    (Xt.car = null),
    (Xt.kind = null),
    (Xt.dest = null),
    (G.rideInfo = null),
    gt.door(),
    n && toast(n),
    (G.cam.snap = !0));
}
function hw(n) {
  let t = [],
    e = MS.target || G.waypoint,
    i = (s, o, r) => [
      {
        text: '\u4E57\u3063\u3066\u3044\u304F',
        fn: () => Q6(n, s, o, r),
      },
      {
        text: '\u3059\u3050\u5230\u7740',
        fn: () => {
          (Q6(n, s, o, r), Xt.dest && uw());
        },
      },
    ];
  e &&
    t.push({
      label: '\u5730\u56F3\u306E\u76EE\u7684\u5730\u3078',
      sub: districtAt(e[0], e[1]).n,
      color: '#c46cff',
      buttons: i(e[0], e[1], districtAt(e[0], e[1]).n),
    });
  for (let s of taxiPlaces())
    t.push({
      label: s.name,
      sub: `\u7D04 ${((Math.hypot(s.x - n.x, s.z - n.z) * 1.3) / 1e3).toFixed(1)} km\u3000\u76EE\u5B89 \xA5${taxiFare(Math.hypot(s.x - n.x, s.z - n.z) * 1.35).toLocaleString('ja-JP')}`,
      color: '#f2c230',
      buttons: i(s.x, s.z, s.name),
    });
  listMenu('\u30BF\u30AF\u30B7\u30FC\u300C\u3069\u3061\u3089\u307E\u3067\uFF1F\u300D', t, '\u3084\u3063\u3071\u308A\u964D\u308A\u308B', () => gh());
}
function Q6(n, t, e, i) {
  if (
    !taxiTo(n, t, e, () => {
      let s = taxiFare(Xt.meter || 0);
      ((G.money = Math.max(0, G.money - s)), gt.cash(), gh(`${i}\u306B\u5230\u7740\u3000\u904B\u8CC3 \xA5${s.toLocaleString('ja-JP')}`));
    })
  ) {
    toast('\u305D\u3053\u3078\u306F\u884C\u3051\u307E\u305B\u3093');
    return;
  }
  ((Xt.dest = {
    x: t,
    z: e,
    name: i,
  }),
    (Xt.meter = 0),
    toast(`\u300C${i}\u307E\u3067\u3067\u3059\u306D\u3001\u304B\u3057\u3053\u307E\u308A\u307E\u3057\u305F\u300D`));
}
function uw() {
  let n = Xt.car,
    t = Xt.dest;
  if (!n || !t) return;
  let e = (Xt.meter || 0) + Math.hypot(t.x - n.x, t.z - n.z) * 1.35,
    i = taxiFare(e);
  ((G.money = Math.max(0, G.money - i)),
    gt.cash(),
    releaseTaxi(n),
    (n.keep = !1),
    (n.passenger = !1),
    (P.mode = 'foot'),
    (P.car = null),
    (Xt.car = null),
    (Xt.kind = null),
    (G.rideInfo = null),
    placeNearRoad(t.x, t.z),
    toast(`${t.name}\u306B\u5230\u7740\u3000\u904B\u8CC3 \xA5${i.toLocaleString('ja-JP')}`),
    (Xt.dest = null));
}
function Qz(n, t) {
  let e = Xt.wait;
  if (e) {
    let s = e.bus;
    if (s.removed) ((Xt.wait = null), toast('\u30D0\u30B9\u304C\u6765\u306A\u304F\u306A\u3063\u305F\u2026'));
    else if (P.mode !== 'foot' || Math.hypot(P.x - e.S.x, P.z - e.S.z) > 40) ((Xt.wait = null), (s.hold = !1));
    else if (s.atStop === e.S && Math.hypot(s.x - P.x, s.z - P.z) < 30) {
      Xt.wait = null;
      let o = fw(e.Rt);
      ((G.money = Math.max(0, G.money - o)),
        gt.cash(),
        Z6(s, 'bus'),
        (Xt.dest = e.D),
        (s.hold = !1),
        toast(
          `${e.Rt.code} \u306B\u4E57\u8ECA\uFF08\xA5${o.toLocaleString('ja-JP')}\uFF09\u3002F \u3067\u6B21\u306E\u505C\u7559\u6240\u3067\u964D\u8ECA\u3001Shift \u3067\u65E9\u9001\u308A`,
        ));
    } else
      s.atStop === e.S
        ? (s.hold = !0)
        : ((e.t = (e.t || 0) + n), e.t > 7 && Math.hypot(s.x - e.S.x, s.z - e.S.z) > 25 && ((e.t = 0), (s.mi = e.mi), skipBus(s), (s.mi = e.mi)));
  }
  if (Xt.taxiWait) {
    let s = Xt.taxiWait;
    s.removed
      ? (Xt.taxiWait = null)
      : P.mode !== 'foot'
        ? ((Xt.taxiWait = null), releaseTaxi(s))
        : s.waiting && Math.hypot(s.x - P.x, s.z - P.z) < 24
          ? ((Xt.taxiWait = null), Z6(s, 'taxi'), hw(s))
          : ((s.waitT = (s.waitT || 0) + n),
            s.waitT > 9 && !s.waiting && s.pick && s.mode === 'ai' && ((s.waitT = 0), placeOnEdge(s, s.pick.e, s.pick.s, 18)));
  }
  if (P.mode !== 'ride' || !Xt.car) return;
  let i = Xt.car;
  if ((i.mode !== 'ai' ? (i.physT = (i.physT || 0) + n) : (i.physT = 0), i.removed || i.dead || i.burn > 0 || i.physT > 14)) {
    gh(
      i.dead || i.burn > 0
        ? '\u8ECA\u304C\u58CA\u308C\u305F\u306E\u3067\u964D\u308A\u305F'
        : '\u4E8B\u6545\u3067\u8D70\u308C\u306A\u304F\u306A\u3063\u305F\u306E\u3067\u964D\u308A\u305F',
    );
    return;
  }
  if (
    ((P.x = i.x),
    (P.z = i.z),
    (P.y = i.y),
    Xt.kind === 'taxi' &&
      Xt.dest &&
      ((Xt.meter = (Xt.meter || 0) + Math.abs(i.v) * n),
      (G.rideInfo = {
        top: '\u30BF\u30AF\u30B7\u30FC \u2014 F \u3067\u30B9\u30AD\u30C3\u30D7',
        main: Xt.dest.name + ' \u307E\u3067',
        sub: `\u904B\u8CC3 \xA5${taxiFare(Xt.meter).toLocaleString('ja-JP')}\u3000${(Math.hypot(Xt.dest.x - i.x, Xt.dest.z - i.z) / 1e3).toFixed(1)} km`,
        color: '#f2c230',
      })),
    Xt.kind === 'bus')
  ) {
    let s = i.route,
      o = s.marks[i.mi % s.marks.length];
    ((G.rideInfo = {
      top: i.atStop
        ? '\u305F\u3060\u3044\u307E\u505C\u8ECA\u4E2D \u2014 F \u3067\u964D\u8ECA'
        : '\u6B21\u306F\uFF08F \u3067\u6B21\u306E\u505C\u7559\u6240\u3078\uFF09',
      main: i.atStop ? i.atStop.name : o ? o.stop.name : '',
      sub: `${s.code}\u3000${s.title}${Xt.dest ? '\u3000\uFF08' + Xt.dest.name + '\u3067\u964D\u8ECA\uFF09' : ''}`,
      color: '#' + s.color.toString(16).padStart(6, '0'),
    }),
      i.atStop && Xt.dest && i.atStop === Xt.dest && (gt.chime(), gh(`${i.atStop.name}\u3067\u964D\u8ECA`)));
  }
}
var yM = 0,
  tw = '';
function t7() {
  let n = oi ? '\u4E57\u308B' : 'F',
    t = (l) => `<kbd>${n}</kbd>${l}`;
  if (dialogOpen()) return '';
  if (P.interior) {
    let l = updInterior(0);
    return l ? t(l.label.replace(/^F：/, '')) : '';
  }
  if (P.deck) return t('\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC\u3067\u5730\u4E0A\u3078\u964D\u308A\u308B');
  if (P.mode === 'boat')
    return P.boatRide
      ? P.boat.atPier
        ? t('\u4E0B\u8239\u3059\u308B')
        : oi
          ? ''
          : '<kbd>Shift</kbd>\u65E9\u9001\u308A'
      : t('\u5CB8\u3067\u964D\u308A\u308B') + (oi ? '' : '\u3000<kbd>R</kbd>\u30E9\u30B8\u30AA');
  if (P.mode === 'car' && nearGarage()) return t('\u6539\u9020\u30B7\u30E7\u30C3\u30D7\u306B\u5165\u308B');
  if (P.mode === 'train' && P.train && P.train.drive)
    return P.train.state === 'dwell'
      ? oi
        ? ''
        : '<kbd>F</kbd>\u30C9\u30A2\u3092\u9589\u3081\u3066\u767A\u8ECA\u3000<kbd>L</kbd>\u964D\u308A\u308B'
      : oi
        ? ''
        : '<kbd>W</kbd>\u9577\u62BC\u3057\u3067\u529B\u884C <kbd>S</kbd>\u9577\u62BC\u3057\u3067\u30D6\u30EC\u30FC\u30AD <kbd>N</kbd>\u30CE\u30C3\u30C1\u5207 <kbd>Space</kbd>\u975E\u5E38 <kbd>T</kbd>TASC <kbd>R</kbd>\u5F8C\u9000';
  if (P.mode === 'train')
    return P.train && P.train.state === 'dwell'
      ? t('\u4E0B\u8ECA\u3059\u308B') + (oi ? '' : '\u3000<kbd>N</kbd>\u6B21\u306E\u99C5\u3078\u3000<kbd>C</kbd>\u8ECA\u5185/\u8ECA\u5916')
      : t('\u6B21\u306E\u99C5\u307E\u3067\u30B9\u30AD\u30C3\u30D7') +
          (oi ? '' : '\u3000<kbd>C</kbd>\u8ECA\u5185/\u8ECA\u5916\u3000<kbd>Shift</kbd>\u65E9\u9001\u308A');
  if (P.mode === 'ride')
    return Xt.kind === 'bus'
      ? (Xt.car && Xt.car.atStop
          ? t('\u3053\u3053\u3067\u964D\u308A\u308B') + (oi ? '' : '\u3000<kbd>N</kbd>\u6B21\u306E\u505C\u7559\u6240\u3078')
          : t('\u6B21\u306E\u505C\u7559\u6240\u307E\u3067\u30B9\u30AD\u30C3\u30D7')) + (oi ? '' : '\u3000<kbd>Shift</kbd>\u65E9\u9001\u308A')
      : Xt.dest
        ? t('\u30B9\u30AD\u30C3\u30D7\u3057\u3066\u5230\u7740') + (oi ? '' : '\u3000<kbd>Shift</kbd>\u65E9\u9001\u308A')
        : '';
  if (P.mode !== 'foot') return '';
  let e = nearMissionStart(P.x, P.z);
  if (e) return t(`\u30DF\u30C3\u30B7\u30E7\u30F3\u300C${e.title}\u300D`);
  let i = nearStop(P.x, P.z);
  if (i && !nearDoor(P.x, P.z))
    return (
      t(`\u30D0\u30B9\u505C\u300C${i.name}\u300D ${i.routes.map((l) => l.code).join('\u30FB')}`) +
      (Xt.wait ? '\u3000<small>\u30D0\u30B9\u3092\u5F85\u3063\u3066\u3044\u307E\u3059\u2026</small>' : '')
    );
  let s = nearDoor(P.x, P.z);
  if (s && s.act) return t(s.act);
  if (s && s.brand) return t(`${s.label}\u306B\u5165\u308B`);
  if (s && (s.type === 'deck' || s.type === 'property' || s.type === 'gun'))
    return t(
      s.type === 'deck'
        ? `${s.label}\u3078\u4E0A\u308B`
        : s.type === 'property'
          ? `\u7269\u4EF6\u3092\u898B\u308B\uFF1A${s.prop.name}`
          : `${s.label}\uFF08\u6B66\u5668\u5C4B\uFF09\u306B\u5165\u308B`,
    );
  if (s)
    return t(
      s.type === 'station'
        ? `${s.label}\u306B\u5165\u308B`
        : s.type === 'home'
          ? '\u81EA\u5B85\u306B\u5165\u308B'
          : s.type === 'terminal'
            ? `${s.label}\u306B\u5165\u308B`
            : `${s.label}\u306B\u5165\u308B`,
    );
  for (let l of G.aircraft) {
    if (l.kind === 'parked' && Math.hypot(l.x - P.x, l.z - P.z) < 30) return t('\u65C5\u5BA2\u6A5F\u306B\u642D\u4E57\u3059\u308B');
    if (l.kind === 'heli' && Math.hypot(l.x - P.x, l.z - P.z) < 6 && Math.abs(l.y - P.y) < 3)
      return t(`\u30D8\u30EA\u306B\u4E57\u308B\uFF08${l.name}\uFF09`);
  }
  let o = nearBoat(P.x, P.z);
  if (o)
    return t(
      o.line
        ? o.atPier
          ? `${o.td.name}\u306B\u4E57\u308B\uFF08\xA5860\uFF09`
          : `${o.td.name}\uFF08\u5165\u6E2F\u5F85\u3061\uFF09`
        : `${o.td.name}\u306B\u4E57\u308B`,
    );
  let r = [];
  carsNear(P.x, P.z, 5, r);
  let a = r.find((l) => !l.dead && !l.burn && !l.sink && Math.abs(l.y - P.y) < 2);
  return a ? t(a.mode === 'ai' && a.driver ? `${a.td.name}\u3092\u596A\u3046` : `${a.td.name}\u306B\u4E57\u308B`) : '';
}
function e7() {
  let n = G.events;
  G.events = [];
  for (let { type: t, data: e } of n)
    switch (t) {
      case 'crime':
        player_crime(e.amt, e.why, e.minor);
        break;
      case 'crash':
        (Ro(e.x, e.y, e.z, e.p), gt.crash(e.p), (G.cam.shake = Math.max(G.cam.shake, Math.min(0.8, e.p * 0.05))));
        break;
      case 'explode':
        (blowUp(e.x, e.y, e.z, e.big, e.byPlayer), explosionFire(e.x, e.z));
        break;
      case 'carFire':
        onCarFire(e);
        break;
      case 'pedKilled':
        onPedKilled(e);
        break;
      case 'bikeCrash': {
        let i = e.c;
        if (P.car !== i || P.mode !== 'car') break;
        ((i.ctl = null),
          (P.car = null),
          (P.mode = 'foot'),
          (P.x = i.x + Math.sin(i.yaw) * 1.2),
          (P.z = i.z + Math.cos(i.yaw) * 1.2),
          (P.y = i.y + 0.6),
          (P.down = 0),
          knockPlayer(i.vx * 0.7, 4.5, i.vz * 0.7, Math.min(60, e.v * 2.2)),
          (i.vx *= 0.4),
          (i.vz *= 0.4),
          toast('\u30D0\u30A4\u30AF\u304B\u3089\u6295\u3052\u51FA\u3055\u308C\u305F\uFF01'),
          P.hp <= 0 && xt('wasted', '\u30D0\u30A4\u30AF\u4E8B\u6545'));
        break;
      }
      case 'wasted':
        ew('WASTED', typeof e == 'string' ? e : '', Oz, 'wasted');
        break;
      case 'busted':
        ew('BUSTED', '\u902E\u6355\u3055\u308C\u305F', Hz, 'busted');
        break;
      case 'toast':
        toast(e);
        break;
      case 'objective':
        toast(e);
        break;
      case 'big':
        big(e.t, e.s, e.col);
        break;
      case 'dialog':
        dialog(e.who, e.lines);
        break;
      case 'save':
        saveGame(!0);
        break;
      case 'alight':
        missionEvent('alight', e);
        break;
      case 'splash': {
        let [i, s] = oc();
        (e6(i, s), gt.splash());
        break;
      }
      case 'trainDepart':
        (e === P.train || (P.mode === 'foot' && e.x !== void 0 && Math.hypot(e.x - P.x, e.z - P.z) < 60)) && gt.doorClose();
        break;
      case 'enterInterior':
        e && (e.type === 'store' || e.type === 'drug') && gt.chimeStore();
        break;
      case 'trainArrive':
        e === P.train &&
          (gt.chime(),
          gt.announce(),
          e.cur && toast(`${e.cur.ja}\u99C5\u306B\u5230\u7740 \u2014 ${oi ? '\u300C\u964D\u308A\u308B\u300D' : 'F'} \u3067\u4E0B\u8ECA`));
        break;
      case 'waypoint':
        updRoute();
        break;
      case 'angry': {
        let i = e;
        if (i.removed || P.mode !== 'car') break;
        let s = -Math.cos(i.yaw),
          o = Math.sin(i.yaw),
          r = spawnPedAt(i.x + s * (i.td.W / 2 + 0.7), i.z + o * (i.td.W / 2 + 0.7), 'attack', Math.random() < 0.5 ? 0 : 2);
        r &&
          ((r.grudge = !0),
          (r.home = i),
          (r.t = 18),
          (i.driver = !1),
          toast(
            Be([
              '\u300C\u304A\u3044\uFF01\u3069\u3053\u898B\u3066\u904B\u8EE2\u3057\u3066\u3093\u3060\uFF01\u300D',
              '\u300C\u3061\u3087\u3063\u3068\u964D\u308A\u3066\u3053\u3044\uFF01\u300D',
              '\u300C\u3075\u3056\u3051\u3093\u306A\u3088\uFF01\u300D',
            ]),
          ));
        break;
      }
    }
}
function ew(n, t, e, i) {
  G.dying ||
    ((G.dying = {
      t: 4.5,
      places: e,
      kind: i,
    }),
    missionEvent(i),
    (JOB.active = !1),
    togglePhone(!1),
    big(n, t, i === 'wasted' ? '#e5402b' : '#4a8bff'),
    gt.fail());
}
function n7() {
  let n = G.dying;
  G.dying = null;
  let [t, e] = oc();
  if (
    (P.interior && exit(),
    P.deck && exitDeck(),
    P.mode === 'boat' && (P.boat && !P.boatRide && (P.boat.ctl = null), (P.boat = null), (P.boatRide = !1)),
    P.mode === 'car' && P.car && ((P.car.ctl = null), (P.car = null)),
    P.mode === 'ride' &&
      (Xt.car && ((Xt.car.keep = !1), (Xt.car.passenger = !1), Xt.kind === 'taxi' && releaseTaxi(Xt.car)),
      (Xt.car = null),
      (Xt.kind = null),
      (P.car = null),
      (G.rideInfo = null)),
    P.mode === 'train' && (hideInterior(), (P.train = null)),
    P.mode === 'plane' && P.air)
  )
    for (let o of G.aircraft)
      o.kind === 'player' &&
        o.home &&
        ((o.kind = 'parked'),
        Object.assign(o, {
          x: o.home.x,
          y: o.home.y,
          z: o.home.z,
        }),
        o.m.position.set(o.home.x, o.home.y, o.home.z),
        o.m.rotation.set(0, o.home.yaw, 0));
  if (P.mode === 'heli' && P.air) {
    let o = P.air.ref;
    ((o.x = o.home[0]), (o.y = o.home[1]), (o.z = o.home[2]), (o.spin = 0), o.m.position.set(o.x, o.y, o.z), o.m.rotation.set(0, 0, 0));
  }
  ((P.air = null), (P.mode = 'foot'), (P.hp = 100), (P.down = 0), (P.armor = 0), n.kind === 'busted' && loseWeapons(), resetPolice());
  let i = n.places[0],
    s = 1e18;
  for (let o of n.places) {
    let r = (o[0] - t) ** 2 + (o[1] - e) ** 2;
    r < s && ((s = r), (i = o));
  }
  (placeNearRoad(i[0], i[1]),
    (G.money = Math.max(0, G.money - (n.kind === 'busted' ? 1500 : 800))),
    toast(
      n.kind === 'busted'
        ? '\u8B66\u5BDF\u7F72\u304B\u3089\u91C8\u653E\u3055\u308C\u305F\uFF08\u6B66\u5668\u306F\u6CA1\u53CE\uFF09\u2212\xA51,500'
        : '\u75C5\u9662\u3067\u6CBB\u7642\u3092\u53D7\u3051\u305F \u2212\xA5800',
    ),
    (R.tod = (R.tod + 3) % 24));
}
var ra = 0,
  ic = 600;
function i7(n) {
  if (ge.weather === 'clear') ra = 0;
  else if (ge.weather === 'rain') ra = 1;
  else if (((ic -= n), ic <= 0)) {
    let t = Math.random();
    ra > 0
      ? ((ra = 0), (ic = rt(900, 1800)))
      : t < 0.12
        ? ((ra = rt(0.6, 1)), (ic = rt(150, 300)))
        : t < 0.2
          ? ((ra = rt(0.25, 0.4)), (ic = rt(120, 240)))
          : ((ra = 0), (ic = rt(600, 1200)));
  }
  rn.uRain.value += It(ra - rn.uRain.value, -n * 0.05, n * 0.05);
}
var nw = 0,
  sc = 0,
  bM = 0,
  vM = 0,
  V1 = null,
  iw = !1;
var mh = !1,
  sw = 0;
function dw(n) {
  requestAnimationFrame(dw);
  let t = Math.min(0.05, Math.max(0.001, (n - sc) / 1e3));
  if (((sc = n), G.started && (q6(t), mh && (sw -= t) <= 0))) {
    sw = 1;
    let e = $6();
    e &&
      ($t('diagLive').textContent = `fps ${e.fps}  heap ${e.heap ?? '-'}MB
\u5F62\u72B6 ${e.geo}  tex ${e.tex}
\u63CF\u753B ${e.calls}  ${e.tris}k\u25B3  chunk ${e.chunks}
\u8ECA ${e.cars}  \u4EBA ${e.peds}`);
  }
  if (G.minigame) {
    dh();
    return;
  }
  if (!G.started || G.paused) {
    G.started && (G.paused && (nw -= t) <= 0 && ((nw = 0.4), drawBig()), xM(P.mode), (Sn('Escape') || Sn('KeyM')) && pause(!1), dh());
    return;
  }
  try {
    if ((P.mode === 'ride' || (P.mode === 'boat' && P.boatRide) || (P.mode === 'train' && !(P.train && P.train.drive))) && G.input.sprint && !G.dying)
      for (let e = 0; e < 5; e++) SM(t, !1);
    SM(t);
  } catch (e) {
    (console.error(e), oo('frame', e && (e.stack || e.message)), iw || ((iw = !0), toast('\u30A8\u30E9\u30FC: ' + e.message)));
  }
  dh();
}
function SM(n, t = !0) {
  ((G.t += n), (G.dt = n), (TOUCH.btn.horn = !!TOUCH.btn.x && P.mode === 'car'));
  let e = xM(P.mode);
  if (
    ((e.rev = !!(KEYS.KeyR || (TOUCH.btn.x && P.mode === 'train'))),
    G.dying && ((e.mx = e.my = e.thr = e.steer = 0), (e.brake = 1), (G.dying.t -= n), G.dying.t <= 0 && n7()),
    Sn('Escape') && (GT.phone || GT.wheel))
  )
    (togglePhone(!1), toggleWheel(!1));
  else if (Sn('Escape') || Sn('KeyM')) {
    pause(!0);
    return;
  }
  (Sn('KeyP') && togglePhone(), Sn('Tab') && P.mode === 'foot' && toggleWheel());
  for (let a = 1; a <= 7; a++)
    if (Sn('Digit' + a)) {
      let l = ORDER.find((f) => WPN[f].slot === a);
      l && owned(l) ? select(l) : l && toast(`${WPN[l].name}\u306F\u6301\u3063\u3066\u3044\u307E\u305B\u3093`);
    }
  if (
    (Sn('KeyR') && (P.mode === 'car' || P.mode === 'boat' ? setRadio(GT.radio + 1) : reloadNow()),
    (GT.phone || GT.wheel) && (e.fireHeld = e.firePressed = !1),
    Sn('KeyF') && interact(),
    dialogOpen() && Sn('Mouse0')
      ? nextLine()
      : P.mode === 'foot' &&
        !P.interior &&
        !G.dying &&
        !GT.phone &&
        !GT.wheel &&
        (Sn('Mouse0') || Sn('KeyE')) &&
        (Sn('KeyE') ? q1() : ($1() || P.deck || curW().melee) && lw()),
    Sn('KeyC') && P.mode === 'train' && (G.cam.inside = !G.cam.inside),
    Sn('KeyN') && P.mode === 'train' && P.train && !P.train.drive)
  ) {
    let a = skipToNext(P.train);
    a && toast(`${a.ja}\u306B\u5230\u7740`);
  }
  if (Sn('KeyN') && P.mode === 'ride' && Xt.kind === 'bus' && Xt.car) {
    let a = skipBus(Xt.car);
    a && toast(`\u6B21\u306F ${a.name}`);
  }
  if (P.mode === 'train' && P.train && P.train.drive) {
    let a = P.train;
    (Sn('KeyT') && driverInput(a, 'tasc'),
      Sn('KeyN') && driverInput(a, 'n'),
      Sn('KeyL') && a.state === 'dwell' && ((a.drive = !1), (a.dwell = 4), leaveTrain(), (G.cam.inside = !1)));
  }
  (Sn('KeyJ') && startJob(),
    Sn('KeyV') && W1(ge.camMode + 1),
    Sn('KeyT') && P.mode === 'foot' && !P.interior && callTaxi(),
    Sn('KeyG') && P.mode === 'foot' && !P.interior && q1(),
    P.mode === 'foot'
      ? (updFoot(n), updDeck())
      : P.mode === 'plane' && P.air && !P.air.crashed
        ? (flyPlane(P.air, n), (e.thrLevel = P.air.thr))
        : P.mode === 'heli' && P.air && !P.air.crashed && flyHeli(P.air, n));
  let i = null;
  if (
    (P.interior && (i = updInterior(n)),
    Qz(n, e),
    updBoats(n),
    P.mode === 'boat' && P.boat && ((P.x = P.boat.x), (P.z = P.boat.z), (P.y = P.boat.y + 0.6), (G.rideInfo = rideInfo())),
    updWeapons(n),
    updTrains(n),
    P.mode === 'train' && P.train)
  ) {
    let a = P.train.carPos[P.trainCar] || P.train.carPos[0];
    ((P.x = a.x),
      (P.z = a.z),
      (P.y = a.y),
      P.train.r.kind === 'sub' && (G.cam.inside = !0),
      G.cam.inside ? placeInterior(P.train, P.trainCar) : hideInterior());
  }
  let [s, o] = oc();
  if (V1 && !P.interior) {
    let a = Math.hypot(s - V1[0], o - V1[1]);
    a < 200 && (G.stats.distance += a);
  }
  ((V1 = [s, o]), rebuildCarGrid());
  for (let a of G.cars) a.removed || ((a.collDone = !1), a.mode === 'ai' ? aiUpdate(a, n) : (physCar(a, n), tryRecover(a, n)));
  for (let a of G.cars)
    a.removed ||
      (a.mode === 'phys' && carCollisions(a),
      carEffects(a, n),
      carFireSpread(a, n),
      Math.abs(a.x - s) < 160 && Math.abs(a.z - o) < 160 && carPedHits(a));
  rebuildPedGrid();
  for (let a of G.peds) updPed(a, n);
  (managePolice(n),
    updFires(n),
    (bM -= n),
    bM <= 0 && !P.interior && ((bM = 0.25), managePopulation(0.25, !1)),
    updMissions(n),
    updJob(n),
    updCapsules(),
    updGTA(n),
    (vM -= n),
    vM <= 0 && ((vM = 0.5), updFronts(s, o), updStops(s, o)),
    updMarkers(n, s, o, !P.interior && (P.mode === 'foot' || (P.mode === 'car' && P.car && Math.abs(P.car.v) < 6))),
    P.interior || manageBuses(n, s, o),
    e7(),
    i7(n),
    N2(n, s, o),
    P.interior && ((R.sun.intensity *= 0.12), (R.hemi.intensity = 0.3)),
    (R.scene.environmentIntensity = P.interior ? 0.15 : 0.2 + 0.35 * (1 - R.night)),
    t_(G.t),
    i_(R.night),
    lg(s, o, P.mode === 'plane' ? 10 : 6),
    Wz(n, s, o),
    updCamera(n),
    (We.dyn.n = 0),
    renderCars(n, We.dyn),
    updAircraft(n, We.dyn),
    p_(n, R.night, We.dyn),
    K_(n, G.t),
    renderBoats(n, We.dyn),
    weaponGlows(We.dyn),
    fireGlows(We.dyn),
    We.dyn.commit(),
    (We.stat.u.uI.value = Math.min(1, R.night * 1.2 + 0.05)),
    We.smoke.update(n),
    We.fire.update(n));
  let r = R.camera.position;
  if ((n6(r.x, r.y, r.z, P.interior ? 0 : rn.uRain.value), renderPeds(), renderPlayer(), renderHand(), (rn.uTime.value = G.t), !t)) {
    dh();
    return;
  }
  (Rv(), gt.update(n, s7(s, o)), (yM -= n), yM <= 0 && ((yM = 0.15), (tw = t7())), updHUD(n, tw), Kz());
}
var _M = 0,
  wM = 0;
function s7(n, t) {
  let e = 1e9,
    i = 1e9,
    s = 1e9,
    o = 'police',
    r = 0,
    a = !1;
  for (let d of G.cars)
    if (d.siren && !d.removed) {
      let p = Math.hypot(d.x - n, d.z - t);
      p < e && ((e = p), (o = d.t === 'ambulance' ? 'ambulance' : d.t === 'fire' ? 'fire' : 'police'));
    }
  for (let d of G.trains)
    if (d.x !== void 0 && d.r.kind !== 'sub' && d.state === 'run') {
      let p = Math.hypot(d.x - n, d.z - t);
      (p < i && ((i = p), (r = d.v)), d.r.kind === 'tram' && p < 70 && P.mode !== 'train' && (a = !0));
    }
  if ((P.mode === 'train' && P.train && (r = P.train.v), (_M -= 0.016), _M <= 0 && ((_M = 0.5), (wM = 0), P.mode === 'foot' && !P.interior))) {
    let d = nearestNode(P.x, P.z),
      p = d != null ? W.nodes[d] : null;
    p &&
      p.sig &&
      Math.hypot(p.x - P.x, p.z - P.z) < 28 &&
      (wM = sigState(p, p.edges[0], G.t) === 2 ? 1 : sigState(p, p.edges[p.groups.indexOf(1)] ?? p.edges[0], G.t) === 2 ? 2 : 0);
  }
  let l = maskQ(n, t),
    f = (() => {
      let d = nearestFire(n, t, 200);
      return d ? Math.hypot(d.x - n, d.z - t) : 1e9;
    })(),
    u = {
      sirenType: o,
      trainV: r,
      trainAcc: (P.train && P.train.notch) || 0,
      crossing: a,
      walkSig: wM,
      fire: f,
      carType: P.mode === 'car' && P.car ? P.car.t : '',
      boat: P.mode === 'boat' && !P.boatRide,
      onFoot: P.mode === 'foot',
      footSpeed: P.speed || 0,
      density: G.densityAt ? G.densityAt(n, t) : 0.5,
      park: l === M_PARK || l === M_FOREST || l === M_PALACE,
    };
  for (let d of G.aircraft)
    (d.kind === 'ai' || d.kind === 'cruise') && d.x !== void 0 && (s = Math.min(s, Math.hypot(d.x - n, d.z - t, (d.y || 0) * 0.5)));
  let c = P.mode === 'car' && P.car && P.car.td.bike === 'cycle',
    h = P.mode === 'boat' && P.boat && !P.boatRide;
  return {
    carSpeed: P.mode === 'car' && P.car && !c ? Math.abs(P.car.v) : h ? Math.abs(P.boat.v) * 1.6 : 0,
    inCar: (P.mode === 'car' && !c) || h,
    radio: c,
    indoor: !!P.interior,
    night: R.night,
    airSpeed: P.air ? (P.air.speedKmh || 0) / 3.6 : 0,
    siren: e,
    onTrain: P.mode === 'train',
    train: i,
    inPlane: P.mode === 'plane',
    jet: s,
    inHeli: P.mode === 'heli',
    rain: rn.uRain.value,
    ...u,
  };
}
