# SP-Based ELO Modifier Idea

Calculate Tournament Average SP (e.g., 74.5).
For each speaker in a round, calculate their SP deviation: `deltaSP = SP - AvgSP`.
Let `SP_Factor = 1 + (deltaSP * 0.1)`. (So +1 SP = 1.1x, -1 SP = 0.9x. Cap it at 0.5x to 1.5x to prevent insane scaling).

Win case (`rawDelta > 0`): `finalChange = baseChange * SP_Factor`
Loss case (`rawDelta < 0`): `finalChange = baseChange / SP_Factor`

This way, if you lose but get 78 SP, your loss is divided by 1.35 = reduced by ~25%.
If you win and get 78 SP, your win is multiplied by 1.35 = increased by 35%.
