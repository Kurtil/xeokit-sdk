import {Scene} from "./scene/scene/Scene.js";
import {CameraFlightAnimation} from "./scene/camera/CameraFlightAnimation.js";
import {CameraControl} from "./scene/CameraControl/CameraControl.js";
import {MetaScene} from "./metadata/MetaScene.js";

/**
 * The 3D Viewer at the heart of the xeokit SDK.
 *
 * * A Viewer wraps a single {@link Scene}
 * * Add {@link Plugin}s to a Viewer to extend its functionality.
 * * {@link Viewer#metaScene} holds metadata about models in the
 * Viewer's {@link MetaScene}.
 * * Use {@link Viewer#cameraFlight} to fly or jump the {@link Scene}'s
 * {@link Camera} to target positions, boundaries or {@link Entity}s.
 *
 * @public
 */
class Viewer {

    /**
     * @constructor
     * @param {Object} cfg Viewer configuration.
     * @param {String} [cfg.id] Optional ID for this Viewer, defaults to the ID of {@link Viewer#scene}, which xeokit automatically generates.
     * @param {String} [cfg.canvasId]  ID of an existing HTML canvas for the {@link Viewer#scene} - either this or canvasElement is mandatory. When both values are given, the element reference is always preferred to the ID.
     * @param {HTMLCanvasElement} [cfg.canvasElement] Reference of an existing HTML canvas for the {@link Viewer#scene} - either this or canvasId is mandatory. When both values are given, the element reference is always preferred to the ID.
     * @param {HTMLElement} [cfg.keyboardEventsElement] Optional reference to HTML element on which key events should be handled. Defaults to the HTML Document.
     * @param {String} [cfg.spinnerElementId]  ID of existing HTML element to show the {@link Spinner} - internally creates a default element automatically if this is omitted.
     * @param {Number} [cfg.passes=1] The number of times the {@link Viewer#scene} renders per frame.
     * @param {Boolean} [cfg.clearEachPass=false] When doing multiple passes per frame, specifies if to clear the canvas before each pass (true) or just before the first pass (false).
     * @param {Boolean} [cfg.preserveDrawingBuffer=true]  Whether or not to preserve the WebGL drawing buffer. This needs to be ````true```` for {@link Viewer#getSnapshot} to work.
     * @param {Boolean} [cfg.transparent=true]  Whether or not the canvas is transparent.
     * @param {Boolean} [cfg.premultipliedAlpha=false]  Whether or not you want alpha composition with premultiplied alpha. Highlighting and selection works best when this is ````false````.
     * @param {Boolean} [cfg.gammaInput=true]  When true, expects that all textures and colors are premultiplied gamma.
     * @param {Boolean} [cfg.gammaOutput=false]  Whether or not to render with pre-multiplied gama.
     * @param {Number} [cfg.gammaFactor=2.2] The gamma factor to use when rendering with pre-multiplied gamma.
     * @param {Number[]} [cfg.backgroundColor=[1,1,1]] Sets the canvas background color to use when ````transparent```` is false.
     * @param {Boolean} [cfg.backgroundColorFromAmbientLight=true] When ````transparent```` is false, set this ````true````
     * to derive the canvas background color from {@link AmbientLight#color}, or ````false```` to set the canvas background to ````backgroundColor````.
     * @param {String} [cfg.units="meters"] The measurement unit type. Accepted values are ````"meters"````, ````"metres"````, , ````"centimeters"````, ````"centimetres"````, ````"millimeters"````,  ````"millimetres"````, ````"yards"````, ````"feet"```` and ````"inches"````.
     * @param {Number} [cfg.scale=1] The number of Real-space units in each World-space coordinate system unit.
     * @param {Number[]} [cfg.origin=[0,0,0]] The Real-space 3D origin, in current measurement units, at which the World-space coordinate origin ````[0,0,0]```` sits.
     * @param {Boolean} [cfg.antialias=true] Whether to enable anti-aliasing.
     * @throws {String} Throws an exception when both canvasId or canvasElement are missing or they aren't pointing to a valid HTMLCanvasElement.
     * @param {Boolean} [cfg.alphaDepthMask=true] Whether writing into the depth buffer is enabled or disabled when rendering transparent objects.
     * @param {Boolean} [cfg.entityOffsetsEnabled=false] Whether to enable {@link Entity#offset}. For best performance, only set this ````true```` when you need to use {@link Entity#offset}.
     * @param {Boolean} [cfg.pickSurfacePrecisionEnabled=false] Whether to enable full-precision accuracy when surface picking with {@link Scene#pick}. Note that when ````true````, this configuration will increase the amount of browser memory used by the Viewer. The ````pickSurfacePrecision```` option for ````Scene#pick```` only works if this is set ````true````.
     * @param {Boolean} [cfg.logarithmicDepthBufferEnabled=false] Whether to enable logarithmic depth buffer. When this is true,
     * you can set huge values for {@link Perspective#far} and {@link Ortho#far}, to push the far clipping plane back so
     * that it does not clip huge models.
     * @param {Boolean} [cfg.colorTextureEnabled=true] Whether to enable base color texture rendering.
     * @param {Boolean} [cfg.pbrEnabled=false] Whether to enable physically-based rendering.
     */
    constructor(cfg) {
        /**
         * The Viewer's {@link Scene}.
         * @property scene
         * @type {Scene}
         */
        this.scene = new Scene(this, {
            canvasId: cfg.canvasId,
            canvasElement: cfg.canvasElement,
            keyboardEventsElement: cfg.keyboardEventsElement,
            contextAttr: {
                preserveDrawingBuffer: cfg.preserveDrawingBuffer !== false,
                premultipliedAlpha: (!!cfg.premultipliedAlpha),
                antialias: (cfg.antialias !== false)
            },
            spinnerElementId: cfg.spinnerElementId,
            transparent: (cfg.transparent !== false),
            gammaInput: true,
            gammaOutput: false,
            backgroundColor: cfg.backgroundColor,
            backgroundColorFromAmbientLight: cfg.backgroundColorFromAmbientLight,
            ticksPerRender: 1,
            ticksPerOcclusionTest: 20,
            units: cfg.units,
            scale: cfg.scale,
            origin: cfg.origin,
            alphaDepthMask: (cfg.alphaDepthMask !== false),
            entityOffsetsEnabled: (!!cfg.entityOffsetsEnabled),
            pickSurfacePrecisionEnabled: (!!cfg.pickSurfacePrecisionEnabled),
            logarithmicDepthBufferEnabled: (!!cfg.logarithmicDepthBufferEnabled),
            pbrEnabled: (!!cfg.pbrEnabled),
            colorTextureEnabled: (cfg.colorTextureEnabled !== false)
        });

        /**
         * Metadata about the {@link Scene} and the models and objects within it.
         * @property metaScene
         * @type {MetaScene}
         * @readonly
         */
        this.metaScene = new MetaScene(this, this.scene);

        /**
         * The Viewer's ID.
         * @property id
         *
         * @type {String|Number}
         */
        this.id = cfg.id || this.scene.id;

        /**
         * The Viewer's {@link Camera}. This is also found on {@link Scene#camera}.
         * @property camera
         * @type {Camera}
         */
        this.camera = this.scene.camera;

        /**
         * The Viewer's {@link CameraFlightAnimation}, which
         * is used to fly the {@link Scene}'s {@link Camera} to given targets.
         * @property cameraFlight
         * @type {CameraFlightAnimation}
         */
        this.cameraFlight = new CameraFlightAnimation(this.scene, {
            duration: 0.5
        });

        /**
         * The Viewer's {@link CameraControl}, which
         * controls the {@link Scene}'s {@link Camera} with mouse,  touch and keyboard input.
         * @property cameraControl
         * @type {CameraControl}
         */
        this.cameraControl = new CameraControl(this.scene, {
            // panToPointer: true,
            doublePickFlyTo: true
        });

        this._plugins = [];

        /**
         * Subscriptions to events sent with {@link fire}.
         * @private
         */
        this._eventSubs = {};
    }

    /**
     * Returns the capabilities of this Viewer.
     *
     * @returns {{astcSupported: boolean, etc1Supported: boolean, pvrtcSupported: boolean, etc2Supported: boolean, dxtSupported: boolean, bptcSupported: boolean}}
     */
    get capabilities() {
        return this.scene.capabilities;
    }

    /**
     * Subscribes to an event fired at this Viewer.
     *
     * @param {String} event The event
     * @param {Function} callback Callback fired on the event
     */
    on(event, callback) {
        let subs = this._eventSubs[event];
        if (!subs) {
            subs = [];
            this._eventSubs[event] = subs;
        }
        subs.push(callback);
    }

    /**
     * Fires an event at this Viewer.
     *
     * @param {String} event Event name
     * @param {Object} value Event parameters
     */
    fire(event, value) {
        const subs = this._eventSubs[event];
        if (subs) {
            for (let i = 0, len = subs.length; i < len; i++) {
                subs[i](value);
            }
        }
    }

    /**
     * Unsubscribes from an event fired at this Viewer.
     * @param event
     */
    off(event) { // TODO

    }

    /**
     * Logs a message to the JavaScript developer console, prefixed with the ID of this Viewer.
     *
     * @param {String} msg The message
     */
    log(msg) {
        console.log(`[xeokit viewer ${this.id}]: ${msg}`);
    }

    /**
     * Logs an error message to the JavaScript developer console, prefixed with the ID of this Viewer.
     *
     * @param {String} msg The error message
     */
    error(msg) {
        console.error(`[xeokit viewer ${this.id}]: ${msg}`);
    }

    /**
     * Installs a Plugin.
     *
     * @private
     */
    addPlugin(plugin) {
        this._plugins.push(plugin);
    }

    /**
     * Uninstalls a Plugin, clearing content from it first.
     *
     * @private
     */
    removePlugin(plugin) {
        for (let i = 0, len = this._plugins.length; i < len; i++) {
            const p = this._plugins[i];
            if (p === plugin) {
                if (p.clear) {
                    p.clear();
                }
                this._plugins.splice(i, 1);
                return;
            }
        }
    }

    /**
     * Sends a message to installed Plugins.
     *
     * The message can optionally be accompanied by a value.
     * @private
     */
    sendToPlugins(name, value) {
        for (let i = 0, len = this._plugins.length; i < len; i++) {
            const p = this._plugins[i];
            if (p.send) {
                p.send(name, value);
            }
        }
    }

    /**
     * @private
     * @deprecated
     */
    clear() {
        throw "Viewer#clear() no longer implemented - use '#sendToPlugins(\"clear\") instead";
    }

    /**
     * @private
     * @deprecated
     */
    resetView() {
        throw "Viewer#resetView() no longer implemented - use CameraMemento & ObjectsMemento classes instead";
    }

    /** Destroys this Viewer.
     */
    destroy() {
        const plugins = this._plugins.slice(); // Array will modify as we delete plugins
        for (let i = 0, len = plugins.length; i < len; i++) {
            const plugin = plugins[i];
            plugin.destroy();
        }
        this.scene.destroy();
    }
}

export {Viewer}
