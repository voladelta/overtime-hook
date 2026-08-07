# Capability checklist

Catalog digest: `a7875ce817fafd7ca4e0655e2937fa5a49b602283aa846e804732d18e6c1478e`
Selection digest: `7fdc4dec40607828fd11ffe8b4d8d885d1bf98d14ae2af3ec233e6802fc4a3f2`

## Known accelerators

### Custom Uniswap v4 hook

Start a canonical v4 pool whose custom hook owns the required pool behavior and fee integration.

Review route: `custom-review`

- [ ] Capability: canonical-v4-pool
- [ ] Capability: custom-hook-behavior

### Custom hook behavior

Document and test custom PoolManager callbacks without assuming any specific product category.

Review route: `custom-review`

- [ ] Capability: custom-hook-behavior

### Hook-owned project fee

Add a disclosed project share inside the same effective total fee as the Programmable share.

Review route: `custom-review`

- [ ] Capability: claimable-project-fee
- [ ] Capability: quote-side-volume-accounting

### Launch distribution, vesting and LP custody

Plan initial allocations, vesting claims and liquidity-position custody as one conserved launch value flow.

Review route: `architecture-review-required`

- [ ] Capability: launch-distribution
- [ ] Capability: liquidity-position-custody
- [ ] Capability: vesting-schedules

### Metadata, tags and disclosures

Bind public names, media, economics, affiliations and provider-specific evidence without hidden tags.

Review route: `standard-review`

- [ ] Capability: provider-disclosures
- [ ] Capability: public-metadata

### Mandatory Programmable volume fee

Specify the non-additive 0.1 percent Programmable share on executed canonical-pool volume.

Review route: `custom-review`

- [ ] Capability: claimable-platform-fee
- [ ] Capability: quote-side-volume-accounting

### Tests, evidence and threat model

Create project-specific security properties, test obligations and attributable evidence from the start.

Review route: `standard-review`

- [ ] Capability: evidence-plan
- [ ] Capability: security-properties

## Owner-defined capabilities

### Authenticated challenge router (`authenticated-challenge-router`)

Catalog status: `unlisted`. Automatic decision: `none`. Route: `architecture-review-required`.

- [ ] Actors and assets
- [ ] Authority and trust boundary
- [ ] Value flow and conservation
- [ ] Failure, recovery and user exit
- [ ] Source, tests and attributable evidence

### Recurring crown-time game (`recurring-crown-time-game`)

Catalog status: `unlisted`. Automatic decision: `none`. Route: `architecture-review-required`.

- [ ] Actors and assets
- [ ] Authority and trust boundary
- [ ] Value flow and conservation
- [ ] Failure, recovery and user exit
- [ ] Source, tests and attributable evidence


An unlisted capability remains part of the project. It is never unsafe or rejected solely because this catalog lacks a label.

