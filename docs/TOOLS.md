# Tools catalogue

All calculators validate their inputs, show the formula and assumptions, include an example, and can be reset, saved to history and exported (CSV · Markdown · JSON · Notes). Every calculator can also be run from gsh: `tool <id> key=value …`.

**63 calculators · 5 workspaces · scientific calculator · CSV viewer · 4 reference guides**

## Quantitative Genetics

| Tool | id | Formula / method |
|---|---|---|
| Heritability (variance components) | `heritability` | h² = σ²A / σ²P     H² = σ²G / σ²P     σ²P = σ²A + σ²D + σ²I + σ²E |
| Heritability from resemblance between relatives | `h2_relatives` | h² = 2b (one parent)   h² = b (mid-parent)   h² = 4t (half-sibs)   h² ≤ 2t (full-sibs) |
| Repeatability & repeated records | `repeatability` | t = (σ²A + σ²PE) / σ²P;   h²(P̄n) = n·h² / [1 + (n−1)t];   σ²(P̄n) = σ²P·[1 + (n−1)t] / n |
| Genetic variance | `genetic_variance` | σ²A = h²·σ²P   or   σ²G = σ²P − σ²E;   CV = 100·σ / μ |
| Phenotypic variance | `phenotypic_variance` | σ²P = σ²A + σ²D + σ²I + σ²PE + σ²TE |
| Environmental variance | `environmental_variance` | σ²E = σ²P − σ²G;   σ²E = σ²PE + σ²TE |
| Genetic correlation | `genetic_correlation` | rG = covA(x,y) / (σAx · σAy) |
| Phenotypic correlation | `phenotypic_correlation` | rP = covP / (σPx σPy) = rG·hx·hy + rE·ex·ey,  e = √(1 − h²) |
| Breeding value — own performance | `bv_own` | EBV = b·(P̄ − μ),  b = n·h² / [1 + (n−1)t],  accuracy = √b |
| Breeding value — progeny test | `bv_progeny` | EBV = 2n/(n+k) · (P̄prog − μ),  k = (4 − h²)/h²,  accuracy = √(n/(n+k)) |
| Selection differential | `sel_diff` | S = μs − μ;  i = S / σP |
| Response to selection (breeder’s equation) | `response` | R = h²·S = i·h²·σP = i·h·σA;   ΔG/yr = R / L |
| Selection intensity helper | `intensity` | i = φ(x) / p,  where x = Φ⁻¹(1 − p);  finite N: i ≈ i∞ − (1 − p) / [2p(N + 1)i∞]  (Burrows, 1972) |
| Generation interval | `gen_interval` | L = (Lm + Lf) / 2;  each path = mean age of parents when their replacement offspring are born |
| Accuracy of selection | `accuracy` | own: √(n h²/[1+(n−1)t])   progeny: √(n h²/[4+(n−1)h²])   half-sibs: ¼√(n h²/[1+(n−1)h²/4])   PA: ½√(rs²+rd²) |
| Annual genetic gain (incl. four-path) | `genetic_gain` | ΔG/yr = (iSS rSS + iSD rSD + iDS rDS + iDD rDD) σA / (LSS + LSD + LDS + LDD) |
| Correlated response | `correlated_response` | CRy = i · hx · hy · rG · σPy |
| Realized heritability | `realized_h2` | h²R = R / S;   several generations: b = Σ(CS·CR) / Σ CS²  (regression through the origin) |

## Population Genetics

| Tool | id | Formula / method |
|---|---|---|
| Allele frequency (bi-allelic) | `allele_freq` | p = (2·nAA + nAa) / 2N;   SE = √(pq / 2N) |
| Expected genotype frequencies (HWE) | `genotype_freq` | f(AA) = p², f(Aa) = 2pq, f(aa) = q² |
| Hardy–Weinberg equilibrium test | `hwe` | χ² = Σ (O − E)² / E with 1 df;  exact test enumerates heterozygote counts given allele counts |
| Heterozygosity & F_IS | `heterozygosity` | He = 1 − Σ pᵢ²;  Ĥe = 2N/(2N−1)·He;  FIS = 1 − Ho / He |
| Effective population size | `ne` | Ne = 4NmNf/(Nm+Nf);  1/Ne = (1/t)Σ1/Nᵢ;  Ne = 1/(2ΔF);  Ne = (4N − 2)/(Vk + 2) |
| Inbreeding coefficient (path method) | `inbreeding_path` | F_X = Σ (½)^(n1 + n2 + 1) · (1 + F_A) |
| Inbreeding accumulation over generations | `inbreeding_time` | F_t = 1 − (1 − F₀)(1 − 1/2Ne)^t |
| Relationship coefficient (path method) | `relationship` | a_XY = Σ (½)^n (1 + F_A);   R_XY = a_XY / √[(1 + F_X)(1 + F_Y)] |
| Population diversity indices | `diversity` | ne = 1/Σpᵢ²;  PIC = 1 − Σpᵢ² − ΣΣ_{i<j} 2pᵢ²pⱼ²;  H' = −Σ pᵢ ln pᵢ |
| F-statistics (FST, FIS, FIT) | `fst` | HS = Σwᵢ·2pᵢqᵢ / Σwᵢ;   HT = 2p̄q̄;   FST = (HT − HS)/HT;   (1 − FIT) = (1 − FIS)(1 − FST) |
| Nei's genetic distance | `nei` | I = Jxy / √(Jx·Jy);   D = −ln I   (Nei 1972);   J = mean over loci of Σ p² |
| Selection on allele frequency | `selection_allele` | p′ = (p²w₁₁ + pq·w₁₂) / w̄;   w̄ = p²w₁₁ + 2pq·w₁₂ + q²w₂₂;   overdominance: p̂ = (w₁₂ − w₂₂)/(2w₁₂ − w₁₁ − w₂₂) |

## Genomics & Sequence

| Tool | id | Formula / method |
|---|---|---|
| Mendelian cross (Punnett square) | `punnett` | Independent assortment: product of per-gene Mendelian probabilities (¼ per gamete combination) |
| Recombination fraction ↔ map distance | `map_distance` | Haldane: d = −½ ln(1 − 2r);   Kosambi: d = ¼ ln[(1 + 2r)/(1 − 2r)]   (d in Morgans, ×100 for cM) |
| Linkage disequilibrium (D, D′, r²) | `ld` | D = p_AB·p_ab − p_Ab·p_aB;   D′ = D / Dmax;   r² = D² / (pA qA pB qB) |
| DNA sequence toolkit | `sequence` | GC = (G + C)/N;   Tm = 2(A+T) + 4(G+C) for N < 14, else 64.9 + 41(G + C − 16.4)/N;   standard genetic code |
| Genomic relationship matrix (VanRaden G) | `grm` | Z = M − 2P;   G = ZZ′ / (2 Σ pⱼ(1 − pⱼ))   (VanRaden 2008, method 1), p estimated from the data |

## Breeding & Selection

| Tool | id | Formula / method |
|---|---|---|
| Heterosis (hybrid vigour) | `heterosis` | H = F̄1 − (P̄1 + P̄2)/2;   H% = 100·H / MP;   expected F2 = MP + ½H (dominance model) |
| Crossbreeding — retained heterosis | `crossbreeding` | Rotation of n breeds (equilibrium): (2ⁿ − 2)/(2ⁿ − 1);   composite: 1 − Σ pᵢ² |
| Selection index (P⁻¹Ga) *(workspace)* | `selection_index` | Hazel selection index b = P⁻¹Ga with σI, r_IH and per-trait responses |
| BLUP animal model — EBV workspace *(workspace)* | `blup` | Single-trait animal-model BLUP (MME, A⁻¹ with inbreeding, reliabilities; reproduces Mrode Ex. 3.1) **+ REML variance components** (profile likelihood with SEs, or EM) and a likelihood plot |
| Pedigree viewer & relationship matrix *(workspace)* | `pedigree` | Pedigree validation & sorting, ancestry tree, descendants, inbreeding, A-matrix heatmap & CSV |
| Inbreeding-aware mating planner *(workspace)* | `mating` | Expected progeny inbreeding matrix and greedy minimum-F mating plan |
| Selection decision workspace *(workspace)* | `selection_decision` | Rank candidates, truncation selection, realized vs. theoretical intensity |

## Animal Science

| Tool | id | Formula / method |
|---|---|---|
| Average daily gain | `adg` | ADG = (W₂ − W₁) / days |
| Feed conversion & feed efficiency | `fcr` | FCR = feed intake / weight gain;  FE = 1 / FCR |
| European Production Efficiency Factor (broilers) | `epef` | EPEF = (livability % × live weight kg × 100) / (age d × FCR) |
| Egg production analysis | `egg_production` | HD% = eggs / (hens alive × days) × 100;  HH% = eggs / (hens housed × days) × 100;  egg mass = HD%/100 × egg weight |
| Haugh unit | `haugh` | HU = 100 · log₁₀(H − 1.7·W^0.37 + 7.57) |
| Egg quality indices | `egg_quality` | Shape index = width/length·100;  yolk index = height/diameter;  shell % = shell/egg·100 |
| Growth rate indices | `growth_rate` | AGR = ΔW/Δt;  SGR = 100(lnW₂ − lnW₁)/Δt;  Brody RGR = 100(W₂ − W₁)/[(W₁ + W₂)/2] |
| Body weight statistics & flock uniformity | `bw_stats` | Uniformity = % of birds within ±band% of the mean;  CV = 100·SD/mean |
| Milk yield corrections (FCM, ECM) | `milk` | 4% FCM = 0.4·M + 15·F (Gaines);   ECM = 0.327·M + 12.95·F + 7.65·P (Tyrrell & Reid 1965); yields in kg |
| Adjusted weaning weight (205-day) | `adj_weaning` | Adjusted WW = (WW − BW)/age × standard age + BW (+ age-of-dam factor) |
| Gestation & incubation calendar | `gestation` | Expected date = service date + mean gestation (or incubation) length |

## Statistics

| Tool | id | Formula / method |
|---|---|---|
| Descriptive statistics | `descriptive` | s² = Σ(x − x̄)²/(n − 1);  SE = s/√n;  quantiles: type 7 (R default) |
| Sample size helper | `sample_size` | two means: n = 2(z₁₋α/₂ + z₁₋β)²σ²/δ²;  mean: n = (zσ/E)²;  proportion: n = z²p(1−p)/E² |
| Probability calculator | `probability` | Binomial: C(n,k)pᵏ(1−p)ⁿ⁻ᵏ;  Poisson: e^−λ λᵏ/k! |
| Distribution calculator (Z, t, χ², F) | `distribution` | Computed with the regularized incomplete gamma / beta functions (Numerical Recipes). |
| Data transformation helper | `transform` | Choose the transformation that stabilizes variance / normalizes residuals; back-transform means for reporting. |
| Experimental design helper & randomization | `design` | Fixed-effects ANOVA degrees of freedom; randomization with a seeded generator (reproducible). |
| One-way ANOVA | `anova1` | F = MSB / MSW with (k−1, N−k) df |
| Simple linear regression | `regression` | b = Sxy/Sxx;  a = ȳ − b·x̄;  SE(b) = √(MSE/Sxx) |
| Correlation (Pearson & Spearman) | `correlation` | r = Sxy/√(Sxx Syy);  t = r√[(n−2)/(1−r²)];  ρ = Pearson r on ranks |
| t-test (two-sample / paired) | `ttest` | Welch: t = (x̄₁ − x̄₂)/√(s₁²/n₁ + s₂²/n₂), Welch–Satterthwaite df;   Student: pooled s²;   paired: t = d̄ / (s_d/√n) |
| χ² test (contingency / goodness of fit) | `chisq` | χ² = Σ (O − E)² / E;   independence: E = row total × column total / N, df = (r − 1)(c − 1) |
| Confidence interval for a proportion | `ci_prop` | Wilson: [p̂ + z²/2n ± z·√(p̂(1−p̂)/n + z²/4n²)] / (1 + z²/n) |

## Utilities

| Tool | id | Formula / method |
|---|---|---|
| Unit converter | `units` | Exact SI factors (lb = 0.45359237 kg; in = 25.4 mm; US gal = 3.785411784 L; kcal = 4.184 kJ). |
| Date converter (Gregorian ↔ Jalali) & date difference | `date_convert` | Conversion uses the ICU Persian (Solar Hijri) calendar built into Chromium / Node; differences are counted in whole days. |
| Dilution (C₁V₁ = C₂V₂) | `dilution` | C₁·V₁ = C₂·V₂  — use consistent units |
| Scientific calculator | `expr` | Expressions, variables, functions (sqrt, ln, log, fact, mean …) |
| CSV viewer & data preview | `csv` | Table preview with per-column descriptive statistics |

## Reference

| Tool | id | Formula / method |
|---|---|---|
| Genetics glossary | `ref_glossary` | Searchable glossary |
| Formula reference | `ref_formulas` | Core quantitative-genetics formulas |
| ANOVA reference guide | `ref_anova` | Designs, df tables, assumptions, SAS/R snippets |
| Statistical reference | `ref_stats` | Choosing a test |

## REML in the BLUP workspace

- **Profile method (default):** maximizes the REML log-likelihood over λ = σ²e/σ²a with σ²e profiled out. Each step uses one Cholesky factorization of the mixed-model equations (no inverse); a 25-point grid brackets the maximum and golden-section search refines it. Standard errors come from the numerical Hessian of −2 log L in (σ²a, σ²e), with the delta method for h².
- **EM method:** Henderson's EM-REML (Mrode 2014, ch. 11). It runs in resumable chunks with live progress and a Stop button.
- **Verification:** on a simulated pedigree (160 animals, 140 records) both methods match an independent NumPy maximization of the REML likelihood built from V = ZAZ′σ²a + Iσ²e to 4 decimals. Likelihood differences agree to 1e-6 and the SEs agree.
- **Boundary:** estimates at h² ≈ 0 or 1 are flagged. Mrode Example 3.1 has too few records for variance estimation and is flagged this way.
