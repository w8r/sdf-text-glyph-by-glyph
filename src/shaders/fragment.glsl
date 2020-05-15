precision mediump float;
uniform float u_buffer;
uniform float u_gamma;
uniform sampler2D u_texture;
uniform float u_zoom;

varying vec2 v_texcoord;

void main () {
  float dist = texture2D(u_texture, v_texcoord).r;
  gl_FragColor = vec4(dist, dist, dist, 1);

  float alpha = smoothstep(u_buffer - u_gamma, u_buffer + u_gamma, dist);
  gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}
