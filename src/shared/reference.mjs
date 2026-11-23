// Reference content: genetics glossary, formula reference, statistical/ANOVA guide and research templates.

export const GLOSSARY = [
  ['Additive genetic variance (σ²A)', 'Variance of breeding values; the part of genetic variance transmitted predictably from parent to offspring.'],
  ['Allele', 'One of the alternative forms of a gene at a locus.'],
  ['Allele frequency', 'Proportion of all copies of a gene in a population that are a given allele.'],
  ['Animal model', 'Mixed linear model in which each animal has its own additive genetic effect, linked through the relationship matrix A.'],
  ['BLUP', 'Best Linear Unbiased Prediction: predicts random effects (breeding values) while estimating fixed effects (Henderson).'],
  ['Breeding value', 'Value of an individual as a parent: twice the expected deviation of its progeny from the population mean.'],
  ['Coancestry (kinship)', 'Probability that two alleles taken at random, one from each individual, are identical by descent. f_XY = a_XY/2.'],
  ['Contemporary group', 'Animals of similar age managed together and recorded under the same conditions; used as a fixed effect.'],
  ['Correlated response', 'Change in a trait caused by selection on a different, genetically correlated trait.'],
  ['Dominance', 'Interaction between alleles at the same locus; not transmitted from parent to offspring as a fixed value.'],
  ['EBV', 'Estimated breeding value, typically from BLUP.'],
  ['Effective population size (Ne)', 'Size of an idealized population with the same rate of inbreeding or genetic drift as the real one.'],
  ['Epistasis', 'Interaction between alleles at different loci.'],
  ['Fixed effect', 'An effect whose levels are of direct interest and assumed to have no distribution (herd-year-season, sex, parity).'],
  ['Generation interval', 'Average age of parents when their offspring (that become parents) are born.'],
  ['Genetic correlation (rG)', 'Correlation between breeding values for two traits; arises from pleiotropy or linkage.'],
  ['Genetic drift', 'Random change in allele frequencies from sampling in finite populations.'],
  ['Genomic selection', 'Selection using genome-wide marker effects (GBLUP, ssGBLUP, Bayesian methods).'],
  ['GBLUP', 'BLUP where the pedigree relationship matrix is replaced by a genomic relationship matrix G (VanRaden).'],
  ['G×E interaction', 'Change in the ranking or difference between genotypes across environments.'],
  ['Hardy–Weinberg equilibrium', 'Genotype frequencies p², 2pq, q² expected under random mating without evolutionary forces.'],
  ['Heritability (h²)', 'Narrow sense: σ²A/σ²P, the regression of breeding value on phenotype.'],
  ['Heterosis', 'Superiority of crossbred offspring over the average of their parental breeds.'],
  ['Heterozygosity', 'Proportion of individuals heterozygous at a locus (Ho), or the expected proportion under HWE (He).'],
  ['Identical by descent (IBD)', 'Two alleles that are copies of the same ancestral allele.'],
  ['Inbreeding coefficient (F)', 'Probability that the two alleles at a locus in an individual are IBD.'],
  ['Inbreeding depression', 'Reduction in mean performance (often fitness traits) with increasing inbreeding.'],
  ['Linkage disequilibrium', 'Non-random association of alleles at different loci.'],
  ['MME', 'Mixed model equations of Henderson, solved to obtain BLUE of fixed and BLUP of random effects.'],
  ['Permanent environment', 'Non-genetic effects that persist across repeated records of the same animal.'],
  ['PIC', 'Polymorphism information content: informativeness of a marker for linkage analysis.'],
  ['Progeny test', 'Evaluation of a parent from the performance of its offspring.'],
  ['QTL', 'Quantitative trait locus: genomic region associated with variation in a quantitative trait.'],
  ['Relationship matrix (A)', 'Numerator relationship matrix; a_ij = twice the coancestry, a_ii = 1 + F_i.'],
  ['Reliability', 'Squared accuracy r² of an EBV: proportion of genetic variance explained.'],
  ['REML', 'Restricted maximum likelihood: standard method to estimate variance components in mixed models.'],
  ['Repeatability', 'Correlation between repeated records of the same individual: (σ²G + σ²PE)/σ²P.'],
  ['Response to selection', 'Change in population mean caused by selection: R = h²S.'],
  ['Selection differential', 'Difference between the mean of selected parents and the population mean.'],
  ['Selection index', 'Linear combination of information sources weighted to maximize correlation with the aggregate genotype.'],
  ['Selection intensity', 'Standardized selection differential i = S/σP.'],
  ['SNP', 'Single nucleotide polymorphism; the most common genetic marker type.'],
  ['Truncation selection', 'Selecting all individuals above a threshold value.'],
];

export const FORMULAS = [
  ['Phenotypic model', 'P = G + E = A + D + I + E'],
  ['Narrow-sense heritability', 'h² = σ²A / σ²P'],
  ['Repeatability', 't = (σ²A + σ²PE) / σ²P'],
  ['Breeder’s equation', 'R = h²S = i·h²·σP = i·r·σA'],
  ['Annual genetic gain', 'ΔG/yr = i·r·σA / L'],
  ['Four-path gain', 'ΔG = Σ(i·r)·σA / ΣL'],
  ['Correlated response', 'CRy = i·hx·hy·rG·σPy'],
  ['Selection intensity', 'i = φ(x)/p,  x = Φ⁻¹(1 − p)'],
  ['Own-performance EBV', 'EBV = n·h² / [1 + (n−1)t] · (P̄ − μ)'],
  ['Progeny EBV', 'EBV = 2n/(n + k) · (P̄prog − μ),  k = (4 − h²)/h²'],
  ['Selection index', 'b = P⁻¹·G·a;  σI = √(b′Pb);  r_IH = σI / σH'],
  ['Hardy–Weinberg', 'p² + 2pq + q² = 1'],
  ['Inbreeding (path)', 'F = Σ(½)^(n1+n2+1)(1 + FA)'],
  ['Relationship', 'a_XY = Σ(½)^n(1 + FA)'],
  ['Effective size (sexes)', 'Ne = 4NmNf / (Nm + Nf)'],
  ['Rate of inbreeding', 'ΔF = 1/(2Ne);  F_t = 1 − (1 − ΔF)^t'],
  ['Animal model', 'y = Xb + Za + e;  Var(a) = Aσ²a;  Var(e) = Iσ²e'],
  ['MME', '[X′X  X′Z; Z′X  Z′Z + A⁻¹λ][b; â] = [X′y; Z′y],  λ = σ²e/σ²a = (1 − h²)/h²'],
  ['Reliability from MME', 'r² = 1 − PEV/σ²a = 1 − C^{aa}_ii·λ'],
  ['Haugh unit', 'HU = 100·log₁₀(H − 1.7W^0.37 + 7.57)'],
  ['FCR', 'feed intake / weight gain'],
];

export const ANOVA_GUIDE = `# ANOVA reference

## One-way (CRD)
| Source | df | SS | MS | F |
|---|---|---|---|---|
| Treatment | t − 1 | SSt | SSt/(t−1) | MSt/MSE |
| Error | N − t | SSE | SSE/(N−t) | |
| Total | N − 1 | SST | | |

Model: $y_{ij} = \\mu + \\tau_i + e_{ij}$

## RCBD
| Source | df |
|---|---|
| Block | r − 1 |
| Treatment | t − 1 |
| Error | (r − 1)(t − 1) |

## Two-factor factorial
| Source | df |
|---|---|
| A | a − 1 |
| B | b − 1 |
| A×B | (a − 1)(b − 1) |
| Error | ab(r − 1) |

## Assumptions
- Independence of errors (randomization)
- Normality of residuals (Shapiro–Wilk, Q–Q plot)
- Homogeneity of variance (Levene / Bartlett)
- Additivity of block and treatment effects (RCBD)

## Variance components from a one-way random model (half-sib families)
- $\\sigma^2_s = (MS_b - MS_w)/k$, $\\sigma^2_w = MS_w$
- $h^2 = 4\\sigma^2_s / (\\sigma^2_s + \\sigma^2_w)$
- With unequal family sizes use $k_0 = [N - \\Sigma n_i^2 / N]/(s - 1)$

## Post-hoc and software
- SAS: \`PROC GLM; CLASS trt; MODEL y = trt; MEANS trt / TUKEY;\`
- R: \`aov(y ~ trt)\`, \`TukeyHSD()\`; mixed models with \`lme4::lmer\`; REML animal models with \`sommer\` or BLUPF90 (AIREMLF90).
`;

export const STATS_GUIDE = `# Statistical reference

| Goal | Parametric | Non-parametric |
|---|---|---|
| Compare 2 independent groups | t-test | Mann–Whitney U |
| Compare 2 paired groups | paired t-test | Wilcoxon signed-rank |
| Compare ≥3 groups | ANOVA | Kruskal–Wallis |
| Association of 2 continuous | Pearson r | Spearman ρ |
| Association of categories | χ² test | Fisher exact |
| Genotype frequencies | HWE χ² | HWE exact test |

- Report effect sizes and confidence intervals, not only P values.
- Mixed models: random effects for repeated measures, sires, herds.
- Count data: Poisson / negative binomial GLM; proportions: binomial GLM (logit).
`;

export const PAPER_REVIEW_TEMPLATE = `# Paper review

**Citation:**
**DOI:**

## Research question

## Population / data
- Species / breed:
- Number of animals / records:
- Pedigree depth / genotypes:

## Model & methods
- Model (fixed + random effects):
- Software:
- Variance component estimation:

## Key results
| Parameter | Estimate | SE |
|---|---|---|
| h² | | |

## Strengths

## Limitations

## Relevance to my thesis

## Quotes / figures to cite
`;

export const EXPERIMENT_TEMPLATE = `# Experimental design notes

## Objective

## Experimental unit

## Treatments / factors

## Design (CRD / RCBD / factorial / Latin square)

## Replication & power
- Expected SD:
- Detectable difference:
- n per group:

## Randomization (seed):

## Measurements & schedule

## Statistical model
$y_{ij} = \\mu + \\tau_i + \\beta_j + e_{ij}$

## Analysis plan (software, procedures)
`;

export const LIT_MATRIX_COLUMNS = ['Study', 'Year', 'Species / breed', 'N', 'Trait(s)', 'Model', 'h² / key result', 'Notes'];

export const SNIPPETS = [
  { title: 'R — animal model with sommer', language: 'r', content: 'library(sommer)\nA <- A.mat(...)  # or from pedigree: getA()\nfit <- mmer(y ~ sex + cg, random = ~ vsr(id, Gu = A), rcov = ~ units, data = dat)\nsummary(fit)$varcomp' },
  { title: 'SAS — PROC MIXED sire model', language: 'sas', content: 'proc mixed data=d method=reml covtest;\n  class sire hys sex;\n  model y = hys sex / solution;\n  random sire;\nrun;' },
  { title: 'BLUPF90 parameter file (animal model)', language: 'text', content: 'DATAFILE\n data.txt\nTRAITS\n 3\nFIELDS_PASSED TO OUTPUT\n\nWEIGHT(S)\n\nRESIDUAL_VARIANCE\n 40\nEFFECT\n 2 cross alpha\nEFFECT\n 1 cross alpha\nRANDOM\n animal\nFILE\n ped.txt\nFILE_POS\n 1 2 3 0 0\n(CO)VARIANCES\n 20\nOPTION solv_method FSPAK' },
  { title: 'PLINK — QC pipeline', language: 'sh', content: 'plink --bfile data --chr-set 29 --geno 0.1 --mind 0.1 --maf 0.01 --hwe 1e-6 --make-bed --out data_qc' },
  { title: 'Python — HWE check with pandas', language: 'python', content: 'import pandas as pd\ng = pd.read_csv("geno.csv")\ncounts = g["snp1"].value_counts()\nprint(counts)' },
];
