export const PBRVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  
  #ifdef USE_INSTANCING
    attribute mat4 instanceMatrix;
    attribute vec3 instanceColor;
  #endif
  
  void main() {
    vUv = uv;
    
    vec3 transformedNormal = normalMatrix * normal;
    vWorldNormal = normalize(transformedNormal);
    
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    
    vViewDir = normalize(cameraPosition - vWorldPosition);
    
    #ifdef USE_TANGENT
      vTangent = normalize(normalMatrix * tangent.xyz);
      vBitangent = cross(vWorldNormal, vTangent) * tangent.w;
    #endif
    
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const PBRFragmentShader = `
  #define PI 3.14159265359
  #define RECIPROCAL_PI 0.31830988618
  #define RECIPROCAL_PI2 0.10132118364
  
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  
  uniform vec3 cameraPosition;
  uniform float time;
  
  // Material parameters
  uniform vec3 baseColor;
  uniform float metallic;
  uniform float roughness;
  uniform float ao;
  uniform float clearcoat;
  uniform float clearcoatRoughness;
  uniform float clearcoatNormalScale;
  uniform vec3 emissive;
  uniform float emissiveIntensity;
  uniform float alphaCutoff;
  
  // Textures
  uniform sampler2D baseColorMap;
  uniform sampler2D metalRoughMap;
  uniform sampler2D normalMap;
  uniform sampler2D aoMap;
  uniform sampler2D emissiveMap;
  uniform sampler2D clearcoatMap;
  uniform sampler2D clearcoatRoughnessMap;
  uniform sampler2D clearcoatNormalMap;
  
  uniform bool hasBaseColorMap;
  uniform bool hasMetalRoughMap;
  uniform bool hasNormalMap;
  uniform bool hasAoMap;
  uniform bool hasEmissiveMap;
  uniform bool hasClearcoatMap;
  uniform bool hasClearcoatRoughnessMap;
  uniform bool hasClearcoatNormalMap;
  
  // IBL
  uniform samplerCube irradianceMap;
  uniform samplerCube prefilterMap;
  uniform sampler2D brdfLUT;
  uniform float lodMax;
  
  // Lighting
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform float sunIntensity;
  uniform vec3 ambientColor;
  uniform float ambientIntensity;
  
  // Fog
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float fogDensity;
  
  // GGX Distribution
  float DistributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    
    float num = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
    
    return num / denom;
  }
  
  // Smith Geometry Function
  float GeometrySchlickGGX(float NdotV, float roughness) {
    float r = (roughness + 1.0);
    float k = (r * r) / 8.0;
    float denom = NdotV * (1.0 - k) + k;
    return NdotV / denom;
  }
  
  float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = GeometrySchlickGGX(NdotV, roughness);
    float ggx1 = GeometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
  }
  
  // Fresnel-Schlick
  vec3 FresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
  }
  
  // Clearcoat GGX
  float DistributionGGXClearcoat(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float denom = PI * (NdotH2 * (a2 - 1.0) + 1.0);
    denom *= denom;
    return a2 / denom;
  }
  
  float GeometrySchlickGGXClearcoat(float NdotV) {
    float k = 0.25;
    float denom = NdotV * (1.0 - k) + k;
    return NdotV / denom;
  }
  
  // Tangent to World
  mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv) {
    vec3 dp1 = dFdx(p);
    vec3 dp2 = dFdy(p);
    vec2 duv1 = dFdx(uv);
    vec2 duv2 = dFdy(uv);
    
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    
    float invmax = inversesqrt(max(dot(T,T), dot(B,B)));
    return mat3(T * invmax, B * invmax, N);
  }
  
  vec3 perturb_normal(vec3 N, vec3 V, vec2 uv, sampler2D normalMap, float scale) {
    #ifdef USE_TANGENT
      vec3 T = vTangent;
      vec3 B = vBitangent;
    #else
      mat3 TBN = cotangent_frame(N, vWorldPosition, uv);
      vec3 T = TBN[0];
      vec3 B = TBN[1];
    #endif
    
    vec3 mapN = texture2D(normalMap, uv).xyz * 2.0 - 1.0;
    mapN.xy *= scale;
    vec3 Npert = normalize(T * mapN.x + B * mapN.y + N * mapN.z);
    return Npert;
  }
  
  void main() {
    // Sample textures
    vec3 albedo = baseColor;
    float mtl = metallic;
    float rgh = roughness;
    float occ = ao;
    float cc = clearcoat;
    float ccr = clearcoatRoughness;
    vec3 emi = emissive * emissiveIntensity;
    
    if (hasBaseColorMap) {
      vec4 baseColorTex = texture2D(baseColorMap, vUv);
      albedo = baseColorTex.rgb;
      if (alphaCutoff > 0.0 && baseColorTex.a < alphaCutoff) discard;
    }
    
    if (hasMetalRoughMap) {
      vec4 mrTex = texture2D(metalRoughMap, vUv);
      mtl = mrTex.b;
      rgh = mrTex.g;
    }
    
    if (hasAoMap) {
      occ = texture2D(aoMap, vUv).r;
    }
    
    if (hasEmissiveMap) {
      emi += texture2D(emissiveMap, vUv).rgb * emissiveIntensity;
    }
    
    if (hasClearcoatMap) {
      cc *= texture2D(clearcoatMap, vUv).r;
    }
    
    if (hasClearcoatRoughnessMap) {
      ccr = texture2D(clearcoatRoughnessMap, vUv).g;
    }
    
    // Clamp roughness
    rgh = max(rgh, 0.04);
    ccr = max(ccr, 0.04);
    
    // Normal mapping
    vec3 N = vWorldNormal;
    if (hasNormalMap) {
      N = perturb_normal(N, vViewDir, vUv, normalMap, 1.0);
    }
    
    // Clearcoat normal mapping
    vec3 Ncc = N;
    if (hasClearcoatNormalMap) {
      Ncc = perturb_normal(Ncc, vViewDir, vUv, clearcoatNormalMap, clearcoatNormalScale);
    }
    
    // F0
    vec3 F0 = mix(vec3(0.04), albedo, mtl);
    
    // Base reflectance
    vec3 Lo = vec3(0.0);
    
    // Sun light
    vec3 L = normalize(-sunDirection);
    vec3 H = normalize(L + vViewDir);
    float NdotL = max(dot(N, L), 0.0);
    float NdotV = max(dot(N, vViewDir), 0.0);
    float NdotH = max(dot(N, H), 0.0);
    float VdotH = max(dot(vViewDir, H), 0.0);
    
    if (NdotL > 0.0) {
      float D = DistributionGGX(N, H, rgh);
      float G = GeometrySmith(N, vViewDir, L, rgh);
      vec3 F = FresnelSchlick(VdotH, F0);
      
      vec3 ks = F;
      vec3 kd = vec3(1.0) - ks;
      kd *= 1.0 - mtl;
      
      vec3 radiance = sunColor * sunIntensity * NdotL;
      Lo += (kd * albedo / PI + (D * G * F) / (4.0 * NdotV * NdotL + 0.0001)) * radiance;
    }
    
    // Clearcoat
    if (cc > 0.0) {
      vec3 Hcc = normalize(L + vViewDir);
      float NdotHcc = max(dot(Ncc, Hcc), 0.0);
      float VdotHcc = max(dot(vViewDir, Hcc), 0.0);
      float NdotVcc = max(dot(Ncc, vViewDir), 0.0);
      float NdotLcc = max(dot(Ncc, L), 0.0);
      
      if (NdotLcc > 0.0) {
        float Dcc = DistributionGGXClearcoat(Ncc, Hcc, ccr);
        float Gcc = GeometrySchlickGGXClearcoat(NdotVcc) * GeometrySchlickGGXClearcoat(NdotLcc);
        vec3 Fcc = FresnelSchlick(VdotHcc, vec3(0.04));
        
        vec3 radiance = sunColor * sunIntensity * NdotLcc;
        Lo += cc * (Dcc * Gcc * Fcc) / (4.0 * NdotVcc * NdotLcc + 0.0001) * radiance;
      }
    }
    
    // IBL - Ambient
    vec3 irradiance = textureCube(irradianceMap, N).rgb;
    vec3 diffuse = irradiance * albedo;
    
    // IBL - Specular
    float lod = rgh * lodMax;
    vec3 prefilteredColor = textureCube(prefilterMap, vViewDir, lod).rgb;
    vec2 brdf = texture2D(brdfLUT, vec2(NdotV, rgh)).rg;
    vec3 specular = prefilteredColor * (F0 * brdf.x + brdf.y);
    
    // Ambient occlusion
    float aoFactor = occ;
    Lo += (kd * diffuse + specular) * aoFactor;
    
    // Clearcoat IBL
    if (cc > 0.0) {
      float lodcc = ccr * lodMax;
      vec3 prefilteredColorCC = textureCube(prefilterMap, vViewDir, lodcc).rgb;
      vec2 brdfCC = texture2D(brdfLUT, vec2(NdotV, ccr)).rg;
      vec3 specularCC = prefilteredColorCC * (vec3(0.04) * brdfCC.x + brdfCC.y);
      Lo += cc * specularCC * aoFactor;
    }
    
    // Ambient
    Lo += albedo * ambientColor * ambientIntensity * aoFactor;
    
    // Emissive
    Lo += emi;
    
    // Fog
    float fogDepth = length(vWorldPosition - cameraPosition);
    float fogFactor = 0.0;
    #ifdef USE_FOG_EXP2
      fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
    #else
      fogFactor = smoothstep(fogNear, fogFar, fogDepth);
    #endif
    Lo = mix(Lo, fogColor, fogFactor);
    
    // Tone mapping will be done in post
    gl_FragColor = vec4(Lo, 1.0);
  }
`;