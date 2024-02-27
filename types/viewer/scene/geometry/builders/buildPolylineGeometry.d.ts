import { Geometry } from "../Geometry";

export declare type buildPolylineGeometryConfiguration = {
    /* Optional ID for the {@link Geometry}, unique among all components in the parent {@link Scene}, generated automatically when omitted. */
    id?: string;
    /* 3D points indicating vertices position. */
    points?: number[];
};

/**
 * @desc Creates a 3D polyline {@link Geometry}.
 *
 * @param {buildBoxLinesGeometryConfiguration} [cfg] Configs
 * @returns {Object} Configuration for a {@link Geometry} subtype.
 */
export function buildPolylineGeometry(cfg: buildPolylineGeometryConfiguration): Geometry;