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

## Build and compare a small material study

Stage one subject on the actual background. First establish volume or shape with a few clear values. Choose how regions meet (cut, layered, translucent, worn, feathered or polished), then assign different responses to those regions. An opaque mass, a grainy face and a sharp edge can react quite differently to the same light. Put fine detail where the viewer can resolve it.

Test three observations in the rendered study:

1. The subject reads without the brightest effect. Temporarily remove the glint or emission to inspect silhouette and surface structure.
2. The effect has a location, width and falloff. Move the light or camera a little and check what stays on the object and what travels. In 2D, use a surface mask with a directional gradient or a moving band clipped to the lit area. In live 3D, first verify light direction, normals and roughness with effects disabled, then tune the highlight. Blending bloom can follow once the brightest features hold their shape.
3. Two contrasting data states still read. If the dataset measures one kind of response, keep its mapping visible and document the visual choices used for atmosphere. A spectral band outside human vision can be expressed through an explicitly assigned color, position or other channel.

When a frame looks coarse, inspect the mid-scale structure before increasing noise, bloom or detail count. Test it in a close crop and in the full composition. If the highlight vanishes at display size, change the local width or value separation and compare the same frame again.

References: [Three.js MeshPhysicalMaterial](https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial) and [Lusion's Lost in Parallel Universe](https://exp-lost-in-parallel-universe.lusion.co/).
