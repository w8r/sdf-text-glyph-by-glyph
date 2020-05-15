import "./styles.css";
import { mat3 } from "gl-matrix";
import { select as d3Select, event as d3Event } from 'd3-selection';
import { zoom as d3Zoom } from "d3-zoom";
import createRegl from "regl";
import TinySdf from '@mapbox/tiny-sdf';

const text = 'Auteuil Dugommier Villiers';

const width = document.documentElement.clientWidth;
const height = document.documentElement.clientHeight;
const dpx = devicePixelRatio;

document.fonts.ready.then(() => {

  const canvas = document.body.appendChild(document.createElement("canvas"));
  canvas.id = "canvas";
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  const atlasCanvas = document.body.appendChild(document.createElement("canvas"));
  atlasCanvas.id = "atlas";
  const fontSize = 32;
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
    ctx.font = `${fontSize}px ${fontFamily}`;
    let x = 0;
    let y = 0;
    const buffer = 6;
    const side = Math.ceil(Math.sqrt(text.length));
    const textureWidth = side * (fontSize + buffer * 2);
    const textureHeight = textureWidth;

    atlasCanvas.width = textureWidth;
    atlasCanvas.height = textureHeight;

    const sdf = new TinySdf(fontSize, buffer, undefined, undefined, fontFamily, fontWeight);
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
  mat3.translate(transform, transform, [width / 2, height / 2]);
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
      .scaleExtent([0.01, 20])
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
    text.split('').forEach(char => {
      const { width } = ctx.measureText(char);
      const info = atlas[char];
      const buffer = info.buffer;

      const h = (fontSize + buffer) / dpx;
      const w = width / dpx;
      vertices.push(
        [x, y], [x, y + h], [x + w, y],
        [x + w, y], [x + w, y + h], [x, y + h]
      );

      const tx = info.x + buffer;
      const ty = info.y + buffer / 2;
      const tw = width;
      const th = fontSize + buffer; //info.height - buffer;

      texturePositions.push(
        [tx, ty], [tx, ty + th], [tx + tw, ty],
        [tx + tw, ty], [tx + tw, ty + th], [tx, ty + th]
      );
      x += width / dpx;
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
  rctx.font = `${fontSize}px ${fontFamily}`;
  rctx.fillText(text, 0, fontSize * dpx);
  rctx.textBaseline = 'bottom';


  const { vertices, texturePositions } = createMesh(text);

  const draw = regl({
    frag: `
precision mediump float;
uniform float u_buffer;
uniform float u_gamma;
uniform sampler2D u_texture;

varying vec2 v_texcoord;

void main () {
  float dist = texture2D(u_texture, v_texcoord).r;
  gl_FragColor = vec4(dist, dist, dist, 1);

  float alpha = smoothstep(u_buffer - u_gamma, u_buffer + u_gamma, dist);
  gl_FragColor = vec4(1.0, 0.5, 0.0, alpha);
}
`,

    vert: `
precision mediump float;

attribute vec2 position;
attribute vec2 texturePosition;

uniform mat3 transform;
uniform mat3 projection;

uniform vec2 u_textureSize;

varying vec2 v_texcoord;

void main () {
  v_texcoord = texturePosition / u_textureSize;
  vec3 final = projection * transform * vec3(position, 1);
  gl_Position = vec4(final.xy, 0, 1);
}
  `,

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
      u_textureSize: regl.prop('textureSize')
    },

    count: (context, props) => props.points.length
    //primitive: 'points'
  });

  const sdfGamma = 1.4142;
  const sdfBuffer = 192 / 256;
  const render = () => {
    draw({
      points: vertices,
      transform,
      projection,
      texturePositions,
      gamma: sdfGamma / fontSize / dpx,
      buffer: sdfBuffer,
      textureSize: [atlasCanvas.width, atlasCanvas.height]
    });
  };

  render();
});
