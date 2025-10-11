# Resolution Strategy Demo

This file demonstrates the new `resolution-strategy` input.

## Default behavior (highest strategy)
```yaml
- name: Install highest compatible uv version
  uses: astral-sh/setup-uv@v6
  with:
    version: ">=0.4.0"
    # resolution-strategy: "highest" is the default
```

## Lowest strategy for testing compatibility
```yaml
- name: Install lowest compatible uv version  
  uses: astral-sh/setup-uv@v6
  with:
    version: ">=0.4.0"
    resolution-strategy: "lowest"
```

## Use case: Testing with matrix of strategies
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        resolution-strategy: ["highest", "lowest"]
    steps:
      - uses: actions/checkout@v5
      - name: Install uv with ${{ matrix.resolution-strategy }} strategy
        uses: astral-sh/setup-uv@v6
        with:
          version: ">=0.4.0" 
          resolution-strategy: ${{ matrix.resolution-strategy }}
          cache-suffix: ${{ matrix.resolution-strategy }}
      - name: Test with strategy
        run: |
          echo "Testing with $(uv --version)"
          uv run --frozen pytest
```