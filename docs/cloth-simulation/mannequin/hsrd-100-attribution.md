# HSRD-100 attribution

The female hip back share used by the model-form mannequin
(`FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1 = 0.145` in
`src/lib/cloth/body/measurement-open-reference-female-hip-back-v1.ts`) is a statistic derived by
measurement from:

HSRD-100: 100 High-Quality 3D Human Scans Dataset, Digital Reality Lab (2025),
https://huggingface.co/datasets/digitalrealitylab/HSRD-100, licensed under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/).

Statistic derived by measurement; not endorsed by the authors.

## What was taken

One number: the mean, over the female scans, of posterior depth over tape (convex hull) girth at
the hip level (n 3, 95% CI 0.134-0.157, low confidence). No scan, mesh, image or other part of the
dataset is in this repository or in the shipped app.

## Changes

The scans were not modified or redistributed. The number was measured with the project's scan
harness (hip level: greatest posterior protrusion between crotch + 0.01 H and crotch + 0.12 H;
posterior depth: from the side-seam line, the mean z of the section points within 5 mm of either
lateral extreme, to the backmost point; girth: convex hull perimeter of the same section).
