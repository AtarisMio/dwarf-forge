# Sword evolution and saved appearance

Checked 2026-10-12 for Steam ForgeTax app 5245810. The [community evolution tree](https://www.forgetax.tools/swords/evolution) and [form database](https://www.forgetax.tools/swords) describe the highest-grade appearance rule, common early forms, three delivery lanes, hidden family assignment, and merchant forms. The site claims to work from game code but provides no verifiable extraction procedure or original code hash. These detailed rules are **community-reported, medium confidence**, not independently verified official datamining. The official October 6 update separately confirms the numerical +99 cap and appearance cap at +20.

The parent lane cross-checked [北城花猫’s original gameplay, P1](https://www.bilibili.com/video/BV16yHX6zEJV/?p=1), published October 8, 2026: 04:55 shows damage reducing a blade to +2 while retaining the better iron form; 05:14 shows the awakened intermediate form; 05:16 reveals the split family at +10; 05:20 shows its +14 multi-blade form. This footage supports stages and nonregressing damage appearance. It does **not** verify the three-lane daily shuffle or hidden 50/50 assignment; those remain community-reported. Chinese names here are concise adaptations, with selected visible names matching these observations; the full list is not claimed to be the original localization.

## Shared pure API

`src/sword-evolution.ts` exports:

- `getSwordForm(sword)` → `{key, family, stage, level, name, route}`. Stage is 0–10; level is its even threshold from 0–20; key is `${family}/${stage}`. The function does not mutate state or draw randomness.
- `SWORD_ROUTES`: frozen array of `{id, families}`. Heavy maps to citadel/holy, serrated to sawblade/dragonfang, arcane to runeblade/splitblade.
- `SWORD_FORM_LEVELS`: frozen `[0,2,…,20]`.

Ordinary forms are shared at +0/+1, +2/+3, and +4/+5 (`family: basic`). At +6/+7 and +8/+9, the family field is the delivery route. At +10 onward it reveals the final `typeKey`, with another form every two levels. Merchant worldtree/fishblade/funerary families are distinct from level zero and also use eleven even stages. Their `route` is the special family's own key. Rendering uses the returned family/stage rather than leaking the hidden ordinary `typeKey` at low grades. A pure-call fallback tolerates absent appearance metadata, but persisted malformed metadata is rejected by the model.

## Model behavior and compatibility

Each sword stores `appearanceLevel`, the highest achieved **numerical level**, in 0–99. `recalc` updates it monotonically, chooses the current visible name and records the revealed form in discoveries. Current grade still controls value, break odds and grade-dependent relic effects. Damage cannot reduce the form; an ordinary family is not discovered merely because it was assigned secretly. Three ordinary supply swords contain one from each shuffled route. Larger supplies deal additional shuffled cycles of those routes. Each sword's final branch is selected once at delivery and stored in `typeKey`; forging, selecting, and loading never choose it again. Merchant basic blades retain the existing random-family rule.

Upgrade jumps, inherited grades and Headless Bell’s natural timer expiry pass through the same appearance update. Seal of Twins copies the existing sword's peak/form into the new physical blade. Rewind restores the complete pre-strike sword snapshot, including its earlier appearance and value peak. Permanent codex discoveries remain shared history after rewind, as in the existing save boundary.

Older v2 saves missing `appearanceLevel` initialize it from **current grade**, preserve their `typeKey`, and update only the visible name during restore. Historical highest grade cannot be recovered from gold value: Great, flat bonuses and relic multipliers make it ambiguous. Existing historical discoveries are retained rather than removed; older saves may therefore retain a family revealed prematurely by the earlier adaptation. Explicit noninteger, negative, >99 or lower-than-current peaks are rejected. The compatibility path grants no sword, currency, bonus grade or relic, and does not invoke economic recalculation during restore.

Tests cover shared early forms, route thresholds, all nine final families, +99 visual cap, odd-grade grouping, one-per-route shuffled supplies and extra cycles, stable branch saves, appearance after damage, exact rewind restoration, inheritance/expiry/cloning, reveal-only discovery, old-field migration and malformed peaks, and resource preservation on restoring/recalculating existing bonuses. Geometry and visual resemblance are validated separately by the workshop lane.
