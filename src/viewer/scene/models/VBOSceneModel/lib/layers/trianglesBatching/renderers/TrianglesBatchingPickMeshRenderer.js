import {Program} from "../../../../../../webgl/Program.js";
import {createRTCViewMat} from "../../../../../../math/rtcCoords.js";

/**
 * @private
 */
class TrianglesBatchingPickMeshRenderer {

    constructor(scene) {
        this._scene = scene;
        this._hash = this._getHash();
        this._allocate();
    }

    getValid() {
        return this._hash === this._getHash();
    }

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
        }

        if (frameCtx.lastProgramId !== this._program.id) {
            frameCtx.lastProgramId = this._program.id;
            this._bindProgram(frameCtx);
        }

        gl.uniform1i(this._uRenderPass, renderPass);
        gl.uniformMatrix4fv(this._uWorldMatrix, false, model.worldMatrix);

        const pickViewMatrix = frameCtx.pickViewMatrix || camera.viewMatrix;
        const viewMatrix = origin ? createRTCViewMat(pickViewMatrix, origin) : pickViewMatrix;

        gl.uniformMatrix4fv(this._uProjMatrix, false, frameCtx.pickProjMatrix);
        gl.uniformMatrix4fv(this._uViewMatrix, false, viewMatrix);

        gl.uniformMatrix4fv(this._uPositionsDecodeMatrix, false, batchingLayer._state.positionsDecodeMatrix);

        this._aPosition.bindArrayBuffer(state.positionsBuf);

        if (this._aFlags) {
            this._aFlags.bindArrayBuffer(state.flagsBuf);
        }

        if (this._aFlags2) {
            this._aFlags2.bindArrayBuffer(state.flags2Buf);
        }

        if (this._aPickColor) {
            this._aPickColor.bindArrayBuffer(state.pickColorsBuf);
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
        this._uPickInvisible = program.getLocation("pickInvisible");
        this._uPositionsDecodeMatrix = program.getLocation("positionsDecodeMatrix");
        this._uWorldMatrix = program.getLocation("worldMatrix");
        this._uViewMatrix = program.getLocation("viewMatrix");
        this._uProjMatrix = program.getLocation("projMatrix");

        this._aPosition = program.getAttribute("position");
        this._aPickColor = program.getAttribute("pickColor");
        this._aFlags = program.getAttribute("flags");
        this._aFlags2 = program.getAttribute("flags2");
    }

    _bindProgram(frameCtx) {

        const scene = this._scene;
        const gl = scene.canvas.gl;

        this._program.bind();

        gl.uniform1i(this._uPickInvisible, frameCtx.pickInvisible);
    }

    _buildShader() {
        return {
            vertex: this._buildVertexShader(),
            fragment: this._buildFragmentShader()
        };
    }

    _buildVertexShader() {
        const src = [];

        // flags.w = NOT_RENDERED | PICK
        // renderPass = PICK

        // Batched geometry picking vertex shader
        
        src.push(`\
        #version 300 es

        uniform int renderPass;

        in vec3 position;
        in vec4 flags;
        in vec4 flags2;
        in vec4 pickColor;

        uniform bool pickInvisible;
        uniform mat4 worldMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projMatrix;
        uniform mat4 positionsDecodeMatrix;

        out vec4 vPickColor;

        void main(void) {
            if (int(flags.w) != renderPass) {
                gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            } else {
                vec4 worldPosition = worldMatrix * (positionsDecodeMatrix * vec4(position, 1.0)); 
                vec4 viewPosition  = viewMatrix * worldPosition; 
                vPickColor = vec4(float(pickColor.r) / 255.0, float(pickColor.g) / 255.0, float(pickColor.b) / 255.0, float(pickColor.a) / 255.0);
                vec4 clipPos = projMatrix * viewPosition;
                gl_Position = clipPos;
            }
        }
        `);

        return src;
    }

    _buildFragmentShader() {
        const src = [];

        // Batched geometry picking fragment shader
        src.push(`\
        #version 300 es

        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        precision highp int;
        #else
        precision mediump float;
        precision mediump int;
        #endif

        in vec4 vPickColor;
        out vec4 outColor;

        void main(void) {
            outColor = vPickColor; 
        }`)
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

export {TrianglesBatchingPickMeshRenderer};