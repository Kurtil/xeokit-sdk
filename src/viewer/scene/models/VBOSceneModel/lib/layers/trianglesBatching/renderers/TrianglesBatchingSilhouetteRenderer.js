import {Program} from "../../../../../../webgl/Program.js";
import {RENDER_PASSES} from "../../../RENDER_PASSES.js";
import {createRTCViewMat} from "../../../../../../math/rtcCoords.js";

const defaultColor = new Float32Array([1, 1, 1]);

/**
 * @private
 */
class TrianglesBatchingSilhouetteRenderer {

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
        const origin = batchingLayer._state.origin

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

        if (renderPass === RENDER_PASSES.SILHOUETTE_XRAYED) {
            const material = scene.xrayMaterial._state;
            const fillColor = material.fillColor;
            const fillAlpha = material.fillAlpha;
            gl.uniform4f(this._uColor, fillColor[0], fillColor[1], fillColor[2], fillAlpha);

        } else if (renderPass === RENDER_PASSES.SILHOUETTE_HIGHLIGHTED) {
            const material = scene.highlightMaterial._state;
            const fillColor = material.fillColor;
            const fillAlpha = material.fillAlpha;
            gl.uniform4f(this._uColor, fillColor[0], fillColor[1], fillColor[2], fillAlpha);

        } else if (renderPass === RENDER_PASSES.SILHOUETTE_SELECTED) {
            const material = scene.selectedMaterial._state;
            const fillColor = material.fillColor;
            const fillAlpha = material.fillAlpha;
            gl.uniform4f(this._uColor, fillColor[0], fillColor[1], fillColor[2], fillAlpha);

        } else {
            gl.uniform4fv(this._uColor, defaultColor);
        }

        const viewMat = (origin) ? createRTCViewMat(camera.viewMatrix, origin) : camera.viewMatrix;
        gl.uniformMatrix4fv(this._uViewMatrix, false, viewMat);

        gl.uniformMatrix4fv(this._uWorldMatrix, false, model.worldMatrix);

        gl.uniformMatrix4fv(this._uPositionsDecodeMatrix, false, batchingLayer._state.positionsDecodeMatrix);

        this._aPosition.bindArrayBuffer(state.positionsBuf);

        if (this._aFlags) {
            this._aFlags.bindArrayBuffer(state.flagsBuf);
        }

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
        this._uColor = program.getLocation("color");

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
        const src = [];

        // Triangles batching silhouette vertex shader

        // flags.y = NOT_RENDERED | SILHOUETTE_HIGHLIGHTED | SILHOUETTE_SELECTED | SILHOUETTE_XRAYED
        // renderPass = SILHOUETTE_HIGHLIGHTED | SILHOUETTE_SELECTED | | SILHOUETTE_XRAYED

        src.push(`\
        #version 300 es

        uniform int renderPass;

        in vec3 position;
        in vec4 flags;
        in vec4 flags2;
    
        uniform mat4 worldMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projMatrix;
        uniform mat4 positionsDecodeMatrix;
        uniform vec4 color;

        void main(void) {
            if (int(flags.y) != renderPass) {
                gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            } else {
                vec4 worldPosition = worldMatrix * (positionsDecodeMatrix * vec4(position, 1.0)); 
                vec4 viewPosition  = viewMatrix * worldPosition; 
                vec4 clipPos = projMatrix * viewPosition;
                gl_Position = clipPos;
            }
        }
        `);

        return src;
    }

    _buildFragmentShader() {
        const src = [];
        // Triangles batching silhouette fragment shader
        src.push(`\
            #version 300 es

            #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
            precision highp int;
            #else
            precision mediump float;
            precision mediump int;
            #endif

            uniform vec4 color;
            out vec4 outColor;

            void main(void) {
                outColor = color;
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

export {TrianglesBatchingSilhouetteRenderer};