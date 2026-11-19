# Assembly Workbench checkpoint, 19 November 2026

The linked source revisions are the tested local integration snapshot.

| Repository | Code revision |
| --- | --- |
| Admin client | `966fa0163553239063a46f5685f43f920f4d3902` |
| Products manager | `341297e6f87fd935d794445a872ef938821fe854` |
| Protocol | `fcd245b2f607423181718048bdfc0b4387437df9` |

Local verification covers 26 of 48 criteria. Beta qualification covers 0 of 48. The local pass list is AC-01–AC-10, AC-14, AC-15, AC-18, AC-19, AC-21, AC-22, AC-24, AC-25, AC-27, AC-29, AC-30, AC-35, AC-36, AC-42, AC-45 and AC-46.

- Card169 B1 was saved and reopened through the ordinary Workbench and reached a physical 3D frame on the selected mannequin.
- Card11 saved and cold-restored exact V10 `35b4f5648664503cdf151db7256ba96f086599e66f3d0d8f02dfd3e0bcb6c18c`. ROOT's ordinary WebGPU frame 29 had all 27 pieces and 2,216 active stations, zero cloth and body intersections, and a maximum gap of 11.858 mm at operation 560.
- Card6 operation 970 retained the original left seam first and linked the existing right seam second. One guarded write and a separate cold read confirmed both links with all 40 raw seam rows and all three signed DXFs retained.
- Card169 stored a single-turn hem and a cut-on facing on independent copies. A further two separate copies saved the 10 mm paired allowance with either fixed end during a 1 mm straight-edge extension. Native SQL and signed cold reads agree. Reopening the edited edge in the editor still needs an eligibility fix.
- The guarded pattern writer checks the Assembly revision inside the existing card write transaction. A stale request received HTTP 409 and its fresh counterpart received HTTP 200 on an isolated MySQL schema.

The acceptance ledger and receipts are maintained in the local TABLE handoff at `~/.codex/handoffs/assembly-table-2026-11-17/`. Full seam closure, complete Card6 qualification and beta delivery remain open.
