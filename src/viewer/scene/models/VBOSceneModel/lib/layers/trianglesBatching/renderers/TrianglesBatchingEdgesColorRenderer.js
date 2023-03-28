import {Program} from "../../../../../../webgl/Program.js";
import {createRTCViewMat} from "../../../../../../math/rtcCoords.js";

/**
 * @private
 */
class TrianglesBatchingEdgesColorRenderer {

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
            if (this.errors) {
                return;
            }
        }

        if (frameCtx.lastProgramId !== this._program.id) {
            frameCtx.lastProgramId = this._program.id;
            this._bindProgram();
        }

        gl.uniform1i(this._uRenderPass, renderPass);

        gl.uniformMatrix4fv(this._uViewMatrix, false, (origin) ? createRTCViewMat(camera.viewMatrix, origin) : camera.viewMatrix);
        gl.uniformMatrix4fv(this._uWorldMatrix, false, model.worldMatrix);

        gl.uniformMatrix4fv(this._uPositionsDecodeMatrix, false, batchingLayer._state.positionsDecodeMatrix);

        this._aPosition.bindArrayBuffer(state.positionsBuf);
        this._aColor.bindArrayBuffer(state.colorsBuf);
        if (this._aFlags) {
            this._aFlags.bindArrayBuffer(state.flagsBuf);
        }
        if (this._aFlags2) {
            this._aFlags2.bindArrayBuffer(state.flags2Buf);
        }
        state.edgeIndicesBuf.bind();

        gl.drawElements(gl.LINES, state.edgeIndicesBuf.numItems, state.edgeIndicesBuf.itemType, 0);
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
        this._uViewMatrix = program.getLocation("viewMatrix");
        this._uWorldMatrix = program.getLocation("worldMatrix");
        this._uProjMatrix = program.getLocation("projMatrix");

        this._aPosition = program.getAttribute("position");
        this._aColor = program.getAttribute("color");
        this._aFlags = program.getAttribute("flags");
        this._aFlags2 = program.getAttribute("flags2");
    }

    _bindProgram() {

        const scene = this._scene;
        const gl = scene.canvas.gl;
        const program = this._program;
        const project = scene.camera.project;

        program.bind();

        gl.uniformMatrix4fv(this._uProjMatrix, false, project.matrix);
    }

    _buildShader() {
        return {
            vertex: this._buildVertexShader(),
            fragment: this._buildFragmentShader()
        };
    }

    _buildVertexShader() {
        // Batched geometry edges drawing vertex shader

        // flags.z = NOT_RENDERED | EDGES_COLOR_OPAQUE | EDGES_COLOR_TRANSPARENT | EDGES_HIGHLIGHTED | EDGES_XRAYED | EDGES_SELECTED
        // renderPass = EDGES_COLOR_OPAQUE | EDGES_COLOR_TRANSPARENT
        const src = [`\
        #version 300 es

        uniform int renderPass;

        in vec3 position;
        in vec4 color;
        in vec4 flags;
        in vec4 flags2;

        uniform mat4 worldMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projMatrix;
        uniform mat4 positionsDecodeMatrix;

        out vec4 vColor;

        void main(void) {
            if (int(flags.z) != renderPass) {
                gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            } else {
                vec4 worldPosition = worldMatrix * (positionsDecodeMatrix * vec4(position, 1.0)); 
                vec4 viewPosition  = viewMatrix * worldPosition; 
                vec4 clipPos = projMatrix * viewPosition;
                gl_Position = clipPos;
                vColor = vec4(float(color.r*0.5) / 255.0, float(color.g*0.5) / 255.0, float(color.b*0.5) / 255.0, float(color.a) / 255.0);
            }
        }`
        ];

        return src;
    }

    _buildFragmentShader() {
        // Batched geometry edges drawing fragment shader
        const src = [`\
        #version 300 es

        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        precision highp int;
        #else
        precision mediump float;
        precision mediump int;
        #endif

        in vec4 vColor;
        out vec4 outColor;

        void main(void) {
            outColor = vColor;
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
    }
}

export {TrianglesBatchingEdgesColorRenderer};