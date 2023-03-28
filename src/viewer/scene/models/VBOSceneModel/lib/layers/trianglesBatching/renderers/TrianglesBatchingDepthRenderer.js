import {stats} from "../../../../../../stats.js"
import {Program} from "../../../../../../webgl/Program.js";
import {createRTCViewMat} from "../../../../../../math/rtcCoords.js";
import {math} from "../../../../../../math/math.js";

const tempVec3a = math.vec3();

/**
 * @private
 */
class TrianglesBatchingDepthRenderer {

    constructor(scene) {
        this._scene = scene;
        this._allocate();
        this._hash = this._getHash();
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
            this._allocate();
            if (this.errors) {
                return;
            }
        }

        if (frameCtx.lastProgramId !== this._program.id) {
            frameCtx.lastProgramId = this._program.id;
            this._bindProgram();
        }

        gl.uniform1i(this._uRenderPass, renderPass);

        gl.uniformMatrix4fv(this._uWorldMatrix, false, model.worldMatrix);
        gl.uniformMatrix4fv(this._uViewMatrix, false, (origin) ? createRTCViewMat(camera.viewMatrix, origin) : camera.viewMatrix);

        gl.uniformMatrix4fv(this._uPositionsDecodeMatrix, false, batchingLayer._state.positionsDecodeMatrix);

        this._aPosition.bindArrayBuffer(state.positionsBuf);

        if (this._aOffset) {
            this._aOffset.bindArrayBuffer(state.offsetsBuf);
        }

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
        this._uViewMatrix = program.getLocation("viewMatrix");
        this._uProjMatrix = program.getLocation("projMatrix");

        this._aPosition = program.getAttribute("position");
        this._aFlags = program.getAttribute("flags");
        this._aFlags2 = program.getAttribute("flags2");
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
        // Triangles batching depth vertex shader
        
        // flags.x = NOT_RENDERED | COLOR_OPAQUE | COLOR_TRANSPARENT
        // renderPass = COLOR_OPAQUE
        const src = [`\
        #version 300 es

        uniform int renderPass;

        in vec3 position;
        in vec4 flags;
        in vec4 flags2;

        uniform mat4 worldMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projMatrix;
        uniform mat4 positionsDecodeMatrix;

        out vec2 vHighPrecisionZW;

        void main(void) {
            if (int(flags.x) != renderPass) {
                gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            } else {
                vec4 worldPosition = worldMatrix * (positionsDecodeMatrix * vec4(position, 1.0)); 
                vec4 viewPosition  = viewMatrix * worldPosition; 
                vec4 clipPos = projMatrix * viewPosition;
                gl_Position = clipPos;
                vHighPrecisionZW = gl_Position.zw;
            }
        }
        `];
        return src;
    }

    _buildFragmentShader() {
        // Triangles batching depth fragment shader
        const src = [`\
        #version 300 es

        precision highp float;
        precision highp int;

        const float   packUpScale = 256. / 255.;
        const float   unpackDownscale = 255. / 256.;
        const vec3    packFactors = vec3( 256. * 256. * 256., 256. * 256.,  256. );
        const vec4    unpackFactors = unpackDownscale / vec4( packFactors, 1. );
        const float   shiftRight8 = 1.0 / 256.;

        vec4 packDepthToRGBA( const in float v ) {
            vec4 r = vec4( fract( v * packFactors ), v );
            r.yzw -= r.xyz * shiftRight8;
            return r * packUpScale;
        }

        in vec2 vHighPrecisionZW;

        out vec4 outColor;

        void main(void) {
            float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
            outColor = vec4(vec3(1.0 - fragCoordZ), 1.0); 
        }`
        ];
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
        stats.memory.programs--;
    }
}

export {TrianglesBatchingDepthRenderer};