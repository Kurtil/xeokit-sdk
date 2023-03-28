import { Program } from "../../../../../../webgl/Program.js";
import { createRTCViewMat } from "../../../../../../math/rtcCoords.js";

/**
 * @private
 */
class TrianglesBatchingColorRenderer {
  constructor(scene) {
    this._scene = scene;
    this._hash = this._getHash();
    this._allocate();
  }

  getValid() {
    return this._hash === this._getHash();
  }

  _getHash() {
    const scene = this._scene;
    return scene._lightsState.getHash();
  }

  drawLayer(frameCtx, batchingLayer, renderPass) {
    const scene = this._scene;
    const camera = scene.camera;
    const model = batchingLayer.model;
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
      this._bindProgram(frameCtx);
    }

    gl.uniform1i(this._uRenderPass, renderPass);

    gl.uniformMatrix4fv(
      this._uViewMatrix,
      false,
      origin ? createRTCViewMat(camera.viewMatrix, origin) : camera.viewMatrix
    );
    gl.uniformMatrix4fv(
      this._uViewNormalMatrix,
      false,
      camera.viewNormalMatrix
    );

    gl.uniformMatrix4fv(this._uWorldMatrix, false, model.worldMatrix);
    gl.uniformMatrix4fv(
      this._uWorldNormalMatrix,
      false,
      model.worldNormalMatrix
    );

    gl.uniformMatrix4fv(
      this._uPositionsDecodeMatrix,
      false,
      batchingLayer._state.positionsDecodeMatrix
    );

    this._aPosition.bindArrayBuffer(state.positionsBuf);

    if (this._aNormal) {
      this._aNormal.bindArrayBuffer(state.normalsBuf);
    }

    if (this._aColor) {
      this._aColor.bindArrayBuffer(state.colorsBuf);
    }

    if (this._aFlags) {
      this._aFlags.bindArrayBuffer(state.flagsBuf);
    }

    if (this._aFlags2) {
      this._aFlags2.bindArrayBuffer(state.flags2Buf);
    }

    state.indicesBuf.bind();

    gl.drawElements(
      gl.TRIANGLES,
      state.indicesBuf.numItems,
      state.indicesBuf.itemType,
      0
    );

    frameCtx.drawElements++;
  }

  _allocate() {
    const scene = this._scene;
    const gl = scene.canvas.gl;
    const lightsState = scene._lightsState;

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

    this._uLightAmbient = program.getLocation("lightAmbient");
    this._uLightColor = [];
    this._uLightDir = [];
    this._uLightPos = [];
    this._uLightAttenuation = [];

    const lights = lightsState.lights;
    let light;

    for (let i = 0, len = lights.length; i < len; i++) {
      light = lights[i];
      switch (light.type) {
        case "dir":
          this._uLightColor[i] = program.getLocation("lightColor" + i);
          this._uLightPos[i] = null;
          this._uLightDir[i] = program.getLocation("lightDir" + i);
          break;
        case "point":
          this._uLightColor[i] = program.getLocation("lightColor" + i);
          this._uLightPos[i] = program.getLocation("lightPos" + i);
          this._uLightDir[i] = null;
          this._uLightAttenuation[i] = program.getLocation(
            "lightAttenuation" + i
          );
          break;
        case "spot":
          this._uLightColor[i] = program.getLocation("lightColor" + i);
          this._uLightPos[i] = program.getLocation("lightPos" + i);
          this._uLightDir[i] = program.getLocation("lightDir" + i);
          this._uLightAttenuation[i] = program.getLocation(
            "lightAttenuation" + i
          );
          break;
      }
    }

    this._aPosition = program.getAttribute("position");
    this._aNormal = program.getAttribute("normal");
    this._aColor = program.getAttribute("color");
    this._aFlags = program.getAttribute("flags");
    this._aFlags2 = program.getAttribute("flags2");
  }

  _bindProgram() {
    const scene = this._scene;
    const gl = scene.canvas.gl;
    const program = this._program;
    const lights = scene._lightsState.lights;
    const project = scene.camera.project;

    program.bind();

    gl.uniformMatrix4fv(this._uProjMatrix, false, project.matrix);

    if (this._uLightAmbient) {
      gl.uniform4fv(
        this._uLightAmbient,
        scene._lightsState.getAmbientColorAndIntensity()
      );
    }

    for (let i = 0, len = lights.length; i < len; i++) {
      const light = lights[i];

      if (this._uLightColor[i]) {
        gl.uniform4f(
          this._uLightColor[i],
          light.color[0],
          light.color[1],
          light.color[2],
          light.intensity
        );
      }
      if (this._uLightPos[i]) {
        gl.uniform3fv(this._uLightPos[i], light.pos);
        if (this._uLightAttenuation[i]) {
          gl.uniform1f(this._uLightAttenuation[i], light.attenuation);
        }
      }
      if (this._uLightDir[i]) {
        gl.uniform3fv(this._uLightDir[i], light.dir);
      }
    }
  }

  _buildShader() {
    return {
      vertex: this._buildVertexShader(),
      fragment: this._buildFragmentShader(),
    };
  }

  _buildVertexShader() {
    const scene = this._scene;
    const lightsState = scene._lightsState;
    let light;
    const src = [];

    // Triangles batching draw vertex shader
    src.push(`\
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
            uniform vec4 lightAmbient;
        `);

    for (let i = 0, len = lightsState.lights.length; i < len; i++) {
      light = lightsState.lights[i];
      if (light.type === "ambient") {
        continue;
      }
      src.push("uniform vec4 lightColor" + i + ";");
      if (light.type === "dir") {
        src.push("uniform vec3 lightDir" + i + ";");
      }
      if (light.type === "point") {
        src.push("uniform vec3 lightPos" + i + ";");
      }
      if (light.type === "spot") {
        src.push("uniform vec3 lightPos" + i + ";");
        src.push("uniform vec3 lightDir" + i + ";");
      }
    }

    // flags.x = NOT_RENDERED | COLOR_OPAQUE | COLOR_TRANSPARENT
    // renderPass = COLOR_OPAQUE

    src.push(`
    vec3 octDecode(vec2 oct) {
        vec3 v = vec3(oct.xy, 1.0 - abs(oct.x) - abs(oct.y));
        if (v.z < 0.0) {
            v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
        }
        return normalize(v);
    }

    out vec4 vColor;

    void main(void) {
        if (int(flags.x) != renderPass) {
        gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
        } else {
        vec4 worldPosition = worldMatrix * (positionsDecodeMatrix * vec4(position, 1.0)); 
        vec4 viewPosition  = viewMatrix * worldPosition; 
        vec4 worldNormal =  worldNormalMatrix * vec4(octDecode(normal.xy), 0.0); 
        vec3 viewNormal = normalize((viewNormalMatrix * worldNormal).xyz);
        vec3 reflectedColor = vec3(0.0, 0.0, 0.0);
        vec3 viewLightDir = vec3(0.0, 0.0, -1.0);
        float lambertian = 1.0;
    `);

    for (let i = 0, len = lightsState.lights.length; i < len; i++) {
      light = lightsState.lights[i];
      if (light.type === "ambient") {
        continue;
      }
      if (light.type === "dir") {
        if (light.space === "view") {
          src.push("viewLightDir = normalize(lightDir" + i + ");");
        } else {
          src.push(
            "viewLightDir = normalize((viewMatrix * vec4(lightDir" +
              i +
              ", 0.0)).xyz);"
          );
        }
      } else if (light.type === "point") {
        if (light.space === "view") {
          src.push(
            "viewLightDir = -normalize(lightPos" + i + " - viewPosition.xyz);"
          );
        } else {
          src.push(
            "viewLightDir = -normalize((viewMatrix * vec4(lightPos" +
              i +
              ", 0.0)).xyz);"
          );
        }
      } else if (light.type === "spot") {
        if (light.space === "view") {
          src.push("viewLightDir = normalize(lightDir" + i + ");");
        } else {
          src.push(
            "viewLightDir = normalize((viewMatrix * vec4(lightDir" +
              i +
              ", 0.0)).xyz);"
          );
        }
      } else {
        continue;
      }
      src.push("lambertian = max(dot(-viewNormal, viewLightDir), 0.0);");
      src.push(
        "reflectedColor += lambertian * (lightColor" +
          i +
          ".rgb * lightColor" +
          i +
          ".a);"
      );
    }

    src.push(`\
            vec3 rgb = (vec3(float(color.r) / 255.0, float(color.g) / 255.0, float(color.b) / 255.0));
            vColor =  vec4((lightAmbient.rgb * lightAmbient.a * rgb) + (reflectedColor * rgb), float(color.a) / 255.0);
            vec4 clipPos = projMatrix * viewPosition;
            gl_Position = clipPos;
        }
    }
    `);

    return src;
  }

  _buildFragmentShader() {
    // Triangles batching draw fragment shader
    const src = [
      `\
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
        }`,
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

export { TrianglesBatchingColorRenderer };
