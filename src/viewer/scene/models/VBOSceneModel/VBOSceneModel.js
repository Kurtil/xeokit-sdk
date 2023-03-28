import {Component} from "../../Component.js";
import {math} from "../../math/math.js";
import {buildEdgeIndices} from '../../math/buildEdgeIndices.js';
import {VBOSceneModelMesh} from './lib/VBOSceneModelMesh.js';
import {VBOSceneModelNode} from './lib/VBOSceneModelNode.js';
import {getScratchMemory, putScratchMemory} from "./lib/ScratchMemory.js";
import {TrianglesBatchingLayer} from './lib/layers/trianglesBatching/TrianglesBatchingLayer.js';
import {ENTITY_FLAGS} from './lib/ENTITY_FLAGS.js';
import {RenderFlags} from "../../webgl/RenderFlags.js";
import {worldToRTCPositions} from "../../math/rtcCoords.js";
import {VBOSceneModelTextureSet} from "./lib/VBOSceneModelTextureSet.js";
import {VBOSceneModelGeometry} from "./lib/VBOSceneModelGeometry.js";
import {VBOSceneModelTexture} from "./lib/VBOSceneModelTexture.js";
import {Texture2D} from "../../webgl/Texture2D.js";
import {utils} from "../../utils.js";
import {
    ClampToEdgeWrapping,
    LinearEncoding,
    LinearFilter,
    LinearMipmapLinearFilter,
    LinearMipMapNearestFilter,
    MirroredRepeatWrapping,
    NearestFilter,
    NearestMipMapLinearFilter,
    NearestMipMapNearestFilter,
    RepeatWrapping,
    sRGBEncoding
} from "../../constants/constants.js";

const tempVec3a = math.vec3();
const tempMat4 = math.mat4();

const defaultScale = math.vec3([1, 1, 1]);
const defaultPosition = math.vec3([0, 0, 0]);
const defaultRotation = math.vec3([0, 0, 0]);
const defaultQuaternion = math.identityQuaternion();

const defaultColorTextureId = "defaultColorTexture";
const defaultMetalRoughTextureId = "defaultMetalRoughTexture";
const defaultNormalsTextureId = "defaultNormalsTexture";
const defaultEmissiveTextureId = "defaultEmissiveTexture";
const defaultOcclusionTextureId = "defaultOcclusionTexture";
const defaultTextureSetId = "defaultTextureSet";


class VBOSceneModel extends Component {

    /**
     * @constructor
     * @param {Component} owner Owner component. When destroyed, the owner will destroy this component as well.
     * @param {*} [cfg] Configs
     * @param {String} [cfg.id] Optional ID, unique among all components in the parent scene, generated automatically when omitted.
     * @param {Boolean} [cfg.isModel] Specify ````true```` if this VBOSceneModel represents a model, in which case the VBOSceneModel will be registered by {@link VBOSceneModel#id} in {@link Scene#models} and may also have a corresponding {@link MetaModel} with matching {@link MetaModel#id}, registered by that ID in {@link MetaScene#metaModels}.
     * @param {Number[]} [cfg.origin=[0,0,0]] World-space double-precision 3D origin.
     * @param {Number[]} [cfg.position=[0,0,0]] Local, single-precision 3D position, relative to the origin parameter.
     * @param {Number[]} [cfg.scale=[1,1,1]] Local scale.
     * @param {Number[]} [cfg.rotation=[0,0,0]] Local rotation, as Euler angles given in degrees, for each of the X, Y and Z axis.
     * @param {Number[]} [cfg.matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] Local modelling transform matrix. Overrides the position, scale and rotation parameters.
     * @param {Boolean} [cfg.visible=true] Indicates if the VBOSceneModel is initially visible.
     * @param {Boolean} [cfg.culled=false] Indicates if the VBOSceneModel is initially culled from view.
     * @param {Boolean} [cfg.pickable=true] Indicates if the VBOSceneModel is initially pickable.
     * @param {Boolean} [cfg.clippable=true] Indicates if the VBOSceneModel is initially clippable.
     * @param {Boolean} [cfg.collidable=true] Indicates if the VBOSceneModel is initially included in boundary calculations.
     * @param {Boolean} [cfg.xrayed=false] Indicates if the VBOSceneModel is initially xrayed.
     * @param {Boolean} [cfg.highlighted=false] Indicates if the VBOSceneModel is initially highlighted.
     * @param {Boolean} [cfg.selected=false] Indicates if the VBOSceneModel is initially selected.
     * @param {Boolean} [cfg.edges=false] Indicates if the VBOSceneModel's edges are initially emphasized.
     * @param {Number[]} [cfg.colorize=[1.0,1.0,1.0]] VBOSceneModel's initial RGB colorize color, multiplies by the rendered fragment colors.
     * @param {Number} [cfg.opacity=1.0] VBOSceneModel's initial opacity factor, multiplies by the rendered fragment alpha.
     * @param {Number} [cfg.backfaces=false] When we set this ````true````, then we force rendering of backfaces for this VBOSceneModel. When
     * we leave this ````false````, then we allow the Viewer to decide when to render backfaces. In that case, the
     * Viewer will hide backfaces on watertight meshes, show backfaces on open meshes, and always show backfaces on meshes when we slice them open with {@link SectionPlane}s.
     * @param {Boolean} [cfg.colorTextureEnabled=true] Indicates if base color textures will be rendered for the VBOSceneModel when {@link Scene#colorTextureEnabled} is ````true````.
     * @param {Number} [cfg.edgeThreshold=10] When xraying, highlighting, selecting or edging, this is the threshold angle between normals of adjacent triangles, below which their shared wireframe edge is not drawn.
     * @param {Number} [cfg.maxGeometryBatchSize=50000000] Maximum geometry batch size, as number of vertices. This is optionally supplied
     * to limit the size of the batched geometry arrays that VBOSceneModel internally creates for batched geometries.
     * A lower value means less heap allocation/de-allocation while creating/loading batched geometries, but more draw calls and
     * slower rendering speed. A high value means larger heap allocation/de-allocation while creating/loading, but less draw calls
     * and faster rendering speed. It's recommended to keep this somewhere roughly between ````50000```` and ````50000000```.
     */
    constructor(owner, cfg = {}) {

        super(owner, cfg);

        this._maxGeometryBatchSize = cfg.maxGeometryBatchSize;

        this._aabb = math.collapseAABB3();
        this._aabbDirty = false;
        this._layerList = []; // For GL state efficiency when drawing, InstancingLayers are in first part, BatchingLayers are in second
        this._nodeList = [];

        this._lastOrigin = null;
        this._lastPositionsDecodeMatrix = null;
        this._lastNormals = null;

        this._instancingLayers = {};
        this._currentBatchingLayers = {};

        this._scratchMemory = getScratchMemory();

        this._geometries = {};
        this._textures = {};
        this._textureSets = {};
        this._meshes = {};
        this._nodes = {};

        /** @private **/
        this.renderFlags = new RenderFlags();

        /**
         * @private
         */
        this.numGeometries = 0; // Number of geometries created with createGeometry()

        // These counts are used to avoid unnecessary render passes
        // They are incremented or decremented exclusively by BatchingLayer and InstancingLayer

        /**
         * @private
         */
        this.numPortions = 0;

        /**
         * @private
         */
        this.numVisibleLayerPortions = 0;

        /**
         * @private
         */
        this.numTransparentLayerPortions = 0;

        /**
         * @private
         */
        this.numXRayedLayerPortions = 0;

        /**
         * @private
         */
        this.numHighlightedLayerPortions = 0;

        /**
         * @private
         */
        this.numSelectedLayerPortions = 0;

        /**
         * @private
         */
        this.numEdgesLayerPortions = 0;

        /**
         * @private
         */
        this.numPickableLayerPortions = 0;

        /**
         * @private
         */
        this.numClippableLayerPortions = 0;

        /**
         * @private
         */
        this.numCulledLayerPortions = 0;

        /** @private */
        this.numEntities = 0;

        /** @private */
        this._numTriangles = 0;

        /** @private */
        this._numLines = 0;

        /** @private */
        this._numPoints = 0;

        this._edgeThreshold = cfg.edgeThreshold || 10;

        // Build static matrix

        this._origin = math.vec3(cfg.origin || [0, 0, 0]);
        this._position = math.vec3(cfg.position || [0, 0, 0]);
        this._rotation = math.vec3(cfg.rotation || [0, 0, 0]);
        this._quaternion = math.vec4(cfg.quaternion || [0, 0, 0, 1]);
        if (cfg.rotation) {
            math.eulerToQuaternion(this._rotation, "XYZ", this._quaternion);
        }
        this._scale = math.vec3(cfg.scale || [1, 1, 1]);
        this._worldMatrix = math.mat4();
        math.composeMat4(this._position, this._quaternion, this._scale, this._worldMatrix);
        this._worldNormalMatrix = math.mat4();
        math.inverseMat4(this._worldMatrix, this._worldNormalMatrix);
        math.transposeMat4(this._worldNormalMatrix);

        if (cfg.matrix || cfg.position || cfg.rotation || cfg.scale || cfg.quaternion) {
            this._viewMatrix = math.mat4();
            this._viewNormalMatrix = math.mat4();
            this._viewMatrixDirty = true;
            this._worldMatrixNonIdentity = true;
        }

        this._opacity = 1.0;
        this._colorize = [1, 1, 1];

        this._colorTextureEnabled = (cfg.colorTextureEnabled !== false);

        this._isModel = cfg.isModel;
        if (this._isModel) {
            this.scene._registerModel(this);
        }

        this._onCameraViewMatrix = this.scene.camera.on("matrix", () => {
            this._viewMatrixDirty = true;
        });

        this._createDefaultTextureSet();

        this.visible = cfg.visible;
        this.culled = cfg.culled;
        this.pickable = cfg.pickable;
        this.clippable = cfg.clippable;
        this.collidable = cfg.collidable;
        this.castsShadow = cfg.castsShadow;
        this.receivesShadow = cfg.receivesShadow;
        this.xrayed = cfg.xrayed;
        this.highlighted = cfg.highlighted;
        this.selected = cfg.selected;
        this.edges = cfg.edges;
        this.colorize = cfg.colorize;
        this.opacity = cfg.opacity;
        this.backfaces = cfg.backfaces;
    }

    _createDefaultTextureSet() {
        // Every VBOSceneModelMesh gets at least the default TextureSet,
        // which contains empty default textures filled with color
        const defaultColorTexture = new VBOSceneModelTexture({
            id: defaultColorTextureId,
            texture: new Texture2D({
                gl: this.scene.canvas.gl,
                preloadColor: [1, 1, 1, 1] // [r, g, b, a]})
            })
        });
        const defaultMetalRoughTexture = new VBOSceneModelTexture({
            id: defaultMetalRoughTextureId,
            texture: new Texture2D({
                gl: this.scene.canvas.gl,
                preloadColor: [0, 1, 1, 1] // [unused, roughness, metalness, unused]
            })
        });
        const defaultNormalsTexture = new VBOSceneModelTexture({
            id: defaultNormalsTextureId,
            texture: new Texture2D({
                gl: this.scene.canvas.gl,
                preloadColor: [0, 0, 0, 0] // [x, y, z, unused] - these must be zeros
            })
        });
        const defaultEmissiveTexture = new VBOSceneModelTexture({
            id: defaultEmissiveTextureId,
            texture: new Texture2D({
                gl: this.scene.canvas.gl,
                preloadColor: [0, 0, 0, 1] // [x, y, z, unused]
            })
        });
        const defaultOcclusionTexture = new VBOSceneModelTexture({
            id: defaultOcclusionTextureId,
            texture: new Texture2D({
                gl: this.scene.canvas.gl,
                preloadColor: [1, 1, 1, 1] // [x, y, z, unused]
            })
        });
        this._textures[defaultColorTextureId] = defaultColorTexture;
        this._textures[defaultMetalRoughTextureId] = defaultMetalRoughTexture;
        this._textures[defaultNormalsTextureId] = defaultNormalsTexture;
        this._textures[defaultEmissiveTextureId] = defaultEmissiveTexture;
        this._textures[defaultOcclusionTextureId] = defaultOcclusionTexture;
        this._textureSets[defaultTextureSetId] = new VBOSceneModelTextureSet({
            id: defaultTextureSetId,
            model: this,
            colorTexture: defaultColorTexture,
            metallicRoughnessTexture: defaultMetalRoughTexture,
            normalsTexture: defaultNormalsTexture,
            emissiveTexture: defaultEmissiveTexture,
            occlusionTexture: defaultOcclusionTexture
        });
    }

    //------------------------------------------------------------------------------------------------------------------
    // VBOSceneModel members
    //------------------------------------------------------------------------------------------------------------------

    /**
     * Returns true to indicate that this Component is a VBOSceneModel.
     * @type {Boolean}
     */
    get isPerformanceModel() {
        return true;
    }

    /**
     * Returns the {@link Entity}s in this VBOSceneModel.
     * @returns {*|{}}
     */
    get objects() {
        return this._nodes;
    }

    /**
     * Gets the 3D World-space origin for this VBOSceneModel.
     *
     * Each geometry or mesh origin, if supplied, is relative to this origin.
     *
     * Default value is ````[0,0,0]````.
     *
     * @type {Float64Array}
     * @abstract
     */
    get origin() {
        return this._origin;
    }

    /**
     * Gets the VBOSceneModel's local translation.
     *
     * Default value is ````[0,0,0]````.
     *
     * @type {Number[]}
     */
    get position() {
        return this._position;
    }

    /**
     * Gets the VBOSceneModel's local rotation, as Euler angles given in degrees, for each of the X, Y and Z axis.
     *
     * Default value is ````[0,0,0]````.
     *
     * @type {Number[]}
     */
    get rotation() {
        return this._rotation;
    }

    /**
     * Gets the PerformanceModels's local rotation quaternion.
     *
     * Default value is ````[0,0,0,1]````.
     *
     * @type {Number[]}
     */
    get quaternion() {
        return this._quaternion;
    }

    /**
     * Gets the VBOSceneModel's local scale.
     *
     * Default value is ````[1,1,1]````.
     *
     * @type {Number[]}
     */
    get scale() {
        return this._scale;
    }

    /**
     * Gets the VBOSceneModel's local modeling transform matrix.
     *
     * Default value is ````[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]````.
     *
     * @type {Number[]}
     */
    get matrix() {
        return this._worldMatrix;
    }

    /**
     * Gets the VBOSceneModel's World matrix.
     *
     * @property worldMatrix
     * @type {Number[]}
     */
    get worldMatrix() {
        return this._worldMatrix;
    }

    /**
     * Gets the VBOSceneModel's World normal matrix.
     *
     * @type {Number[]}
     */
    get worldNormalMatrix() {
        return this._worldNormalMatrix;
    }

    /**
     * Called by private renderers in ./lib, returns the view matrix with which to
     * render this VBOSceneModel. The view matrix is the concatenation of the
     * Camera view matrix with the Performance model's world (modeling) matrix.
     *
     * @private
     */
    get viewMatrix() {
        if (!this._viewMatrix) {
            return this.scene.camera.viewMatrix;
        }
        if (this._viewMatrixDirty) {
            math.mulMat4(this.scene.camera.viewMatrix, this._worldMatrix, this._viewMatrix);
            math.inverseMat4(this._viewMatrix, this._viewNormalMatrix);
            math.transposeMat4(this._viewNormalMatrix);
            this._viewMatrixDirty = false;
        }
        return this._viewMatrix;
    }

    /**
     * Called by private renderers in ./lib, returns the view normal matrix with which to render this VBOSceneModel.
     *
     * @private
     */
    get viewNormalMatrix() {
        if (!this._viewNormalMatrix) {
            return this.scene.camera.viewNormalMatrix;
        }
        if (this._viewMatrixDirty) {
            math.mulMat4(this.scene.camera.viewMatrix, this._worldMatrix, this._viewMatrix);
            math.inverseMat4(this._viewMatrix, this._viewNormalMatrix);
            math.transposeMat4(this._viewNormalMatrix);
            this._viewMatrixDirty = false;
        }
        return this._viewNormalMatrix;
    }

    /**
     * Sets if backfaces are rendered for this VBOSceneModel.
     *
     * Default is ````false````.
     *
     * @type {Boolean}
     */
    get backfaces() {
        return this._backfaces;
    }

    /**
     * Sets if backfaces are rendered for this VBOSceneModel.
     *
     * Default is ````false````.
     *
     * When we set this ````true````, then backfaces are always rendered for this VBOSceneModel.
     *
     * When we set this ````false````, then we allow the Viewer to decide whether to render backfaces. In this case,
     * the Viewer will:
     *
     *  * hide backfaces on watertight meshes,
     *  * show backfaces on open meshes, and
     *  * always show backfaces on meshes when we slice them open with {@link SectionPlane}s.
     *
     * @type {Boolean}
     */
    set backfaces(backfaces) {
        backfaces = !!backfaces;
        this._backfaces = backfaces;
        this.glRedraw();
    }

    /**
     * Gets the list of {@link Entity}s within this VBOSceneModel.
     *
     * @returns {Entity[]}
     */
    get entityList() {
        return this._nodeList;
    }

    /**
     * Returns true to indicate that VBOSceneModel is an {@link Entity}.
     * @type {Boolean}
     */
    get isEntity() {
        return true;
    }

    /**
     * Returns ````true```` if this VBOSceneModel represents a model.
     *
     * When ````true```` the VBOSceneModel will be registered by {@link VBOSceneModel#id} in
     * {@link Scene#models} and may also have a {@link MetaObject} with matching {@link MetaObject#id}.
     *
     * @type {Boolean}
     */
    get isModel() {
        return this._isModel;
    }

    //------------------------------------------------------------------------------------------------------------------
    // VBOSceneModel members
    //------------------------------------------------------------------------------------------------------------------

    /**
     * Returns ````false```` to indicate that VBOSceneModel never represents an object.
     *
     * @type {Boolean}
     */
    get isObject() {
        return false;
    }

    /**
     * Gets the VBOSceneModel's World-space 3D axis-aligned bounding box.
     *
     * Represented by a six-element Float64Array containing the min/max extents of the
     * axis-aligned volume, ie. ````[xmin, ymin,zmin,xmax,ymax, zmax]````.
     *
     * @type {Number[]}
     */
    get aabb() {
        if (this._aabbDirty) {
            this._rebuildAABB();
        }
        return this._aabb;
    }

    /**
     * The approximate number of triangle primitives in this VBOSceneModel.
     *
     * @type {Number}
     */
    get numTriangles() {
        return this._numTriangles;
    }

    //------------------------------------------------------------------------------------------------------------------
    // Entity members
    //------------------------------------------------------------------------------------------------------------------

    /**
     * The approximate number of line primitives in this VBOSceneModel.
     *
     * @type {Number}
     */
    get numLines() {
        return this._numLines;
    }

    /**
     * The approximate number of point primitives in this VBOSceneModel.
     *
     * @type {Number}
     */
    get numPoints() {
        return this._numPoints;
    }

    /**
     * Gets if any {@link Entity}s in this VBOSceneModel are visible.
     *
     * The VBOSceneModel is only rendered when {@link VBOSceneModel#visible} is ````true```` and {@link VBOSceneModel#culled} is ````false````.
     *
     * @type {Boolean}
     */
    get visible() {
        return (this.numVisibleLayerPortions > 0);
    }

    /**
     * Sets if this VBOSceneModel is visible.
     *
     * The VBOSceneModel is only rendered when {@link VBOSceneModel#visible} is ````true```` and {@link VBOSceneModel#culled} is ````false````.
     **
     * @type {Boolean}
     */
    set visible(visible) {
        visible = visible !== false;
        this._visible = visible;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].visible = visible;
        }
        this.glRedraw();
    }

    /**
     * Gets if any {@link Entity}s in this VBOSceneModel are xrayed.
     *
     * @type {Boolean}
     */
    get xrayed() {
        return (this.numXRayedLayerPortions > 0);
    }

    /**
     * Sets if all {@link Entity}s in this VBOSceneModel are xrayed.
     *
     * @type {Boolean}
     */
    set xrayed(xrayed) {
        xrayed = !!xrayed;
        this._xrayed = xrayed;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].xrayed = xrayed;
        }
        this.glRedraw();
    }

    /**
     * Gets if any {@link Entity}s in this VBOSceneModel are highlighted.
     *
     * @type {Boolean}
     */
    get highlighted() {
        return (this.numHighlightedLayerPortions > 0);
    }

    /**
     * Sets if all {@link Entity}s in this VBOSceneModel are highlighted.
     *
     * @type {Boolean}
     */
    set highlighted(highlighted) {
        highlighted = !!highlighted;
        this._highlighted = highlighted;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].highlighted = highlighted;
        }
        this.glRedraw();
    }

    /**
     * Gets if any {@link Entity}s in this VBOSceneModel are selected.
     *
     * @type {Boolean}
     */
    get selected() {
        return (this.numSelectedLayerPortions > 0);
    }

    /**
     * Sets if all {@link Entity}s in this VBOSceneModel are selected.
     *
     * @type {Boolean}
     */
    set selected(selected) {
        selected = !!selected;
        this._selected = selected;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].selected = selected;
        }
        this.glRedraw();
    }

    /**
     * Gets if any {@link Entity}s in this VBOSceneModel have edges emphasised.
     *
     * @type {Boolean}
     */
    get edges() {
        return (this.numEdgesLayerPortions > 0);
    }

    /**
     * Sets if all {@link Entity}s in this VBOSceneModel have edges emphasised.
     *
     * @type {Boolean}
     */
    set edges(edges) {
        edges = !!edges;
        this._edges = edges;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].edges = edges;
        }
        this.glRedraw();
    }

    /**
     * Gets if this VBOSceneModel is culled from view.
     *
     * The VBOSceneModel is only rendered when {@link VBOSceneModel#visible} is true and {@link VBOSceneModel#culled} is false.
     *
     * @type {Boolean}
     */
    get culled() {
        return this._culled;
    }

    /**
     * Sets if this VBOSceneModel is culled from view.
     *
     * The VBOSceneModel is only rendered when {@link VBOSceneModel#visible} is true and {@link VBOSceneModel#culled} is false.
     *
     * @type {Boolean}
     */
    set culled(culled) {
        culled = !!culled;
        this._culled = culled;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].culled = culled;
        }
        this.glRedraw();
    }

    /**
     * Gets if {@link Entity}s in this VBOSceneModel are clippable.
     *
     * Clipping is done by the {@link SectionPlane}s in {@link Scene#sectionPlanes}.
     *
     * @type {Boolean}
     */
    get clippable() {
        return this._clippable;
    }

    /**
     * Sets if {@link Entity}s in this VBOSceneModel are clippable.
     *
     * Clipping is done by the {@link SectionPlane}s in {@link Scene#sectionPlanes}.
     *
     * @type {Boolean}
     */
    set clippable(clippable) {
        clippable = clippable !== false;
        this._clippable = clippable;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].clippable = clippable;
        }
        this.glRedraw();
    }

    /**
     * Gets if this VBOSceneModel is collidable.
     *
     * @type {Boolean}
     */
    get collidable() {
        return this._collidable;
    }

    /**
     * Sets if {@link Entity}s in this VBOSceneModel are collidable.
     *
     * @type {Boolean}
     */
    set collidable(collidable) {
        collidable = collidable !== false;
        this._collidable = collidable;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].collidable = collidable;
        }
    }

    /**
     * Gets if this VBOSceneModel is pickable.
     *
     * Picking is done via calls to {@link Scene#pick}.
     *
     * @type {Boolean}
     */
    get pickable() {
        return (this.numPickableLayerPortions > 0);
    }

    /**
     * Sets if {@link Entity}s in this VBOSceneModel are pickable.
     *
     * Picking is done via calls to {@link Scene#pick}.
     *
     * @type {Boolean}
     */
    set pickable(pickable) {
        pickable = pickable !== false;
        this._pickable = pickable;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].pickable = pickable;
        }
    }

    /**
     * Gets the RGB colorize color for this VBOSceneModel.
     *
     * Each element of the color is in range ````[0..1]````.
     *
     * @type {Number[]}
     */
    get colorize() {
        return this._colorize;
    }

    /**
     * Sets the RGB colorize color for this VBOSceneModel.
     *
     * Multiplies by rendered fragment colors.
     *
     * Each element of the color is in range ````[0..1]````.
     *
     * @type {Number[]}
     */
    set colorize(colorize) {
        this._colorize = colorize;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].colorize = colorize;
        }
    }

    /**
     * Gets this VBOSceneModel's opacity factor.
     *
     * This is a factor in range ````[0..1]```` which multiplies by the rendered fragment alphas.
     *
     * @type {Number}
     */
    get opacity() {
        return this._opacity;
    }

    /**
     * Sets the opacity factor for this VBOSceneModel.
     *
     * This is a factor in range ````[0..1]```` which multiplies by the rendered fragment alphas.
     *
     * @type {Number}
     */
    set opacity(opacity) {
        this._opacity = opacity;
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i].opacity = opacity;
        }
    }

    /**
     * Gets if color textures are enabled for this VBOSceneModel.
     *
     * Only works when {@link Scene#colorTextureEnabled} is also true.
     *
     * @type {Boolean}
     */
    get colorTextureEnabled() {
        return this._colorTextureEnabled;
    }

    /**
     * Returns true to indicate that VBOSceneModel is implements {@link Drawable}.
     *
     * @type {Boolean}
     */
    get isDrawable() {
        return true;
    }

    /** @private */
    get isStateSortable() {
        return false
    }

    /**
     * Configures the appearance of xrayed {@link Entity}s within this VBOSceneModel.
     *
     * This is the {@link Scene#xrayMaterial}.
     *
     * @type {EmphasisMaterial}
     */
    get xrayMaterial() {
        return this.scene.xrayMaterial;
    }

    /**
     * Configures the appearance of highlighted {@link Entity}s within this VBOSceneModel.
     *
     * This is the {@link Scene#highlightMaterial}.
     *
     * @type {EmphasisMaterial}
     */
    get highlightMaterial() {
        return this.scene.highlightMaterial;
    }

    /**
     * Configures the appearance of selected {@link Entity}s within this VBOSceneModel.
     *
     * This is the {@link Scene#selectedMaterial}.
     *
     * @type {EmphasisMaterial}
     */
    get selectedMaterial() {
        return this.scene.selectedMaterial;
    }

    /**
     * Configures the appearance of edges of {@link Entity}s within this VBOSceneModel.
     *
     * This is the {@link Scene#edgeMaterial}.
     *
     * @type {EdgeMaterial}
     */
    get edgeMaterial() {
        return this.scene.edgeMaterial;
    }

    //------------------------------------------------------------------------------------------------------------------
    // Drawable members
    //------------------------------------------------------------------------------------------------------------------

    /**
     * Called by private renderers in ./lib, returns the picking view matrix with which to
     * ray-pick on this VBOSceneModel.
     *
     * @private
     */
    getPickViewMatrix(pickViewMatrix) {
        if (!this._viewMatrix) {
            return pickViewMatrix;
        }
        return this._viewMatrix;
    }

    /**
     * Creates a reusable geometry within this VBOSceneModel.
     *
     * We can then supply the geometry ID to {@link VBOSceneModel#createMesh} when we want to create meshes that instance the geometry.
     *
     * @param {*} cfg Geometry properties.
     * @param {String|Number} cfg.id Mandatory ID for the geometry, to refer to with {@link VBOSceneModel#createMesh}.
     * @param {String} cfg.primitive The primitive type. Accepted values are 'points', 'lines', 'triangles', 'solid' and 'surface'.
     * @param {Number[]} [cfg.positions] Flat array of uncompressed 3D vertex positions positions. Required for all primitive types. Overridden by ````positionsCompressed````.
     * @param {Number[]} [cfg.positionsCompressed] Flat array of quantized 3D vertex positions. Overrides ````positions````, and must be accompanied by ````positionsDecodeMatrix````.
     * @param {Number[]} [cfg.positionsDecodeMatrix] A 4x4 matrix for decompressing ````positionsCompressed````. Must be accompanied by ````positionsCompressed````.
     * @param {Number[]} [cfg.normals] Flat array of normal vectors. Only used with "triangles", "solid" and "surface" primitives. When no normals are given, the geometry will be flat shaded using auto-generated face-aligned normals.
     * @param {Number[]} [cfg.normalsCompressed] Flat array of oct-encoded normal vectors. Overrides ````normals````. Only used with "triangles", "solid" and "surface" primitives. When no normals are given, the geometry will be flat shaded using auto-generated face-aligned normals.
     * @param {Number[]} [cfg.colors] Flat array of uncompressed RGBA vertex colors, as float values in range ````[0..1]````. Ignored when ````geometryId```` is given. Overridden by ````color```` and ````colorsCompressed````.
     * @param {Number[]} [cfg.colorsCompressed] Flat array of compressed RGBA vertex colors, as unsigned short integers in range ````[0..255]````. Ignored when ````geometryId```` is given. Overrides ````colors```` and is overridden by ````color````.
     * @param {Number[]} [cfg.uv] Flat array of uncompressed vertex UV coordinates. Only used with "triangles", "solid" and "surface" primitives. Required for textured rendering.
     * @param {Number[]} [cfg.uvCompressed] Flat array of compressed vertex UV coordinates. Only used with "triangles", "solid" and "surface" primitives. Overrides ````uv````. Must be accompanied by ````uvDecodeMatrix````. Only used with "triangles", "solid" and "surface" primitives. Required for textured rendering.
     * @param {Number[]} [cfg.uvDecodeMatrix] A 3x3 matrix for decompressing ````uvCompressed````.
     * @param {Number[]} [cfg.indices] Array of primitive connectivity indices. Not required for `points` primitives.
     * @param {Number[]} [cfg.edgeIndices] Array of edge line indices. Used only with 'triangles', 'solid' and 'surface' primitives. Automatically generated internally if not supplied, using the optional ````edgeThreshold```` given to the ````VBOSceneModel```` constructor.
     */
    createGeometry(cfg) {
        const geometryId = cfg.id;
        if (geometryId === undefined || geometryId === null) {
            this.error("Config missing: id");
            return;
        }
        if (this._geometries[geometryId]) {
            this.error("Geometry already created: " + geometryId);
            return;
        }
        const primitive = cfg.primitive;
        if (primitive === undefined || primitive === null) {
            this.error("Param expected: primitive");
            return;
        }
        if (primitive !== "points" && primitive !== "lines" && primitive !== "triangles" && primitive !== "solid" && primitive !== "surface") {
            this.error(`Unsupported value for 'primitive': '${primitive}' - supported values are 'points', 'lines', 'triangles', 'solid' and 'surface'. Defaulting to 'triangles'.`);
            return;
        }
        if (!cfg.positions && !cfg.positionsCompressed) {
            this.error("Param expected: `positions` or `positionsCompressed'");
            return null;
        }
        if (cfg.positionsCompressed && !cfg.positionsDecodeMatrix) {
            this.error("Param expected: `positionsDecodeMatrix` (required for `positionsCompressed')");
            return null;
        }
        if (cfg.uvCompressed && !cfg.uvDecodeMatrix) {
            this.error("Param expected: `uvDecodeMatrix` (required for `uvCompressed')");
            return null;
        }
        if (!cfg.indices && primitive !== "points") {
            this.error(`Param expected: indices (required for '${primitive}' primitive type)`);
            return null;
        }
        const geometry = new VBOSceneModelGeometry(geometryId, this, cfg);
        this._geometries[geometryId] = geometry;
        this._numTriangles += (cfg.indices ? Math.round(cfg.indices.length / 3) : 0);
        this.numGeometries++;
    }

    /**
     * Creates a texture within this VBOSceneModel.
     *
     * We can then supply the texture ID to {@link VBOSceneModel#createTextureSet} when we want to create texture sets that use the texture.
     *
     * @param {*} cfg Texture properties.
     * @param {String|Number} cfg.id Mandatory ID for the texture, to refer to with {@link VBOSceneModel#createTextureSet}.
     * @param {String} [cfg.src] Image file for the texture. Assumed to be transcoded if not having a recognized image file
     * extension (jpg, jpeg, png etc.). If transcoded, then assumes ````VBOSceneModel```` is configured with a {@link TextureTranscoder}.
     * configured with a {@link TextureTranscoder}. This parameter is given as an array of buffers so we can potentially support multi-image textures, such as cube maps.
     * @param {HTMLImageElement} [cfg.image] HTML Image object to load into this texture. Overrides ````src```` and ````buffers````. Never transcoded.
     * @param {Number} [cfg.minFilter=LinearMipmapLinearFilter] How the texture is sampled when a texel covers less than one pixel.
     * Supported values are {@link LinearMipmapLinearFilter}, {@link LinearMipMapNearestFilter}, {@link NearestMipMapNearestFilter}, {@link NearestMipMapLinearFilter} and {@link LinearMipMapLinearFilter}.
     * @param {Number} [cfg.magFilter=LinearFilter] How the texture is sampled when a texel covers more than one pixel. Supported values are {@link LinearFilter} and {@link NearestFilter}.
     * @param {Number} [cfg.wrapS=RepeatWrapping] Wrap parameter for texture coordinate *S*. Supported values are {@link ClampToEdgeWrapping}, {@link MirroredRepeatWrapping} and {@link RepeatWrapping}.
     * @param {Number} [cfg.wrapT=RepeatWrapping] Wrap parameter for texture coordinate *T*. Supported values are {@link ClampToEdgeWrapping}, {@link MirroredRepeatWrapping} and {@link RepeatWrapping}..
     * @param {Number} [cfg.wrapR=RepeatWrapping] Wrap parameter for texture coordinate *R*. Supported values are {@link ClampToEdgeWrapping}, {@link MirroredRepeatWrapping} and {@link RepeatWrapping}.
     * @param {Boolean} [cfg.flipY=false] Flips this Texture's source data along its vertical axis when ````true````.
     * @param  {Number} [cfg.encoding=LinearEncoding] Encoding format. Supported values are {@link LinearEncoding} and {@link sRGBEncoding}.
     */
    createTexture(cfg) {
        const textureId = cfg.id;
        if (textureId === undefined || textureId === null) {
            this.error("Config missing: id");
            return;
        }
        if (this._textures[textureId]) {
            this.error("Texture already created: " + textureId);
            return;
        }
        if (!cfg.src && !cfg.image && !cfg.buffers) {
            this.error("Param expected: `src`, `image' or 'buffers'");
            return null;
        }
        let minFilter = cfg.minFilter || LinearMipmapLinearFilter;
        if (minFilter !== LinearFilter &&
            minFilter !== LinearMipMapNearestFilter &&
            minFilter !== LinearMipmapLinearFilter &&
            minFilter !== NearestMipMapLinearFilter &&
            minFilter !== NearestMipMapNearestFilter) {
            this.error(`[createTexture] Unsupported value for 'minFilter' - 
            supported values are LinearFilter, LinearMipMapNearestFilter, NearestMipMapNearestFilter, 
            NearestMipMapLinearFilter and LinearMipmapLinearFilter. Defaulting to LinearMipmapLinearFilter.`);
            minFilter = LinearMipmapLinearFilter;
        }
        let magFilter = cfg.magFilter || LinearFilter;
        if (magFilter !== LinearFilter && magFilter !== NearestFilter) {
            this.error(`[createTexture] Unsupported value for 'magFilter' - supported values are LinearFilter and NearestFilter. Defaulting to LinearFilter.`);
            magFilter = LinearFilter;
        }
        let wrapS = cfg.wrapS || RepeatWrapping;
        if (wrapS !== ClampToEdgeWrapping && wrapS !== MirroredRepeatWrapping && wrapS !== RepeatWrapping) {
            this.error(`[createTexture] Unsupported value for 'wrapS' - supported values are ClampToEdgeWrapping, MirroredRepeatWrapping and RepeatWrapping. Defaulting to RepeatWrapping.`);
            wrapS = RepeatWrapping;
        }
        let wrapT = cfg.wrapT || RepeatWrapping;
        if (wrapT !== ClampToEdgeWrapping && wrapT !== MirroredRepeatWrapping && wrapT !== RepeatWrapping) {
            this.error(`[createTexture] Unsupported value for 'wrapT' - supported values are ClampToEdgeWrapping, MirroredRepeatWrapping and RepeatWrapping. Defaulting to RepeatWrapping.`);
            wrapT = RepeatWrapping;
        }
        let wrapR = cfg.wrapR || RepeatWrapping;
        if (wrapR !== ClampToEdgeWrapping && wrapR !== MirroredRepeatWrapping && wrapR !== RepeatWrapping) {
            this.error(`[createTexture] Unsupported value for 'wrapR' - supported values are ClampToEdgeWrapping, MirroredRepeatWrapping and RepeatWrapping. Defaulting to RepeatWrapping.`);
            wrapR = RepeatWrapping;
        }
        let encoding = cfg.encoding || LinearEncoding;
        if (encoding !== LinearEncoding && encoding !== sRGBEncoding) {
            this.error("[createTexture] Unsupported value for 'encoding' - supported values are LinearEncoding and sRGBEncoding. Defaulting to LinearEncoding.");
            encoding = LinearEncoding;
        }
        const texture = new Texture2D({
            gl: this.scene.canvas.gl,
            minFilter,
            magFilter,
            wrapS,
            wrapT,
            wrapR,
           // flipY: cfg.flipY,
            encoding
        });
        if (cfg.preloadColor) {
            texture.setPreloadColor(cfg.preloadColor);
        }
        if (cfg.image) { // Ignore transcoder for Images
            const image = cfg.image;
            image.crossOrigin = "Anonymous";
            texture.setImage(image, {minFilter, magFilter, wrapS, wrapT, wrapR, flipY: cfg.flipY, encoding});

        } else if (cfg.src) {
            const image = new Image();
            image.onload = () => {
                texture.setImage(image, {
                    minFilter,
                    magFilter,
                    wrapS,
                    wrapT,
                    wrapR,
                    flipY: cfg.flipY,
                    encoding
                });
                this.glRedraw();
            };
            image.src = cfg.src; // URL or Base64 string
        }

        this._textures[textureId] = new VBOSceneModelTexture({id: textureId, texture});
    }

    /**
     * Creates a texture set within this VBOSceneModel.
     *
     * A texture set is a collection of textures that can be shared among meshes. We can then supply the texture set
     * ID to {@link VBOSceneModel#createMesh} when we want to create meshes that use the texture set.
     *
     * The textures can work as a texture atlas, where each mesh can have geometry UVs that index
     * a different part of the textures. This allows us to minimize the number of textures in our models, which
     * means faster rendering.
     *
     * @param {*} cfg Texture set properties.
     * @param {String|Number} cfg.id Mandatory ID for the texture set, to refer to with {@link VBOSceneModel#createMesh}.
     * @param {*} [cfg.colorTextureId] ID of *RGBA* base color texture, with color in *RGB* and alpha in *A*.
     * @param {*} [cfg.metallicRoughnessTextureId] ID of *RGBA* metal-roughness texture, with the metallic factor in *R*, and roughness factor in *G*.
     * @param {*} [cfg.normalsTextureId] ID of *RGBA* normal map texture, with normal map vectors in *RGB*.
     * @param {*} [cfg.emissiveTextureId] ID of *RGBA* emissive map texture, with emissive color in *RGB*.
     * @param {*} [cfg.occlusionTextureId] ID of *RGBA* occlusion map texture, with occlusion factor in *R*.
     */
    createTextureSet(cfg) {
        const textureSetId = cfg.id;
        if (textureSetId === undefined || textureSetId === null) {
            this.error("Config missing: id");
            return;
        }
        if (this._textureSets[textureSetId]) {
            this.error(`Texture set already created: ${textureSetId}`);
            return;
        }
        let colorTexture;
        if (cfg.colorTextureId !== undefined && cfg.colorTextureId !== null) {
            colorTexture = this._textures[cfg.colorTextureId];
            if (!colorTexture) {
                this.error(`Texture not found: ${cfg.colorTextureId} - ensure that you create it first with createTexture()`);
                return;
            }
        } else {
            colorTexture = this._textures[defaultColorTextureId];
        }
        let metallicRoughnessTexture;
        if (cfg.metallicRoughnessTextureId !== undefined && cfg.metallicRoughnessTextureId !== null) {
            metallicRoughnessTexture = this._textures[cfg.metallicRoughnessTextureId];
            if (!metallicRoughnessTexture) {
                this.error(`Texture not found: ${cfg.metallicRoughnessTextureId} - ensure that you create it first with createTexture()`);
                return;
            }
        } else {
            metallicRoughnessTexture = this._textures[defaultMetalRoughTextureId];
        }
        let normalsTexture;
        if (cfg.normalsTextureId !== undefined && cfg.normalsTextureId !== null) {
            normalsTexture = this._textures[cfg.normalsTextureId];
            if (!normalsTexture) {
                this.error(`Texture not found: ${cfg.normalsTextureId} - ensure that you create it first with createTexture()`);
                return;
            }
        } else {
            normalsTexture = this._textures[defaultNormalsTextureId];
        }
        let emissiveTexture;
        if (cfg.emissiveTextureId !== undefined && cfg.emissiveTextureId !== null) {
            emissiveTexture = this._textures[cfg.emissiveTextureId];
            if (!emissiveTexture) {
                this.error(`Texture not found: ${cfg.emissiveTextureId} - ensure that you create it first with createTexture()`);
                return;
            }
        } else {
            emissiveTexture = this._textures[defaultEmissiveTextureId];
        }
        let occlusionTexture;
        if (cfg.occlusionTextureId !== undefined && cfg.occlusionTextureId !== null) {
            occlusionTexture = this._textures[cfg.occlusionTextureId];
            if (!occlusionTexture) {
                this.error(`Texture not found: ${cfg.occlusionTextureId} - ensure that you create it first with createTexture()`);
                return;
            }
        } else {
            occlusionTexture = this._textures[defaultOcclusionTextureId];
        }
        const textureSet = new VBOSceneModelTextureSet({
            id: textureSetId,
            model: this,
            colorTexture,
            metallicRoughnessTexture,
            normalsTexture,
            emissiveTexture,
            occlusionTexture
        });
        this._textureSets[textureSetId] = textureSet;
    }

    /**
     * Creates a mesh within this VBOSceneModel.
     *
     * A mesh can either define its own geometry or share it with other meshes. To define own geometry, provide the
     * various geometry arrays to this method. To share a geometry, provide the ID of a geometry created earlier
     * with {@link VBOSceneModel#createGeometry}.
     *
     * Internally, VBOSceneModel will batch all unique mesh geometries into the same arrays, which improves
     * rendering performance.
     *
     * If you accompany the arrays with an  ````origin````, then ````createMesh()```` will assume
     * that the ````positions```` are in relative-to-center (RTC) coordinates, with ````origin```` being the origin of their
     * RTC coordinate system.
     *
     * @param {object} cfg Object properties.
     * @param {String} cfg.id Mandatory ID for the new mesh. Must not clash with any existing components within the {@link Scene}.
     * @param {String|Number} [cfg.textureSetId] ID of a texture set previously created with {@link VBOSceneModel#createTextureSet"}.
     * @param {String|Number} [cfg.geometryId] ID of a geometry to instance, previously created with {@link VBOSceneModel#createGeometry"}. Overrides all other geometry parameters given to this method.
     * @param {String} cfg.primitive The primitive type. Accepted values are 'points', 'lines', 'triangles', 'solid' and 'surface'.
     * @param {Number[]} [cfg.positions] Flat array of uncompressed 3D vertex positions positions. Required for all primitive types. Overridden by ````positionsCompressed````.
     * @param {Number[]} [cfg.positionsCompressed] Flat array of quantized 3D vertex positions. Overrides ````positions````, and must be accompanied by ````positionsDecodeMatrix````.
     * @param {Number[]} [cfg.positionsDecodeMatrix] A 4x4 matrix for decompressing ````positionsCompressed````. Must be accompanied by ````positionsCompressed````.
     * @param {Number[]} [cfg.normals] Flat array of normal vectors. Only used with "triangles", "solid" and "surface" primitives. When no normals are given, the geometry will be flat shaded using auto-generated face-aligned normals.
     * @param {Number[]} [cfg.normalsCompressed] Flat array of oct-encoded normal vectors. Overrides ````normals````. Only used with "triangles", "solid" and "surface" primitives. When no normals are given, the geometry will be flat shaded using auto-generated face-aligned normals.
     * @param {Number[]} [cfg.colors] Flat array of uncompressed RGBA vertex colors, as float values in range ````[0..1]````. Ignored when ````geometryId```` is given. Overridden by ````color```` and ````colorsCompressed````.
     * @param {Number[]} [cfg.colorsCompressed] Flat array of compressed RGBA vertex colors, as unsigned short integers in range ````[0..255]````. Ignored when ````geometryId```` is given. Overrides ````colors```` and is overridden by ````color````.
     * @param {Number[]} [cfg.uv] Flat array of uncompressed vertex UV coordinates. Only used with "triangles", "solid" and "surface" primitives. Required for textured rendering.
     * @param {Number[]} [cfg.uvCompressed] Flat array of compressed vertex UV coordinates. Only used with "triangles", "solid" and "surface" primitives. Overrides ````uv````. Must be accompanied by ````uvDecodeMatrix````. Only used with "triangles", "solid" and "surface" primitives. Required for textured rendering.
     * @param {Number[]} [cfg.uvDecodeMatrix] A 3x3 matrix for decompressing ````uvCompressed````.
     * @param {Number[]} [cfg.indices] Array of primitive connectivity indices. Not required for `points` primitives.
     * @param {Number[]} [cfg.edgeIndices] Array of edge line indices. Used only with 'triangles', 'solid' and 'surface' primitives. Automatically generated internally if not supplied, using the optional ````edgeThreshold```` given to the ````VBOSceneModel```` constructor.
     * @param {Number[]} [cfg.origin] Optional geometry origin, relative to {@link VBOSceneModel#origin}. When this is given, then ````positions```` are assumed to be relative to this.
     * @param {Number[]} [cfg.position=[0,0,0]] Local 3D position of the mesh.
     * @param {Number[]} [cfg.scale=[1,1,1]] Scale of the mesh.
     * @param {Number[]} [cfg.rotation=[0,0,0]] Rotation of the mesh as Euler angles given in degrees, for each of the X, Y and Z axis.
     * @param {Number[]} [cfg.matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]] Mesh modelling transform matrix. Overrides the ````position````, ````scale```` and ````rotation```` parameters.
     * @param {Number[]} [cfg.color=[1,1,1]] RGB color in range ````[0..1, 0..1, 0..1]````. Overridden by texture set ````colorTexture````. Overrides ````colors```` and ````colorsCompressed````.
     * @param {Number} [cfg.opacity=1] Opacity in range ````[0..1]````. Overridden by texture set ````colorTexture````.
     * @param {Number} [cfg.metallic=0] Metallic factor in range ````[0..1]````. Overridden by texture set ````metallicRoughnessTexture````.
     * @param {Number} [cfg.roughness=1] Roughness factor in range ````[0..1]````. Overridden by texture set ````metallicRoughnessTexture````.
     */
    createMesh(cfg) {

        let id = cfg.id;
        if (id === undefined || id === null) {
            this.error("Config missing: id");
            return;
        }

        if (this._meshes[id]) {
            this.error(`VBOSceneModel already has a mesh with this ID: ${id}`);
            return;
        }

        const geometryId = cfg.geometryId;
        const sharingGeometry = (cfg.geometryId !== undefined);
        if (sharingGeometry && !this._geometries[cfg.geometryId]) {
            this.error(`Geometry not found: ${cfg.geometryId} - ensure that you create it first with createGeometry()`);
            return;
        }

        const textureSetId = cfg.textureSetId || defaultTextureSetId;
        if (textureSetId) {
            if (!this._textureSets[textureSetId]) {
                this.error(`Texture set not found: ${textureSetId} - ensure that you create it first with createTextureSet()`);
                return;
            }
        }

        let portionId;

        const color = (cfg.color) ? new Uint8Array([Math.floor(cfg.color[0] * 255), Math.floor(cfg.color[1] * 255), Math.floor(cfg.color[2] * 255)]) : [255, 255, 255];
        const opacity = (cfg.opacity !== undefined && cfg.opacity !== null) ? Math.floor(cfg.opacity * 255) : 255;
        const metallic = (cfg.metallic !== undefined && cfg.metallic !== null) ? Math.floor(cfg.metallic * 255) : 0;
        const roughness = (cfg.roughness !== undefined && cfg.roughness !== null) ? Math.floor(cfg.roughness * 255) : 255;

        const mesh = new VBOSceneModelMesh(this, id, color, opacity);

        const pickId = mesh.pickId;

        const a = pickId >> 24 & 0xFF;
        const b = pickId >> 16 & 0xFF;
        const g = pickId >> 8 & 0xFF;
        const r = pickId & 0xFF;

        const pickColor = new Uint8Array([r, g, b, a]); // Quantized pick color

        const aabb = math.collapseAABB3();

        let layer;

        if (sharingGeometry) {

            let meshMatrix;
            let worldMatrix = this._worldMatrixNonIdentity ? this._worldMatrix : null;

            if (cfg.matrix) {
                meshMatrix = cfg.matrix;
            } else {
                const scale = cfg.scale || defaultScale;
                const position = cfg.position || defaultPosition;
                const rotation = cfg.rotation || defaultRotation;
                math.eulerToQuaternion(rotation, "XYZ", defaultQuaternion);
                meshMatrix = math.composeMat4(position, defaultQuaternion, scale, tempMat4);
            }

            const cfgOrigin = cfg.origin || cfg.rtcCenter;
            const origin = (cfgOrigin) ? math.addVec3(this._origin, cfgOrigin, tempVec3a) : this._origin;

            const instancingLayer = this._getInstancingLayer(origin, textureSetId, geometryId);

            layer = instancingLayer;

            portionId = instancingLayer.createPortion({
                color: color,
                metallic: metallic,
                roughness: roughness,
                opacity: opacity,
                meshMatrix: meshMatrix,
                worldMatrix: worldMatrix,
                aabb: aabb,
                pickColor: pickColor
            });

            math.expandAABB3(this._aabb, aabb);

            const numTriangles = Math.round(instancingLayer.numIndices / 3);
            this._numTriangles += numTriangles;
            mesh.numTriangles = numTriangles;

            mesh.origin = origin;

        } else { // Batching

            let primitive = cfg.primitive;
            if (primitive === undefined || primitive === null) {
                primitive = "triangles";
            }
            if (primitive !== "points" && primitive !== "lines" && primitive !== "triangles" && primitive !== "solid" && primitive !== "surface") {
                this.error(`Unsupported value for 'primitive': '${primitive}'  ('geometryId' is absent) - supported values are 'points', 'lines', 'triangles', 'solid' and 'surface'.`);
                return;
            }
            if (!cfg.positions && !cfg.positionsCompressed) {
                this.error("Param expected: 'positions' or 'positionsCompressed'  ('geometryId' is absent)");
                return null;
            }
            if (cfg.positions && cfg.positionsCompressed) {
                this.error("Only one param expected, not both: 'positions' or 'positionsCompressed' ('geometryId' is absent)");
                return null;
            }
            if (cfg.positionsCompressed && !cfg.positionsDecodeMatrix) {
                this.error("Param expected: 'positionsDecodeMatrix' (required for 'positionsCompressed'; 'geometryId' is absent)");
                return null;
            }
            if (cfg.uvCompressed && !cfg.uvDecodeMatrix) {
                this.error("Param expected: `uvDecodeMatrix` (required for `uvCompressed'; 'geometryId' is absent)");
                return null;
            }
            if (!cfg.indices && primitive !== "points") {
                this.error(`Param expected: indices (required for '${primitive}' primitive type)`);
                return null;
            }
            if (!cfg.indices && primitive !== "points") {
                this.error("Config expected: indices (no meshIds provided, so expecting geometry arrays instead)");
                return null;
            }

            let indices = cfg.indices;
            let edgeIndices = cfg.edgeIndices;
            let origin = (cfg.origin || cfg.rtcCenter) ? math.addVec3(this._origin, cfg.origin || cfg.rtcCenter, tempVec3a) : this._origin;
            let positions = cfg.positions;

            if (positions) {
                const rtcCenter = math.vec3();
                const rtcPositions = [];
                const rtcNeeded = worldToRTCPositions(positions, rtcPositions, rtcCenter);
                if (rtcNeeded) {
                    positions = rtcPositions;
                    origin = math.addVec3(origin, rtcCenter, rtcCenter);
                }
            }

            let needNewBatchingLayers = false;

            if (!this._lastOrigin) {
                needNewBatchingLayers = true;
                this._lastOrigin = math.vec3(origin);
            } else {
                if (!math.compareVec3(this._lastOrigin, origin)) {
                    needNewBatchingLayers = true;
                    this._lastOrigin.set(origin);
                }
            }
            if (cfg.positionsDecodeMatrix) {
                if (!this._lastPositionsDecodeMatrix) {
                    needNewBatchingLayers = true;
                    this._lastPositionsDecodeMatrix = math.mat4(cfg.positionsDecodeMatrix);

                } else {
                    if (!math.compareMat4(this._lastPositionsDecodeMatrix, cfg.positionsDecodeMatrix)) {
                        needNewBatchingLayers = true;
                        this._lastPositionsDecodeMatrix.set(cfg.positionsDecodeMatrix)
                    }
                }
            }
            if (cfg.uvDecodeMatrix) {
                if (!this._lastUVDecodeMatrix) {
                    needNewBatchingLayers = true;
                    this._lastUVDecodeMatrix = math.mat4(cfg.uvDecodeMatrix);

                } else {
                    if (!math.compareMat4(this._lastUVDecodeMatrix, cfg.uvDecodeMatrix)) {
                        needNewBatchingLayers = true;
                        this._lastUVDecodeMatrix.set(cfg.uvDecodeMatrix)
                    }
                }
            }
            if (cfg.textureSetId) {
                if (this._lastTextureSetId !== cfg.textureSetId) {
                    needNewBatchingLayers = true;
                    this._lastTextureSetId = cfg.textureSetId;
                }
            }
            if (needNewBatchingLayers) {
                for (let primitiveId in this._currentBatchingLayers) {
                    if (this._currentBatchingLayers.hasOwnProperty(primitiveId)) {
                        this._currentBatchingLayers[primitiveId].finalize();
                    }
                }
                this._currentBatchingLayers = {};
            }

            const normalsProvided = (!!cfg.normals && cfg.normals.length > 0);
            if (primitive === "triangles" || primitive === "solid" || primitive === "surface") {
                if (this._lastNormals !== null && normalsProvided !== this._lastNormals) {
                    for (let primitiveId in this._currentBatchingLayers) {
                        if (this._currentBatchingLayers[primitiveId]) {
                            this._currentBatchingLayers[primitiveId].finalize();
                            delete this._currentBatchingLayers[primitiveId];
                        }
                    }
                }
                this._lastNormals = normalsProvided;
            }

            const worldMatrix = this._worldMatrixNonIdentity ? this._worldMatrix : null;
            let meshMatrix;

            if (!cfg.positionsDecodeMatrix) {
                if (cfg.matrix) {
                    meshMatrix = cfg.matrix;
                } else {
                    const scale = cfg.scale || defaultScale;
                    const position = cfg.position || defaultPosition;
                    const rotation = cfg.rotation || defaultRotation;
                    math.eulerToQuaternion(rotation, "XYZ", defaultQuaternion);
                    meshMatrix = math.composeMat4(position, defaultQuaternion, scale, tempMat4);
                }
            }

            const textureSet = textureSetId ? this._textureSets[textureSetId] : null;

            const primitiveId = `${primitive}-\
${cfg.normals && cfg.normals.length > 0 ? 1 : 0}-${cfg.normalsCompressed && cfg.normalsCompressed.length > 0 ? 1 : 0}-\
${cfg.colors && cfg.colors.length > 0 ? 1 : 0}-${cfg.colorsCompressed && cfg.colorsCompressed.length > 0 ? 1 : 0}-\
${cfg.uv && cfg.uv.length > 0 ? 1 : 0}-${cfg.uvCompressed && cfg.uvCompressed.length > 0 ? 1 : 0}`;

            layer = this._currentBatchingLayers[primitiveId];

            const lenPositions = (positions || cfg.positionsCompressed).length;

            switch (primitive) {
                case "triangles":
                case "solid":
                case "surface":
                    if (layer) {
                        if (!layer.canCreatePortion(lenPositions, indices.length)) {
                            layer.finalize();
                            delete this._currentBatchingLayers[primitiveId];
                            layer = null;
                        }
                    }
                    if (!layer) {
                        layer = new TrianglesBatchingLayer({
                            model: this,
                            textureSet: textureSet,
                            layerIndex: 0, // This is set in #finalize()
                            scratchMemory: this._scratchMemory,
                            positionsDecodeMatrix: cfg.positionsDecodeMatrix,  // Can be undefined
                            uvDecodeMatrix: cfg.uvDecodeMatrix, // Can be undefined
                            origin,
                            maxGeometryBatchSize: this._maxGeometryBatchSize,
                            solid: (primitive === "solid"),
                            autoNormals: (!normalsProvided)
                        });
                        this._layerList.push(layer);
                        this._currentBatchingLayers[primitiveId] = layer;
                    }
                    if (!edgeIndices) {
                        edgeIndices = buildEdgeIndices(positions || cfg.positionsCompressed, indices, null, this._edgeThreshold);
                    }
                    portionId = layer.createPortion({
                        positions: positions,
                        positionsCompressed: cfg.positionsCompressed,
                        normals: cfg.normals,
                        normalsCompressed: cfg.normalsCompressed,
                        colors: cfg.colors,
                        colorsCompressed: cfg.colorsCompressed,
                        uv: cfg.uv,
                        uvCompressed: cfg.uvCompressed,
                        indices: indices,
                        edgeIndices: edgeIndices,
                        color: color,
                        opacity: opacity,
                        metallic: metallic,
                        roughness: roughness,
                        meshMatrix: meshMatrix,
                        worldMatrix: worldMatrix,
                        worldAABB: aabb,
                        pickColor: pickColor
                    });
                    const numTriangles = Math.round(indices.length / 3);
                    this._numTriangles += numTriangles;
                    mesh.numTriangles = numTriangles;
                    break;

                case "lines":
                    if (layer) {
                        if (!layer.canCreatePortion(lenPositions, indices.length)) {
                            layer.finalize();
                            delete this._currentBatchingLayers[primitiveId];
                            layer = null;
                        }
                    }
                    if (!layer) {
                        layer = new LinesBatchingLayer({
                            model: this,
                            layerIndex: 0, // This is set in #finalize()
                            scratchMemory: this._scratchMemory,
                            positionsDecodeMatrix: cfg.positionsDecodeMatrix,  // Can be undefined
                            origin,
                            maxGeometryBatchSize: this._maxGeometryBatchSize
                        });
                        this._layerList.push(layer);
                        this._currentBatchingLayers[primitiveId] = layer;
                    }
                    portionId = layer.createPortion({
                        positions: positions,
                        positionsCompressed: cfg.positionsCompressed,
                        indices: indices,
                        colors: cfg.colors,
                        colorsCompressed: cfg.colorsCompressed,
                        color: color,
                        opacity: opacity,
                        meshMatrix: meshMatrix,
                        worldMatrix: worldMatrix,
                        worldAABB: aabb,
                        pickColor: pickColor
                    });
                    this._numLines += Math.round(indices.length / 2);
                    break;

                case "points":
                    if (layer) {
                        if (!layer.canCreatePortion(lenPositions)) {
                            layer.finalize();
                            delete this._currentBatchingLayers[primitiveId];
                            layer = null;
                        }
                    }
                    if (!layer) {
                        layer = new PointsBatchingLayer({
                            model: this,
                            layerIndex: 0, // This is set in #finalize()
                            scratchMemory: this._scratchMemory,
                            positionsDecodeMatrix: cfg.positionsDecodeMatrix,  // Can be undefined
                            origin,
                            maxGeometryBatchSize: this._maxGeometryBatchSize
                        });
                        this._layerList.push(layer);
                        this._currentBatchingLayers[primitiveId] = layer;
                    }
                    portionId = layer.createPortion({
                        positions: positions,
                        positionsCompressed: cfg.positionsCompressed,
                        colors: cfg.colors,
                        colorsCompressed: cfg.colorsCompressed,
                        color: color,
                        opacity: opacity,
                        meshMatrix: meshMatrix,
                        worldMatrix: worldMatrix,
                        worldAABB: aabb,
                        pickColor: pickColor
                    });
                    this._numPoints += Math.round(lenPositions / 3);
                    break;
            }

            math.expandAABB3(this._aabb, aabb);
            this.numGeometries++;
            mesh.origin = origin;
        }

        mesh.parent = null; // Will be set within PerformanceModelNode constructor
        mesh._layer = layer;
        mesh._portionId = portionId;
        mesh.aabb = aabb;

        this._meshes[id] = mesh;
    }

    _getInstancingLayer(origin, textureSetId, geometryId) {
        const layerId = `${origin[0]}.${origin[1]}.${origin[2]}.${textureSetId}.${geometryId}`;
        let instancingLayer = this._instancingLayers[layerId];
        if (instancingLayer) {
            return instancingLayer;
        }
        let textureSet;
        if (textureSetId !== undefined) {
            textureSet = this._textureSets[textureSetId];
            if (!textureSet) {
                this.error(`TextureSet not found: ${textureSetId} - ensure that you create it first with createTextureSet()`);
                return;
            }
        }
        const geometry = this._geometries[geometryId];
        if (!this._geometries[geometryId]) {
            this.error(`Geometry not found: ${geometryId} - ensure that you create it first with createGeometry()`);
            return;
        }
        switch (geometry.primitive) {
            case "triangles":
                instancingLayer = new TrianglesInstancingLayer({
                    model: this,
                    textureSet,
                    geometry,
                    origin,
                    layerIndex: 0,
                    solid: false
                });
                break;
            case "solid":
                instancingLayer = new TrianglesInstancingLayer({
                    model: this,
                    textureSet,
                    geometry,
                    origin,
                    layerIndex: 0,
                    solid: true
                });
                break;
            case "surface":
                instancingLayer = new TrianglesInstancingLayer({
                    model: this,
                    textureSet,
                    geometry,
                    origin,
                    layerIndex: 0,
                    solid: false
                });
                break;
            case "lines":
                instancingLayer = new LinesInstancingLayer({
                    model: this,
                    textureSet,
                    geometry,
                    origin,
                    layerIndex: 0
                });
                break;
            case "points":
                instancingLayer = new PointsInstancingLayer({
                    model: this,
                    textureSet,
                    geometry,
                    origin,
                    layerIndex: 0
                });
                break;
        }
        this._instancingLayers[layerId] = instancingLayer;
        this._layerList.push(instancingLayer);
        return instancingLayer;
    }

    /**
     * Creates an {@link Entity} within this VBOSceneModel, giving it one or more meshes previously created with {@link VBOSceneModel#createMesh}.
     *
     * A mesh can only belong to one {@link Entity}, so you'll get an error if you try to reuse a mesh among multiple {@link Entity}s.
     *
     * @param {Object} cfg Entity configuration.
     * @param {String} cfg.id Optional ID for the new Entity. Must not clash with any existing components within the {@link Scene}.
     * @param {String[]} cfg.meshIds IDs of one or more meshes created previously with {@link VBOSceneModel@createMesh}.

     * @param {Boolean} [cfg.isObject] Set ````true```` if the {@link Entity} represents an object, in which case it will be registered by {@link Entity#id} in {@link Scene#objects} and can also have a corresponding {@link MetaObject} with matching {@link MetaObject#id}, registered by that ID in {@link MetaScene#metaObjects}.
     * @param {Boolean} [cfg.visible=true] Indicates if the Entity is initially visible.
     * @param {Boolean} [cfg.culled=false] Indicates if the Entity is initially culled from view.
     * @param {Boolean} [cfg.pickable=true] Indicates if the Entity is initially pickable.
     * @param {Boolean} [cfg.clippable=true] Indicates if the Entity is initially clippable.
     * @param {Boolean} [cfg.collidable=true] Indicates if the Entity is initially included in boundary calculations.
     * @param {Boolean} [cfg.castsShadow=true] Indicates if the Entity initially casts shadows.
     * @param {Boolean} [cfg.receivesShadow=true]  Indicates if the Entity initially receives shadows.
     * @param {Boolean} [cfg.xrayed=false] Indicates if the Entity is initially xrayed. XRayed appearance is configured by {@link VBOSceneModel#xrayMaterial}.
     * @param {Boolean} [cfg.highlighted=false] Indicates if the Entity is initially highlighted. Highlighted appearance is configured by {@link VBOSceneModel#highlightMaterial}.
     * @param {Boolean} [cfg.selected=false] Indicates if the Entity is initially selected. Selected appearance is configured by {@link VBOSceneModel#selectedMaterial}.
     * @param {Boolean} [cfg.edges=false] Indicates if the Entity's edges are initially emphasized. Edges appearance is configured by {@link VBOSceneModel#edgeMaterial}.
     * @returns {Entity}
     */
    createEntity(cfg) {
        // Validate or generate Entity ID
        let id = cfg.id;
        if (id === undefined) {
            id = math.createUUID();
        } else if (this.scene.components[id]) {
            this.error("Scene already has a Component with this ID: " + id + " - will assign random ID");
            id = math.createUUID();
        }
        // Collect PerformanceModelNode's PerformanceModelMeshes
        const meshIds = cfg.meshIds;
        if (meshIds === undefined) {
            this.error("Config missing: meshIds");
            return;
        }
        let meshes = [];
        for (let i = 0, len = meshIds.length; i < len; i++) {
            const meshId = meshIds[i];
            const mesh = this._meshes[meshId];
            if (!mesh) {
                this.error("Mesh with this ID not found: " + meshId + " - ignoring this mesh");
                continue;
            }
            if (mesh.parent) {
                this.error("Mesh with ID " + meshId + " already belongs to object with ID " + mesh.parent.id + " - ignoring this mesh");
                continue;
            }
            meshes.push(mesh);
        }
        // Create PerformanceModelNode flags
        let flags = 0;
        if (this._visible && cfg.visible !== false) {
            flags = flags | ENTITY_FLAGS.VISIBLE;
        }
        if (this._pickable && cfg.pickable !== false) {
            flags = flags | ENTITY_FLAGS.PICKABLE;
        }
        if (this._culled && cfg.culled !== false) {
            flags = flags | ENTITY_FLAGS.CULLED;
        }
        if (this._clippable && cfg.clippable !== false) {
            flags = flags | ENTITY_FLAGS.CLIPPABLE;
        }
        if (this._collidable && cfg.collidable !== false) {
            flags = flags | ENTITY_FLAGS.COLLIDABLE;
        }
        if (this._edges && cfg.edges !== false) {
            flags = flags | ENTITY_FLAGS.EDGES;
        }
        if (this._xrayed && cfg.xrayed !== false) {
            flags = flags | ENTITY_FLAGS.XRAYED;
        }
        if (this._highlighted && cfg.highlighted !== false) {
            flags = flags | ENTITY_FLAGS.HIGHLIGHTED;
        }
        if (this._selected && cfg.selected !== false) {
            flags = flags | ENTITY_FLAGS.SELECTED;
        }
        // Create PerformanceModelNode AABB
        let aabb;
        if (meshes.length === 1) {
            aabb = meshes[0].aabb;
        } else {
            aabb = math.collapseAABB3();
            for (let i = 0, len = meshes.length; i < len; i++) {
                math.expandAABB3(aabb, meshes[i].aabb);
            }
        }
        const node = new VBOSceneModelNode(this, cfg.isObject, id, meshes, flags, aabb); // Internally sets PerformanceModelMesh#parent to this PerformanceModelNode
        this._nodeList.push(node);
        this._nodes[id] = node;
        this.numEntities++;
        return node;
    }

    /**
     * Finalizes this VBOSceneModel.
     *
     * Immediately creates the VBOSceneModel's {@link Entity}s within the {@link Scene}.
     *
     * Once finalized, you can't add anything more to this VBOSceneModel.
     */
    finalize() {

        if (this.destroyed) {
            return;
        }

        for (const layerId in this._instancingLayers) {
            if (this._instancingLayers.hasOwnProperty(layerId)) {
                this._instancingLayers[layerId].finalize();
            }
        }

        for (let layerId in this._currentBatchingLayers) {
            if (this._currentBatchingLayers.hasOwnProperty(layerId)) {
                this._currentBatchingLayers[layerId].finalize();
            }
        }
        this._currentBatchingLayers = {};

        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            const node = this._nodeList[i];
            node._finalize();
        }

        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            const node = this._nodeList[i];
            node._finalize2();
        }

        // Sort layers to reduce WebGL shader switching when rendering them

        this._layerList.sort((a, b) => {
            if (a.sortId < b.sortId) {
                return -1;
            }
            if (a.sortId > b.sortId) {
                return 1;
            }
            return 0;
        });

        for (let i = 0, len = this._layerList.length; i < len; i++) {
            const layer = this._layerList[i];
            layer.layerIndex = i;
        }

        this.glRedraw();

        this.scene._aabbDirty = true;
    }

    _rebuildAABB() {
        math.collapseAABB3(this._aabb);
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            const node = this._nodeList[i];
            math.expandAABB3(this._aabb, node.aabb);
        }
        this._aabbDirty = false;
    }

    /** @private */
    stateSortCompare(drawable1, drawable2) {
    }

    /** @private */
    rebuildRenderFlags() {
        this.renderFlags.reset();
        this._updateRenderFlagsVisibleLayers();
        if (this.renderFlags.numLayers > 0 && this.renderFlags.numVisibleLayers === 0) {
            this.renderFlags.culled = true;
            return;
        }
        this._updateRenderFlags();
    }

    /**
     * @private
     */
    _updateRenderFlagsVisibleLayers() {
        const renderFlags = this.renderFlags;
        renderFlags.numLayers = this._layerList.length;
        renderFlags.numVisibleLayers = 0;
        for (let layerIndex = 0, len = this._layerList.length; layerIndex < len; layerIndex++) {
            renderFlags.visibleLayers[renderFlags.numVisibleLayers++] = layerIndex;
        }
    }

    /** @private */
    _updateRenderFlags() {

        if (this.numVisibleLayerPortions === 0) {
            return;
        }

        if (this.numCulledLayerPortions === this.numPortions) {
            return;
        }

        const renderFlags = this.renderFlags;

        renderFlags.colorOpaque = (this.numTransparentLayerPortions < this.numPortions);

        if (this.numTransparentLayerPortions > 0) {
            renderFlags.colorTransparent = true;
        }

        if (this.numXRayedLayerPortions > 0) {
            const xrayMaterial = this.scene.xrayMaterial._state;
            if (xrayMaterial.fill) {
                if (xrayMaterial.fillAlpha < 1.0) {
                    renderFlags.xrayedSilhouetteTransparent = true;
                } else {
                    renderFlags.xrayedSilhouetteOpaque = true;
                }
            }
            if (xrayMaterial.edges) {
                if (xrayMaterial.edgeAlpha < 1.0) {
                    renderFlags.xrayedEdgesTransparent = true;
                } else {
                    renderFlags.xrayedEdgesOpaque = true;
                }
            }
        }

        if (this.numEdgesLayerPortions > 0) {
            const edgeMaterial = this.scene.edgeMaterial._state;
            if (edgeMaterial.edges) {
                renderFlags.edgesOpaque = (this.numTransparentLayerPortions < this.numPortions);
                if (this.numTransparentLayerPortions > 0) {
                    renderFlags.edgesTransparent = true;
                }
            }
        }

        if (this.numSelectedLayerPortions > 0) {
            const selectedMaterial = this.scene.selectedMaterial._state;
            if (selectedMaterial.fill) {
                if (selectedMaterial.fillAlpha < 1.0) {
                    renderFlags.selectedSilhouetteTransparent = true;
                } else {
                    renderFlags.selectedSilhouetteOpaque = true;
                }
            }
            if (selectedMaterial.edges) {
                if (selectedMaterial.edgeAlpha < 1.0) {
                    renderFlags.selectedEdgesTransparent = true;
                } else {
                    renderFlags.selectedEdgesOpaque = true;
                }
            }
        }

        if (this.numHighlightedLayerPortions > 0) {
            const highlightMaterial = this.scene.highlightMaterial._state;
            if (highlightMaterial.fill) {
                if (highlightMaterial.fillAlpha < 1.0) {
                    renderFlags.highlightedSilhouetteTransparent = true;
                } else {
                    renderFlags.highlightedSilhouetteOpaque = true;
                }
            }
            if (highlightMaterial.edges) {
                if (highlightMaterial.edgeAlpha < 1.0) {
                    renderFlags.highlightedEdgesTransparent = true;
                } else {
                    renderFlags.highlightedEdgesOpaque = true;
                }
            }
        }
    }

    // -------------- RENDERING ---------------------------------------------------------------------------------------

    /** @private */
    drawColorOpaque(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawColorOpaque(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawColorTransparent(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawColorTransparent(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawSilhouetteXRayed(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawSilhouetteXRayed(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawSilhouetteHighlighted(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawSilhouetteHighlighted(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawSilhouetteSelected(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawSilhouetteSelected(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawEdgesColorOpaque(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawEdgesColorOpaque(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawEdgesColorTransparent(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawEdgesColorTransparent(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawEdgesXRayed(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawEdgesXRayed(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawEdgesHighlighted(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawEdgesHighlighted(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawEdgesSelected(frameCtx) {
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawEdgesSelected(renderFlags, frameCtx);
        }
    }

    /**
     * @private
     */
    drawOcclusion(frameCtx) {
        if (this.numVisibleLayerPortions === 0) {
            return;
        }
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawOcclusion(renderFlags, frameCtx);
        }
    }

    /**
     * @private
     */
    drawShadow(frameCtx) {
        if (this.numVisibleLayerPortions === 0) {
            return;
        }
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawShadow(renderFlags, frameCtx);
        }
    }

    /** @private */
    drawPickMesh(frameCtx) {
        if (this.numVisibleLayerPortions === 0) {
            return;
        }
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawPickMesh(renderFlags, frameCtx);
        }
    }

    /**
     * Called by VBOSceneModelMesh.drawPickDepths()
     * @private
     */
    drawPickDepths(frameCtx) {
        if (this.numVisibleLayerPortions === 0) {
            return;
        }
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawPickDepths(renderFlags, frameCtx);
        }
    }

    /**
     * Called by VBOSceneModelMesh.drawPickNormals()
     * @private
     */
    drawPickNormals(frameCtx) {
        if (this.numVisibleLayerPortions === 0) {
            return;
        }
        const renderFlags = this.renderFlags;
        for (let i = 0, len = renderFlags.visibleLayers.length; i < len; i++) {
            const layerIndex = renderFlags.visibleLayers[i];
            this._layerList[layerIndex].drawPickNormals(renderFlags, frameCtx);
        }
    }

    //------------------------------------------------------------------------------------------------------------------
    // Component members
    //------------------------------------------------------------------------------------------------------------------

    /**
     * Destroys this VBOSceneModel.
     */
    destroy() {
        for (let layerId in this._currentBatchingLayers) {
            if (this._currentBatchingLayers.hasOwnProperty(layerId)) {
                this._currentBatchingLayers[layerId].destroy();
            }
        }
        this._currentBatchingLayers = {};
        this.scene.camera.off(this._onCameraViewMatrix);
        for (let i = 0, len = this._layerList.length; i < len; i++) {
            this._layerList[i].destroy();
        }
        for (let i = 0, len = this._nodeList.length; i < len; i++) {
            this._nodeList[i]._destroy();
        }
        Object.entries(this._geometries).forEach(([key, geometry]) => {
            geometry.destroy();
        });
        this._geometries = {};
        this._textures = {};
        this._textureSets = {};
        this._meshes = {};
        this._nodes = {};
        this.scene._aabbDirty = true;
        if (this._isModel) {
            this.scene._deregisterModel(this);
        }
        putScratchMemory();
        super.destroy();
    }
}

export {
    VBOSceneModel
}