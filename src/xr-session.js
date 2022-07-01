import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { BufferGeometryUtils } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Vector3 } from "three";

let axis;
let isAxis = false;

let container, labelContainer;
let camera, scene, renderer, light;
let controller;

let hitTestSource = null;
let hitTestSourceRequested = false;

let measurements = [];
let labels = [];
let axisLegendLabel = [];

let reticle;
let lines = [];
let currentLine = null;

let axisXLine = null;
// let axisYLine = null;
let axisZLine = null;

let distances = [];

let width, height;

let model3D;
let models = [];
let pivot;

let curReticlePoint = null;

function toScreenPosition(point, camera) {
  var vector = new THREE.Vector3();

  vector.copy(point);
  vector.project(camera);

  vector.x = ((vector.x + 1) * width) / 2;
  vector.y = ((-vector.y + 1) * height) / 2;
  vector.z = 0;

  return vector;
}

function getCenterPoint(points) {
  let line = new THREE.Line3(...points);
  return line.getCenter();
}

function matrixToVector(matrix) {
  let vector = new THREE.Vector3();
  vector.setFromMatrixPosition(matrix);
  return vector;
}

function initLine(point) {
  let lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 5,
    linecap: "round",
  });

  let lineGeometry = new THREE.BufferGeometry().setFromPoints([point, point]);

  return new THREE.Line(lineGeometry, lineMaterial);
}

function initAxisLine(point, type) {
  const color = type === "x" ? "red" : type === "y" ? "green" : "blue";
  let lineMaterial = new THREE.LineBasicMaterial({
    color,
    linewidth: 5,
    linecap: "round",
  });

  const origin = matrixToVector(reticle.matrix);
  const uVector =
    type === "x"
      ? new Vector3(origin.x + 1, origin.y, origin.z)
      : type === "y"
      ? origin
      : new Vector3(origin.x, origin.y, origin.z + 1);
  let lineGeometry = new THREE.BufferGeometry().setFromPoints([
    // new Vector3(0, 0, 0),
    origin,
    uVector,
  ]);
  return new THREE.Line(lineGeometry, lineMaterial);
}

function initAxisLabel() {
  const { x, y, z, ux, uy, uz } = curReticlePoint;
  const zeroVector = new Vector3(x, y, z);
  const xUnitVector = new Vector3(ux, y, z);
  const yUnitVector = new Vector3(x, uy, z);
  const zUnitVector = new Vector3(x, y, uz);

  let xText = document.createElement("div");
  let yText = document.createElement("div");
  let zText = document.createElement("div");
  xText.className = "label";
  xText.style.color = "red";
  xText.textContent = "X axis";
  document.querySelector("#container").appendChild(xText);

  axisLegendLabel.push({
    div: xText,
    point: getCenterPoint([zeroVector, xUnitVector]),
  });

  // yText.className = "label";
  // yText.style.color = "green";
  // yText.textContent = "Y axis";
  // document.querySelector("#container").appendChild(yText);

  // axisLegendLabel.push({
  //   div: yText,
  //   point: getCenterPoint([zeroVector, yUnitVector]),
  // });

  zText.className = "label";
  zText.style.color = "blue";
  zText.textContent = "Z axis";

  document.querySelector("#container").appendChild(zText);

  axisLegendLabel.push({
    div: zText,
    point: getCenterPoint([zeroVector, zUnitVector]),
  });
}

function updateLine(matrix) {
  let positions = currentLine.geometry.attributes.position.array;
  positions[3] = matrix.elements[12]; // x?
  positions[4] = matrix.elements[13]; // y?
  positions[5] = matrix.elements[14]; // z ?
  currentLine.geometry.attributes.position.needsUpdate = true;
  currentLine.geometry.computeBoundingSphere();
}

function drawAxis() {
  if (!axisXLine && !axisZLine) {
    const zeroVector = new Vector3(0, 0, 0);
    const ux = new Vector3(1, 0, 0);
    // const yUnitVector = new Vector3(0, 1, 0);
    const uz = new Vector3(0, 0, 1);

    axisXLine = initAxisLine(ux, "x");
    // axisYLine = initAxisLine(yUnitVector, "y");
    axisZLine = initAxisLine(uz, "z");
    scene.add(axisXLine);
    // scene.add(axisYLine);
    scene.add(axisZLine);
  }
}

function initReticle() {
  let ring = new THREE.RingBufferGeometry(0.045, 0.05, 32).rotateX(
    -Math.PI / 2
  );
  let dot = new THREE.CircleBufferGeometry(0.005, 32).rotateX(-Math.PI / 2);
  reticle = new THREE.Mesh(
    BufferGeometryUtils.mergeBufferGeometries([ring, dot]),
    new THREE.MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
}

function initLabelContainer() {
  labelContainer = document.createElement("div");
  labelContainer.style.position = "absolute";
  labelContainer.style.top = "0px";
  labelContainer.style.pointerEvents = "none";
  labelContainer.setAttribute("id", "container");
}

function initCamera() {
  camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 20);
}

function initLight() {
  light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 5);
  light.position.set(0.5, 1, 0.25);
}

function initScene() {
  scene = new THREE.Scene();
}

function getDistance(points) {
  if (points.length <= 1) return 0;
  if (points.length == 2) return points[0].distanceTo(points[1]);
  if (points.length == 3) return points[1].distanceTo(points[2]);
}

function init3DLoader() {
  const loader = new GLTFLoader();

  loader.load(
    // "src/models/wood-table-3d-model/wood_table_001_4k.gltf",
    // "src/models/nonTextureTile/nonTextureTile.gltf",
    "src/models/woodTile/woodTile.gltf",
    function (gltf) {
      model3D = gltf.scene;
      model3D.position.set(0, 0, 0);
      model3D.scale.set(1, 1, 1);
      // scene.add(gltf.scene);
      // scene.add(model3D);
    },
    undefined,
    function (error) {
      console.error(error);
    }
  );
}

function initXR() {
  container = document.createElement("div");
  document.body.appendChild(container);

  width = window.innerWidth;
  height = window.innerHeight;

  initScene();

  initCamera();

  initLight();
  scene.add(light);

  initRenderer();
  container.appendChild(renderer.domElement);

  initLabelContainer();
  container.appendChild(labelContainer);

  document.body.appendChild(
    ARButton.createButton(renderer, {
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.querySelector("#container") },
      requiredFeatures: ["hit-test"],
    })
  );

  controller = renderer.xr.getController(0);
  controller.addEventListener("select", onSelect);
  scene.add(controller);

  init3DLoader();

  initReticle();
  scene.add(reticle);

  window.addEventListener("resize", onWindowResize, false);
  // const axesHelper = new THREE.AxesHelper(5);
  // scene.add(axesHelper);
  animate();
}

function onSelect() {
  if (reticle.visible) {
    measurements.push(matrixToVector(reticle.matrix));

    if (measurements.length == 2) {
      let distance = Math.round(getDistance(measurements) * 100);
      distances.push(distance);

      let text = document.createElement("div");
      text.className = "label";
      text.style.color = "rgb(255,255,255)";
      text.textContent = distance + " cm";

      document.querySelector("#container").appendChild(text);

      labels.push({
        div: text,
        point: getCenterPoint([measurements[0], measurements[1]]),
      });

      currentLine = initLine(measurements[1]);
      lines.push(currentLine);
      scene.add(currentLine);
    } else if (measurements.length == 3) {
      let distance = Math.round(getDistance(measurements) * 100);
      distances.push(distance);

      let text = document.createElement("div");
      text.className = "label";
      text.style.color = "rgb(255,255,255)";
      text.textContent = distance + " cm";

      document.querySelector("#container").appendChild(text);

      labels.push({
        div: text,
        point: getCenterPoint([measurements[1], measurements[2]]),
      });

      placeTile();

      currentLine = null;
    } else if (measurements.length == 4) {
      wipeOutScene();
    } else {
      currentLine = initLine(measurements[0]);

      lines.push(currentLine);
      scene.add(currentLine);
      // if (reticle.visible) {

      drawAxis();
      // }
    }
  }
}

function wipeOutScene() {
  if (!scene) return;
  if (measurements.length > 0) measurements = [];

  if (lines.length > 0) {
    lines.map((line) => {
      // line.geometry.dispose();
      // line.material.dispose();
      // scene.remove(line);

      removeObject3D(line);
    });

    lines = [];
  }

  if (currentLine) currentLine = null;

  if (axisXLine && axisZLine) {
    // axisXLine.geometry.dispose();
    // axisXLine.material.dispose();
    // scene.remove(axisXLine);
    removeObject3D(axisXLine);
    axisXLine = null;

    // axisZLine.geometry.dispose();
    // axisZLine.material.dispose();
    // scene.remove(axisZLine);
    removeObject3D(axisZLine);
    axisZLine = null;
  }

  if (models.length > 0) {
    models.map((model) => {
      // scene.remove(model)
      removeObject3D(model);
    });
  }
  models = [];

  if (pivot) {
    // scene.remove(pivot);
    removeObject3D(pivot);
    pivot = null;
  }

  if (labels.length >= 0) {
    const results = labels.map((label) => {
      return new Promise((resolve) => {
        document.querySelector("#container").removeChild(label.div);
        resolve();
      });
    });

    Promise.all(results).then(() => {
      labels = [];
    });
  }
}

function onWindowResize() {
  width = window.innerWidth;
  height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  if (frame) {
    let referenceSpace = renderer.xr.getReferenceSpace();
    let session = renderer.xr.getSession();
    if (hitTestSourceRequested === false) {
      session.requestReferenceSpace("viewer").then(function (referenceSpace) {
        session
          .requestHitTestSource({ space: referenceSpace })
          .then(function (source) {
            hitTestSource = source;
          });
      });
      session.addEventListener("end", function () {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;
    }

    if (hitTestSource) {
      let hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length) {
        let hit = hitTestResults[0];
        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
      } else {
        reticle.visible = false;
      }

      if (currentLine) {
        updateLine(reticle.matrix);
      }
    }

    labels.length > 0 &&
      labels.map((label) => {
        let pos = toScreenPosition(label.point, renderer.xr.getCamera(camera));
        let x = pos.x;
        let y = pos.y;
        label.div.style.transform =
          "translate(-50%, -50%) translate(" + x + "px," + y + "px)";
      });

    if (!pivot) {
      pivot = new THREE.Group();
    }
  }
  renderer.render(scene, camera);
}

function stampModel({ position, scale }) {
  if (model3D && scene) {
    const { px, py, pz } = position;
    const { sx, sy, sz } = scale;

    const cpiedModel = model3D.clone();
    cpiedModel.position.set(
      pivot.matrixWorld.elements[12] + px,
      pivot.matrixWorld.elements[13] + py,
      pivot.matrixWorld.elements[14] + pz
    );
    cpiedModel.scale.set(sx, sy, sz);

    models.push(cpiedModel);
    pivot.add(cpiedModel);
  }
}

function placeTile() {
  if (scene && pivot && distances.length >= 2 && measurements.length >= 3) {
    // add tiles
    const width = 0.1; // 단위 미터(m)
    const height = 0.2;
    const widthMargin = width * 0.005;
    const heightMargin = height * 0.005;

    const rowCnt = distances[0] / (width * 100);
    const colCnt = distances[1] / (height * 100);

    for (let i = 0; i < rowCnt - 1; i += 1) {
      for (let j = 0; j < colCnt - 1; j += 1) {
        stampModel({
          position: {
            px: (width + widthMargin) * i,
            py: 0,
            pz: (height + heightMargin) * j,
          },
          scale: { sx: 1, sy: 1, sz: 1 },
        });
      }
    }

    pivot.position.set(measurements[0].x, measurements[0].y, measurements[0].z);

    let v1, v2;

    v1 = new Vector3(
      measurements[1].x - measurements[0].x,
      measurements[1].y - measurements[0].y,
      measurements[1].z - measurements[0].z
    );
    v2 = new Vector3(1, 0, 0);
    if (
      measurements[0].x - measurements[1].x <= 0 &&
      measurements[0].z - measurements[1].z <= 0
    ) {
      //1사분면

      if (
        measurements[2].z - measurements[1].z <=
        ((measurements[1].z - measurements[0].z) /
          (measurements[1].x - measurements[0].x)) *
          (measurements[2].x - measurements[1].x)
      ) {
        pivot.rotateX(Math.PI);
        pivot.rotateY(v1.angleTo(v2));
      } else {
        pivot.rotateY(-v1.angleTo(v2));
      }
    } else if (
      measurements[0].x - measurements[1].x >= 0 &&
      measurements[0].z - measurements[1].z <= 0
    ) {
      //2사분면

      if (
        measurements[2].z - measurements[1].z >=
        ((measurements[1].z - measurements[0].z) /
          (measurements[1].x - measurements[0].x)) *
          (measurements[2].x - measurements[1].x)
      ) {
        pivot.rotateX(Math.PI);
        pivot.rotateY(v1.angleTo(v2));
      } else {
        pivot.rotateY(-v1.angleTo(v2));
      }
    } else if (
      measurements[0].x - measurements[1].x >= 0 &&
      measurements[0].z - measurements[1].z >= 0
    ) {
      //3사분면
      if (
        measurements[2].z - measurements[1].z >=
        ((measurements[1].z - measurements[0].z) /
          (measurements[1].x - measurements[0].x)) *
          (measurements[2].x - measurements[1].x)
      ) {
        pivot.rotateX(Math.PI);
        pivot.rotateY(-v1.angleTo(v2));
      } else {
        pivot.rotateY(v1.angleTo(v2));
      }
    } else if (
      measurements[0].x - measurements[1].x <= 0 &&
      measurements[0].z - measurements[1].z >= 0
    ) {
      //4사분면
      if (
        measurements[2].z - measurements[1].z <=
        ((measurements[1].z - measurements[0].z) /
          (measurements[1].x - measurements[0].x)) *
          (measurements[2].x - measurements[1].x)
      ) {
        pivot.rotateX(Math.PI);
        pivot.rotateY(-v1.angleTo(v2));
      } else {
        pivot.rotateY(v1.angleTo(v2));
      }
    }

    scene.add(pivot);
  }
}

function removeObject3D(object) {
  if (!(object instanceof THREE.Object3D)) return false;
  // for better memory management and performance
  if (object.geometry) {
    object.geometry.dispose();
  }
  if (object.material) {
    if (object.material instanceof Array) {
      // for better memory management and performance
      object.material.forEach((material) => material.dispose());
    } else {
      // for better memory management and performance
      object.material.dispose();
    }
  }
  if (object.parent) {
    object.parent.remove(object);
  }
  // the parent might be the scene or another Object3D, but it is sure to be removed this way
  return true;
}

export { initXR };
