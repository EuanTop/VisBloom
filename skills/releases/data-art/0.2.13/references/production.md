# Choose the production tools

Read when the work’s medium or delivery route is open. Choose how to author the assets, what needs to run for the audience and what needs to stay editable. Those can be different tools. Check installed capabilities before committing to a route.

| Route | When it serves the work |
| --- | --- |
| HTML, SVG and CSS | Text-rich pages, editorial layouts, sharp shapes and readable annotations, scroll or chapter navigation, and accessible controls. |
| Canvas2D, or p5.js with a compatible host | Dense marks, procedural drawing, textured illustration and real-time sketches. Check pixel density and the actual export scale. Visloom includes Canvas2D. Check p5.js availability before choosing it for an integrated preview. |
| Three.js or WebGL | Live changes to viewpoint, lighting, material or spatial geometry. Use screen-space overlays for precise labels when they improve reading. Check the work at its actual device size. |
| Blender or another offline authoring tool | Detailed modeling, custom shading, stylized 3D rendered as 2D, pre-rendered scenes or print-quality imagery. Keep the editable source and choose an appropriate intermediate asset, such as a still, transparent layer, image sequence, video or mesh. Blender runs separately from the workbench. |
| Mixed production | Compose offline-rendered art with responsive web text, editable data marks or live interaction. Keep any elements that must respond to data in an updateable layer. Use baked assets for the parts that can stay fixed. |

AVA remains the data core for Visloom projects. For an offline production stage, export the relevant derived data with identifiers, units and its query or provenance so the renderer and any later viewer can refer back to the same observations. Check the exact handoff, including asset support, data-driven updates and the required preview or final format, before investing in a large scene.
