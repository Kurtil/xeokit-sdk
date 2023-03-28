/**
 * Instantiated by Model#createTextureSet
 *
 * @private
 */
export class VBOSceneModelTextureSet {

    /**
     * @param {*} cfg VBOSceneModelTextureSet properties.
     * @param {String|Number} cfg.id Mandatory ID for the texture set, to refer to with {@link VBOSceneModel#createMesh}.
     * @param {VBOSceneModel} cfg.model VBOSceneModel that owns this texture set.
     * @param {VBOSceneModelTexture} [cfg.colorTexture] RGBA texture with base color in RGB and opacity in A.
     */
    constructor(cfg) {

        /**
         * ID of this VBOSceneModelTextureSet, unique within the VBOSceneModel.
         *
         * @property id
         * @type {String}
         * @final
         */
        this.id = cfg.id;

        /**
         * RGBA texture containing base color in RGB and opacity in A.
         *
         * @property colorTexture
         * @type {VBOSceneModelTexture}
         * @final
         */
        this.colorTexture = cfg.colorTexture;
    }

    /**
     * @private
     */
    destroy() {
    }
}
