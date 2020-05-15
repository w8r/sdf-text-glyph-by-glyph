import "./styles.css";
import { mat3 } from "gl-matrix";
import { select as d3Select, event as d3Event } from 'd3-selection';
import { zoom as d3Zoom } from "d3-zoom";
import createRegl from "regl";
import TinySdf from '@mapbox/tiny-sdf';

import vert from './shaders/vertex.glsl';
import frag from './shaders/fragment.glsl';

const text = 'Auteuil Dugommier Villiers';

const width = document.documentElement.clientWidth;
const height = document.documentElement.clientHeight;
const dpx = devicePixelRatio;

const minZoom = 0.01;
const maxZoom = 10;

const sdfRadius = 4;
const sdfGamma = 1.4142;
const sdfBuffer = 192 / 256;

const fontSize = 12;
const samplingFontSize = 24;

document.fonts.ready.then(() => {

  const canvas = document.body.appendChild(document.createElement("canvas"));
  canvas.id = "canvas";
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  const atlasCanvas = document.body.appendChild(document.createElement("canvas"));
  atlasCanvas.id = "atlas";

  const fontFamily = "'Roboto', sans-serif";
  const fontWeight = 'normal';


  function makeRGBAImageData(alphaChannel, size) {
    const imageData = new ImageData(size, size);
    const data = imageData.data;
    for (let i = 0; i < alphaChannel.length; i++) {
      data[4 * i + 0] = alphaChannel[i];
      data[4 * i + 1] = alphaChannel[i];
      data[4 * i + 2] = alphaChannel[i];
      data[4 * i + 3] = 255;
    }
    return imageData;
  }


  function fillAtlas(text) {
    const atlas = {};
    const ctx = atlasCanvas.getContext('2d');
    ctx.font = `${samplingFontSize}px ${fontFamily}`;
    let x = 0;
    let y = 0;
    const buffer = 6;
    const side = Math.ceil(Math.sqrt(text.length));
    const textureWidth = side * (samplingFontSize + buffer * 2);
    const textureHeight = textureWidth;

    atlasCanvas.width = textureWidth;
    atlasCanvas.height = textureHeight;

    const sdf = new TinySdf(
      samplingFontSize,
      buffer,
      sdfRadius,
      0.25,
      fontFamily,
      fontWeight
    );
    const size = sdf.size;
    ctx.clearRect(0, 0, textureWidth, textureHeight);

    text.split('').forEach((char, i) => {
      const { width } = ctx.measureText(char);

      const alpha = sdf.draw(char);
      const imageData = makeRGBAImageData(alpha, sdf.size);
      const offset = (size - width + buffer * 2) / 2;

      y = size * (Math.floor(i / side))
      ctx.putImageData(imageData, x, y);

      atlas[char] = {
        x, y, offset, size,
        width: size,
        height: size,
        pixels: alpha,
        buffer
      };

      ctx.strokeStyle = 'red';
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.stroke();

      x = (x + sdf.size) % (sdf.size * side);
    });

    return atlas;
  }

  const atlas = fillAtlas(text);

  const transform = mat3.create();
  mat3.translate(transform, transform, [300, 50]);
  const projection = mat3.projection(mat3.create(), width, height);

  function updateTransform(x, y, scale) {
    mat3.identity(transform);
    mat3.translate(transform, transform, [x, y]);
    mat3.scale(transform, transform, [scale, scale]);
    mat3.translate(transform, transform, [width / 2, height / 2]);
    mat3.projection(projection, width, height);
  }

  // set up zoom/pan
  d3Select(canvas).call(
    d3Zoom()
      .scaleExtent([minZoom, maxZoom])
      .on("zoom", () => {
        const t = d3Event.transform;
        updateTransform(t.x, t.y, t.k);
        render();
      })
  );

  const regl = createRegl(canvas, width, height);

  function createMesh(text) {
    const vertices = [];
    const texturePositions = [];
    const ctx = atlasCanvas.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;

    let x = 0;
    let y = 0;

    const ratio = samplingFontSize / fontSize;
    text.split('').forEach(char => {
      const { width } = ctx.measureText(char);
      const info = atlas[char];
      const buffer = info.buffer;

      const h = fontSize;
      const w = width;
      vertices.push(
        [x, y], [x, y + h], [x + w, y],
        [x + w, y], [x + w, y + h], [x, y + h]
      );

      const tx = info.x + buffer;
      const ty = info.y + buffer;
      const tw = (width * ratio);
      const th = (fontSize * ratio); //info.height - buffer;

      texturePositions.push(
        [tx, ty], [tx, ty + th], [tx + tw, ty],
        [tx + tw, ty], [tx + tw, ty + th], [tx, ty + th]
      );
      x += width;
    });

    return { vertices, texturePositions };
  }

  const realTextCanvas = document.body.appendChild(document.createElement('canvas'));
  realTextCanvas.width = 400;
  realTextCanvas.height = 100;
  realTextCanvas.style.width = 400 / dpx + 'px';
  realTextCanvas.style.height = 100 / dpx + 'px';

  realTextCanvas.id = 'reference';
  const rctx = realTextCanvas.getContext('2d');
  rctx.font = `${fontSize * dpx}px ${fontFamily}`;
  rctx.fillText(text, 0, fontSize * dpx);
  rctx.textBaseline = 'bottom';


  const { vertices, texturePositions } = createMesh(text);

  const draw = regl({
    frag, vert,

    attributes: {
      position: regl.prop("points"),
      texturePosition: regl.prop('texturePositions')
    },

    uniforms: {
      transform: regl.prop("transform"),
      projection: regl.prop("projection"),
      u_texture: regl.texture(atlasCanvas),
      u_gamma: regl.prop('gamma'),
      u_buffer: regl.prop('buffer'),
      u_textureSize: regl.prop('textureSize'),
      u_zoom: regl.prop('zoom')
    },

    count: (context, props) => props.points.length
    //primitive: 'points'
  });



  const minSmoothing = 4;
  const maxSmoothing = 4;

  const render = () => {
    const zoom = transform[0];
    const zoomNorm = (zoom / (maxZoom - minZoom));
    const smoothing = (minSmoothing + zoomNorm * (maxSmoothing - minSmoothing));

    const fontSamplingRatio = samplingFontSize / fontSize;
    const gamma = smoothing * sdfGamma / samplingFontSize / dpx;

    console.log(smoothing, gamma, transform);
    draw({
      points: vertices,
      transform,
      projection,
      texturePositions,
      gamma,
      zoom,
      buffer: sdfBuffer,
      textureSize: [atlasCanvas.width, atlasCanvas.height]
    });
  };

  render();
});
