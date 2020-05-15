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
