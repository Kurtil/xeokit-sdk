import {Program} from "../../../../../../webgl/Program.js";
import {math} from "../../../../../../math/math.js";
import {createRTCViewMat} from "../../../../../../math/rtcCoords.js";
import {WEBGL_INFO} from "../../../../../../webglInfo.js";

const tempVec4 = math.vec4();

/**
 * @private
 */
class TrianglesBatchingColorTextureRenderer {

    constructor(scene) {
        this._scene = scene;
        this._hash = this._getHash();
        this._allocate();
    }

    getValid() {
        return this._hash === this._getHash();
    };

    _getHash() {
        const scene = this._scene;
        return scene._lightsState.getHash();
    }

    drawLayer(frameCtx, batchingLayer, renderPass) {

        const maxTextureUnits = WEBGL_INFO.MAX_TEXTURE_IMAGE_UNITS;

        const scene = this._scene;
        const camera = scene.camera;
        const model = batchingLayer.model;
        const gl = scene.canvas.gl;
        const state = batchingLayer._state;
        const origin = batchingLayer._state.origin;
        const textureSet = state.textureSet;

        if (!this._program) {
            this._allocate();
            if (this.errors) {
                return;
            }
        }

        if (frameCtx.lastProgramId !== this._program.id) {
            frameCtx.lastProgramId = this._program.id;
            this._bindProgram(frameCtx);
        }

        gl.uniform1i(this._uRenderPass, renderPass);

        gl.uniformMatrix4fv(this._uViewMatrix, false, (origin) ? createRTCViewMat(camera.viewMatrix, origin) : camera.viewMatrix);
        gl.uniformMatrix4fv(this._uWorldMatrix, false, model.worldMatrix);

        gl.uniformMatrix4fv(this._uPositionsDecodeMatrix, false, state.positionsDecodeMatrix);

        if (this._uUVDecodeMatrix) {
            gl.uniformMatrix3fv(this._uUVDecodeMatrix, false, state.uvDecodeMatrix);
        }

        this._aPosition.bindArrayBuffer(state.positionsBuf);

        if (this._aUV) {
            this._aUV.bindArrayBuffer(state.uvBuf);
        }

        if (this._aColor) {
            this._aColor.bindArrayBuffer(state.colorsBuf);
        }

        if (this._aFlags) {
            this._aFlags.bindArrayBuffer(state.flagsBuf);
        }

        if (this._aFlags2) {
            this._aFlags2.bindArrayBuffer(state.flags2Buf);
        }

        if (this._aOffset) {
            this._aOffset.bindArrayBuffer(state.offsetsBuf);
        }

        if (textureSet) {
            if (textureSet.colorTexture) {
                this._program.bindTexture(this._uColorMap, textureSet.colorTexture.texture, frameCtx.textureUnit);
                frameCtx.textureUnit = (frameCtx.textureUnit + 1) % maxTextureUnits;
            }
        }

        state.indicesBuf.bind();

        gl.drawElements(gl.TRIANGLES, state.indicesBuf.numItems, state.indicesBuf.itemType, 0);

        frameCtx.drawElements++;
    }

    _allocate() {

        const scene = this._scene;
        const gl = scene.canvas.gl;
        const lightsState = scene._lightsState;

        this._program = new Program(gl, this._buildShader());

        if (this._program.errors) {
            this.errors = this._program.errors;
            return;
        }

        const program = this._program;

        this._uRenderPass = program.getLocation("renderPass");
        this._uPositionsDecodeMatrix = program.getLocation("positionsDecodeMatrix");
        this._uUVDecodeMatrix = program.getLocation("uvDecodeMatrix");
        this._uWorldMatrix = program.getLocation("worldMatrix");
        this._uViewMatrix = program.getLocation("viewMatrix");
        this._uProjMatrix = program.getLocation("projMatrix");

        this._uLightAmbient = program.getLocation("lightAmbient");
        this._uLightColor = [];
        this._uLightDir = [];
        this._uLightPos = [];
        this._uLightAttenuation = [];

        const lights = lightsState.lights;
        let light;

        for (let i = 0, len = lights.length; i < len; i++) {
            light = lights[i];
            switch (light.type) {
                case "dir":
                    this._uLightColor[i] = program.getLocation("lightColor" + i);
                    this._uLightPos[i] = null;
                    this._uLightDir[i] = program.getLocation("lightDir" + i);
                    break;
                case "point":
                    this._uLightColor[i] = program.getLocation("lightColor" + i);
                    this._uLightPos[i] = program.getLocation("lightPos" + i);
                    this._uLightDir[i] = null;
                    this._uLightAttenuation[i] = program.getLocation("lightAttenuation" + i);
                    break;
                case "spot":
                    this._uLightColor[i] = program.getLocation("lightColor" + i);
                    this._uLightPos[i] = program.getLocation("lightPos" + i);
                    this._uLightDir[i] = program.getLocation("lightDir" + i);
                    this._uLightAttenuation[i] = program.getLocation("lightAttenuation" + i);
                    break;
            }
        }

        this._aPosition = program.getAttribute("position");
        this._aOffset = program.getAttribute("offset");
        this._aUV = program.getAttribute("uv");
        this._aColor = program.getAttribute("color");
        this._aFlags = program.getAttribute("flags");
        this._aFlags2 = program.getAttribute("flags2");

        this._uColorMap = "uColorMap";
    }

    _bindProgram() {

        const scene = this._scene;
        const gl = scene.canvas.gl;
        const program = this._program;
        const lightsState = scene._lightsState;
        const lights = lightsState.lights;
        const project = scene.camera.project;

        program.bind();

        gl.uniformMatrix4fv(this._uProjMatrix, false, project.matrix)

        if (this._uLightAmbient) {
            gl.uniform4fv(this._uLightAmbient, scene._lightsState.getAmbientColorAndIntensity());
        }

        for (let i = 0, len = lights.length; i < len; i++) {
            const light = lights[i];
            if (this._uLightColor[i]) {
                gl.uniform4f(this._uLightColor[i], light.color[0], light.color[1], light.color[2], light.intensity);
            }
            if (this._uLightPos[i]) {
                gl.uniform3fv(this._uLightPos[i], light.pos);
                if (this._uLightAttenuation[i]) {
                    gl.uniform1f(this._uLightAttenuation[i], light.attenuation);
                }
            }
            if (this._uLightDir[i]) {
                gl.uniform3fv(this._uLightDir[i], light.dir);
            }
        }
    }

    _buildShader() {
        return {
            vertex: this._buildVertexShader(),
            fragment: this._buildFragmentShader()
        };
    }

    _buildVertexShader() {
        // Triangles batching color texture vertex shader

        // flags.x = NOT_RENDERED | COLOR_OPAQUE | COLOR_TRANSPARENT
        // renderPass = COLOR_OPAQUE
        const src = [`\
        #version 300 es

        uniform int renderPass;

        in vec3 position;
        in vec4 color;
        in vec2 uv;
        in vec4 flags;
        in vec4 flags2;

        uniform mat4 worldMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projMatrix;
        uniform mat4 positionsDecodeMatrix;
        uniform mat3 uvDecodeMatrix;

        out vec4 vViewPosition;
        out vec4 vColor;
        out vec2 vUV;

        void main(void) {
            if (int(flags.x) != renderPass) {
                gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            } else {
                vec4 worldPosition = worldMatrix * (positionsDecodeMatrix * vec4(position, 1.0)); 
                vec4 viewPosition  = viewMatrix * worldPosition; 
                vViewPosition = viewPosition;
                vColor = vec4(float(color.r) / 255.0, float(color.g) / 255.0, float(color.b) / 255.0, float(color.a) / 255.0);
                vUV = (uvDecodeMatrix * vec3(uv, 1.0)).xy;
                vec4 clipPos = projMatrix * viewPosition;
                gl_Position = clipPos;
            }
        }`];

        return src;
    }

    _buildFragmentShader() {
        // Triangles batching color texture fragment shader

        const scene = this._scene;
        const lightsState = scene._lightsState;
        const src = [];

        src.push(`\
        #version 300 es

        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        precision highp int;
        #else
        precision mediump float;
        precision mediump int;
        #endif

        uniform sampler2D uColorMap;

        vec4 linearToLinear( in vec4 value ) {
            return value;
        }

        vec4 sRGBToLinear( in vec4 value ) {
            return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.w );
        }

        uniform mat4 viewMatrix;
        uniform vec4 lightAmbient;
        `)

        for (let i = 0, len = lightsState.lights.length; i < len; i++) {
            const light = lightsState.lights[i];
            if (light.type === "ambient") {
                continue;
            }
            src.push("uniform vec4 lightColor" + i + ";");
            if (light.type === "dir") {
                src.push("uniform vec3 lightDir" + i + ";");
            }
            if (light.type === "point") {
                src.push("uniform vec3 lightPos" + i + ";");
            }
            if (light.type === "spot") {
                src.push("uniform vec3 lightPos" + i + ";");
                src.push("uniform vec3 lightDir" + i + ";");
            }
        }

        src.push(`
        in vec4 vViewPosition;
        in vec4 vColor;
        in vec2 vUV;

        out vec4 outColor;

        void main(void) {
            vec3 reflectedColor = vec3(0.0, 0.0, 0.0);
            vec3 viewLightDir = vec3(0.0, 0.0, -1.0);
            float lambertian = 1.0;
            vec3 xTangent = dFdx( vViewPosition.xyz );
            vec3 yTangent = dFdy( vViewPosition.xyz );
            vec3 viewNormal = normalize( cross( xTangent, yTangent ) );
        `)

        for (let i = 0, len = lightsState.lights.length; i < len; i++) {
            const light = lightsState.lights[i];
            if (light.type === "ambient") {
                continue;
            }
            if (light.type === "dir") {
                if (light.space === "view") {
                    src.push("viewLightDir = normalize(lightDir" + i + ");");
                } else {
                    src.push("viewLightDir = normalize((viewMatrix * vec4(lightDir" + i + ", 0.0)).xyz);");
                }
            } else if (light.type === "point") {
                if (light.space === "view") {
                    src.push("viewLightDir = -normalize(lightPos" + i + " - viewPosition.xyz);");
                } else {
                    src.push("viewLightDir = -normalize((viewMatrix * vec4(lightPos" + i + ", 0.0)).xyz);");
                }
            } else if (light.type === "spot") {
                if (light.space === "view") {
                    src.push("viewLightDir = normalize(lightDir" + i + ");");
                } else {
                    src.push("viewLightDir = normalize((viewMatrix * vec4(lightDir" + i + ", 0.0)).xyz);");
                }
            } else {
                continue;
            }

            src.push("lambertian = max(dot(-viewNormal, viewLightDir), 0.0);");
            src.push("reflectedColor += lambertian * (lightColor" + i + ".rgb * lightColor" + i + ".a);");
        }

        src.push(`
            vec4 color =  vec4((lightAmbient.rgb * lightAmbient.a * vColor.rgb) + (reflectedColor * vColor.rgb), vColor.a);
            vec4 colorTexel = color * texture(uColorMap, vUV);
            float opacity = color.a;
            outColor = vec4(colorTexel.rgb, opacity);
        }
        `);
        return src;
    }

    webglContextRestored() {
        this._program = null;
    }

    destroy() {
        if (this._program) {
            this._program.destroy();
        }
        this._program = null;
    }
}

export {TrianglesBatchingColorTextureRenderer};