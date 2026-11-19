# Assembly Workbench checkpoint, 19 November 2026

The linked source revisions are the tested local integration snapshot.

| Repository | Code revision |
| --- | --- |
| Admin client | `f08d16def398b7b0cd3b4decd8ccbc09b7379820` |
| Products manager | `341297e6f87fd935d794445a872ef938821fe854` |
| Protocol | `fcd245b2f607423181718048bdfc0b4387437df9` |

Local verification covers 26 of 48 criteria. Beta qualification covers 0 of 48. The local pass list is AC-01–AC-10, AC-14, AC-15, AC-18, AC-19, AC-21, AC-22, AC-24, AC-25, AC-27, AC-29, AC-30, AC-35, AC-36, AC-42, AC-45 and AC-46.

- Card169 B1 was saved and reopened through the ordinary Workbench and reached a physical 3D frame on the selected mannequin.
- Card11 saved and cold-restored exact V10 `35b4f5648664503cdf151db7256ba96f086599e66f3d0d8f02dfd3e0bcb6c18c`. ROOT's ordinary WebGPU frame 29 had all 27 pieces and 2,216 active stations, zero cloth and body intersections, and a maximum gap of 11.858 mm at operation 560.
- Card6 operation 970 retained the original left seam first and linked the existing right seam second. One guarded write and a separate cold read confirmed both links with all 40 raw seam rows and all three signed DXFs retained.
- Card6 operation 610 saved its explicit orientation and reopened with 14 active stations in M. Changing the size to L retired those stations.
- Card169 stored a single-turn hem and a cut-on facing on independent copies. Two further copies saved the 10 mm paired allowance with either fixed end during a 1 mm straight-edge extension. Fresh Workbench sessions reopened both exact edited edges and measured 60.999939 mm and 61.000061 mm respectively.
- Card169 fixed a race in which delayed reads could restore an older cloth document and transforms after the card advanced. Regression tests cover stale responses before and after the saved-arrangement request.
- Card169 saved Square, Mitre, Auto and Clip from ordinary Workbench sessions on separate archive copies. Each treatment reopened with its own name and exact signed native bytes. Square and Clip changed only the selected L1 corner in five sizes. All five L14 rings and the ten untouched DXF blocks matched byte for byte. Mitre and Auto each restored all 15 original blocks from the saved Square copy and retained their distinct treatments. Clip covers the proved convex right-angle case.
- Card169 saved Foldback about each adjacent sewing edge on two independent copies of Clip. A cold Workbench session restored the chosen axis and rendered its 200 mm or 40.000061 mm guide. The two native files retain distinct directions and restore all 15 original DXF blocks at the right angle. An angled fixture verifies two different reflected contours and exact R12 and R2000 reads. Ordinary saved verification of angled folds and broader curve editing remain open.
- Card169 saved a fish-eye as one closed four-vertex L8 feature on PCK_L_1 M. The ordinary Apply and separate cold Patterns view retained all ten original Level 15 labels, the other nine blocks and all five signed sizes. The existing AO and raw seam records remained present. The three prior source bindings were marked stale and the prior carrier was retired. Fish-eye edit variants and the other AC-16 effects remain open.
- The guarded pattern writer checks the Assembly revision inside the existing card write transaction. A stale request received HTTP 409 and its fresh counterpart received HTTP 200 on an isolated MySQL schema.

The separate Card11 display experiment is committed as `3f9d34feafec50ba04eac89d3c6fb37786e9022e` against the previously verified 4197 fixture source. ROOT verified its isolated read-only build at loopback port 4207 in an ordinary browser session. The four test button seats appeared on the exact accepted paused frame 29 and disappeared after Resume and Reset. The raw frame export matched the stock viewer byte for byte.

The acceptance ledger and receipts are maintained in the local TABLE handoff at `~/.codex/handoffs/assembly-table-2026-11-17/`. Full seam closure, complete Card6 qualification and beta delivery remain open.
