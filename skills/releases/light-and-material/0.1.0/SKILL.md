---
name: light-and-material
description: Make optical material effects such as sparkling highlights, reflection, glass, colored light, iridescence and soft transmission for data artwork. Use for material behavior and light placement in 2D, 3D or mixed imagery.
---

# Light and material

Identify where the desired effect occurs in a reference. Separate the underlying surface color, the highlight, the light source and the background. Ask whether the interesting property is a moving specular highlight, an emissive surface, light passing through an edge, thin-film color, or a perceptual impression you can draw directly.

- Give specular highlights a reason to appear. Choose a light or environment that creates highlights where the object turns toward it. Tune highlight size and sharpness through surface roughness and light shape. Reserve peak contrast for a few visible edges or facets.
- For iridescent edges, concentrate the hue shift near selected glancing or curved regions. Keep sufficient surface area in a quieter value range to reveal shape. For sparkle, use sparse localized glints with a visible onset and falloff. Test the silhouette and a close crop so bloom does not cover the surface.
- For a fixed 2D image, a masked highlight, cutout gradient or pre-rendered layer can express the effect. For a changing view, test the material from multiple angles. Check that perceived color or brightness still reads the intended data relationship under those conditions, or carry that relationship in another channel.
- Test the exact output size on the actual background. Compare an unlit or neutral version with the material study to see what the treatment added.

References: [Three.js MeshPhysicalMaterial](https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial) and [Lusion's Lost in Parallel Universe](https://exp-lost-in-parallel-universe.lusion.co/).
