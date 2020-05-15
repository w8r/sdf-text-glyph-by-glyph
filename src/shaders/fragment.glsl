precision mediump float;
uniform float u_buffer;
uniform float u_gamma;
uniform sampler2D u_texture;
uniform float u_zoom;

varying vec2 v_texcoord;

void main () {
  float minSmoothing = 0.5;
  float maxSmoothing = 1.5;

  float smoothing = minSmoothing + (maxSmoothing - minSmoothing) * u_zoom;

  float dist = texture2D(u_texture, v_texcoord).r;
  gl_FragColor = vec4(dist, dist, dist, 1);

  float gamma = smoothing * u_gamma;

  float alpha = smoothstep(u_buffer - gamma, u_buffer + gamma, dist);
  gl_FragColor = vec4(1.0, 0.5, 0.0, alpha);
}
