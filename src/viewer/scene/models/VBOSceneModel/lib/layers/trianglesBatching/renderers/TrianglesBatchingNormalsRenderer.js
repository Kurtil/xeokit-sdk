import {Program} from "../../../../../../webgl/Program.js";
import {createRTCViewMat} from "../../../../../../math/rtcCoords.js";

/**
 * @private
 */
class TrianglesBatchingNormalsRenderer {

    constructor(scene) {
        this._scene = scene;
        this._hash = this._getHash();
        this._allocate();
    }

    getValid() {
        return this._hash === this._getHash();
    };

    _getHash() {
        return "";
    }

    drawLayer(frameCtx, batchingLayer, renderPass) {

        const model = batchingLayer.model;
        const scene = model.scene;
        const camera = scene.camera;
        const gl = scene.canvas.gl;
        const state = batchingLayer._state;
        const origin = batchingLayer._state.origin;

        if (!this._program) {
            this._allocate(batchingLayer);
            if (this.errors) {
                return;
            }
        }

        if (frameCtx.lastProgramId !== this._program.id) {
            frameCtx.lastProgramId = this._program.id;
            this._bindProgram(batchingLayer);
        }

        gl.uniform1i(this._uRenderPass, renderPass);

        gl.uniformMatrix4fv(this._uViewMatrix, false, (origin) ? createRTCViewMat(camera.viewMatrix, origin) : camera.viewMatrix);
        gl.uniformMatrix4fv(this._uViewNormalMatrix, false, camera.viewNormalMatrix);

        gl.uniformMatrix4fv(this._uWorldMatrix, false, model.worldMatrix);
        gl.uniformMatrix4fv(this._uWorldNormalMatrix, false, model.worldNormalMatrix);

        gl.uniformMatrix4fv(this._uPositionsDecodeMatrix, false, batchingLayer._state.positionsDecodeMatrix);

        this._aPosition.bindArrayBuffer(state.positionsBuf);
        this._aNormal.bindArrayBuffer(state.normalsBuf);
        this._aColor.bindArrayBuffer(state.colorsBuf);// Needed for masking out transparent entities using alpha channel
        this._aFlags.bindArrayBuffer(state.flagsBuf);
        if (this._aFlags2) {
            this._aFlags2.bindArrayBuffer(state.flags2Buf);
        }
        state.indicesBuf.bind();

        gl.drawElements(gl.TRIANGLES, state.indicesBuf.numItems, state.indicesBuf.itemType, 0);
    }

    _allocate() {

        const scene = this._scene;
        const gl = scene.canvas.gl;

        this._program = new Program(gl, this._buildShader());

        if (this._program.errors) {
            this.errors = this._program.errors;
            return;
        }

        const program = this._program;

        this._uRenderPass = program.getLocation("renderPass");
        this._uPositionsDecodeMatrix = program.getLocation("positionsDecodeMatrix");
        this._uWorldMatrix = program.getLocation("worldMatrix");
        this._uWorldNormalMatrix = program.getLocation("worldNormalMatrix");
        this._uViewMatrix = program.getLocation("viewMatrix");
        this._uViewNormalMatrix = program.getLocation("viewNormalMatrix");
        this._uProjMatrix = program.getLocation("projMatrix");

        this._aPosition = program.getAttribute("position");
        this._aNormal = program.getAttribute("normal");
        this._aColor = program.getAttribute("color");
        this._aFlags = program.getAttribute("flags");

        if (this._aFlags2) { // Won't be in shader when not clipping
            this._aFlags2 = program.getAttribute("flags2");
        }
    }

    _bindProgram() {

        const scene = this._scene;
        const gl = scene.canvas.gl;
        const project = scene.camera.project;

        this._program.bind();

        gl.uniformMatrix4fv(this._uProjMatrix, false, project.matrix);
    }

    _buildShader() {
        return {
            vertex: this._buildVertexShader(),
            fragment: this._buildFragmentShader()
        };
    }

    _buildVertexShader() {
        // Batched geometry normals vertex shader

        // flags.x = NOT_RENDERED | COLOR_OPAQUE | COLOR_TRANSPARENT
        // renderPass = COLOR_OPAQUE
        const src = [`\
        #version 300 es

        uniform int renderPass;

        in vec3 position;
        in vec3 normal;
        in vec4 color;
        in vec4 flags;
        in vec4 flags2;

        uniform mat4 worldMatrix;
        uniform mat4 worldNormalMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projMatrix;
        uniform mat4 viewNormalMatrix;
        uniform mat4 positionsDecodeMatrix;

        vec3 octDecode(vec2 oct) {
            vec3 v = vec3(oct.xy, 1.0 - abs(oct.x) - abs(oct.y));
            if (v.z < 0.0) {
                v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
            }
            return normalize(v);
        }
    
        out vec3 vViewNormal;

        void main(void) {
            if (int(flags.x) != renderPass) {
                gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            } else {
                vec4 worldPosition = worldMatrix * (positionsDecodeMatrix * vec4(position, 1.0)); 
                vec4 viewPosition   = viewMatrix * worldPosition; 
                vec4 worldNormal    = worldNormalMatrix * vec4(octDecode(normal.xy), 0.0); 
                vec3 viewNormal     = normalize((viewNormalMatrix * worldNormal).xyz);
                vViewNormal = viewNormal;
                vec4 clipPos = projMatrix * viewPosition;
                gl_Position = clipPos;
            }
        }
        `];

        return src;
    }

    _buildFragmentShader() {
        // Batched geometry normals fragment shader
        const src = [`\
        #version 300 es
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        precision highp int;
        #else
        precision mediump float;
        precision mediump int;
        #endif

        in vec3 vViewNormal;

        vec3 packNormalToRGB( const in vec3 normal ) {
            return normalize( normal ) * 0.5 + 0.5;
        }

        out vec4 outColor;

        void main(void) {
            outColor = vec4(packNormalToRGB(vViewNormal), 1.0); 
        }
        `];

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

export {TrianglesBatchingNormalsRenderer};