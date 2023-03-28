import {TrianglesBatchingColorRenderer} from "./renderers/TrianglesBatchingColorRenderer.js";
import {TrianglesBatchingSilhouetteRenderer} from "./renderers/TrianglesBatchingSilhouetteRenderer.js";
import {TrianglesBatchingEdgesRenderer} from "./renderers/TrianglesBatchingEdgesRenderer.js";
import {TrianglesBatchingEdgesColorRenderer} from "./renderers/TrianglesBatchingEdgesColorRenderer.js";
import {TrianglesBatchingPickMeshRenderer} from "./renderers/TrianglesBatchingPickMeshRenderer.js";
import {TrianglesBatchingPickDepthRenderer} from "./renderers/TrianglesBatchingPickDepthRenderer.js";
import {TrianglesBatchingPickNormalsRenderer} from "./renderers/TrianglesBatchingPickNormalsRenderer.js";
import {TrianglesBatchingDepthRenderer} from "./renderers/TrianglesBatchingDepthRenderer.js";
import {TrianglesBatchingNormalsRenderer} from "./renderers/TrianglesBatchingNormalsRenderer.js";
import {TrianglesBatchingColorTextureRenderer} from "./renderers/TrianglesBatchingColorTextureRenderer.js";

/**
 * @private
 */
class TrianglesBatchingRenderers {

    constructor(scene) {
        this._scene = scene;
    }

    _compile() {
    }

    get colorRenderer() {
        if (!this._colorRenderer) {
            this._colorRenderer = new TrianglesBatchingColorRenderer(this._scene, false);
        }
        return this._colorRenderer;
    }

    get colorTextureRenderer() {
        if (!this._colorTextureRenderer) {
            this._colorTextureRenderer = new TrianglesBatchingColorTextureRenderer(this._scene, false);
        }
        return this._colorTextureRenderer;
    }

    get silhouetteRenderer() {
        if (!this._silhouetteRenderer) {
            this._silhouetteRenderer = new TrianglesBatchingSilhouetteRenderer(this._scene);
        }
        return this._silhouetteRenderer;
    }

    get depthRenderer() {
        if (!this._depthRenderer) {
            this._depthRenderer = new TrianglesBatchingDepthRenderer(this._scene);
        }
        return this._depthRenderer;
    }

    get normalsRenderer() {
        if (!this._normalsRenderer) {
            this._normalsRenderer = new TrianglesBatchingNormalsRenderer(this._scene);
        }
        return this._normalsRenderer;
    }

    get edgesRenderer() {
        if (!this._edgesRenderer) {
            this._edgesRenderer = new TrianglesBatchingEdgesRenderer(this._scene);
        }
        return this._edgesRenderer;
    }

    get edgesColorRenderer() {
        if (!this._edgesColorRenderer) {
            this._edgesColorRenderer = new TrianglesBatchingEdgesColorRenderer(this._scene);
        }
        return this._edgesColorRenderer;
    }

    get pickMeshRenderer() {
        if (!this._pickMeshRenderer) {
            this._pickMeshRenderer = new TrianglesBatchingPickMeshRenderer(this._scene);
        }
        return this._pickMeshRenderer;
    }

    get pickNormalsRenderer() {
        if (!this._pickNormalsRenderer) {
            this._pickNormalsRenderer = new TrianglesBatchingPickNormalsRenderer(this._scene);
        }
        return this._pickNormalsRenderer;
    }

    get pickDepthRenderer() {
        if (!this._pickDepthRenderer) {
            this._pickDepthRenderer = new TrianglesBatchingPickDepthRenderer(this._scene);
        }
        return this._pickDepthRenderer;
    }

    _destroy() {
        if (this._colorRenderer) {
            this._colorRenderer.destroy();
        }
        if (this._colorTextureRenderer) {
            this._colorTextureRenderer.destroy();
        }
        if (this._depthRenderer) {
            this._depthRenderer.destroy();
        }
        if (this._normalsRenderer) {
            this._normalsRenderer.destroy();
        }
        if (this._silhouetteRenderer) {
            this._silhouetteRenderer.destroy();
        }
        if (this._edgesRenderer) {
            this._edgesRenderer.destroy();
        }
        if (this._edgesColorRenderer) {
            this._edgesColorRenderer.destroy();
        }
        if (this._pickMeshRenderer) {
            this._pickMeshRenderer.destroy();
        }
        if (this._pickDepthRenderer) {
            this._pickDepthRenderer.destroy();
        }
        if (this._pickNormalsRenderer) {
            this._pickNormalsRenderer.destroy();
        }
    }
}

const cachdRenderers = {};

/**
 * @private
 */
function getBatchingRenderers(scene) {
    const sceneId = scene.id;
    let batchingRenderers = cachdRenderers[sceneId];
    if (!batchingRenderers) {
        batchingRenderers = new TrianglesBatchingRenderers(scene);
        cachdRenderers[sceneId] = batchingRenderers;
        batchingRenderers._compile();
        scene.on("compile", () => {
            batchingRenderers._compile();
        });
        scene.on("destroyed", () => {
            delete cachdRenderers[sceneId];
            batchingRenderers._destroy();
        });
    }
    return batchingRenderers;
}

export {getBatchingRenderers};